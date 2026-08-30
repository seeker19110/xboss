import crypto from "node:crypto";

/**
 * USER ERROR HEALER — BỘ ĐỘNG CƠ TỰ CHỮA LÀNH LỖI NGƯỜI DÙNG ĐẲNG CẤP THƯỢNG THỪA
 *
 * Module này cung cấp các giải thuật tự động phát hiện, chuẩn hóa, bù đắp và chữa lành
 * mọi dạng lỗi sai phổ biến từ phía người dùng (kỹ sư hiện trường, thầu phụ, QS, PM, CĐT)
 * trên toàn bộ nền tảng XBoss.
 */

// ============================================================================
// 1. CHUYỂN ĐỔI BẢNG MÃ TIẾNG VIỆT & DỌN DẸP KÝ TỰ RÁC (ENCODING & CLEANING)
// ============================================================================

const TCVN3_SPECIFIC_MAP: Record<string, string> = {
  "\xB8": "á",
  "\xB5": "à",
  "\xB6": "ả",
  "\xB7": "ã",
  "\xB9": "ạ",
  "\xCA": "ă",
  "\xBE": "ắ",
  "\xBB": "ằ",
  "\xBC": "ẳ",
  "\xBD": "ẵ",
  "\xC6": "ặ",
  "\xC9": "â",
  "\xC5": "ấ",
  "\xC1": "ầ",
  "\xC2": "ẩ",
  "\xC3": "ẫ",
  "\xC4": "ậ",
  "\xD0": "é",
  "\xCD": "è",
  "\xCE": "ẻ",
  "\xCF": "ẽ",
  "\xD1": "ẹ",
  "\xEE": "ê",
  "\xEA": "ế",
  "\xE5": "ề",
  "\xE6": "ể",
  "\xE7": "ễ",
  "\xF3": "í",
  "\xEF": "ì",
  "\xF1": "ỉ",
  "\xF2": "ĩ",
  "\xF4": "ị",
  "\xF8": "ó",
  "\xF5": "ò",
  "\xF6": "ỏ",
  "\xF7": "õ",
  "\xF9": "ọ",
  "\xFD": "ô",
  "\xFA": "ố",
  "\xFB": "ồ",
  "\xFC": "ổ",
  "\xFE": "ỗ",
  "\xDA": "ộ",
  "\xAE": "ơ",
  "\xAA": "ớ",
  "\xA7": "ờ",
  "\xA8": "ở",
  "\xA9": "ỡ",
  "\xAB": "ợ",
  "\xDF": "ú",
  "\xD9": "ù",
  "\xDB": "ủ",
  "\xDC": "ũ",
  "\xF0": "ý",
  "\xEB": "ỳ",
  "\xEC": "ỷ",
  "\xED": "ỹ",
  "\xA4": "đ",
  "\xA1": "Ă",
  "\xA2": "Â",
  "\xA3": "Đ",
  "\xA5": "Ê",
  "\xA6": "Ô",
  "\xAC": "Ơ",
  "\xAD": "Ư",
};

const VNI_SPECIFIC_MAP: Record<string, string> = {
  aù: "á",
  aú: "á",
  aø: "à",
  aû: "ả",
  aõ: "ã",
  aï: "ạ",
  aê: "ă",
  aé: "ắ",
  aè: "ằ",
  aẳ: "ẳ",
  aẵ: "ẵ",
  aë: "ặ",
  aâ: "â",
  eù: "é",
  eú: "é",
  eø: "è",
  eû: "ẻ",
  eõ: "ẽ",
  eï: "ẹ",
  eâ: "ê",
  où: "ó",
  oø: "ò",
  oû: "ỏ",
  oõ: "õ",
  oï: "ọ",
  oâ: "ô",
  uù: "ú",
  uø: "ù",
  uû: "ủ",
  uõ: "ũ",
  uï: "ụ",
  yù: "ý",
  yø: "ỳ",
  yû: "ỷ",
  yõ: "ỹ",
  ñ: "đ",
  Ñ: "Đ",
};

// Regex nhận diện chuỗi đã là tiếng Việt Unicode chuẩn
const UNICODE_VIETNAMESE_REGEX =
  /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/;

/**
 * Tự chữa lành lỗi bảng mã Tiếng Việt (TCVN3, VNI, Decomposed NFD) và dọn sạch ký tự rác tàng hình.
 */
