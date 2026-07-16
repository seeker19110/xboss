import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const VIEWS = ["mv_progress_daily", "mv_cost_by_month"] as const;

// GET /api/cron/refresh-views
// Làm mới materialized views (M47 PR2) — gọi bởi cron mỗi 15 phút, hoặc Admin/PM gọi tay.
// REFRESH CONCURRENTLY không khoá đọc (route dashboard/scurve/cost_by_month vẫn đọc được
// dữ liệu cũ trong lúc refresh). Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM.
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  const results: Record<string, string> = {};
  for (const view of VIEWS) {
    try {
      await run(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      results[view] = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi không rõ";
      results[view] = `error: ${msg}`;
      log.error("GET /api/cron/refresh-views lỗi", {
        route: "GET /api/cron/refresh-views",
        view,
        err: msg,
      });
    }
  }

  const ok = Object.values(results).every((v) => v === "ok");
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}
