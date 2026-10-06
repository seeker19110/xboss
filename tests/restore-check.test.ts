import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = join(process.cwd(), "scripts/ops/restore-check.sh");
const marker = "xboss-disposable:0123456789abcdef";

function runRestoreCheck(
  options: {
    marker?: string;
    targetUrl?: string;
    restoreFails?: boolean;
    targetExists?: boolean;
    serverAddr?: string;
    superuser?: boolean;
    canCreateDb?: boolean;
    integrity?:
      "corrupt" | "wrong-size" | "missing-uploads" | "bad-archive" | "partial" | "newer-missing";
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "xboss-restore-check-"));
  try {
    const bin = join(dir, "bin");
    const backups = join(dir, "backups");
    mkdirSync(bin);
    mkdirSync(backups);
    const setId = "20261005T010203Z-123e4567-e89b-12d3-a456-426614174000";
    const dumpName = `xboss-${setId}.dump`;
    const uploadsName = `xboss-uploads-${setId}.tar.gz`;
    const dumpData = "fixture";
    writeFileSync(join(backups, dumpName), dumpData);
    const uploadsFixture = join(dir, "uploads-fixture");
    mkdirSync(uploadsFixture);
    writeFileSync(join(uploadsFixture, "attachment.txt"), "synthetic attachment");
    const archiveResult = spawnSync("tar", [
      "-czf",
      join(backups, uploadsName),
      "-C",
      dir,
      "uploads-fixture",
    ]);
    assert.equal(archiveResult.status, 0, archiveResult.stderr?.toString());
    const uploadsData = readFileSync(join(backups, uploadsName));
    const manifestPath = join(backups, `xboss-${setId}.manifest.json`);
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        recoverySetId: setId,
        status: "COMPLETE",
        startedAt: "2026-10-05T01:02:03.000Z",
        completedAt: "2026-10-05T01:02:04.000Z",
        artifacts: [
          {
            role: "database_dump",
            path: dumpName,
            status: "PRESENT",
            size: Buffer.byteLength(dumpData),
            sha256: createHash("sha256").update(dumpData).digest("hex"),
          },
          {
            role: "uploads_archive",
            path: uploadsName,
            status: "PRESENT",
            size: Buffer.byteLength(uploadsData),
            sha256: createHash("sha256").update(uploadsData).digest("hex"),
          },
        ],
      }),
    );
    if (options.integrity === "corrupt") writeFileSync(join(backups, dumpName), "corrupted");
    if (options.integrity === "wrong-size") {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        artifacts: Array<{ role: string; size: number }>;
      };
      manifest.artifacts.find((artifact) => artifact.role === "database_dump")!.size += 1;
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    if (options.integrity === "missing-uploads") rmSync(join(backups, uploadsName));
    if (options.integrity === "bad-archive") {
      const invalidArchive = Buffer.from("not a gzip or tar archive");
      writeFileSync(join(backups, uploadsName), invalidArchive);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        artifacts: Array<{ role: string; size: number; sha256: string }>;
      };
      const archive = manifest.artifacts.find((artifact) => artifact.role === "uploads_archive")!;
      archive.size = invalidArchive.byteLength;
      archive.sha256 = createHash("sha256").update(invalidArchive).digest("hex");
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    if (options.integrity === "partial") {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        status: string;
      };
      manifest.status = "PARTIAL";
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    if (options.integrity === "newer-missing") {
      const newerSetId = "20300101T000000Z-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const newerManifestPath = join(backups, `xboss-${newerSetId}.manifest.json`);
      writeFileSync(
        newerManifestPath,
        JSON.stringify({
          schemaVersion: 1,
          recoverySetId: newerSetId,
          status: "COMPLETE",
          artifacts: [
            {
              role: "database_dump",
              path: `xboss-${newerSetId}.dump`,
              status: "PRESENT",
              size: 7,
              sha256: createHash("sha256").update("fixture").digest("hex"),
            },
            {
              role: "uploads_archive",
              path: `xboss-uploads-${newerSetId}.tar.gz`,
              status: "PRESENT",
              size: 15,
              sha256: createHash("sha256").update("uploads fixture").digest("hex"),
            },
          ],
        }),
      );
      const future = new Date("2030-01-01T00:00:00Z");
      utimesSync(newerManifestPath, future, future);
    }
    const log = join(dir, "calls.log");
    const psql = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PSQL_LOG"
