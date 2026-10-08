// Sinh recovery manifest v1 từ DB NGUỒN (S14, A6-FR01). Chạy tay bởi operator:
//   npx tsx scripts/lib/recovery-manifest-cli.ts --out backups/xboss-<id>.recovery-v1.json \
//     --pg-dump backups/xboss-<id>.snapshot.dump --attachments-dir data/uploads \
//     --key-provider <kho> --key-id <tham-chieu> [--key-version v] [--base-backup-id id] [--app-sha sha]
//     [--wal-archive-dir <kho WAL> --base-backups-dir <kho base backup> [--wal-segment-mb 16]]
// Có 2 cờ kho PITR: khối `wal` + `baseBackupId` được ĐO từ archive thật (pitr-archive.ts) thay vì
// để null; base backup chỉ định phải còn chuỗi WAL liên tục tới cuối archive.
// Secret chỉ qua env (không qua CLI):
//   DR_SOURCE_DATABASE_URL, DR_SOURCE_EXPECTED_DATABASE, DR_SOURCE_EXPECTED_USER
// Role nguồn: chỉ đọc, BYPASSRLS + pg_read_all_data (không phải role app NOBYPASSRLS).
//
// Không tạo lịch/cron, không đẩy remote, không xoá gì. Tên tệp manifest KHÔNG được kết thúc
// bằng `.manifest.json` (đó là định dạng cũ của backup.sh mà restore-check.sh đọc).
import { createHash, randomUUID } from "node:crypto";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { identityHash } from "./dr-readonly";
import { directoryHasher, readRepoMigrations } from "./dr-files";
import { ManifestBuildError, buildRecoveryManifest } from "./recovery-manifest-build";
import { ManifestError, type ArtifactFact, type WalCoverage } from "./recovery-manifest";
import { analyzePitr, walCoverageFromAnalysis } from "./pitr-archive";
import { readBaseBackups, scanArchiveDir } from "./pitr-io";

// Lỗi do chính CLI ném — thông điệp tự viết, an toàn để in. Lỗi khác (pg/hệ thống) có thể
// chứa host/user nên chỉ in thông báo chung.
class CliError extends Error {}

const FLAGS = [
  "--out",
  "--pg-dump",
  "--attachments-dir",
  "--recovery-set-id",
  "--app-sha",
  "--base-backup-id",
  "--key-provider",
  "--key-id",
  "--key-version",
  "--wal-archive-dir",
  "--base-backups-dir",
  "--wal-segment-mb",
] as const;
type Flag = (typeof FLAGS)[number];

function parseArgs(argv: string[]): Partial<Record<Flag, string>> {
  const args: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i] as Flag;
    const value = argv[i + 1];
    if (!FLAGS.includes(flag) || !value || value.startsWith("--") || args[flag]) {
      throw new CliError(
        `Cờ không hợp lệ. Chỉ nhận: ${FLAGS.join(", ")} (mỗi cờ 1 lần, có giá trị).`,
      );
    }
    args[flag] = value;
  }
  if (!args["--out"]) throw new CliError("Thiếu --out <tệp manifest>.");
  if (args["--out"].endsWith(".manifest.json")) {
    throw new CliError("Không đặt tên *.manifest.json (trùng định dạng cũ restore-check.sh đọc).");
  }
  return args;
}

function defaultSetId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `${stamp}-${randomUUID()}`;
}

