import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import {
  verifyPassword,
  makeToken,
  COOKIE,
  COOKIE_MAX_AGE,
  isSecureCookie,
  makeTotpPendingToken,
  requiredRoles,
  computeMustSetup2fa,
} from "@/lib/bao-mat/auth";
import { checkLoginLimit, recordLoginAttempt, getClientIp } from "@/lib/bao-mat/login-limit";
import type { Role } from "@/lib/nen/roles";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password)
    return NextResponse.json({ error: "Thiếu email hoặc mật khẩu" }, { status: 400 });

  const ip = getClientIp(req.headers);
  const em = String(email).trim().toLowerCase();
  const limit = await checkLoginLimit(ip, em);
  if (limit.blocked) {
    return NextResponse.json(
      {
        error: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.",
        retryAfterSec: limit.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const user = await queryOne<{
    id: number;
    name: string;
    email: string;
    role: Role;
    password_hash: string;
    totp_enabled_at: string | null;
    org_id: number;
    session_version: number;
  }>(
    `SELECT id, name, email, role, password_hash, totp_enabled_at, org_id, session_version FROM users WHERE email = ?`,
    em,
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    await recordLoginAttempt(ip, em, false);
    return NextResponse.json({ error: "Sai email hoặc mật khẩu" }, { status: 401 });
  }
  await recordLoginAttempt(ip, em, true);
  // Chỉ xoá lỗi của đúng email + IP đã xác thực, không xoá dấu vết brute-force ở IP khác.
  await run(`DELETE FROM login_attempts WHERE email = ? AND ip = ? AND success = false`, em, ip);

  if (user.totp_enabled_at) {
    return NextResponse.json({
      requires2fa: true,
      tempToken: makeTotpPendingToken(user.id, user.password_hash),
    });
  }

  const required = await requiredRoles();
  const mustSetup2fa = computeMustSetup2fa(user.role, user.totp_enabled_at, required);
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    ...(mustSetup2fa ? { mustSetup2fa: true } : {}),
  });
  res.cookies.set(
    COOKIE,
    makeToken(user.id, user.password_hash, user.org_id, mustSetup2fa, user.session_version),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie(req),
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    },
  );
  return res;
}
