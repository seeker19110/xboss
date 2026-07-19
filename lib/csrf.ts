import type { NextRequest } from "next/server";

// Same-origin check bổ sung cho sameSite:"lax" — chặn thêm 1 lớp cho route mutating
// nhạy cảm nhất. Origin header vắng mặt (một số client cũ/tool nội bộ) → cho qua, dựa
// vào sameSite làm lớp chính; Origin có mặt nhưng khác host hiện tại → chặn.
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
