import type { statusEnum } from "./db/schema";

export type StatusSlug =
  | "chuan_bi" | "dang_thi_cong" | "hoan_thanh" | "nghiem_thu" | "tre";

// Map mọi biến thể chuỗi tiếng Việt trong Excel → slug enum.
const MAP: Record<string, StatusSlug> = {
  "chuan bi": "chuan_bi",
  "dang thi cong": "dang_thi_cong",
  "hoan thanh": "hoan_thanh",
  "da hoan thanh": "hoan_thanh",
  "nghiem thu": "nghiem_thu",
  "da nghiem thu": "nghiem_thu",
  "dang tre": "tre",
  "tre": "tre",
};

function deburr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

export function toStatusSlug(raw: unknown): StatusSlug {
  if (raw == null) return "chuan_bi";
  const key = deburr(String(raw));
  return MAP[key] ?? "chuan_bi";
}

export const STATUS_LABEL: Record<StatusSlug, string> = {
  chuan_bi: "Chuẩn bị",
  dang_thi_cong: "Đang thi công",
  hoan_thanh: "Hoàn thành",
  nghiem_thu: "Đã nghiệm thu",
  tre: "Đang trễ",
};

// % tiến độ: Excel chứa số (0..1) HOẶC chuỗi status. Trả về [0,1].
export function parseProgress(val: unknown): number {
  if (typeof val === "number" && !isNaN(val)) {
    if (val > 1) return Math.min(val / 100, 1); // phòng trường hợp 90 thay vì 0.9
    return Math.min(Math.max(val, 0), 1);
  }
  const n = parseFloat(String(val));
  if (!isNaN(n)) return Math.min(Math.max(n > 1 ? n / 100 : n, 0), 1);
  return 0;
}
