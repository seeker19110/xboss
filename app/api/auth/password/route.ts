import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

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

  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, hashPassword(newPassword), me.id);
  return NextResponse.json({ ok: true });
}
