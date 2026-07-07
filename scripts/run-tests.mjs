#!/usr/bin/env node
// Chạy TỪNG file test trong 1 process Node riêng, tuần tự.
//
// Vì sao không gộp hết vào 1 lệnh `tsx --test tests/*.ts`: toàn bộ test tích hợp chạm
// CHUNG 1 Postgres (TEST_DATABASE_URL). Khi nhiều file chạy song song trong cùng process
// (mặc định của node:test), chúng đụng nhau trên bảng dùng chung — ví dụ 1 file
// `DELETE FROM users` trong lúc file khác đang giữ khoá FK tới users, hoặc cache
// module-level (kiểu `defaultUsersEnsured` trong lib/auth) rò rỉ giữa các file — gây
// fail NGẪU NHIÊN ở file không liên quan gì tới thay đổi đang kiểm. Cô lập theo process
// + chạy tuần tự loại hẳn 2 lớp lỗi này (mỗi file có module cache + pool riêng, và tại
// mỗi thời điểm chỉ 1 file chạm DB). Đổi chút tốc độ lấy độ tin cậy — đúng đắn cho test.
//
// Cách chạy 1 file lẻ khi debug: `npx tsx --test tests/<ten>.test.ts` (như cũ).

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const TEST_DIR = "tests";
const tsx = join("node_modules", ".bin", "tsx");

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .sort()
  .map((f) => join(TEST_DIR, f));

let failed = 0;
for (const file of files) {
  process.stdout.write(`\n=== ${file} ===\n`);
  const res = spawnSync(tsx, ["--test", file], { stdio: "inherit" });
  if (res.status !== 0) failed++;
}

process.stdout.write(`\n=== Tổng: ${files.length} file, ${failed} file fail ===\n`);
process.exit(failed > 0 ? 1 : 0);
