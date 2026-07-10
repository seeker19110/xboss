import { NextRequest, NextResponse } from "next/server";
import { todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  cashflowActual,
  receivables,
  payables,
  advanceOutstanding,
  vatSummary,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

// GET /api/finance/summary?period=YYYY-MM — gộp dòng tiền/công nợ/tạm ứng/VAT cho trang
// dashboard tài chính (tránh N request rời rạc ở client). Xem: CAN.viewPayments.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem tài chính" }, { status: 403 });

  const period = req.nextUrl.searchParams.get("period") ?? todayISO().slice(0, 7);
  if (!PERIOD_RE.test(period))
    return NextResponse.json({ error: "Kỳ không hợp lệ (YYYY-MM)" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({
      period,
      cashflow: [],
      receivables: 0,
      payables: 0,
      advanceOutstanding: 0,
      vat: { vatIn: 0, vatOut: 0, netVat: 0 },
    });

  const [cashflow, rcv, pay, adv, vat] = await Promise.all([
    cashflowActual(projectId),
    receivables(projectId),
    payables(projectId),
    advanceOutstanding(projectId),
    vatSummary(period, projectId),
  ]);

  return NextResponse.json({
    period,
    cashflow,
    receivables: rcv,
    payables: pay,
    advanceOutstanding: adv,
    vat,
  });
}
