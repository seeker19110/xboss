import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { query, insertId, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { newClaimDocFileName, MAX_DOC_BYTES, sha256Hex, parseUploadedFile } from "@/lib/nen/photos";
import { getClaim } from "@/lib/tai-chinh/claims";

export const dynamic = "force-dynamic";

// GET /api/claims/:id/documents — danh sách hồ sơ định lượng đính kèm claim.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem claim" }, { status: 403 });

  const claimId = parseInt(params.id);
  if (isNaN(claimId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const documents = await withProjectScope(projectId ?? "*", async () => {
    const claim = await getClaim(claimId, projectId);
    if (!claim) return null;
    return query(
      `SELECT d.id, d.title, d.original_name AS "originalName", d.mime_type AS "mimeType",
              d.size_bytes AS "sizeBytes", d.created_at AS "createdAt", d.sha256,
              d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
         FROM claim_documents d LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.claim_id = ? ORDER BY d.id DESC`,
      claimId,
    );
  });
  if (!documents) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });
  return NextResponse.json({ documents });
}

// POST /api/claims/:id/documents — upload hồ sơ (multipart: file, title?). PDF hoặc
// ảnh, max 20MB. Quyền: Admin/PM/Kỹ sư (như tạo/sửa claim).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền tải hồ sơ claim" }, { status: 403 });

  const claimId = parseInt(params.id);
  if (isNaN(claimId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const claim = await getClaim(claimId, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  const title = String(form.get("title") ?? "").trim() || null;
  const fileName = newClaimDocFileName(claimId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);
  const sha256 = sha256Hex(fileBuf);

  const id = await insertId(
    `INSERT INTO claim_documents (claim_id, title, file_name, original_name, mime_type, size_bytes, uploaded_by, sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    claimId,
    title,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
    sha256,
  );

  return NextResponse.json({ id, claimId, title, sizeBytes: file.size }, { status: 201 });
}
