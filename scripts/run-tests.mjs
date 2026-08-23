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

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseCoverageTable, mergeCoverageMaps, aggregate } from "./coverage-summary.mjs";

const TEST_DIR = "tests";
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

// C4 §2: "CI phải xuất số pass/fail/skip; skip bắt buộc whitelist và lý do."
//
// Vì sao cần: trước đây runner chỉ đếm SỐ FILE fail. Chạy mà KHÔNG có TEST_DATABASE_URL thì
// toàn bộ test tích hợp tự skip (xem tests/setup.ts) — mọi file vẫn thoát mã 0 và bản tóm tắt
// vẫn báo "0 file fail", trông y hệt một lần chạy xanh thật. Đó là cách một bộ test mục ruỗng
// mà không ai thấy. Nay đếm tới từng CA và tách riêng skip.
//
// `--release-gate` (hoặc RELEASE_GATE=1): mọi ca bị skip đều là LỖI, trừ file có trong
// scripts/test-skip-allowlist.json kèm lý do. Dùng ở cổng phát hành, không dùng khi dev cục bộ
// (dev thường không dựng Postgres).
const releaseGate = process.argv.includes("--release-gate") || process.env.RELEASE_GATE === "1";

let skipAllowlist = {};
try {
  skipAllowlist = JSON.parse(readFileSync(join("scripts", "test-skip-allowlist.json"), "utf8"));
} catch {
  // Không có file allowlist = không cho phép skip nào ở release gate. Mặc định chặt là đúng.
}

// TAP tóm tắt của node:test in ra các dòng "# pass 12" / "# fail 0" / "# skipped 3".
// node:test đổi reporter mặc định theo phiên bản: reporter `tap` in "# pass 11", còn
// reporter `spec` (mặc định từ Node 20+ khi stdout không phải TTY) in "ℹ pass 11". Trước
// đây hàm này chỉ khớp dạng TAP nên trên Node 24 KHÔNG khớp dòng nào — total.pass/fail/
// skipped luôn = 0, và cổng release-gate (chặn dựa trên total.skipped > 0) chưa từng
// kích hoạt. Khớp cả hai dạng để cổng hoạt động thật.
function tapCount(out, label) {
  const m = out.match(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, "m"));
  return m ? Number(m[1]) : 0;
}

const total = { pass: 0, fail: 0, skipped: 0, todo: 0 };
/** file → số ca bị skip, chỉ ghi khi > 0 */
const skippedByFile = {};

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
    // Bắt stdout để đếm được pass/fail/skip rồi in lại NGUYÊN VẸN — người xem log vẫn thấy
    // đúng những gì trước đây thấy, chỉ thêm phần tổng kết ở cuối.
    res = spawnSync(process.execPath, [`--import=${tsxLoader}`, "--test", file], {
      stdio: ["inherit", "pipe", "inherit"],
      encoding: "utf8",
    });
    process.stdout.write(res.stdout ?? "");
  }
  if (res.status !== 0) failed++;

  const out = res.stdout ?? "";
  total.pass += tapCount(out, "pass");
  total.fail += tapCount(out, "fail");
  total.todo += tapCount(out, "todo");
  const skipped = tapCount(out, "skipped");
  total.skipped += skipped;
  if (skipped > 0) skippedByFile[file] = skipped;
}

process.stdout.write(
  `\n=== Tổng: ${files.length} file, ${failed} file fail ` +
    `· ${total.pass} ca pass, ${total.fail} ca fail, ${total.skipped} ca skip, ${total.todo} todo ===\n`,
);

// Skip không phải là pass. Ở chế độ thường chỉ nhắc; ở release gate thì chặn.
if (total.skipped > 0) {
  const base = (f) => f.replace(/^tests[\\/]/, "");
  const khongCoLyDo = Object.keys(skippedByFile).filter((f) => !skipAllowlist[base(f)]);

  process.stdout.write(`\nCa bị SKIP theo file (skip KHÔNG phải pass):\n`);
  for (const [f, n] of Object.entries(skippedByFile)) {
    const lyDo = skipAllowlist[base(f)];
    process.stdout.write(`  - ${f}: ${n} ca${lyDo ? ` — ${lyDo}` : " — CHƯA CÓ LÝ DO"}\n`);
  }

  if (releaseGate && khongCoLyDo.length > 0) {
    process.stdout.write(
      `\n❌ RELEASE GATE: ${khongCoLyDo.length} file có ca bị skip mà chưa khai lý do trong\n` +
        `   scripts/test-skip-allowlist.json. Ở cổng phát hành, test bị skip KHÔNG được tính là pass\n` +
        `   (C4 §2). Thiếu Postgres thì đặt TEST_DATABASE_URL rồi chạy lại, đừng thêm vào allowlist.\n`,
    );
    failed++;
  }
}

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
