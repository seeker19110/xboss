import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { costSummary, costTotals, getCostSettings } from "@/lib/tai-chinh/cost";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { withProjectScope } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/costs?groupBy=system|floor&includeVo=0 — bảng ngân sách/cam kết/thực chi.
// Đây là API MỘT dự án; thiếu phạm vi hợp lệ không được hiểu thành báo cáo toàn hệ.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null || !Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json(
      { error: "Cần chọn dự án hợp lệ để xem chi phí", code: "project_required" },
      { status: 403 },
    );
  }
  // Giải phạm vi trước để override quyền theo dự án dùng đúng request-context.
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem chi phí" }, { status: 403 });

  const groupBy = req.nextUrl.searchParams.get("groupBy") === "floor" ? "floor" : "system";
  const includeVo = req.nextUrl.searchParams.get("includeVo") !== "0";
  const [rows, totals, settings] = await withProjectScope(projectId, () =>
    Promise.all([
      costSummary(groupBy, includeVo, projectId),
      costTotals(includeVo, projectId),
      getCostSettings(),
    ]),
  );

  const alerts = rows
    .filter((r) => r.budget > 0 && (r.committed / r.budget) * 100 >= settings.warnPct)
    .map((r) => ({
      key: r.key,
      label: r.label,
      pct: (r.committed / r.budget) * 100,
      over: (r.committed / r.budget) * 100 >= settings.overPct,
    }));

  return NextResponse.json(
    { rows, totals, settings, alerts, groupBy },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
