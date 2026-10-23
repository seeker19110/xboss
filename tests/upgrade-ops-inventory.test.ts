import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectEngineeringInventory,
  ENGINEERING_GROUPS,
  inventoryErrorReason,
  inventoryTotal,
  quoteInventoryIdentifier,
  readInventoryInput,
  type InventoryClient,
} from "@/scripts/lib/engineering-inventory";

test("CLI kiểm kê không khởi tạo ứng dụng/schema và không kết luận xóa từ số dòng", () => {
  const source = readFileSync("scripts/dem-du-lieu-engineering.ts", "utf8");
  assert.doesNotMatch(source, /from ["']@\/lib\/db["']/);
  assert.doesNotMatch(source, /XOÁ được|nghiêng về XOÁ/);
  assert.match(source, /INVENTORY_DATABASE_URL/);
  assert.doesNotMatch(source, /console\.error\(e\)/);
});

const scope = { org: "4", project: "18" };
const args = ["--org", scope.org, "--project", scope.project];
const env = { INVENTORY_DATABASE_URL: "postgres://audit:example@127.0.0.1/test_inventory" };

test("kiểm kê: cần URL riêng và scope cụ thể trước khi kết nối, không nhận wildcard/SQL", () => {
  assert.throws(() => readInventoryInput(args, { DATABASE_URL: env.INVENTORY_DATABASE_URL }));
  for (const invalid of [
    [],
    ["--org", "4"],
    ["--org", "*", "--project", "18"],
    ["--org", "4 OR true", "--project", "18"],
    [...args, "--project", "19"],
    [...args, "--anything"],
  ]) {
    assert.throws(() => readInventoryInput(invalid, env));
  }
  assert.deepEqual(readInventoryInput([...args, "--tat-ca"], env), {
    scope,
    all: true,
    connectionString: env.INVENTORY_DATABASE_URL,
  });
  const secret = "secret-do-not-print";
  try {
    readInventoryInput(args, { INVENTORY_DATABASE_URL: `not-a-url:${secret}` });
    assert.fail("URL sai phải bị từ chối");
  } catch (error) {
    assert.doesNotMatch(inventoryErrorReason(error), new RegExp(secret));
  }
  assert.doesNotMatch(
    inventoryErrorReason(new Error(`postgres://user:${secret}@host/db`)),
    new RegExp(secret),
  );
});

test("kiểm kê: identifier được quote, từ chối tên bảng chứa dấu ngoặc/SQL/schema", () => {
  assert.equal(
    quoteInventoryIdentifier("engineering_bidding_packages"),
    '"engineering_bidding_packages"',
  );
  for (const invalid of [
    "public.invoices",
    'invoices"; DELETE FROM users;--',
    "a-b",
    "a".repeat(64),
  ]) {
    assert.throws(() => quoteInventoryIdentifier(invalid));
  }
});

class InventoryDb implements InventoryClient {
  commands: { sql: string; values?: unknown[] }[] = [];
  readonly = "on";
  projectExists = true;
  projectError: string | null = null;
  aborted = false;
  metadata: Record<string, unknown>[] = ENGINEERING_GROUPS.flatMap((group) => [
    ...group.base,
    ...group.engineering,
  ]).map((name) => ({
    name,
    kind: "r",
    columns: name === "tender_bids" ? ["tender_id"] : ["project_id"],
  }));
  counts = new Map<string, string | Error>();
  async query(sql: string, values?: unknown[]) {
    this.commands.push({ sql, values });
    if (sql.startsWith("ROLLBACK")) {
      this.aborted = false;
      return { rows: [] };
    }
    if (this.aborted) throw new Error("transaction đang lỗi, phải rollback savepoint");
    if (sql.includes("transaction_read_only")) return { rows: [{ readonly: this.readonly }] };
    if (sql.startsWith('SELECT id FROM "public"."projects"')) {
      if (this.projectError)
        throw Object.assign(new Error("RLS có thể chứa thông tin bí mật"), {
          code: this.projectError,
        });
      assert.deepEqual(values, [scope.project, scope.org]);
      return { rows: this.projectExists ? [{ id: scope.project }] : [] };
    }
    if (sql.includes("FROM pg_class")) return { rows: this.metadata };
    if (sql.startsWith("SELECT COUNT")) {
      assert.deepEqual(values, [scope.project, scope.org]);
      assert.match(sql, /WHERE (t|tp)\.project_id = \$1 AND p\.org_id = \$2/);
      const table = sql.match(/FROM "public"\."([a-z_]+)"/)?.[1];
      assert.ok(table);
      const count = this.counts.get(table) ?? "0";
      if (count instanceof Error) {
        this.aborted = true;
        throw count;
      }
      return { rows: [{ n: count }] };
    }
    return { rows: [] };
  }
}

test("kiểm kê: snapshot chỉ đọc, xác minh scope, đếm đúng 0 và bigint, luôn rollback", async () => {
  const db = new InventoryDb();
  db.counts.set("tender_packages", "9007199254740993");
  db.counts.set("tender_bids", "2");
  const report = await collectEngineeringInventory(db, scope);
  assert.equal(report.complete, true);
  assert.equal(report.scopeVerified, true);
  assert.equal(report.rows.find((row) => row.table === "invoices")?.count, "0");
  assert.equal(inventoryTotal(report.rows, ["tender_packages", "tender_bids"]), "9007199254740995");
  assert.equal(db.commands[0].sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.ok(db.commands.some(({ sql }) => sql === "SET LOCAL row_security = off"));
  assert.deepEqual(db.commands[1].values, [scope.org, scope.project]);
  assert.equal(db.commands.at(-1)?.sql, "ROLLBACK");
  assert.ok(
    db.commands.every(
      ({ sql }) => !/\b(CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/.test(sql),
    ),
  );
});

test("kiểm kê: permission/RLS/query lỗi và bảng thiếu không bao giờ được cộng thành 0", async () => {
  const db = new InventoryDb();
  db.counts.set("tender_packages", Object.assign(new Error("secret-url"), { code: "42501" }));
  db.counts.set("invoices", Object.assign(new Error("bad query secret"), { code: "42703" }));
  db.metadata = db.metadata.filter((row) => row.name !== "engineering_bidding_vendor_quotes");
  db.counts.set("subcontractor_profiles", "7");
  const report = await collectEngineeringInventory(db, scope);
  assert.equal(report.complete, false);
  assert.equal(report.rows.find((row) => row.table === "tender_packages")?.state, "unknown");
  assert.equal(report.rows.find((row) => row.table === "invoices")?.count, null);
  assert.equal(
    report.rows.find((row) => row.table === "engineering_bidding_vendor_quotes")?.state,
    "missing",
  );
  assert.equal(
    report.rows.find((row) => row.table === "subcontractor_profiles")?.count,
    "7",
    "savepoint phải cho bảng sau tiếp tục đếm thật",
  );
  assert.equal(inventoryTotal(report.rows, ["tender_packages", "tender_bids"]), "unknown");
  assert.equal(inventoryTotal(report.rows, ["engineering_bidding_vendor_quotes"]), "unknown");
  assert.doesNotMatch(JSON.stringify(report), /secret/);
});

test("kiểm kê: thiếu scope, RLS chặn projects hoặc project khác org đều dừng trước COUNT", async () => {
  const invalid = new InventoryDb();
  await assert.rejects(() => collectEngineeringInventory(invalid, { org: "*", project: "18" }));
  assert.equal(invalid.commands.length, 0);
  for (const mode of ["mismatch", "RLS", "writable"] as const) {
    const db = new InventoryDb();
    if (mode === "mismatch") db.projectExists = false;
    if (mode === "RLS") db.projectError = "42501";
    if (mode === "writable") db.readonly = "off";
    const report = await collectEngineeringInventory(db, scope);
    assert.equal(report.scopeVerified, false);
    assert.ok(report.rows.every((row) => row.state === "unknown" && row.count === null));
    assert.equal(
      db.commands.some(({ sql }) => sql.startsWith("SELECT COUNT")),
      false,
    );
    assert.equal(db.commands.at(-1)?.sql, "ROLLBACK");
  }
});

test("kiểm kê --tat-ca: bảng không có đường scope, view và identifier lạ đều unknown", async () => {
  const db = new InventoryDb();
  db.metadata.push(
    { name: "engineering_global", kind: "r", columns: ["id"] },
    { name: "engineering_view", kind: "v", columns: ["project_id"] },
    { name: 'engineering_bad";SELECT', kind: "r", columns: ["project_id"] },
  );
  const report = await collectEngineeringInventory(db, scope, true);
  for (const name of ["engineering_global", "engineering_view", 'engineering_bad";SELECT']) {
    assert.equal(report.rows.find((row) => row.table === name)?.state, "unknown");
  }
  assert.ok(
    db.commands
      .filter(({ sql }) => sql.startsWith("SELECT COUNT"))
      .every(
        ({ sql }) =>
          !sql.includes("engineering_global") &&
          !sql.includes("engineering_view") &&
          !sql.includes("engineering_bad"),
      ),
  );
});
