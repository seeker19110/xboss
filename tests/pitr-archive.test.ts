// S14 / A6 — phân tích PITR thuần trên archive WAL TỔNG HỢP (không cần PostgreSQL):
// WAL gap, đoạn cụt, archive lag, đích sai, base backup/manifest hỏng, cửa sổ 35 ngày,
// rẽ nhánh timeline, phân loại RPO/RTO/pg_verifybackup và mã thoát. Map AC:
//   A6-AC02 (backup hỏng/thiếu), A6-AC03 (đích sai chặn trước ghi), A6-AC05/Q-AC08 (RPO 5m /
//   RTO 60m / 35 ngày — thiếu số đo là NOT_RUN, vượt là FAIL, không hạ target).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEFAULT_WAL_SEGMENT_BYTES as SEG,
  analyzePitr,
  formatLsn,
  parseBackupHistory,
  parseLsn,
  parsePgTimestamp,
  parseTarget,
  parseWalFileName,
  readBackupManifest,
  scanArchive,
  walCoverageFromAnalysis,
  walFileName,
  type ArchiveEntry,
  type BaseBackupInput,
} from "../scripts/lib/pitr-archive";
import {
  ARCHIVE_LAG_WARN_SECONDS,
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
} from "../scripts/lib/pitr-checks";
import { classifyRecoveryLog } from "../scripts/lib/pitr-drill";
import { D08_TARGETS, parseRecoveryManifest } from "../scripts/lib/recovery-manifest";

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-10-08T00:00:00Z");
const LAST = 20;
/** Đoạn n archive lúc: đoạn cuối cách NOW 30 giây, mỗi đoạn trước đó lùi 2 ngày. */
const mtime = (n: number) => NOW - 30_000 - (LAST - n) * 2 * DAY;
const lsnAt = (segNo: number, offset = 0x28) =>
  formatLsn(BigInt(segNo) * BigInt(SEG) + BigInt(offset));
const pgTime = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");

function manifestText(tli: number, startSeg: number, algorithm = "CRC32C"): string {
  const body =
    `{ "PostgreSQL-Backup-Manifest-Version": 1,\n"Files": [\n` +
    `{ "Path": "PG_VERSION", "Size": 3, "Last-Modified": "x", "Checksum-Algorithm": "${algorithm}", "Checksum": "00" }\n],\n` +
    `"WAL-Ranges": [\n{ "Timeline": ${tli}, "Start-LSN": "${lsnAt(startSeg)}", "End-LSN": "${lsnAt(startSeg, 0x100)}" }\n],\n`;
  const sum = createHash("sha256").update(body).digest("hex");
  return `${body}"Manifest-Checksum": "${sum}"}\n`;
}

function base(
  id: string,
  startSeg: number,
  tli = 1,
  text = manifestText(tli, startSeg),
): BaseBackupInput {
  return { id, format: "plain", hasTablespaces: false, manifest: readBackupManifest(text) };
}

type Fixture = { entries: ArchiveEntry[]; files: Map<string, string> };

