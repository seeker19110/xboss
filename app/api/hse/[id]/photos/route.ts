import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForMime,
  verifyFileMime,
  newHseFileName,
  MAX_PHOTO_BYTES,
  isContentTooLarge,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/hse/:id/photos — ảnh đính kèm ghi nhận HSE.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const recordId = parseInt(params.id);
  if (isNaN(recordId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const record =
    projectId != null
      ? await queryOne(
          `SELECT id FROM hse_records WHERE id = ? AND project_id = ?`,
          recordId,
          projectId,
        )
      : undefined;
  if (!record) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });

  const photos = await query(
    `SELECT p.id, p.mime, p.created_at AS "createdAt", p.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM hse_photos p LEFT JOIN users u ON u.id = p.uploaded_by
      WHERE p.record_id = ? ORDER BY p.id DESC`,
    recordId,
  );
  return NextResponse.json({ photos });
}

// POST /api/hse/:id/photos — upload ảnh hiện trường (multipart: file). Mọi vai trò thao
// tác HSE được (kể cả subcon — càng ít ma sát báo cáo càng tốt, giống ghi nhận HSE).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role === "cdt" || user.role === "viewer" || user.role === "bch")
    return NextResponse.json({ error: "Bạn không có quyền upload ảnh HSE" }, { status: 403 });

  const recordId = parseInt(params.id);
  if (isNaN(recordId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const record =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM hse_records WHERE id = ? AND project_id = ?`,
          recordId,
          projectId,
        )
      : undefined;
  if (!record) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });

  if (isContentTooLarge(req.headers.get("content-length"), MAX_PHOTO_BYTES))
    return NextResponse.json(
      { error: `Ảnh quá lớn (tối đa ${MAX_PHOTO_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file ảnh (field 'file')" }, { status: 400 });

  const ext = extForMime(file.type);
  if (!ext)
    return NextResponse.json(
      { error: `Chỉ nhận file ảnh (jpg/png/webp/gif/heic), nhận được: ${file.type || "không rõ"}` },
      { status: 415 },
    );
  if (file.size > MAX_PHOTO_BYTES)
    return NextResponse.json(
      { error: `Ảnh quá lớn (tối đa ${MAX_PHOTO_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const fileBuf = Buffer.from(await file.arrayBuffer());
  if (!verifyFileMime(fileBuf, file.type))
    return NextResponse.json(
      { error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)" },
      { status: 415 },
    );

  const fileName = newHseFileName(recordId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO hse_photos (record_id, file_path, mime, uploaded_by) VALUES (?, ?, ?, ?)`,
    recordId,
    fileName,
    file.type,
    user.id,
  );

  return NextResponse.json({ id, recordId }, { status: 201 });
}
