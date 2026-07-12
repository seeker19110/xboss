import * as Sentry from "@sentry/nextjs";

// Tuỳ chọn: thiếu SENTRY_DSN → enabled=false, SDK no-op hoàn toàn (không throw, không gửi
// gì) — cùng nguyên tắc với VAPID_*/GOOGLE_SERVICE_ACCOUNT_JSON trong lib/env.ts. Người vận
// hành chỉ cần đặt SENTRY_DSN (xem .env.example) là bật gửi lỗi thật, không cần đổi code.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Không gửi cookie/header xác thực lên Sentry (bảo mật — xem CLAUDE.md "không lộ secret").
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
    }
    return event;
  },
});
