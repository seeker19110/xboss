import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { verifyPassword, makeToken, ensureDefaultUsers, COOKIE, COOKIE_MAX_AGE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  ensureDefaultUsers();
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: "Thiếu email/mật khẩu" }, { status: 400 });

  const u = queryOne<{ id: number; name: string; email: string; role: string; password_hash: string }>(
    `SELECT id, name, email, role, password_hash FROM users WHERE email = ?`, String(email).toLowerCase().trim());
  if (!u || !verifyPassword(password, u.password_hash)) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  const res = NextResponse.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  res.cookies.set(COOKIE, makeToken(u.id), {
    httpOnly: true, path: "/", maxAge: COOKIE_MAX_AGE, sameSite: "lax",
  });
  return res;
}
