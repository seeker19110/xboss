import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/auth";
import { ensureUploadDir, extForMime, newPhotoFileName, MAX_PHOTO_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/photos → danh sách ảnh hiện trường của task.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const photos = await query(
    `SELECT p.id, p.original_name AS "originalName", p.mime_type AS "mimeType",
            p.size_bytes AS "sizeBytes", p.caption, p.created_at AS "createdAt",
            p.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM task_photos p
       LEFT JOIN users u ON p.uploaded_by = u.id
      WHERE p.task_id = ? ORDER BY p.id DESC`, taskId);
  return NextResponse.json({ photos });
}

// POST /api/tasks/:id/photos → upload ảnh (multipart: file, caption?).
// Mọi vai trò được cập nhật tiến độ đều được upload; subcon chỉ cho task được giao.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền upload ảnh" }, { status: 403 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, taskId);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json({ error: "Bạn chỉ được upload ảnh cho task được giao cho mình" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file ảnh (field 'file')" }, { status: 400 });

  const ext = extForMime(file.type);
  if (!ext) return NextResponse.json({ error: `Chỉ nhận file ảnh (jpg/png/webp/gif/heic), nhận được: ${file.type || "không rõ"}` }, { status: 415 });
  if (file.size > MAX_PHOTO_BYTES)
    return NextResponse.json({ error: `Ảnh quá lớn (tối đa ${MAX_PHOTO_BYTES / 1024 / 1024}MB)` }, { status: 413 });

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newPhotoFileName(taskId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO task_photos (task_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    taskId, fileName, file.name || null, file.type, file.size, caption, user.id);

  return NextResponse.json({ id, taskId, caption, sizeBytes: file.size }, { status: 201 });
}
