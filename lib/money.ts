// lib/money.ts — Số học tiền tệ chính xác (M45 PR1).
//
// Quy ước XBoss (xem CLAUDE.md mục Quy ước):
//   - MỌI phép cộng/nhân tiền phải làm trong SQL (`SUM`, `* rate`); JS chỉ hiển thị.
//   - Khi buộc phải tính tiếp ở JS, cast cột NUMERIC sang `::text` trong SELECT rồi
//     đưa qua `parseMoney` để tránh cộng dồn trên float (parser oid 1700 dùng
//     `parseFloat` — xem `lib/db/index.ts`).
//
// Đơn vị nội bộ: **bigint số nguyên đơn vị nhỏ = đồng × 100** (giữ 2 chữ số thập
// phân cho phép tính tỷ lệ VAT/tạm ứng/giữ lại). Hiển thị luôn quy về đồng nguyên.

/** Làm tròn half-up theo độ lớn (âm/dương đối xứng) một số JS về bigint. */
function roundHalfUpNum(n: number): bigint {
  if (!Number.isFinite(n)) throw new Error(`money: giá trị không hữu hạn: ${n}`);
  const sign = n < 0 ? -1n : 1n;
  return sign * BigInt(Math.floor(Math.abs(n) + 0.5));
}

/** Chia bigint half-up theo độ lớn. */
function divRoundHalfUp(a: bigint, b: bigint): bigint {
  const sign = (a < 0n ? -1n : 1n) * (b < 0n ? -1n : 1n);
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  return sign * ((aa * 2n + bb) / (bb * 2n));
}

/**
 * Chuỗi/số tiền → bigint đơn vị nhỏ (đồng×100). "1234.56" → 123456n.
 * Làm tròn half-up ở chữ số thập phân thứ 3 trở đi. Chuỗi được phân tích chính
 * xác (không qua float); số JS được nhân 100 rồi làm tròn.
 */
export function parseMoney(v: string | number): bigint {
  if (typeof v === "number") return roundHalfUpNum(v * 100);
  const s = v.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`parseMoney: chuỗi số không hợp lệ: "${v}"`);
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [intPart, fracPart = ""] = abs.split(".");
  const frac2 = (fracPart + "00").slice(0, 2);
  let minor = BigInt(intPart) * 100n + BigInt(frac2);
  // Half-up theo chữ số thập phân thứ 3.
  if (fracPart.length > 2 && fracPart[2] >= "5") minor += 1n;
  return neg ? -minor : minor;
}

/** Cộng nhiều giá trị tiền (đơn vị nhỏ). */
export function addMoney(...vs: bigint[]): bigint {
  return vs.reduce((s, v) => s + v, 0n);
}

/**
 * Nhân tiền với một hệ số (vd 0.1 = 10%). Trả về đơn vị nhỏ, làm tròn half-up.
 * Dùng cho VAT/tạm ứng/giữ lại khi không thể làm trong SQL.
 */
export function mulRate(v: bigint, rate: number): bigint {
  if (!Number.isFinite(rate)) throw new Error(`mulRate: hệ số không hợp lệ: ${rate}`);
  return roundHalfUpNum(Number(v) * rate);
}

/** bigint đơn vị nhỏ → number đồng (2 chữ số thập phân) để ghi DB/JSON. */
export function moneyToNumber(v: bigint): number {
  return Number(v) / 100;
}

/**
 * Định dạng hiển thị đồng Việt Nam. bigint = đơn vị nhỏ (đồng×100); number/chuỗi
 * = giá trị đồng (từ cột NUMERIC). Luôn quy về đồng nguyên, cách nhóm bằng dấu ".".
 */
export function formatVnd(v: bigint | string | number): string {
  const dong = typeof v === "bigint" ? divRoundHalfUp(v, 100n) : roundHalfUpNum(Number(v));
  const digits = (dong < 0n ? -dong : dong).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${dong < 0n ? "-" : ""}${digits} ₫`;
}
