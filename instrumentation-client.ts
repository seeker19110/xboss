import * as Sentry from "@sentry/nextjs";

// Sentry phía trình duyệt — TUỲ CHỌN, thiếu NEXT_PUBLIC_SENTRY_DSN thì SDK no-op hoàn toàn
// (đúng nguyên tắc no-op khi thiếu cấu hình như sentry.server.config.ts).
//
// QUYẾT ĐỊNH KIẾN TRÚC (ghi lại, không phải mặc định ngầm): đây là biến NEXT_PUBLIC_ đầu
// tiên của dự án — trước đó lib/env.ts khẳng định "không có biến client nào". Chấp nhận vì
// giá trị DSN không phải bí mật (thiết kế để lộ ra client, Sentry chặn ghi bằng CORS allowlist
// theo project), đổi lại đo được lỗi/hiệu năng thật ở trình duyệt (checkbox lưới tracking mất
// mạng, SSE rớt kết nối...) mà sentry.server.config.ts không thấy được.
//
// Session Replay CỐ Ý thu hẹp — dữ liệu XBoss là tiến độ thi công/nhân sự/tài chính nội bộ,
// không ghi phiên bình thường: replaysSessionSampleRate=0 (không giám sát liên tục), chỉ ghi
// lại 100% khi có lỗi xảy ra để phục vụ debug (replaysOnErrorSampleRate=1), kèm che chữ +
// chặn media để không lộ nội dung nhạy cảm trong bản ghi.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
