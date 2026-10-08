// L5 (S10a): chọn kiểu ô Excel cho số tiền/khối lượng chính xác THEO CỘT, không theo từng ô.
// Excel lưu double và chỉ giữ 15 chữ số có nghĩa: giá trị ≤ 15 chữ số có nghĩa đi qua double
// rồi quay lại đúng nguyên giá trị → ô số; dài hơn → phải ghi TEXT canonical (A3-FR06). Nếu
// quyết định từng ô, một cột có thể trộn số và text — =SUM() bỏ qua ô text mà không báo. Vì
// vậy: chỉ cần MỘT giá trị của cột cần text thì CẢ cột ghi text.
import { decimalFromUnscaled } from "@/lib/nen/money";

export const EXCEL_CHU_SO_CO_NGHIA = 15;

/** Giá trị exact: số nguyên đã nhân 10^scale. */
export type GiaTriExact = { unscaled: bigint; scale: number };

/** true nếu giá trị biểu diễn đúng được bằng ô số Excel (≤ 15 chữ số có nghĩa). */
export function vuaOSoExcel(v: GiaTriExact): boolean {
  const tuyetDoi = v.unscaled < 0n ? -v.unscaled : v.unscaled;
  const chuSo = tuyetDoi === 0n ? 0 : tuyetDoi.toString().replace(/0+$/, "").length;
  return chuSo <= EXCEL_CHU_SO_CO_NGHIA;
}

/** Quyết định kiểu cho cả cột (hoặc nhóm): toàn number, hoặc (có giá trị bất kỳ vượt ngưỡng) toàn text. */
export function oExcelTheoCot(giaTri: GiaTriExact[]): {
  cells: (number | string)[];
  laText: boolean;
} {
  const laText = giaTri.some((v) => !vuaOSoExcel(v));
  const cells = giaTri.map((v) => {
    const text = decimalFromUnscaled(v.unscaled, v.scale);
    return laText ? text : Number(text);
  });
  return { cells, laText };
}

/** Dòng ghi chú khi có cột/nhóm ghi dạng văn bản; null nếu mọi cột đều là số. */
export function ghiChuCotText(tenCotText: string[]): string | null {
  if (tenCotText.length === 0) return null;
  return `Lưu ý: cột ${tenCotText.join(", ")} ghi dạng văn bản để giữ đủ độ chính xác (vượt 15 chữ số có nghĩa của Excel) — không dùng hàm SUM trực tiếp trên các cột này.`;
}
