import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditProposal,
  canSeeAllProposals,
  checkProposalRefs,
  getProposal,
  parseProposalBody,
  validateProposalInput,
} from "@/lib/proposals";

export const dynamic = "force-dynamic";

// GET /api/proposals/:id — chi tiết đề xuất (người tạo hoặc Admin/PM/BCH) kèm cảnh báo
// vượt định mức khi là đề xuất cấp phát vật tư (M18 — cảnh báo mềm, không chặn).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.requestedBy !== user.id && !canSeeAllProposals(user))
    return NextResponse.json({ error: "Không có quyền xem đề xuất này" }, { status: 403 });

  // Cảnh báo cấp phát vượt định mức (import động — chỉ trả cho vai trò được xem định mức).
  let overNorm = null;
  if (proposal.kind === "allocation" && proposal.materialId != null) {
    const { allocationOverNorm } = await import("@/lib/proposals");
    overNorm = await allocationOverNorm(id);
  }

  return NextResponse.json({ proposal, overNorm });
}

// PATCH /api/proposals/:id — sửa đề xuất khi còn nháp (người tạo hoặc Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  const editErr = canEditProposal(proposal, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseProposalBody(body);
  const invalid = validateProposalInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkProposalRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  await run(
    `UPDATE proposals SET kind = ?, title = ?, amount = ?, contract_id = ?, material_id = ?, reason = ? WHERE id = ?`,
    input.kind,
    input.title,
    input.amount,
    input.contractId,
    input.materialId,
    input.reason,
    id,
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/proposals/:id — xoá đề xuất nháp (người tạo) hoặc bất kỳ (Admin).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });

  const isOwnDraft = proposal.requestedBy === user.id && proposal.status === "draft";
  if (!isOwnDraft && user.role !== "admin")
    return NextResponse.json(
      { error: "Chỉ người tạo xoá được đề xuất nháp của mình (Admin xoá được mọi đề xuất)" },
      { status: 403 },
    );

  await run(`DELETE FROM proposals WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
