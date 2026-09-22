// Tiện ích văn bản thuần (tầng nền, không chạm DB) — dùng cho so khớp tên tiếng Việt ở phía
// server lẫn client (vd xếp task theo độ giống tên dòng BOQ, M124 việc 1).

import { removeVietnameseAccents } from "@/lib/nen/user-error-healer";

/**
 * Chuẩn hoá chuỗi để so khớp: bỏ dấu, hạ chữ, `đ→d`, gộp khoảng trắng.
 *
 * VÌ SAO GỌI LẠI `removeVietnameseAccents`: hàm đó đã xử lý cả rác bảng mã thật gặp trong dữ
 * liệu nhập từ Excel (VNI/TCVN3, ký tự tàng hình) trước khi bỏ dấu — viết lại một bản NFD riêng
 * ở đây sẽ cho hai kết quả khác nhau cho cùng một cái tên, tuỳ chỗ nào gọi.
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
 * Cố ý KHÔNG dùng `stringSimilarity` của `user-error-healer`: hàm đó trộn thêm Levenshtein trên
 * toàn chuỗi, nên tên dài (mô tả BOQ) luôn bị điểm thấp dù trùng hết từ khoá — ở đây cần đo
 * "trùng bao nhiêu từ", không đo "khác bao nhiêu ký tự".
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
