import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/auth";
import { ensureUploadDir, extForDocMime, newDocFileName, MAX_DOC_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/documents → danh sách biên bản/tài liệu đính kèm task.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const documents = await query(
    `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.caption, d.created_at AS "createdAt",
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM task_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.task_id = ? ORDER BY d.id DESC`, taskId);
  return NextResponse.json({ documents });
}

// POST /api/tasks/:id/documents → upload biên bản nghiệm thu (multipart: file, caption?).
// PDF hoặc ảnh, max 20MB. Mọi vai trò sửa tiến độ đều upload được; subcon chỉ task được giao.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền upload tài liệu" }, { status: 403 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, taskId);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json({ error: "Bạn chỉ được upload tài liệu cho task được giao cho mình" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

  const ext = extForDocMime(file.type);
  if (!ext) return NextResponse.json({ error: `Chỉ nhận PDF hoặc ảnh (jpg/png/webp/gif/heic), nhận được: ${file.type || "không rõ"}` }, { status: 415 });
  if (file.size > MAX_DOC_BYTES)
    return NextResponse.json({ error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` }, { status: 413 });

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newDocFileName(taskId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    taskId, fileName, file.name || null, file.type, file.size, caption, user.id);

  return NextResponse.json({ id, taskId, caption, sizeBytes: file.size }, { status: 201 });
}
