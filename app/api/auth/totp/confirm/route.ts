import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

// POST /api/auth/totp/confirm { code } — nhập đúng mã đầu tiên mới bật thật 2FA (chống
// tự khoá vì scan QR hỏng). Đặt totp_last_step ngay để chống dùng lại đúng mã này ở
// bước login/2fa.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string" || !code)
    return NextResponse.json({ error: "Thiếu mã xác nhận" }, { status: 400 });

  const row = await queryOne<{ totp_secret: string | null }>(
    `SELECT totp_secret FROM users WHERE id = ?`,
    user.id,
  );
  if (!row?.totp_secret)
    return NextResponse.json({ error: "Chưa gọi /setup — chưa có secret chờ xác nhận" }, { status: 400 });

  const secret = decryptTotpSecret(row.totp_secret);
  const result = await verifyTotpCode(secret, code.trim());
  if (!result.valid) return NextResponse.json({ error: "Mã không đúng" }, { status: 401 });

  await run(`UPDATE users SET totp_enabled_at = now(), totp_last_step = ? WHERE id = ?`, result.step, user.id);
  return NextResponse.json({ ok: true });
}
