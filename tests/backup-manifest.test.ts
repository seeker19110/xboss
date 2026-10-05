import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = join(process.cwd(), "scripts/ops/backup.sh");

function runBackup(
  options: {
    uploads?: boolean;
    tarFails?: boolean;
    oldComplete?: boolean;
    retentionDays?: string;
    remote?: boolean;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "xboss-backup-manifest-"));
  const bin = join(dir, "bin");
  const backups = join(dir, "backups");
  const uploads = join(dir, "uploads");
  mkdirSync(bin);
  mkdirSync(backups);
  if (options.uploads !== false) mkdirSync(uploads);
  if (options.oldComplete) {
    const setId = "20200101T000000Z-123e4567-e89b-12d3-a456-426614174000";
    const dumpName = `xboss-${setId}.dump`;
    const uploadsName = `xboss-uploads-${setId}.tar.gz`;
    const dumpData = "old database";
    const uploadsData = "old uploads";
    writeFileSync(join(backups, dumpName), dumpData);
    writeFileSync(join(backups, uploadsName), uploadsData);
    writeFileSync(
      join(backups, `xboss-${setId}.manifest.json`),
      JSON.stringify({
        schemaVersion: 1,
        recoverySetId: setId,
        status: "COMPLETE",
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
    for (const name of [dumpName, uploadsName, `xboss-${setId}.manifest.json`]) {
      const old = new Date("2020-01-01T00:00:00Z");
      utimesSync(join(backups, name), old, old);
    }
    writeFileSync(join(backups, "xboss-orphan.dump.partial"), "stale partial");
    const old = new Date("2020-01-01T00:00:00Z");
    utimesSync(join(backups, "xboss-orphan.dump.partial"), old, old);
  } else {
    writeFileSync(join(backups, "xboss-old-good.dump"), "previous backup");
  }
  writeFileSync(
    join(bin, "pg_dump"),
    "#!/usr/bin/env bash\nwhile (($#)); do if [[ $1 == -f ]]; then shift; printf 'database dump' > \"$1\"; exit 0; fi; shift; done\nexit 2\n",
  );
  writeFileSync(
    join(bin, "tar"),
    options.tarFails
      ? "#!/usr/bin/env bash\nexit 1\n"
      : "#!/usr/bin/env bash\nprintf 'uploads archive' > \"$2\"\n",
  );
  chmodSync(join(bin, "pg_dump"), 0o755);
  chmodSync(join(bin, "tar"), 0o755);
  const remoteLog = join(dir, "rclone.log");
  if (options.remote) {
    writeFileSync(
      join(bin, "rclone"),
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$*" >> "$RCLONE_LOG"\n',
    );
    chmodSync(join(bin, "rclone"), 0o755);
  }
  try {
    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        BACKUP_DIR: backups,
        UPLOADS_DIR: uploads,
        DATABASE_URL: "postgresql://synthetic:unused@127.0.0.1/example",
        LOCAL_RETENTION_DAYS: options.retentionDays ?? "99999",
        REMOTE_RETENTION_DAYS: options.remote ? (options.retentionDays ?? "99999") : "99999",
        ...(options.remote ? { BACKUP_REMOTE: "archive:xboss", RCLONE_LOG: remoteLog } : {}),
      },
    });
    return { dir, backups, remoteLog, result };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

test("backup finalizes a complete, checksummed manifest after both artifacts", () => {
  const { dir, backups, result } = runBackup();
  try {
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(backups);
    const manifestName = files.find((name) => name.endsWith(".manifest.json"));
    assert.ok(manifestName);
    const manifest = JSON.parse(readFileSync(join(backups, manifestName), "utf8")) as {
      recoverySetId: string;
      status: string;
      artifacts: Array<{ role: string; path: string; size: number; sha256: string }>;
    };
    assert.equal(manifest.status, "COMPLETE");
    assert.ok(manifest.recoverySetId);
    assert.deepEqual(manifest.artifacts.map(({ role }) => role).sort(), [
      "database_dump",
      "uploads_archive",
    ]);
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(join(backups, artifact.path));
      assert.equal(bytes.byteLength, artifact.size);
      assert.equal(artifact.sha256, createHash("sha256").update(bytes).digest("hex"));
    }
    assert.equal(
      files.some((name) => name.endsWith(".partial")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup marks a missing uploads archive PARTIAL and preserves older backup", () => {
  const { dir, backups, result } = runBackup({
    uploads: false,
    oldComplete: true,
    retentionDays: "1",
    remote: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.ok(
      readdirSync(backups).includes(
        "xboss-20200101T000000Z-123e4567-e89b-12d3-a456-426614174000.dump",
      ),
    );
    const manifestName = readdirSync(backups).find(
      (name) => name.endsWith(".manifest.json") && !name.includes("20200101T000000Z"),
    );
    assert.ok(manifestName);
    const manifest = JSON.parse(readFileSync(join(backups, manifestName), "utf8")) as {
      status: string;
      artifacts: Array<{ role: string; status: string }>;
    };
    assert.equal(manifest.status, "PARTIAL");
    assert.equal(
      manifest.artifacts.find((artifact) => artifact.role === "uploads_archive")?.status,
      "MISSING",
    );
    assert.match(result.stderr, /là PARTIAL; không upload và giữ set COMPLETE local gần nhất/);
    assert.equal(
      existsSync(join(dir, "rclone.log")),
      false,
      "PARTIAL recovery set is never uploaded",
    );
    assert.equal(
      readdirSync(backups).some((name) => name.endsWith(".partial")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup failure does not prune previous artifacts or publish a manifest", () => {
  const { dir, backups, result } = runBackup({
    tarFails: true,
    oldComplete: true,
    retentionDays: "1",
  });
  try {
    assert.notEqual(result.status, 0);
    const files = readdirSync(backups);
    assert.ok(files.includes("xboss-20200101T000000Z-123e4567-e89b-12d3-a456-426614174000.dump"));
    assert.equal(
      files.filter((name) => name.endsWith(".dump")).length,
      1,
      "failed set dump is removed",
    );
    assert.equal(
      files.some((name) => name.endsWith(".manifest.json") && !name.includes("20200101T000000Z")),
      false,
    );
    assert.equal(
      files.some((name) => name.endsWith(".partial")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("successful backup prunes an expired set as a unit and removes stale partials", () => {
  const { dir, backups, result } = runBackup({ oldComplete: true, retentionDays: "1" });
  try {
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(backups);
    assert.ok(
      files.some(
        (name) =>
          name === "xboss-20200101T000000Z-123e4567-e89b-12d3-a456-426614174000.manifest.json",
      ),
    );
    assert.equal(
      files.some(
        (name) => name === "xboss-20200101T000000Z-123e4567-e89b-12d3-a456-426614174000.dump",
      ),
      false,
    );
    assert.equal(
      files.some(
        (name) =>
          name === "xboss-uploads-20200101T000000Z-123e4567-e89b-12d3-a456-426614174000.tar.gz",
      ),
      false,
    );
    assert.equal(files.filter((name) => name.endsWith(".manifest.json")).length, 2);
    assert.equal(files.filter((name) => name.endsWith(".dump")).length, 1);
    assert.equal(files.filter((name) => name.endsWith(".tar.gz")).length, 1);
    assert.equal(
      files.some((name) => name.endsWith(".partial")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("remote retention removes an expired set by exact ID and keeps the newest set", () => {
  const { dir, remoteLog, result } = runBackup({
    oldComplete: true,
    retentionDays: "1",
    remote: true,
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(remoteLog, "utf8");
    assert.match(
      calls,
      /deletefile archive:xboss\/xboss-20200101T000000Z-123e4567-e89b-12d3-a456-426614174000\.dump/,
    );
    assert.doesNotMatch(calls, /deletefile archive:xboss\/xboss-2026/);
    assert.doesNotMatch(calls, /--min-age/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
