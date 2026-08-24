// scripts/check-coverage.ts — Cổng CI "ratchet" coverage: chặn tụt coverage âm thầm.
//
// VÌ SAO: `npm run test:coverage` đã đo được số, nhưng mốc so sánh trước đây chỉ nằm
// trong PROGRESS.md — một dòng tài liệu, không ai bắt buộc cập nhật, không ai chặn khi
// tụt. Cổng này biến mốc đó thành file JSON nhỏ (`coverage-baseline.json`) và một script
// so sánh: đo lại thật, tụt quá NGƯỠNG ĐỆM thì đỏ.
//
// Vì sao có ngưỡng đệm (1 điểm %): số đo coverage built-in của node:test có nhiễu nhỏ
// giữa các lần chạy (thứ tự file, cách gộp % lớn nhất qua nhiều tiến trình — xem
// scripts/coverage-summary.mjs) — không đệm sẽ đỏ oan vì nhiễu đo, không phải vì code tệ đi.
//
// Vượt mốc: KHÔNG tự ghi đè coverage-baseline.json (tránh commit tự động ngoài ý muốn) —
// chỉ in gợi ý để người review tự cập nhật khi thấy hợp lý.
//
// Chạy: npx tsx scripts/check-coverage.ts (cần TEST_DATABASE_URL trỏ Postgres thật —
// thiếu DB thì phần lớn ca tích hợp SKIP, số đo sẽ thấp giả tạo và cổng vô nghĩa).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(root, "coverage-baseline.json");
const BUFFER = 1; // điểm % — xem giải thích ở đầu file

type Baseline = {
  measuredAt: string;
  files: number;
  lines: number;
  branches: number;
  funcs: number;
};

function docBaseline(): Baseline {
  const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  for (const k of ["files", "lines", "branches", "funcs"] as const) {
    if (typeof raw[k] !== "number") {
      throw new Error(`coverage-baseline.json thiếu hoặc sai kiểu trường "${k}"`);
    }
  }
  return raw as Baseline;
}

/** Trích 4 số từ output text của `npm run test:coverage` (in bởi scripts/run-tests.mjs). */
function parseSummary(
  out: string,
): { files: number; lines: number; branches: number; funcs: number } | null {
  const files = out.match(/Số file trong phạm vi:\s*(\d+)/);
  const lines = out.match(/^lines:\s*([\d.]+)%/m);
  const branches = out.match(/^branches:\s*([\d.]+)%/m);
  const funcs = out.match(/^funcs:\s*([\d.]+)%/m);
  if (!files || !lines || !branches || !funcs) return null;
  return {
    files: Number(files[1]),
    lines: Number(lines[1]),
    branches: Number(branches[1]),
    funcs: Number(funcs[1]),
  };
}

console.log("=== Đo coverage thật (lib/**, app/api/**) — cần TEST_DATABASE_URL ===");
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    "[LỖI] Thiếu TEST_DATABASE_URL — không có DB thì phần lớn ca tích hợp SKIP, số đo coverage" +
      " sẽ thấp giả tạo và cổng này vô nghĩa. Trỏ TEST_DATABASE_URL tới Postgres thật rồi chạy lại.",
  );
  process.exit(1);
}

const res = spawnSync(
  process.execPath,
  ["--experimental-test-coverage", join(root, "scripts", "run-tests.mjs")],
  { cwd: root, encoding: "utf8", env: process.env },
);
const out = (res.stdout ?? "") + (res.stderr ?? "");
process.stdout.write(out);

if (res.status !== 0) {
  console.error(
    "\n[LỖI] Bộ test không xanh (xem log ở trên) — không đo coverage trên một bộ test đang hỏng.",
  );
  process.exit(1);
}

const measured = parseSummary(out);
if (!measured) {
  console.error(
    "\n[LỖI] Không trích được số liệu coverage từ output — kiểm định dạng in ở scripts/run-tests.mjs" +
      " có đổi không (cổng này bám theo 3 dòng 'lines:'/'branches:'/'funcs:' và 'Số file trong phạm vi:').",
  );
  process.exit(1);
}

const baseline = docBaseline();

console.log("\n=== So với mốc coverage-baseline.json ===");
console.log(
  `Mốc đo ngày ${baseline.measuredAt}: files=${baseline.files} lines=${baseline.lines}% branches=${baseline.branches}% funcs=${baseline.funcs}%`,
);
console.log(
  `Đo lần này:                files=${measured.files} lines=${measured.lines}% branches=${measured.branches}% funcs=${measured.funcs}%`,
);

const metrics: Array<"lines" | "branches" | "funcs"> = ["lines", "branches", "funcs"];
const violations: string[] = [];
const improvements: string[] = [];

for (const m of metrics) {
  const delta = measured[m] - baseline[m];
  if (delta < -BUFFER) {
    violations.push(
      `${m}: ${baseline[m]}% → ${measured[m]}% (tụt ${(-delta).toFixed(2)} điểm %, vượt ngưỡng đệm ${BUFFER}%)`,
    );
  } else if (delta > BUFFER) {
    improvements.push(`${m}: ${baseline[m]}% → ${measured[m]}% (tăng ${delta.toFixed(2)} điểm %)`);
  }
}

if (violations.length) {
  console.error(
    `\n[LỖI] Coverage tụt quá ngưỡng đệm ${BUFFER}% so với mốc:\n  - ${violations.join("\n  - ")}` +
      `\n\nNếu đây là hồi quy thật: thêm test để bù lại trước khi merge.` +
      `\nNếu đây là thay đổi có chủ đích (vd xoá code chết làm giảm mẫu số): cập nhật thủ công` +
      ` coverage-baseline.json với số đo mới.`,
  );
  process.exit(1);
}

console.log(
  `\n[OK] Coverage không tụt quá ngưỡng đệm ${BUFFER}% so với mốc ${baseline.measuredAt}.`,
);

if (improvements.length) {
  console.log(
    `\n[GỢI Ý] Coverage đã VƯỢT mốc quá ${BUFFER} điểm % ở: ${improvements.join(", ")}.` +
      ` Cân nhắc cập nhật coverage-baseline.json để mốc theo kịp (script này KHÔNG tự ghi đè` +
      ` để tránh commit tự động ngoài ý muốn):\n` +
      JSON.stringify(
        {
          measuredAt: new Date().toISOString().slice(0, 10),
          files: measured.files,
          lines: measured.lines,
          branches: measured.branches,
          funcs: measured.funcs,
        },
        null,
        2,
      ),
  );
}
