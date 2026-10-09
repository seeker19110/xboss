import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/bao-mat/auth";
import { deliverDueWebhooks } from "@/lib/bao-mat/webhooks";
import { log } from "@/lib/nen/log";
import { theoTungToChuc } from "@/lib/ha-tang/to-chuc";

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
    // Chỉ-secret: hàng đợi gửi lần lượt TỪNG tổ chức (S16, RLS 0165 — mỗi vòng chỉ thấy webhook
    // của một org); phiên Admin/PM chỉ gửi webhook của tổ chức người gọi.
    if (!bySecret) return NextResponse.json(await deliverDueWebhooks());
    const tung = await theoTungToChuc(() => deliverDueWebhooks());
    return NextResponse.json({
      sent: tung.reduce((n, r) => n + r.sent, 0),
      failed: tung.reduce((n, r) => n + r.failed, 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi gửi webhook";
    log.error("GET /api/cron/deliver-webhooks lỗi", {
      route: "GET /api/cron/deliver-webhooks",
      err: msg,
    });
    return NextResponse.json({ error: "Lỗi gửi webhook" }, { status: 500 });
  }
}
