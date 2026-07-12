import * as Sentry from "@sentry/nextjs";

// Chạy 1 lần khi server bootstrap (không phải lúc `next build`) — nạp đúng cấu hình
// Sentry theo runtime (Node vs Edge). Thiếu SENTRY_DSN → Sentry.init() vẫn chạy nhưng
// `enabled: false` (xem sentry.server.config.ts/sentry.edge.config.ts), không gửi gì.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
