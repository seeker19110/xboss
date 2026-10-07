import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chỉ dùng PostgreSQL disposable của test
// S14 / A6 — recovery set tổng hợp trên PostgreSQL thật: sinh manifest v1 từ DB nguồn (cùng
// snapshot với pg_dump), restore sang DB đích cách ly, rồi chạy verifier. Chứng minh:
//   A6-AC01 (lớp fixture — CHƯA phải PITR thật), A6-AC02, A6-AC03, A6-AC04;
//   A6-AC05/Q-AC08 phải ra NOT_RUN khi chưa có số đo hạ tầng.
// Mọi DB/role/tệp do test tạo đều mang hậu tố ngẫu nhiên và được dọn ở after().
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client, Pool } from "pg";
import { runMigrations } from "@/lib/db/migrate";
import {
  identityHash,
  runDrChecks,
  summarizeDrChecks,
  type DrCheck,
  type DrClient,
  type DrInput,
} from "../scripts/lib/dr-readonly";
import { directoryHasher, readRepoMigrations } from "../scripts/lib/dr-files";
import {
  parseRecoveryManifest,
  type ManifestRead,
  type RecoveryManifestV1,
} from "../scripts/lib/recovery-manifest";

const sfx = randomUUID().replaceAll("-", "").slice(0, 12);
const SRC = `xboss_dr_src_${sfx}`;
const TGT = `xboss_dr_tgt_${sfx}`;
const AUDIT_ROLE = `dr_audit_${sfx}`;
const NORLS_ROLE = `dr_norls_${sfx}`;
const AUDIT_PW = `pw${randomUUID().replaceAll("-", "")}`;
const MARKER = `xboss-disposable:${randomUUID().replaceAll("-", "")}`;
const APP_SHA = "abcdef0123456789abcdef0123456789abcdef01";
const INFRA = ["encryption-key-availability", "wal-coverage", "rpo", "rto"];
const DDL_OR_WRITE =
  /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|DROP|GRANT|REVOKE|COMMENT|COPY|VACUUM)\b/i;

const work = mkdtempSync(join(tmpdir(), "xboss-dr-verify-"));
const srcUploads = join(work, "uploads-src");
const restoredUploads = join(work, "uploads-restored");
const artifactsDir = join(work, "artifacts");
const manifestPath = join(work, `xboss-${sfx}.recovery-v1.json`);
const dumpPath = join(artifactsDir, `xboss-${sfx}.snapshot.dump`);
const createdDbs: string[] = [];
let manifest: RecoveryManifestV1;
let repoMigrations: ReturnType<typeof readRepoMigrations>;

function url(db: string, user = "ci", password = "ci"): string {
  const base = new URL(process.env.TEST_DATABASE_URL!);
  base.username = user;
  base.password = password;
  base.pathname = `/${db}`;
  base.search = "";
  return base.toString();
}

// Env tối thiểu cho tiến trình con: không kế thừa DATABASE_URL/secret của tiến trình test.
function childEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME, ...extra };
}

function pgEnv(db: string): NodeJS.ProcessEnv {
  const base = new URL(process.env.TEST_DATABASE_URL!);
  return childEnv({
    PGHOST: base.hostname,
    PGPORT: base.port || "5432",
    PGUSER: decodeURIComponent(base.username),
    PGPASSWORD: decodeURIComponent(base.password),
    PGDATABASE: db,
  });
}

