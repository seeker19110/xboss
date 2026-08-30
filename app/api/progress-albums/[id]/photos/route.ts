import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { newAlbumPhotoFileName, MAX_PHOTO_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { listAlbumPhotos } from "@/lib/ky-thuat/tech";

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

  const up = await parseUploadedFile(req, { accept: "image", maxBytes: MAX_PHOTO_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newAlbumPhotoFileName(albumId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

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