function archive(
  options: { missing?: number[]; tli2From?: number; history?: boolean; stopTimes?: boolean } = {},
): Fixture {
  const entries: ArchiveEntry[] = [];
  const files = new Map<string, string>();
  const add = (name: string, size: number, at: number, content?: string) => {
    entries.push({ name, size, mtimeMs: at });
    if (content !== undefined) files.set(name, content);
  };
  for (let n = 1; n <= LAST; n++) {
    if (options.missing?.includes(n)) continue;
    const onTli2 = options.tli2From !== undefined && n >= options.tli2From;
    add(walFileName(onTli2 ? 2 : 1, n, SEG), SEG, mtime(n));
    // Đoạn chứa điểm rẽ nhánh có ở cả 2 timeline (đúng như PostgreSQL archive).
    if (onTli2 && n === options.tli2From) add(walFileName(1, n, SEG), SEG, mtime(n));
  }
  if (options.tli2From !== undefined && options.history !== false) {
    add(
      "00000002.history",
      40,
      mtime(options.tli2From),
      `1\t${lsnAt(options.tli2From, 0x1000)}\tno recovery target specified\n`,
    );
  }
  if (options.stopTimes !== false) {
    for (const startSeg of [2, 10]) {
      add(
        `${walFileName(1, startSeg, SEG)}.00000028.backup`,
        300,
        mtime(startSeg),
        `START WAL LOCATION: ${lsnAt(startSeg)} (file ${walFileName(1, startSeg, SEG)})\n` +
          `STOP WAL LOCATION: ${lsnAt(startSeg, 0x100)} (file ${walFileName(1, startSeg, SEG)})\n` +
          `START TIME: ${pgTime(mtime(startSeg) - 1000)}\nLABEL: x\nSTART TIMELINE: 1\n` +
          `STOP TIME: ${pgTime(mtime(startSeg))}\nSTOP TIMELINE: 1\n`,
      );
    }
  }
  return { entries, files };
}

function analyze(fixture: Fixture, bases = [base("b1", 2), base("b2", 10)]) {
  const scan = scanArchive(fixture.entries, (name) => fixture.files.get(name) ?? "", SEG);
  return { scan, analysis: analyzePitr(scan, bases) };
}

test("LSN, tên đoạn WAL và mốc thời gian PostgreSQL đọc/ghi đúng", () => {
  assert.equal(parseLsn("0/2000028"), 0x2000028n);
  assert.equal(formatLsn(parseLsn("1A/FF000028")), "1A/FF000028");
  assert.throws(() => parseLsn("0/zz"));
  const name = walFileName(1, 0x1ff, SEG);
  assert.equal(name, "0000000100000001000000FF");
  assert.deepEqual(parseWalFileName(name, SEG), { tli: 1, segNo: 0x1ff });
  assert.equal(
    parseWalFileName("000000010000000100000100", SEG),
    null,
    "phần thấp vượt số đoạn/id",
  );
  assert.equal(parsePgTimestamp("2026-10-08 12:59:25 UTC"), "2026-10-08T12:59:25.000Z");
  assert.equal(parsePgTimestamp("2026-10-08 19:59:25 +07"), "2026-10-08T12:59:25.000Z");
  assert.equal(parsePgTimestamp("2026-10-08 08:59:25 EDT"), null, "viết tắt mơ hồ → không đoán");
  const history = parseBackupHistory(
    "START WAL LOCATION: 0/2000028 (file x)\nSTOP WAL LOCATION: 0/2000100 (file x)\nSTOP TIME: 2026-10-08 12:59:25 UTC\n",
  );
  assert.equal(history?.stopTime, "2026-10-08T12:59:25.000Z");
});

test("A6-AC02: backup_manifest bị sửa/cụt/thiếu → base-backup-manifests FAIL, base bị loại khỏi cửa sổ", () => {
  const good = manifestText(1, 2);
  assert.equal(readBackupManifest(good).ok, true);
  const tampered = good.replace('"Size": 3', '"Size": 4');
  assert.match(readBackupManifest(tampered).issue ?? "", /Manifest-Checksum không khớp/);
  assert.equal(readBackupManifest(good.slice(0, 60)).ok, false);
  assert.match(readBackupManifest("").issue ?? "", /thiếu Manifest-Checksum/);

  const { analysis } = analyze(archive(), [base("b1", 2, 1, tampered), base("b2", 10)]);
  const manifests = checkBaseBackupManifests(analysis);
  assert.equal(manifests.status, "FAIL");
  assert.match(JSON.stringify(manifests.actual), /b1/);
  assert.equal(analysis.bases.find((b) => b.id === "b1")?.usable, false);
  assert.equal(checkPitrWindow(analysis).status, "FAIL", "chỉ còn b2 (20 ngày) < 35 ngày");
  assert.equal(checkBaseBackupManifests(analyze(archive(), []).analysis).status, "FAIL");
});

