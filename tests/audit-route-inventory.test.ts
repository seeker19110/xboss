import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCOPE_DOC,
  collectRouteInventory,
  generateScopeMarkdown,
  inventoryRouteSource,
} from "../scripts/audit-route-inventory";
import { VERDICTS, classify, clusterOf, readWhitelist } from "../scripts/lib/route-scope-report";

const file = "app/api/example/[id]/route.ts";
const scan = (source: string) => inventoryRouteSource(file, source);

test("S00: AST thấy function và variable wrapper, không chạy source", () => {
  const rows = scan(`
throw new Error("không được chạy");
export async function GET() { return getCurrentUser(); }
export const POST = withScope(async () => save());
`);
  const methods = rows.map((row) => row.method);
  assert.deepEqual(methods, ["GET", "POST"]);
  assert.ok(rows[0].calls.includes("getCurrentUser"));
  assert.ok(rows[1].calls.includes("withScope"));
  assert.ok(rows[1].calls.includes("save"));
  assert.equal(rows[0].line, 3);
  assert.match(rows[0].sourceBlob, /^[a-f0-9]{40}$/);
});

test("S00: alias và alias lồng giải được nhưng không tự đánh PASS", () => {
  const rows = scan(`function read() { return requireActor(); }
const handler = read;
export { handler as GET, read as HEAD };`);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.calls.includes("requireActor")));
  assert.ok(rows.every((row) => row.reviewStatus === "NOT_MAPPED"));
});

test("S00: re-export, wildcard và destructuring không biến mất khỏi inventory", () => {
  const rows = scan(`export { get as GET } from "./handler";
export * from "./more";
export const { POST } = handlers;`);
  const methods = rows.map((row) => row.method);
  assert.deepEqual(methods, ["GET", "*", "POST"]);
  assert.ok(rows.every((row) => row.reviewStatus === "NOT_MAPPED"));
});

test("S00: không nhận comment/string/type hoặc function nội bộ thành endpoint", () => {
  const rows = scan(`// export function POST() {}
const text = "export const DELETE = 1";
function PATCH() {}
export type { GET } from "./types";
export const runtime = "nodejs";`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exportKind, "no-explicit-method");
});

test("S00: source lỗi, alias không rõ và vòng tham chiếu không bị nuốt/treo", () => {
  assert.ok(scan("export function GET( {").some((row) => row.exportKind === "syntax-error"));
  assert.equal(scan("export { missing as GET }")[0].calls.length, 0);
  const rows = scan("const a = b; const b = a; export { a as GET }");
  assert.equal(rows[0].reviewStatus, "NOT_MAPPED");
});

test("S00: output không chứa argument, SQL hoặc secret fixture", () => {
  const rows = scan('export function GET(){ return query("private-secret-value"); }');
  assert.ok(!JSON.stringify(rows).includes("private-secret-value"));
  assert.ok(rows[0].calls.includes("query"));
});

