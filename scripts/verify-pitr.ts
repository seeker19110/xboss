// Verifier PITR (A6-FR02/FR04/FR06/FR08, QUALITY-FINAL-1/S14). Chạy tay bởi người vận hành:
//
//   npx tsx scripts/verify-pitr.ts --archive-dir <kho WAL> --base-backups-dir <kho base backup> \
//     [--target latest|<ISO 8601>] [--drill-dir <thư mục disposable> --drill-database xboss \
//      --drill-user <role>] [--incident-at <ISO>] [--recovery-manifest <tệp .recovery-v1.json>] \
//     [--evidence-out <tệp mới>] [--app-sha <sha>] [--wal-segment-mb 16] [--timeout-minutes 60] [--keep]
//
// Không có --drill-dir: chỉ kiểm tĩnh (đoạn WAL, liên tục, cửa sổ 35 ngày, archive lag, base
// backup, điểm đích). Có --drill-dir: khôi phục thật vào PostgreSQL disposable (xem
// scripts/lib/pitr-drill.ts) và đo RPO/phần DB của RTO.
// Env (không qua argv): PITR_DRILL_MARKER (khớp tệp XBOSS_DISPOSABLE), PITR_PG_BIN_DIR (tuỳ chọn).
// Mã thoát: 0 = mọi hạng mục PASS; 1 = có FAIL (hoặc tham số sai); 2 = không FAIL nhưng còn NOT_RUN.
// Không in URI/mật khẩu/marker/đường dẫn tuyệt đối; không tạo lịch, không đẩy remote, không xoá backup.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { DrCheck } from "./lib/dr-readonly";
import { readRepoMigrations } from "./lib/dr-files";
import {
  ManifestError,
  D08_TARGETS,
  parseRecoveryManifest,
  type ManifestRead,
} from "./lib/recovery-manifest";
import {
  analyzePitr,
  parseLsn,
  parseTarget,
  type PitrAnalysis,
  type PitrTarget,
} from "./lib/pitr-archive";
import {
  checkArchiveLag,
  checkBaseBackupManifests,
  checkPitrWindow,
  checkWalContinuity,
  checkWalSegments,
  classifyVerifyBackup,
  rpoCheck,
  rtoCheck,
  selectTarget,
  summarizePitr,
} from "./lib/pitr-checks";
import { readBaseBackups, scanArchiveDir } from "./lib/pitr-io";
import { drillSkipped, resolvePgBinDir, runPitrDrill, verifyBaseBackup } from "./lib/pitr-drill";

const VALUE_FLAGS = [
  "--archive-dir",
  "--base-backups-dir",
  "--target",
  "--drill-dir",
  "--drill-database",
  "--drill-user",
  "--incident-at",
  "--recovery-manifest",
  "--evidence-out",
  "--app-sha",
  "--wal-segment-mb",
  "--timeout-minutes",
] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
type Args = Partial<Record<ValueFlag, string>> & { keep: boolean };

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const args: Args = { keep: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--keep" && !args.keep) {
      args.keep = true;
      continue;
    }
    const flag = argv[i] as ValueFlag;
    const value = argv[i + 1];
    if (!VALUE_FLAGS.includes(flag) || !value || value.startsWith("--") || args[flag]) {
      throw new UsageError(
        `Cờ không hợp lệ. Nhận: ${VALUE_FLAGS.join(", ")}, --keep (mỗi cờ 1 lần).`,
      );
    }
    args[flag] = value;
    i++;
  }
  if (!args["--archive-dir"] || !args["--base-backups-dir"]) {
    throw new UsageError("Cần --archive-dir và --base-backups-dir.");
  }
  for (const flag of ["--archive-dir", "--base-backups-dir"] as const) {
    if (!existsSync(args[flag]!)) throw new UsageError(`${flag} không tồn tại.`);
  }
  if (args["--drill-dir"] && (!args["--drill-database"] || !args["--drill-user"])) {
    throw new UsageError("Diễn tập cần --drill-database và --drill-user.");
  }
  return args;
}

function positiveInt(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  if (!/^\d{1,5}$/.test(raw) || Number(raw) < 1)
    throw new UsageError(`${flag} phải là số nguyên dương.`);
  return Number(raw);
}

function isoMs(raw: string | undefined, fallback: number, nowMs: number): number {
  if (raw === undefined) return fallback;
  const target = parseTarget(raw);
  if (target?.kind !== "time" || Date.parse(target.iso) > nowMs) {
    throw new UsageError("--incident-at phải là thời điểm ISO 8601 có múi giờ, không ở tương lai.");
  }
  return Date.parse(target.iso);
}

