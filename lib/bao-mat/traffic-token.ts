// Token nội bộ giữa proxy (Edge runtime) và endpoint /api/admin/traffic/ingest
// (Node runtime). Endpoint không thể tự kiểm "loopback", nên gắn header bí mật để
// chặn POST giả từ bên ngoài bơm dữ liệu rác vào ring buffer traffic.
// Module thuần (không dùng API Node) để import được trong Edge runtime của proxy.
export const TRAFFIC_TOKEN_HEADER = "x-traffic-token";

export function trafficToken(): string {
  // Dùng lại XBOSS_SECRET (bắt buộc trong production); fallback dev khớp với lib/auth.
  return process.env.XBOSS_SECRET ?? "xboss-dev-secret-change-me";
}
