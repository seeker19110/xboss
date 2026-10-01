// scripts/gate.ts — `npm run gate`: chạy cục bộ ĐÚNG các cổng CI trước khi push/mở PR (ADR-0012).
//
// Port "verification-loop" của ECC: thay vì 6 pha chung chung, chạy chính các bước của job
// `static` trong .github/workflows/ci.yml (đọc động, xem scripts/lib/gate-steps.ts) + cổng
// PROGRESS.md của nhánh, rồi in báo cáo SẴN SÀNG / CHƯA SẴN SÀNG. Skill `/gate` gọi lệnh này.
//
//   npm run gate               # cổng tĩnh (format, lint, typecheck, check:*) + PROGRESS
//   npm run gate -- --test     # + npm test (có TEST_DATABASE_URL → --release-gate như CI)
//   npm run gate -- --build    # + npm run build
//
// Chạy HẾT các bước rồi mới báo (không dừng ở bước đỏ đầu tiên) để sửa một lượt.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { docBuocCi } from "./lib/gate-steps";

interface KetQua {
  ten: string;
  lenh: string;
  ok: boolean;
  ms: number;
  ghiChu?: string;
  out: string;
}

function chay(ten: string, lenh: string, args: string[], ghiChu?: string): KetQua {
  const bd = Date.now();
  const r = spawnSync(lenh, args, { encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const ok = r.status === 0;
  process.stdout.write(`${ok ? "✔" : "✘"} ${ten} (${((Date.now() - bd) / 1000).toFixed(1)}s)\n`);
  return { ten, lenh: [lenh, ...args].join(" "), ok, ms: Date.now() - bd, ghiChu, out };
}

const argv = process.argv.slice(2);
const buoc = docBuocCi(readFileSync(".github/workflows/ci.yml", "utf8"));
const kq: KetQua[] = [];

console.log(`=== Gate cục bộ: ${buoc.length} bước job "static" của ci.yml ===`);
for (const b of buoc) kq.push(chay(b.ten, "npm", ["run", "-s", b.script]));

kq.push(
  chay("PROGRESS.md cập nhật trên nhánh (so origin/main)", "npx", [
    "tsx",
    "scripts/check-progress-freshness.ts",
    "--base",
    "origin/main",
  ]),
);

if (argv.includes("--test")) {
  if (process.env.TEST_DATABASE_URL) {
    kq.push(chay("Test (Postgres, --release-gate)", "npm", ["test", "--", "--release-gate"]));
  } else {
    kq.push(
      chay(
        "Test (KHÔNG có TEST_DATABASE_URL)",
        "npm",
        ["test"],
        "test tích hợp bị skip — CI chạy thật trên Postgres, kết quả ở đây CHƯA đủ",
      ),
    );
  }
}
if (argv.includes("--build")) kq.push(chay("Build", "npm", ["run", "build"]));

const do_ = kq.filter((k) => !k.ok);
console.log("\nBÁO CÁO GATE\n============");
for (const k of kq) {
  console.log(
    `${k.ok ? "PASS" : "FAIL"}  ${k.ten}  [${k.lenh}]${k.ghiChu ? `  — ${k.ghiChu}` : ""}`,
  );
}
for (const k of do_) {
  console.log(`\n── ${k.ten} ──\n${k.out.trim().split("\n").slice(-40).join("\n")}`);
}
const thieu = [!argv.includes("--test") && "test", !argv.includes("--build") && "build"].filter(
  Boolean,
);
console.log(
  `\nTổng: ${do_.length === 0 ? "SẴN SÀNG" : "CHƯA SẴN SÀNG"} (${kq.length - do_.length}/${kq.length} xanh)` +
    (thieu.length ? ` — chưa chạy: ${thieu.join(", ")} (thêm --test/--build trước khi mở PR)` : ""),
);
process.exit(do_.length === 0 ? 0 : 1);
