import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET /api/push/subscribe → VAPID public key (client cần để đăng ký).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  return NextResponse.json({ key: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null });
}

// POST /api/push/subscribe  body: PushSubscription.toJSON() → lưu thiết bị nhận push.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sub = await req.json().catch(() => null);
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string")
    return NextResponse.json({ error: "Subscription không hợp lệ" }, { status: 400 });

  // Endpoint là duy nhất per thiết bị/trình duyệt — đăng nhập user khác thì chuyển chủ.
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    user.id, endpoint, p256dh, auth);

  return NextResponse.json({ ok: true });
}

// DELETE /api/push/subscribe  body: { endpoint } → huỷ đăng ký thiết bị này.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.endpoint !== "string")
    return NextResponse.json({ error: "Thiếu endpoint" }, { status: 400 });

  await run(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`, body.endpoint, user.id);
  return NextResponse.json({ ok: true });
}
