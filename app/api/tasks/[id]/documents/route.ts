import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/auth";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newDocFileName,
  MAX_DOC_BYTES,
} from "@/lib/photos";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/documents → danh sách biên bản/tài liệu đính kèm task
// (subcon chỉ xem được task được giao cho mình — cùng quy tắc với POST/comments).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem tài liệu của task được giao cho mình" },
      { status: 403 },
    );

  const documents = await query(
    `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.caption, d.doc_category AS "docCategory",
            d.created_at AS "createdAt",
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM task_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.task_id = ? ORDER BY d.id DESC`,
    taskId,
  );
  return NextResponse.json({ documents });
}

// POST /api/tasks/:id/documents → upload biên bản nghiệm thu (multipart: file, caption?).
// PDF hoặc ảnh, max 20MB. Mọi vai trò sửa tiến độ đều upload được; subcon chỉ task được giao.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền upload tài liệu" }, { status: 403 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, taskId);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json(
      { error: "Bạn chỉ được upload tài liệu cho task được giao cho mình" },
      { status: 403 },
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
  const docCategoryRaw = String(form.get("docCategory") ?? "").trim();
  if (docCategoryRaw && !DOC_CATEGORIES.includes(docCategoryRaw as DocCategory))
    return NextResponse.json({ error: "Loại hồ sơ không hợp lệ" }, { status: 422 });
  const docCategory = docCategoryRaw || null;
  const fileName = newDocFileName(taskId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, size_bytes, caption, doc_category, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    taskId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    caption,
    docCategory,
    user.id,
  );

  return NextResponse.json(
    { id, taskId, caption, docCategory, sizeBytes: file.size },
    { status: 201 },
  );
}
