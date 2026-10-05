import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = join(process.cwd(), "scripts/ops/backup.sh");

function runBackup(options: { uploads?: boolean; tarFails?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "xboss-backup-manifest-"));
  const bin = join(dir, "bin");
  const backups = join(dir, "backups");
  const uploads = join(dir, "uploads");
  mkdirSync(bin);
  mkdirSync(backups);
  if (options.uploads !== false) mkdirSync(uploads);
  writeFileSync(join(backups, "xboss-old-good.dump"), "previous backup");
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
  try {
    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        BACKUP_DIR: backups,
        UPLOADS_DIR: uploads,
        DATABASE_URL: "postgresql://synthetic:unused@127.0.0.1/example",
        LOCAL_RETENTION_DAYS: "99999",
        REMOTE_RETENTION_DAYS: "99999",
      },
    });
    return { dir, backups, result };
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
  const { dir, backups, result } = runBackup({ uploads: false });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readdirSync(backups).includes("xboss-old-good.dump"));
    const manifestName = readdirSync(backups).find((name) => name.endsWith(".manifest.json"));
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
    assert.match(result.stdout, /Giữ nguyên backup cũ/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup failure does not prune previous artifacts or publish a manifest", () => {
  const { dir, backups, result } = runBackup({ tarFails: true });
  try {
    assert.notEqual(result.status, 0);
    const files = readdirSync(backups);
    assert.ok(files.includes("xboss-old-good.dump"));
    assert.equal(
      files.some((name) => name.endsWith(".manifest.json")),
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
