import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  updateAnnotationStatus,
  linkAnnotationToEntity,
} from "@/lib/ky-thuat/engineering-spatial-pinning";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { run, withProjectScope } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/engineering/spatial/annotations/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền cập nhật điểm ghim không gian" },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "ID điểm ghim không hợp lệ" }, { status: 400 });
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

    // Hai hàm lib ĐÃ tự tính sẵn boolean "có đụng được dòng nào không" (chúng lọc `project_id`
    // trong WHERE và trả false khi không khớp) — trước đây route bỏ qua giá trị đó và luôn trả
    // `success: true`, nên PATCH một điểm ghim không tồn tại (hoặc đã xoá) vẫn báo thành công.
    let daDung = false;
    if (body.status) {
      daDung = await updateAnnotationStatus(projectId, id, body.status, body.resolutionNote);
    }

    if (body.entityRefType && body.entityRefId) {
      daDung = (await linkAnnotationToEntity(projectId, id, body.entityRefType, body.entityRefId))
        ? true
        : daDung;
    }

    if (!daDung) {
      return NextResponse.json({ error: "Không tìm thấy điểm ghim" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      id,
      updated: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/engineering/spatial/annotations/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xoá điểm ghim không gian" }, { status: 403 });
  }

  const { id } = await params;
  // Xoá là thao tác GHI: không tin projectId client gửi qua query, đối chiếu dự án user được thấy.
  const { searchParams } = new URL(req.url);
  const chotDuAn = await chotProjectIdChoGhi(
    user,
    searchParams.get("projectId"),
    (await getCurrentProjectId(user)) || 1,
  );
  if (!chotDuAn.ok) {
    return NextResponse.json({ error: "Không có quyền thao tác trên dự án này" }, { status: 403 });
  }
  const projectId = chotDuAn.projectId;

  try {
    // BUG THẬT: thiếu { readOnly: false } — withProjectScope mặc định readOnly=true nên mọi
    // lời gọi DELETE luôn ném "cannot execute DELETE in a read-only transaction" (500), xoá
    // điểm ghim chưa từng chạy được. PATCH cùng file đã đúng vì updateAnnotationStatus/
    // linkAnnotationToEntity (lib/ky-thuat/engineering-spatial-pinning.ts) tự truyền cờ này.
    // `run` (không phải `query`) để đọc được số dòng thật sự bị xoá: trước đây route luôn trả
    // `deleted: true` kể cả khi id không tồn tại — client không phân biệt được "đã xoá" với
    // "chưa từng có". WHERE vẫn lọc `project_id` nên điểm ghim dự án khác không bao giờ bị đụng.
    const soDongXoa = await withProjectScope(
      projectId,
      async () => {
        const kq = await run(
          `DELETE FROM engineering_spatial_annotations WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        );
        return kq.changes;
      },
      { readOnly: false },
    );

    if (!soDongXoa) {
      return NextResponse.json({ error: "Không tìm thấy điểm ghim" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      id,
      deleted: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
