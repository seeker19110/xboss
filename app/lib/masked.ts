// app/lib/masked.ts — M50 PR2: số học "lan truyền che" cho tổng nhạy cảm tính phía
// client từ các trường ĐÃ bị stripSensitive che thành null.
//
// Vì sao cần: JS ép `Number(null) === 0` và `x + null === x`, nên cộng dồn trực tiếp một
// trường bị che sẽ ra "0 đ"/"0%" — trông như số liệu thật, LỘ SAI thông tin cho người bị
// che quyền (đúng lỗ hổng PR2 cần bịt). Quy tắc ở đây: nếu BẤT KỲ toán hạng nào bị che
// (null/undefined/không hữu hạn) thì kết quả cũng "bị che" (null) → truyền vào MaskedValue
// sẽ hiện "•••" thay vì 0. KHÔNG cộng/nhân tiền ở JS cho mục đích lưu trữ (M45) — đây chỉ
// là gộp để HIỂN THỊ, đầu vào đã là number do SQL tính.

import { sumMoneyProductsExact, thanhTienDongExact } from "@/lib/nen/money";
import { minorTuWire } from "@/lib/nen/money-dto";

type MNum = number | null | undefined;

const isMasked = (v: MNum): boolean => v == null || !Number.isFinite(v);

/** Tổng; null nếu bất kỳ toán hạng nào bị che. */
export function mSum(...vals: MNum[]): number | null {
  let s = 0;
  for (const v of vals) {
    if (isMasked(v)) return null;
    s += v as number;
  }
  return s;
}

/** Tích; null nếu bất kỳ thừa số nào bị che. */
export function mMul(...vals: MNum[]): number | null {
  let p = 1;
  for (const v of vals) {
    if (isMasked(v)) return null;
    p *= v as number;
  }
  return p;
}

/** Hiệu a − b; null nếu a hoặc b bị che. */
export function mSub(a: MNum, b: MNum): number | null {
  return isMasked(a) || isMasked(b) ? null : (a as number) - (b as number);
}

/** Σ term(it) trên mảng; null nếu bất kỳ term nào bị che. */
export function mSumBy<T>(items: T[], term: (it: T) => MNum): number | null {
  let s = 0;
  for (const it of items) {
    const t = term(it);
    if (isMasked(t)) return null;
    s += t as number;
  }
  return s;
}

// ===== S10c — bản exact cho tiền dạng decimal-string-v1 (chuỗi canonical 2 số lẻ) =====
// Cùng quy tắc lan truyền che, nhưng cộng/trừ bằng bigint đồng×100 (không qua float).

type MTien = string | bigint | null | undefined;

const minorOf = (v: MTien): bigint | null =>
  v == null ? null : typeof v === "bigint" ? v : minorTuWire(v);

/** Tổng tiền exact; null nếu bất kỳ toán hạng nào bị che. */
export function mSumTien(...vals: MTien[]): bigint | null {
  let s = 0n;
  for (const v of vals) {
    const m = minorOf(v);
    if (m == null) return null;
    s += m;
  }
  return s;
}

/** Hiệu tiền exact a − b; null nếu a hoặc b bị che. */
export function mSubTien(a: MTien, b: MTien): bigint | null {
  const ma = minorOf(a);
  const mb = minorOf(b);
  return ma == null || mb == null ? null : ma - mb;
}

// ===== Thành tiền IPC exact: khối lượng (chuỗi scale 3) × đơn giá (chuỗi canonical scale 2) =====
// Cùng quy tắc server (ipc-sum-v1: round(Σ qty×đơn giá, 2), không round từng dòng) nên số tạm tính
// trên màn hình khớp TỪNG ĐỒNG với số server ghi. Đơn giá bị che (null) → kết quả bị che.

type DongTich = { quantity: string; unitPrice: string | null | undefined };

/** round(Σ khối lượng × đơn giá, 2) — bigint đồng×100; null nếu bất kỳ đơn giá nào bị che. */
export function mTongTichTien(lines: readonly DongTich[]): bigint | null {
  if (lines.some((l) => l.unitPrice == null)) return null;
  return sumMoneyProductsExact(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice as string })),
    3,
  );
}

/** Thành tiền một dòng tròn tới đồng (khớp PDF `certLineDong`); null nếu đơn giá bị che. */
export function mThanhTienDong(line: DongTich): bigint | null {
  return line.unitPrice == null ? null : thanhTienDongExact(line.quantity, line.unitPrice, 3);
}
