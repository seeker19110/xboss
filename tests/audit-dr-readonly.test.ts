import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import type { DrClient } from "../scripts/lib/dr-readonly";

type DrModule = typeof import("../scripts/lib/dr-readonly");
const target = { expectedDatabase: "xboss_dr_fixture", expectedUser: "dr_reader" };

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const js = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const evaluated = { exports: {} };
  runInNewContext(js, {
    module: evaluated,
    exports: evaluated.exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(mocks, name), name);
      return mocks[name];
    },
    URL,
  });
  return evaluated.exports as T;
}

function moduleUnderTest(): DrModule {
  const ledger = load("lib/bao-mat/merkle-audit-ledger.ts", {
    "node:crypto": crypto,
    "@/lib/db": {
      query: () => assert.fail("Reader DR không được gọi lib/db hoặc auto-migration"),
    },
  });
  return load("scripts/lib/dr-readonly.ts", { "@/lib/bao-mat/merkle-audit-ledger": ledger });
}

class FakeClient implements DrClient {
  commands: string[] = [];
  constructor(
    private options: {
      wrongTarget?: boolean;
      writable?: boolean;
      emptyAudit?: boolean;
      unsignedAudit?: boolean;
      tamperedAudit?: boolean;
      extraMigration?: boolean;
      migrationError?: boolean;
      relationCount?: string;
    } = {},
  ) {}

  async query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    this.commands.push(sql);
    assert.ok(!/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/.test(sql));
    if (sql.includes("current_database()")) {
      return {
        rows: [
          {
            db: this.options.wrongTarget ? "wrong_database" : target.expectedDatabase,
            usr: target.expectedUser,
            readonly: this.options.writable ? "off" : "on",
          },
        ],
      };
    }
    if (sql.includes("FROM schema_migrations")) {
      if (this.options.migrationError) throw new Error("postgres://sensitive:secret@host/database");
      const rows = [{ name: "0001_fixture.sql" }];
      if (this.options.extraMigration) rows.push({ name: "extra.sql" });
      return { rows };
    }
    if (sql.includes("COALESCE(entity_key")) {
      assert.ok(sql.includes("id > $1") && sql.includes("LIMIT $2"));
      assert.deepEqual(Array.from(params ?? []), [0, 2000]);
      if (this.options.emptyAudit) return { rows: [] };
      const row = { id: 1, entityKey: "fixture", at: "2026-09-25 00:00:00+07", changesText: "{}" };
      const hash = crypto
        .createHash("sha256")
        .update(`${row.entityKey}${row.at}${row.changesText}`)
        .digest("hex");
      let rowHash: string | null = hash;
      if (this.options.unsignedAudit) rowHash = null;
      if (this.options.tamperedAudit) rowHash = "broken";
      return { rows: [{ ...row, rowHash }] };
    }
    if (sql.includes("LEFT JOIN engineering_objects")) {
      assert.ok(sql.includes("IS DISTINCT FROM") && sql.includes("f.id IS NULL"));
      return { rows: [{ cnt: this.options.relationCount ?? "0" }] };
    }
    if (sql.includes("COUNT(*)")) return { rows: [{ cnt: "1" }] };
    return { rows: [] };
  }
}

test("DR: cấu hình đích riêng bắt buộc, không fallback DATABASE_URL", () => {
  const { readDrTarget } = moduleUnderTest();
  assert.throws(() => readDrTarget({ DATABASE_URL: "postgres://a:b@host/source" }), /DR_VERIFY/);
  const env = {
    DR_VERIFY_DATABASE_URL: "postgresql://u:secret@dr-host/xboss_dr_fixture",
    DR_VERIFY_EXPECTED_DATABASE: target.expectedDatabase,
    DR_VERIFY_EXPECTED_USER: target.expectedUser,
  };
  assert.equal(readDrTarget(env).expectedDatabase, target.expectedDatabase);
  assert.throws(() => readDrTarget({ ...env, DATABASE_URL: env.DR_VERIFY_DATABASE_URL }), /trùng/);
  assert.throws(
    () =>
      readDrTarget({
        ...env,
        MIGRATE_DATABASE_URL: "postgres://other:other@dr-host:5432/xboss_dr_fixture",
      }),
    /trùng/,
  );
  try {
    readDrTarget({ ...env, DR_VERIFY_DATABASE_URL: "not-a-url-with-sensitive-content" });
    assert.fail("URL lỗi phải bị từ chối");
  } catch (error) {
    assert.ok(!String(error).includes("sensitive-content"));
  }
});

