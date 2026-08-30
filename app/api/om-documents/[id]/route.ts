import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageDelete } from "@/lib/nen/storage";
import { run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getOmDoc } from "@/lib/hien-truong/warranty";

export const dynamic = "force-dynamic";

// GET /api/om-documents/:id — tải/xem tài liệu hướng dẫn O&M. Xem: mọi vai trò đăng
// nhập. Scoped theo dự án đang chọn (M22).
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
  const doc = projectId != null ? await getOmDoc(id, projectId) : null;
  if (!doc || !doc.fileName)
    return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const buf = await storageGet(user.orgId, doc.fileName);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.originalName ?? doc.fileName)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/om-documents/:id — xoá tài liệu hướng dẫn O&M (manageWarranty: Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá tài liệu O&M (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getOmDoc(id, projectId) : null;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  await run(`DELETE FROM om_documents WHERE id = ?`, id);
  if (existing.fileName) {
    await storageDelete(user.orgId, existing.fileName);
  }

  return NextResponse.json({ deleted: id });
}
