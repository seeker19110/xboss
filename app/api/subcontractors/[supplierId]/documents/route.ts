import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canViewSubcontractor, CAN } from "@/lib/auth";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newSubconDocFileName,
  MAX_DOC_BYTES,
} from "@/lib/photos";
import { listSubconDocuments } from "@/lib/subcontractors";

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

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

  const title = String(form.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tên hồ sơ" }, { status: 422 });

  const ext = extForDocMime(file.type);
  if (!ext)
    return NextResponse.json(
      {
        error: `Chỉ nhận PDF hoặc ảnh (jpg/png/webp/gif/heic), nhận được: ${file.type || "không rõ"}`,
      },
      { status: 415 },
    );
  if (file.size > MAX_DOC_BYTES)
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const fileBuf = Buffer.from(await file.arrayBuffer());
  if (!verifyFileMime(fileBuf, file.type))
    return NextResponse.json(
      { error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)" },
      { status: 415 },
    );

  const docKind = String(form.get("docKind") ?? "").trim() || null;
  const fileName = newSubconDocFileName(supplierId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

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
