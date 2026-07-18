import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import {
  verifyPassword,
  makeToken,
  makeTotpPendingToken,
  ensureDefaultUsers,
  COOKIE,
  COOKIE_MAX_AGE,
} from "@/lib/auth";
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
  // Bắt buộc là chuỗi — nếu không, verifyPassword (scryptSync) sẽ throw TypeError trước khi
  // recordLoginFailure kịp chạy, vừa lộ 500 vừa không tính vào rate-limit chống brute-force.
  if (typeof email !== "string" || !email || typeof password !== "string" || !password)
    return NextResponse.json({ error: "Thiếu email/mật khẩu" }, { status: 400 });

  const emailNorm = String(email).toLowerCase().trim();
  const ip = clientIp(req);

  // Chống brute-force: 5 lần sai/15 phút theo IP+email (20/IP).
  const wait = await loginBlockedSeconds(ip, emailNorm);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Sai mật khẩu quá nhiều lần — thử lại sau ${Math.ceil(wait / 60)} phút` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }

  const u = await queryOne<{
    id: number;
    name: string;
    email: string;
    role: string;
    password_hash: string;
    totp_enabled_at: string | null;
  }>(
    `SELECT id, name, email, role, password_hash, totp_enabled_at FROM users WHERE email = ?`,
    emailNorm,
  );
  if (!u || !verifyPassword(password, u.password_hash)) {
    await recordLoginFailure(ip, emailNorm);
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  await recordLoginSuccess(ip, emailNorm);

  // Đã bật 2FA: KHÔNG set cookie phiên ngay — trả token tạm 5 phút, bước 2 xác minh mã
  // TOTP/recovery qua POST /api/auth/login/2fa.
  if (u.totp_enabled_at) {
    return NextResponse.json({
      need2fa: true,
      pending: makeTotpPendingToken(u.id, u.password_hash),
    });
  }
  const res = NextResponse.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  res.cookies.set(COOKIE, makeToken(u.id, u.password_hash), {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // dev qua HTTP vẫn set được
  });
  return res;
}
