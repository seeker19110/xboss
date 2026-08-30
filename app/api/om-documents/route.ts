import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listOmDocs } from "@/lib/hien-truong/warranty";
import { newOmDocFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";

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
// tradeId?). PDF hoặc ảnh, max 20MB (pattern task_documents). manageWarranty:
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

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  const title = String(form.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tên tài liệu" }, { status: 422 });

  const tradeIdRaw = String(form.get("tradeId") ?? "").trim();
  const tradeId = tradeIdRaw ? Number(tradeIdRaw) : null;
  if (tradeId != null) {
    if (!(await queryOne(`SELECT id FROM systems WHERE id = ?`, tradeId)))
      return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }

  const fileName = newOmDocFileName(projectId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

  const id = await insertId(
    `INSERT INTO om_documents (project_id, title, system_id, file_name, original_name,
       mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    title,
    tradeId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
