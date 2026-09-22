import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/bao-mat/auth";
import { runMaterialSync } from "@/lib/vat-tu/material-sync";
import { log } from "@/lib/nen/log";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-sheets
// Gọi bởi cron để đồng bộ hai chiều vật tư ↔ Google Sheet định kỳ, hoặc Admin/PM gọi tay.
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

  try {
    // orgId: có session thì dùng org người gọi. Nhánh cron (chỉ CRON_SECRET) không có user —
    // tích hợp Google Sheet hiện là single-tenant toàn cục (1 Sheet ↔ 1 DB) nên lấy org của dự án
    // đầu tiên; org hoá luồng đồng bộ per-org vẫn là việc giai đoạn sau (M54 GĐ2).
    let orgId = user?.orgId;
    if (!orgId) {
      const proj = await query<{ org_id: number }>(
        `SELECT org_id FROM projects ORDER BY id LIMIT 1`,
      );
      orgId = proj[0]?.org_id ?? 1;
    }
    const summary = await runMaterialSync(orgId);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đồng bộ Google Sheet";
    log.error("GET /api/cron/sync-sheets lỗi", { route: "GET /api/cron/sync-sheets", err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
