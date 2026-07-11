import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newProposalDocFileName,
  MAX_DOC_BYTES,
} from "@/lib/photos";
import { canEditProposal, canSeeAllProposals, getProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

// GET /api/proposals/:id/documents — danh sách file đính kèm (quyền như GET đề xuất).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const proposalId = parseInt(params.id);
  if (isNaN(proposalId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const proposal = projectId != null ? await getProposal(proposalId, projectId) : undefined;
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.requestedBy !== user.id && !canSeeAllProposals(user))
    return NextResponse.json({ error: "Không có quyền xem đề xuất này" }, { status: 403 });

  const documents = await query(
    `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.caption, d.created_at AS "createdAt",
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM proposal_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.proposal_id = ? ORDER BY d.id DESC`,
    proposalId,
  );
  return NextResponse.json({ documents });
}

// POST /api/proposals/:id/documents — upload đính kèm (multipart: file, caption?).
// PDF hoặc ảnh, max 20MB. Quyền như PATCH: khi còn nháp, người tạo hoặc Admin/PM.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const proposalId = parseInt(params.id);
  if (isNaN(proposalId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const proposal = projectId != null ? await getProposal(proposalId, projectId) : undefined;
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  const editErr = canEditProposal(proposal, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

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
  const fileName = newProposalDocFileName(proposalId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO proposal_documents (proposal_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    proposalId,
    fileName,
    file.name || null,
    file.type,
    file.size,
    caption,
    user.id,
  );
  return NextResponse.json({ id, proposalId, caption, sizeBytes: file.size }, { status: 201 });
}
