// QUALITY-FINAL-1 / S10c — adapter DTO tiền dùng chung cho các route/consumer ngoài IPC
// (hợp đồng/thanh toán/mua sắm/nhà thầu phụ/EVM/báo cáo). Cùng hợp đồng wire với S10a
// (`lib/tai-chinh/paymentcerts.ts`): lib trả MoneyMinor (bigint đồng×100) tới tận biên DTO;
// route đọc header opt-in `X-XBoss-Money-Format: decimal-string-v1` → chuỗi canonical 2 số lẻ +
// `moneyFormat`; không header → JSON number legacy qua `moneyToNumberSafe`, ngoài biên round-trip
// → 422 `money_precision_unsupported` (không clamp/xấp xỉ). Thuần, không chạm DB/HTTP — client
// import được để gửi header và hiển thị.
import {
  MONEY_FORMAT_DECIMAL_V1,
  MONEY_FORMAT_HEADER,
  MoneyInputError,
  decimalFromUnscaled,
  moneyToDecimal,
  moneyToWire,
  mulRatio,
  parseFixedDecimalExact,
  parseMoneyExact,
  parseMoneyInput,
  type MoneyWireFormat,
} from "@/lib/nen/money";

/** Một amount trên wire: chuỗi canonical (v1) hoặc number legacy. */
export type MoneyWire = string | number;

/** Header fetch phía client để chọn decimal-string-v1 (A3-FR06). */
export const HEADER_TIEN_V1: Record<string, string> = {
  [MONEY_FORMAT_HEADER]: MONEY_FORMAT_DECIMAL_V1,
};

/** Header response API tài chính: không cache ở tầng nào + Vary theo định dạng tiền. */
export const HEADERS_API_TIEN: Record<string, string> = {
  "Cache-Control": "private, no-store",
  Vary: MONEY_FORMAT_HEADER,
};

/** Thân lỗi 422 khi định dạng number cũ không biểu diễn đúng một số tiền (route bọc HTTP). */
export const LOI_TIEN_VUOT_DINH_DANG_CU = {
  error:
    "Giá trị tiền vượt độ chính xác của định dạng số cũ — gửi header " +
    `${MONEY_FORMAT_HEADER}: ${MONEY_FORMAT_DECIMAL_V1} để nhận số tiền chính xác`,
  code: "money_precision_unsupported",
} as const;

/** Trường `moneyFormat` chỉ có ở response v1 — legacy không có, client tự nhận ra. */
export function nhanDinhDangTien(format: MoneyWireFormat): {
  moneyFormat?: typeof MONEY_FORMAT_DECIMAL_V1;
} {
  return format === MONEY_FORMAT_DECIMAL_V1 ? { moneyFormat: MONEY_FORMAT_DECIMAL_V1 } : {};
}

/** bigint|null → wire; null (bị che/không có) giữ null, KHÔNG thành 0. */
export function moneyOrNullToWire(v: bigint | null, format: MoneyWireFormat): MoneyWire | null {
  return v == null ? null : moneyToWire(v, format);
}

/** Kiểu đối tượng sau khi đổi các trường tiền `K` sang wire. */
export type MoneyFieldsWire<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: null extends T[P] ? MoneyWire | null : MoneyWire;
};

/**
 * Đổi đúng các trường tiền đã liệt kê (bigint|null) sang wire, các trường khác (ID/đếm/tỷ lệ)
 * giữ nguyên kiểu (A3-AC05). Legacy ngoài biên throw RangeError("money_precision_unsupported").
 */
export function moneyFieldsToWire<T extends object, K extends keyof T>(
  obj: T,
  fields: readonly K[],
  format: MoneyWireFormat,
): MoneyFieldsWire<T, K> {
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const field of fields) {
    const v = obj[field];
    if (v != null && typeof v !== "bigint") {
      throw new TypeError(`moneyFieldsToWire: trường ${String(field)} phải là bigint`);
    }
    out[field as string] = moneyOrNullToWire((v ?? null) as bigint | null, format);
  }
  return out as MoneyFieldsWire<T, K>;
}

/**
 * Bản `::text` của một cột/tổng NUMERIC → wire, không qua parser float; null (bị che/không có)
 * giữ null. Chuỗi không phải thập phân thuần (vd dạng mũ của float8) → throw, không đoán.
 */
export function tienTextToWire(
  text: string | null | undefined,
  format: MoneyWireFormat,
): MoneyWire | null {
  return text == null ? null : moneyToWire(parseMoneyExact(text), format);
}

/**
 * Bản `::text` của một cột NUMERIC có scale riêng (khối lượng NUMERIC(15,3), đơn giá (15,2)…) →
 * wire: v1 = chuỗi canonical đúng `scale` (không quantize, giữ đuôi 0); legacy = JSON number CHỈ
 * khi round-trip đúng, ngoài biên throw RangeError("money_precision_unsupported") (→ 422). Text
 * không đúng scale/sai dạng → throw (không đoán). Dùng chung cho dòng KL IPC (S10a) và VO (S15).
 */
export function thapPhanTextToWire(
  text: string,
  scale: number,
  format: MoneyWireFormat,
): MoneyWire {
  const unscaled = parseFixedDecimalExact(text, scale);
  const canonical = decimalFromUnscaled(unscaled, scale);
  if (format === MONEY_FORMAT_DECIMAL_V1) return canonical;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const n = Number(canonical);
  if (unscaled < -max || unscaled > max || n.toFixed(scale) !== canonical) {
    throw new RangeError("money_precision_unsupported");
  }
  return n;
}

