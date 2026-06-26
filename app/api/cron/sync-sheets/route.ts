import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { runMaterialSync } from "@/lib/material-sync";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-sheets
// Gọi bởi cron để đồng bộ hai chiều vật tư ↔ Google Sheet định kỳ, hoặc Admin/PM gọi tay.
// Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM (không nhận secret qua query param).
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json({ error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" }, { status: 401 });

  try {
    const summary = await runMaterialSync();
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đồng bộ Google Sheet";
    console.error("GET /api/cron/sync-sheets error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
