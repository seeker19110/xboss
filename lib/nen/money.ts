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

// QUALITY-FINAL-1 / S09: đường exact mới. Chưa thay các caller legacy ở S10;
// không đổi kiểu JSON, parser DB hoặc quy tắc làm tròn chứng từ trong slice này.

/** Phân tích amount thập phân, không nhận number/locale/exponent hoặc khoảng trắng. */
export function parseMoneyExact(decimal: string): bigint {
  if (typeof decimal !== "string" || !/^-?\d+(\.\d+)?$/.test(decimal)) {
    // Không đưa giá trị đầu vào (có thể là dữ liệu thương mại) vào thông báo lỗi.
    throw new TypeError("parseMoneyExact: cần chuỗi thập phân hợp lệ");
  }
  return parseMoney(decimal);
}

/** bigint đồng×100 → chuỗi canonical đúng hai chữ số lẻ, kể cả 0 và số âm. */
export function moneyToDecimal(minor: bigint): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${absolute / 100n}.${cents}`;
}

/** Nhân tỷ lệ hữu tỉ exact; ties-away-from-zero, không đổi bigint qua number. */
export function mulRatio(minor: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("mulRatio: mẫu số phải khác 0");
  return divRoundHalfUp(minor * numerator, denominator);
}

/**
 * Hiển thị đồng nguyên không mất chữ số lớn. Chuỗi được làm tròn thẳng tới đồng,
 * không qua cents trước (1.499 không được làm tròn hai lần thành 2 đồng).
 */
export function formatVndExact(value: bigint | string): string {
  if (typeof value === "bigint") return formatVnd(value);
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) {
    throw new TypeError("formatVndExact: cần bigint hoặc chuỗi thập phân hợp lệ");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const rounded = BigInt(whole) + (fraction.length > 0 && fraction[0] >= "5" ? 1n : 0n);
  return formatVnd((negative ? -rounded : rounded) * 100n);
}

/** Adapter opt-in cho caller legacy; từ chối khi JSON number không round-trip đúng minor. */
export function moneyToNumberSafe(minor: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (minor < -max || minor > max) {
    throw new RangeError("money_precision_unsupported");
  }
  const result = Number(minor) / 100;
  if (parseMoneyExact(String(result)) !== minor) {
    throw new RangeError("money_precision_unsupported");
  }
  return result;
}

/**
 * Validator wire canonical (A3-FR01), tách khỏi parser: true khi `value` là chuỗi đúng
 * `scale` chữ số lẻ, không số 0 thừa ở đầu, không `+`/`-0`/locale/exponent/NaN/Infinity.
 * Không throw với dữ liệu sai để API trả 422 rõ ràng; scale sai là lỗi lập trình nên throw.
 */
export function isCanonicalDecimal(value: unknown, scale: number): value is string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new RangeError("decimal_scale_unsupported");
  }
  if (typeof value !== "string" || value.length > 1024) return false;
  const pattern =
    scale === 0 ? /^-?(0|[1-9]\d*)$/ : new RegExp(`^-?(0|[1-9]\\d*)\\.\\d{${scale}}$`);
  if (!pattern.test(value)) return false;
  // "-0", "-0.00": số 0 chỉ có một dạng canonical.
  return !/^-0(\.0*)?$/.test(value);
}

/**
 * Đọc wire decimal canonical mà KHÔNG quantize. Quantity/rate có scale riêng,
 * không đưa qua parseMoneyExact. Giới hạn cột DB kiểm riêng bằng `fitsNumeric`.
 */
export function parseFixedDecimalExact(decimal: string, scale: number): bigint {
  if (!isCanonicalDecimal(decimal, scale)) throw new TypeError("decimal_wire_invalid");
  return BigInt(decimal.replace(".", ""));
}

/**
 * Giá trị `unscaled` đã ở đúng scale s của cột (vd đồng×100 cho NUMERIC(15,2)) có vừa
 * NUMERIC(precision, s) không: |unscaled| < 10^precision — cùng luật tràn của PostgreSQL. Dùng
 * để API trả 422 trước khi ghi, không lén nới cột hay ép float (A3-FR02).
 */
export function fitsNumeric(unscaled: bigint, precision: number): boolean {
  if (!Number.isInteger(precision) || precision < 1 || precision > 1000) {
    throw new RangeError("numeric_precision_unsupported");
  }
  const limit = 10n ** BigInt(precision);
  return unscaled > -limit && unscaled < limit;
}

/**
 * SUM(quantity × unitPrice) rồi mới round tổng: nền ipc-sum-v1, không round từng dòng.
 * Unit price có scale 2; quantity mặc định scale 3 (BOQ/IPC), không qua số thực.
 * Mảng rỗng là tổng 0. Caller phải phân biệt dữ liệu chưa tải/null với mảng rỗng thật.
 */
export function sumMoneyProductsExact(
  lines: readonly { quantity: string; unitPrice: string }[],
  quantityScale = 3,
): bigint {
  // Kiểm scale kể cả khi không có dòng, tránh cấu hình sai bị che bởi tổng 0.
  if (!Number.isInteger(quantityScale) || quantityScale < 0 || quantityScale > 18) {
    throw new RangeError("decimal_scale_unsupported");
  }
  if (!Array.isArray(lines)) throw new TypeError("money_lines_invalid");
  let sum = 0n;
  for (const line of lines) {
    if (line === null || typeof line !== "object") throw new TypeError("money_lines_invalid");
    const quantity = parseFixedDecimalExact(line.quantity, quantityScale);
    const price = parseFixedDecimalExact(line.unitPrice, 2);
    sum += quantity * price;
  }
  return mulRatio(sum, 1n, 10n ** BigInt(quantityScale));
}

/** Một dòng IPC ở dạng wire exact: qty_period NUMERIC(15,3), unit_price NUMERIC(15,2). */
export type IpcLineV1 = { qtyPeriod: string; unitPrice: string };

/** Tỷ lệ hợp đồng dạng phần trăm NUMERIC(5,2) canonical, vd "10.25" = 1025/10000. */
export type IpcRatesV1 = { advancePct: string; retentionPct: string };

/** Kết quả ipc-sum-v1, mọi khoản là bigint đồng×100. */
export type IpcTotalsV1 = {
  periodValue: bigint;
  advanceDeduct: bigint;
  retentionDeduct: bigint;
  approvedValue: bigint;
};

const IPC_QTY_SCALE = 3;
/** Phần trăm scale 2 → tỷ lệ: 10.25% = 1025 / 10000. */
const PERCENT_SCALE2_DENOMINATOR = 10000n;

/**
 * Quy tắc chứng từ ipc-sum-v1 (A3-FR05): periodValue = round(SUM(qty × đơn giá), 2) — KHÔNG
 * round từng dòng; tạm ứng/giữ lại = round(periodValue × rate, 2) từng khoản (ties xa 0);
 * approvedValue = periodValue − tạm ứng − giữ lại, exact. Không kiểm khoảng nghiệp vụ của
 * rate (0–100%): đó là việc của API hợp đồng, helper chỉ thi hành đúng công thức.
 */
export function ipcSumV1(lines: readonly IpcLineV1[], rates: IpcRatesV1): IpcTotalsV1 {
  if (!Array.isArray(lines)) throw new TypeError("money_lines_invalid");
  if (rates === null || typeof rates !== "object") throw new TypeError("ipc_rates_invalid");
  const advanceRate = parseFixedDecimalExact(rates.advancePct, 2);
  const retentionRate = parseFixedDecimalExact(rates.retentionPct, 2);
  const products = lines.map((line) => {
    if (line === null || typeof line !== "object") throw new TypeError("money_lines_invalid");
    return { quantity: line.qtyPeriod, unitPrice: line.unitPrice };
  });
  const periodValue = sumMoneyProductsExact(products, IPC_QTY_SCALE);
  const advanceDeduct = mulRatio(periodValue, advanceRate, PERCENT_SCALE2_DENOMINATOR);
  const retentionDeduct = mulRatio(periodValue, retentionRate, PERCENT_SCALE2_DENOMINATOR);
  return {
    periodValue,
    advanceDeduct,
    retentionDeduct,
    approvedValue: periodValue - advanceDeduct - retentionDeduct,
  };
}

/** So sánh exact phục vụ sort/filter; chuỗi phải canonical amount scale 2. */
export function compareMoneyExact(a: bigint | string, b: bigint | string): -1 | 0 | 1 {
  const left = typeof a === "bigint" ? a : parseFixedDecimalExact(a, 2);
  const right = typeof b === "bigint" ? b : parseFixedDecimalExact(b, 2);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Nghịch đảo của `parseFixedDecimalExact`: số nguyên đã nhân 10^scale → chuỗi canonical đúng
 * `scale` chữ số lẻ (scale 2 cho cùng kết quả `moneyToDecimal`). Không qua number.
 */
export function decimalFromUnscaled(unscaled: bigint, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new RangeError("decimal_scale_unsupported");
  }
  const negative = unscaled < 0n;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? "" : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

// A3-FR06 — định dạng tiền trên wire do client CHỌN THAM GIA (opt-in) qua header. Không gửi
// header = giữ JSON number legacy (chỉ trong biên round-trip an toàn, ngoài biên báo lỗi).

/** Tên header opt-in định dạng tiền. */
export const MONEY_FORMAT_HEADER = "X-XBoss-Money-Format";
/** Giá trị header duy nhất được hỗ trợ: tiền là chuỗi canonical đúng 2 chữ số lẻ. */
export const MONEY_FORMAT_DECIMAL_V1 = "decimal-string-v1";
export type MoneyWireFormat = typeof MONEY_FORMAT_DECIMAL_V1 | "legacy-number";

/**
 * Đọc giá trị header thành định dạng wire. Chỉ đúng `decimal-string-v1` (bỏ khoảng trắng hai
 * đầu) mới opt-in; thiếu/giá trị lạ = legacy — response legacy KHÔNG có `moneyFormat`, nên
 * client yêu cầu định dạng chưa hỗ trợ tự nhận ra mình không được phục vụ định dạng đó.
 */
export function moneyWireFormat(header: string | null | undefined): MoneyWireFormat {
  return header?.trim() === MONEY_FORMAT_DECIMAL_V1 ? MONEY_FORMAT_DECIMAL_V1 : "legacy-number";
}

/**
 * Một amount (đồng×100) ra wire: chuỗi canonical (v1) hoặc number legacy qua
 * `moneyToNumberSafe` — ngoài biên round-trip throw RangeError("money_precision_unsupported"),
 * không clamp/xấp xỉ. Bắt lỗi đó bằng `isMoneyPrecisionError`.
 */
export function moneyToWire(minor: bigint, format: MoneyWireFormat): string | number {
  return format === MONEY_FORMAT_DECIMAL_V1 ? moneyToDecimal(minor) : moneyToNumberSafe(minor);
}

/** Lỗi do adapter legacy không biểu diễn đúng amount bằng JSON number (→ HTTP 422). */
export function isMoneyPrecisionError(err: unknown): boolean {
  return err instanceof RangeError && err.message === "money_precision_unsupported";
}

// ===== QUALITY-FINAL-1 / S10 — ĐẦU VÀO tiền phía server (A3-FR01/FR02) =====
// Một parser duy nhất cho mọi body JSON ghi tiền, thay `Number(body.x)`/`parseFloat` — bản cũ đọc
// "1.500" kiểu vi-VN thành 1,5 đồng và để giá trị vượt cột thành lỗi tràn 500 của Postgres.

/** Mã lỗi nhập tiền. 400 = sai dạng; 422 = đúng dạng nhưng vượt cột / không giữ được chính xác. */
export type MoneyInputErrorCode =
  | "amount_invalid"
  | "amount_locale_format"
  | "amount_scale"
  | "amount_overflow"
  | "amount_precision_unsupported";

/**
 * Lỗi đọc một số tiền nhập. Thông điệp tiếng Việt KHÔNG chứa giá trị nhập (dữ liệu thương mại);
 * route đổi sang `{ error, code }` + mã HTTP qua `moneyInputErrorBody`.
 */
export class MoneyInputError extends Error {
  readonly status: 400 | 422;
  readonly code: MoneyInputErrorCode;
  constructor(code: MoneyInputErrorCode, message: string) {
    super(message);
    this.name = "MoneyInputError";
    this.code = code;
    this.status = code === "amount_overflow" || code === "amount_precision_unsupported" ? 422 : 400;
  }
}

/** Thân + mã HTTP khi `err` là lỗi nhập tiền; lỗi khác → null (route ném tiếp). */
export function moneyInputErrorBody(
  err: unknown,
): { status: 400 | 422; body: { error: string; code: MoneyInputErrorCode } } | null {
  if (!(err instanceof MoneyInputError)) return null;
  return { status: err.status, body: { error: err.message, code: err.code } };
}

export type MoneyInputOptions = {
  /** Tên trường trong thông điệp lỗi, vd "Giá trị hợp đồng". Mặc định "Số tiền". */
  label?: string;
  /** NUMERIC(precision, scale) của cột đích — mặc định (15,2) như mọi cột tiền chính. */
  precision?: number;
  scale?: number;
};

/** Số nguyên đã nhân 10^scale + chuỗi canonical đúng `scale` chữ số lẻ (ghi thẳng vào DB). */
export type MoneyInput = { unscaled: bigint; text: string };

/** "1.234" / "1.234.567" — dấu chấm phân cách hàng nghìn kiểu vi-VN. */
const NHOM_NGHIN_VI = /^-?\d{1,3}(\.\d{3})+$/;
const THAP_PHAN_NHAP = /^(-?)(\d+)(?:\.(\d+))?$/;

function thongDiepNhapTien(
  code: MoneyInputErrorCode,
  label: string,
  precision: number,
  scale: number,
): string {
  switch (code) {
    case "amount_invalid":
      return `${label} không hợp lệ — nhập số thuần, vd 1234567 hoặc 1234567.5`;
    case "amount_locale_format":
      return (
        `${label} không được dùng dấu chấm phân cách hàng nghìn hay dấu phẩy thập phân ` +
        `(vd "1.234.567", "1234,5") — gửi số thuần, vd 1234567 hoặc 1234567.5`
      );
    case "amount_scale":
      return `${label} chỉ được tối đa ${scale} chữ số thập phân`;
    case "amount_overflow":
      return `${label} vượt giới hạn lưu trữ (tối đa ${precision - scale} chữ số phần nguyên)`;
    case "amount_precision_unsupported":
      return `${label} có quá nhiều chữ số để gửi dạng số — gửi dạng chuỗi thập phân`;
  }
}

/**
 * Đọc một số tiền từ body JSON — không qua float khi input là chuỗi.
 *
 * Nhận: JSON number hữu hạn, hoặc chuỗi thập phân thuần ("1234567", "1234567.5", "-1500.25";
 * bỏ khoảng trắng hai đầu). Chữ số lẻ vượt `scale` được bỏ nếu toàn là 0.
 * Từ chối 400: chuỗi có dấu phẩy, nhiều dấu chấm, hoặc đúng dạng nhóm nghìn vi-VN khi scale < 3
 * ("1.500" mơ hồ giữa 1.500 đồng và 1,5 đồng — KHÔNG đoán); số mũ; NaN/Infinity; kiểu khác;
 * quá `scale` chữ số lẻ khác 0. Từ chối 422: vượt NUMERIC(precision, scale) (`fitsNumeric`).
 *
 * JSON number: `String(n)` là biểu diễn ngắn nhất round-trip của double — trùng chuỗi người
 * dùng gõ khi có ≤ 15 chữ số có nghĩa (mọi giá trị vừa NUMERIC(15,2)). Number cần > 15 chữ số
 * có nghĩa (cột precision lớn hơn) không đảm bảo exact → 422, client phải gửi chuỗi.
 * Không kiểm dấu/khoảng nghiệp vụ (> 0, ≥ 0) — việc của caller.
 */
export function parseMoneyInput(value: unknown, opts: MoneyInputOptions = {}): MoneyInput {
  const label = opts.label ?? "Số tiền";
  const precision = opts.precision ?? 15;
  const scale = opts.scale ?? 2;
  if (!Number.isInteger(scale) || scale < 0 || scale > 18 || scale > precision) {
    throw new RangeError("decimal_scale_unsupported");
  }
  const loi = (code: MoneyInputErrorCode) =>
    new MoneyInputError(code, thongDiepNhapTien(code, label, precision, scale));

  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw loi("amount_invalid");
    raw = String(value);
    // Dạng mũ chỉ có khi |n| ≥ 1e21 (chắc chắn tràn) hoặc |n| < 1e-6 (quá số lẻ).
    if (/e/i.test(raw)) throw loi(Math.abs(value) >= 1 ? "amount_overflow" : "amount_scale");
  } else if (typeof value === "string") {
    raw = value.trim();
    if (raw.includes(",") || raw.indexOf(".") !== raw.lastIndexOf(".")) {
      throw loi("amount_locale_format");
    }
    if (scale < 3 && NHOM_NGHIN_VI.test(raw)) throw loi("amount_locale_format");
  } else {
    throw loi("amount_invalid");
  }

  const m = THAP_PHAN_NHAP.exec(raw);
  if (!m) throw loi("amount_invalid");
  const [, dau, nguyen, le = ""] = m;
  if (/[1-9]/.test(le.slice(scale))) throw loi("amount_scale");
  const tuyetDoi = BigInt(nguyen + le.slice(0, scale).padEnd(scale, "0"));
  const unscaled = dau ? -tuyetDoi : tuyetDoi; // "-0" → 0n
  if (!fitsNumeric(unscaled, precision)) throw loi("amount_overflow");
  if (typeof value === "number") {
    const coNghia = (nguyen + le).replace(/^0+/, "").replace(/0+$/, "");
    if (coNghia.length > 15) throw loi("amount_precision_unsupported");
  }
  return { unscaled, text: decimalFromUnscaled(unscaled, scale) };
}

/** Như `parseMoneyInput` nhưng rỗng (undefined/null/"") → null — cho trường tiền tuỳ chọn. */
export function parseOptionalMoneyInput(
  value: unknown,
  opts: MoneyInputOptions = {},
): MoneyInput | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return parseMoneyInput(value, opts);
}

// ===== S10 — ĐẦU VÀO khối lượng (NUMERIC(15,3), không phải tiền) =====

export type QuantityInputErrorCode =
  "quantity_invalid" | "quantity_locale_format" | "quantity_scale" | "quantity_overflow";

/** Lỗi đọc khối lượng nhập: 400 = sai dạng/quá số lẻ/âm; 422 = vượt NUMERIC(15,3) (≥ 10^12). */
export class QuantityInputError extends Error {
  readonly status: 400 | 422;
  readonly code: QuantityInputErrorCode;
  constructor(code: QuantityInputErrorCode, message: string) {
    super(message);
    this.name = "QuantityInputError";
    this.code = code;
    this.status = code === "quantity_overflow" ? 422 : 400;
  }
}

/** Thân + mã HTTP khi `err` là lỗi nhập khối lượng; lỗi khác → null (route ném tiếp). */
export function quantityInputErrorBody(
  err: unknown,
): { status: 400 | 422; body: { error: string; code: QuantityInputErrorCode } } | null {
  if (!(err instanceof QuantityInputError)) return null;
  return { status: err.status, body: { error: err.message, code: err.code } };
}

/** Tuỳ chọn cột khối lượng: mặc định NUMERIC(15,3) của bill (3 số lẻ, 12 chữ số nguyên, giữ đuôi 0). */
export type QuantityInputOptions = {
  /** Số chữ số thập phân tối đa (mặc định 3). */
  scale?: number;
  /** Số chữ số phần nguyên tối đa (mặc định 12). */
  maxIntDigits?: number;
  /** Cắt số 0 thừa ở đuôi phần lẻ ("1.500000" → "1.5", "2.0" → "2") — dạng canonical PO/PR. */
  trimZeros?: boolean;
};

/**
 * Đọc khối lượng tuỳ chọn cho cột NUMERIC(15,3): rỗng (undefined/null/"") → null; trả chuỗi
 * canonical 3 số lẻ, không qua float. Cùng luật chuỗi với `parseMoneyInput`: dấu phẩy, nhiều dấu
 * chấm và dạng nhóm nghìn vi-VN ("1.500" — mơ hồ 1500 hay 1,5) → 400 `quantity_locale_format`;
 * sai dạng/NaN/âm/exponent → 400 `quantity_invalid`; quá số lẻ → 400 `quantity_scale`; vượt cột →
 * 422 `quantity_overflow`. `opts` đổi scale/số chữ số nguyên (vd khối lượng PO: 6 lẻ, 18 nguyên,
 * cắt đuôi 0 — DATA-MIGRATIONS §6); mặc định giữ nguyên hành vi bill.
 */
export function parseQuantityInput(
  value: unknown,
  label = "Khối lượng",
  opts: QuantityInputOptions = {},
): string | null {
  const scale = opts.scale ?? 3;
  const maxIntDigits = opts.maxIntDigits ?? 12;
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const loi = (code: QuantityInputErrorCode, msg: string) => new QuantityInputError(code, msg);
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw loi("quantity_invalid", `${label} không hợp lệ`);
    raw = String(value);
    if (/e/i.test(raw)) {
      throw Math.abs(value) >= 1
        ? loi("quantity_overflow", `${label} vượt giới hạn lưu trữ`)
        : loi("quantity_scale", `${label} chỉ được tối đa ${scale} chữ số thập phân`);
    }
  } else if (typeof value === "string") {
    raw = value.trim();
    // Phần nguyên "0" ("0.125") không thể là nhóm nghìn → thập phân hợp lệ, không báo mơ hồ.
    const nhomNghin = NHOM_NGHIN_VI.test(raw) && !/^0\./.test(raw);
    if (raw.includes(",") || raw.indexOf(".") !== raw.lastIndexOf(".") || nhomNghin) {
      throw loi(
        "quantity_locale_format",
        `${label} không được dùng dấu phẩy hay dấu chấm nhóm nghìn — gửi số thuần, vd 1234.5`,
      );
    }
  } else {
    throw loi("quantity_invalid", `${label} không hợp lệ`);
  }
  const m = THAP_PHAN_NHAP.exec(raw);
  if (!m) throw loi("quantity_invalid", `${label} không hợp lệ — nhập số thuần, vd 12.5`);
  const [, dau, nguyen, le = ""] = m;
  if (/[1-9]/.test(le.slice(scale))) {
    throw loi("quantity_scale", `${label} chỉ được tối đa ${scale} chữ số thập phân`);
  }
  const unscaled = BigInt(nguyen + le.slice(0, scale).padEnd(scale, "0"));
  if (dau && unscaled !== 0n) throw loi("quantity_invalid", `${label} phải ≥ 0`);
  if (!fitsNumeric(unscaled, maxIntDigits + scale)) {
    throw loi(
      "quantity_overflow",
      `${label} vượt giới hạn lưu trữ (tối đa ${maxIntDigits} chữ số phần nguyên)`,
    );
  }
  const text = decimalFromUnscaled(unscaled, scale);
  return opts.trimZeros && text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
