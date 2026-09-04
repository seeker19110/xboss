import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageDelete } from "@/lib/nen/storage";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getVariation } from "@/lib/tai-chinh/vo";
import { sha256Hex } from "@/lib/nen/photos";

export const dynamic = "force-dynamic";

type VoDocRow = {
  id: number;
  vo_id: number;
  file_name: string;
  mime_type: string;
  original_name: string | null;
  uploaded_by: number | null;
  sha256: string | null;
};

// GET /api/vo-documents/:id — stream file đính kèm phát sinh/VO. Kiểm VO cha thuộc
// đúng dự án đang chọn (M22) — LỖ HỔNG THẬT đã vá cùng đợt này: trước đây route chỉ
// tra `WHERE id = ?` không hề so dự án, nên bất kỳ vai trò có viewVariations ở dự án
// A biết id là tải/xoá được file VO của dự án B (cùng lớp lỗi đã vá ở /api/documents/:id).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewVariations(user.role))
    return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const doc = await queryOne<VoDocRow>(
    `SELECT id, vo_id, file_name, mime_type, original_name, uploaded_by, sha256 FROM vo_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const projectId = await getCurrentProjectId(user);
  const vo =
    projectId != null
      ? await withProjectScope(projectId, () => getVariation(doc.vo_id, projectId))
      : undefined;
  if (!vo) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const buf = await storageGet(user.orgId, doc.file_name);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

  if (doc.sha256 && sha256Hex(buf) !== doc.sha256) {
    return NextResponse.json(
      { error: "File trên đĩa không khớp hash lưu trong DB — có thể đã bị tráo/hỏng." },
      { status: 409 },
    );
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime_type,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name ?? doc.file_name)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/vo-documents/:id — xoá file đính kèm. Người upload hoặc Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const doc = await queryOne<VoDocRow>(
    `SELECT id, vo_id, file_name, mime_type, original_name, uploaded_by FROM vo_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const projectId = await getCurrentProjectId(user);
  const vo = projectId != null ? await getVariation(doc.vo_id, projectId) : undefined;
  if (!vo) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !isAdminOrPm(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM vo_documents WHERE id = ?`, id);
  await storageDelete(user.orgId, doc.file_name);

  return NextResponse.json({ deleted: id });
}
