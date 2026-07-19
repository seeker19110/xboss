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
import { parseCoverageTable, mergeCoverageMaps, aggregate } from "./coverage-summary.mjs";

const TEST_DIR = "tests";
const tsx = join("node_modules", ".bin", "tsx");
const tsxLoader = "./" + join("node_modules", "tsx", "dist", "loader.mjs");

// `npm run test:coverage` gọi `node --experimental-test-coverage scripts/run-tests.mjs` —
// cờ này truyền cho tiến trình cha, không tự lan xuống các tiến trình con `tsx --test <file>`
// (mỗi file test chạy 1 tiến trình riêng để cách ly DB, xem comment ở trên). Phát hiện cờ qua
// process.execArgv rồi chủ động thêm lại cho từng tiến trình con.
const coverageMode = process.execArgv.includes("--experimental-test-coverage");

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .sort()
  .map((f) => join(TEST_DIR, f));

let failed = 0;
const coverageMaps = [];
for (const file of files) {
  process.stdout.write(`\n=== ${file} ===\n`);
  let res;
  if (coverageMode) {
    // dùng `node --import=tsx-loader --test` thay vì binary `tsx` để truyền được cờ coverage;
    // bắt stdout để vừa in lại vừa trích bảng coverage, giữ stderr/stdin inherit như cũ.
    res = spawnSync(
      process.execPath,
      ["--experimental-test-coverage", `--import=${tsxLoader}`, "--test", file],
      { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" },
    );
    process.stdout.write(res.stdout ?? "");
    if (res.stdout) coverageMaps.push(parseCoverageTable(res.stdout));
  } else {
    res = spawnSync(tsx, ["--test", file], { stdio: "inherit" });
  }
  if (res.status !== 0) failed++;
}

process.stdout.write(`\n=== Tổng: ${files.length} file, ${failed} file fail ===\n`);

if (coverageMode) {
  const merged = mergeCoverageMaps(coverageMaps);
  const summary = aggregate(merged);
  process.stdout.write(`\n=== Coverage tổng hợp (lib/**, app/api/**) ===\n`);
  if (!summary) {
    process.stdout.write("Không thu được số liệu coverage nào trong phạm vi lib/**, app/api/**.\n");
  } else {
    process.stdout.write(`Số file trong phạm vi: ${summary.files}\n`);
    process.stdout.write(`lines:    ${summary.line.toFixed(2)}%\n`);
    process.stdout.write(`branches: ${summary.branch.toFixed(2)}%\n`);
    process.stdout.write(`funcs:    ${summary.funcs.toFixed(2)}%\n`);
    process.stdout.write(
      `(Ghi chú: coverage built-in node:test không có cột "stmts" riêng — coi lines ≈ stmts.\n` +
        `Số liệu gộp bằng cách lấy % lớn nhất đo được mỗi file qua các tiến trình test riêng lẻ,\n` +
        `xem giải thích trong scripts/coverage-summary.mjs — là mốc đo xấp xỉ, không phải số\n` +
        `tuyệt đối như c8/istanbul merge nhiều tiến trình.)\n`,
    );
  }
}

process.exit(failed > 0 ? 1 : 0);
