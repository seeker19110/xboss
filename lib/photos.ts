// Lưu trữ ảnh hiện trường — file nằm trong data/uploads/ (ngoài git),
// metadata trong bảng task_photos. Tên file do server sinh, không tin client.
import { mkdirSync, existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";
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

// Tài liệu đính kèm (biên bản nghiệm thu): PDF hoặc ảnh, tối đa 20MB.
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
const DOC_MIME_EXT: Record<string, string> = { ...MIME_EXT, "application/pdf": ".pdf" };

export function extForDocMime(mime: string): string | null {
  return DOC_MIME_EXT[mime] ?? null;
}

export function newDocFileName(taskId: number, mime: string): string {
  return `d${taskId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newContractDocFileName(contractId: number, mime: string): string {
  return `ct${contractId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newFloorDocFileName(floorApprovalId: number, mime: string): string {
  return `fa${floorApprovalId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newVoDocFileName(voId: number, mime: string): string {
  return `vo${voId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newTenderBidFileName(bidId: number, mime: string): string {
  return `bid${bidId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function ensureUploadDir(): string {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function newBbntFileName(wpId: number, mime: string): string {
  return `wp${wpId}-bbnt-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? MIME_EXT[mime] ?? ".bin"}`;
}

export function newDrawingFileName(wpId: number, mime: string): string {
  return `wp${wpId}-drw-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Revision bản vẽ (M8, register mới `drawings`/`drawing_revisions`): PDF/ảnh, tối đa 50MB
// (bản vẽ nặng hơn biên bản/tài liệu thường).
export const MAX_DRAWING_BYTES = 50 * 1024 * 1024;

export function newDrawingRevisionFileName(drawingId: number, rev: string, mime: string): string {
  const safeRev = rev.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "x";
  return `dr${drawingId}-${safeRev}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

export function newPhotoFileName(taskId: number, mime: string): string {
  return `t${taskId}-${Date.now()}-${randomBytes(4).toString("hex")}${MIME_EXT[mime]}`;
}

// Đường dẫn tuyệt đối tới file ảnh — chặn path traversal (file_name luôn do server sinh,
// nhưng vẫn kiểm tra phòng dữ liệu DB bị sửa tay).
export function photoPath(fileName: string): string | null {
  const p = normalize(join(UPLOAD_DIR, fileName));
  // Bắt buộc nằm TRONG UPLOAD_DIR — thêm separator để 'data/uploads-evil' không lọt.
  if (p !== UPLOAD_DIR && !p.startsWith(UPLOAD_DIR + sep)) return null;
  return p;
}
