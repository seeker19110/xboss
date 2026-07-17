import { NextRequest, NextResponse } from "next/server";
import * as oidc from "openid-client";
import {
  ssoEnabled,
  getOidcConfig,
  resolveSsoUser,
  upsertSsoUser,
  oidcCallbackBlocked,
  recordOidcCallbackFailure,
  type SsoClaims,
} from "@/lib/oidc";
import { OIDC_TMP_COOKIE } from "../login/route";
import { makeToken, COOKIE, COOKIE_MAX_AGE } from "@/lib/auth";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// IP client: tin header proxy đầu tiên (copy từ app/api/auth/login/route.ts — không tách
// lên lib để khỏi đụng route login hiện có).
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Redirect về /login với mã lỗi cố định (KHÔNG lộ chi tiết lỗi IdP ra query — chỉ vào log).
function toLogin(req: NextRequest, error: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  // Cookie tạm đã dùng/hỏng → xoá luôn (đúng path hẹp đã set lúc login).
  res.cookies.delete({ name: OIDC_TMP_COOKIE, path: "/api/auth/oidc" });
  return res;
}

// GET /api/auth/oidc/callback → nhận code từ IdP, đổi token, phát cookie phiên xboss_session.
export async function GET(req: NextRequest) {
  if (!ssoEnabled())
    return NextResponse.json({ error: "SSO chưa được bật" }, { status: 404 });

  const ip = clientIp(req);

  // Đọc + XOÁ ngay cookie tạm (dùng 1 lần). Thiếu → hết hạn/không hợp lệ.
  const raw = req.cookies.get(OIDC_TMP_COOKIE)?.value;
  if (!raw) return toLogin(req, "oidc_expired");
  let state: string, nonce: string, verifier: string;
  try {
    const parsed = JSON.parse(raw);
    ({ state, nonce, verifier } = parsed);
    if (!state || !nonce || !verifier) throw new Error("thiếu trường");
  } catch {
    return toLogin(req, "oidc_expired");
  }

  // Rate limit lỗi theo IP (10 lần/15 phút) — chống dò state/code.
  if ((await oidcCallbackBlocked(ip)) > 0) return toLogin(req, "oidc_rate");

  // Đổi code lấy token; openid-client tự verify state/nonce/PKCE/chữ ký/aud.
  let claims: SsoClaims | undefined;
  try {
    const config = await getOidcConfig();
    const tokens = await oidc.authorizationCodeGrant(config, new URL(req.url), {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    });
    claims = tokens.claims() as SsoClaims | undefined;
  } catch (e) {
    await recordOidcCallbackFailure(ip);
    log.warn("OIDC callback đổi token lỗi", {
      route: "oidc.callback",
      error: e instanceof Error ? e.message : String(e),
    });
    return toLogin(req, "oidc_failed");
  }

  const resolved = resolveSsoUser(claims ?? {});
  if ("error" in resolved) {
    await recordOidcCallbackFailure(ip);
    log.warn("OIDC callback thiếu email", { route: "oidc.callback", detail: resolved.error });
    return toLogin(req, "oidc_noemail");
  }
  if (resolved.roleFromClaim === null && process.env.OIDC_ROLE_CLAIM?.trim()) {
    log.warn("OIDC claim role không hợp lệ — giữ role cũ / dùng mặc định", {
      route: "oidc.callback",
      email: resolved.email,
    });
  }

  const user = await upsertSsoUser(resolved);

  // Phát cookie phiên (flags y hệt app/api/auth/login/route.ts). Redirect CỐ ĐỊNH về "/"
  // — KHÔNG nhận returnTo/redirect từ query (chống open-redirect).
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(COOKIE, makeToken(user.id, user.password_hash), {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.delete({ name: OIDC_TMP_COOKIE, path: "/api/auth/oidc" });
  return res;
}
