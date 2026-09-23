// Tiện ích văn bản thuần (tầng nền, không chạm DB) — dùng cho so khớp tên tiếng Việt ở phía
// server lẫn client (vd xếp task theo độ giống tên dòng BOQ, M124 việc 1).

// ============================================================================
// PHỤ THUỘC VỀ CHUYỂN ĐỔI BẢNG MÃ TIẾNG VIỆT & DỌN DẸP KÝ TỰ RÁC
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
  str = str.replace(/[​‌‍﻿]/g, "");
  str = str.replace(/ /g, " ");

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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (m) => (m === "đ" ? "d" : "D"))
    .toLowerCase();
}

/**
 * Chuẩn hoá chuỗi để so khớp: bỏ dấu, hạ chữ, `đ→d`, gộp khoảng trắng.
 *
 * VÌ SAO GỌI LẠI `removeVietnameseAccents`: hàm đó đã xử lý cả rác bảng mã thật gặp trong dữ
 * liệu nhập từ Excel (VNI/TCVN3, ký tự tàng hình) trước khi bỏ dấu — bây giờ nằm cùng file này,
 * nên mọi nơi dùng `boDauThuong` sẽ nhận kết quả đồng nhất không phụ thuộc vào điểm gọi.
 */
export function boDauThuong(s: string): string {
  return removeVietnameseAccents(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Độ giống hai tên = Jaccard trên tập token (0..1). Token dài ≤1 ký tự bị bỏ ("ống gió tầng 5"
 * vs "lắp ống gió T5": token "5" một ký tự gây nhiễu cao vì mọi tầng đều có số lẻ trùng nhau).
 *
 * Cố ý KHÔNG trộn Levenshtein trên toàn chuỗi: làm vậy thì tên dài (mô tả BOQ) luôn bị điểm
 * thấp dù trùng hết từ khoá — ở đây cần đo "trùng bao nhiêu từ", không đo "khác bao nhiêu ký tự".
 */
export function diemGiongTen(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      boDauThuong(s)
        .split(" ")
        .filter((t) => t.length > 1),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let giao = 0;
  for (const t of ta) if (tb.has(t)) giao++;
  const hop = new Set([...ta, ...tb]).size;
  return hop > 0 ? giao / hop : 0;
}
