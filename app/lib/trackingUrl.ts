import { slugFromCode } from "@/lib/nen/sheets";
import { linkTracking } from "@/lib/nen/link-tracking";

// Đường dẫn tới lưới tracking của một công việc: `/tracking/<slug>?floor=<tầng>` (M127 —
// tách từ `app/page.tsx` để hai chế độ trang chủ và các danh sách task dùng chung một
// công thức). `sheetSlug` là nguồn chính (cột `sheet_types.slug`); `sheetType` chỉ là
// đường lui cho dữ liệu cũ của 5 sheet gốc (`lib/nen/sheets.ts`). `projectId` (M132): link
// từ thông báo có thể thuộc dự án khác dự án đang chọn — trang tracking đổi dự án trước khi tải.
// null = không suy ra được sheet → nơi gọi hiển thị hàng không bấm được.
export function trackingUrl(
  sheetSlug: string | null | undefined,
  sheetType?: string | null,
  floorLabel?: string | null,
  projectId?: number | null,
): string | null {
  const slug = sheetSlug ?? (sheetType ? slugFromCode(sheetType) : null);
  if (!slug) return null;
  return linkTracking(slug, { floor: floorLabel, projectId });
}
