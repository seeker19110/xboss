// Mapping giữa slug URL và mã sheet trong DB.
export const SHEET_SLUGS: { slug: string; code: string; name: string }[] = [
  { slug: "ogtd", code: "OGTĐ", name: "Ống gió trục đứng" },
  { slug: "oghl", code: "OGHL", name: "Ống gió hành lang" },
  { slug: "ogch", code: "OGCH", name: "Ống gió căn hộ" },
  { slug: "odnn1", code: "ODNN Zone 1", name: "Ống đồng nước ngưng Zone 1" },
  { slug: "odnn2", code: "ODNN Zone 2", name: "Ống đồng nước ngưng Zone 2" },
];

export function codeFromSlug(slug: string): string | null {
  return SHEET_SLUGS.find((s) => s.slug === slug)?.code ?? null;
}

export function slugFromCode(code: string): string | null {
  return SHEET_SLUGS.find((s) => s.code === code)?.slug ?? null;
}
