import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { deliverDueWebhooks } from "@/lib/webhooks";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// GET /api/cron/deliver-webhooks
// Gọi bởi cron (mỗi 5 phút) để gửi các webhook_deliveries đang chờ đến hạn, hoặc Admin/PM gọi
// tay. Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM (không nhận secret qua
// query param) — y hệt /api/cron/sync-sheets.
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  try {
    const result = await deliverDueWebhooks();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi gửi webhook";
    log.error("GET /api/cron/deliver-webhooks lỗi", {
      route: "GET /api/cron/deliver-webhooks",
      err: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
