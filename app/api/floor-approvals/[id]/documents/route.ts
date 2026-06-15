import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { ensureUploadDir, extForDocMime, newFloorDocFileName, MAX_DOC_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/floor-approvals/:id/documents → danh sách biên bản của tầng.
export async function GET(_req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const approvalId = parseInt(params.id);
  if (isNaN(approvalId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const documents = await query(
    `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.caption, d.link_url AS "linkUrl",
            d.created_at AS "createdAt", u.name AS "uploaderName"
       FROM task_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.floor_approval_id = ? ORDER BY d.id DESC`, approvalId);
  return NextResponse.json({ documents });
}

// POST /api/floor-approvals/:id/documents
//   — multipart (field "file"): upload PDF/ảnh, max 20MB
//   — JSON { url, caption? }: lưu link ngoài (Google Drive, v.v.)
export async function POST(req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền upload tài liệu" }, { status: 403 });

  const approvalId = parseInt(params.id);
  if (isNaN(approvalId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const approval = await queryOne<{ id: number }>(
    `SELECT id FROM floor_approvals WHERE id = ?`, approvalId);
  if (!approval) return NextResponse.json({ error: "Không tìm thấy bản ghi nghiệm thu" }, { status: 404 });

  const ct = req.headers.get("content-type") ?? "";

  // --- Lưu link ngoài ---
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const url = String(body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url))
      return NextResponse.json({ error: "URL không hợp lệ (phải bắt đầu bằng http/https)" }, { status: 400 });
    const caption = String(body?.caption ?? "").trim() || null;
    const id = await insertId(
      `INSERT INTO task_documents (floor_approval_id, link_url, original_name, caption, uploaded_by, file_name)
       VALUES (?, ?, ?, ?, ?, '')`,
      approvalId, url, caption ?? url, caption, user.id);
    return NextResponse.json({ id, approvalId, linkUrl: url }, { status: 201 });
  }

  // --- Upload file ---
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file') hoặc JSON { url }" }, { status: 400 });

  const ext = extForDocMime(file.type);
  if (!ext)
    return NextResponse.json({ error: `Chỉ nhận PDF hoặc ảnh, nhận được: ${file.type || "không rõ"}` }, { status: 415 });
  if (file.size > MAX_DOC_BYTES)
    return NextResponse.json({ error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` }, { status: 413 });

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newFloorDocFileName(approvalId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO task_documents (floor_approval_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    approvalId, fileName, file.name || null, file.type, file.size, caption, user.id);

  return NextResponse.json({ id, approvalId, caption, sizeBytes: file.size }, { status: 201 });
}
