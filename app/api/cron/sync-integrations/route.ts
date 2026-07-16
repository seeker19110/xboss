import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { query } from "@/lib/db";
import { runSync, type RunSummary } from "@/lib/integrations/core";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-integrations
// Cron quét mọi tích hợp đang bật (có dự án) và đồng bộ tuần tự từng cái.
// Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM (không nhận secret qua query param).
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  const integrations = await query<{ id: number; provider: string; projectId: number }>(
    `SELECT id, provider, project_id AS "projectId"
       FROM integrations WHERE active = true AND project_id IS NOT NULL`,
  );

  // Chạy TUẦN TỰ (không Promise.all) — tránh nhiều tiến trình cùng tranh sync_locks/quá tải DB.
  const results: { provider: string; projectId: number; summary: RunSummary }[] = [];
  for (const it of integrations) {
    try {
      const summary = await runSync(it.provider, it.projectId);
      results.push({ provider: it.provider, projectId: it.projectId, summary });
    } catch (e) {
      // Lỗi 1 hàng không chặn các hàng còn lại.
      const msg = e instanceof Error ? e.message : "Lỗi đồng bộ tích hợp";
      log.error("GET /api/cron/sync-integrations lỗi 1 tích hợp", {
        route: "GET /api/cron/sync-integrations",
        provider: it.provider,
        projectId: it.projectId,
        err: msg,
      });
      results.push({
        provider: it.provider,
        projectId: it.projectId,
        summary: { ok: false, stats: {}, error: msg },
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