test("Q-AC08: archive liên tục 36 ngày từ base backup cũ nhất → liên tục + cửa sổ 35 ngày PASS", () => {
  const { scan, analysis } = analyze(archive());
  assert.equal(checkWalSegments(scan).status, "PASS");
  assert.equal(checkBaseBackupManifests(analysis).status, "PASS");
  assert.equal(checkWalContinuity(analysis).status, "PASS");
  const window = checkPitrWindow(analysis);
  assert.equal(window.status, "PASS");
  assert.deepEqual(window.expected, { pitrWindowDays: D08_TARGETS.pitrWindowDays });
  const coverage = walCoverageFromAnalysis(analysis);
  assert.ok(coverage);
  assert.equal(coverage.missingSegments, 0);
  assert.equal(coverage.startLsn, lsnAt(2));
  assert.equal(coverage.windowEnd, new Date(mtime(LAST)).toISOString());
});

test("A6-FR02: WAL gap giữa 2 base backup rút ngắn cửa sổ → pitr-window FAIL; gap sau base mới nhất → continuity FAIL", () => {
  const mid = analyze(archive({ missing: [5] })).analysis;
  const continuity = checkWalContinuity(mid);
  assert.equal(continuity.status, "PASS", "b2 vẫn phục hồi được tới cuối archive");
  assert.equal(mid.missingCount, 1);
  assert.deepEqual(mid.missingSample, [walFileName(1, 5, SEG)]);
  assert.equal(mid.bases.find((b) => b.id === "b1")?.usable, false);
  assert.equal(checkPitrWindow(mid).status, "FAIL");

  const late = analyze(archive({ missing: [15] })).analysis;
  const lateContinuity = checkWalContinuity(late);
  assert.equal(lateContinuity.status, "FAIL");
  assert.match(lateContinuity.reason, /WAL đứt/);
  assert.equal(walCoverageFromAnalysis(late), null);
  assert.equal(selectTarget(late, { kind: "latest" }, NOW).check.status, "FAIL");
});

test("A6-AC02: đoạn WAL cụt (sai kích thước) → wal-segments FAIL và tính là thiếu; archive nén → NOT_RUN", () => {
  const fixture = archive();
  const truncated = fixture.entries.find((e) => e.name === walFileName(1, 12, SEG))!;
  truncated.size = SEG - 4096;
  const { scan, analysis } = analyze(fixture);
  const segments = checkWalSegments(scan);
  assert.equal(segments.status, "FAIL");
  assert.deepEqual(segments.actual, [walFileName(1, 12, SEG)]);
  assert.equal(checkWalContinuity(analysis).status, "FAIL");

  const compressed = archive();
  compressed.entries.push({ name: `${walFileName(1, 21, SEG)}.gz`, size: 100, mtimeMs: NOW });
  assert.equal(checkWalSegments(analyze(compressed).scan).status, "NOT_RUN");
});

test("A6-FR04: archive lag ≤2 phút PASS; 2–5 phút PASS kèm cảnh báo; >5 phút FAIL", () => {
  const { analysis } = analyze(archive());
  assert.equal(checkArchiveLag(analysis, NOW).check.status, "PASS");
  assert.equal(checkArchiveLag(analysis, NOW).warning, null);
  const warn = checkArchiveLag(analysis, mtime(LAST) + (ARCHIVE_LAG_WARN_SECONDS + 60) * 1000);
  assert.equal(warn.check.status, "PASS");
  assert.match(warn.warning ?? "", /cảnh báo/);
  const late = checkArchiveLag(analysis, mtime(LAST) + (D08_TARGETS.rpoSeconds + 1) * 1000);
  assert.equal(late.check.status, "FAIL");
  assert.match(late.check.reason, /canary/);
});

