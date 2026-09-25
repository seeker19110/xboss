import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRouteInventory, inventoryRouteSource } from "../scripts/audit-route-inventory";

const file = "app/api/example/[id]/route.ts";
const scan = (source: string) => inventoryRouteSource(file, source);

test("S00: AST thấy function và variable wrapper, không chạy source", () => {
  const rows = scan(`
throw new Error("không được chạy");
export async function GET() { return getCurrentUser(); }
export const POST = withScope(async () => save());
`);
  assert.deepEqual(rows.map((row) => row.method), ["GET", "POST"]);
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
  assert.deepEqual(rows.map((row) => row.method), ["GET", "*", "POST"]);
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
