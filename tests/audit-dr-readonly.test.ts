import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import type { DrClient, DrInput } from "../scripts/lib/dr-readonly";

type DrModule = typeof import("../scripts/lib/dr-readonly");
const MARKER = "xboss-disposable:0123456789abcdef0123";
const target = {
  expectedDatabase: "xboss_dr_fixture",
  expectedUser: "dr_reader",
  expectedMarker: MARKER,
  markerDatabase: "xboss_dr_fixture",
};
const MIGRATIONS = [{ name: "0001_fixture.sql", sha256: "a".repeat(64) }];

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
  return load("scripts/lib/dr-readonly.ts", {
    "node:crypto": crypto,
    "@/lib/bao-mat/merkle-audit-ledger": ledger,
    "./recovery-manifest": load("scripts/lib/recovery-manifest.ts", {}),
    "./dr-snapshot": load("scripts/lib/dr-snapshot.ts", {}),
  });
}

function input(overrides: Partial<DrInput> = {}): DrInput {
  return {
    migrations: MIGRATIONS,
    manifest: null,
    appSha: null,
    attachments: null,
    artifacts: null,
    ...overrides,
  };
}

class FakeClient implements DrClient {
  commands: string[] = [];
  constructor(
    private options: {
      wrongTarget?: boolean;
      writable?: boolean;
      noMarker?: boolean;
      emptyAudit?: boolean;
      unsignedAudit?: boolean;
      tamperedAudit?: boolean;
      extraMigration?: boolean;
      migrationError?: boolean;
      relationViolations?: string;
      rlsBlocked?: boolean;
    } = {},
  ) {}