test("A6-AC03: đích sai (tương lai, trước base backup, sau cuối archive) bị chặn; đích đúng chọn đúng base", () => {
  const { analysis } = analyze(archive());
  const pick = (iso: string) => selectTarget(analysis, parseTarget(iso), NOW);
  assert.equal(pick(new Date(NOW + 60_000).toISOString()).check.status, "FAIL");
  const early = pick(new Date(mtime(2) - DAY).toISOString());
  assert.equal(early.check.status, "FAIL");
  assert.match(early.check.reason, /trước điểm nhất quán/);
  assert.equal(early.base, null, "không chọn base → không có gì để ghi");
  assert.match(
    pick(new Date(mtime(LAST) + 10_000).toISOString()).check.reason,
    /sau đoạn WAL cuối/,
  );
  assert.equal(pick(new Date(mtime(5)).toISOString()).base?.id, "b1");
  assert.equal(pick(new Date(mtime(15)).toISOString()).base?.id, "b2");
  assert.equal(selectTarget(analysis, { kind: "latest" }, NOW).base?.id, "b2");
  assert.equal(selectTarget(analysis, null, NOW).check.status, "NOT_RUN");
  assert.throws(() => parseTarget("2026-10-08 10:00"), /ISO 8601/);
});

test("Thiếu tệp .backup (không biết STOP TIME) → base không được tính vào cửa sổ, không PASS giả", () => {
  const { analysis } = analyze(archive({ stopTimes: false }));
  assert.equal(checkWalContinuity(analysis).status, "PASS");
  const window = checkPitrWindow(analysis);
  assert.equal(window.status, "FAIL");
  assert.match(window.reason, /STOP TIME/);
  assert.equal(
    selectTarget(analysis, parseTarget(new Date(mtime(15)).toISOString()), NOW).check.status,
    "FAIL",
  );
});

test("Timeline rẽ nhánh: đọc đúng đoạn theo .history; thiếu .history hoặc base ở nhánh khác → FAIL/loại", () => {
  const ok = analyze(archive({ tli2From: 12 })).analysis;
  assert.equal(ok.latestTli, 2);
  assert.equal(checkWalContinuity(ok).status, "PASS");
  assert.equal(checkPitrWindow(ok).status, "PASS");

  const fixture = archive({ tli2From: 12 });
  fixture.entries.splice(
    fixture.entries.findIndex((e) => e.name === walFileName(2, 14, SEG)),
    1,
  );
  assert.equal(
    checkWalContinuity(analyze(fixture).analysis).status,
    "FAIL",
    "đoạn tli 1 cùng số không thay được",
  );

  const noHistory = checkWalContinuity(analyze(archive({ tli2From: 12, history: false })).analysis);
  assert.equal(noHistory.status, "FAIL");
  assert.match(noHistory.reason, /00000002\.history/);

  const branch = analyze(archive(), [base("b1", 2), base("b3", 10, 3)]).analysis;
  assert.match(branch.bases.find((b) => b.id === "b3")?.reason ?? "", /timeline/);
});

test("A6-AC02: pg_verifybackup — thiếu binary NOT_RUN, báo lỗi FAIL, không checksum NOT_RUN, đạt PASS", () => {
  const crc = readBackupManifest(manifestText(1, 2));
  const none = readBackupManifest(manifestText(1, 2, "NONE"));
  assert.equal(
    classifyVerifyBackup({ status: null, error: { code: "ENOENT" } }, crc).status,
    "NOT_RUN",
  );
  assert.equal(classifyVerifyBackup({ status: 1 }, crc).status, "FAIL");
  assert.equal(classifyVerifyBackup({ status: 0 }, none).status, "NOT_RUN");
  assert.equal(classifyVerifyBackup({ status: 0 }, crc).status, "PASS");
});