test("S00: đọc toàn bộ route tracked, phát hiện dirty và chặn symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "xboss-inventory-"));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "Fixture"]);
    git(["config", "user.email", "fixture@example.invalid"]);
    mkdirSync(join(root, "app/api/example"), { recursive: true });
    const route = join(root, "app/api/example/route.ts");
    writeFileSync(route, "export function GET() {}\n");
    git(["add", "."]);
    git(["commit", "-qm", "fixture"]);
    const before = collectRouteInventory(root);
    assert.equal(before.routeFileCount, 1);
    assert.equal(before.workingTreeDirty, false);
    writeFileSync(route, "export function POST() {}\n");
    const after = collectRouteInventory(root);
    assert.equal(after.workingTreeDirty, true);
    assert.equal(after.entries[0].method, "POST");
    assert.notEqual(before.entries[0].sourceBlob, after.entries[0].sourceBlob);
    rmSync(route);
    symlinkSync(join(root, ".git/config"), route);
    assert.throws(() => collectRouteInventory(root), /inventory_symlink_rejected/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── S00 scope: verdict cú pháp ────────────────────────────────────────────────
const emptyCtx = {
  permWhitelist: new Map<string, string>(),
  projectWhitelist: new Map<string, string>(),
};
const verdictOf = (source: string, method = "GET", ctx = emptyCtx) => {
  const entry = inventoryRouteSource("app/api/fixture/route.ts", source).find(
    (row) => row.method === method,
  );
  assert.ok(entry, `fixture phải có method ${method}`);
  return classify(entry, ctx);
};
const PRE = "export async function GET() { await getCurrentUser(); ";
const PRE_P = `${PRE}const projectId = await getCurrentProjectId(u); `;

test("S00 scope: NO_AUTH khi không có cơ chế xác thực", () => {
  assert.equal(verdictOf("export async function GET() { return 1; }").verdict, "NO_AUTH");
});

test("S00 scope: public có lý do lấy từ whitelist được ghi chú nhưng vẫn là dữ kiện NO_AUTH", () => {
  const ctx = { ...emptyCtx, permWhitelist: new Map([["fixture:POST", "đăng xuất"]]) };
  const row = verdictOf("export async function POST() { return 1; }", "POST", ctx);
  assert.equal(row.verdict, "NO_AUTH");
  assert.ok(row.notes.some((n) => n.includes("đăng xuất")));
});

test("S00 scope: FALLBACK_PROJECT1 cho `|| 1`, `?? 1` và mặc định = 1 gắn với project", () => {
  assert.equal(
    verdictOf(`${PRE}const projectId = Number(body.pid || 1); }`).verdict,
    "FALLBACK_PROJECT1",
  );
  assert.equal(verdictOf(`${PRE}const p = (x.projectId ?? 1); }`).verdict, "FALLBACK_PROJECT1");
  assert.equal(verdictOf(`${PRE}let projectId = 1; }`).verdict, "FALLBACK_PROJECT1");
  // `limit ?? 1` không liên quan dự án → không bị gắn cờ.
  assert.notEqual(verdictOf(`${PRE}const limit = n ?? 1; }`).verdict, "FALLBACK_PROJECT1");
});

test('S00 scope: NULL_AS_WIDE_SUSPECT cho SQL, điều kiện ?:, if không else và ?? "*"', () => {
  assert.equal(
    verdictOf(`${PRE_P}await query("SELECT 1 WHERE (? IS NULL OR project_id = ?)", 1); }`).verdict,
    "NULL_AS_WIDE_SUSPECT",
  );
  assert.equal(
    verdictOf(`${PRE_P}const w = projectId != null ? " AND project_id = ?" : ""; }`).verdict,
    "NULL_AS_WIDE_SUSPECT",
  );
  assert.equal(
    verdictOf(`${PRE_P}if (projectId != null) { conds.push("project_id = ?"); } }`).verdict,
    "NULL_AS_WIDE_SUSPECT",
  );
  assert.equal(
    verdictOf(`${PRE_P}await withProjectScope(projectId ?? "*", f); }`).verdict,
    "NULL_AS_WIDE_SUSPECT",
  );
});

test("S00 scope: nhánh từ chối (`: []`, `== null`, if có else) không bị gắn NULL_AS_WIDE", () => {
  const cases = [
    `const r = projectId != null ? query("project_id = ?") : [];`,
    `if (projectId == null) { x("project_id"); }`,
    `if (projectId) { a("project_id"); } else { return deny(); }`,
  ];
  for (const body of cases) {
    assert.notEqual(verdictOf(`${PRE_P}${body} }`).verdict, "NULL_AS_WIDE_SUSPECT", body);
  }
});

test("S00 scope: CLIENT_PROJECT_UNCHECKED khi đọc projectId từ client mà không chốt", () => {
  const bad = verdictOf(
    "export async function POST(req) { await getCurrentUser(); CAN.edit(1); const body = await req.json(); const p = body.projectId; }",
    "POST",
  );
  assert.equal(bad.verdict, "CLIENT_PROJECT_UNCHECKED");
  const viaQuery = verdictOf(
    'export async function GET(req) { await getCurrentUser(); const p = req.nextUrl.searchParams.get("projectId"); }',
  );
  assert.equal(viaQuery.verdict, "CLIENT_PROJECT_UNCHECKED");
  const checked = verdictOf(
    "export async function POST(req) { await getCurrentUser(); CAN.edit(1); const { projectId } = await req.json(); await chotProjectIdChoGhi(u, projectId, 1); }",
    "POST",
  );
  assert.notEqual(checked.verdict, "CLIENT_PROJECT_UNCHECKED");
  assert.equal(checked.entry.facts.clientProjectChecked, true);
  const ctx = { ...emptyCtx, projectWhitelist: new Map([["fixture", "thuộc tính rule"]]) };
  const whitelisted = verdictOf(
    "export async function POST(req) { await getCurrentUser(); CAN.x(1); const body = await req.json(); body.projectId; }",
    "POST",
    ctx,
  );
  assert.notEqual(whitelisted.verdict, "CLIENT_PROJECT_UNCHECKED");
});

test("S00 scope: NO_PERMISSION_CHECK chỉ cho method ghi", () => {
  assert.equal(
    verdictOf("export async function POST() { await getCurrentUser(); }", "POST").verdict,
    "NO_PERMISSION_CHECK",
  );
  assert.notEqual(
    verdictOf("export async function GET() { await getCurrentUser(); }").verdict,
    "NO_PERMISSION_CHECK",
  );
  for (const guard of [
    "CAN.edit(u.role)",
    "canTouchTask(u, 1)",
    "isAdminOrPm(u)",
    "u.role !== 'admin'",
  ]) {
    const source = `export async function PATCH() { const u = await getCurrentUser(); ${guard}; }`;
    assert.notEqual(verdictOf(source, "PATCH").verdict, "NO_PERMISSION_CHECK", guard);
  }
});

test("S00 scope: SCOPED_SYNTACTIC và NOT_MAPPED; không verdict nào mang nghĩa 'an toàn'", () => {
  const scoped = verdictOf(
    "export async function GET() { const u = await getCurrentUser(); await getCurrentProjectId(u); }",
  );
  assert.equal(scoped.verdict, "SCOPED_SYNTACTIC");
  assert.equal(scoped.entry.reviewStatus, "NOT_MAPPED");
  assert.equal(verdictOf(`${PRE}}`).verdict, "NOT_MAPPED");
  const wildcard = classify(inventoryRouteSource(file, "export * from './x';")[0], emptyCtx);
  assert.equal(wildcard.verdict, "NOT_MAPPED");
  assert.ok(VERDICTS.every((v) => !/^(OK|SAFE|AN_TOAN)/i.test(v)));
});

test("S00 scope: nhận diện cron-secret, api-key và đề xuất cụm S02", () => {
  const cron = inventoryRouteSource(
    "app/api/cron/x/route.ts",
    "export async function GET(req) { checkCronSecret(req.headers.get('authorization')); }",
  )[0];
  assert.deepEqual(cron.facts.auth, ["cron-secret"]);
  assert.equal(clusterOf(cron), "S02c");
  const key = inventoryRouteSource(
    "app/api/v1/x/route.ts",
    "export async function POST(req) { await requireApiKey(req); }",
  )[0];
  assert.deepEqual(key.facts.auth, ["api-key"]);
  const pay = inventoryRouteSource("app/api/payments/route.ts", "export function GET(){}")[0];
  assert.equal(clusterOf(pay), "S02a");
});

// ── S00 scope: đối chiếu repo thật ────────────────────────────────────────────
const repoRoot = join(import.meta.dirname, "..");

test("S00 scope: 100% (file, method) export tường minh của app/api/**/route.* có trong inventory", async () => {
  const files = execFileSync("git", ["ls-files", "-z", "--", "app/api"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter((f) => /\/route\.[cm]?[jt]sx?$/.test(f));
  // Đếm độc lập bằng regex thô trên text (khác đường AST) — chỉ cho dạng export phổ biến.
  const methodRe =
    /^export\s+(?:async\s+function|function|const)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/gm;
  const expected = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(join(repoRoot, f), "utf8").matchAll(methodRe)) {
      expected.add(`${f}#${m[1]}`);
    }
  }
  assert.ok(expected.size > 500, "regex đếm độc lập phải thấy hàng trăm method");
  const inv = collectRouteInventory(repoRoot);
  assert.equal(inv.routeFileCount, files.length);
  const got = new Set(inv.entries.map((e) => `${e.file}#${e.method}`));
  assert.deepEqual(
    [...expected].filter((k) => !got.has(k)),
    [],
  );
  const { rows } = await generateScopeMarkdown(repoRoot, null);
  assert.equal(rows.length, inv.entries.length);
  assert.ok(rows.every((r) => VERDICTS.includes(r.verdict)));
});

test("S00 scope: tài liệu sinh lại ổn định và không lệch file đã commit", async () => {
  const committed = readFileSync(join(repoRoot, SCOPE_DOC), "utf8");
  const stripSha = (s: string) => s.replace(/^- Source SHA: .*$/m, "- Source SHA: <bỏ qua>");
  const first = (await generateScopeMarkdown(repoRoot, committed)).markdown;
  const second = (await generateScopeMarkdown(repoRoot, first)).markdown;
  assert.equal(second, first, "sinh lại hai lần phải ổn định");
  assert.equal(
    stripSha(first),
    stripSha(committed),
    "S00-SCOPE-INVENTORY.md lệch với route hiện tại — chạy `npm run audit:route-scope` rồi commit",
  );
  assert.match(committed, /Source SHA: `[a-f0-9]{40}`/);
});

test("S00 scope: whitelist đọc bằng AST khớp script check-*", () => {
  const perms = readWhitelist(join(repoRoot, "scripts/check-route-perms.ts"));
  assert.ok((perms.get("auth/logout:POST") ?? "").length > 0);
  assert.ok(readWhitelist(join(repoRoot, "scripts/check-project-scope.ts")).has("admin/api-keys"));
});
