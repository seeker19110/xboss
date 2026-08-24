import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  updateAnnotationStatus,
  linkAnnotationToEntity,
} from "@/lib/ky-thuat/engineering-spatial-pinning";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { query, withProjectScope } from "@/lib/db";

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
      return NextResponse.json({ error: "Không có quyền thao tác trên dự án này" }, { status: 403 });
    }
    const projectId = chotDuAn.projectId;

    if (body.status) {
      await updateAnnotationStatus(projectId, id, body.status, body.resolutionNote);
    }

    if (body.entityRefType && body.entityRefId) {
      await linkAnnotationToEntity(projectId, id, body.entityRefType, body.entityRefId);
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
    await withProjectScope(projectId, async () => {
      await query(
        `DELETE FROM engineering_spatial_annotations WHERE id = ? AND project_id = ?`,
        id,
        projectId,
      );
    });

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
