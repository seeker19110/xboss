import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword, makeToken, COOKIE, COOKIE_MAX_AGE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/auth/password  body: { oldPassword, newPassword } → tự đổi mật khẩu.
export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const oldPassword = String(body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (newPassword.length < 6)
    return NextResponse.json({ error: "Mật khẩu mới tối thiểu 6 ký tự" }, { status: 400 });

  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`, me.id);
  if (!u || !verifyPassword(oldPassword, u.password_hash))
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 401 });

  const newHash = hashPassword(newPassword);
  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, newHash, me.id);

  // pwFrag đổi → token cũ hết hiệu lực; cấp lại cookie để giữ phiên hiện tại
  // (các phiên khác trên thiết bị khác vẫn bị huỷ — đúng ý đồ bảo mật).
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(me.id, newHash), {
    httpOnly: true, path: "/", maxAge: COOKIE_MAX_AGE, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
