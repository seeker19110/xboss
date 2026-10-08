import "./setup"; // đứng đầu: xoá DATABASE_URL — test này chỉ dùng cluster tự dựng trong thư mục tạm
// S14 / A6 — diễn tập PITR THẬT: dựng cluster PostgreSQL nguồn tạm (initdb, archive_mode=on,
// archive_command=cp), pg_basebackup plain + tar, ghi canary có mốc thời gian, rồi khôi phục vào
// cluster disposable tới một thời điểm và tới cuối archive. Map AC:
//   A6-AC01 (khôi phục DB + đúng migrations, không tác dụng phụ ra ngoài — lớp DB),
//   A6-AC02 (base backup hỏng/thiếu tệp → FAIL đúng hạng mục), A6-AC03 (marker sai/đích chồng lấn
//   kho backup/đích thời điểm sai → chặn trước ghi), A6-AC05/Q-AC08 (RPO đo qua WAL replay, WAL gap),
//   A6-AC06 (lỗi diễn tập giữ evidence, không đổi archive/base backup).
// Cần binary server PostgreSQL (initdb/postgres/pg_basebackup/pg_verifybackup) và user không
// phải root (root: chạy tiến trình dưới user `postgres` nếu có). Thiếu → ca cuối kiểm logic
// phân loại NOT_RUN thay vì bỏ qua (không skip ở release gate, không PASS giả).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import {
  analyzePitr,
  parseTarget,
  type PitrAnalysis,
  type PitrTarget,
} from "../scripts/lib/pitr-archive";
import {
  checkArchiveLag,
  checkWalContinuity,
  classifyVerifyBackup,
  rpoCheck,
  selectTarget,
} from "../scripts/lib/pitr-checks";
import { readBaseBackups, scanArchiveDir } from "../scripts/lib/pitr-io";
import {
  DRILL_MARKER_FILE,
  resolvePgBinDir,
  runPitrDrill,
  verifyBaseBackup,
  type DrillOptions,
  type DrillOwner,
} from "../scripts/lib/pitr-drill";
import { readRepoMigrations } from "../scripts/lib/dr-files";

const MARKER = `xboss-disposable:${randomBytes(16).toString("hex")}`;

function detectEnvironment(): { binDir: string; owner?: DrillOwner } | null {
  const binDir =
    resolvePgBinDir("16", process.env.PITR_PG_BIN_DIR) ?? resolvePgBinDir(null, undefined);
  if (!binDir) return null;
  for (const tool of [
    "initdb",
    "pg_ctl",
    "postgres",
    "pg_basebackup",
    "pg_verifybackup",
    "pg_controldata",
  ]) {
    if (!existsSync(join(binDir, tool))) return null;
  }
  if (process.getuid?.() !== 0) return { binDir };
  const uid = spawnSync("id", ["-u", "postgres"], { encoding: "utf8" });
  const gid = spawnSync("id", ["-g", "postgres"], { encoding: "utf8" });
  if (uid.status !== 0 || gid.status !== 0) return null;
  return { binDir, owner: { uid: Number(uid.stdout.trim()), gid: Number(gid.stdout.trim()) } };
}

const ENV = detectEnvironment();

function runAs(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...(ENV?.owner ?? {}) });
  assert.equal(result.status, 0, `${cmd} thất bại: ${result.stderr}`);
  return result.stdout;
}

function ownedDir(path: string, mode = 0o700): string {
  mkdirSync(path, { mode });
  chmodSync(path, mode);
  if (ENV?.owner) chownSync(path, ENV.owner.uid, ENV.owner.gid);
  return path;
}

function treeDigest(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(relative(root, path)).update(readFileSync(path));
    }
  };
  walk(root);
  return hash.digest("hex");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Đăng ký có điều kiện thay vì `skip`: release gate coi ca skip là lỗi, còn môi trường thiếu
