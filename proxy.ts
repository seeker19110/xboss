import { type NextRequest, NextResponse } from "next/server";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/traffic-token";
import { COOKIE, parseToken } from "@/lib/session-token";

// Proxy (middleware) của Next 16 LUÔN chạy Node.js runtime — chỉ intercept /api/ (trừ chính
// endpoint traffic/ingest). Fire-and-forget POST đến ingest để ghi ring buffer.
// Không await → không làm trễ request gốc.
// Kèm gắn `x-request-id` (M43): sinh UUID nếu chưa có, forward vào request headers để
// route handler đọc qua `headers()` (dùng cho audit trail + tương quan log), trả lại ở response.
//
// M56 PR2 — Bắt buộc 2FA theo vai trò: đọc cờ mustSetup2fa NHÚNG SẴN trong cookie phiên đã
// ký (parseToken, thuần node:crypto, KHÔNG chạm DB) — vai trò bị bắt buộc mà chưa bật 2FA thì
// chặn 403 mọi API TRỪ nhóm /api/auth/* (login/2fa/logout/me/totp — cần để hoàn tất bật 2FA
// hoặc đăng xuất). Đây là 1 điểm chạm duy nhất chặn được toàn bộ ~107 route, không sửa từng route.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  // Bỏ qua endpoint ingest để tránh vòng lặp vô hạn và các route traffic
  if (!path.startsWith("/api/admin/traffic/")) {
    const ingestUrl = new URL("/api/admin/traffic/ingest", req.url);
    fetch(ingestUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", [TRAFFIC_TOKEN_HEADER]: trafficToken() },
      body: JSON.stringify({
        method: req.method,
        path,
        ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "",
        ua: req.headers.get("user-agent") ?? "",
        ts: Date.now(),
      }),
    }).catch(() => {});
  }

  // Chặn tài khoản bắt buộc 2FA chưa bật — mọi API ngoài whitelist /api/auth/*.
  if (!path.startsWith("/api/auth/")) {
    const token = req.cookies.get(COOKIE)?.value;
    const parsed = token ? parseToken(token) : null;
    if (parsed?.mustSetup2fa) {
      return NextResponse.json(
        { error: "Cần bật xác thực 2 lớp trước khi tiếp tục", code: "2fa_required" },
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  // Chỉ intercept các API route — bỏ qua static file, _next/image, favicon...
  matcher: ["/api/:path*"],
};
