import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canDecideProposal, decideProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

// POST /api/proposals/:id/decide  body: { decision: 'approved'|'rejected', rejectReason?,
// createBill? } — quyết đề xuất đã trình (CAN.approve = Admin/PM). Duyệt tạm ứng/thanh toán
// có gắn HĐ + createBill=true → tạo phiếu payment_bills tương ứng (không tự động ép).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canDecideProposal(user))
    return NextResponse.json({ error: "Chỉ Admin/PM được quyết đề xuất" }, { status: 403 });

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

  const result = await decideProposal({
    proposalId: id,
    decision,
    rejectReason: typeof body.rejectReason === "string" ? body.rejectReason : null,
    createBill: body.createBill === true,
    decidedBy: user.id,
  });
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 409 });

  return NextResponse.json({ ok: true, status: decision, billId: result.billId });
}
