// Lưu trữ ảnh hiện trường — file nằm trong data/uploads/ (ngoài git),
// metadata trong bảng task_photos. Tên file do server sinh, không tin client.
import { mkdirSync, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { randomBytes } from "node:crypto";

export const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

// Ngưỡng cảnh báo dung lượng data/uploads/ trên VPS (đề xuất trong M08-ban-ve.md —
// bản vẽ nặng hơn ảnh/biên bản, dễ chiếm dung lượng nhanh hơn). Dùng chung bởi
// GET /api/admin/storage và lib/tech.ts (systemStatus, M31) — tránh viết lại logic.
export const STORAGE_WARN_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

// Tổng dung lượng + số file trong 1 thư mục (đệ quy) — dùng cho panel dung lượng
// lưu trữ (M08) và trạng thái hệ thống (M31).
export async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { bytes: 0, files: 0 };
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    const s = await stat(p).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      const sub = await dirSize(p);
      bytes += sub.bytes;
      files += sub.files;
    } else {
      bytes += s.size;
      files += 1;
    }
  }
  return { bytes, files };
}

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

export function newCorrespondenceFileName(correspondenceId: number, mime: string): string {
  return `cv${correspondenceId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newProjectDocFileName(mime: string): string {
  return `pd-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newWorkFrontFileName(workFrontId: number, mime: string): string {
  return `wf${workFrontId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newEquipmentCertFileName(equipmentId: number, mime: string): string {
  return `eq${equipmentId}-cert-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newProposalDocFileName(proposalId: number, mime: string): string {
  return `dx${proposalId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newClaimDocFileName(claimId: number, mime: string): string {
  return `clm${claimId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime]}`;
}

export function newHseFileName(recordId: number, mime: string): string {
  return `hse${recordId}-${Date.now()}-${randomBytes(4).toString("hex")}${MIME_EXT[mime] ?? ".bin"}`;
}

// Hồ sơ pháp lý (M23, register mới `legal_documents`) — 1 file chính/giấy phép (PDF/ảnh).
export function newLegalDocFileName(legalDocId: number, mime: string): string {
  return `ld${legalDocId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Chứng chỉ nhân sự (M24, register mới `certifications`) — 1 file chính/chứng chỉ (PDF/ảnh).
export function newCertificationFileName(certificationId: number, mime: string): string {
  return `cert${certificationId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Bảo hiểm & bảo lãnh (M28, register mới `insurance_bonds`) — 1 chứng thư chính (PDF/ảnh).
export function newInsuranceDocFileName(insuranceBondId: number, mime: string): string {
  return `ib${insuranceBondId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Giấy phép môi trường (M25, register mới `env_permits`) — 1 file chính/giấy phép (PDF/ảnh).
export function newEnvPermitFileName(envPermitId: number, mime: string): string {
  return `ep${envPermitId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Biên bản bàn giao (M29, `handover_items.minutes_file`) — 1 file gọn/hạng mục (PDF/ảnh).
export function newHandoverMinutesFileName(handoverItemId: number, mime: string): string {
  return `hi${handoverItemId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Tài liệu hướng dẫn O&M (M30, register mới `om_documents`) — thư viện theo dự án,
// không gắn 1 hạng mục cụ thể như legal/certification/insurance nên đặt theo project (pattern newProjectDocFileName).
export function newOmDocFileName(projectId: number, mime: string): string {
  return `om${projectId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
}

// Hồ sơ năng lực NTP (M33, register mới `subcon_documents`) — giấy phép KD/chứng chỉ/
// hồ sơ nhân sự, gắn theo supplier_id (pattern task_documents).
export function newSubconDocFileName(supplierId: number, mime: string): string {
  return `sc${supplierId}-${Date.now()}-${randomBytes(4).toString("hex")}${DOC_MIME_EXT[mime] ?? ".bin"}`;
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

// Ảnh album mốc tiến độ (M31, register `progress_albums` — tái dùng task_photos qua
// album_id, task_id NULL): cùng whitelist mime với ảnh hiện trường.
export function newAlbumPhotoFileName(albumId: number, mime: string): string {
  return `alb${albumId}-${Date.now()}-${randomBytes(4).toString("hex")}${MIME_EXT[mime]}`;
}

// Đường dẫn tuyệt đối tới file ảnh — chặn path traversal (file_name luôn do server sinh,
// nhưng vẫn kiểm tra phòng dữ liệu DB bị sửa tay).
export function photoPath(fileName: string): string | null {
  const p = normalize(join(UPLOAD_DIR, fileName));
  // Bắt buộc nằm TRONG UPLOAD_DIR — thêm separator để 'data/uploads-evil' không lọt.
  if (p !== UPLOAD_DIR && !p.startsWith(UPLOAD_DIR + sep)) return null;
  return p;
}
