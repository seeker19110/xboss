import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { ensureUploadDir, extForDocMime, newClaimDocFileName, MAX_DOC_BYTES } from "@/lib/photos";
import { getClaim } from "@/lib/claims";

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
  const claim = await getClaim(claimId, projectId);
  if (!claim) return NextResponse.json({ error: "Không tìm thấy claim" }, { status: 404 });

  const documents = await query(
    `SELECT d.id, d.title, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.created_at AS "createdAt",
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM claim_documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.claim_id = ? ORDER BY d.id DESC`,
    claimId,
  );
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

  const title = String(form.get("title") ?? "").trim() || null;
  const fileName = newClaimDocFileName(claimId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO claim_documents (claim_id, title, file_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    claimId,
    title,
    fileName,
    file.name || null,
    file.type,
    file.size,
    user.id,
  );

  return NextResponse.json({ id, claimId, title, sizeBytes: file.size }, { status: 201 });
}