test("A6-AC05: RPO đo qua WAL replay — chỉ ở 'latest'; ≤5 phút PASS, vượt FAIL, mốc sai FAIL", () => {
  const latest = { kind: "latest" as const };
  assert.equal(
    rpoCheck({
      target: parseTarget("2026-10-07T00:00:00Z"),
      incidentMs: NOW,
      lastReplayedCommitMs: NOW,
    }).status,
    "NOT_RUN",
  );
  assert.equal(
    rpoCheck({ target: latest, incidentMs: NOW, lastReplayedCommitMs: null }).status,
    "NOT_RUN",
  );
  const pass = rpoCheck({ target: latest, incidentMs: NOW, lastReplayedCommitMs: NOW - 120_000 });
  assert.equal(pass.status, "PASS");
  assert.match(JSON.stringify(pass.actual), /sourceResolution/);
  assert.equal(
    rpoCheck({ target: latest, incidentMs: NOW, lastReplayedCommitMs: NOW - 301_000 }).status,
    "FAIL",
  );
  assert.equal(
    rpoCheck({ target: latest, incidentMs: NOW, lastReplayedCommitMs: NOW + 5_000 }).status,
    "FAIL",
  );
});

test("A6-FR08: RTO từ diễn tập chỉ là phần DB — không bao giờ PASS; vượt 60 phút FAIL", () => {
  assert.equal(rtoCheck(null).status, "NOT_RUN");
  const partial = rtoCheck(120);
  assert.equal(partial.status, "NOT_RUN");
  assert.match(partial.reason, /app sẵn sàng/);
  assert.equal(rtoCheck(D08_TARGETS.rtoSeconds + 1).status, "FAIL");
});

test("Mã thoát: 0 khi mọi mục PASS, 1 khi có FAIL, 2 khi chỉ còn NOT_RUN", () => {
  const item = (status: "PASS" | "FAIL" | "NOT_RUN") => ({
    name: "x",
    status,
    evidence: "infrastructure" as const,
    reason: "",
  });
  assert.equal(summarizePitr([item("PASS")]).exitCode, 0);
  assert.equal(summarizePitr([item("PASS")]).completePitrVerified, true);
  assert.equal(summarizePitr([item("PASS"), item("NOT_RUN"), item("FAIL")]).exitCode, 1);
  assert.equal(summarizePitr([item("PASS"), item("NOT_RUN")]).exitCode, 2);
  assert.equal(summarizePitr([]).completePitrVerified, false);
});

test("Log khôi phục được phân loại bằng câu tự viết, không lặp lại nội dung log", () => {
  const reason = classifyRecoveryLog(
    "FATAL:  recovery ended before configured recovery target was reached /secret/path",
  );
  assert.match(reason, /WAL kết thúc trước điểm đích/);
  assert.doesNotMatch(reason, /secret/);
  assert.match(
    classifyRecoveryLog("FATAL: requested recovery stop point is before consistent recovery point"),
    /nhất quán/,
  );
  assert.match(classifyRecoveryLog("lạ"), /postgres\.log/);
});

test("Khối wal đo từ archive hợp lệ với validator manifest v1 (không chứa secret)", () => {
  const coverage = walCoverageFromAnalysis(analyze(archive()).analysis)!;
  const sample = {
    formatVersion: "xboss-recovery-manifest/v1",
    recoverySetId: "20261008T000000Z-test",
    source: { identityHash: "0123456789abcdef", serverVersionNum: "160004" },
    startedAt: "2026-10-08T00:00:00Z",
    completedAt: "2026-10-08T00:00:01Z",
    postgres: { serverMajor: 16, tools: {} },
    appSha: null,
    baseBackupId: "b1",
    snapshot: { capturedAt: "2026-10-08T00:00:00Z", walLsn: null, timeline: null },
    wal: coverage,
    digestAlgorithm: "xboss-row-sha256-sorted-v1",
    migrations: [],
    tables: [],
    financeTotals: [],
    schemaObjects: { count: "0", digest: "0".repeat(64) },
    audit: { totalRows: "0", hashedRows: "0", maxId: null, lastRowHash: null },
    attachments: [],
    artifacts: [],
    encryptionKeyReference: null,
    measurements: null,
  };
  const parsed = parseRecoveryManifest(sample);
  assert.equal(parsed.kind, "v1");
  assert.deepEqual(parsed.kind === "v1" ? parsed.manifest.wal : null, coverage);
});
