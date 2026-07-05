import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { awardTender } from "@/lib/tender";

export const dynamic = "force-dynamic";

// POST /api/tenders/:id/award { bidId } — trao thầu (CAN.approve): chốt báo giá
// thắng, sinh 1 hợp đồng giao thầu (contracts, M16) cho NCC trúng thầu, khoá sửa.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được trao thầu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const bidId = Number(body?.bidId);
  if (!Number.isInteger(bidId))
    return NextResponse.json({ error: "Thiếu báo giá được chọn" }, { status: 422 });

  try {
    const { contractId } = await awardTender(id, bidId, user.id);
    return NextResponse.json({ awarded: id, contractId });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }
}
