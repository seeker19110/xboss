// Hiển thị số liệu GET /api/costs ở client — tách khỏi page để test được không cần render.
// QUALITY-FINAL-1 S10 (chi phí): client CHỌN decimal-string-v1 nên mọi số tiền về dạng chuỗi
// canonical exact; định dạng/tỷ lệ tính bằng bigint, không qua float (A3-FR06).
import {
  MONEY_FORMAT_DECIMAL_V1,
  MONEY_FORMAT_HEADER,
  decimalFromUnscaled,
  mulRatio,
  parseMoneyExact,
} from "@/lib/nen/money";

/** Header opt-in định dạng tiền cho mọi fetch /api/costs. */
export const HEADER_TIEN_CHI_PHI = { [MONEY_FORMAT_HEADER]: MONEY_FORMAT_DECIMAL_V1 } as const;

/** Một nhóm chi phí, tiền là chuỗi canonical 2 số lẻ. */
export type CostAmountsView = { budget: string; committed: string; actual: string };

const MOT_TY_MINOR = 10n ** 11n; // 1 tỷ đồng × 100
const MOT_TRIEU_MINOR = 10n ** 8n; // 1 triệu đồng × 100

/**
 * Rút gọn kiểu "1.23 tỷ" / "4.5 tr" / "123.456 đ" như fmtVND cũ nhưng làm tròn bằng bigint
 * (ties xa 0). Đúng 0 → "—". Chỉ hiển thị — giá trị đầy đủ xem `fmtTienDayDu`.
 */
export function fmtTienRutGon(s: string): string {
  const minor = parseMoneyExact(s);
  if (minor === 0n) return "—";
  const abs = minor < 0n ? -minor : minor;
  // 0,01 tỷ = 10^9 đồng×100; 0,1 triệu = 10^7 đồng×100.
  if (abs >= MOT_TY_MINOR) return `${decimalFromUnscaled(mulRatio(minor, 1n, 10n ** 9n), 2)} tỷ`;
  if (abs >= MOT_TRIEU_MINOR) return `${decimalFromUnscaled(mulRatio(minor, 1n, 10n ** 7n), 1)} tr`;
  return fmtTienDayDu(s);
}

/** Đầy đủ kiểu vi-VN "1.234.567,89 đ" (bỏ ",00"), không qua Number. */
export function fmtTienDayDu(s: string): string {
  const minor = parseMoneyExact(s);
  const am = minor < 0n;
  const abs = am ? -minor : minor;
  const xu = abs % 100n;
  const dong = (abs / 100n).toLocaleString("vi-VN");
  return `${am ? "-" : ""}${dong}${xu === 0n ? "" : `,${xu.toString().padStart(2, "0")}`} đ`;
}

/**
 * committed/budget theo % để HIỂN THỊ (2 số lẻ, chặt cụt) — chia bigint rồi mới đổi number.
 * Ngân sách ≤ 0 → null ("chưa có ngân sách"), không Infinity/0% giả.
 */
export function phanTramSuDung(tuSo: string, mauSo: string): number | null {
  const b = parseMoneyExact(mauSo);
  if (b <= 0n) return null;
  return Number((parseMoneyExact(tuSo) * 10000n) / b) / 100;
}
