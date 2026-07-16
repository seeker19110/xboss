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
  newCorrespondenceFileName,
  MAX_DOC_BYTES,
  isContentTooLarge,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/correspondences/:id/files — danh sách file scan đính kèm.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewCorrespondence(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem công văn" }, { status: 403 });

  const correspondenceId = parseInt(params.id);
  if (isNaN(correspondenceId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const correspondence =
    projectId != null
      ? await queryOne(
          `SELECT id FROM correspondences WHERE id = ? AND project_id = ?`,
          correspondenceId,
          projectId,
        )
      : undefined;
  if (!correspondence)
    return NextResponse.json({ error: "Không tìm thấy văn bản" }, { status: 404 });

  const files = await query(
    `SELECT f.id, f.original_name AS "originalName", f.mime_type AS "mimeType",
            f.size_bytes AS "sizeBytes", f.created_at AS "createdAt",
            f.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM correspondence_files f LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.correspondence_id = ? ORDER BY f.id DESC`,
    correspondenceId,
  );
  return NextResponse.json({ files });
}

// POST /api/correspondences/:id/files — upload file scan (multipart: file).
// PDF hoặc ảnh, max 20MB. Admin/PM/kỹ sư — mobile chụp scan văn bản giấy tại công trường.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCorrespondence(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload file công văn (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const correspondenceId = parseInt(params.id);
  if (isNaN(correspondenceId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const correspondence =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM correspondences WHERE id = ? AND project_id = ?`,
          correspondenceId,
          projectId,
        )
      : undefined;
  if (!correspondence)
    return NextResponse.json({ error: "Không tìm thấy văn bản" }, { status: 404 });

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

  const fileName = newCorrespondenceFileName(correspondenceId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO correspondence_files (correspondence_id, file_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    correspondenceId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
  );

  return NextResponse.json({ id, correspondenceId, sizeBytes: file.size }, { status: 201 });
}
