// Lưu trữ ảnh hiện trường — file nằm trong data/uploads/ (ngoài git),
// metadata trong bảng task_photos. Tên file do server sinh, không tin client.
import { mkdirSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { randomBytes } from "node:crypto";

export const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

// Chỉ nhận ảnh — map mime → phần mở rộng (không lấy ext từ tên file client gửi).
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
};

export function extForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

export function ensureUploadDir(): string {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function newPhotoFileName(taskId: number, mime: string): string {
  return `t${taskId}-${Date.now()}-${randomBytes(4).toString("hex")}${MIME_EXT[mime]}`;
}

// Đường dẫn tuyệt đối tới file ảnh — chặn path traversal (file_name luôn do server sinh,
// nhưng vẫn kiểm tra phòng dữ liệu DB bị sửa tay).
export function photoPath(fileName: string): string | null {
  const p = normalize(join(UPLOAD_DIR, fileName));
  if (!p.startsWith(UPLOAD_DIR)) return null;
  return p;
}