test("DR: mọi kiểm tra cùng snapshot chỉ-đọc, không chạy default reader/migration", async () => {
  const { runDrChecks } = moduleUnderTest();
  const client = new FakeClient();
  const results = await runDrChecks(client, target, ["0001_fixture.sql"]);
  assert.equal(client.commands[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(client.commands.at(-1), "ROLLBACK");
  assert.ok(client.commands.includes("SET LOCAL row_security = off"));
  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.status === "PASS"));
  const counts = results.find((result) => result.name === "table-counts");
  assert.ok(counts?.details.includes("chưa đối soát"));
});

for (const options of [{ wrongTarget: true }, { writable: true }]) {
  test(`DR: preflight không đạt thì không đọc bảng (${JSON.stringify(options)})`, async () => {
    const client = new FakeClient(options);
    const result = await moduleUnderTest().runDrChecks(client, target, ["0001_fixture.sql"]);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, "FAIL");
    assert.ok(!client.commands.some((sql) => sql.includes("FROM ")));
    assert.equal(client.commands.at(-1), "ROLLBACK");
  });
}

for (const options of [{ emptyAudit: true }, { unsignedAudit: true }]) {
  test(`DR: audit chưa có coverage không được báo PASS (${JSON.stringify(options)})`, async () => {
    const result = await moduleUnderTest().runDrChecks(new FakeClient(options), target, [
      "0001_fixture.sql",
    ]);
    assert.equal(result.find((item) => item.name === "audit-chain")?.status, "NOT_RUN");
  });
}

test("DR: hash sai và quan hệ mồ côi/lệch dự án bị đánh FAIL", async () => {
  const client = new FakeClient({ tamperedAudit: true, relationCount: "2" });
  const results = await moduleUnderTest().runDrChecks(client, target, ["0001_fixture.sql"]);
  assert.equal(results.find((r) => r.name === "audit-chain")?.status, "FAIL");
  assert.equal(results.find((r) => r.name === "engineering-relations")?.status, "FAIL");
});

test("DR: migration thiếu, thừa hoặc danh sách rỗng không được báo PASS", async () => {
  const { runDrChecks } = moduleUnderTest();
  for (const names of [[], ["different.sql"], ["0001_fixture.sql", "0001_fixture.sql"]]) {
    const results = await runDrChecks(new FakeClient(), target, names);
    assert.equal(results.find((r) => r.name === "migration-names")?.status, "FAIL");
  }
  const results = await runDrChecks(new FakeClient({ extraMigration: true }), target, [
    "0001_fixture.sql",
  ]);
  assert.equal(results.find((r) => r.name === "migration-names")?.status, "FAIL");
});

test("DR: lỗi query khôi phục savepoint, không lộ secret, vẫn kiểm các mục sau", async () => {
  const client = new FakeClient({ migrationError: true });
  const results = await moduleUnderTest().runDrChecks(client, target, ["0001_fixture.sql"]);
  assert.equal(results.find((r) => r.name === "migration-names")?.status, "FAIL");
  assert.equal(results.find((r) => r.name === "engineering-relations")?.status, "PASS");
  assert.ok(client.commands.some((sql) => sql.startsWith("ROLLBACK TO SAVEPOINT")));
  assert.ok(!JSON.stringify(results).includes("sensitive"));
  assert.ok(!JSON.stringify(results).includes("secret"));
});

test("DR: CLI không dùng pool ứng dụng và không tuyên bố đã kiểm chứng DR đầy đủ", () => {
  const source = readFileSync(resolve("scripts/verify-dr-restore.ts"), "utf8");
  assert.ok(!source.includes("getPool"));
  assert.ok(source.includes("default_transaction_read_only=on"));
  assert.ok(source.includes("completeDrVerified: false"));
  assert.ok(source.includes('result.status === "PASS"'));
});