  async query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    this.commands.push(sql);
    assert.ok(!/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/.test(sql));
    if (sql.includes("current_database()")) {
      assert.deepEqual(Array.from(params ?? []), [MARKER, target.markerDatabase]);
      return {
        rows: [
          {
            db: this.options.wrongTarget ? "wrong_database" : target.expectedDatabase,
            usr: target.expectedUser,
            readonly: this.options.writable ? "off" : "on",
            marker_ok: !this.options.noMarker,
          },
        ],
      };
    }
    if (sql.includes("FROM pg_roles")) {
      return { rows: [{ rolsuper: false, rolbypassrls: !this.options.rlsBlocked }] };
    }
    if (sql.includes("has_table_privilege")) {
      const tables = (params?.[0] ?? []) as string[];
      return {
        rows: tables.map((name) => ({
          name,
          rls: this.options.rlsBlocked ? name === "users" : false,
          force_rls: true,
          is_owner: false,
          can_select: true,
        })),
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
    if (sql.includes("AS violations")) {
      if (this.options.rlsBlocked && /\busers\b/.test(sql)) {
        throw Object.assign(new Error("query would be affected by row-level security policy"), {
          code: "42501",
        });
      }
      if (sql.includes("engineering_object_relations")) {
        assert.ok(sql.includes("IS DISTINCT FROM") && sql.includes("f.id IS NULL"));
        return { rows: [{ violations: this.options.relationViolations ?? "0" }] };
      }
      return { rows: [{ violations: "0" }] };
    }
    return { rows: [] };
  }
}

const statusOf = (results: { name: string; status: string }[], name: string) =>
  results.find((result) => result.name === name)?.status;

test("DR: cấu hình đích riêng + marker bắt buộc, không fallback DATABASE_URL", () => {
  const { readDrTarget } = moduleUnderTest();
  assert.throws(() => readDrTarget({ DATABASE_URL: "postgres://a:b@host/source" }), /DR_VERIFY/);
  const env = {
    DR_VERIFY_DATABASE_URL: "postgresql://u:secret@dr-host/xboss_dr_fixture",
    DR_VERIFY_EXPECTED_DATABASE: target.expectedDatabase,
    DR_VERIFY_EXPECTED_USER: target.expectedUser,
    DR_VERIFY_EXPECTED_MARKER: MARKER,
  };
  const parsed = readDrTarget(env);
  assert.equal(parsed.expectedDatabase, target.expectedDatabase);
  assert.equal(parsed.markerDatabase, target.expectedDatabase);
  assert.equal(
    readDrTarget({ ...env, DR_VERIFY_MARKER_DATABASE: "restore_control" }).markerDatabase,
    "restore_control",
  );
  assert.throws(() => readDrTarget({ ...env, DR_VERIFY_EXPECTED_MARKER: "" }), /MARKER/);
  assert.throws(() => readDrTarget({ ...env, DR_VERIFY_EXPECTED_MARKER: "xboss-disposable:x" }));
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

test("DR: đích trùng danh tính nguồn ghi trong manifest bị FAIL trước kết nối", () => {
  const { checkSourceDistinct, identityHash } = moduleUnderTest();
  const dr = {
    ...target,
    connectionString: "postgresql://u:secret@dr-host/xboss_dr_fixture",
  };
  const manifestFor = (hash: string) =>
    ({ kind: "v1", manifest: { source: { identityHash: hash } } }) as never;
  // Khác credential nhưng cùng host:port/db vẫn là cùng nguồn.
  const same = identityHash("postgres://khac:khac@DR-HOST:5432/xboss_dr_fixture");
  assert.equal(checkSourceDistinct(dr, manifestFor(same)).status, "FAIL");
  assert.equal(checkSourceDistinct(dr, manifestFor("f".repeat(32))).status, "PASS");
  assert.equal(checkSourceDistinct(dr, null).status, "NOT_RUN");
  assert.ok(!same.includes("dr-host"));
});

test("DR: không manifest → hạng mục cần manifest NOT_RUN, phần đo được vẫn chạy, không PASS toàn bộ", async () => {
  const { runDrChecks, summarizeDrChecks } = moduleUnderTest();
  const client = new FakeClient();
  const results = await runDrChecks(client, target, input());
  assert.equal(client.commands[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(client.commands.at(-1), "ROLLBACK");
  assert.ok(client.commands.includes("SET LOCAL row_security = off"));
  for (const name of ["target", "audit-role-access", "migration-names", "audit-chain"]) {
    assert.equal(statusOf(results, name), "PASS", name);
  }
  assert.ok(results.filter((r) => r.name.startsWith("integrity:")).length >= 20);
  assert.ok(
    results.filter((r) => r.name.startsWith("integrity:")).every((r) => r.status === "PASS"),
  );
  for (const name of [
    "manifest",
    "migration-checksums",
    "table-digests",
    "finance-totals",
    "audit-watermark",
    "attachments-manifest",
    "backup-artifacts",
    "encryption-key-reference",
    "encryption-key-availability",
    "wal-coverage",
    "rpo",
    "rto",
  ]) {
    assert.equal(statusOf(results, name), "NOT_RUN", name);
  }
  assert.match(results.find((r) => r.name === "table-digests")!.reason, /--manifest/);
  const summary = summarizeDrChecks(results);
  assert.equal(summary.completeDrVerified, false);
  assert.equal(summary.fixtureChecksPassed, false);
});

for (const options of [{ wrongTarget: true }, { writable: true }, { noMarker: true }]) {
  test(`DR: preflight không đạt thì không đọc bảng nghiệp vụ (${JSON.stringify(options)})`, async () => {
    const client = new FakeClient(options);
    const result = await moduleUnderTest().runDrChecks(client, target, input());
    // Mảng tạo trong vm context khác realm → so qua JSON.
    assert.equal(JSON.stringify(result.map((r) => [r.name, r.status])), '[["target","FAIL"]]');
    assert.equal(client.commands.length, 3);
    assert.equal(client.commands.at(-1), "ROLLBACK");
    assert.ok(!JSON.stringify(result).includes(MARKER));
  });
}

for (const options of [{ emptyAudit: true }, { unsignedAudit: true }]) {
  test(`DR: audit chưa có coverage không được báo PASS (${JSON.stringify(options)})`, async () => {
    const result = await moduleUnderTest().runDrChecks(new FakeClient(options), target, input());
    assert.equal(statusOf(result, "audit-chain"), "NOT_RUN");
  });
}

test("DR: hash sai và quan hệ engineering mồ côi/lệch dự án bị đánh FAIL", async () => {
  const client = new FakeClient({ tamperedAudit: true, relationViolations: "2" });
  const results = await moduleUnderTest().runDrChecks(client, target, input());
  assert.equal(statusOf(results, "audit-chain"), "FAIL");
  assert.equal(statusOf(results, "integrity:engineering_object_relations-scope"), "FAIL");
  // Verifier cũ trỏ nhầm bảng không tồn tại `engineering_relations` → luôn FAIL trên DB thật.
  assert.ok(!client.commands.some((sql) => /\bengineering_relations\b/.test(sql)));
});

test("DR: role bị RLS che → NOT_RUN (không coi số 0 là hợp lệ, không FAIL giả)", async () => {
  const results = await moduleUnderTest().runDrChecks(
    new FakeClient({ rlsBlocked: true }),
    target,
    input(),
  );
  assert.equal(statusOf(results, "audit-role-access"), "NOT_RUN");
  assert.equal(statusOf(results, "integrity:users-org"), "NOT_RUN");
  assert.match(results.find((r) => r.name === "integrity:users-org")!.reason, /BYPASSRLS/);
});

test("DR: migration thiếu, thừa hoặc danh sách rỗng không được báo PASS", async () => {
  const { runDrChecks } = moduleUnderTest();
  const sha = "b".repeat(64);
  for (const names of [[], ["different.sql"], ["0001_fixture.sql", "0001_fixture.sql"]]) {
    const results = await runDrChecks(
      new FakeClient(),
      target,
      input({ migrations: names.map((name) => ({ name, sha256: sha })) }),
    );
    assert.equal(statusOf(results, "migration-names"), "FAIL");
  }
  const results = await runDrChecks(new FakeClient({ extraMigration: true }), target, input());
  assert.equal(statusOf(results, "migration-names"), "FAIL");
});

test("DR: lỗi query khôi phục savepoint, không lộ secret, vẫn kiểm các mục sau", async () => {
  const client = new FakeClient({ migrationError: true });
  const results = await moduleUnderTest().runDrChecks(client, target, input());
  assert.equal(statusOf(results, "migration-names"), "FAIL");
  assert.equal(statusOf(results, "integrity:engineering_object_relations-scope"), "PASS");
  assert.ok(client.commands.some((sql) => sql.startsWith("ROLLBACK TO SAVEPOINT")));
  assert.ok(!JSON.stringify(results).includes("sensitive"));
  assert.ok(!JSON.stringify(results).includes("secret"));
});

test("DR: CLI không dùng pool ứng dụng, secret chỉ qua env, exit theo completeDrVerified", () => {
  const source = readFileSync(resolve("scripts/verify-dr-restore.ts"), "utf8");
  assert.ok(!source.includes("getPool"));
  assert.ok(!source.includes('"@/lib/db"'));
  assert.ok(source.includes("default_transaction_read_only=on"));
  assert.ok(source.includes("summary.completeDrVerified ? 0 : 1"));
  assert.ok(!/completeDrVerified:\s*true/.test(source));
  // Không có cờ CLI nhận URL/mật khẩu.
  assert.ok(!/--(database-url|url|password|dsn)\b/.test(source));
});