export function healVietnameseEncoding(input: unknown): string {
  if (input === null || input === undefined) return "";
  let str = String(input);

  // 1. Dọn dẹp ký tự tàng hình
  str = str.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  str = str.replace(/\u00A0/g, " ");

  // 2. Chuyển đổi VNI nếu có mẫu đặc thù
  const isVni =
    /(aù|aú|aø|aû|aõ|aï|aê|eù|eú|eø|eû|eõ|eï|où|oø|oû|oõ|oï|uù|uø|uû|uõ|uï|yù|yø|yû|yõ|ñ|Ñ)/.test(
      str,
    );
  if (isVni) {
    for (const [vniChar, uniChar] of Object.entries(VNI_SPECIFIC_MAP)) {
      str = str.replaceAll(vniChar, uniChar);
    }
  }

  // 3. Chuyển đổi TCVN3 CHỈ KHI chuỗi chưa phải là Unicode tiếng Việt và có ký tự TCVN3 signature
  const isPureUnicode = UNICODE_VIETNAMESE_REGEX.test(str);
  if (!isPureUnicode) {
    const isTcvn3Signature =
      /[\xB5-\xB9\xBE\xBB\xBC\xBD\xCD\xCE\xCF\xD1\xEE\xEF\xF1\xF2\xF4\xF5\xF6\xF7\xF9\xFD\xFB\xFC\xFE\xDA\xAE\xAA\xA7\xA8\xA9\xAB\xDF\xD9\xDB\xDC\xF0\xEB\xEC\xED\xA4]/.test(
        str,
      );
    if (isTcvn3Signature) {
      for (const [tcvnChar, uniChar] of Object.entries(TCVN3_SPECIFIC_MAP)) {
        str = str.replaceAll(tcvnChar, uniChar);
      }
    }
  }

  // 4. Chuẩn hóa về Unicode Dựng sẵn (NFC)
  str = str.normalize("NFC");

  return str.replace(/\s+/g, " ").trim();
}

/**
 * Bỏ dấu tiếng Việt để phục vụ so khớp mờ (Fuzzy match / Search index).
 */
export function removeVietnameseAccents(str: string): string {
  return healVietnameseEncoding(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (m) => (m === "đ" ? "d" : "D"))
    .toLowerCase();
}

// ============================================================================
// 2. TỰ CHỮA LÀNH NGÀY THÁNG ĐA ĐỊNH DẠNG (DATE HEALING)
// ============================================================================

export function healDateString(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;

  if (
    typeof input === "number" ||
    (!Number.isNaN(Number(input)) &&
      !String(input).includes("-") &&
      !String(input).includes("/") &&
      !String(input).includes("."))
  ) {
    const num = Number(input);
    if (num > 10000 && num < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const targetDate = new Date(excelEpoch.getTime() + num * 86400000);
      const yyyy = targetDate.getUTCFullYear();
      const mm = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(targetDate.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const yyyy = input.getFullYear();
    const mm = String(input.getMonth() + 1).padStart(2, "0");
    const dd = String(input.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const raw = healVietnameseEncoding(input);

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const dmyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    let p1 = Number(dmyMatch[1]);
    let p2 = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);

    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    let day = p1;
    let month = p2;
    if (p1 <= 12 && p2 > 12) {
      day = p2;
      month = p1;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsedTime = Date.parse(raw);
  if (!Number.isNaN(parsedTime)) {
    const d = new Date(parsedTime);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    if (yyyy >= 1970 && yyyy <= 2100) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

// ============================================================================
// 3. TỰ CHỮA LÀNH TIỀN TỆ & ĐƠN GIÁ (MONEY & NUMERIC HEALING)
// ============================================================================

export interface HealedMoneyResult {
  raw: string;
  valueBigIntUnits: bigint;
  formattedVnd: string;
  numericValue: number;
}

export function healMoneyValue(input: unknown): HealedMoneyResult | null {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "number") {
    if (Number.isNaN(input) || !Number.isFinite(input)) return null;
    const valueBigInt = BigInt(Math.round(input * 100));
    return {
      raw: String(input),
      valueBigIntUnits: valueBigInt,
      formattedVnd: new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
        input,
      ),
      numericValue: input,
    };
  }

  let str = healVietnameseEncoding(input).toLowerCase();
  let multiplier = 1;

  if (/(?:^|[^a-z0-9])(tỷ|ty|billion)(?:$|[^a-z0-9])/i.test(str) || /(tỷ|ty|b)$/i.test(str)) {
    multiplier = 1_000_000_000;
    str = str.replace(/(tỷ|ty|billion|b)/gi, "");
  } else if (
    /(?:^|[^a-z0-9])(triệu|trieu|tr|million)(?:$|[^a-z0-9])/i.test(str) ||
    /(triệu|trieu|tr|m)$/i.test(str)
  ) {
    multiplier = 1_000_000;
    str = str.replace(/(triệu|trieu|tr|million|m)/gi, "");
  } else if (
    /(?:^|[^a-z0-9])(nghìn|nghin|ngàn|ngan|thousand)(?:$|[^a-z0-9])/i.test(str) ||
    /(nghìn|nghin|ngàn|ngan|k)$/i.test(str)
  ) {
    multiplier = 1_000;
    str = str.replace(/(nghìn|nghin|ngàn|ngan|thousand|k)/gi, "");
  }

  str = str.replace(/[đ₫vnd$usd\s]/gi, "");

  const isNegative = str.startsWith("-");
  str = str.replace(/^[+-]/, "");

  let normalizedNumberStr = str;
  if (str.includes(",") && str.includes(".")) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalizedNumberStr = str.replace(/\./g, "").replace(",", ".");
    } else {
      normalizedNumberStr = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    const parts = str.split(",");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && multiplier === 1)) {
      normalizedNumberStr = str.replace(/,/g, "");
    } else {
      normalizedNumberStr = str.replace(",", ".");
    }
  } else if (str.includes(".")) {
    const parts = str.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && multiplier === 1)) {
      normalizedNumberStr = str.replace(/\./g, "");
    } else {
      normalizedNumberStr = str;
    }
  }

  const baseNum = Number.parseFloat(normalizedNumberStr);
  if (Number.isNaN(baseNum) || !Number.isFinite(baseNum)) return null;

  const finalNumeric = (isNegative ? -1 : 1) * baseNum * multiplier;
  const valueBigInt = BigInt(Math.round(finalNumeric * 100));

  return {
    raw: String(input),
    valueBigIntUnits: valueBigInt,
    formattedVnd: new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
      finalNumeric,
    ),
    numericValue: finalNumeric,
  };
}

