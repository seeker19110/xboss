import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { verifyPassword, makeToken, ensureDefaultUsers, COOKIE, COOKIE_MAX_AGE } from "@/lib/auth";
import { loginBlockedSeconds, recordLoginFailure, recordLoginSuccess } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// IP client: tin header proxy đầu tiên (Vercel/nginx đặt x-forwarded-for).
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  await ensureDefaultUsers();
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: "Thiếu email/mật khẩu" }, { status: 400 });

  const emailNorm = String(email).toLowerCase().trim();
  const ip = clientIp(req);

  // Chống brute-force: 5 lần sai/15 phút theo IP+email (20/IP).
  const wait = loginBlockedSeconds(ip, emailNorm);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Sai mật khẩu quá nhiều lần — thử lại sau ${Math.ceil(wait / 60)} phút` },
      { status: 429, headers: { "Retry-After": String(wait) } });
  }

  const u = await queryOne<{ id: number; name: string; email: string; role: string; password_hash: string }>(
    `SELECT id, name, email, role, password_hash FROM users WHERE email = ?`, emailNorm);
  if (!u || !verifyPassword(password, u.password_hash)) {
    recordLoginFailure(ip, emailNorm);
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  recordLoginSuccess(ip, emailNorm);
  const res = NextResponse.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  res.cookies.set(COOKIE, makeToken(u.id), {
    httpOnly: true, path: "/", maxAge: COOKIE_MAX_AGE, sameSite: "lax",
  });
  return res;
}
