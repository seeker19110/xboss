// Hiển thị số tiền của báo cáo chi phí (GET /api/costs, cost-report-v1). QUALITY-FINAL-1 S11:
// client CHỌN decimal-string-v1 nên tiền về dạng chuỗi canonical exact (không dính 422
// money_precision_unsupported của định dạng number cũ). Số đầy đủ/tỷ lệ tính bằng bigint;
// dạng rút gọn "tỷ/tr" và độ dài thanh tiến độ chỉ là trình bày xấp xỉ, không dùng để tính.
import { mulRatio, parseFixedDecimalExact } from "@/lib/nen/money";

/** Header + giá trị opt-in (A3-FR06) — trùng hằng trong lib/nen/money, ghi rõ ở nơi gọi fetch. */
export const HEADER_DINH_DANG_TIEN = { "X-XBoss-Money-Format": "decimal-string-v1" } as const;

/** Chuỗi tiền canonical 2 số lẻ → "1.234.567 đ" (làm tròn tới đồng bằng bigint, ties xa 0). */
export function tienDayDu(s: string): string {
  return `${mulRatio(parseFixedDecimalExact(s, 2), 1n, 100n).toLocaleString("vi-VN")} đ`;
}

/** Dạng rút gọn cho ô bảng/thẻ KPI: 0 → "—"; ≥ 1 tỷ/1 triệu rút gọn, còn lại đầy đủ exact. */
export function tienRutGon(s: string): string {
  const minor = parseFixedDecimalExact(s, 2);
  if (minor === 0n) return "—";
  const xapXi = Number(s); // chỉ để chọn đơn vị/hiển thị rút gọn
  if (xapXi >= 1_000_000_000) return `${(xapXi / 1_000_000_000).toFixed(2)} tỷ`;
  if (xapXi >= 1_000_000) return `${(xapXi / 1_000_000).toFixed(1)} tr`;
  return tienDayDu(s);
}

/** a/b theo phần trăm nguyên (bigint, ties xa 0); null khi b ≤ 0 — không chia cho 0. */
export function phanTram(a: string, b: string): number | null {
  const mau = parseFixedDecimalExact(b, 2);
  if (mau <= 0n) return null;
  return Number(mulRatio(parseFixedDecimalExact(a, 2), 100n, mau));
}

/** Độ rộng thanh (0–100) — hình học xấp xỉ, không phải số liệu. */
export function doRongThanh(a: string, b: string): number {
  const mau = Number(b);
  if (!(mau > 0)) return 0;
  return Math.max(0, Math.min(100, (Number(a) / mau) * 100));
}