// ============================================================================
// 4. CHUẨN HÓA MÃ HIỆU BOQ & ĐỊNH DANH (BOQ CODE HEALING)
// ============================================================================

export function healBoqCode(input: unknown): string {
  if (input === null || input === undefined) return "";
  let str = healVietnameseEncoding(input).toUpperCase();

  str = str.replace(/[\s\-_,]+/g, ".");
  str = str.replace(/^\.+|\.+$/g, "");
  str = str.replace(/\.+/g, ".");

  return str;
}

// ============================================================================
// 5. SO KHỚP MỜ & GIẢI MÃ KHẨU LỆNH NLP (FUZZY INTENT DISAMBIGUATION)
// ============================================================================

export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
        );
      }
    }
  }
  return matrix[bn][an];
}

export function stringSimilarity(s1: string, s2: string): number {
  const norm1 = removeVietnameseAccents(s1).trim();
  const norm2 = removeVietnameseAccents(s2).trim();

  if (norm1 === norm2) return 1.0;
  if (norm1.length === 0 || norm2.length === 0) return 0.0;

  const tokens1 = new Set(norm1.split(/\s+/));
  const tokens2 = new Set(norm2.split(/\s+/));
  let intersectionCount = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersectionCount++;
  }
  const minTokens = Math.min(tokens1.size, tokens2.size);
  const unionCount = new Set([...tokens1, ...tokens2]).size;

  const containmentScore = minTokens > 0 ? intersectionCount / minTokens : 0;
  const jaccardScore = unionCount > 0 ? intersectionCount / unionCount : 0;

  const maxLen = Math.max(norm1.length, norm2.length);
  const lev = levenshteinDistance(norm1, norm2);
  const levScore = Math.max(0, 1 - lev / maxLen);

  return Math.max(containmentScore * 0.85 + jaccardScore * 0.15, levScore);
}

export interface DictionaryItem {
  key: string;
  label: string;
  synonyms?: string[];
}

export interface FuzzyMatchResult {
  match: DictionaryItem | null;
  confidence: number;
  alternatives: Array<{ item: DictionaryItem; confidence: number }>;
}