// ===== Phía client (đã opt-in v1 nên mọi amount là chuỗi canonical) =====

/** Chuỗi canonical 2 số lẻ từ API v1 → bigint đồng×100; sai dạng → throw (không đoán). */
export function minorTuWire(v: string): bigint {
  return parseFixedDecimalExact(v, 2);
}

/** Hiển thị đồng nguyên "1.234.567 đ" từ bigint đồng×100 (làm tròn tới đồng, ties xa 0). */
export function fmtDongMinor(minor: bigint): string {
  return `${mulRatio(minor, 1n, 100n).toLocaleString("vi-VN")} đ`;
}

/**
 * Số xấp xỉ CHỈ để vẽ hình học biểu đồ (A3-FR06 cho phép); tooltip/tổng/xuất phải lấy từ
 * giá trị exact, không từ số này.
 */
export function soXapXiChoBieuDo(minor: bigint): number {
  return Number(minor) / 100;
}

/** Số nguyên đã nhân 10^chuSoLe → "1.234,5" (bỏ số 0 thừa cuối, kiểu vi-VN). */
function thapPhanVi(scaled: bigint, chuSoLe: number): string {
  const am = scaled < 0n;
  const abs = am ? -scaled : scaled;
  const mu = 10n ** BigInt(chuSoLe);
  const nguyen = (abs / mu).toLocaleString("vi-VN");
  const le = (abs % mu).toString().padStart(chuSoLe, "0").replace(/0+$/, "");
  return `${am ? "-" : ""}${nguyen}${le ? `,${le}` : ""}`;
}

/**
 * Tiền gọn cho thẻ chỉ số: ≥ 1 tỷ → "1,23 tỷ" (2 số lẻ), ≥ 1 triệu → "5,6 tr" (1 số lẻ), còn lại
 * đồng nguyên — làm tròn bằng bigint (ties xa 0), không qua float như bản number cũ.
 */
export function fmtDongGonMinor(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  if (abs >= 100_000_000_000n) return `${thapPhanVi(mulRatio(minor, 1n, 10n ** 9n), 2)} tỷ`;
  if (abs >= 100_000_000n) return `${thapPhanVi(mulRatio(minor, 1n, 10n ** 7n), 1)} tr`;
  return mulRatio(minor, 1n, 100n).toLocaleString("vi-VN");
}

/** Đồng đầy đủ kiểu vi-VN, giữ xu khi khác 0: 123456789n → "1.234.567,89"; 100n → "1". */
export function fmtDongDayDuMinor(minor: bigint): string {
  return thapPhanVi(minor, 2);
}

/**
 * Giá trị điền sẵn cho ô nhập tiền: số thuần không nhóm hàng nghìn ("1234567", "1234567.5") —
 * đọc lại được đúng bằng bộ parse ô nhập hiện có (bỏ ký tự ngoài [0-9.]); bản "1.234.567" kiểu
 * vi-VN cũ bị đọc thành 1,234 đồng khi người dùng sửa ô.
 */
export function soTienNhapThuan(minor: bigint): string {
  return moneyToDecimal(minor).replace(/\.?0+$/, "");
}

/**
 * S10 (A3 §4) — ô nhập tiền gõ tay → chuỗi canonical 2 số lẻ để GỬI server (server không đoán
 * dấu chấm/phẩy, xem `parseMoneyInput`). Quy tắc vi-VN, có test:
 *   - có dấu phẩy: phẩy là dấu thập phân, dấu chấm (nếu có) phải nhóm đúng 3 chữ số
 *     ("1.234.567,5" → "1234567.50", "1234,5" → "1234.50");
 *   - không phẩy, dấu chấm nhóm đúng 3 chữ số → phân cách nghìn ("1.234.567" → "1234567.00",
 *     "1.500" → "1500.00");
 *   - còn lại một dấu chấm → dấu thập phân ("1234567.5" — dạng `soTienNhapThuan` điền sẵn, không
 *     bao giờ có đúng 3 số lẻ nên không lẫn với nhóm nghìn).
 * Bỏ khoảng trắng và hậu tố "đ"/"₫"/"VND". Rỗng, sai dạng, quá 2 số lẻ hoặc vượt NUMERIC(15,2)
 * → null (UI báo lỗi, không gửi). Dấu "-" đầu được giữ; caller tự chặn số âm nếu cần.
 */
export function chuanHoaTienNhap(s: string): string | null {
  const gon = s.replace(/[\s  ]/g, "").replace(/(đ|₫|vnd)$/i, "");
  const m = /^(-?)(.+)$/.exec(gon);
  if (!m) return null;
  const [, dau, than] = m;
  let thuan: string;
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(than) || /^\d+,\d+$/.test(than)) {
    thuan = than.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(than)) {
    thuan = than.replace(/\./g, "");
  } else if (/^\d+(\.\d+)?$/.test(than)) {
    thuan = than;
  } else {
    return null;
  }
  try {
    return parseMoneyInput(`${dau}${thuan}`).text;
  } catch (err) {
    if (err instanceof MoneyInputError) return null;
    throw err;
  }
}
