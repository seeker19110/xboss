import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  makeToken,
  isSecureCookie,
  COOKIE,
  COOKIE_MAX_AGE,
} from "@/lib/bao-mat/auth";
import { queryOne, run, withTransaction } from "@/lib/db";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/bao-mat/totp";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";

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

  if (await hitRateLimit(`totp-confirm:${user.id}`, 10, 15))
    return NextResponse.json(
      { error: "Thử xác nhận quá nhiều lần — thử lại sau" },
      { status: 429, headers: { "Retry-After": "900" } },
    );

  return withTransaction(async () => {
    // Giữ khoá tới khi bật 2FA xong để setup không đổi secret giữa kiểm mã và ghi.
    const row = await queryOne<{
      totp_secret: string | null;
      totp_enabled_at: string | null;
      password_hash: string;
      session_version: number;
      org_id: number;
    }>(
      `SELECT totp_secret, totp_enabled_at, password_hash, session_version, org_id FROM users WHERE id = ? FOR UPDATE`,
      user.id,
    );
    if (!row?.totp_secret)
      return NextResponse.json(
        { error: "Chưa gọi /setup — chưa có secret chờ xác nhận" },
        { status: 400 },
      );
    if (row.totp_enabled_at)
      return NextResponse.json({ error: "2FA đã được bật" }, { status: 409 });

    const secret = decryptTotpSecret(row.totp_secret);
    const result = await verifyTotpCode(secret, code.trim());
    if (!result.valid) return NextResponse.json({ error: "Mã không đúng" }, { status: 401 });

    await run(
      `UPDATE users SET totp_enabled_at = now(), totp_last_step = ?,
                        session_version = session_version + 1 WHERE id = ?`,
      result.step,
      user.id,
    );

    // M56 PR2: vừa bật 2FA thành công → phát lại cookie phiên với mustSetup2fa=false để mở
    // khoá NGAY. Tăng phiên để mọi cookie phát trước lúc bật 2FA hết hiệu lực.
    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      COOKIE,
      makeToken(user.id, row.password_hash, false, Number(row.session_version) + 1, row.org_id),
      {
        httpOnly: true,
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
        secure: isSecureCookie(req),
      },
    );
    return res;
  });
}