export function fuzzyMatchDictionary(
  query: string,
  dictionary: DictionaryItem[],
  threshold = 0.65,
): FuzzyMatchResult {
  if (!query || dictionary.length === 0) {
    return { match: null, confidence: 0, alternatives: [] };
  }

  const cleanedQuery = removeVietnameseAccents(query);
  const scores: Array<{ item: DictionaryItem; confidence: number }> = [];

  for (const item of dictionary) {
    let bestScore = stringSimilarity(cleanedQuery, item.label);

    if (item.synonyms) {
      for (const syn of item.synonyms) {
        const score = stringSimilarity(cleanedQuery, syn);
        if (score > bestScore) {
          bestScore = score;
        }
      }
    }

    scores.push({ item, confidence: Number(bestScore.toFixed(3)) });
  }

  scores.sort((a, b) => b.confidence - a.confidence);

  const top = scores[0];
  const alternatives = scores.slice(1, 4).filter((s) => s.confidence >= 0.5);

  if (top && top.confidence >= threshold) {
    return {
      match: top.item,
      confidence: top.confidence,
      alternatives,
    };
  }

  return {
    match: null,
    confidence: top ? top.confidence : 0,
    alternatives: scores.slice(0, 3),
  };
}

// ============================================================================
// 6. TỰ CÂN ĐỐI TRẠNG THÁI TIẾN ĐỘ & WBS (STATE RECONCILIATION)
// ============================================================================

export interface TaskStateInput {
  currentStatus: string;
  currentProgress: number;
  targetStatus?: string;
  targetProgress?: number;
  hasEndDatePassed?: boolean;
  isApproved?: boolean;
}

export interface TaskStateHealed {
  safeStatus: "chuan_bi" | "dang_thi_cong" | "hoan_thanh" | "tre" | "nghiem_thu";
  safeProgress: number;
  autoCorrected: boolean;
  reasons: string[];
}

export function reconcileTaskState(input: TaskStateInput): TaskStateHealed {
  const reasons: string[] = [];
  let autoCorrected = false;

  let progress = input.targetProgress !== undefined ? input.targetProgress : input.currentProgress;
  if (typeof progress !== "number" || Number.isNaN(progress)) {
    progress = 0;
    autoCorrected = true;
    reasons.push("Tiến độ không hợp lệ (NaN/null) -> đặt lại về 0%");
  } else if (progress < 0) {
    progress = 0;
    autoCorrected = true;
    reasons.push("Tiến độ âm -> điều chỉnh về 0%");
  } else if (progress > 1) {
    if (progress <= 100) {
      progress = progress / 100;
      autoCorrected = true;
      reasons.push(`Tiến độ nhập dạng ${progress * 100}% -> chuẩn hóa về tỷ lệ ${progress}`);
    } else {
      progress = 1.0;
      autoCorrected = true;
      reasons.push("Tiến độ vượt quá 100% -> giới hạn về 100%");
    }
  }

  let status = input.targetStatus || input.currentStatus;

  if (
    input.currentStatus === "nghiem_thu" &&
    !input.isApproved &&
    input.targetStatus !== "nghiem_thu"
  ) {
    if (progress < 1.0) {
      reasons.push("Task đã nghiệm thu không thể giảm % tiến độ dưới 100% trừ khi huỷ nghiệm thu");
      progress = 1.0;
      status = "nghiem_thu";
      autoCorrected = true;
    }
  }

  if (status === "nghiem_thu") {
    if (progress < 1.0) {
      status = progress > 0 ? "dang_thi_cong" : "chuan_bi";
      autoCorrected = true;
      reasons.push(
        `Chưa hoàn thành 100% (hiện tại ${(progress * 100).toFixed(0)}%) -> không thể đặt trạng thái Nghiệm thu, chuyển về '${status}'`,
      );
    }
  } else {
    if (progress >= 1.0) {
      status = "hoan_thanh";
    } else if (input.hasEndDatePassed && progress < 1.0) {
      status = "tre";
    } else if (progress > 0) {
      status = "dang_thi_cong";
    } else {
      status = "chuan_bi";
    }
  }

  const validStatuses: Array<"chuan_bi" | "dang_thi_cong" | "hoan_thanh" | "tre" | "nghiem_thu"> = [
    "chuan_bi",
    "dang_thi_cong",
    "hoan_thanh",
    "tre",
    "nghiem_thu",
  ];
  const safeStatus = validStatuses.includes(status as any) ? (status as any) : "chuan_bi";

  return {
    safeStatus,
    safeProgress: Number(progress.toFixed(4)),
    autoCorrected,
    reasons,
  };
}

// ============================================================================
// 7. TỰ ĐỘNG CHUẨN HÓA BẢNG TÍNH EXCEL/CSV & DỌN DẸP DÒNG DỮ LIỆU
// ============================================================================

