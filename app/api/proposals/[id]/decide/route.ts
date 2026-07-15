import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { canDecideProposal, decideProposal, getProposal } from "@/lib/proposals";
import { advanceApproval } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// POST /api/proposals/:id/decide  body: { decision: 'approved'|'rejected', rejectReason?,
// createBill? } — quyết đề xuất đã trình (CAN.approve = Admin/PM). Duyệt tạm ứng/thanh toán
// có gắn HĐ + createBill=true → tạo phiếu payment_bills tương ứng (không tự động ép).
// M46 PR3: có approval_request đang pending cho đề xuất này (openApproval mở lúc tạo, chỉ
// xảy ra khi Admin cấu hình flow 'proposal' — PR4) → quyền + SoD do engine (advanceApproval)
// quyết định thay canDecideProposal; approve ở bước CHƯA CUỐI chỉ ghi nhận bước (không đụng
// proposals.status/payment_bills). reject ở bất kỳ bước nào chốt ngay. Không có flow/request
// pending → hành vi y hệt trước đây (canDecideProposal).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  const { decision } = body;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json(
      { error: "decision phải là 'approved' hoặc 'rejected'" },
      { status: 422 },
    );
  const rejectReason = typeof body.rejectReason === "string" ? body.rejectReason.trim() : "";

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });

  const proposal = await getProposal(id, projectId);
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.status !== "submitted")
    return NextResponse.json({ error: "Đề xuất không ở trạng thái đã trình" }, { status: 409 });

  const liveRequest = await queryOne<{ id: number }>(
    `SELECT id FROM approval_requests WHERE entity_type = 'proposal' AND entity_id = ? AND status = 'pending'`,
    id,
  );
  if (liveRequest) {
    const adv = await advanceApproval({
      entityType: "proposal",
      entityId: id,
      user,
      decision: decision === "rejected" ? "reject" : "approve",
      note: decision === "rejected" ? rejectReason || null : null,
    });
    if (adv.status === "pending")
      return NextResponse.json({
        pending: true,
        currentSeq: adv.currentSeq,
        nextRole: adv.nextRole,
      });
    // Bước cuối (approved) hoặc reject → áp domain logic bên dưới như cũ.
  } else if (!canDecideProposal(user)) {
    return NextResponse.json({ error: "Chỉ Admin/PM được quyết đề xuất" }, { status: 403 });
  }

  const result = await decideProposal({
    proposalId: id,
    decision,
    rejectReason: rejectReason || null,
    createBill: body.createBill === true,
    decidedBy: user.id,
    projectId,
  });
  if (typeof result === "string")
    return NextResponse.json(
      { error: result },
      { status: result === "Không tìm thấy đề xuất" ? 404 : 409 },
    );

  return NextResponse.json({ ok: true, status: decision, billId: result.billId });
}
