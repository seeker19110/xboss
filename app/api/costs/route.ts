import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { costSummary, costTotals, getCostSettings } from "@/lib/cost";

export const dynamic = "force-dynamic";

// GET /api/costs?groupBy=system|floor — bảng ngân sách/cam kết/thực chi (Admin/PM/BCH).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem chi phí" }, { status: 403 });

  const groupBy = req.nextUrl.searchParams.get("groupBy") === "floor" ? "floor" : "system";
  const [rows, totals, settings] = await Promise.all([
    costSummary(groupBy),
    costTotals(),
    getCostSettings(),
  ]);

  const alerts = rows
    .filter((r) => r.budget > 0 && (r.committed / r.budget) * 100 >= settings.warnPct)
    .map((r) => ({
      key: r.key,
      label: r.label,
      pct: (r.committed / r.budget) * 100,
      over: (r.committed / r.budget) * 100 >= settings.overPct,
    }));

  return NextResponse.json({ rows, totals, settings, alerts, groupBy });
}
