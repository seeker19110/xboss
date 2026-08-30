// scripts/check-lib-layers.ts — Cổng CI cho ranh giới miền trong lib/ (xem ADR-0007).
//
// VÌ SAO: sau khi chia lib/ thành các miền, thứ giữ cho việc chia đó có nghĩa KHÔNG phải
// thư mục — mà là luật hướng phụ thuộc. Không có máy kiểm, chỉ cần vài PR là một module
// nền lại import ngược lên miền nghiệp vụ và cấu trúc quay về mặt phẳng cũ.
//
// Kiểm 2 điều:
//  1. HƯỚNG TẦNG: thư mục tầng N chỉ được import xuống tầng < N. Ngoại lệ duy nhất là
//     các miền nghiệp vụ (cùng tầng cao nhất) được import chéo nhau — chúng vốn phải
//     phối hợp (vd tài chính cần khối lượng).
//  2. CHU TRÌNH giữa các miền nghiệp vụ: A → B → A khiến không miền nào tách ra được
//     nữa, nên chặn ngay từ khi mới xuất hiện.
//
// Chạy: npx tsx scripts/check-lib-layers.ts
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(readFileSync(join(root, "lib/layers.json"), "utf8")) as Record<
  string,
  unknown
>;
/** Chu trình nợ cũ đã biết, dạng "a <-> b" — chỉ miễn cho đúng những cặp này (xem lib/layers.json). */
/** Chu trình nợ cũ đã biết, dạng "a <-> b" — để trống là không còn nợ nào (xem lib/layers.json). */
const baseline = new Set((raw._baseline_cycles as string[] | undefined) ?? []);
const layers: Record<string, number> = Object.fromEntries(
  Object.entries(raw).filter(([k, v]) => !k.startsWith("_") && typeof v === "number"),
) as Record<string, number>;
/** Tầng mà các thư mục cùng tầng được phép import chéo nhau (các miền nghiệp vụ). */
const CROSS = (raw._cross_layer as number | undefined) ?? -1;

/** Mọi file .ts/.tsx trong lib/, kèm miền (thư mục cấp 1) của nó. */
function walk(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  );
}
const files = walk("lib");
const domainOf = (path: string) => path.split("/")[1];

const violations: string[] = [];
const crossEdges = new Map<string, Set<string>>();

for (const f of files) {
  const from = domainOf(f);
  if (!(from in layers)) {
    violations.push(
      `${f} — nằm ngoài mọi miền đã khai trong lib/layers.json (file lạc ở gốc lib/?)`,
    );
    continue;
  }
  for (const m of readFileSync(join(root, f), "utf8").matchAll(
    /from\s+["']@\/lib\/([^"']+)["']/g,
  )) {
    const to = m[1].split("/")[0];
    if (!(to in layers) || to === from) continue;
    const [a, b] = [layers[from], layers[to]];
    if (b >= a && !(a === CROSS && b === CROSS)) {
      violations.push(
        `${f} (miền ${from}, tầng ${a}) → @/lib/${m[1]} (miền ${to}, tầng ${b}) — import ngược/ngang tầng`,
      );
    }
    if (a === CROSS && b === CROSS)
      crossEdges.set(from, (crossEdges.get(from) ?? new Set()).add(to));
  }
}

// Dò chu trình giữa các miền nghiệp vụ (DFS trên đồ thị miền, không phải đồ thị file).
const cycles: string[] = [];
const state = new Map<string, number>(); // 1 = đang duyệt, 2 = xong
const dfs = (n: string, path: string[]) => {
  state.set(n, 1);
  for (const next of crossEdges.get(n) ?? []) {
    if (state.get(next) === 1) cycles.push([...path.slice(path.indexOf(next)), next].join(" → "));
    else if (!state.has(next)) dfs(next, [...path, next]);
  }
  state.set(n, 2);
};
for (const n of crossEdges.keys()) if (!state.has(n)) dfs(n, [n]);

/** Chu trình 2 miền có nằm trong danh sách nợ cũ đã khai không (không phân biệt thứ tự). */
const isBaseline = (cycle: string) => {
  const nodes = [...new Set(cycle.split(" → "))].sort();
  return nodes.length === 2 && baseline.has(`${nodes[0]} <-> ${nodes[1]}`);
};

console.log("=== Kiểm ranh giới miền lib/ (ADR-0007) ===");
console.log(`File quét: ${files.length} | miền: ${Object.keys(layers).length}`);
console.log(
  `Cạnh chéo giữa miền nghiệp vụ: ${[...crossEdges.values()].reduce((n, s) => n + s.size, 0)}`,
);

const newCycles = [...new Set(cycles)].filter((c) => !isBaseline(c));
const knownCycles = [...new Set(cycles)].filter(isBaseline);
if (knownCycles.length) {
  console.warn(
    `\n[NỢ CŨ ĐÃ BIẾT] Chu trình được miễn qua _baseline_cycles:\n  - ${knownCycles.join("\n  - ")}`,
  );
}
if (newCycles.length) {
  console.error(
    `\n[LỖI] Chu trình MỚI giữa các miền nghiệp vụ:\n  - ${newCycles.join("\n  - ")}\n`,
  );
}
if (violations.length) {
  console.error(`[LỖI] Import sai hướng tầng:\n  - ${violations.join("\n  - ")}\n`);
}
if (newCycles.length || violations.length) {
  console.error(
    "Cách sửa: đẩy phần dùng chung xuống tầng thấp hơn (nen/ha-tang), hoặc đảo hướng phụ thuộc " +
      "(bên tầng cao gọi xuống, không để tầng thấp biết về tầng cao). Đổi lib/layers.json chỉ khi " +
      "ranh giới thật sự thay đổi — kèm cập nhật ADR-0007.",
  );
  process.exit(1);
}
console.log("\nOK — hướng phụ thuộc đúng, không có chu trình giữa miền.");
