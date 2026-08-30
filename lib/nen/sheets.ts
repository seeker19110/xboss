// Mapping giữa slug URL và mã sheet trong DB.
export const SHEET_SLUGS: { slug: string; code: string; name: string }[] = [
  { slug: "ogtd", code: "OGTĐ", name: "Ống gió trục đứng" },
  { slug: "oghl", code: "OGHL", name: "Ống gió hành lang" },
  { slug: "ogch", code: "OGCH", name: "Ống gió căn hộ" },
  { slug: "odnn1", code: "ODNN Zone 1", name: "Ống đồng nước ngưng Zone 1" },
  { slug: "odnn2", code: "ODNN Zone 2", name: "Ống đồng nước ngưng Zone 2" },
];

export function slugFromCode(code: string): string | null {
  return SHEET_SLUGS.find((s) => s.code === code)?.slug ?? null;
}

// Sinh slug URL từ tên/mã tiếng Việt: bỏ dấu, thường hoá, chỉ giữ a-z0-9 và gạch nối.
export function toSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

// Slug hợp lệ: 1-50 ký tự a-z0-9 và gạch nối.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;
