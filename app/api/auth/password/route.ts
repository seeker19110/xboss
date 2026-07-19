import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { hitRateLimit } from "@/lib/ratelimit";
import { isSameOrigin } from "@/lib/csrf";
import {
  getCurrentUser,
  hashPassword,
  verifyPassword,
  makeToken,
  requiredRoles,
  computeMustSetup2fa,
  COOKIE,
  COOKIE_MAX_AGE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/auth/password  body: { oldPassword, newPassword } → tự đổi mật khẩu.
export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isSameOrigin(req))
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const oldPassword = String(body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (newPassword.length < 6)
    return NextResponse.json({ error: "Mật khẩu mới tối thiểu 6 ký tự" }, { status: 400 });

  // Rate-limit đổi mật khẩu: 5 lần sai / 15 phút / user
  if (await hitRateLimit(`password:${me.id}`, 5, 15)) {
    return NextResponse.json({ error: "Thử lại sau ít phút" }, { status: 429 });
  }

  const u = await queryOne<{ password_hash: string; totp_enabled_at: string | null }>(
    `SELECT password_hash, totp_enabled_at FROM users WHERE id = ?`,
    me.id,
  );
  if (!u || !verifyPassword(oldPassword, u.password_hash))
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 401 });

  const newHash = hashPassword(newPassword);
  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, newHash, me.id);

  // pwFrag đổi → token cũ hết hiệu lực; cấp lại cookie để giữ phiên hiện tại
  // (các phiên khác trên thiết bị khác vẫn bị huỷ — đúng ý đồ bảo mật).
  // M56 PR2: giữ nguyên trạng thái mustSetup2fa của phiên (đọc lại từ user hiện tại) —
  // đổi mật khẩu không mở khoá 2FA (chỉ bật 2FA thật mới mở, qua /api/auth/totp/confirm).
  const required = await requiredRoles();
  const mustSetup2fa = computeMustSetup2fa(me.role, u.totp_enabled_at, required);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(me.id, newHash, mustSetup2fa), {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
