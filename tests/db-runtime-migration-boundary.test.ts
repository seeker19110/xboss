import "./setup"; // phải đứng đầu để loại DATABASE_URL thật trước khi cài fixture giả
import { mock, test } from "node:test";
import assert from "node:assert/strict";

const poolOptions: Array<{ connectionString?: string }> = [];
const sqlSeen: string[] = [];
let expectedMigrations: string[] = [];

function resultFor(sql: string) {
  sqlSeen.push(sql);
  if (/FROM schema_migrations/i.test(sql))
    return {
      rows: expectedMigrations.map((name) => ({ name })),
      rowCount: expectedMigrations.length,
    };
  if (/RETURNING id/i.test(sql)) return { rows: [{ id: 17 }], rowCount: 1 };
  if (/SELECT/i.test(sql)) return { rows: [{ value: 1 }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
}

class FakePool {
  constructor(options: { connectionString?: string }) {
    poolOptions.push(options);
  }
  query(sql: string) {
    return Promise.resolve(resultFor(sql));
  }
  async connect() {
    return {
      query: async (sql: string) => resultFor(sql),
      release() {},
    };
  }
  async end() {}
}

mock.module("pg", {
  namedExports: {
    Pool: FakePool,
    types: { setTypeParser() {} },
  },
});

test("runtime DB helpers validate schema with reads only; explicit migration uses its own URL", async () => {
  process.env.DATABASE_URL = "postgres://runtime-user:runtime-pass@runtime/db";
  process.env.MIGRATE_DATABASE_URL = "postgres://migration-user:migration-pass@migration/db";

  const migration = await import("@/lib/db/migrate");
  expectedMigrations = migration.listMigrationFiles();
  const db = await import("@/lib/db");

  assert.equal((await db.queryOne<{ value: number }>("SELECT 1 AS runtime"))?.value, 1);
  await db.run("UPDATE fixture SET value = ?", 2);
  assert.equal(await db.insertId("INSERT INTO fixture(value) VALUES (?)", 3), 17);
  await db.withTransaction(() => db.queryOne("SELECT 1 AS transaction_value"));

  assert.ok(sqlSeen.some((sql) => /SELECT name FROM schema_migrations/i.test(sql)));
  assert.ok(
    sqlSeen.every((sql) => !/^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)),
    `runtime path must not issue DDL: ${sqlSeen.join(" | ")}`,
  );

  const migrationPool = migration.getMigrationPool();
  assert.equal(poolOptions.at(-1)?.connectionString, process.env.MIGRATE_DATABASE_URL);
  await migrationPool.end();

  delete process.env.MIGRATE_DATABASE_URL;
  assert.throws(() => migration.getMigrationPool(), /MIGRATE_DATABASE_URL/);
  assert.equal(poolOptions.length, 2, "không tạo pool bằng DATABASE_URL khi thiếu URL migration");
});

test("migration dry-run không tạo schema_migrations nếu bảng tracking chưa có", async () => {
  const migration = await import("@/lib/db/migrate");
  const pool = new FakePool({ connectionString: "postgres://migration/db" });
  const client = {
    async query(sql: string) {
      sqlSeen.push(sql);
      if (/FROM schema_migrations/i.test(sql))
        throw Object.assign(new Error("missing table"), { code: "42P01" });
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  pool.connect = async () => client;

  const pending = await migration.pendingMigrations(pool as never);
  assert.deepEqual(pending, migration.listMigrationFiles());
  assert.ok(!sqlSeen.some((sql) => /^\s*CREATE\s+TABLE/i.test(sql)));
});
