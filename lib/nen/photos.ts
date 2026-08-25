// Lưu trữ ảnh hiện trường — file nằm trong data/uploads/ (ngoài git),
// metadata trong bảng task_photos. Tên file do server sinh, không tin client.
import { mkdirSync, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";

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

// Dò mime THẬT từ magic byte đầu file — không tin `Content-Type` client tự khai
// (dễ giả mạo: đổi phần mở rộng/header request để lách whitelist mime). Chỉ nhận
// diện đúng các định dạng dự án cho upload; không nhận diện được → null (caller từ chối).
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (
    buf.length >= 6 &&
    (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")
  )
    return "image/gif";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 4, 8) === "ftyp" &&
    ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(
      buf.toString("ascii", 8, 12).replace(/\0/g, "").trim(),
    )
  )
    return "image/heic";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

// Vài client khai mime không chuẩn cho cùng 1 định dạng thật (vd Safari/iOS khai
// "image/heif" cho ảnh .heic) — coi cùng họ khi đối chiếu với kết quả sniff.
const MIME_DECLARE_ALIASES: Record<string, string> = {
  "image/heif": "image/heic",
  "image/jpg": "image/jpeg",
};

// Đối chiếu nội dung file thật (magic byte) với mime client khai báo — trả về mime
// ĐÃ XÁC THỰC (dùng để chọn phần mở rộng/lưu DB) hoặc `null` nếu không khớp/không
// nhận diện được (client giả mạo Content-Type, hoặc file hỏng/không phải định dạng
// cho phép). Luôn gọi hàm này trên buffer thật SAU KHI đọc file, không chỉ dựa
// `file.type` để quyết định chấp nhận upload.
export function verifyFileMime(buf: Buffer, declaredMime: string): string | null {
  const sniffed = sniffMime(buf);
  if (!sniffed) return null;
  const declared = MIME_DECLARE_ALIASES[declaredMime] ?? declaredMime;
  return sniffed === declared ? sniffed : null;
}

// Tài liệu đính kèm (biên bản nghiệm thu): PDF hoặc ảnh, tối đa 20MB.
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
const DOC_MIME_EXT: Record<string, string> = { ...MIME_EXT, "application/pdf": ".pdf" };

export function extForDocMime(mime: string): string | null {
  return DOC_MIME_EXT[mime] ?? null;
}

// Tên tệp do MÁY CHỦ sinh (không tin tên client gửi): `<tiền tố><id>-<ms>-<8 hex><ext>`.
// Mọi register đều theo đúng khuôn này, chỉ khác tiền tố — gom về một chỗ để
// không lặp lại biểu thức sinh tên ở 20 hàm bên dưới.
export function newUploadFileName(
  prefix: string,
  mime: string,
  accept: UploadAccept = "document",
): string {
  const ext = (accept === "image" ? MIME_EXT[mime] : DOC_MIME_EXT[mime]) ?? ".bin";
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
}

export function newDocFileName(taskId: number, mime: string): string {
  return newUploadFileName(`d${taskId}`, mime);
}

export function newContractDocFileName(contractId: number, mime: string): string {
  return newUploadFileName(`ct${contractId}`, mime);
}

export function newFloorDocFileName(floorApprovalId: number, mime: string): string {
  return newUploadFileName(`fa${floorApprovalId}`, mime);
}

export function newVoDocFileName(voId: number, mime: string): string {
  return newUploadFileName(`vo${voId}`, mime);
}

export function newTenderBidFileName(bidId: number, mime: string): string {
  return newUploadFileName(`bid${bidId}`, mime);
}

export function newCorrespondenceFileName(correspondenceId: number, mime: string): string {
  return newUploadFileName(`cv${correspondenceId}`, mime);
}

// Bản vẽ CAD đã chuẩn hoá lưu qua lớp storage (M99): tên PHẲNG do máy chủ sinh để storageGet()
// đọc lại được; đường dẫn theo cây ISO 19650 lưu riêng ở cột `drawing_revisions.iso_path`.
export function newStandardizedDrawingFileName(ext = "dxf"): string {
  const safeExt = (ext || "dxf").toLowerCase().replace(/[^a-z0-9]/g, "") || "dxf";
  return `cad-${Date.now()}-${randomBytes(4).toString("hex")}.${safeExt}`;
}