export const DEFAULT_EXCEL_HEADER_SYNONYMS: Record<string, string[]> = {
  boq_code: [
    "mã boq",
    "mã hiệu",
    "ma hieu",
    "boq code",
    "boq_code",
    "mã công việc",
    "ma cv",
    "mã số",
    "stt mã",
  ],
  task_name: [
    "tên công việc",
    "ten cong viec",
    "hạng mục",
    "hang muc",
    "nội dung",
    "mo ta",
    "diễn giải",
    "tên vật tư",
    "ten vat tu",
  ],
  unit: ["đơn vị", "don vi", "đvt", "dvt", "unit", "đơn vị tính"],
  quantity: [
    "khối lượng",
    "khoi luong",
    "số lượng",
    "so luong",
    "qty",
    "quantity",
    "kl dự toán",
    "kl kế hoạch",
  ],
  unit_price: ["đơn giá", "don gia", "đơn giá dự toán", "unit price", "price", "giá"],
  start_date: [
    "ngày bắt đầu",
    "ngay bat dau",
    "start date",
    "bắt đầu",
    "start",
    "ngay bd",
    "ngày bđ",
  ],
  end_date: [
    "ngày kết thúc",
    "ngay ket thuc",
    "end date",
    "kết thúc",
    "end",
    "ngay kt",
    "ngày kt",
    "hạn hoàn thành",
  ],
};

export function healExcelRowData(
  rawRow: Record<string, unknown>,
  headerMapping = DEFAULT_EXCEL_HEADER_SYNONYMS,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const cleanHeaderKey = (k: string) => removeVietnameseAccents(k).replace(/[^a-z0-9]/g, "");
  const rowKeys = Object.keys(rawRow);

  for (const [standardKey, synonyms] of Object.entries(headerMapping)) {
    let matchedRawKey: string | null = null;

    for (const rawKey of rowKeys) {
      const cleanRaw = cleanHeaderKey(rawKey);
      if (cleanRaw === cleanHeaderKey(standardKey)) {
        matchedRawKey = rawKey;
        break;
      }
      for (const syn of synonyms) {
        if (cleanRaw === cleanHeaderKey(syn)) {
          matchedRawKey = rawKey;
          break;
        }
      }
      if (matchedRawKey) break;
    }

    if (!matchedRawKey) {
      for (const rawKey of rowKeys) {
        const cleanRaw = cleanHeaderKey(rawKey);
        for (const syn of synonyms) {
          if (cleanRaw.includes(cleanHeaderKey(syn)) || cleanHeaderKey(syn).includes(cleanRaw)) {
            matchedRawKey = rawKey;
            break;
          }
        }
        if (matchedRawKey) break;
      }
    }

    if (matchedRawKey) {
      const rawVal = rawRow[matchedRawKey];

      if (standardKey === "boq_code") {
        result[standardKey] = healBoqCode(rawVal);
      } else if (standardKey === "start_date" || standardKey === "end_date") {
        result[standardKey] = healDateString(rawVal);
      } else if (standardKey === "unit_price") {
        const money = healMoneyValue(rawVal);
        result[standardKey] = money ? money.numericValue : null;
      } else if (standardKey === "quantity") {
        if (typeof rawVal === "number") {
          result[standardKey] = rawVal;
        } else {
          const money = healMoneyValue(rawVal);
          result[standardKey] = money ? money.numericValue : null;
        }
      } else {
        result[standardKey] = healVietnameseEncoding(rawVal);
      }
    }
  }

  return result;
}

// ============================================================================
// 8. PHÂN GIẢI XUNG ĐỘT TRƯỜNG ĐỘC LẬP (FIELD-LEVEL 3-WAY MERGE)
// ============================================================================

export interface ConflictMergeResult<T> {
  merged: T;
  conflicts: Array<{
    field: string;
    baseValue: unknown;
    currentValue: unknown;
    incomingValue: unknown;
    chosenValue: unknown;
    resolution: "current_kept" | "incoming_applied" | "auto_reconciled";
  }>;
}

