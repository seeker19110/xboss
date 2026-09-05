import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageDelete } from "@/lib/nen/storage";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, canViewSubcontractor, CAN } from "@/lib/bao-mat/auth";

export const dynamic = "force-dynamic";

type SubconDocRow = {
  id: number;
  supplier_id: number;
  file_name: string;
  mime_type: string;
  original_name: string | null;
  uploaded_by: number | null;
};

// GET /api/subcon-documents/:id — stream file hồ sơ năng lực NTP. Xem: mọi vai trò
// đăng nhập; subcon chỉ xem đúng NTP của mình.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Cách ly tổ chức (vá W7, Đợt 5) — subcon_documents không có cột org_id riêng, tổ chức
  // suy qua suppliers.org_id; JOIN lọc ngay ở câu SELECT để tài liệu tổ chức khác coi như
  // không tồn tại (404) thay vì lộ qua canViewSubcontractor (vốn không so org).
  const doc = await queryOne<SubconDocRow>(
    `SELECT d.id, d.supplier_id, d.file_name, d.mime_type, d.original_name, d.uploaded_by
       FROM subcon_documents d
       JOIN suppliers s ON s.id = d.supplier_id
      WHERE d.id = ? AND s.org_id = ?`,
    id,
    user.orgId,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  if (!(await canViewSubcontractor(user, doc.supplier_id)))
    return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });

  const buf = await storageGet(user.orgId, doc.file_name);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime_type,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name ?? doc.file_name)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/subcon-documents/:id — xoá hồ sơ năng lực. Người upload hoặc Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Cách ly tổ chức (vá W7, Đợt 5) — cùng lý do GET ở trên; trước đây không lọc org chút
  // nào (kể cả không có canViewSubcontractor) nên Admin/PM tổ chức A xoá được tài liệu NTP
  // tổ chức B qua đoán id.
  const doc = await queryOne<SubconDocRow>(
    `SELECT d.id, d.supplier_id, d.file_name, d.mime_type, d.original_name, d.uploaded_by
       FROM subcon_documents d
       JOIN suppliers s ON s.id = d.supplier_id
      WHERE d.id = ? AND s.org_id = ?`,
    id,
    user.orgId,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !CAN.manageSuppliers(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM subcon_documents WHERE id = ?`, id);
  await storageDelete(user.orgId, doc.file_name);

  return NextResponse.json({ deleted: id });
}
