import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForMime,
  verifyFileMime,
  newAlbumPhotoFileName,
  MAX_PHOTO_BYTES,
} from "@/lib/photos";
import { listAlbumPhotos } from "@/lib/tech";

export const dynamic = "force-dynamic";

// GET /api/progress-albums/:id/photos → danh sách ảnh trong album (xem GET
// /api/progress-albums/:id để có cả metadata album, endpoint này tiện cho refresh
// riêng gallery sau khi upload/xoá ảnh).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const albumId = parseInt(params.id);
  if (isNaN(albumId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const album =
    projectId != null
      ? await queryOne(
          `SELECT id FROM progress_albums WHERE id = ? AND project_id = ?`,
          albumId,
          projectId,
        )
      : undefined;
  if (!album) return NextResponse.json({ error: "Không tìm thấy album" }, { status: 404 });

  const photos = await listAlbumPhotos(albumId);
  return NextResponse.json({ photos });
}

// POST /api/progress-albums/:id/photos → upload ảnh vào album (multipart: file, caption?).
// Admin/PM (đồng bộ quyền quản lý album — CAN.manageTech), tái dùng logic upload của
// lib/photos.ts (task_photos, album_id set, task_id NULL).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền thêm ảnh album (chỉ Admin/PM)" },
      { status: 403 },
    );

  const albumId = parseInt(params.id);
  if (isNaN(albumId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const album =
    projectId != null
      ? await queryOne(
          `SELECT id FROM progress_albums WHERE id = ? AND project_id = ?`,
          albumId,
          projectId,
        )
      : undefined;
  if (!album) return NextResponse.json({ error: "Không tìm thấy album" }, { status: 404 });

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

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newAlbumPhotoFileName(albumId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO task_photos (task_id, album_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)`,
    albumId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    caption,
    user.id,
  );

  return NextResponse.json({ id, albumId, caption, sizeBytes: file.size }, { status: 201 });
}