// binary vẫn phải chứng minh nhánh NOT_RUN (ca cuối file).
if (ENV)
  describe("Diễn tập PITR trên PostgreSQL thật (cluster tạm)", () => {
    const work = mkdtempSync(join(tmpdir(), "xboss-pitr-"));
    const dirs = {
      src: join(work, "src"),
      arch: join(work, "arch"),
      bases: join(work, "bases"),
      sock: join(work, "sock"),
      drill: join(work, "drill"),
    };
    let analysis: PitrAnalysis;
    let targetIso = "";
    let canary1Ms = 0;
    let canary3Ms = 0;
    let incidentMs = 0;
    let archiveDigest = "";
    let basesDigest = "";

    const drillOptions = (
      overrides: Partial<DrillOptions> & { target: PitrTarget },
    ): DrillOptions => {
      const selected = selectTarget(analysis, overrides.target, Date.now());
      return {
        drillDir: dirs.drill,
        expectedMarker: MARKER,
        archiveDir: dirs.arch,
        baseBackupsDir: dirs.bases,
        base: selected.base!,
        endSeg: analysis.endSeg!,
        segBytes: analysis.segBytes,
        database: "xboss",
        user: "postgres",
        binDir: ENV!.binDir,
        isRoot: false,
        owner: ENV!.owner,
        timeoutSeconds: 120,
        keep: false,
        repoMigrations: readRepoMigrations(),
        ...overrides,
      };
    };

    before(async () => {
      chmodSync(work, 0o700);
      if (ENV!.owner) chownSync(work, ENV!.owner.uid, ENV!.owner.gid);
      for (const dir of [dirs.arch, dirs.bases, dirs.sock, dirs.drill]) ownedDir(dir);
      writeFileSync(join(dirs.drill, DRILL_MARKER_FILE), `${MARKER}\n`, { mode: 0o600 });
      const bin = (name: string) => join(ENV!.binDir, name);
      runAs(bin("initdb"), [
        "-D",
        dirs.src,
        "-A",
        "trust",
        "-U",
        "postgres",
        "-E",
        "UTF8",
        "--no-sync",
      ]);
      runAs(bin("pg_ctl"), [
        "-D",
        dirs.src,
        "-l",
        join(work, "src.log"),
        "-w",
        "-o",
        `-c listen_addresses='' -c unix_socket_directories=${dirs.sock} -c port=5432 -c wal_level=replica ` +
          `-c archive_mode=on -c archive_command='test ! -f ${dirs.arch}/%f && cp %p ${dirs.arch}/%f' -c fsync=off`,
        "start",
      ]);
      const connect = async (database: string) => {
        const client = new Client({ host: dirs.sock, port: 5432, user: "postgres", database });
        await client.connect();
        return client;
      };
      const admin = await connect("postgres");
      await admin.query("CREATE DATABASE xboss");
      const db = await connect("xboss");
      await db.query("CREATE TABLE schema_migrations (name text PRIMARY KEY)");
      for (const migration of readRepoMigrations()) {
        await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      }
      await db.query(
        "CREATE TABLE canary (id int PRIMARY KEY, at timestamptz NOT NULL DEFAULT clock_timestamp())",
      );
      const baseBackup = (id: string, format: "p" | "t") =>
        runAs(bin("pg_basebackup"), [
          "-h",
          dirs.sock,
          "-p",
          "5432",
          "-U",
          "postgres",
          "-D",
          join(dirs.bases, id),
          `-F${format}`,
          "-X",
          "none",
          "-c",
          "fast",
        ]);
      baseBackup("b1-plain", "p");
      const canary = async (id: number) =>
        (
          (await db.query("INSERT INTO canary (id) VALUES ($1) RETURNING at", [id])).rows[0]
            .at as Date
        ).getTime();
      canary1Ms = await canary(1);
      await sleep(1500);
      targetIso = new Date().toISOString();
      await sleep(1500);
      await canary(2);
      baseBackup("b2-tar", "t");
      canary3Ms = await canary(3);
      const switched = (await admin.query("SELECT pg_walfile_name(pg_switch_wal()) AS name"))
        .rows[0].name;
      for (let i = 0; i < 40 && !existsSync(join(dirs.arch, switched)); i++) await sleep(250);
      assert.ok(existsSync(join(dirs.arch, switched)), "đoạn WAL cuối phải được archive");
      incidentMs = Date.now();
      await db.end();
      await admin.end();
      runAs(bin("pg_ctl"), ["-D", dirs.src, "-w", "-m", "fast", "stop"]);
      analysis = analyzePitr(scanArchiveDir(dirs.arch), readBaseBackups(dirs.bases));
      archiveDigest = treeDigest(dirs.arch);
      basesDigest = treeDigest(dirs.bases);
    });

    after(() => {
      const pid = join(dirs.src, "postmaster.pid");
      if (existsSync(pid))
        spawnSync(
          join(ENV!.binDir, "pg_ctl"),
          ["-D", dirs.src, "-m", "immediate", "stop"],
          ENV!.owner ?? {},
        );
      rmSync(work, { recursive: true, force: true });
    });

    test("Archive thật: WAL liên tục từ 2 base backup, lag nhỏ; cửa sổ <35 ngày là FAIL (không PASS giả)", () => {
      assert.equal(checkWalContinuity(analysis).status, "PASS");
      assert.deepEqual(
        analysis.bases.map((b) => [b.id, b.format, b.usable, Boolean(b.stopTime)]),
        [
          ["b1-plain", "plain", true, true],
          ["b2-tar", "tar", true, true],
        ],
      );
      assert.equal(checkArchiveLag(analysis, Date.now()).check.status, "PASS");
      const dir = join(dirs.bases, "b1-plain");
      const verify = verifyBaseBackup(
        ENV!.binDir,
        { owner: ENV!.owner },
        dir,
        join(dir, "backup_manifest"),
        dirs.arch,
      );
      assert.equal(classifyVerifyBackup(verify, analysis.bases[0].manifest).status, "PASS");
    });

    test("A6-AC01/Q-AC08: khôi phục tới thời điểm → dừng đúng điểm, cách ly, đúng migrations; dọn khi PASS", async () => {
      const target = parseTarget(targetIso)!;
      const options = drillOptions({ target });
      assert.equal(options.base.id, "b1-plain", "base sớm hơn đích");
      const result = await runPitrDrill(options);
      assert.deepEqual(
        result.checks.map((c) => [c.name, c.status]),
        [
          ["drill-preflight", "PASS"],
          ["base-backup-integrity", "PASS"],
          ["drill-restore", "PASS"],
          ["drill-isolation", "PASS"],
          ["drill-replay-point", "PASS"],
          ["drill-migrations", "PASS"],
        ],
        JSON.stringify(result.checks),
      );
      assert.ok(
        result.lastReplayedCommitMs! >= canary1Ms,
        "canary 1 (trước đích) đã được khôi phục",
      );
      assert.ok(
        result.lastReplayedCommitMs! <= Date.parse(targetIso),
        "không replay vượt đích (canary 2)",
      );
      assert.equal(result.kept, false);
      assert.deepEqual(
        readdirSync(dirs.drill),
        [DRILL_MARKER_FILE],
        "chỉ xoá đúng thư mục run-* của lần chạy",
      );
    });

    test("A6-AC05: khôi phục tới cuối archive từ base tar → RPO đo qua commit replay đạt ≤5 phút", async () => {
      const result = await runPitrDrill(drillOptions({ target: { kind: "latest" } }));
      assert.ok(
        result.checks.every((c) => c.status === "PASS"),
        JSON.stringify(result.checks),
      );
      assert.ok(result.lastReplayedCommitMs! >= canary3Ms - 1000, "canary cuối đã được khôi phục");
      const rpo = rpoCheck({
        target: { kind: "latest" },
        incidentMs,
        lastReplayedCommitMs: result.lastReplayedCommitMs,
      });
      assert.equal(rpo.status, "PASS", JSON.stringify(rpo));
      assert.equal(result.replay?.inRecovery, true, "đứng ở standby, không promote");
    });

    test("A6-AC02/AC06: base backup hỏng/thiếu tệp → FAIL đúng hạng mục, không khởi động, giữ evidence", async () => {
      const badBases = ownedDir(join(work, "bases-bad"));
      runAs("cp", ["-R", "-p", join(dirs.bases, "b1-plain"), join(badBases, "b1-plain")]);
      const pgControl = join(badBases, "b1-plain", "global", "pg_control");
      const bytes = readFileSync(pgControl);
      bytes[100] ^= 0xff;
      writeFileSync(pgControl, bytes);
      const target = parseTarget(targetIso)!;
      const result = await runPitrDrill(drillOptions({ target, baseBackupsDir: badBases }));
      const status = Object.fromEntries(result.checks.map((c) => [c.name, c.status]));
      assert.equal(status["base-backup-integrity"], "FAIL");
      assert.equal(status["drill-restore"], "FAIL");
      assert.equal(status["drill-replay-point"], "NOT_RUN");
      assert.equal(result.kept, true, "thất bại → giữ thư mục diễn tập làm bằng chứng");
      assert.ok(!existsSync(join(dirs.drill, result.runDirName!, "data", "postmaster.pid")));
      rmSync(join(dirs.drill, result.runDirName!), { recursive: true, force: true });

      unlinkSync(join(badBases, "b1-plain", "global", "pg_filenode.map"));
      const dir = join(badBases, "b1-plain");
      const missing = verifyBaseBackup(
        ENV!.binDir,
        { owner: ENV!.owner },
        dir,
        join(dir, "backup_manifest"),
        dirs.arch,
      );
      assert.equal(classifyVerifyBackup(missing, analysis.bases[0].manifest).status, "FAIL");
    });

    test("Q-AC08: WAL gap → đích không còn khôi phục được (chặn tĩnh) và diễn tập ép base cũ FAIL có lý do", async () => {
      const gapArchive = ownedDir(join(work, "arch-gap"));
      const b1 = analysis.bases.find((b) => b.id === "b1-plain")!;
      const removed = readdirSync(dirs.arch)
        .filter((name) => /^[0-9A-F]{24}$/.test(name))
        .sort()
        .find((name) => parseInt(name.slice(16), 16) === b1.endSeg! + 1)!;
      for (const name of readdirSync(dirs.arch)) {
        if (name !== removed) runAs("cp", ["-p", join(dirs.arch, name), join(gapArchive, name)]);
      }
      const gap = analyzePitr(scanArchiveDir(gapArchive), readBaseBackups(dirs.bases));
      assert.equal(gap.bases.find((b) => b.id === "b1-plain")?.usable, false);
      assert.equal(selectTarget(gap, parseTarget(targetIso), Date.now()).check.status, "FAIL");

      const forced = await runPitrDrill(
        drillOptions({ target: parseTarget(targetIso)!, archiveDir: gapArchive }),
      );
      const restore = forced.checks.find((c) => c.name === "drill-restore")!;
      assert.equal(restore.status, "FAIL");
      assert.match(restore.reason, /WAL kết thúc trước điểm đích/);
      assert.equal(forced.kept, true);
      rmSync(join(dirs.drill, forced.runDirName!), { recursive: true, force: true });
    });

    test("A6-AC03: marker sai, đích chồng lấn kho backup, root không user riêng → chặn trước mọi ghi", async () => {
      const target = parseTarget(targetIso)!;
      const before = readdirSync(dirs.drill);
      const wrong = await runPitrDrill(
        drillOptions({ target, expectedMarker: `xboss-disposable:${"x".repeat(32)}` }),
      );
      assert.equal(wrong.checks[0].status, "FAIL");
      assert.match(wrong.checks[0].reason, /marker/);
      assert.ok(wrong.checks.slice(1).every((c) => c.status === "NOT_RUN"));
      const inside = ownedDir(join(dirs.arch, "drill-inside"));
      writeFileSync(join(inside, DRILL_MARKER_FILE), MARKER);
      const overlap = await runPitrDrill(drillOptions({ target, drillDir: inside }));
      assert.match(overlap.checks[0].reason, /chồng lấn/);
      rmSync(inside, { recursive: true, force: true });
      const root = await runPitrDrill(drillOptions({ target, isRoot: true, owner: undefined }));
      assert.equal(root.checks[0].status, ENV!.owner ? "FAIL" : "NOT_RUN");
      assert.deepEqual(readdirSync(dirs.drill), before, "không tạo thư mục run-* nào");
    });

    test("A6-AC06: sau mọi lần diễn tập (kể cả thất bại) archive và base backup không đổi một byte", () => {
      assert.equal(treeDigest(dirs.arch), archiveDigest);
      assert.equal(treeDigest(dirs.bases), basesDigest);
    });

    test("CLI tĩnh: JSON PASS/FAIL/NOT_RUN, mã thoát 1 khi có FAIL, không in đường dẫn tuyệt đối/marker", () => {
      const evidence = join(work, "evidence.json");
      const cli = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/verify-pitr.ts",
          "--archive-dir",
          dirs.arch,
          "--base-backups-dir",
          dirs.bases,
          "--target",
          "latest",
          "--evidence-out",
          evidence,
        ],
        { encoding: "utf8", env: { ...process.env, PITR_DRILL_MARKER: MARKER } },
      );
      assert.equal(cli.status, 1, cli.stderr);
      const report = JSON.parse(cli.stdout);
      assert.equal(report.kind, "pitr-verify");
      const status = Object.fromEntries(
        report.results.map((r: { name: string; status: string }) => [r.name, r.status]),
      );
      assert.equal(status["wal-continuity"], "PASS");
      assert.equal(status["pitr-window"], "FAIL");
      assert.equal(status["drill-restore"], "NOT_RUN");
      assert.equal(status.rto, "NOT_RUN");
      assert.equal(report.completePitrVerified, false);
      assert.doesNotMatch(cli.stdout, new RegExp(work.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(cli.stdout, new RegExp(MARKER));
      assert.equal(statSync(evidence).mode & 0o777, 0o600);
      const firstEvidence = readFileSync(evidence, "utf8");
      const again = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/verify-pitr.ts",
          "--archive-dir",
          dirs.arch,
          "--base-backups-dir",
          dirs.bases,
          "--evidence-out",
          evidence,
        ],
        { encoding: "utf8" },
      );
      assert.equal(again.status, 1);
      assert.match(again.stderr, /Kiểm PITR thất bại/);
      assert.equal(
        readFileSync(evidence, "utf8"),
        firstEvidence,
        "không ghi đè evidence lần trước",
      );
    });

    test("CLI sinh manifest: cờ kho PITR thiếu cặp hoặc base backup không dùng được → dừng trước khi kết nối", () => {
      const manifestCli = (extra: string[]) =>
        spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/lib/recovery-manifest-cli.ts",
            "--out",
            join(work, "m.recovery-v1.json"),
            ...extra,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              // Cổng 1 trên loopback: nếu lỡ đi tới bước kết nối thì lỗi ngay, không chạm DB nào.
              DR_SOURCE_DATABASE_URL: "postgresql://khong_dung:khong_dung@127.0.0.1:1/khong_co",
              DR_SOURCE_EXPECTED_DATABASE: "khong_co",
              DR_SOURCE_EXPECTED_USER: "khong_dung",
            },
          },
        );
      const unpaired = manifestCli(["--wal-archive-dir", dirs.arch]);
      assert.equal(unpaired.status, 1);
      assert.match(unpaired.stderr, /phải đi cùng nhau/);
      const wrongBase = manifestCli([
        "--wal-archive-dir",
        dirs.arch,
        "--base-backups-dir",
        dirs.bases,
        "--base-backup-id",
        "khong-co",
      ]);
      assert.equal(wrongBase.status, 1);
      assert.match(wrongBase.stderr, /Không có base backup \(đúng id\)/);
      assert.ok(!existsSync(join(work, "m.recovery-v1.json")));
    });
  });

