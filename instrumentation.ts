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

// M44 PR3: gắn thêm tag `requestId` (đọc từ header x-request-id do proxy.ts sinh — xem M43
// PR1, lib/request-context.ts) vào scope Sentry trước khi capture lỗi Server
// Component/Route Handler chưa bắt — cho phép tra cứu ngược đúng dòng log JSON (lib/log.ts,
// cùng requestId) khi điều tra 1 sự kiện lỗi trên Sentry. Không đổi hành vi capture gốc,
// chỉ bọc thêm 1 tag qua withScope trước khi gọi captureRequestError như cũ.
type CaptureRequestErrorArgs = Parameters<typeof Sentry.captureRequestError>;

export const onRequestError = (
  error: CaptureRequestErrorArgs[0],
  request: CaptureRequestErrorArgs[1],
  errorContext: CaptureRequestErrorArgs[2],
): void => {
  Sentry.withScope((scope) => {
    const requestId = request.headers?.["x-request-id"];
    if (requestId) scope.setTag("requestId", Array.isArray(requestId) ? requestId[0] : requestId);
    Sentry.captureRequestError(error, request, errorContext);
  });
};
