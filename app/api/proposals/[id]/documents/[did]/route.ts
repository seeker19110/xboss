import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { photoPath } from "@/lib/photos";
import { canEditProposal, canSeeAllProposals, getProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

type ProposalDocRow = {
  id: number;
  file_name: string;
  mime_type: string;
  original_name: string | null;
};

// GET /api/proposals/:id/documents/:did — stream file đính kèm (quyền như GET đề xuất).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; did: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const proposalId = parseInt(params.id);
  const did = parseInt(params.did);
  if (isNaN(proposalId) || isNaN(did))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const proposal = await getProposal(proposalId);
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.requestedBy !== user.id && !canSeeAllProposals(user))
    return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });

  const doc = await queryOne<ProposalDocRow>(
    `SELECT id, file_name, mime_type, original_name FROM proposal_documents WHERE id = ? AND proposal_id = ?`,
    did,
    proposalId,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const path = photoPath(doc.file_name);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime_type,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name ?? doc.file_name)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/proposals/:id/documents/:did — xoá file đính kèm (quyền như PATCH:
// khi còn nháp, người tạo hoặc Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; did: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const proposalId = parseInt(params.id);
  const did = parseInt(params.did);
  if (isNaN(proposalId) || isNaN(did))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const proposal = await getProposal(proposalId);
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  const editErr = canEditProposal(proposal, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

  const doc = await queryOne<ProposalDocRow>(
    `SELECT id, file_name, mime_type, original_name FROM proposal_documents WHERE id = ? AND proposal_id = ?`,
    did,
    proposalId,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  await run(`DELETE FROM proposal_documents WHERE id = ?`, did);
  const path = photoPath(doc.file_name);
  if (path)
    await unlink(path).catch(() => {
      /* file đã mất trên đĩa — bỏ qua */
    });
  return NextResponse.json({ deleted: did });
}
