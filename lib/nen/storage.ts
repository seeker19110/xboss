// Lớp trừu tượng lưu trữ file (M54 GĐ1 PR4) — thay việc gọi trực tiếp fs trên
// data/uploads/ ở khắp các route bằng 3 hàm storagePut/storageGet/storageDelete.
//
// Hai backend, tự chọn theo biến môi trường (KHÔNG throw khi thiếu — pattern như
// VAPID/SENTRY/Google Sheets: thiếu cấu hình thì im lặng dùng đường mặc định):
//   - LOCAL (mặc định): ghi thẳng vào data/uploads/<fileName> phẳng, HÀNH VI Y HỆT
//     trước PR4 — không có prefix org/, để không phá bất kỳ file đã upload nào trên
//     production và để test hiện tại (không có S3 env) tiếp tục pass.
//   - S3-compatible (MinIO tự host → S3 thật, chỉ đổi endpoint): kích hoạt khi có ĐỦ
//     S3_ENDPOINT + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY + S3_BUCKET. Key có prefix
//     org/<org_id>/<fileName> (bucket mới, không có dữ liệu cũ cần tương thích ngược).
//
// Hàng rào bảo mật hiện có (tên file do server sinh, mime sniffing, hash sha256, giới
// hạn kích thước) vẫn nằm ở route/lib/photos như cũ — lớp này chỉ lo NƠI cất file, và
// thêm 1 lần kiểm path traversal tập trung cho `fileName` trước khi dựng path/key.
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { UPLOAD_DIR, ensureUploadDir } from "@/lib/nen/photos";
import { log } from "@/lib/nen/log";

// --- Kiểm path traversal (tập trung 1 chỗ cho cả 2 backend) ---
// `fileName` luôn do server sinh (lib/photos.new*FileName) nên hợp lệ, nhưng vẫn kiểm
// phòng dữ liệu DB bị sửa tay — không cho phép tên chứa dấu tách thư mục hay '..'.
function assertSafeFileName(fileName: string): void {
  if (
    !fileName ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("..") ||
    fileName.includes("\0")
  ) {
    throw new Error(`Tên file không hợp lệ (path traversal?): ${JSON.stringify(fileName)}`);
  }
}

// Đường dẫn tuyệt đối an toàn trong UPLOAD_DIR (belt-and-suspenders sau assertSafeFileName).
function localPath(fileName: string): string {
  assertSafeFileName(fileName);
  const p = normalize(join(UPLOAD_DIR, fileName));
  if (p !== UPLOAD_DIR && !p.startsWith(UPLOAD_DIR + sep)) {
    throw new Error(`Tên file thoát khỏi thư mục lưu trữ: ${JSON.stringify(fileName)}`);
  }
  return p;
}

// --- Cấu hình & client S3 (lazy, memoized) ---
type S3State = { client: S3Client; bucket: string };
let s3State: S3State | null | undefined; // undefined = chưa resolve, null = dùng local
let warnedPartial = false;

function resolveS3(): S3State | null {
  if (s3State !== undefined) return s3State;

  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    // Cấu hình dở dang (có 1 vài biến nhưng thiếu biến khác) → cảnh báo 1 lần, dùng local.
    if ((endpoint || accessKeyId || secretAccessKey || bucket) && !warnedPartial) {
      warnedPartial = true;
      log.warn(
        "Cấu hình S3 không đủ (cần S3_ENDPOINT + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY + S3_BUCKET) — dùng local disk data/uploads/",
      );
    }
    s3State = null;
    return null;
  }

  const region = process.env.S3_REGION || "us-east-1";
  // MinIO bắt buộc path-style; mặc định bật khi có endpoint tuỳ chỉnh, cho tắt qua env.
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE
    ? process.env.S3_FORCE_PATH_STYLE === "true"
    : true;

  s3State = {
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
  return s3State;
}

// Key trên S3 — prefix theo org để cô lập dữ liệu giữa các tổ chức (multi-tenant).
function s3Key(orgId: number, fileName: string): string {
  assertSafeFileName(fileName);
  return `org/${orgId}/${fileName}`;
}

// Lỗi "không tìm thấy object" của S3 (SDK v3): name='NoSuchKey' hoặc HTTP 404.
function isS3NotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}

/**
 * Lưu file. `orgId` chỉ dùng khi backend là S3 (làm prefix key); backend local bỏ qua
 * orgId, ghi phẳng data/uploads/<fileName> như trước PR4.
 */
export async function storagePut(orgId: number, fileName: string, buf: Buffer): Promise<void> {
  const s3 = resolveS3();
  if (s3) {
    await s3.client.send(
      new PutObjectCommand({ Bucket: s3.bucket, Key: s3Key(orgId, fileName), Body: buf }),
    );
    return;
  }
  ensureUploadDir();
  await writeFile(localPath(fileName), buf);
}

/**
 * Đọc file — trả `null` khi không tồn tại (caller thường trả 404). Ném lỗi với các sự cố
 * khác (I/O, mạng S3) để không nuốt lỗi thật.
 */
export async function storageGet(orgId: number, fileName: string): Promise<Buffer | null> {
  const s3 = resolveS3();
  if (s3) {
    try {
      const res = await s3.client.send(
        new GetObjectCommand({ Bucket: s3.bucket, Key: s3Key(orgId, fileName) }),
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
  }
  try {
    return await readFile(localPath(fileName));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Xoá file — không ném lỗi nếu file không còn tồn tại (idempotent). `fileName` không hợp
 * lệ vẫn ném (phát hiện dữ liệu bất thường sớm).
 */
export async function storageDelete(orgId: number, fileName: string): Promise<void> {
  const s3 = resolveS3();
  if (s3) {
    try {
      // DeleteObject của S3 vốn idempotent (không lỗi khi thiếu key), vẫn nuốt NotFound cho chắc.
      await s3.client.send(
        new DeleteObjectCommand({ Bucket: s3.bucket, Key: s3Key(orgId, fileName) }),
      );
    } catch (err) {
      if (!isS3NotFound(err)) throw err;
    }
    return;
  }
  // Local: kiểm tên hợp lệ trước, rồi nuốt lỗi "file đã mất trên đĩa" như hành vi cũ.
  const p = localPath(fileName);
  await unlink(p).catch(() => {
    /* file đã mất trên đĩa — bỏ qua */
  });
}

/** Chỉ dùng trong test — reset cache backend để đọc lại env giữa các ca. */
export function __resetStorageBackendCache(): void {
  s3State = undefined;
  warnedPartial = false;
}
