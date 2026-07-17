// app/lib/masked.ts — M50 PR2: số học "lan truyền che" cho tổng nhạy cảm tính phía
// client từ các trường ĐÃ bị stripSensitive che thành null.
//
// Vì sao cần: JS ép `Number(null) === 0` và `x + null === x`, nên cộng dồn trực tiếp một
// trường bị che sẽ ra "0 đ"/"0%" — trông như số liệu thật, LỘ SAI thông tin cho người bị
// che quyền (đúng lỗ hổng PR2 cần bịt). Quy tắc ở đây: nếu BẤT KỲ toán hạng nào bị che
// (null/undefined/không hữu hạn) thì kết quả cũng "bị che" (null) → truyền vào MaskedValue
// sẽ hiện "•••" thay vì 0. KHÔNG cộng/nhân tiền ở JS cho mục đích lưu trữ (M45) — đây chỉ
// là gộp để HIỂN THỊ, đầu vào đã là number do SQL tính.

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