export function fieldLevel3WayMerge<T extends Record<string, unknown>>(
  base: T,
  current: T,
  incoming: T,
): ConflictMergeResult<T> {
  const merged = { ...current } as T;
  const conflicts: ConflictMergeResult<T>["conflicts"] = [];

  const allKeys = Array.from(
    new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(incoming)]),
  );

  for (const key of allKeys) {
    const baseVal = base[key];
    const currVal = current[key];
    const incVal = incoming[key];

    if (JSON.stringify(incVal) === JSON.stringify(baseVal)) {
      continue;
    }

    if (JSON.stringify(currVal) === JSON.stringify(baseVal)) {
      (merged as any)[key] = incVal;
      continue;
    }

    if (JSON.stringify(currVal) === JSON.stringify(incVal)) {
      continue;
    }

    let chosenVal = incVal;
    let resolution: "current_kept" | "incoming_applied" | "auto_reconciled" = "incoming_applied";

    if (incVal === null || incVal === undefined || incVal === "") {
      chosenVal = currVal;
      resolution = "current_kept";
    } else {
      (merged as any)[key] = incVal;
      resolution = "incoming_applied";
    }

    conflicts.push({
      field: key,
      baseValue: baseVal,
      currentValue: currVal,
      incomingValue: incVal,
      chosenValue: chosenVal,
      resolution,
    });
  }

  return { merged, conflicts };
}

// ============================================================================
// 9. [TẦNG CAO MỚI] PHỤC HỒI LỖI CÔNG THỨC EXCEL (#REF!, #VALUE!, #DIV/0!)
// ============================================================================

export interface FormulaHealingContext {
  siblings?: number[];
  formulaType?: "sum" | "avg" | "mul";
  fallbackDefault?: number;
}

export function healExcelFormulaError(
  rawVal: unknown,
  context: FormulaHealingContext = {},
): { value: number; healed: boolean; originalError: string | null } {
  if (typeof rawVal === "number" && !Number.isNaN(rawVal) && Number.isFinite(rawVal)) {
    return { value: rawVal, healed: false, originalError: null };
  }

  const str = String(rawVal || "")
    .trim()
    .toUpperCase();
  const isFormulaError = /(#REF!|#VALUE!|#DIV\/0!|#N\/A|#NAME\?|#NUM!|#NULL!)/.test(str);

  if (!isFormulaError && str !== "" && !Number.isNaN(Number(str))) {
    return { value: Number(str), healed: false, originalError: null };
  }

  const validSiblings = (context.siblings || []).filter(
    (n) => typeof n === "number" && !Number.isNaN(n) && Number.isFinite(n),
  );

  if (validSiblings.length > 0) {
    if (context.formulaType === "avg") {
      const sum = validSiblings.reduce((a, b) => a + b, 0);
      const avg = sum / validSiblings.length;
      return { value: Number(avg.toFixed(4)), healed: true, originalError: str || "EMPTY_FORMULA" };
    }
    const sum = validSiblings.reduce((a, b) => a + b, 0);
    return { value: Number(sum.toFixed(4)), healed: true, originalError: str || "EMPTY_FORMULA" };
  }

  return {
    value: context.fallbackDefault !== undefined ? context.fallbackDefault : 0,
    healed: isFormulaError,
    originalError: isFormulaError ? str : null,
  };
}

// ============================================================================
// 10. [TẦNG CAO MỚI] PHÁT HIỆN BẤT THƯỜNG NHẬP LIỆU THỜI GIAN THỰC (Z-SCORE)
// ============================================================================

export interface AnomalyDetectionInput {
  field: string;
  value: number;
  historicalValues: number[];
  toleranceStdDev?: number;
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  severity: "none" | "info" | "warning" | "critical";
  zScore: number;
  historicalMean: number;
  historicalStdDev: number;
  explanation: string;
  suggestedValue: number;
}

export function detectInputAnomalies(input: AnomalyDetectionInput): AnomalyDetectionResult {
  const { field, value, historicalValues, toleranceStdDev = 2.5 } = input;

  const validHistory = historicalValues.filter(
    (v) => typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v),
  );

  if (validHistory.length < 3) {
    return {
      isAnomaly: false,
      severity: "none",
      zScore: 0,
      historicalMean: value,
      historicalStdDev: 0,
      explanation: "Chưa đủ dữ liệu lịch sử để đánh giá độ lệch chuẩn",
      suggestedValue: value,
    };
  }

  const mean = validHistory.reduce((a, b) => a + b, 0) / validHistory.length;
  const variance =
    validHistory.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validHistory.length;
  const stdDev = Math.sqrt(variance);

  const sorted = [...validHistory].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (stdDev === 0) {
    const isDifferent = value !== mean;
    return {
      isAnomaly: isDifferent,
      severity: isDifferent ? "warning" : "none",
      zScore: isDifferent ? 999 : 0,
      historicalMean: mean,
      historicalStdDev: 0,
      explanation: isDifferent
        ? `Giá trị ${value} lệch khỏi chuẩn cố định ${mean}`
        : "Dữ liệu khớp chuẩn",
      suggestedValue: mean,
    };
  }

  const zScore = Math.abs(value - mean) / stdDev;
  const isAnomaly = zScore >= toleranceStdDev;

  let severity: AnomalyDetectionResult["severity"] = "none";
  let explanation = `Giá trị hợp lệ (Z-Score = ${zScore.toFixed(2)})`;

  if (zScore >= 4.0) {
    severity = "critical";
    explanation = `Giá trị [${field}: ${value}] bất thường cực lớn (gấp ${(value / (mean || 1)).toFixed(1)} lần trung bình ${mean.toFixed(1)}). Nguy cơ gõ thừa số 0!`;
  } else if (zScore >= 2.5) {
    severity = "warning";
    explanation = `Giá trị [${field}: ${value}] lệch đáng kể so với trung bình lịch sử ${mean.toFixed(1)} (Z-Score = ${zScore.toFixed(2)}).`;
  } else if (zScore >= 1.8) {
    severity = "info";
    explanation = `Giá trị hơi cao/thấp hơn bình thường (${mean.toFixed(1)}).`;
  }

  return {
    isAnomaly,
    severity,
    zScore: Number(zScore.toFixed(2)),
    historicalMean: Number(mean.toFixed(2)),
    historicalStdDev: Number(stdDev.toFixed(2)),
    explanation,
    suggestedValue: Number(median.toFixed(2)),
  };
}

