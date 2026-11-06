// Thumbnail ảnh hiện trường — lưới ảnh (modal ảnh task, nhật ký, trang Tech) trước đây tải
// NGUYÊN ẢNH GỐC (tới 10MB, thường 3–6MB từ điện thoại) chỉ để vẽ ô 128px. Route
// GET /api/photos/:id?w=<rộng> trả bản thu nhỏ WebP tạo tại chỗ bằng sharp; bản gốc vẫn
// dùng cho trình xem ảnh. Chỉ nhận vài bề rộng cố định để không thành dịch vụ resize tuỳ ý
// (mỗi giá trị lạ = 1 lần xử lý CPU + 1 mục cache riêng).
import sharp from "sharp";

export const THUMB_WIDTHS = [320, 640] as const;

/**
 * Đọc tham số `w`: `null` khi không có (trả ảnh gốc), số khi thuộc `THUMB_WIDTHS`,
 * `"invalid"` khi có nhưng không hợp lệ (route trả 400).
 */
export function parseThumbWidth(raw: string | null): number | null | "invalid" {
  if (raw == null) return null;
  const w = Number(raw);
  return (THUMB_WIDTHS as readonly number[]).includes(w) ? w : "invalid";
}

/**
 * Thu nhỏ về bề rộng `width` (không phóng to ảnh nhỏ hơn), xoay theo EXIF, bỏ metadata
 * (EXIF có thể chứa toạ độ GPS) và nén WebP. Ném lỗi khi sharp không đọc được ảnh — caller
 * quyết định trả ảnh gốc thay thế.
 */
export async function taoThumbnail(buf: Buffer, width: number): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: 100_000_000, animated: false })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
}