// Thư viện block chuẩn của bộ lệnh vẽ (M100 PR2, bảng `cad_block_libs`): tệp `.dwg` nhị phân do
// người phát hành nộp — máy chủ chỉ lưu, không đọc (M100 §12). Version nằm trong tên tệp để đối
// chiếu nhanh khi soi thư mục lưu trữ, phần ngẫu nhiên giữ nguyên quy ước chống đoán tên.
export function newBlockLibFileName(version: string): string {
  const safeVersion =
    version
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
      .slice(0, 16) || "x";
  return `blocklib-${safeVersion}-${Date.now()}-${randomBytes(4).toString("hex")}.dwg`;
}

export function newProjectDocFileName(mime: string): string {
  return newUploadFileName("pd", mime);
}

export function newWorkFrontFileName(workFrontId: number, mime: string): string {
  return newUploadFileName(`wf${workFrontId}`, mime);
}

// Biên bản/ảnh của trang "Mặt bằng thi công" bản mới (tầng × công tác thi công, M46).
export function newFloorStageFrontFileName(floorStageFrontId: number, mime: string): string {
  return newUploadFileName(`fsf${floorStageFrontId}`, mime);
}

export function newEquipmentCertFileName(equipmentId: number, mime: string): string {
  return newUploadFileName(`eq${equipmentId}-cert`, mime);
}

export function newProposalDocFileName(proposalId: number, mime: string): string {
  return newUploadFileName(`dx${proposalId}`, mime);
}

export function newClaimDocFileName(claimId: number, mime: string): string {
  return newUploadFileName(`clm${claimId}`, mime);
}

export function newHseFileName(recordId: number, mime: string): string {
  return newUploadFileName(`hse${recordId}`, mime, "image");
}

// Hồ sơ pháp lý (M23, register mới `legal_documents`) — 1 file chính/giấy phép (PDF/ảnh).
export function newLegalDocFileName(legalDocId: number, mime: string): string {
  return newUploadFileName(`ld${legalDocId}`, mime);
}

// Chứng chỉ nhân sự (M24, register mới `certifications`) — 1 file chính/chứng chỉ (PDF/ảnh).
export function newCertificationFileName(certificationId: number, mime: string): string {
  return newUploadFileName(`cert${certificationId}`, mime);
}

// Bảo hiểm & bảo lãnh (M28, register mới `insurance_bonds`) — 1 chứng thư chính (PDF/ảnh).
export function newInsuranceDocFileName(insuranceBondId: number, mime: string): string {
  return newUploadFileName(`ib${insuranceBondId}`, mime);
}

// Giấy phép môi trường (M25, register mới `env_permits`) — 1 file chính/giấy phép (PDF/ảnh).
export function newEnvPermitFileName(envPermitId: number, mime: string): string {
  return newUploadFileName(`ep${envPermitId}`, mime);
}

// Biên bản bàn giao (M29, `handover_items.minutes_file`) — 1 file gọn/hạng mục (PDF/ảnh).
export function newHandoverMinutesFileName(handoverItemId: number, mime: string): string {
  return newUploadFileName(`hi${handoverItemId}`, mime);
}

// Tài liệu hướng dẫn O&M (M30, register mới `om_documents`) — thư viện theo dự án,
// không gắn 1 hạng mục cụ thể như legal/certification/insurance nên đặt theo project (pattern newProjectDocFileName).
export function newOmDocFileName(projectId: number, mime: string): string {
  return newUploadFileName(`om${projectId}`, mime);
}

// Hồ sơ năng lực NTP (M33, register mới `subcon_documents`) — giấy phép KD/chứng chỉ/
// hồ sơ nhân sự, gắn theo supplier_id (pattern task_documents).
export function newSubconDocFileName(supplierId: number, mime: string): string {
  return newUploadFileName(`sc${supplierId}`, mime);
}