if (!ENV)
  test("Môi trường thiếu binary PostgreSQL/không có user không-root → diễn tập NOT_RUN có lý do", async () => {
    const drill = mkdtempSync(join(tmpdir(), "xboss-pitr-none-"));
    const store = mkdtempSync(join(tmpdir(), "xboss-pitr-store-"));
    try {
      writeFileSync(join(drill, DRILL_MARKER_FILE), MARKER);
      const result = await runPitrDrill({
        drillDir: drill,
        expectedMarker: MARKER,
        archiveDir: store,
        baseBackupsDir: store,
        base: {
          id: "b",
          format: "plain",
          hasTablespaces: false,
          manifest: {
            ok: true,
            issue: null,
            startTli: 1,
            endTli: 1,
            startLsn: 0n,
            endLsn: 0n,
            totalBytes: 0,
            fileCount: 0,
            checksumAlgorithms: [],
          },
          startSeg: 0,
          endSeg: 0,
          stopTime: null,
          usable: true,
          reason: "",
        },
        target: { kind: "latest" },
        endSeg: 0,
        segBytes: 16 * 1024 * 1024,
        database: "xboss",
        user: "postgres",
        binDir: null,
        isRoot: false,
        timeoutSeconds: 10,
        keep: false,
        repoMigrations: [],
      });
      assert.equal(result.checks[0].status, "NOT_RUN");
      assert.match(result.checks[0].reason, /binary PostgreSQL/);
      assert.deepEqual(readdirSync(drill), [DRILL_MARKER_FILE]);
    } finally {
      rmSync(drill, { recursive: true, force: true });
      rmSync(store, { recursive: true, force: true });
    }
  });
