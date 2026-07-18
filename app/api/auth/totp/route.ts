import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { query, queryOne, run } from "@/lib/db";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

// GET /api/auth/totp — trạng thái 2FA của user hiện tại (cho /account hiển thị).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const row = await queryOne<{ totp_enabled_at: string | null }>(
    `SELECT totp_enabled_at FROM users WHERE id = ?`,
    user.id,
  );
  return NextResponse.json({ enabled: !!row?.totp_enabled_at });
}

// DELETE /api/auth/totp { password, code } — tự tắt 2FA của chính mình. Yêu cầu mật
// khẩu hiện tại + mã TOTP/recovery còn hạn (chống kẻ chiếm phiên tắt 2FA). Admin tắt hộ
// user khác qua PATCH /api/users/:id { disable2fa: true }.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { password, code } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !password || typeof code !== "string" || !code)
    return NextResponse.json({ error: "Thiếu password/code" }, { status: 400 });

  const u = await queryOne<{ password_hash: string; totp_secret: string | null }>(
    `SELECT password_hash, totp_secret FROM users WHERE id = ?`,
    user.id,
  );
  if (!u || !verifyPassword(password, u.password_hash) || !u.totp_secret)
    return NextResponse.json({ error: "Mật khẩu không đúng hoặc 2FA chưa bật" }, { status: 401 });

  const codeTrim = code.trim();
  let ok = false;
  if (/^\d{6}$/.test(codeTrim)) {
    const result = await verifyTotpCode(decryptTotpSecret(u.totp_secret), codeTrim);
    ok = result.valid;
  } else {
    const rows = await query<{ code_hash: string }>(
      `SELECT code_hash FROM totp_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
      user.id,
    );
    ok = rows.some((r) => verifyPassword(codeTrim, r.code_hash));
  }
  if (!ok) return NextResponse.json({ error: "Mã không đúng" }, { status: 401 });

  await run(
    `UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?`,
    user.id,
  );
  await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, user.id);
  return NextResponse.json({ ok: true });
}
