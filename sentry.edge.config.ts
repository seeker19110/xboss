import * as Sentry from "@sentry/nextjs";

// Cấu hình riêng cho Edge runtime (middleware/route edge nếu có) — cùng nguyên tắc
// no-op khi thiếu SENTRY_DSN như sentry.server.config.ts.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
