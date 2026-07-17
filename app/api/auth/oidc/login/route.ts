import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { ssoEnabled, getOidcConfig, redirectUri } from "@/lib/oidc";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// Cookie tạm giữ state/nonce/verifier giữa 2 chặng OIDC — httpOnly, dùng 1 lần, phạm vi
// hẹp /api/auth/oidc, sống 10 phút. Không cần ký: httpOnly chỉ chủ trình duyệt sửa được và
// sửa chỉ tự hại phiên của chính họ (openid-client so khớp server-side).
export const OIDC_TMP_COOKIE = "xboss_oidc";

// GET /api/auth/oidc/login → khởi tạo luồng Authorization Code + PKCE, redirect tới IdP.
export async function GET() {
  if (!ssoEnabled())
    return NextResponse.json({ error: "SSO chưa được bật" }, { status: 404 });

  let config: oidc.Configuration;
  try {
    config = await getOidcConfig();
  } catch (e) {
    log.warn("OIDC discovery lỗi khi bắt đầu đăng nhập", {
      route: "oidc.login",
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.redirect(new URL("/login?error=oidc_failed", redirectUri()));
  }

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);

  const authUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(authUrl.href);
  res.cookies.set(OIDC_TMP_COOKIE, JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/oidc",
    maxAge: 600,
  });
  return res;
}
