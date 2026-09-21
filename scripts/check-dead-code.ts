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
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Thư mục được quét. Ngoài các thư mục này thì coi như không thuộc đồ thị. */
const SCAN_DIRS = ["app", "lib", "tests", "e2e", "scripts", "types"];
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
  ["tests/", "e2e/", "scripts/", "types/"].some((d) => f.startsWith(d)) ||
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
//
// Dùng TypeScript Compiler API (symbol thật) thay vì regex tên hàm: regex khớp theo CHỮ,
// nên 1 export trùng tên biến cục bộ ở file khác, hoặc chỉ được nhắc trong comment, đều bị
// tính nhầm là "có dùng" — che mất orphan thật. Ngược lại AST resolve symbol qua type
// checker (unwrap alias/re-export) nên không bị nhầm giữa 2 khai báo trùng tên ở 2 nơi
// khác nhau, và không bị đánh lừa bởi text trong comment/string.
const orphanExports: string[] = [];
{
  const configFile = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const rootNames = parsed.fileNames.filter(
    (f) => !f.includes("/.next/") && !f.includes("/node_modules/"),
  );
  const program = ts.createProgram(rootNames, { ...parsed.options, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const relPath = (fileName: string) =>
    fileName.startsWith(root + "/") ? fileName.slice(root.length + 1) : fileName;

  function resolveRealSymbol(sym: ts.Symbol | undefined): ts.Symbol | undefined {
    if (!sym) return undefined;
    try {
      if (sym.flags & ts.SymbolFlags.Alias) return checker.getAliasedSymbol(sym);
    } catch {
      // 1 số symbol lạ (vd namespace built-in) throw ở getAliasedSymbol — bỏ qua an toàn.
    }
    return sym;
  }

  // Gom: symbol thật -> tập file đã DÙNG nó (mọi Identifier trong toàn bộ chương trình,
  // 1 lượt duyệt duy nhất — tránh O(số export × số node) nếu duyệt lại cho từng export).
  const usageFilesBySymbol = new Map<ts.Symbol, Set<string>>();
  const markUsed = (sym: ts.Symbol | undefined, rf: string) => {
    if (!sym) return;
    let set = usageFilesBySymbol.get(sym);
    if (!set) usageFilesBySymbol.set(sym, (set = new Set()));
    set.add(rf);
  };

  // `const { a, b } = await import("@/lib/x")` (mẫu RẤT phổ biến trong tests/ dự án này để
  // lazy-load route handler/module) không đi qua getSymbolAtLocation bình thường: identifier
  // trong ObjectBindingPattern resolve ra symbol của BIẾN CỤC BỘ mới tạo, không phải symbol
  // export gốc — bỏ qua sẽ báo sai hàng loạt export chỉ được dùng qua kiểu import động này.
  // Xử lý riêng: lấy kiểu của biểu thức import động, map từng property destructure sang
  // đúng export symbol của module đích.
  function markDynamicImportDestructuring(node: ts.Node, rf: string) {
    if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name)) return;
    const init = node.initializer;
    if (!init) return;
    // Kiểm cú pháp là `await import(...)` qua node lồng bên trong, nhưng lấy TYPE ở chính
    // biểu thức await (đã resolve Promise<ModuleType>) — lấy type của CallExpression bên
    // trong sẽ ra `Promise<...>` (có .then/.catch), không phải type module thật.
    const inner = ts.isAwaitExpression(init) ? init.expression : init;
    if (!ts.isCallExpression(inner) || inner.expression.kind !== ts.SyntaxKind.ImportKeyword)
      return;
    const type = checker.getTypeAtLocation(init);
    for (const el of node.name.elements) {
      if (!ts.isIdentifier(el.propertyName ?? el.name)) continue;
      const propName = (el.propertyName ?? el.name).getText();
      const propSym = type.getProperty(propName);
      if (propSym) markUsed(resolveRealSymbol(propSym), rf);
    }
  }

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const rf = relPath(sf.fileName);
    if (!known.has(rf) && !ROOT_ENTRIES.includes(rf)) continue;
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        markUsed(resolveRealSymbol(checker.getSymbolAtLocation(node)), rf);
      }
      markDynamicImportDestructuring(node, rf);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }

  const EXPORT_DECL_RE =
    /^export\s+(?:async\s+)?(?:const|function|class|type|interface|enum|let)\s+([A-Za-z0-9_$]+)/gm;
  for (const sf of program.getSourceFiles()) {
    const rf = relPath(sf.fileName);
    if (!rf.startsWith("lib/") || sf.isDeclarationFile) continue;
    const text = sf.getFullText();
    for (const m of text.matchAll(EXPORT_DECL_RE)) {
      const name = m[1];
      const approxPos = m.index! + m[0].lastIndexOf(name);
      let node: ts.Identifier | undefined;
      const find = (n: ts.Node) => {
        if (node) return;
        if (ts.isIdentifier(n) && n.text === name && Math.abs(n.getStart(sf) - approxPos) <= 2) {
          node = n;
          return;
        }
        ts.forEachChild(n, find);
      };
      ts.forEachChild(sf, find);
      const sym = node && resolveRealSymbol(checker.getSymbolAtLocation(node));
      if (!sym) continue; // không resolve được — bỏ qua an toàn, đừng báo sai
      const usedElsewhere = [...(usageFilesBySymbol.get(sym) ?? [])].some((f) => f !== rf);
      if (!usedElsewhere) orphanExports.push(`${rf} :: ${name}`);
    }
  }
}

console.log("=== Kiểm code chết (đồ thị import toàn repo) ===");
console.log(
  `File quét: ${files.length} | với tới được: ${reached.size} | unreachable: ${unreachable.length}`,
);
console.log(`Export không dùng ngoài file khai báo: ${orphanExports.length}`);
if (process.env.DEAD_CODE_LIST_ORPHANS) {
  console.log(orphanExports.map((o) => `  - ${o}`).join("\n"));
}

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
