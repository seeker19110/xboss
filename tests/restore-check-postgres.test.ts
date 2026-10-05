import { HAS_TEST_DB } from "./setup"; // phải đứng đầu để chỉ dùng PostgreSQL disposable của test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { isIP } from "node:net";
import { Client } from "pg";

const restoreScript = join(process.cwd(), "scripts/ops/restore-check.sh");
const disposableMarker = `xboss-disposable:${randomUUID().replaceAll("-", "")}`;
const backupId = () => {
  const now = new Date();
  const timestamp =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}T` +
    `${String(now.getUTCHours()).padStart(2, "0")}` +
    `${String(now.getUTCMinutes()).padStart(2, "0")}` +
    `${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  return `${timestamp}-${randomUUID()}`;
};

function runTool(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  assert.equal(
    result.error,
    undefined,
    `Không chạy được ${command}; cần PostgreSQL client và tar trên runner CI.`,
  );
  return result;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotePassfile(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

async function createRestoreFixture(options: { wrongMarker?: boolean; sameServer?: boolean } = {}) {
  const rawUrl = process.env.TEST_DATABASE_URL;
  assert.ok(rawUrl, "TEST_DATABASE_URL phải trỏ PostgreSQL disposable của CI.");
  const adminUrl = new URL(rawUrl);
  assert.ok(
    adminUrl.hostname === "localhost" || adminUrl.hostname === "127.0.0.1",
    "Smoke test chỉ chấp nhận PostgreSQL CI qua localhost/127.0.0.1.",
  );
  const controlDatabase = decodeURIComponent(adminUrl.pathname.slice(1));
  assert.match(controlDatabase, /^[a-z][a-z0-9_]{2,62}$/);
  const adminUser = decodeURIComponent(adminUrl.username);
  const adminPassword = decodeURIComponent(adminUrl.password);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const role = `restore_smoke_${suffix}`;
  const password = randomUUID().replaceAll("-", "");
  const targetDatabase = `xboss_restore_smoke_${suffix}`;
  const sourceDatabase = `xboss_source_smoke_${suffix}`;
  const actualMarker = `${disposableMarker}_${suffix}`;
  const tempDir = mkdtempSync(join(tmpdir(), "xboss-restore-postgres-"));
  const backups = join(tempDir, "backups");
  mkdirSync(backups);

  const admin = new Client({ connectionString: rawUrl });
  try {
    await admin.connect();
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
  let previousComment: string | null = null;
  let commentChanged = false;
  let roleCreated = false;
  let sourceCreated = false;
  try {
    const major = await admin.query("SHOW server_version_num");
    assert.equal(
      String(major.rows[0]?.server_version_num).slice(0, 2),
      "16",
      "Restore smoke test dùng service PostgreSQL 16 trong CI.",
    );
    const endpoint = await admin.query(
      "SELECT inet_server_addr()::text AS host, inet_server_port()::text AS port",
    );
    const targetHost = String(endpoint.rows[0]?.host ?? "");
    const port = String(endpoint.rows[0]?.port ?? "");
    assert.ok(isIP(targetHost), "Smoke test cần địa chỉ IP của PostgreSQL disposable CI.");
    assert.match(port, /^\d+$/);
    for (const command of ["psql", "pg_dump", "pg_restore", "tar"]) {
      const result = runTool(command, ["--version"]);
      assert.equal(result.status, 0, `${command} --version thất bại: ${result.stderr}`);
      if (command !== "tar") {
        assert.match(result.stdout, /\b16\.\d+\b/, `${command} phải là PostgreSQL client 16`);
      }
    }

    const currentComment = await admin.query(
      "SELECT shobj_description(oid, 'pg_database') AS comment FROM pg_database WHERE datname = current_database()",
    );
    previousComment = currentComment.rows[0]?.comment ?? null;
    await admin.query(`COMMENT ON DATABASE "${controlDatabase}" IS ${quoteLiteral(actualMarker)}`);
    commentChanged = true;
    await admin.query(`CREATE ROLE ${role} LOGIN CREATEDB PASSWORD ${quoteLiteral(password)}`);
    roleCreated = true;

    await admin.query(`CREATE DATABASE "${sourceDatabase}"`);
    sourceCreated = true;
    const sourceUrl = new URL(rawUrl);
    sourceUrl.pathname = `/${sourceDatabase}`;
    const source = new Client({ connectionString: sourceUrl.toString() });
    await source.connect();
    try {
      for (const table of ["tasks", "contracts", "payment_certs", "materials", "users"]) {
        await source.query(`CREATE TABLE ${table} (id integer PRIMARY KEY)`);
        await source.query(`INSERT INTO ${table} (id) VALUES (1)`);
      }
    } finally {
      await source.end();
    }

    const passfile = join(tempDir, "pgpass");
    writeFileSync(
      passfile,
      `${quotePassfile(targetHost)}:${quotePassfile(port)}:*:${quotePassfile(adminUser)}:${quotePassfile(adminPassword)}\n`,
      { mode: 0o600 },
    );
    chmodSync(passfile, 0o600);

    const setId = backupId();
    const dumpName = `xboss-${setId}.dump`;
    const uploadsName = `xboss-uploads-${setId}.tar.gz`;
    const dumpPath = join(backups, dumpName);
    const uploadsPath = join(backups, uploadsName);
    const dump = runTool(
      "pg_dump",
      ["-Fc", "-h", targetHost, "-p", port, "-U", adminUser, "-d", sourceDatabase, "-f", dumpPath],
      { ...process.env, PGPASSFILE: passfile },
    );
    assert.equal(dump.status, 0, `pg_dump fixture thất bại: ${dump.stderr}`);

    const uploads = join(tempDir, "uploads");
    mkdirSync(uploads);
    writeFileSync(join(uploads, "attachment.txt"), "fixture tổng hợp");
    const tar = runTool("tar", ["-czf", uploadsPath, "-C", tempDir, "uploads"]);
    assert.equal(tar.status, 0, `Tạo uploads fixture thất bại: ${tar.stderr}`);

    const artifacts = [
      { role: "database_dump", path: dumpName, file: dumpPath },
      { role: "uploads_archive", path: uploadsName, file: uploadsPath },
    ].map(({ role: artifactRole, path, file }) => {
      const bytes = readFileSync(file);
      return {
        role: artifactRole,
        path,
        status: "PRESENT",
        size: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
    writeFileSync(
      join(backups, `xboss-${setId}.manifest.json`),
      JSON.stringify({
        schemaVersion: 1,
        recoverySetId: setId,
        status: "COMPLETE",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        artifacts,
      }),
    );

    const sourceIdentityHost = options.sameServer ? targetHost : "192.0.2.10";
    const sourceHostUrl =
      isIP(sourceIdentityHost) === 6 ? `[${sourceIdentityHost}]` : sourceIdentityHost;
    const targetHostUrl = isIP(targetHost) === 6 ? `[${targetHost}]` : targetHost;
    const sourceIdentity = `postgresql://synthetic_source:unused@${sourceHostUrl}:${port}/source_fixture`;
    const expectedMarker = options.wrongMarker ? `${actualMarker}_wrong` : actualMarker;
    const targetUrl = `postgresql://${role}:${password}@${targetHostUrl}:${port}/${controlDatabase}`;
    const targetBeforeRestore = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      targetDatabase,
    ]);
    assert.equal(
      targetBeforeRestore.rowCount,
      0,
      "tên DB random của test không được tồn tại trước restore",
    );
    const result = runTool("bash", [restoreScript], {
      ...process.env,
      BACKUP_DIR: backups,
      RESTORE_SOURCE_URL: sourceIdentity,
      RESTORE_TARGET_URL: targetUrl,
      RESTORE_TARGET_DATABASE: targetDatabase,
      RESTORE_TARGET_MARKER: expectedMarker,
    });
    return {
      admin,
      result,
      targetDatabase,
      targetCreated: async () => {
        const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
          targetDatabase,
        ]);
        return exists.rowCount === 1;
      },
      cleanup: async () => {
        try {
          await admin.query(`DROP DATABASE IF EXISTS "${targetDatabase}"`);
          if (sourceCreated) await admin.query(`DROP DATABASE IF EXISTS "${sourceDatabase}"`);
          if (roleCreated) await admin.query(`DROP ROLE IF EXISTS ${role}`);
          if (commentChanged) {
            await admin.query(
              `COMMENT ON DATABASE "${controlDatabase}" IS ${previousComment === null ? "NULL" : quoteLiteral(previousComment)}`,
            );
          }
        } finally {
          await admin.end();
          rmSync(tempDir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try {
      if (sourceCreated) await admin.query(`DROP DATABASE IF EXISTS "${sourceDatabase}"`);
      if (roleCreated) await admin.query(`DROP ROLE IF EXISTS ${role}`);
      if (commentChanged) {
        await admin.query(
          `COMMENT ON DATABASE "${controlDatabase}" IS ${previousComment === null ? "NULL" : quoteLiteral(previousComment)}`,
        );
      }
    } finally {
      await admin.end();
      rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

test(
  "restore-check phục hồi dump PostgreSQL 16 vào DB disposable rồi cleanup DB do nó tạo",
  { skip: !HAS_TEST_DB },
  async () => {
    const fixture = await createRestoreFixture();
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr);
      assert.match(fixture.result.stdout, /Restore smoke check đạt/);
      assert.match(fixture.result.stdout, /tasks: 1 dòng/);
      assert.equal(
        await fixture.targetCreated(),
        false,
        "script phải DROP DB disposable do chính nó tạo",
      );
      assert.doesNotMatch(fixture.result.stdout + fixture.result.stderr, /postgresql:\/\/|unused/);
    } finally {
      await fixture.cleanup();
    }
  },
);

test("restore-check chặn marker sai trước khi tạo DB đích", { skip: !HAS_TEST_DB }, async () => {
  const fixture = await createRestoreFixture({ wrongMarker: true });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(fixture.result.stderr, /không có marker disposable/);
    assert.doesNotMatch(fixture.result.stdout, /Tạo database disposable mới|pg_restore vào/);
    assert.equal(await fixture.targetCreated(), false, "marker sai không được tạo DB đích");
    assert.doesNotMatch(fixture.result.stdout + fixture.result.stderr, /postgresql:\/\/|unused/);
  } finally {
    await fixture.cleanup();
  }
});

test(
  "restore-check chặn identity nguồn trùng server trước khi tạo DB đích",
  { skip: !HAS_TEST_DB },
  async () => {
    const fixture = await createRestoreFixture({ sameServer: true });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(fixture.result.stderr, /cùng host\/port/);
      assert.doesNotMatch(fixture.result.stdout, /Tạo database disposable mới|pg_restore vào/);
      assert.equal(await fixture.targetCreated(), false, "identity trùng không được tạo DB đích");
      assert.doesNotMatch(fixture.result.stdout + fixture.result.stderr, /postgresql:\/\/|unused/);
    } finally {
      await fixture.cleanup();
    }
  },
);
