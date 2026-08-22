import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { insertId, queryOne } from "@/lib/db";
import { runHealthChecks } from "@/lib/healthcheck";

export const dynamic = "force-dynamic";

// GET /api/tech/health-check — kiểm tra thủ công trạng thái hoạt động (API + không-API).
// Chỉ Admin (nhạy cảm hơn PM — cùng mức panel "Hệ thống" trên /tech). Ghi kết quả vào
// health_check_runs để cron/lịch sử dùng chung 1 nguồn.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin xem được trạng thái hệ thống" }, { status: 403 });

  const report = await runHealthChecks();
  const id = await insertId(
    `INSERT INTO health_check_runs (has_issues, fail_count, warn_count, results, notified, triggered_by)
     VALUES (?, ?, ?, ?, false, 'manual')`,
    report.hasIssues,
    report.failCount,
    report.warnCount,
    JSON.stringify(report.items),
  );

  const lastNotified = await queryOne<{ checked_at: string }>(
    `SELECT checked_at FROM health_check_runs WHERE notified = true ORDER BY checked_at DESC LIMIT 1`,
  );

  return NextResponse.json({
    ...report,
    runId: id,
    lastNotifiedAt: lastNotified?.checked_at ?? null,
  });
}
