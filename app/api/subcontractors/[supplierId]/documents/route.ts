import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canViewSubcontractor, CAN } from "@/lib/bao-mat/auth";
import { newSubconDocFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { listSubconDocuments } from "@/lib/hien-truong/subcontractors";

export const dynamic = "force-dynamic";

// GET /api/subcontractors/:supplierId/documents — danh sách hồ sơ năng lực đính kèm.
// Xem: mọi vai trò đăng nhập; subcon chỉ xem đúng NTP của mình.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  if (!(await canViewSubcontractor(user, supplierId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem hồ sơ nhà thầu phụ của mình" },
      { status: 403 },
    );

  const documents = await listSubconDocuments(supplierId);
  return NextResponse.json({ documents });
}

// POST /api/subcontractors/:supplierId/documents — upload hồ sơ năng lực (multipart:
// file, title, docKind?). PDF hoặc ảnh, max 20MB (pattern task_documents). Chỉ Admin/PM.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageSuppliers(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được upload hồ sơ nhà thầu phụ" },
      { status: 403 },
    );

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const supplier = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierId);
  if (!supplier)
    return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  const title = String(form.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tên hồ sơ" }, { status: 422 });

  const docKind = String(form.get("docKind") ?? "").trim() || null;
  const fileName = newSubconDocFileName(supplierId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

  const id = await insertId(
    `INSERT INTO subcon_documents (supplier_id, title, doc_kind, file_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    supplierId,
    title,
    docKind,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
  );

  return NextResponse.json(
    { id, supplierId, title, docKind, sizeBytes: file.size },
    { status: 201 },
  );
}
