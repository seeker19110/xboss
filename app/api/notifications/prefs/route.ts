import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Khoá hợp lệ — khoá không có trong danh sách bị bỏ qua.
export const PREF_KEYS = [
  "delayed",            // quá hạn
  "due_soon",           // sắp đến hạn (5 ngày)
  "upcoming_start",     // sắp bắt đầu (7 ngày)
  "activity_progress",  // cập nhật tiến độ (48h)
  "activity_photo",     // ảnh hiện trường (48h)
  "activity_document",  // bản vẽ / tài liệu (48h)
  "activity_comment",   // bình luận (48h)
  "material_over",      // vật tư vượt định mức
] as const;

export type PrefKey = typeof PREF_KEYS[number];
export type Prefs = Partial<Record<PrefKey, boolean>>;

// GET /api/notifications/prefs → { prefs }
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const row = await queryOne<{ prefs: string }>(
    `SELECT prefs FROM notification_prefs WHERE user_id = ?`, user.id);
  let prefs: Prefs = {};
  try { prefs = JSON.parse(row?.prefs ?? "{}") ?? {}; } catch { /* default */ }
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
    `SELECT prefs FROM notification_prefs WHERE user_id = ?`, user.id);
  let prefs: Prefs = {};
  try { prefs = JSON.parse(row?.prefs ?? "{}") ?? {}; } catch { /* default */ }

  (prefs as Record<string, boolean>)[key] = Boolean(body.enabled);

  await run(
    `INSERT INTO notification_prefs (user_id, prefs) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`,
    user.id, JSON.stringify(prefs));

  return NextResponse.json({ ok: true, prefs });
}
