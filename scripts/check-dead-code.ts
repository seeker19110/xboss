// scripts/check-dead-code.ts — Cổng CI: dò module KHÔNG AI VỚI TỚI ĐƯỢC (unreachable)
// từ các entrypoint thật của Next.js, và các export không ai dùng ngoài file khai báo.
//
// VÌ SAO: dự án đã lên hơn 220k LOC với ~500 route và ~190 module trong lib/. Ở quy mô
// này, code chết không lộ ra khi review từng PR — nó chỉ tích lại. `tsc --noEmit` và
// eslint đều KHÔNG bắt được (một file không ai import vẫn typecheck sạch). Script này
// dựng đồ thị import toàn repo rồi duyệt từ entrypoint, nên bắt được cả cụm file chỉ
// import lẫn nhau (dead cluster) — thứ mà grep từng tên file bỏ sót.
//
// Chạy: npx tsx scripts/check-dead-code.ts
//  - THOÁT 1 (đỏ) nếu có file unreachable KHÔNG nằm trong scripts/dead-code-allowlist.json.
//  - Chỉ CẢNH BÁO với export chết (không đỏ): phần lớn là tính năng đã ship backend mà
//    UI chưa gắn — xoá đi là mất tính năng, phải người quyết chứ không để CI ép.
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Thư mục được quét. Ngoài các thư mục này thì coi như không thuộc đồ thị. */
const SCAN_DIRS = ["app", "lib", "tests", "e2e", "scripts", "types", "mepf-worker"];
/** File gốc ở thư mục root do công cụ tự nạp (không ai import). */
const ROOT_ENTRIES = [
  "instrumentation.ts",
  "instrumentation-client.ts",
  "proxy.ts",
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
];

const allowlist: string[] = JSON.parse(
  readFileSync(join(root, "scripts/dead-code-allowlist.json"), "utf8"),
).map((e: { file: string }) => e.file);

const files = execFileSync(
  "find",
  [...SCAN_DIRS, "-type", "f", "(", "-name", "*.ts", "-o", "-name", "*.tsx", ")"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .concat(ROOT_ENTRIES.filter((f) => existsSync(join(root, f))));

const known = new Set(files);
const source = new Map(files.map((f) => [f, readFileSync(join(root, f), "utf8")]));

/** Đưa specifier import về đường dẫn file trong repo (alias `@/*`, tương đối, index). */
function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null; // package ngoài
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
    if (known.has(cand)) return cand;
  }
  return null;
}

const deps = new Map<string, Set<string>>();
for (const f of files) {
  const out = new Set<string>();
  // Bắt cả `from "x"`, `import("x")` (dynamic) và `require("x")`.
  for (const m of source
    .get(f)!
    .matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
    const r = resolveImport(m[1], f);
    if (r) out.add(r);
  }
  deps.set(f, out);
}

/** Entrypoint: những gì Next.js/test runner/CLI tự nạp chứ không qua import. */
const NEXT_SPECIAL =
  /^(page|layout|route|error|global-error|loading|not-found|template|default|robots|sitemap|opengraph-image|icon)\.tsx?$/;
const isEntry = (f: string) =>
  (f.startsWith("app/") && NEXT_SPECIAL.test(f.slice(f.lastIndexOf("/") + 1))) ||
  ["tests/", "e2e/", "scripts/", "types/", "mepf-worker/"].some((d) => f.startsWith(d)) ||
  !f.includes("/");

const reached = new Set<string>();
const stack = files.filter(isEntry);
stack.forEach((f) => reached.add(f));
while (stack.length) {
  for (const d of deps.get(stack.pop()!) ?? []) {
    if (!reached.has(d)) {
      reached.add(d);
      stack.push(d);
    }
  }
}

const unreachable = files.filter((f) => !reached.has(f)).sort();
const unexpected = unreachable.filter((f) => !allowlist.includes(f));
const staleAllow = allowlist.filter((f) => !unreachable.includes(f));

// Export không ai dùng ngoài file khai báo — chỉ cảnh báo, xem ghi chú đầu file.
const orphanExports: string[] = [];
for (const f of files.filter((x) => x.startsWith("lib/"))) {
  const s = source.get(f)!;
  for (const m of s.matchAll(
    /^export\s+(?:async\s+)?(?:const|function|class|type|interface|enum|let)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    const word = new RegExp(`\\b${m[1].replace(/\$/g, "\\$")}\\b`);
    let usedOutside = false;
    for (const [g, gs] of source) {
      if (g !== f && word.test(gs)) {
        usedOutside = true;
        break;
      }
    }
    if (!usedOutside) orphanExports.push(`${f} :: ${m[1]}`);
  }
}

console.log("=== Kiểm code chết (đồ thị import toàn repo) ===");
console.log(
  `File quét: ${files.length} | với tới được: ${reached.size} | unreachable: ${unreachable.length}`,
);
console.log(`Export không dùng ngoài file khai báo: ${orphanExports.length}`);

if (staleAllow.length) {
  console.warn(
    `\n[CẢNH BÁO] allowlist còn ghi file đã hết chết (hoặc đã xoá) — dọn khỏi scripts/dead-code-allowlist.json:\n  - ${staleAllow.join("\n  - ")}`,
  );
}

if (unexpected.length) {
  console.error(
    `\n[LỖI] File không ai với tới được:\n  - ${unexpected.join("\n  - ")}\n\n` +
      "Xoá file, hoặc gắn nó vào entrypoint thật, hoặc (nếu cố ý giữ) thêm vào " +
      "scripts/dead-code-allowlist.json kèm lý do.",
  );
  process.exit(1);
}

console.log("\nOK — không có file chết ngoài allowlist.");
