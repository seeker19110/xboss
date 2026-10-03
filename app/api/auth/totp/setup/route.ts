import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "@/lib/bao-mat/auth";
import { queryOne, run, withTransaction } from "@/lib/db";
import {
  encryptTotpSecret,
  generateNewTotpSecret,
  generateRecoveryCodes,
  totpAuthUri,
} from "@/lib/bao-mat/totp";

export const dynamic = "force-dynamic";

// POST /api/auth/totp/setup — user đã đăng nhập: sinh secret mới (trạng thái "chờ xác
// nhận" — totp_enabled_at vẫn NULL) + 8 recovery code, trả về đúng 1 lần. Gọi lại (vd
// scan hỏng) sẽ ghi đè secret + recovery code cũ, không tích luỹ rác.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  return withTransaction(async () => {
    // Cùng khoá với confirm/disable: không được ghi đè 2FA đã bật, kể cả khi
    // một yêu cầu xác nhận khác vừa hoàn tất trong lúc setup chờ khoá.
    const current = await queryOne<{ totp_enabled_at: string | null }>(
      `SELECT totp_enabled_at FROM users WHERE id = ? FOR UPDATE`,
      user.id,
    );
    if (!current) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (current.totp_enabled_at)
      return NextResponse.json(
        { error: "2FA đã bật — cần tắt xác thực hiện tại trước khi thiết lập lại" },
        { status: 409 },
      );

    const secret = generateNewTotpSecret();
    await run(
      `UPDATE users SET totp_secret = ?, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?`,
      encryptTotpSecret(secret),
      user.id,
    );

    const codes = generateRecoveryCodes();
    await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, user.id);
    for (const code of codes) {
      await run(
        `INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
        user.id,
        hashPassword(code),
      );
    }

    return NextResponse.json({
      otpauthUri: totpAuthUri(user.email, secret),
      recoveryCodes: codes,
    });
  });
}