function currentAppSha(explicit: string | undefined): string | null {
  if (explicit) return /^[0-9a-f]{7,64}$/.test(explicit) ? explicit : null;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const sha = git.status === 0 ? git.stdout.trim() : "";
  return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

/** Recovery set (manifest v1) phải gắn base backup còn dùng được + WAL phủ snapshot + key. */
function recoverySetChecks(manifest: ManifestRead | null, analysis: PitrAnalysis): DrCheck[] {
  const make = (name: string, outcome: Omit<DrCheck, "name" | "evidence">): DrCheck => ({
    name,
    evidence: "infrastructure",
    ...outcome,
  });
  if (!manifest || manifest.kind !== "v1") {
    const reason = manifest
      ? "Manifest cũ (schemaVersion 1) không có base backup/WAL/key — cần manifest v1."
      : "Chưa truyền --recovery-manifest.";
    return ["recovery-set-base-backup", "recovery-set-key-reference"].map((name) =>
      make(name, { status: "NOT_RUN", reason }),
    );
  }
  const v1 = manifest.manifest;
  const base = analysis.bases.find((item) => item.id === v1.baseBackupId);
  let baseCheck: DrCheck;
  if (!v1.baseBackupId) {
    baseCheck = make("recovery-set-base-backup", {
      status: "FAIL",
      reason: "Manifest không gắn baseBackupId — recovery set chưa có base backup PITR.",
    });
  } else if (!base || !base.usable) {
    baseCheck = make("recovery-set-base-backup", {
      status: "FAIL",
      reason: base
        ? `Base backup của recovery set không dùng được: ${base.reason}.`
        : "Base backup ghi trong manifest không còn trong kho.",
      expected: v1.baseBackupId,
    });
  } else {
    const snapshotLsn = v1.snapshot.walLsn ? parseLsn(v1.snapshot.walLsn) : null;
    const endLsn =
      analysis.endSeg === null ? null : BigInt(analysis.endSeg + 1) * BigInt(analysis.segBytes);
    const covered =
      snapshotLsn !== null &&
      endLsn !== null &&
      snapshotLsn >= base.manifest.startLsn! &&
      snapshotLsn <= endLsn;
    baseCheck = make("recovery-set-base-backup", {
      status: covered ? "PASS" : snapshotLsn === null ? "NOT_RUN" : "FAIL",
      reason: covered
        ? "Base backup của recovery set còn nguyên và WAL đã archive phủ tới LSN của snapshot."
        : snapshotLsn === null
          ? "Manifest không ghi LSN snapshot — chưa đối chiếu được WAL."
          : "WAL đã archive chưa phủ LSN của snapshot (archive chậm hoặc base backup sau snapshot).",
      actual: { baseBackupId: base.id, snapshotLsn: v1.snapshot.walLsn },
    });
  }
  const keyCheck = v1.encryptionKeyReference
    ? make("recovery-set-key-reference", {
        status: "PASS",
        reason: "Manifest có tham chiếu key (chỉ tham chiếu, không chứa key).",
        actual: { provider: v1.encryptionKeyReference.provider },
      })
    : make("recovery-set-key-reference", {
        status: "FAIL",
        reason: "Thiếu encryptionKeyReference — recovery set không phục hồi được dữ liệu mã hoá.",
      });
  return [baseCheck, keyCheck];
}

function emit(report: Record<string, unknown>, evidenceOut: string | undefined): void {
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  // "wx": không ghi đè bằng chứng lần trước (A6-AC06 giữ evidence của lần thất bại).
  if (evidenceOut) writeFileSync(evidenceOut, `${json}\n`, { flag: "wx", mode: 0o600 });
}

async function main(): Promise<void> {
  const startedMs = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const segBytes = positiveInt(args["--wal-segment-mb"], 16, "--wal-segment-mb") * 1024 * 1024;
  const timeoutSeconds = positiveInt(args["--timeout-minutes"], 60, "--timeout-minutes") * 60;
  const target: PitrTarget | null = parseTarget(args["--target"]);
  const incidentMs = isoMs(args["--incident-at"], startedMs, startedMs);

  let manifest: ManifestRead | null = null;
  if (args["--recovery-manifest"]) {
    try {
      manifest = parseRecoveryManifest(
        JSON.parse(readFileSync(args["--recovery-manifest"], "utf8")),
      );
    } catch (error) {
      const issues = error instanceof ManifestError ? error.issues : ["không đọc được JSON"];
      throw new UsageError(`Manifest bị từ chối: ${issues.slice(0, 10).join("; ")}`);
    }
  }

  const archiveDir = args["--archive-dir"]!;
  const basesDir = args["--base-backups-dir"]!;
  const scan = scanArchiveDir(archiveDir, segBytes);
  const analysis = analyzePitr(scan, readBaseBackups(basesDir));
  const lag = checkArchiveLag(analysis, Date.now());
  const selected = selectTarget(analysis, target, Date.now());
  const results: DrCheck[] = [
    checkWalSegments(scan),
    checkBaseBackupManifests(analysis),
    checkWalContinuity(analysis),
    checkPitrWindow(analysis),
    lag.check,
    selected.check,
    ...recoverySetChecks(manifest, analysis),
  ];

  const verifyBase =
    selected.base ??
    analysis.bases.filter((item) => item.usable).sort((a, b) => b.startSeg! - a.startSeg!)[0] ??
    null;
  const pgMajor =
    verifyBase?.format === "plain"
      ? readFileSync(join(basesDir, verifyBase.id, "PG_VERSION"), "utf8").trim()
      : null;
  const binDir = resolvePgBinDir(pgMajor, process.env.PITR_PG_BIN_DIR);
  const isRoot = process.getuid?.() === 0;

  let drill = null;
  if (!args["--drill-dir"]) {
    results.push(...drillSkipped("Chưa diễn tập khôi phục (--drill-dir)."));
    // Không diễn tập: vẫn kiểm nội dung base backup plain tại chỗ (pg_verifybackup chỉ đọc).
    const integrity = results.findIndex((item) => item.name === "base-backup-integrity");
    if (verifyBase?.format === "plain") {
      const dir = join(basesDir, verifyBase.id);
      const outcome = classifyVerifyBackup(
        verifyBaseBackup(binDir, {}, dir, join(dir, "backup_manifest"), archiveDir),
        verifyBase.manifest,
      );
      results[integrity] = { ...results[integrity], ...outcome };
    } else {
      results[integrity] = {
        ...results[integrity],
        reason: verifyBase
          ? "Base backup dạng tar — kiểm từng tệp cần giải nén, chạy cùng --drill-dir."
          : "Không có base backup dùng được để kiểm.",
      };
    }
  } else if (selected.check.status !== "PASS" || !selected.base || analysis.endSeg === null) {
    results.push(
      ...drillSkipped(
        target
          ? "Điểm đích sai/không có base backup dùng được — dừng trước khi ghi."
          : "Diễn tập cần --target.",
        target ? "FAIL" : "NOT_RUN",
      ),
    );
  } else {
    drill = await runPitrDrill({
      drillDir: args["--drill-dir"],
      expectedMarker: process.env.PITR_DRILL_MARKER?.trim(),
      archiveDir,
      baseBackupsDir: basesDir,
      base: selected.base,
      target: target!,
      endSeg: analysis.endSeg,
      segBytes,
      database: args["--drill-database"]!,
      user: args["--drill-user"]!,
      binDir,
      isRoot,
      timeoutSeconds,
      keep: args.keep,
      repoMigrations: readRepoMigrations(),
    });
    results.push(...drill.checks);
  }
  results.push(
    rpoCheck({
      target,
      incidentMs,
      lastReplayedCommitMs: drill?.lastReplayedCommitMs ?? null,
    }),
    rtoCheck(drill?.dbReadyMs ? Math.round((drill.dbReadyMs - incidentMs) / 1000) : null),
  );

  const summary = summarizePitr(results);
  const workloadBase = selected.base ?? verifyBase;
  emit(
    {
      kind: "pitr-verify",
      specVersion: "QUALITY-FINAL-1/A6",
      appSha: currentAppSha(args["--app-sha"]),
      environment: args["--drill-dir"] ? "isolated-drill" : "static-archive-check",
      startedAt: new Date(startedMs).toISOString(),
      completedAt: new Date().toISOString(),
      targets: D08_TARGETS,
      target: target ? (target.kind === "latest" ? "latest" : target.iso) : null,
      incidentAt: new Date(incidentMs).toISOString(),
      recoverySetId:
        manifest?.kind === "v1"
          ? manifest.manifest.recoverySetId
          : (manifest?.recoverySetId ?? null),
      workload: workloadBase
        ? {
            baseBackupId: workloadBase.id,
            baseBackupBytes: workloadBase.manifest.totalBytes,
            walSegmentsToReplay:
              analysis.endSeg === null || workloadBase.startSeg === null
                ? null
                : analysis.endSeg - workloadBase.startSeg + 1,
            walSegmentBytes: segBytes,
          }
        : null,
      replay: drill?.replay ?? null,
      drillRunDir: drill?.runDirName ?? null,
      drillKept: drill?.kept ?? false,
      warnings: lag.warning ? [lag.warning] : [],
      note: "RTO đầy đủ còn gồm app sẵn sàng + smoke/UAT; kết quả diễn tập không tự cấp quyền khôi phục production.",
      ...summary,
      results,
    },
    args["--evidence-out"],
  );
  process.exitCode = summary.exitCode;
}

main().catch((error) => {
  const detail =
    error instanceof UsageError || (error instanceof Error && error.message.startsWith("--target"))
      ? error.message
      : "lỗi đọc archive/base backup hoặc hệ thống (chi tiết không in để tránh lộ cấu hình)";
  console.error(`Kiểm PITR thất bại: ${detail}`);
  process.exitCode = 1;
});
