import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { query, queryOne, insertId, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  newContractDocFileName,
  MAX_DOC_BYTES,
  sha256Hex,
  parseUploadedFile,
} from "@/lib/nen/photos";
import { extractPdfText } from "@/lib/nen/pdf-extract";

export const dynamic = "force-dynamic";

// GET /api/contracts/:id/documents — danh sách file đính kèm HĐ (vai trò xem thanh
// toán). Kiểm hợp đồng thuộc đúng dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem hợp đồng" }, { status: 403 });

  const contractId = parseInt(params.id);
  if (isNaN(contractId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const documents =
    projectId != null
      ? await withProjectScope(projectId, async () => {
          const contract = await queryOne<{ id: number }>(
            `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
            contractId,
            projectId,
          );
          if (!contract) return null;
          return query(
            `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
                    d.size_bytes AS "sizeBytes", d.caption, d.created_at AS "createdAt", d.sha256,
                    d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
               FROM contract_documents d LEFT JOIN users u ON u.id = d.uploaded_by
              WHERE d.contract_id = ? ORDER BY d.id DESC`,
            contractId,
          );
        })
      : null;
  if (!documents) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });
  return NextResponse.json({ documents });
}

// POST /api/contracts/:id/documents — upload file HĐ (multipart: file, caption?).
// PDF hoặc ảnh, max 20MB. Chỉ Admin/PM (người quản hợp đồng).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload file hợp đồng (chỉ Admin/PM)" },
      { status: 403 },
    );

  const contractId = parseInt(params.id);
  if (isNaN(contractId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const contract =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
          contractId,
          projectId,
        )
      : undefined;
  if (!contract) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, ext, buf: fileBuf } = up;

  const caption = String(form.get("caption") ?? "").trim() || null;
  const fileName = newContractDocFileName(contractId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);
  const sha256 = sha256Hex(fileBuf);
  // Trích text-layer PDF để lập chỉ mục tìm kiếm (M57 PR2) — êm nếu không extract
  // được (scan ảnh, hỏng, quá giới hạn trang/thời gian), không chặn upload.
  const extractedText = ext === ".pdf" ? await extractPdfText(fileBuf) : null;

  const id = await insertId(
    `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by, sha256, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    contractId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    caption,
    user.id,
    sha256,
    extractedText,
  );

  return NextResponse.json({ id, contractId, caption, sizeBytes: file.size }, { status: 201 });
}
