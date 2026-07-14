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
// KHÔNG dùng Session Replay (rrweb): nếu để replayIntegration trong mảng integrations tĩnh,
// recorder rrweb đóng gói và TẢI SỚM trên mọi trang (rootMainFiles) — đo thật bằng build
// production tại chỗ (2026-07): tổng JS tải sớm 281.5 → 237.8 KiB gzip khi bỏ (~44 KiB net
// cho riêng rrweb; phần còn lại của chunk chứa nó là framework/app tự re-split, không mất).
// Ngoài bytes, rrweb còn tốn main-thread lúc hydrate (gắn MutationObserver theo dõi cả DOM)
// — cả app là 'use client' nên mọi trang phải đợi hydrate xong mới vẽ LCP. Replay chỉ hữu
// ích khi ghi được diễn biến TRƯỚC lỗi (phải chạy từ lúc tải trang) nên không thể
// lazy-load-on-error mà vẫn giữ giá trị; CSP siết + PWA offline-first cũng chặn tải chunk
// CDN ngoài. Giữ capture lỗi + performance (giá trị observability chính "lỗi gì, ở đâu"),
// bỏ replay ("xem lại video") để đổi lấy LCP nhanh hơn.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
