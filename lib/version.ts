import { queryOne } from "@/lib/db";

// Watermark thay đổi của 1 sheet — đổi giá trị khi có task được cập nhật/thêm/xoá.
// Tính TOÀN CỤC (không lọc theo user) để mọi client so sánh cùng một giá trị.
export async function sheetVersion(sheetSlug: string): Promise<string> {
  const r = await queryOne<{ m: string | null; n: number }>(
    `SELECT MAX(t.updated_at)::text AS m, COUNT(t.id) AS n
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE st.slug = ?`, sheetSlug);
  return `${r?.m ?? "0"}|${r?.n ?? 0}`;
}
