import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { PREF_KEYS, type PrefKey, type Prefs } from "@/lib/van-hanh/notification-prefs";

export const dynamic = "force-dynamic";

// GET /api/notifications/prefs → { prefs }
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const row = await queryOne<{ prefs: string }>(
    `SELECT prefs FROM notification_prefs WHERE user_id = ?`,
    user.id,
  );
  let prefs: Prefs = {};
  try {
    prefs = JSON.parse(row?.prefs ?? "{}") ?? {};
  } catch {
    /* default */
  }
  return NextResponse.json({ prefs });
}

// PATCH /api/notifications/prefs  body: { key: PrefKey, enabled: boolean }
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const key = body.key as string;
  if (!PREF_KEYS.includes(key as PrefKey))
    return NextResponse.json({ error: "Khoá không hợp lệ" }, { status: 400 });

  const row = await queryOne<{ prefs: string }>(
    `SELECT prefs FROM notification_prefs WHERE user_id = ?`,
    user.id,
  );
  let prefs: Prefs = {};
  try {
    prefs = JSON.parse(row?.prefs ?? "{}") ?? {};
  } catch {
    /* default */
  }

  (prefs as Record<string, boolean>)[key] = Boolean(body.enabled);

  await run(
    `INSERT INTO notification_prefs (user_id, prefs) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`,
    user.id,
    JSON.stringify(prefs),
  );

  return NextResponse.json({ ok: true, prefs });
}
