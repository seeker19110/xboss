import { queryOne } from "@/lib/db";

// Watermark thay đổi của 1 sheet — đổi giá trị khi có task được cập nhật/thêm/xoá hoặc nhóm
// bị tạo/xoá/di chuyển giữa sheet. Tính TOÀN CỤC (không lọc theo user) để mọi client so sánh
// cùng một giá trị. O(1): đọc 1 dòng watermark theo khoá chính thay cho aggregate JOIN 3 bảng
// (M53 PR2) — version được bump ATOMIC bởi trigger bump_sheet_version (migration 0064) trong
// đúng transaction ghi tasks/work_packages. Client chỉ so sánh chuỗi khác nhau, không parse.
// S02e: slug chỉ unique TRONG dự án (uq_sheet_types_project_slug) → tra theo (dự án, slug);
// không có dự án → '0' (không đọc watermark sheet của dự án nào).
export async function sheetVersion(sheetSlug: string, projectId: number | null): Promise<string> {
  if (projectId == null) return "0";
  const r = await queryOne<{ version: string }>(
    `SELECT sv.version::text AS version
       FROM sheet_versions sv
       JOIN sheet_types st ON sv.sheet_type_id = st.id
      WHERE st.slug = ? AND st.project_id = ?`,
    sheetSlug,
    projectId,
  );
  // Phòng thủ: sheet chưa có dòng watermark (không nên xảy ra sau backfill) → '0'.
  return r?.version ?? "0";
}
