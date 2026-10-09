// Tiền + khối lượng của chứng từ phát sinh (VO) phía client — S15 (Q-AC04, A3-FR06). Trang chọn
// decimal-string-v1 nên tiền về dạng chuỗi canonical 2 số lẻ, khối lượng chuỗi canonical 3 số lẻ;
// mọi phép nhân/cộng ở đây làm bằng bigint (không float). Tách khỏi VoDocument để test được không
// cần render. null = API che (thiếu viewPayments) → kết quả cũng null ("•••"), không thành 0.
import { mulRatio, parseFixedDecimalExact } from "@/lib/nen/money";
import { minorTuWire } from "@/lib/nen/money-dto";

/** Khối lượng NUMERIC(15,3) của VO: scale 3, đơn vị nhỏ = 1/1000. */
const KL_SCALE = 3;
const KL_MAU = 10n ** BigInt(KL_SCALE);

/** Chuỗi KL canonical từ API ("10.000") → bigint ×1000. */
export function klMilli(s: string): bigint {
  return parseFixedDecimalExact(s, KL_SCALE);
}

/**
 * Ô "KL duyệt" (`<input type="number">`, luôn dùng dấu chấm thập phân) → bigint ×1000, làm tròn
 * tới 3 số lẻ như cột NUMERIC(15,3) khi lưu (ties xa 0). Rỗng/sai dạng/âm → 0 (giống
 * `Number(x) || 0` mà nút quyết định gửi đi). Không dùng `parseQuantityInput`: parser server đó
 * coi "1.500" là nhóm nghìn vi-VN và từ chối, trong khi ô số của trình duyệt hiểu là 1,5.
 */
export function klMilliTuNhap(s: string | undefined): bigint {
  const m = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(s ?? "");
  if (!m || (!m[1] && !m[2])) return 0n;
  const le = m[2] ?? "";
  const unscaled = BigInt((m[1] || "0") + le);
  return mulRatio(unscaled * KL_MAU, 1n, 10n ** BigInt(le.length));
}

/** "10.000" → "10", "1.500" → "1.5" — hiển thị/điền ô nhập gọn như số JS trước đây. */
export function klGon(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Thành tiền 1 dòng làm tròn tới ĐỒNG (ties xa 0) — chỉ hiển thị; tổng không cộng số này. */
export function thanhTienDong(qtyMilli: bigint, unitPrice: string | null): bigint | null {
  if (unitPrice == null) return null;
  return mulRatio(qtyMilli * minorTuWire(unitPrice), 1n, KL_MAU * 100n);
}

/**
 * Tổng giá trị (đồng×100) = ROUND(Σ KL × đơn giá, 2) — cộng tích exact rồi mới làm tròn, đúng
 * quy tắc server tính proposedValue/approvedValue. Một đơn giá bị che → null.
 */
export function tongGiaTriMinor<T extends { unitPrice: string | null }>(
  lines: readonly T[],
  qtyMilliOf: (line: T) => bigint,
): bigint | null {
  let sum = 0n;
  for (const line of lines) {
    if (line.unitPrice == null) return null;
    sum += qtyMilliOf(line) * minorTuWire(line.unitPrice);
  }
  return mulRatio(sum, 1n, KL_MAU);
}

/** Tiền đồng×100 (chuỗi canonical hoặc bigint) → "1.234.567 đ"; đúng 0 → "—" như bản cũ. */
export function fmtVND(v: string | bigint): string {
  const minor = typeof v === "bigint" ? v : minorTuWire(v);
  return fmtDong(mulRatio(minor, 1n, 100n));
}

/** Đồng nguyên (bigint) → "1.234.567 đ"; 0 → "—". */
export function fmtDong(dong: bigint): string {
  return dong === 0n ? "—" : `${dong.toLocaleString("vi-VN")} đ`;
}

/** Bản chữ thuần (hộp xác nhận) — bị che hiện "•••" như MaskedValue. */
export function fmtVNDText(v: string | bigint | null): string {
  return v == null ? "•••" : fmtVND(v);
}
