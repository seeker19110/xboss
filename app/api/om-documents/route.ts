import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listOmDocs } from "@/lib/warranty";
import { ensureUploadDir, extForDocMime, newOmDocFileName, MAX_DOC_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/om-documents — thư viện tài liệu hướng dẫn O&M, scoped theo dự án đang chọn
// (M22). Xem: mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const items = projectId != null ? await listOmDocs(projectId) : [];
  return NextResponse.json({ items });
}

// POST /api/om-documents — upload tài liệu hướng dẫn O&M (multipart: file, title,
// disciplineId?). PDF hoặc ảnh, max 20MB (pattern task_documents). manageWarranty:
// Admin/PM/kỹ sư. Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload tài liệu O&M (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để upload tài liệu" }, { status: 422 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

  const title = String(form.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tên tài liệu" }, { status: 422 });

  const disciplineIdRaw = String(form.get("disciplineId") ?? "").trim();
  const disciplineId = disciplineIdRaw ? Number(disciplineIdRaw) : null;
  if (disciplineId != null) {
    if (!(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, disciplineId)))
      return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }

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

  const fileName = newOmDocFileName(projectId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO om_documents (project_id, title, discipline_id, file_name, original_name,
       mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    title,
    disciplineId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