// ============================================================================
// 11. [TẦNG CAO MỚI] GIẢI MÃ KHẨU LỆNH NGỮ CẢNH SÂU (DEEP INTENT CONTEXT)
// ============================================================================

export interface DeepContextInput {
  text: string;
  recentTasks?: Array<{ id: string; name: string; floor?: string; zone?: string; system?: string }>;
  activeUsers?: Array<{ id: string; name: string; role?: string }>;
}

export interface DeepIntentResult {
  rawText: string;
  intents: Array<
    "update_progress" | "request_inspection" | "assign_worker" | "report_delay" | "receive_material"
  >;
  targetFloor: string | null;
  targetZone: string | null;
  quantity: number | null;
  unit: string | null;
  matchedTask: { id: string; name: string } | null;
  assignedUser: { id: string; name: string } | null;
  confidence: number;
  actionSummary: string;
}

export function parseComplexFieldCommandWithContext(context: DeepContextInput): DeepIntentResult {
  const { text, recentTasks = [], activeUsers = [] } = context;
  const norm = healVietnameseEncoding(text);
  const unaccented = removeVietnameseAccents(norm);

  const floorMatch = norm.match(/\b(t\u1EA7ng|t|f)\s*(\d+|h\u1EA7m\s*\d*|b\d*)\b/i);
  const zoneMatch = norm.match(/\b(zone|ph\u00E2n khu|z)\s*(\d+|a|b|c)\b/i);
  const floor = floorMatch ? floorMatch[2] : null;
  const zone = zoneMatch ? zoneMatch[2] : null;

  const qtyMatch = norm.match(
    /(\d+([\.,]\d+)?)\s*(m2|m3|m|c\u00E2y|cu\u1ED9n|b\u1ED9|t\u1EA5n|kg|c\u00E1i)\b/i,
  );
  const quantity = qtyMatch ? Number(qtyMatch[1].replace(",", ".")) : null;
  const unit = qtyMatch ? qtyMatch[3] : null;

  const intents: DeepIntentResult["intents"] = [];
  if (/(nghi\u1EC7m thu|bbnt|ki\u1EC3m tra|k\u00FD duy\u1EC7t)/i.test(norm)) {
    intents.push("request_inspection");
  }
  if (
    /(xong|ho\u00E0n th\u00E0nh|thi c\u00F4ng \u0111\u01B0\u1EE3c|ti\u1EBFn \u0111\u1ED9|\d+\s*(m|c\u00E2y|m2))/i.test(
      norm,
    )
  ) {
    intents.push("update_progress");
  }
  if (
    /(chuy\u1EC3n th\u1EE3|g\u00E1n|cho th\u1EE3|nh\u00E0 th\u1EA7u|t\u1ED5 \u0111\u1ED9i)/i.test(
      norm,
    )
  ) {
    intents.push("assign_worker");
  }
  if (
    /(ch\u1EADm|tr\u1EC5|v\u01B0\u1EDBng|k\u1EB9t|ch\u01B0a c\u00F3 m\u1EB7t b\u1EB1ng)/i.test(norm)
  ) {
    intents.push("report_delay");
  }
  if (/(nh\u1EADp|v\u1EC1 h\u00E0ng|v\u1EADt t\u01B0 \u0111\u1EBFn)/i.test(norm)) {
    intents.push("receive_material");
  }

  let matchedTask: DeepIntentResult["matchedTask"] = null;
  let bestTaskScore = 0;

  for (const t of recentTasks) {
    let score = stringSimilarity(unaccented, removeVietnameseAccents(t.name));
    if (floor && t.floor && t.floor.toString() === floor.toString()) score += 0.2;
    if (zone && t.zone && t.zone.toString() === zone.toString()) score += 0.2;

    if (score > bestTaskScore) {
      bestTaskScore = score;
      matchedTask = { id: t.id, name: t.name };
    }
  }

  let assignedUser: DeepIntentResult["assignedUser"] = null;
  let bestUserScore = 0;

  for (const u of activeUsers) {
    const score = stringSimilarity(unaccented, removeVietnameseAccents(u.name));
    if (score > bestUserScore && score >= 0.5) {
      bestUserScore = score;
      assignedUser = { id: u.id, name: u.name };
    }
  }

  const confidence = Number(
    Math.min(
      1.0,
      Math.max(0.5, bestTaskScore * 0.5 + (bestUserScore > 0 ? 0.3 : 0.1) + (floor ? 0.2 : 0)),
    ).toFixed(2),
  );

  let summary = `Nhận diện hành động: ${intents.join(", ") || "cập nhật"}`;
  if (matchedTask) summary += ` trên công việc [${matchedTask.name}]`;
  if (floor) summary += ` tại Tầng ${floor}`;
  if (zone) summary += ` - Zone ${zone}`;
  if (quantity && unit) summary += ` (Khối lượng: ${quantity} ${unit})`;
  if (assignedUser) summary += ` gán cho [${assignedUser.name}]`;

  return {
    rawText: text,
    intents,
    targetFloor: floor,
    targetZone: zone,
    quantity,
    unit,
    matchedTask: bestTaskScore >= 0.5 ? matchedTask : null,
    assignedUser,
    confidence,
    actionSummary: summary,
  };
}