// Hash nội dung file (hex) — tính lúc upload (task_documents/claim_documents/
// contract_documents/vo_documents, cột sha256, M43 PR3) và đối chiếu lại lúc tải xuống
// để phát hiện file trên đĩa bị tráo/hỏng ngoài ý muốn.
export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// Chặn sớm request multipart quá lớn dựa vào header Content-Length — TRƯỚC KHI
// buffer toàn bộ body qua req.formData(), né DoS bộ nhớ với file khổng lồ. Thiếu
// header (vd chunked transfer) → bỏ qua, vẫn có check `file.size` sau formData()
// làm lưới an toàn cuối như cũ. +64KB dung sai cho boundary/header multipart.
export function isContentTooLarge(contentLengthHeader: string | null, maxBytes: number): boolean {
  if (!contentLengthHeader) return false;
  const n = Number(contentLengthHeader);
  return Number.isFinite(n) && n > maxBytes + 64 * 1024;
}

// ── Pipeline kiểm tệp upload dùng chung ──────────────────────────────────────
// Cùng một chuỗi kiểm được lặp nguyên si ở 25 route upload: chặn sớm theo
// Content-Length → đọc multipart → whitelist mime theo phần mở rộng → chặn theo
// `file.size` → dò magic byte chống giả mạo Content-Type. Gom về đây để sửa một
// chỗ là mọi route được hưởng (vd bổ sung định dạng, siết ngưỡng).
//
// Trả KẾT QUẢ THUẦN (`ok` + `status` + `error`), KHÔNG trả `NextResponse` —
// lib/nen là tầng 0 không biết gì về HTTP (ADR-0007/0008); route tự bọc.

/** `image` = chỉ ảnh (extForMime); `document` = PDF hoặc ảnh (extForDocMime). */
export type UploadAccept = "image" | "document";

export type UploadCheckOptions = {
  accept: UploadAccept;
  /** Mặc định: MAX_PHOTO_BYTES cho ảnh, MAX_DOC_BYTES cho tài liệu. */
  maxBytes?: number;
  /** Danh từ trong thông báo lỗi dung lượng ("Ảnh"/"File"/"Bản vẽ"). */
  noun?: string;
};

export type UploadRejected = { ok: false; status: 400 | 413 | 415; error: string };
export type UploadChecked = {
  ok: true;
  /** Chính `File` đã kiểm — route dùng tiếp `file.type`/`file.size`/`file.name`. */
  file: File;
  /** Nội dung tệp đã buffer — dùng cho storagePut/sha256Hex. */
  buf: Buffer;
  /** Phần mở rộng suy từ mime ĐÃ kiểm (không lấy từ tên tệp client gửi). */
  ext: string;
  mime: string;
  size: number;
  originalName: string | null;
};

function defaultMaxBytes(accept: UploadAccept): number {
  return accept === "image" ? MAX_PHOTO_BYTES : MAX_DOC_BYTES;
}

function tooLargeMessage(noun: string, maxBytes: number): string {
  return `${noun} quá lớn (tối đa ${maxBytes / 1024 / 1024}MB)`;
}

/**
 * Kiểm 1 `File` đã có trong tay: whitelist mime → dung lượng → magic byte.
 * Dùng cho route PATCH có tệp đính kèm TUỲ CHỌN (hồ sơ pháp lý, chứng chỉ,
 * bảo hiểm, giấy phép môi trường...) — nơi form đã được đọc trước đó.
 */
export async function checkUploadedFile(
  file: File,
  opts: UploadCheckOptions,
): Promise<UploadChecked | UploadRejected> {
  const maxBytes = opts.maxBytes ?? defaultMaxBytes(opts.accept);
  const noun = opts.noun ?? (opts.accept === "image" ? "Ảnh" : "File");

  const ext = opts.accept === "image" ? extForMime(file.type) : extForDocMime(file.type);
  if (!ext) {
    const allowed =
      opts.accept === "image"
        ? "Chỉ nhận file ảnh (jpg/png/webp/gif/heic)"
        : "Chỉ nhận PDF hoặc ảnh (jpg/png/webp/gif/heic)";
    return {
      ok: false,
      status: 415,
      error: `${allowed}, nhận được: ${file.type || "không rõ"}`,
    };
  }
  if (file.size > maxBytes) {
    return { ok: false, status: 413, error: tooLargeMessage(noun, maxBytes) };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!verifyFileMime(buf, file.type)) {
    return {
      ok: false,
      status: 415,
      error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)",
    };
  }

  return {
    ok: true,
    file,
    buf,
    ext,
    mime: file.type,
    size: file.size,
    originalName: file.name || null,
  };
}

