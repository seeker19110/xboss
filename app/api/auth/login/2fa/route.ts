import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import {
  parseTotpPendingToken,
  verifyPassword,
  makeToken,
  COOKIE,
  COOKIE_MAX_AGE,
} from "@/lib/auth";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";
import { hitRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/auth/login/2fa — bước 2 sau /api/auth/login trả { need2fa: true, pending }.
// Nhận mã TOTP (6 số) hoặc recovery code (định dạng xxxxx-xxxxx) → set cookie phiên thật.
export async function POST(req: NextRequest) {
  const { pending, code } = await req.json().catch(() => ({}));
  if (typeof pending !== "string" || !pending || typeof code !== "string" || !code)
    return NextResponse.json({ error: "Thiếu pending/code" }, { status: 400 });

  const ip = clientIp(req);
  if (await hitRateLimit(`totp|${ip}`, 10, 15))
    return NextResponse.json(
      { error: "Nhập sai mã quá nhiều lần — thử lại sau" },
      { status: 429, headers: { "Retry-After": "900" } },
    );

  const parsed = parseTotpPendingToken(pending);
  if (!parsed)
    return NextResponse.json(
      { error: "Phiên xác thực đã hết hạn — đăng nhập lại" },
      { status: 401 },
    );

  const u = await queryOne<{
    id: number;
    name: string;
    email: string;
    role: string;
    password_hash: string;
    totp_secret: string | null;
    totp_last_step: number | null;
    session_version: number;
  }>(
    `SELECT id, name, email, role, password_hash, totp_secret, totp_last_step, session_version FROM users WHERE id = ?`,
    parsed.uid,
  );
  // pwFrag không khớp → mật khẩu đã đổi từ lúc phát pending token, token cũ không còn hợp lệ.
  if (!u || !u.password_hash.startsWith(parsed.pwFrag) || !u.totp_secret)
    return NextResponse.json({ error: "Phiên xác thực không hợp lệ" }, { status: 401 });

  const codeTrim = code.trim();
  let ok = false;

  if (/^\d{6}$/.test(codeTrim)) {
    const secret = decryptTotpSecret(u.totp_secret);
    const result = await verifyTotpCode(secret, codeTrim);
    if (result.valid && (u.totp_last_step == null || result.step > u.totp_last_step)) {
      ok = true;
      await run(`UPDATE users SET totp_last_step = ? WHERE id = ?`, result.step, u.id);
    }
  } else {
    const recoveryRows = await query<{ id: number; code_hash: string }>(
      `SELECT id, code_hash FROM totp_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
      u.id,
    );
    const match = recoveryRows.find((r) => verifyPassword(codeTrim, r.code_hash));
    if (match) {
      ok = true;
      await run(`UPDATE totp_recovery_codes SET used_at = now() WHERE id = ?`, match.id);
    }
  }

  if (!ok) return NextResponse.json({ error: "Mã không đúng hoặc đã dùng" }, { status: 401 });

  // M56 PR2: đã verify TOTP/recovery xong nghĩa là user CHẮC CHẮN đã bật 2FA (totp_secret
  // + totp_enabled_at có giá trị) → không bao giờ còn phải "setup" nữa → mustSetup2fa=false.
  const res = NextResponse.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  res.cookies.set(COOKIE, makeToken(u.id, u.password_hash, false, u.session_version), {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
