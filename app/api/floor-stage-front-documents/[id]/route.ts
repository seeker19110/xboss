import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageDelete } from "@/lib/nen/storage";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

type DocRow = { id: number; file_name: string; mime: string; uploaded_by: number | null };

// Tài liệu chỉ đọc/xoá được nếu ô mặt trận chứa nó thuộc dự án đang chọn. Trước đây cả hai
// handler chỉ tra `WHERE id = ?`: biết id tài liệu là tải được — và xoá được — biên bản bàn
// giao của dự án khác, kể cả khi người dùng không có quyền vào dự án đó. `floor_stage_front_documents`
// không có cột project_id nên phải JOIN ngược qua `floor_stage_fronts` (bảng có RLS 0149,
// nên bọc withProjectScope để phòng tuyến thứ hai cũng áp đúng phạm vi).
async function docTrongDuAn(id: number, projectId: number): Promise<DocRow | undefined> {
  return withProjectScope(projectId, () =>
    queryOne<DocRow>(
      `SELECT d.id, d.file_name, d.mime, d.uploaded_by
         FROM floor_stage_front_documents d
         JOIN floor_stage_fronts f ON f.id = d.floor_stage_front_id
        WHERE d.id = ? AND f.project_id = ?`,
      id,
      projectId,
    ),
  );
}

// GET /api/floor-stage-front-documents/:id — stream biên bản/ảnh mặt bằng bản mới.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  // Tài liệu của dự án khác → 404 (không phải 403), để không tiết lộ nó có tồn tại.
  const doc = await docTrongDuAn(id, projectId);
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const buf = await storageGet(user.orgId, doc.file_name);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/floor-stage-front-documents/:id — xoá biên bản/ảnh. Người upload hoặc Admin/PM/kỹ sư.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const doc = await docTrongDuAn(id, projectId);
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM/kỹ sư được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM floor_stage_front_documents WHERE id = ?`, id);
  await storageDelete(user.orgId, doc.file_name);

  return NextResponse.json({ deleted: id });
}