// Truyền thông tin kết nối cho pg_dump qua biến môi trường PG*, không qua argv (ps/log).
function pgEnv(raw: string): NodeJS.ProcessEnv {
  const url = new URL(raw);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
  env.PGHOST = url.hostname;
  env.PGPORT = url.port || "5432";
  env.PGUSER = decodeURIComponent(url.username);
  env.PGPASSWORD = decodeURIComponent(url.password);
  env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

async function dumpArtifact(path: string): Promise<ArtifactFact> {
  const digest = await directoryHasher(dirname(path))(basename(path));
  if (!digest) throw new CliError("Không thấy tệp dump vừa tạo.");
  return { role: "database_dump", path: basename(path), ...digest };
}

/** Đo phủ WAL + chọn base backup từ kho PITR thật; thiếu cửa sổ đo được → dừng, không ghi null. */
function pitrCoverage(args: Partial<Record<Flag, string>>): {
  wal: WalCoverage | null;
  baseBackupId: string | null;
} {
  const archiveDir = args["--wal-archive-dir"];
  const basesDir = args["--base-backups-dir"];
  if (!archiveDir !== !basesDir) {
    throw new CliError("--wal-archive-dir và --base-backups-dir phải đi cùng nhau.");
  }
  if (!archiveDir || !basesDir)
    return { wal: null, baseBackupId: args["--base-backup-id"] ?? null };
  const mb = args["--wal-segment-mb"] ?? "16";
  if (!/^\d{1,4}$/.test(mb)) throw new CliError("--wal-segment-mb phải là số nguyên.");
  let analysis;
  try {
    analysis = analyzePitr(
      scanArchiveDir(archiveDir, Number(mb) * 1024 * 1024),
      readBaseBackups(basesDir),
    );
  } catch {
    throw new CliError("Không đọc được kho WAL/base backup.");
  }
  const usable = analysis.bases.filter((base) => base.usable);
  const chosen = args["--base-backup-id"]
    ? usable.find((base) => base.id === args["--base-backup-id"])
    : usable.sort((a, b) => b.startSeg! - a.startSeg!)[0];
  if (!chosen) {
    throw new CliError("Không có base backup (đúng id) còn chuỗi WAL liên tục tới cuối archive.");
  }
  const wal = walCoverageFromAnalysis(analysis);
  if (!wal) throw new CliError("Không đo được cửa sổ WAL (thiếu tệp .backup có STOP TIME?).");
  return { wal, baseBackupId: chosen.id };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DR_SOURCE_DATABASE_URL;
  const expectedDatabase = process.env.DR_SOURCE_EXPECTED_DATABASE?.trim();
  const expectedUser = process.env.DR_SOURCE_EXPECTED_USER?.trim();
  if (!url || !expectedDatabase || !expectedUser) {
    throw new CliError(
      "Cần DR_SOURCE_DATABASE_URL, DR_SOURCE_EXPECTED_DATABASE, DR_SOURCE_EXPECTED_USER.",
    );
  }
  const recoverySetId = args["--recovery-set-id"] ?? defaultSetId();
  const keyProvider = args["--key-provider"];
  const keyId = args["--key-id"];
  if (!keyProvider !== !keyId) throw new CliError("--key-provider và --key-id phải đi cùng nhau.");

  const pitr = pitrCoverage(args);
  const dumpPath = args["--pg-dump"];
  const partial = dumpPath ? `${dumpPath}.partial` : null;
  // Không ghi đè dump/manifest đã có; chỉ dọn dump do chính lần chạy lỗi này tạo ra.
  if ((dumpPath && existsSync(dumpPath)) || existsSync(args["--out"]!)) {
    throw new CliError("Tệp dump hoặc manifest đích đã tồn tại; không ghi đè.");
  }

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=1800000 -c timezone=Asia/Ho_Chi_Minh",
  });
  await client.connect();
  let dumpCreated = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const who = await client.query(
      `SELECT current_database() AS db, current_user AS usr,
              current_setting('transaction_read_only') AS readonly`,
    );
    const row = who.rows[0];
    if (row?.db !== expectedDatabase || row?.usr !== expectedUser || row?.readonly !== "on") {
      throw new CliError("Nguồn không khớp DB/role kỳ vọng hoặc không ở chế độ chỉ-đọc.");
    }
    await client.query("SET LOCAL row_security = off");

    const tools: Record<string, string> = { node: process.version };
    const artifacts: ArtifactFact[] = [];
    if (dumpPath && partial) {
      const snap = await client.query("SELECT pg_export_snapshot() AS id");
      const snapshotId = String(snap.rows[0]?.id ?? "");
      if (!/^[0-9A-F-]+$/i.test(snapshotId)) throw new CliError("Không export được snapshot.");
      const version = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
      if (version.status !== 0) throw new CliError("Không chạy được pg_dump.");
      tools.pg_dump = version.stdout.trim();
      const dump = spawnSync(
        "pg_dump",
        ["-Fc", "--no-password", `--snapshot=${snapshotId}`, "-f", partial],
        { env: pgEnv(url), encoding: "utf8" },
      );
      // Không in stderr của pg_dump (có thể chứa host/user); chỉ báo thất bại chung.
      if (dump.status !== 0) throw new CliError("pg_dump theo snapshot thất bại.");
      renameSync(partial, dumpPath);
      dumpCreated = true;
      artifacts.push(await dumpArtifact(dumpPath));
    }

    const manifest = await buildRecoveryManifest(client, {
      recoverySetId,
      startedAt,
      sourceIdentityHash: identityHash(url),
      appSha: args["--app-sha"] ?? null,
      baseBackupId: pitr.baseBackupId,
      wal: pitr.wal,
      repoMigrations: readRepoMigrations(),
      attachments: args["--attachments-dir"] ? directoryHasher(args["--attachments-dir"]) : null,
      artifacts,
      encryptionKeyReference:
        keyProvider && keyId
          ? { provider: keyProvider, keyId, keyVersion: args["--key-version"] ?? null }
          : null,
      tools,
    });
    await client.query("ROLLBACK");
    // "wx": không ghi đè manifest đã phát hành; 0600: chỉ người có quyền dữ liệu đọc được.
    writeFileSync(args["--out"]!, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    const digest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    console.log(
      JSON.stringify({
        kind: "recovery-manifest",
        recoverySetId,
        out: basename(args["--out"]!),
        tables: manifest.tables.length,
        attachments: manifest.attachments.length,
        artifacts: manifest.artifacts.length,
        encryptionKeyReference: manifest.encryptionKeyReference ? "có" : "THIẾU",
        manifestSha256: digest,
      }),
    );
  } catch (error) {
    if (partial) rmSync(partial, { force: true });
    if (dumpCreated && dumpPath) rmSync(dumpPath, { force: true });
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const detail =
    error instanceof ManifestError
      ? error.issues.slice(0, 10).join("; ")
      : error instanceof CliError || error instanceof ManifestBuildError
        ? error.message
        : "lỗi kết nối/truy vấn/tệp (chi tiết không in để tránh lộ cấu hình)";
  console.error(`Sinh recovery manifest thất bại: ${detail}`);
  process.exitCode = 1;
});
