import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newVoDocFileName,
  MAX_DOC_BYTES,
  sha256Hex,
  isContentTooLarge,
} from "@/lib/photos";
import { canEditVo } from "@/lib/vo";

export const dynamic = "force-dynamic";

// GET /api/variations/:id/documents — danh sách file đính kèm VO (văn bản trình/
// phản hồi CĐT). Kiểm VO thuộc đúng dự án đang chọn (M22) — vo_documents không có
// cột project_id riêng.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewVariations(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem phát sinh/VO" }, { status: 403 });

  const voId = parseInt(params.id);
  if (isNaN(voId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const vo =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM variation_orders WHERE id = ? AND project_id = ?`,
          voId,
          projectId,
        )
      : undefined;
  if (!vo) return NextResponse.json({ error: "Không tìm thấy phát sinh" }, { status: 404 });

  const documents = await query(
    `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.caption, d.created_at AS "createdAt", d.sha256,
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM vo_documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.vo_id = ? ORDER BY d.id DESC`,
    voId,
  );
  return NextResponse.json({ documents });
}

// POST /api/variations/:id/documents — upload file (multipart: file, caption?).
// PDF hoặc ảnh, max 20MB. Quyền như PATCH VO (canEditVo).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const voId = parseInt(params.id);
  if (isNaN(voId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const vo =
    projectId != null
      ? await queryOne<{ status: string; createdBy: number | null }>(
          `SELECT status, created_by AS "createdBy" FROM variation_orders WHERE id = ? AND project_id = ?`,
          voId,
          projectId,
        )
      : undefined;
  if (!vo) return NextResponse.json({ error: "Không tìm thấy phát sinh" }, { status: 404 });
  const editErr = canEditVo(vo, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

  if (isContentTooLarge(req.headers.get("content-length"), MAX_DOC_BYTES))
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

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

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newVoDocFileName(voId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);
  const sha256 = sha256Hex(fileBuf);

  const id = await insertId(
    `INSERT INTO vo_documents (vo_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by, sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    voId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    caption,
    user.id,
    sha256,
  );

  return NextResponse.json({ id, voId, caption, sizeBytes: file.size }, { status: 201 });
}
