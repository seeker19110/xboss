import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { newProjectDocFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { extractPdfText } from "@/lib/nen/pdf-extract";

export const dynamic = "force-dynamic";

// GET /api/project-documents — danh sách file tự do cấp dự án (mọi user đăng nhập),
// scoped theo dự án đang chọn (M22).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("documents", projectId);
  if (blocked) return blocked;

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
  const blocked = await assertModuleEnabled("documents", projectId);
  if (blocked) return blocked;

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, ext, buf: fileBuf } = up;

  const title = String(form?.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tiêu đề hồ sơ" }, { status: 422 });

  const category = String(form.get("category") ?? "").trim() || null;
  const fileName = newProjectDocFileName(file.type);
  await storagePut(user.orgId, fileName, fileBuf);
  // Trích text-layer PDF để lập chỉ mục tìm kiếm (M57 PR2) — êm nếu không extract
  // được (scan ảnh, hỏng, quá giới hạn trang/thời gian), không chặn upload.
  const extractedText = ext === ".pdf" ? await extractPdfText(fileBuf) : null;

  const id = await insertId(
    `INSERT INTO project_documents (title, category, file_name, original_name, mime_type, size_bytes, uploaded_by, project_id, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    title,
    category,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
    projectId,
    extractedText,
  );

  return NextResponse.json({ id, title, category, sizeBytes: file.size }, { status: 201 });
}