// ============================================================================
// 12. [TẦNG CAO MỚI] BẢN CHỤP DU HÀNH THỜI GIAN (TIME-TRAVEL UNDO SNAPSHOT)
// ============================================================================

export interface TimeTravelSnapshot<T> {
  snapshotId: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  payloadHash: string;
  data: T;
}

export function createTimeTravelSnapshot<T>(
  entityType: string,
  entityId: string,
  data: T,
): TimeTravelSnapshot<T> {
  const jsonStr = JSON.stringify(data);
  const payloadHash = crypto.createHash("sha256").update(jsonStr).digest("hex");
  const snapshotId = `SNAP-${Date.now()}-${payloadHash.slice(0, 8)}`;

  return {
    snapshotId,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    payloadHash,
    data,
  };
}

// ============================================================================
// 13. [TẦNG CAO MỚI] TÁI CẤU TRÚC CÂY MA TRẬN PHÂN CẤP WBS (MATRIX RECON)
// ============================================================================

export interface MatrixHierarchyGroup {
  groupCode: string;
  groupName: string;
  tasks: Array<Record<string, unknown>>;
}

export function reconstructMatrixHierarchy(
  rawRows: Array<Record<string, unknown>>,
): MatrixHierarchyGroup[] {
  const groups: MatrixHierarchyGroup[] = [];
  let currentGroup: MatrixHierarchyGroup | null = null;

  for (const raw of rawRows) {
    const healed = healExcelRowData(raw);
    const code = String(healed.boq_code || "").trim();
    const name = String(healed.task_name || "").trim();

    if (!code && !name) continue;

    const isGroupHeader =
      (!code.includes(".") && !healed.quantity) ||
      /^(nh\u00F3m|g\u00F3i|h\u1EC7 th\u1ED1ng|ph\u00E2n khu)/i.test(name);

    if (isGroupHeader) {
      currentGroup = {
        groupCode: code || `GRP-${groups.length + 1}`,
        groupName: name || `Nhóm công việc ${code}`,
        tasks: [],
      };
      groups.push(currentGroup);
    } else {
      if (!currentGroup) {
        currentGroup = {
          groupCode: "GENERAL",
          groupName: "Hạng mục chung",
          tasks: [],
        };
        groups.push(currentGroup);
      }
      currentGroup.tasks.push(healed);
    }
  }

  return groups;
}
