import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/bao-mat/auth";
import { query } from "@/lib/db";
import { runSync, type RunSummary } from "@/lib/ha-tang/integrations/core";
import { log } from "@/lib/nen/log";
import { theoTungToChuc } from "@/lib/ha-tang/to-chuc";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-integrations
// Cron quét mọi tích hợp đang bật (có dự án) và đồng bộ tuần tự từng cái.
// Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM (không nhận secret qua query param).
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const user = await getCurrentUser();
  const bySession = CAN.export(user?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  // Cron secret = tác vụ hệ thống, chạy mọi tổ chức — lần lượt TỪNG tổ chức (S16, RLS 0165:
  // mỗi vòng chỉ thấy tích hợp của một org). Gọi tay bằng phiên (S02) → chỉ tích hợp của tổ
  // chức người gọi, không chạy/không trả kết quả đồng bộ của tenant khác.
  const results = bySecret
    ? (await theoTungToChuc((orgId) => dongBoToChuc(orgId))).flat()
    : await dongBoToChuc(user?.orgId ?? null);

  return NextResponse.json({ ok: true, results });
}

async function dongBoToChuc(orgId: number | null) {
  const integrations = await query<{ id: number; provider: string; projectId: number }>(
    `SELECT id, provider, project_id AS "projectId"
       FROM integrations
      WHERE active = true AND project_id IS NOT NULL AND (?::int IS NULL OR org_id = ?::int)`,
    orgId,
    orgId,
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
        summary: { ok: false, stats: {}, error: "Lỗi đồng bộ tích hợp" },
      });
    }
  }
  return results;
}
