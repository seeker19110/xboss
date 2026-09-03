import { formatDateVN } from "@/lib/nen/date";
import type { Cell } from "./types";

// Mô tả sự kiện tick của 1 ô (M120) — dùng cho cả `title` (rê chuột) lẫn `aria-label`
// (bàn phím/đọc màn hình), nên phải là chuỗi thuần, không phải JSX.
// Ô chưa tick → chuỗi rỗng (không có gì để nói). Ô tick TRƯỚC khi M120 triển khai không có
// dữ liệu sự kiện — nói thẳng "Không rõ người tick" thay vì bịa hoặc để trống khó hiểu.
export function moTaSuKienO(cell: Cell): string {
  if (!cell.installed) return "";
  const phan: string[] = [];
  if (cell.installedByName || cell.installedAt) {
    phan.push(
      `Tick bởi ${cell.installedByName ?? "không rõ"}${
        cell.installedAt ? ` · ${formatDateVN(cell.installedAt)}` : ""
      }`,
    );
  } else {
    phan.push("Không rõ người tick");
  }
  if (cell.note) phan.push(`Ghi chú: ${cell.note}`);
  return phan.join(" · ");
}
