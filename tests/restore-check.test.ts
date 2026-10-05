import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = join(process.cwd(), "scripts/ops/restore-check.sh");
const marker = "xboss-disposable:0123456789abcdef";

function runRestoreCheck(
  options: { marker?: string; targetUrl?: string; restoreFails?: boolean; targetExists?: boolean } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "xboss-restore-check-"));
  try {
    const bin = join(dir, "bin");
    const backups = join(dir, "backups");
    mkdirSync(bin);
    mkdirSync(backups);
    writeFileSync(join(backups, "xboss-test.dump"), "fixture");
    const log = join(dir, "calls.log");
    const psql = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PSQL_LOG"
sql=""
while (($#)); do if [[ "$1" == "-c" || "$1" == "-tAc" ]]; then shift; sql="$1"; break; fi; shift; done
if [[ "$sql" == *"inet_server_addr()"* ]]; then
  printf '127.0.0.1\\t5432\\trestore_control\\trestore_user\\t%s\\tfalse\\ttrue\\n' "$ACTUAL_MARKER"
elif [[ "$sql" == *"FROM pg_database WHERE datname"* ]]; then printf '${options.targetExists ? "1" : "0"}\\n'
elif [[ "$sql" == *"information_schema.tables"* ]]; then printf '5\\n'
else printf '1\\n'; fi
`;
    const pgRestore = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RESTORE_LOG"
[[ "${options.restoreFails ? "1" : "0"}" != 1 ]]
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
          options.targetUrl ?? "postgresql://restore_user:secret@127.0.0.1:5432/restore_control",
        RESTORE_TARGET_DATABASE: "xboss_restore_check_test",
        RESTORE_TARGET_MARKER: marker,
        ACTUAL_MARKER: options.marker ?? marker,
      },
    });
    return { ...result, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("restore-check rejects a source-equivalent target before database writes", () => {
  const result = runRestoreCheck({
    targetUrl: "postgresql://restore_user:secret@192.0.2.10:5432/restore_control",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /same host\/port/);
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
  assert.match(result.stderr, /database đích đã tồn tại/);
  assert.doesNotMatch(result.calls, /CREATE DATABASE|DROP DATABASE/);
});

test("restore-check only drops a target it created during this invocation", () => {
  const result = runRestoreCheck({ restoreFails: true });
  assert.notEqual(result.status, 0);
  assert.match(result.calls, /CREATE DATABASE xboss_restore_check_test/);
  assert.match(result.calls, /DROP DATABASE xboss_restore_check_test/);
  assert.match(result.stdout, /Tạo database disposable mới/);
});