export type UploadParseOptions = UploadCheckOptions & {
  /** Tên field chứa tệp trong multipart. Mặc định `file`. */
  field?: string;
  /** Thông báo khi thiếu tệp. Mặc định suy từ `accept`. */
  missingError?: string;
};

export type UploadParsed = UploadChecked & {
  /** FormData gốc — route đọc thêm field riêng (rev, kind...) từ đây. */
  form: FormData;
  /** Field `caption` đã trim; rỗng → null. */
  caption: string | null;
};

/**
 * Đọc multipart và kiểm tệp bắt buộc trong đó — pipeline đầy đủ cho các route
 * upload chuyên dụng (ảnh hiện trường, tài liệu đính kèm theo thực thể...).
 */
export async function parseUploadedFile(
  req: { headers: Headers; formData(): Promise<FormData> },
  opts: UploadParseOptions,
): Promise<UploadParsed | UploadRejected> {
  const maxBytes = opts.maxBytes ?? defaultMaxBytes(opts.accept);
  const noun = opts.noun ?? (opts.accept === "image" ? "Ảnh" : "File");

  if (isContentTooLarge(req.headers.get("content-length"), maxBytes)) {
    return { ok: false, status: 413, error: tooLargeMessage(noun, maxBytes) };
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get(opts.field ?? "file");
  if (!form || !(file instanceof File)) {
    return {
      ok: false,
      status: 400,
      error:
        opts.missingError ??
        (opts.accept === "image"
          ? `Thiếu file ảnh (field '${opts.field ?? "file"}')`
          : `Thiếu file (field '${opts.field ?? "file"}')`),
    };
  }

  const checked = await checkUploadedFile(file, { ...opts, maxBytes, noun });
  if (!checked.ok) return checked;

  return {
    ...checked,
    form,
    caption: String(form.get("caption") ?? "").trim() || null,
  };
}

export function ensureUploadDir(): string {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function newBbntFileName(wpId: number, mime: string): string {
  return newUploadFileName(`wp${wpId}-bbnt`, mime);
}

export function newDrawingFileName(wpId: number, mime: string): string {
  return newUploadFileName(`wp${wpId}-drw`, mime);
}

// Revision bản vẽ (M8, register mới `drawings`/`drawing_revisions`): PDF/ảnh, tối đa 50MB
// (bản vẽ nặng hơn biên bản/tài liệu thường).
export const MAX_DRAWING_BYTES = 50 * 1024 * 1024;

export function newDrawingRevisionFileName(drawingId: number, rev: string, mime: string): string {
  const safeRev = rev.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "x";
  return newUploadFileName(`dr${drawingId}-${safeRev}`, mime);
}

export function newPhotoFileName(taskId: number, mime: string): string {
  return newUploadFileName(`t${taskId}`, mime, "image");
}

// (Đã bỏ photoPath() ở PR4 M54 — kiểm path traversal + dựng đường dẫn cục bộ chuyển hết
// vào lib/storage.ts để tập trung 1 chỗ cho cả 2 backend local/S3.)

// Ảnh album mốc tiến độ (M31, register `progress_albums` — tái dùng task_photos qua
// album_id, task_id NULL): cùng whitelist mime với ảnh hiện trường.
export function newAlbumPhotoFileName(albumId: number, mime: string): string {
  return newUploadFileName(`alb${albumId}`, mime, "image");
}

export function newSystemUploadFileName(systemId: number, kind: string, mime: string): string {
  const ext =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ? ".xlsx" : ".bin";
  return `sys${systemId}-${kind}-${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
}
