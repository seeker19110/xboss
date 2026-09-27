import { createHmac } from "node:crypto";

// Token nội bộ giữa proxy và endpoint /api/admin/traffic/ingest (cùng Node runtime).
// Endpoint không thể tự kiểm "loopback", nên gắn header bí mật để
// chặn POST giả từ bên ngoài bơm dữ liệu rác vào ring buffer traffic.
export const TRAFFIC_TOKEN_HEADER = "x-traffic-token";

export function trafficToken(): string {
  let secret = process.env.XBOSS_SECRET;
  if (!secret?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("XBOSS_SECRET bắt buộc trong production để xác thực traffic nội bộ");
    }
    secret = "xboss-dev-secret-change-me";
  }
  // Tách mục đích khỏi chữ ký phiên; tuyệt đối không gửi khóa ký gốc qua HTTP.
  return createHmac("sha256", secret).update("xboss:traffic-ingest:v1").digest("hex");
}
