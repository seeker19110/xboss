// Escape ký tự đặc biệt của XML/HTML — dùng chung cho mọi nơi nhúng chuỗi do người
// dùng nhập vào markup: tem QR (HTML in), và các bản vẽ SVG sinh ở lib/ky-thuat/*
// (được render bằng dangerouslySetInnerHTML nên attribute sự kiện chèn vào SẼ chạy).
// Hàm thuần, không chạm DB → đặt ở tầng 0 để mọi miền import xuống được (ADR-0007).
const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeXml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => MAP[c]);
}
