// Di trú file từ data/uploads/ (local disk) lên object storage S3-compatible (M54 GĐ1 PR4).
//
// Với MỖI file trong data/uploads/: tính sha256 nguồn → storagePut lên S3 → storageGet
// đọc lại từ S3 → so sha256 để verify toàn vẹn từng file. In kết quả OK/FAIL. KHÔNG xoá
// file gốc tự động — cuối cùng in danh sách file đã verify OK để người vận hành tự xoá tay
// sau khi an tâm.
//
// Chạy: npx tsx scripts/ops/migrate-uploads-to-s3.ts
// BẮT BUỘC cấu hình S3 trước (S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_BUCKET) —
// thiếu thì lib/storage rơi về local disk, không di trú được, nên script fail-fast ở đây.
//
// GIAI ĐOẠN 1 (single-org): mọi file dùng org mặc định = 1, khớp cách các route hiện truyền
// user.orgId (org duy nhất) — khi thật sự multi-tenant, viết lại theo bảng mapping file→org.
import "../env";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { UPLOAD_DIR } from "../../lib/photos";
import { storagePut, storageGet } from "../../lib/storage";

const DEFAULT_ORG_ID = 1;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function assertS3Configured(): void {
  const missing = ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"].filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    throw new Error(
      `Cần cấu hình S3 trước khi chạy script này — thiếu: ${missing.join(", ")}. ` +
        `Đặt S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_BUCKET (và tuỳ chọn S3_REGION/S3_FORCE_PATH_STYLE) rồi chạy lại.`,
    );
  }
}

async function main() {
  assertS3Configured();

  let names: string[];
  try {
    names = await readdir(UPLOAD_DIR);
  } catch {
    console.log(`Không có thư mục ${UPLOAD_DIR} hoặc rỗng — không có gì để di trú.`);
    return;
  }

  const ok: string[] = [];
  const failed: string[] = [];
  for (const name of names) {
    // Bỏ qua thư mục con / file ẩn — data/uploads/ vốn phẳng, tên file do server sinh.
    if (name.startsWith(".")) continue;
    let srcBuf: Buffer;
    try {
      srcBuf = await readFile(join(UPLOAD_DIR, name));
    } catch {
      continue; // không phải file thường (vd thư mục) → bỏ qua
    }
    const srcHash = sha256(srcBuf);
    try {
      await storagePut(DEFAULT_ORG_ID, name, srcBuf);
      const back = await storageGet(DEFAULT_ORG_ID, name);
      if (!back) {
        failed.push(name);
        console.error(`FAIL ${name} — đọc lại từ S3 trả null`);
        continue;
      }
      if (sha256(back) !== srcHash) {
        failed.push(name);
        console.error(`FAIL ${name} — sha256 không khớp (nguồn ${srcHash})`);
        continue;
      }
      ok.push(name);
      console.log(`OK   ${name} (${srcBuf.length} bytes, sha256 ${srcHash})`);
    } catch (err) {
      failed.push(name);
      console.error(`FAIL ${name} —`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n== Tổng kết ==`);
  console.log(`Đã verify OK: ${ok.length} file`);
  console.log(`Thất bại:     ${failed.length} file`);
  if (ok.length > 0) {
    console.log(
      `\nCác file đã verify OK (an toàn để xoá tay khỏi data/uploads/ SAU KHI đã kiểm chứng):`,
    );
    for (const n of ok) console.log(`  ${n}`);
  }
  if (failed.length > 0) {
    console.error(
      `\nCòn ${failed.length} file thất bại — KHÔNG xoá file gốc cho tới khi xử lý xong.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
