import type { NextRequest } from "next/server";

// Same-origin check bổ sung cho sameSite:"lax". Origin header vắng mặt (một số client
// cũ/tool nội bộ) → cho qua, dựa vào sameSite làm lớp chính; Origin có mặt nhưng khác
// host hiện tại → chặn.
//
// Áp ở `proxy.ts` cho MỌI request mutating tới /api/* (1 điểm chạm duy nhất, cùng khuôn
// gate 2FA M56 PR2) thay vì rải `if (!isSameOrigin(req))` từng route — V6 trước đây chỉ
// phủ 4/257 route có POST/PATCH/PUT/DELETE.
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// Các method không đổi trạng thái — không cần kiểm same-origin.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Nhóm route KHÔNG dùng cookie phiên nên nằm ngoài mô hình đe doạ CSRF, và chính đáng
// được gọi từ origin khác (hoặc không có Origin):
//   - /api/v1/*        API mở đọc-only, xác thực bằng API key qua header Bearer.
//   - /api/cron/*      cron ngoài, xác thực bằng CRON_SECRET qua header Bearer.
//   - /api/admin/traffic/  proxy tự gọi fire-and-forget bằng token nội bộ.
// Lưu ý: /api/admin/webhooks (CRUD webhook của Admin) KHÔNG nằm trong danh sách này —
// đó là route dùng cookie phiên, phải được kiểm như mọi route mutating khác.
const EXEMPT_PREFIXES = ["/api/v1/", "/api/cron/", "/api/admin/traffic/"] as const;

/** Request này có phải đối tượng cần kiểm same-origin không (dùng ở proxy.ts). */
export function needsSameOriginCheck(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  return !EXEMPT_PREFIXES.some((p) => path.startsWith(p));
}
