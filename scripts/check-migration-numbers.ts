// scripts/check-migration-numbers.ts — Cổng CI: chặn 2+ file migration cùng số thứ tự.
//
// VÌ SAO: khi nhiều nhánh code song song, mỗi nhánh tự chọn số migration kế tiếp theo tên
// file lớn nhất lúc phân nhánh — merge xong dễ đụng cùng số (đã xảy ra thật: `0060_code_lists.sql`
// và `0060_webhooks.sql` từ 2 đợt M52/M49 song song). Runner (lib/db/migrate.ts) sort theo
// chuỗi nên vẫn chạy được, nhưng số để chọn migration kế tiếp không còn tin cậy và thứ tự
// giữa 2 file trùng số chỉ dựa tên chữ cái — mập mờ. Gắn kiểm này vào CI để trùng là đỏ.
//
// Chạy: npx tsx scripts/check-migration-numbers.ts
//  - THOÁT 1 (đỏ) nếu có ≥2 file migration cùng tiền tố số, hoặc file sai định dạng tên.
//  - Khoảng trống số (vd bỏ `0059`) KHÔNG bị coi là lỗi — cố ý không tái dùng số cũ.
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "migrations");

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Tên chuẩn: 4 chữ số + '_' + mô tả. Ghi lại file sai định dạng để bắt sớm.
const NAME_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const byNumber = new Map<string, string[]>();
const malformed: string[] = [];

for (const f of files) {
  const m = NAME_RE.exec(f);
  if (!m) {
    malformed.push(f);
    continue;
  }
  const num = m[1];
  byNumber.set(num, [...(byNumber.get(num) ?? []), f]);
}

const duplicates = [...byNumber.entries()].filter(([, fs]) => fs.length > 1);

console.log("=== Kiểm số thứ tự migration (migrations/) ===");
console.log(`Tổng file .sql: ${files.length}`);

let failed = false;

if (malformed.length) {
  failed = true;
  console.error(
    `\n[LỖI] File migration sai định dạng tên (cần 'NNNN_ten.sql', 4 chữ số):\n  - ${malformed.join(
      "\n  - ",
    )}`,
  );
}

if (duplicates.length) {
  failed = true;
  const lines = duplicates.map(([num, fs]) => `${num}: ${fs.join(", ")}`);
  console.error(
    `\n[LỖI] Nhiều file migration cùng số thứ tự:\n  - ${lines.join(
      "\n  - ",
    )}\n\nĐổi tên file mới sang số CHƯA dùng (số lớn nhất hiện có + 1). File đã áp production` +
      ` chỉ đổi tên khi DDL idempotent và có ghi chú (xem PROGRESS.md mục Nợ kỹ thuật).`,
  );
}

if (failed) process.exit(1);

console.log("\n[OK] Mỗi migration một số thứ tự duy nhất, tên đúng định dạng.");