async function withAdmin<T>(fn: (client: Client) => Promise<T>, db?: string): Promise<T> {
  const client = new Client({
    connectionString: db ? url(db) : process.env.TEST_DATABASE_URL,
    options: "-c timezone=Asia/Ho_Chi_Minh",
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function runTsx(script: string, args: string[], env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv(env),
    timeout: 180_000,
  });
}

function writeFile(dir: string, name: string, content: string) {
  writeFileSync(join(dir, name), content);
  return {
    name,
    size: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function seedSource(client: Client): Promise<void> {
  mkdirSync(srcUploads);
  const q = async (sql: string, params: unknown[] = []) =>
    (await client.query(sql, params)).rows[0] as Record<string, number>;
  const orgB = (await q("INSERT INTO organizations (name) VALUES ('Tổ chức B DR') RETURNING id"))
    .id;
  const userA = (
    await q(
      "INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Kỹ sư A', $1, 'x', 'pm', 1) RETURNING id",
      [`a-${sfx}@dr.test`],
    )
  ).id;
  const userB = (
    await q(
      "INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Kỹ sư B', $1, 'x', 'pm', $2) RETURNING id",
      [`b-${sfx}@dr.test`, orgB],
    )
  ).id;
  const projectA = (
    await q("INSERT INTO projects (name, code, org_id) VALUES ('Dự án A', 'DA', 1) RETURNING id")
  ).id;
  const projectB = (
    await q("INSERT INTO projects (name, code, org_id) VALUES ('Dự án B', 'DB', $1) RETURNING id", [
      orgB,
    ])
  ).id;
  await client.query("INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2), ($3, $4)", [
    userA,
    projectA,
    userB,
    projectB,
  ]);
  const tower = (
    await q("INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp A') RETURNING id", [projectA])
  ).id;
  const sheet = (
    await q(
      "INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, 'OG', 'Ống gió', $2) RETURNING id",
      [tower, `og-${sfx}`],
    )
  ).id;
  const pkg = (
    await q(
      "INSERT INTO work_packages (sheet_type_id, code, name) VALUES ($1, 'A1', 'Nhóm A1') RETURNING id",
      [sheet],
    )
  ).id;
  const task = (
    await q(
      "INSERT INTO tasks (package_id, code, name, progress_percent) VALUES ($1, 'A1,01', 'Lắp ống', 0.5) RETURNING id",
      [pkg],
    )
  ).id;
  const contract = (
    await q(
      `INSERT INTO contracts (code, kind, title, value, advance_pct, retention_pct, project_id)
       VALUES ('HD-01', 'nhan_thau', 'Hợp đồng chính', 1234567.89, 10, 5, $1) RETURNING id`,
      [projectA],
    )
  ).id;
  const boq1 = (
    await q(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id, project_id)
       VALUES ('B1', 'Ống thép', 'm', 10.000, 5.00, $1, $2) RETURNING id`,
      [contract, projectA],
    )
  ).id;
  const boq2 = (
    await q(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id, project_id)
       VALUES ('B2', 'Van', 'cái', 3.000, 12345.67, $1, $2) RETURNING id`,
      [contract, projectA],
    )
  ).id;
  const cert = (
    await q(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
       VALUES ('IPC-01', $1, 1, 'draft') RETURNING id`,
      [contract],
    )
  ).id;
  // F-MONEY: hai dòng qty 0.001 × 5.00 — tổng exact 0.01 (không 0.02, không float).
  await client.query(
    `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
     VALUES ($1, $2, 0.001, 0.001, 5.00), ($1, $3, 0.001, 0.001, 5.00)`,
    [cert, boq1, boq2],
  );
  await client.query(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id, payment_cert_id, project_id)
     VALUES ('Thầu phụ', 'bill', 1000.10, '2026-09-30', $1, $2, $3)`,
    [contract, cert, projectA],
  );
  await client.query(
    `INSERT INTO invoices (project_id, invoice_no, direction, net_amount, vat_amount, contract_id)
     VALUES ($1, 'HĐ-001', 'out', 1000.00, 80.00, $2)`,
    [projectA, contract],
  );
  const bbnt = writeFile(srcUploads, `bbnt-${sfx}.pdf`, `%PDF biên bản nghiệm thu ${sfx}`);
  const hd = writeFile(srcUploads, `hd-${sfx}.pdf`, `%PDF hồ sơ hợp đồng ${sfx}`);
  await client.query(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, size_bytes, sha256, uploaded_by)
     VALUES ($1, $2, 'bbnt.pdf', 'application/pdf', $3, $4, $5)`,
    [task, bbnt.name, bbnt.size, bbnt.sha256, userA],
  );
  await client.query(
    `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, size_bytes, sha256, uploaded_by)
     VALUES ($1, $2, 'hd.pdf', 'application/pdf', $3, $4, $5)`,
    [contract, hd.name, hd.size, hd.sha256, userA],
  );
  // Tài liệu dạng link ngoài (file_name rỗng) không phải tệp critical cần băm.
  await client.query(
    `INSERT INTO task_documents (task_id, file_name, link_url, original_name) VALUES ($1, '', 'https://example.test/x', 'link')`,
    [task],
  );
}

async function cloneTarget(name: string): Promise<string> {
  const db = `${TGT}_${name}`;
  await withAdmin(async (admin) => {
    await admin.query(`CREATE DATABASE ${db} TEMPLATE ${TGT}`);
    createdDbs.push(db);
    await admin.query(`COMMENT ON DATABASE ${db} IS '${MARKER}'`);
  });
  return db;
}

type Recorded = { client: DrClient; commands: string[] };
function recording(client: Client): Recorded {
  const commands: string[] = [];
  return {
    commands,
    client: {
      async query(sql: string, params?: unknown[]) {
        commands.push(sql);
        const result = await client.query(sql, params as unknown[]);
        return { rows: result.rows as Record<string, unknown>[] };
      },
    },
  };
}

async function verifyInProcess(
  options: {
    db?: string;
    user?: string;
    password?: string;
    manifest?: ManifestRead | null;
    attachments?: string | null;
    artifacts?: string | null;
    marker?: string;
    expectedDatabase?: string;
  } = {},
): Promise<{ results: DrCheck[]; commands: string[] }> {
  const db = options.db ?? TGT;
  const user = options.user ?? AUDIT_ROLE;
  const client = new Client({
    connectionString: url(db, user, options.password ?? AUDIT_PW),
    options: "-c default_transaction_read_only=on -c timezone=Asia/Ho_Chi_Minh",
  });
  await client.connect();
  const rec = recording(client);
  try {
    const input: DrInput = {
      migrations: repoMigrations,
      manifest:
        options.manifest === undefined ? { kind: "v1", manifest } : (options.manifest ?? null),
      appSha: APP_SHA,
      attachments:
        options.attachments === null
          ? null
          : directoryHasher(options.attachments ?? restoredUploads),
      artifacts:
        options.artifacts === null ? null : directoryHasher(options.artifacts ?? artifactsDir),
    };
    const results = await runDrChecks(
      rec.client,
      {
        expectedDatabase: options.expectedDatabase ?? db,
        expectedUser: user,
        expectedMarker: options.marker ?? MARKER,
        markerDatabase: db,
      },
      input,
    );
    return { results, commands: rec.commands };
  } finally {
    await client.end();
  }
}

function status(results: DrCheck[], name: string): string | undefined {
  return results.find((r) => r.name === name)?.status;
}

function mutated(fn: (m: RecoveryManifestV1) => void): ManifestRead {
  const copy = JSON.parse(JSON.stringify(manifest)) as RecoveryManifestV1;
  fn(copy);
  return parseRecoveryManifest(copy);
}

describe("DR verifier trên recovery set tổng hợp (PostgreSQL thật)", { skip: !HAS_TEST_DB }, () => {
  before(async () => {
    repoMigrations = readRepoMigrations();
    mkdirSync(artifactsDir);
    await withAdmin(async (admin) => {
      await admin.query(
        `CREATE ROLE ${AUDIT_ROLE} LOGIN NOSUPERUSER BYPASSRLS PASSWORD '${AUDIT_PW}'`,
      );
      await admin.query(`GRANT pg_read_all_data TO ${AUDIT_ROLE}`);
      await admin.query(
        `CREATE ROLE ${NORLS_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${AUDIT_PW}'`,
      );
      await admin.query(`GRANT pg_read_all_data TO ${NORLS_ROLE}`);
      await admin.query(`CREATE DATABASE ${SRC}`);
      createdDbs.push(SRC);
    });
    const pool = new Pool({ connectionString: url(SRC) });
    try {
      await runMigrations(pool);
    } finally {
      await pool.end();
    }
    await withAdmin(seedSource, SRC);

    // Sinh manifest + dump CÙNG snapshot bằng CLI thật, role audit chỉ-đọc.
    const gen = runTsx(
      "scripts/lib/recovery-manifest-cli.ts",
      [
        "--out",
        manifestPath,
        "--pg-dump",
        dumpPath,
        "--attachments-dir",
        srcUploads,
        "--recovery-set-id",
        `fixture-${sfx}`,
        "--app-sha",
        APP_SHA,
        "--key-provider",
        "fixture-vault",
        "--key-id",
        "transit/keys/xboss-backup",
        "--key-version",
        "v1",
      ],
      {
        DR_SOURCE_DATABASE_URL: url(SRC, AUDIT_ROLE, AUDIT_PW),
        DR_SOURCE_EXPECTED_DATABASE: SRC,
        DR_SOURCE_EXPECTED_USER: AUDIT_ROLE,
      },
    );
    assert.equal(gen.status, 0, `Sinh manifest lỗi: ${gen.stderr}`);
    assert.ok(!gen.stdout.includes(AUDIT_PW) && !gen.stderr.includes(AUDIT_PW));
    const read = parseRecoveryManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    assert.equal(read.kind, "v1");
    manifest = (read as { kind: "v1"; manifest: RecoveryManifestV1 }).manifest;

    // Restore sang đích cách ly (khác DB nguồn) + khôi phục tệp sang thư mục riêng.
    await withAdmin(async (admin) => {
      await admin.query(`CREATE DATABASE ${TGT}`);
      createdDbs.push(TGT);
    });
    const restore = spawnSync(
      "pg_restore",
      ["--no-owner", "--exit-on-error", "--no-password", "-d", TGT, dumpPath],
      { env: pgEnv(TGT), encoding: "utf8" },
    );
    assert.equal(restore.status, 0, `pg_restore lỗi: ${restore.stderr}`);
    await withAdmin((admin) => admin.query(`COMMENT ON DATABASE ${TGT} IS '${MARKER}'`));
    cpSync(srcUploads, restoredUploads, { recursive: true });
  });

  after(async () => {
    await withAdmin(async (admin) => {
      for (const db of createdDbs.reverse()) {
        await admin.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [db],
        );
        await admin.query(`DROP DATABASE IF EXISTS ${db}`);
      }
      for (const role of [AUDIT_ROLE, NORLS_ROLE]) {
        await admin.query(`DROP ROLE IF EXISTS ${role}`);
      }
    });
    rmSync(work, { recursive: true, force: true });
  });

  test("manifest v1 sinh từ snapshot: đủ trường A6-FR01, tiền là chuỗi exact, chỉ tham chiếu key", () => {
    assert.equal(manifest.recoverySetId, `fixture-${sfx}`);
    assert.equal(manifest.appSha, APP_SHA);
    assert.equal(manifest.source.identityHash, identityHash(url(SRC, AUDIT_ROLE, AUDIT_PW)));
    assert.equal(manifest.migrations.length, repoMigrations.length);
    assert.equal(manifest.artifacts.length, 1);
    assert.equal(manifest.attachments.length, 2);
    assert.deepEqual(manifest.encryptionKeyReference, {
      provider: "fixture-vault",
      keyId: "transit/keys/xboss-backup",
      keyVersion: "v1",
    });
    const ipc = manifest.financeTotals.find((t) => t.key === "payment_cert_items.period_amount");
    assert.equal(ipc?.sum, "0.01000");
    assert.equal(
      manifest.financeTotals.find((t) => t.key === "contracts.value")?.sum,
      "1234567.89",
    );
    assert.ok(Number(manifest.audit.totalRows) > 0);
    assert.equal(manifest.audit.totalRows, manifest.audit.hashedRows);
    assert.equal(manifest.wal, null);
    assert.equal(manifest.measurements, null);
    const raw = readFileSync(manifestPath, "utf8");
    assert.ok(!raw.includes(AUDIT_PW) && !raw.includes("postgres://"));
  });

  test("A6-AC01 (fixture, chưa phải PITR thật): mọi hạng mục đo được PASS; hạ tầng NOT_RUN; exit ≠ 0", () => {
    const run = runTsx(
      "scripts/verify-dr-restore.ts",
      [
        "--manifest",
        manifestPath,
        "--attachments-dir",
        restoredUploads,
        "--artifacts-dir",
        artifactsDir,
        "--app-sha",
        APP_SHA,
        "--evidence-out",
        join(work, "evidence-baseline.json"),
      ],
      {
        DR_VERIFY_DATABASE_URL: url(TGT, AUDIT_ROLE, AUDIT_PW),
        DR_VERIFY_EXPECTED_DATABASE: TGT,
        DR_VERIFY_EXPECTED_USER: AUDIT_ROLE,
        DR_VERIFY_EXPECTED_MARKER: MARKER,
        DATABASE_URL: url(SRC),
      },
    );
    assert.equal(run.status, 1, run.stderr);
    for (const out of [run.stdout, run.stderr]) {
      assert.ok(!out.includes(AUDIT_PW), "không lộ mật khẩu");
      assert.ok(!out.includes("postgres://") && !out.includes("postgresql://"), "không lộ URI");
      assert.ok(!out.includes(MARKER), "không lộ marker");
    }
    const report = JSON.parse(run.stdout);
    assert.deepEqual(
      JSON.parse(readFileSync(join(work, "evidence-baseline.json"), "utf8")),
      report,
    );
    const results = report.results as DrCheck[];
    const notPass = results.filter((r) => r.evidence === "fixture" && r.status !== "PASS");
    assert.deepEqual(notPass, [], "mọi hạng mục fixture phải PASS");
    assert.equal(report.fixtureChecksPassed, true);
    for (const name of INFRA) {
      const check = results.find((r) => r.name === name);
      assert.equal(check?.status, "NOT_RUN", name);
      assert.equal(check?.evidence, "infrastructure");
    }
    assert.match(results.find((r) => r.name === "wal-coverage")!.reason, /hạ tầng archive thật/);
    assert.equal(report.completeDrVerified, false, "chưa đo hạ tầng thì chưa PASS toàn bộ");
    for (const name of [
      "source-distinct",
      "target",
      "audit-role-access",
      "migration-checksums",
      "table-digests",
      "finance-totals",
      "schema-objects",
      "audit-chain",
      "audit-watermark",
      "attachments-manifest",
      "attachments-files",
      "backup-artifacts",
      "encryption-key-reference",
      "integrity:payment_cert_items-scope",
      "integrity:user_projects-cross-org",
      "integrity:engineering_object_relations-scope",
    ]) {
      assert.equal(status(results, name), "PASS", name);
    }
  });

  test("A6-AC03: verifier chỉ SELECT/SET LOCAL/SAVEPOINT trong snapshot chỉ-đọc, không DDL/ghi", async () => {
    const { results, commands } = await verifyInProcess();
    assert.equal(summarizeDrChecks(results).fixtureChecksPassed, true);
    assert.equal(commands[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(commands.at(-1), "ROLLBACK");
    for (const sql of commands) assert.ok(!DDL_OR_WRITE.test(sql), sql.slice(0, 80));
  });

  test("A6-AC02: checksum migration lệch → FAIL đúng hạng mục", async () => {
    const { results } = await verifyInProcess({
      manifest: mutated((m) => {
        m.migrations[3].sha256 = "0".repeat(64);
      }),
    });
    assert.equal(status(results, "migration-checksums"), "FAIL");
    assert.equal(status(results, "table-digests"), "PASS");
    assert.match(
      JSON.stringify(results.find((r) => r.name === "migration-checksums")),
      /lệch-sha256/,
    );
  });

  test("A6-AC02: manifest thiếu 1 tệp critical, hoặc tệp khôi phục bị mất/hỏng → FAIL", async () => {
    const dropped = await verifyInProcess({
      manifest: mutated((m) => {
        m.attachments = m.attachments.filter((a) => a.table !== "task_documents");
      }),
    });
    assert.equal(status(dropped.results, "attachments-manifest"), "FAIL");

    const partialDir = join(work, "uploads-missing");
    cpSync(restoredUploads, partialDir, { recursive: true });
    rmSync(join(partialDir, manifest.attachments[0].key));
    const missingFile = await verifyInProcess({ attachments: partialDir });
    assert.equal(status(missingFile.results, "attachments-manifest"), "PASS");
    assert.equal(status(missingFile.results, "attachments-files"), "FAIL");

    const noDir = await verifyInProcess({ attachments: null });
    assert.equal(status(noDir.results, "attachments-files"), "NOT_RUN");
  });

  test("A6-AC02: thiếu tham chiếu key → FAIL; khả dụng key luôn NOT_RUN", async () => {
    const { results } = await verifyInProcess({
      manifest: mutated((m) => {
        m.encryptionKeyReference = null;
      }),
    });
    assert.equal(status(results, "encryption-key-reference"), "FAIL");
    assert.equal(status(results, "encryption-key-availability"), "NOT_RUN");
  });

  test("A6-AC02: tổng tiền lệch 0.01 → FAIL (so chuỗi exact)", async () => {
    const { results } = await verifyInProcess({
      manifest: mutated((m) => {
        const total = m.financeTotals.find((t) => t.key === "contracts.value")!;
        total.sum = "1234567.90";
      }),
    });
    assert.equal(status(results, "finance-totals"), "FAIL");
    assert.match(JSON.stringify(results), /1234567\.90/);
  });

  test("A6-AC02: artifact backup hỏng checksum → FAIL", async () => {
    const corrupt = join(work, "artifacts-corrupt");
    mkdirSync(corrupt);
    const copy = join(corrupt, manifest.artifacts[0].path);
    copyFileSync(dumpPath, copy);
    const bytes = readFileSync(copy);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(copy, bytes);
    const { results } = await verifyInProcess({ artifacts: corrupt });
    assert.equal(status(results, "backup-artifacts"), "FAIL");
  });

  test("A6-AC04: dòng mồ côi FK → FAIL; query đếm thành công không che thiếu dữ liệu", async () => {
    const db = await cloneTarget("orphan");
    await withAdmin(async (admin) => {
      await admin.query("SET session_replication_role = replica"); // tắt FK trigger chỉ trong phiên này
      await admin.query("DELETE FROM work_packages");
    }, db);
    const { results } = await verifyInProcess({ db });
    assert.equal(status(results, "integrity:tasks-package"), "FAIL");
    assert.equal(status(results, "table-digests"), "FAIL");
  });

  test("A6-AC04: membership xuyên org → FAIL", async () => {
    const db = await cloneTarget("crossorg");
    await withAdmin(async (admin) => {
      await admin.query(
        `INSERT INTO user_projects (user_id, project_id)
         SELECT u.id, p.id FROM users u, projects p
         WHERE u.email = $1 AND p.code = 'DA'`,
        [`b-${sfx}@dr.test`],
      );
    }, db);
    const { results } = await verifyInProcess({ db });
    assert.equal(status(results, "integrity:user_projects-cross-org"), "FAIL");
  });

  test("A6-AC04: audit bị sửa → audit-chain FAIL; mất đuôi audit → watermark FAIL", async () => {
    const tampered = await cloneTarget("tamper");
    await withAdmin(async (admin) => {
      await admin.query("SET session_replication_role = replica");
      await admin.query(
        `UPDATE audit_log SET changes = '{"sua":"tay"}'::jsonb WHERE id = (SELECT MIN(id) FROM audit_log)`,
      );
    }, tampered);
    const a = await verifyInProcess({ db: tampered });
    assert.equal(status(a.results, "audit-chain"), "FAIL");

    const truncated = await cloneTarget("tail");
    await withAdmin(async (admin) => {
      await admin.query("SET session_replication_role = replica");
      await admin.query("DELETE FROM audit_log WHERE id = (SELECT MAX(id) FROM audit_log)");
    }, truncated);
    const b = await verifyInProcess({ db: truncated });
    assert.equal(status(b.results, "audit-chain"), "PASS", "chuỗi còn lại vẫn hợp lệ");
    assert.equal(status(b.results, "audit-watermark"), "FAIL");
  });

  test("A6-AC04: role không BYPASSRLS → NOT_RUN, không PASS giả số đếm 0", async () => {
    const { results } = await verifyInProcess({ user: NORLS_ROLE });
    assert.equal(status(results, "audit-role-access"), "NOT_RUN");
    for (const name of ["table-digests", "finance-totals", "integrity:projects-org"]) {
      assert.equal(status(results, name), "NOT_RUN", name);
    }
    assert.equal(summarizeDrChecks(results).completeDrVerified, false);
    assert.equal(summarizeDrChecks(results).fixtureChecksPassed, false);
  });

  test("A6-AC03: thiếu/sai marker hoặc sai DB kỳ vọng → dừng trước mọi truy vấn nghiệp vụ", async () => {
    const unmarked = `${TGT}_nomarker`;
    await withAdmin(async (admin) => {
      await admin.query(`CREATE DATABASE ${unmarked} TEMPLATE ${TGT}`);
      createdDbs.push(unmarked);
    });
    for (const options of [
      { db: unmarked },
      { marker: `xboss-disposable:${"0".repeat(32)}` },
      { expectedDatabase: SRC },
    ]) {
      const { results, commands } = await verifyInProcess(options);
      assert.deepEqual(
        results.map((r) => [r.name, r.status]),
        [["target", "FAIL"]],
      );
      assert.equal(commands.length, 3, JSON.stringify(commands));
      assert.equal(commands[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      assert.match(commands[1], /current_database\(\)/);
      assert.equal(commands[2], "ROLLBACK");
    }
  });

  test("A6-AC03: đích trùng nguồn của manifest bị chặn TRƯỚC khi kết nối", () => {
    // Cổng 1 không có PostgreSQL: nếu verifier cố kết nối sẽ ra lỗi kết nối, không ra JSON.
    const fakeTarget = "postgresql://dr_x:secretpw@127.0.0.1:1/xboss_dr_same";
    const sameManifest = join(work, "same-source.recovery-v1.json");
    writeFileSync(
      sameManifest,
      JSON.stringify({
        ...manifest,
        source: { ...manifest.source, identityHash: identityHash(fakeTarget) },
      }),
    );
    const run = runTsx("scripts/verify-dr-restore.ts", ["--manifest", sameManifest], {
      DR_VERIFY_DATABASE_URL: fakeTarget,
      DR_VERIFY_EXPECTED_DATABASE: "xboss_dr_same",
      DR_VERIFY_EXPECTED_USER: "dr_x",
      DR_VERIFY_EXPECTED_MARKER: MARKER,
    });
    assert.equal(run.status, 1);
    const report = JSON.parse(run.stdout);
    assert.deepEqual(
      report.results.map((r: DrCheck) => [r.name, r.status]),
      [["source-distinct", "FAIL"]],
    );
    assert.ok(!run.stdout.includes("secretpw") && !run.stderr.includes("secretpw"));
  });

  test("A6-AC03: đích trùng DATABASE_URL/MIGRATE_DATABASE_URL bị chặn, không in URI", () => {
    for (const key of ["DATABASE_URL", "MIGRATE_DATABASE_URL"]) {
      const run = runTsx("scripts/verify-dr-restore.ts", ["--manifest", manifestPath], {
        DR_VERIFY_DATABASE_URL: url(TGT, AUDIT_ROLE, AUDIT_PW),
        DR_VERIFY_EXPECTED_DATABASE: TGT,
        DR_VERIFY_EXPECTED_USER: AUDIT_ROLE,
        DR_VERIFY_EXPECTED_MARKER: MARKER,
        [key]: url(TGT, "other", "other"),
      });
      assert.equal(run.status, 1, key);
      assert.equal(run.stdout, "");
      assert.ok(!run.stderr.includes(AUDIT_PW) && !run.stderr.includes("postgres"), run.stderr);
    }
  });

  test("Manifest nghi chứa secret bị từ chối trước khi kết nối, không lặp lại giá trị", () => {
    const leaky = join(work, "leaky.recovery-v1.json");
    writeFileSync(
      leaky,
      JSON.stringify({
        ...manifest,
        postgres: { ...manifest.postgres, tools: { pg_dump: "postgres://u:leakpw@h/db" } },
      }),
    );
    const run = runTsx("scripts/verify-dr-restore.ts", ["--manifest", leaky], {
      DR_VERIFY_DATABASE_URL: "postgresql://dr_x:secretpw@127.0.0.1:1/xboss_dr_same",
      DR_VERIFY_EXPECTED_DATABASE: "xboss_dr_same",
      DR_VERIFY_EXPECTED_USER: "dr_x",
      DR_VERIFY_EXPECTED_MARKER: MARKER,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Manifest bị từ chối: \$\.postgres\.tools\.pg_dump/);
    assert.ok(!run.stderr.includes("leakpw") && !run.stdout.includes("leakpw"));
  });

  test("Manifest cũ của backup.sh: hạng mục thiếu dữ liệu là NOT_RUN, không FAIL cả bộ, không PASS giả", async () => {
    const legacy = parseRecoveryManifest({
      schemaVersion: 1,
      recoverySetId: `20260101T000000Z-${randomUUID()}`,
      status: "COMPLETE",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      artifacts: [{ ...manifest.artifacts[0], status: "PRESENT" }],
    });
    const { results } = await verifyInProcess({ manifest: legacy });
    assert.equal(status(results, "backup-artifacts"), "PASS");
    for (const name of [
      "manifest",
      "migration-checksums",
      "table-digests",
      "finance-totals",
      "audit-watermark",
      "attachments-manifest",
      "encryption-key-reference",
      ...INFRA,
    ]) {
      assert.equal(status(results, name), "NOT_RUN", name);
    }
    assert.ok(!results.some((r) => r.status === "FAIL"), JSON.stringify(results));
    assert.equal(summarizeDrChecks(results).completeDrVerified, false);
  });

  test("A6-AC05/Q-AC08: số đo đạt D08 mới PASS; vượt target → FAIL, không hạ target", async () => {
    const withMeasurements = (rpo: number, rto: number, days: number, missing = 0) =>
      mutated((m) => {
        const end = Date.parse("2026-10-01T00:00:00Z");
        m.baseBackupId = "base-20260901";
        m.wal = {
          timeline: 1,
          startLsn: "0/1000000",
          endLsn: "0/9000000",
          windowStart: new Date(end - days * 86_400_000).toISOString(),
          windowEnd: new Date(end).toISOString(),
          missingSegments: missing,
        };
        m.measurements = {
          measuredAt: "2026-10-01T01:00:00Z",
          workload: "fixture 2 org/2 project",
          sourceResolution: "canary 1s",
          rpoSeconds: rpo,
          rtoSeconds: rto,
          recoveryTargetLsn: "0/8FFFFFF",
          timeline: 1,
        };
      });
    const ok = await verifyInProcess({ manifest: withMeasurements(120, 1800, 35) });
    for (const name of ["wal-coverage", "rpo", "rto"])
      assert.equal(status(ok.results, name), "PASS");
    assert.equal(status(ok.results, "encryption-key-availability"), "NOT_RUN");
    assert.equal(summarizeDrChecks(ok.results).completeDrVerified, false);

    const bad = await verifyInProcess({ manifest: withMeasurements(301, 3601, 34, 1) });
    for (const name of ["wal-coverage", "rpo", "rto"])
      assert.equal(status(bad.results, name), "FAIL");
  });
});
