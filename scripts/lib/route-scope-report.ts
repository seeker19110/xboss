// scripts/lib/route-scope-report.ts — S00 (QUALITY-FINAL-1): phân loại verdict CÚ PHÁP cho từng
// (file, method) route và sinh bảng Markdown. Chỉ chứng minh cú pháp — KHÔNG BAO GIỜ kết luận
// "an toàn": SCOPED_SYNTACTIC nghĩa là "có resolver + kiểm quyền về mặt cú pháp, CHƯA ai đọc".
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RouteInventoryEntry } from "../audit-route-inventory";

export const VERDICTS = [
  "NO_AUTH",
  "FALLBACK_PROJECT1",
  "NULL_AS_WIDE_SUSPECT",
  "CLIENT_PROJECT_UNCHECKED",
  "NO_PERMISSION_CHECK",
  "SCOPED_SYNTACTIC",
  "NOT_MAPPED",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CLUSTERS = ["S02a", "S02b", "S02c", "CHUA_GAN"] as const;
export type Cluster = (typeof CLUSTERS)[number];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Cụm S02 theo thư mục gốc dưới app/api — ĐỀ XUẤT, người duyệt S02 chốt lại. */
const TOP_A = new Set([
  "payments",
  "payment-certs",
  "claims",
  "claim-documents",
  "variations",
  "vo-documents",
  "contracts",
  "contract-documents",
  "invoices",
  "advances",
  "cash-transactions",
  "costs",
  "finance",
  "tenders",
  "purchase-orders",
  "purchase-requests",
  "suppliers",
  "insurance-bonds",
  "floor-approvals",
  "approvals",
]);
const TOP_B = new Set([
  "tasks",
  "sheets",
  "towers",
  "workpackages",
  "packages",
  "package-dependencies",
  "dimensions",
  "materials",
  "boq",
  "boq-norms",
  "norms",
  "photos",
  "progress-albums",
  "diaries",
  "hse",
  "hse-photos",
  "systems",
  "system-uploads",
  "events",
  "my-tasks",
  "lookahead",
  "gantt",
  "comments",
  "work-fronts",
  "work-front-documents",
  "floor-stage-fronts",
  "floor-stage-front-documents",
  "punch-list",
  "baselines",
  "schedule-control",
  "resources",
  "timeline",
  "equipment",
  "vehicles",
]);
const TOP_C = new Set([
  "portfolio",
  "projects",
  "project",
  "user-projects",
  "export",
  "cron",
  "v1",
  "admin",
  "integrations",
  "saved-reports",
  "import",
  "dashboard",
  "feature-flags",
]);
const LIB_B = new Set(["tien-do", "khoi-luong", "vat-tu", "hien-truong"]);

export function routeKey(file: string): string {
  return file.replace(/^app\/api\//, "").replace(/\/route\.[cm]?[jt]sx?$/, "");
}

export function clusterOf(entry: RouteInventoryEntry): Cluster {
  const key = routeKey(entry.file);
  const top = key.split("/")[0];
  const last = key.split("/").at(-1) ?? "";
  const f = entry.facts;
  if (
    TOP_C.has(top) ||
    /^(export|report|pdf)$/.test(last) ||
    f.auth.some((a) => a === "cron-secret" || a === "api-key" || a === "device")
  ) {
    return "S02c";
  }
  if (TOP_A.has(top) || last === "approve" || f.libDomains.includes("tai-chinh")) return "S02a";
  if (TOP_B.has(top) || f.libDomains.some((d) => LIB_B.has(d))) return "S02b";
  return "CHUA_GAN";
}

/** Đọc các khoá WHITELIST (literal object) của một script check-* bằng AST — không chạy script. */
export function readWhitelist(file: string): Map<string, string> {
  const out = new Map<string, string>();
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const text = (n: ts.Expression): string => {
    if (ts.isStringLiteralLike(n)) return n.text;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return text(n.left) + text(n.right);
    }
    return "";
  };
  const walk = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "WHITELIST" &&
      n.initializer &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      for (const p of n.initializer.properties) {
        if (
          ts.isPropertyAssignment(p) &&
          (ts.isStringLiteralLike(p.name) || ts.isIdentifier(p.name))
        ) {
          out.set(p.name.text, text(p.initializer));
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

export type ScopeContext = {
  permWhitelist: Map<string, string>;
  projectWhitelist: Map<string, string>;
};

export type ScopeRow = {
  entry: RouteInventoryEntry;
  cluster: Cluster;
  verdict: Verdict;
  flags: Verdict[];
  notes: string[];
  testFiles: string[];
};

export function classify(
  entry: RouteInventoryEntry,
  ctx: ScopeContext,
  testFiles: string[] = [],
): ScopeRow {
  const f = entry.facts;
  const key = routeKey(entry.file);
  const notes: string[] = [];
  const flags: Verdict[] = [];
  const unresolved = entry.method === "*";
  const isWrite = WRITE_METHODS.has(entry.method);

  if (!unresolved && f.auth.length === 0) {
    flags.push("NO_AUTH");
    const why = ctx.permWhitelist.get(`${key}:${entry.method}`);
    if (why) notes.push(`public có lý do (scripts/check-route-perms.ts WHITELIST): ${why}`);
  }
  if (f.fallbackProject1) flags.push("FALLBACK_PROJECT1");
  if (f.nullAsWide.length > 0) flags.push("NULL_AS_WIDE_SUSPECT");
  if (f.clientProjectId && !f.clientProjectChecked) {
    const why = ctx.projectWhitelist.get(key);
    if (why)
      notes.push(`projectId client có lý do (scripts/check-project-scope.ts WHITELIST): ${why}`);
    else flags.push("CLIENT_PROJECT_UNCHECKED");
  }
  if (isWrite && f.permChecks.length === 0) {
    const why = ctx.permWhitelist.get(`${key}:${entry.method}`);
    if (why) notes.push(`ghi không CAN có lý do (scripts/check-route-perms.ts WHITELIST): ${why}`);
    else flags.push("NO_PERMISSION_CHECK");
  }
  if (f.nullAsWide.length > 0) notes.push(`nghi vấn: ${f.nullAsWide.join("; ")}`);

  let verdict: Verdict;
  if (flags.length > 0) {
    verdict = VERDICTS.find((v) => flags.includes(v)) as Verdict;
  } else if (!unresolved && f.auth.length > 0 && f.projectResolvers.length > 0) {
    verdict = "SCOPED_SYNTACTIC";
  } else {
    verdict = "NOT_MAPPED";
  }
  if (/^payments(\/|$)/.test(key)) {
    notes.push("xem thêm S00-PAYMENT-SCOPE-INVENTORY.md (phân tích tay đã có)");
  }
  return { entry, cluster: clusterOf(entry), verdict, flags, notes, testFiles };
}

/** File test (git ls-files tests/) nhắc tới đường dẫn route — cú pháp, không chứng minh phủ. */
export function findTestMentions(root: string, files: string[]): Map<string, string[]> {
  const cwd = resolve(root);
  const tests = execFileSync("git", ["ls-files", "-z", "--", "tests"], { cwd, encoding: "utf8" })
    .split("\0")
    .filter((t) => /\.test\.[cm]?[jt]sx?$/.test(t) && !t.startsWith("tests/audit-route-inventory"));
  const texts = tests.map((t) => [t, readFileSync(join(cwd, t), "utf8")] as const);
  const out = new Map<string, string[]>();
  for (const file of files) {
    const key = routeKey(file);
    const seg = "(?:\\[[^\\]/]+\\]|\\$\\{[^}]*\\}|[^/\\s\"'`?#)]+)";
    const urlPattern = key
      .split("/")
      .map((s) => (/^\[.+\]$/.test(s) ? seg : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    const urlRe = new RegExp(`/api/${urlPattern}(?![\\w\\[\\-/])`);
    const fileRe = new RegExp(`app/api/${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/route`);
    out.set(
      file,
      texts.filter(([, body]) => urlRe.test(body) || fileRe.test(body)).map(([t]) => t),
    );
  }
  return out;
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "—");

export const TAY_BEGIN = "<!-- TAY:BEGIN (giữ nguyên khi sinh lại) -->";
export const TAY_END = "<!-- TAY:END -->";

export function extractHandwritten(existing: string | null): string {
  if (existing) {
    const a = existing.indexOf(TAY_BEGIN);
    const b = existing.indexOf(TAY_END);
    if (a >= 0 && b > a) return existing.slice(a + TAY_BEGIN.length, b).replace(/^\n|\n$/g, "");
  }
  return "## Kiểm định mẫu\n\n_Chưa có._\n\n## Phát hiện cần sửa (P1)\n\n_Chưa có._";
}

export function renderMarkdown(
  inv: { sourceSha: string; routeFileCount: number; explicitMethodCount: number },
  rows: ScopeRow[],
  handwritten: string,
): string {
  const lines: string[] = [];
  const count = (pred: (r: ScopeRow) => boolean) => rows.filter(pred).length;
  lines.push("# S00 — Scope inventory toàn bộ route API (A1)", "");
  lines.push(
    "> FILE SINH TỰ ĐỘNG phần ngoài khối `TAY:BEGIN/END`. Không sửa tay phần còn lại.",
    "",
  );
  lines.push(`- Source SHA: \`${inv.sourceSha}\``);
  lines.push("- Sinh lại: `npm run audit:route-scope`");
  lines.push(
    `- Phạm vi: ${inv.routeFileCount} file \`route.*\` được git theo dõi dưới \`app/api\` (383 \`route.ts\` + 9 \`route.tsx\` PDF), ${inv.explicitMethodCount} (file, method) export tường minh; ${rows.length} dòng.`,
    "",
  );
  lines.push("## Phương pháp và giới hạn", "");
  lines.push(
    "- AST TypeScript (`scripts/audit-route-inventory.ts`), không chạy/import route, theo hàm cục bộ cùng file. Helper import từ file khác được ghi theo TÊN, không đọc thân.",
    '- Verdict chỉ là **dữ kiện cú pháp**, không phải kết luận bảo mật. `SCOPED_SYNTACTIC` = có cơ chế auth + resolver dự án trong thân handler, **CHƯA được kiểm** (parent join, DTO, org đều chưa xét). Không có nhãn nào nghĩa là "an toàn".',
    "- `reviewStatus` trong JSON vẫn là `NOT_MAPPED` cho mọi dòng: chưa dòng nào được người duyệt xác nhận ở bước này.",
    '- Thứ tự ưu tiên verdict: NO_AUTH > FALLBACK_PROJECT1 > NULL_AS_WIDE_SUSPECT > CLIENT_PROJECT_UNCHECKED > NO_PERMISSION_CHECK > SCOPED_SYNTACTIC > NOT_MAPPED. Cột "Cờ" liệt kê đủ mọi cờ.',
    "- NO_PERMISSION_CHECK chỉ xét method ghi (POST/PUT/PATCH/DELETE), cùng mẫu quyền với `scripts/lib/route-perms-scan.ts` (CAN.*, can*/require*, isAdminOrPm, requireApiKey, so sánh `.role`, secret cron). Route ghi nằm trong WHITELIST của `scripts/check-route-perms.ts` (mục có lý do) không bị gắn cờ, ghi nguồn ở ghi chú; tương tự `scripts/check-project-scope.ts` cho CLIENT_PROJECT_UNCHECKED.",
    '- NULL-AS-WIDE là heuristic NGHI VẤN: SQL `? IS NULL OR …`/`project_id IS NULL OR`, `COALESCE(?, project_id)`, `cond ? "" : "AND project_id = ?"` (chỉ nhánh chuỗi rỗng; nhánh `[]`/`null` là từ chối nên không tính), `if (projectId) { …project_id… }` không có else, `projectId ?? "*"` (mở GUC RLS cross-project khi null). Có dương tính giả (xem Kiểm định mẫu) và chắc chắn có âm tính giả (helper ngoài file, query dựng gián tiếp).',
    '- FALLBACK_PROJECT1: `x || 1` / `x ?? 1` / mặc định `= 1` mà tên biến hoặc vế trái chứa "project".',
    "- Cụm S02 (a tài chính/nghiệm thu, b tracking/vật tư/ảnh/nhật ký, c portfolio/export/cron/device/API key, CHUA_GAN) là ĐỀ XUẤT theo thư mục + miền `lib/` import + cơ chế auth; người duyệt S02 chốt.",
    "- Cột Test: file `tests/*.test.ts` nhắc tới đường dẫn route (chuỗi) — không chứng minh có test âm.",
    "- Route payment (`app/api/payments/**`): đã có phân tích tay `S00-PAYMENT-SCOPE-INVENTORY.md`, không nhân đôi ở đây.",
    "",
  );

  lines.push("## Bảng tổng: verdict × cụm S02 (số dòng theo verdict chính)", "");
  lines.push(`| Verdict | ${CLUSTERS.join(" | ")} | Tổng |`);
  lines.push(`| --- | ${CLUSTERS.map(() => "---:").join(" | ")} | ---: |`);
  for (const v of VERDICTS) {
    const per = CLUSTERS.map((c) => count((r) => r.verdict === v && r.cluster === c));
    lines.push(`| ${v} | ${per.join(" | ")} | ${per.reduce((a, b) => a + b, 0)} |`);
  }
  lines.push(
    `| **Tổng** | ${CLUSTERS.map((c) => count((r) => r.cluster === c)).join(" | ")} | ${rows.length} |`,
    "",
  );
  lines.push("Số dòng mang cờ (một dòng có thể nhiều cờ):", "");
  for (const v of VERDICTS.filter((x) => x !== "SCOPED_SYNTACTIC" && x !== "NOT_MAPPED")) {
    lines.push(`- ${v}: ${count((r) => r.flags.includes(v))}`);
  }
  lines.push("");

  lines.push("<!-- TAY:BEGIN (giữ nguyên khi sinh lại) -->", handwritten, "<!-- TAY:END -->", "");

  lines.push("## Bảng chi tiết", "");
  lines.push(
    "| File | Method | Dòng | Cụm | Verdict | Cờ | Auth | Quyền | Resolver | Test | Ghi chú |",
  );
  lines.push("| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const f = r.entry.facts;
    const tests =
      r.testFiles.length === 0
        ? "—"
        : r.testFiles.length <= 2
          ? r.testFiles.map((t) => t.replace(/^tests\//, "")).join(", ")
          : `${r.testFiles.length} file`;
    lines.push(
      `| ${cell(r.entry.file.replace(/^app\/api\//, ""))} | ${r.entry.method} | ${r.entry.line} | ${r.cluster} | ${r.verdict} | ${cell(list(r.flags))} | ${cell(list(f.auth))} | ${cell(list(f.permChecks))} | ${cell(list(f.projectResolvers))} | ${cell(tests)} | ${cell(r.notes.join(" · ") || "—")} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
