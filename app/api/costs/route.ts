import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { costSummary, costTotals, getCostSettings } from "@/lib/cost";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/costs?groupBy=system|floor&includeVo=0 — bảng ngân sách/cam kết/thực chi
// (Admin/PM/BCH). includeVo mặc định true — gồm cả KL phát sinh (VO, M6) đã duyệt.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem chi phí" }, { status: 403 });

  // Dự án đang chọn — lọc chi phí theo dự án (đa dự án, M22+). null = chưa có project → không lọc.
  const projectId = await getCurrentProjectId(user);

  const groupBy = req.nextUrl.searchParams.get("groupBy") === "floor" ? "floor" : "system";
  const includeVo = req.nextUrl.searchParams.get("includeVo") !== "0";
  const [rows, totals, settings] = await Promise.all([
    costSummary(groupBy, includeVo, projectId ?? undefined),
    costTotals(includeVo, projectId ?? undefined),
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