if [[ -r "\${PGPASSFILE:-}" ]] && [[ "$(stat -c '%a' "$PGPASSFILE")" == 600 ]] && grep -Fq '127.0.0.1:5432:*:restore_user:secret' "$PGPASSFILE" \\
  && [[ -r "\${PGSERVICEFILE:-}" ]] && [[ "$(stat -c '%a' "$PGSERVICEFILE")" == 600 ]] \\
  && grep -Fq "application_name='restore_check'" "$PGSERVICEFILE"; then
  printf 'PASSFILE_OK\\n' >> "$PSQL_LOG"
  printf 'PASSFILE_PATH=%s\\n' "$PGPASSFILE" >> "$PSQL_LOG"
  printf 'SERVICEFILE_PATH=%s\\n' "$PGSERVICEFILE" >> "$PSQL_LOG"
fi
sql=""
while (($#)); do if [[ "$1" == "-c" || "$1" == "-tAc" ]]; then shift; sql="$1"; break; fi; shift; done
if [[ "$sql" == *"inet_server_addr()"* ]]; then
  printf '%s\\t5432\\trestore_control\\trestore_user\\t%s\\t%s\\t%s\\n' \\
    "$ACTUAL_SERVER_ADDR" "$ACTUAL_MARKER" "$ACTUAL_SUPERUSER" "$ACTUAL_CREATEDB"
elif [[ "$sql" == *"FROM pg_database WHERE datname"* ]]; then printf '${options.targetExists ? "1" : "0"}\\n'
elif [[ "$sql" == *"information_schema.tables"* ]]; then printf '5\\n'
else printf '1\\n'; fi
`;
    const pgRestore = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RESTORE_LOG"
if [[ -r "\${PGPASSFILE:-}" ]] && [[ "$(stat -c '%a' "$PGPASSFILE")" == 600 ]] && grep -Fq '127.0.0.1:5432:*:restore_user:secret' "$PGPASSFILE" \\
  && [[ -r "\${PGSERVICEFILE:-}" ]] && [[ "$(stat -c '%a' "$PGSERVICEFILE")" == 600 ]] \\
  && grep -Fq "application_name='restore_check'" "$PGSERVICEFILE"; then
  printf 'PASSFILE_OK\\n' >> "$RESTORE_LOG"
  printf 'PASSFILE_PATH=%s\\n' "$PGPASSFILE" >> "$RESTORE_LOG"
  printf 'SERVICEFILE_PATH=%s\\n' "$PGSERVICEFILE" >> "$RESTORE_LOG"
fi
if [[ "${options.restoreFails ? "1" : "0"}" == 1 ]]; then
  printf 'diagnostic password=secret\\n' >&2
  exit 1
fi
exit 0
`;
    writeFileSync(join(bin, "psql"), psql);
    writeFileSync(join(bin, "pg_restore"), pgRestore);
    chmodSync(join(bin, "psql"), 0o755);
    chmodSync(join(bin, "pg_restore"), 0o755);

    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        BACKUP_DIR: backups,
        PSQL_LOG: log,
        RESTORE_LOG: join(dir, "restore.log"),
        RESTORE_SOURCE_URL: "postgresql://app_source:secret@192.0.2.10:5432/source_db",
        RESTORE_TARGET_URL:
          options.targetUrl ??
          "postgresql://restore_user:secret@127.0.0.1:5432/restore_control?application_name=restore_check",
        RESTORE_TARGET_DATABASE: "xboss_restore_check_test",
        RESTORE_TARGET_MARKER: marker,
        ACTUAL_MARKER: options.marker ?? marker,
        ACTUAL_SERVER_ADDR: options.serverAddr ?? "127.0.0.1",
        ACTUAL_SUPERUSER: options.superuser ? "true" : "false",
        ACTUAL_CREATEDB: options.canCreateDb === false ? "false" : "true",
      },
    });
    return {
      ...result,
      calls: [log, join(dir, "restore.log")]
        .filter(existsSync)
        .map((path) => readFileSync(path, "utf8"))
        .join("\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("restore-check rejects a source-equivalent target before database writes", () => {
  const result = runRestoreCheck({
    targetUrl: "postgresql://restore_user:secret@192.0.2.10:5432/restore_control",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cùng host\/port/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check treats IPv4-mapped IPv6 as the same source server", () => {
  const result = runRestoreCheck({
    targetUrl: "postgresql://restore_user:secret@[::ffff:192.0.2.10]:5432/restore_control",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cùng host\/port/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check compares decoded PostgreSQL usernames", () => {
  const result = runRestoreCheck({
    targetUrl: "postgresql://%61pp_source:secret@127.0.0.1:5432/restore_control",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Credentials đích phải khác user/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check accepts a percent-encoded control database identity after server validation", () => {
  const result = runRestoreCheck({
    targetUrl: "postgresql://restore%5Fuser:secret@127.0.0.1:5432/restore%5Fcontrol",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /CREATE DATABASE xboss_restore_check_test/);
  assert.match(result.calls, /DROP DATABASE xboss_restore_check_test/);
});

test("restore-check rejects public target addresses before database writes", () => {
  const result = runRestoreCheck({
    targetUrl: "postgresql://restore_user:secret@8.8.8.8:5432/restore_control",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /IP private\/loopback/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check requires the actual disposable marker before database writes", () => {
  const result = runRestoreCheck({ marker: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /không có marker disposable/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check refuses an existing database without trying to drop it", () => {
  const result = runRestoreCheck({ targetExists: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Database đích đã tồn tại/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check rejects an unexpected server identity before database writes", () => {
  const result = runRestoreCheck({ serverAddr: "127.0.0.2" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Danh tính server\/user thực tế không khớp/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check rejects superuser credentials before database writes", () => {
  const result = runRestoreCheck({ superuser: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /không được là PostgreSQL superuser/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check rejects a role without CREATEDB before database writes", () => {
  const result = runRestoreCheck({ canCreateDb: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /phải có quyền CREATEDB/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check only drops a target it created during this invocation", () => {
  const result = runRestoreCheck({ restoreFails: true });
  assert.notEqual(result.status, 0);
  assert.match(result.calls, /CREATE DATABASE xboss_restore_check_test/);
  assert.match(result.calls, /DROP DATABASE xboss_restore_check_test/);
  assert.match(result.calls, /PASSFILE_OK/);
  assert.doesNotMatch(result.calls, /secret|postgresql:\/\//);
  assert.doesNotMatch(result.stdout + result.stderr, /secret|postgresql:\/\//);
  assert.match(result.stderr, /pg_restore thất bại/);
  assert.match(result.stdout, /Tạo database disposable mới/);
  const passfilePath = result.calls.match(/PASSFILE_PATH=([^\n]+)/)?.[1];
  assert.ok(passfilePath);
  assert.equal(existsSync(passfilePath), false, "temporary passfile is removed on exit");
  const servicefilePath = result.calls.match(/SERVICEFILE_PATH=([^\n]+)/)?.[1];
  assert.ok(servicefilePath);
  assert.equal(existsSync(servicefilePath), false, "temporary service file is removed on exit");
});

test("restore-check rejects a checksum mismatch before connecting or writing", () => {
  const result = runRestoreCheck({ integrity: "corrupt" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Manifest recovery set mới nhất/);
  assert.equal(result.calls, "");
});

test("restore-check rejects an artifact size mismatch before connecting or writing", () => {
  const result = runRestoreCheck({ integrity: "wrong-size" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Manifest recovery set mới nhất/);
  assert.equal(result.calls, "");
});

test("restore-check rejects a corrupt uploads archive before connecting or writing", () => {
  const result = runRestoreCheck({ integrity: "bad-archive" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Archive uploads .*không đọc được/);
  assert.equal(result.calls, "");
});

test("restore-check rejects a missing attachment archive before connecting or writing", () => {
  const result = runRestoreCheck({ integrity: "missing-uploads" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Manifest recovery set mới nhất/);
  assert.equal(result.calls, "");
});

test("restore-check rejects a PARTIAL recovery set before connecting or writing", () => {
  const result = runRestoreCheck({ integrity: "partial" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Manifest recovery set mới nhất/);
  assert.equal(result.calls, "");
});

test("restore-check fails closed when the newest manifest has no local artifact set", () => {
  const result = runRestoreCheck({ integrity: "newer-missing" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact local thiếu/);
  assert.equal(result.calls, "");
});
