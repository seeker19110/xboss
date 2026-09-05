import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { newPhotoFileName, MAX_PHOTO_BYTES, sha256Hex, parseUploadedFile } from "@/lib/nen/photos";
import { taskProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/photos → danh sách ảnh hiện trường của task (subcon chỉ
// xem được task được giao cho mình — cùng quy tắc với POST/comments).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask không so dự án, xem ghi chú ở
  // app/api/dimensions/[id]/route.ts.
  if (projectId == null || (await taskProjectId(taskId)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem ảnh của task được giao cho mình" },
      { status: 403 },
    );

  const photos = await query(
    `SELECT p.id, p.original_name AS "originalName", p.mime_type AS "mimeType",
            p.size_bytes AS "sizeBytes", p.caption, p.created_at AS "createdAt",
            p.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM task_photos p
       LEFT JOIN users u ON p.uploaded_by = u.id
      WHERE p.task_id = ? ORDER BY p.id DESC`,
    taskId,
  );
  return NextResponse.json({ photos });
}

// POST /api/tasks/:id/photos → upload ảnh (multipart: file, caption?).
// Mọi vai trò được cập nhật tiến độ đều được upload; subcon chỉ cho task được giao.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền upload ảnh" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, taskId);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask không so dự án.
  if (projectId == null || (await taskProjectId(taskId)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json(
      { error: "Bạn chỉ được upload ảnh cho task được giao cho mình" },
      { status: 403 },
    );

  const up = await parseUploadedFile(req, { accept: "image", maxBytes: MAX_PHOTO_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  // Chống trùng khi hàng đợi offline (offlineQueue) gửi lại cùng ảnh: cùng task +
  // cùng hash nội dung trong 24h gần nhất → trả về ảnh đã có, không ghi file/dòng mới.
  const hash = sha256Hex(fileBuf);
  const existing = await queryOne<{ id: number; caption: string | null; sizeBytes: number }>(
    `SELECT id, caption, size_bytes AS "sizeBytes"
       FROM task_photos
      WHERE task_id = ? AND sha256 = ? AND created_at > now() - interval '24 hours'
      ORDER BY id DESC LIMIT 1`,
    taskId,
    hash,
  );
  if (existing)
    return NextResponse.json(
      {
        id: existing.id,
        taskId,
        caption: existing.caption,
        sizeBytes: existing.sizeBytes,
        deduped: true,
      },
      { status: 200 },
    );

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newPhotoFileName(taskId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

  const id = await insertId(
    `INSERT INTO task_photos (task_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by, sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    taskId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    caption,
    user.id,
    hash,
  );

  return NextResponse.json({ id, taskId, caption, sizeBytes: file.size }, { status: 201 });
}
