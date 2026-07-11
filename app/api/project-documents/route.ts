import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newProjectDocFileName,
  MAX_DOC_BYTES,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/project-documents — danh sách file tự do cấp dự án (mọi user đăng nhập),
// scoped theo dự án đang chọn (M22).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const documents =
    projectId != null
      ? await query(
          `SELECT pd.id, pd.title, pd.category, pd.original_name AS "originalName",
                  pd.mime_type AS "mimeType", pd.size_bytes AS "sizeBytes",
                  pd.created_at AS "createdAt", pd.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
             FROM project_documents pd LEFT JOIN users u ON u.id = pd.uploaded_by
            WHERE pd.project_id = ?
            ORDER BY pd.id DESC`,
          projectId,
        )
      : [];
  return NextResponse.json({ documents });
}

// POST /api/project-documents — upload file tự do cấp dự án (multipart: file, title,
// category?). PDF hoặc ảnh, max 20MB. Chỉ Admin/PM (CAN.editStructure). Gán
// project_id = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tải lên hồ sơ dự án (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tải lên hồ sơ" }, { status: 422 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const title = String(form?.get("title") ?? "").trim();
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Thiếu tiêu đề hồ sơ" }, { status: 422 });

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

  const category = String(form.get("category") ?? "").trim() || null;
  const fileName = newProjectDocFileName(file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO project_documents (title, category, file_name, original_name, mime_type, size_bytes, uploaded_by, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    title,
    category,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
    projectId,
  );

  return NextResponse.json({ id, title, category, sizeBytes: file.size }, { status: 201 });
}
