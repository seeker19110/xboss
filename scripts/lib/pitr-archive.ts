// PITR (A6-FR02/FR04, QUALITY-FINAL-1/S14) — phân tích archive WAL + base backup, THUẦN.
//
// Đầu vào là danh sách tệp (tên/size/mtime) + nội dung tệp nhỏ (.history, .backup,
// backup_manifest) do caller đọc; module không chạm DB, không chạy tiến trình, không ghi gì.
// Phân loại PASS/FAIL/NOT_RUN từ kết quả phân tích nằm ở pitr-checks.ts.
//
// Nguyên tắc: thiếu dữ kiện thì NOT_RUN hoặc loại base backup khỏi cửa sổ (bảo thủ) — không
// suy diễn để PASS. Thời điểm cuối archive lấy từ mtime đoạn WAL: dùng cho archive lag và
// mép cửa sổ, KHÔNG dùng làm số đo RPO cấp giao dịch (A6-FR04).
import { createHash } from "node:crypto";
import type { WalCoverage } from "./recovery-manifest";

export const DEFAULT_WAL_SEGMENT_BYTES = 16 * 1024 * 1024;
const MAX_LISTED = 20;

// ---------------------------------------------------------------------------------------
// LSN + tên đoạn WAL
// ---------------------------------------------------------------------------------------

const LSN_TEXT = /^([0-9A-F]{1,8})\/([0-9A-F]{1,8})$/i;
const WAL_NAME = /^([0-9A-F]{8})([0-9A-F]{8})([0-9A-F]{8})$/;
const HISTORY_NAME = /^([0-9A-F]{8})\.history$/;
const BACKUP_HISTORY_NAME = /^[0-9A-F]{24}\.[0-9A-F]{8}\.backup$/;
const COMPRESSED_NAME = /^[0-9A-F]{24}(\.partial)?\.(gz|zst|lz4|bz2|xz)$/;
const PARTIAL_NAME = /^[0-9A-F]{24}\.partial$/;

export function parseLsn(text: string): bigint {
  const match = LSN_TEXT.exec(text.trim());
  if (!match) throw new Error("LSN không hợp lệ.");
  return (BigInt(`0x${match[1]}`) << 32n) + BigInt(`0x${match[2]}`);
}

export function formatLsn(value: bigint): string {
  const high = (value >> 32n).toString(16).toUpperCase();
  const low = (value & 0xffffffffn).toString(16).toUpperCase();
  return `${high}/${low}`;
}

function assertSegmentSize(segBytes: number): void {
  // PostgreSQL chỉ cho kích thước đoạn là luỹ thừa 2 trong [1MB, 1GB].
  const ok = Number.isInteger(segBytes) && segBytes >= 1 << 20 && segBytes <= 1 << 30;
  if (!ok || (segBytes & (segBytes - 1)) !== 0) throw new Error("Kích thước đoạn WAL sai.");
}

/** Số thứ tự đoạn WAL chứa LSN (vừa an toàn trong number: tối đa 2^44 đoạn 1MB). */
export function segmentOf(lsn: bigint, segBytes: number): number {
  assertSegmentSize(segBytes);
  return Number(lsn / BigInt(segBytes));
}

export function walFileName(tli: number, segNo: number, segBytes: number): string {
  assertSegmentSize(segBytes);
  const perId = 0x100000000 / segBytes;
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(8, "0");
  return `${hex(tli)}${hex(Math.floor(segNo / perId))}${hex(segNo % perId)}`;
}

export function parseWalFileName(
  name: string,
  segBytes: number,
): { tli: number; segNo: number } | null {
  assertSegmentSize(segBytes);
  const match = WAL_NAME.exec(name);
  if (!match) return null;
  const perId = 0x100000000 / segBytes;
  const tli = parseInt(match[1], 16);
  const low = parseInt(match[3], 16);
  if (tli < 1 || low >= perId) return null;
  return { tli, segNo: parseInt(match[2], 16) * perId + low };
}

// ---------------------------------------------------------------------------------------
// Tệp nhỏ trong archive: <tli>.history và <đoạn>.<offset>.backup
// ---------------------------------------------------------------------------------------

export type TimelineSwitch = { parentTli: number; switchLsn: bigint };

/** Dòng "parentTLI<TAB>switchLSN<TAB>lý do"; bỏ dòng trống/chú thích. Sai định dạng → ném. */
export function parseTimelineHistory(content: string): TimelineSwitch[] {
  const switches: TimelineSwitch[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [tli, lsn] = line.split(/\s+/);
    if (!/^\d+$/.test(tli ?? "") || !lsn) throw new Error("Tệp .history sai định dạng.");
    switches.push({ parentTli: Number(tli), switchLsn: parseLsn(lsn) });
  }
  return switches;
}

/**
 * Thời điểm PostgreSQL ghi trong backup_label/.backup ("2026-10-08 12:59:25 UTC", theo
 * log_timezone). Chỉ nhận UTC/GMT/Z hoặc lệch số (+07, +0700, -03:30); viết tắt kiểu "EDT"
 * mơ hồ → null (caller coi như không biết, không đoán).
 */
export function parsePgTimestamp(text: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (\S+)$/.exec(text.trim());
  if (!match) return null;
  const zone = match[3];
  let offset: string | null = null;
  if (/^(UTC|GMT|Z)$/i.test(zone)) offset = "Z";
  const numeric = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
  if (numeric) offset = `${numeric[1]}${numeric[2]}:${numeric[3] ?? "00"}`;
  if (!offset) return null;
  const ms = Date.parse(`${match[1]}T${match[2]}${offset}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export type BackupHistory = {
  startLsn: bigint;
  stopLsn: bigint;
  startTime: string | null;
  stopTime: string | null;
  startTli: number | null;
  stopTli: number | null;
};

export function parseBackupHistory(content: string): BackupHistory | null {
  const fields = new Map<string, string>();
  for (const line of content.split("\n")) {
    const index = line.indexOf(":");
    if (index > 0) fields.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  const lsnOf = (key: string) => {
    const value = fields.get(key)?.split(" ")[0];
    return value && LSN_TEXT.test(value) ? parseLsn(value) : null;
  };
  const startLsn = lsnOf("START WAL LOCATION");
  const stopLsn = lsnOf("STOP WAL LOCATION");
  if (startLsn === null || stopLsn === null) return null;
  const tliOf = (key: string) => {
    const value = fields.get(key);
    return value && /^\d+$/.test(value) ? Number(value) : null;
  };
  return {
    startLsn,
    stopLsn,
    startTime: parsePgTimestamp(fields.get("START TIME") ?? ""),
    stopTime: parsePgTimestamp(fields.get("STOP TIME") ?? ""),
    startTli: tliOf("START TIMELINE"),
    stopTli: tliOf("STOP TIMELINE"),
  };
}

// ---------------------------------------------------------------------------------------
// backup_manifest của pg_basebackup (PostgreSQL ≥ 13)
// ---------------------------------------------------------------------------------------

export type BackupManifestSummary = {
  ok: boolean;
  issue: string | null;
  startTli: number | null;
  endTli: number | null;
  startLsn: bigint | null;
  endLsn: bigint | null;
  totalBytes: number;
  fileCount: number;
  checksumAlgorithms: string[];
};

/**
 * Kiểm "Manifest-Checksum" (SHA-256 mọi byte tới hết dòng ngay trước khoá đó — cùng luật
 * pg_verifybackup) rồi đọc WAL-Ranges. Chỉ phát hiện manifest bị sửa/cụt; nội dung từng tệp
 * do pg_verifybackup kiểm.
 */
export function readBackupManifest(content: string): BackupManifestSummary {
  const failed = (issue: string): BackupManifestSummary => ({
    ok: false,
    issue,
    startTli: null,
    endTli: null,
    startLsn: null,
    endLsn: null,
    totalBytes: 0,
    fileCount: 0,
    checksumAlgorithms: [],
  });
  const index = content.lastIndexOf('\n"Manifest-Checksum"');
  if (index < 0) return failed("thiếu Manifest-Checksum");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return failed("JSON hỏng/cụt");
  }
  const record = parsed as Record<string, unknown>;
  const declared = record["Manifest-Checksum"];
  const actual = createHash("sha256")
    .update(content.slice(0, index + 1))
    .digest("hex");
  if (typeof declared !== "string" || declared.toLowerCase() !== actual) {
    return failed("Manifest-Checksum không khớp nội dung");
  }
  const ranges = record["WAL-Ranges"];
  const files = record.Files;
  if (!Array.isArray(ranges) || !ranges.length || !Array.isArray(files)) {
    return failed("thiếu WAL-Ranges/Files");
  }
  try {
    const first = ranges[0] as Record<string, unknown>;
    const last = ranges[ranges.length - 1] as Record<string, unknown>;
    let totalBytes = 0;
    const algorithms = new Set<string>();
    for (const file of files as Record<string, unknown>[]) {
      if (typeof file.Size !== "number") return failed("Files thiếu Size");
      totalBytes += file.Size;
      algorithms.add(
        typeof file["Checksum-Algorithm"] === "string" ? file["Checksum-Algorithm"] : "NONE",
      );
    }
    return {
      ok: true,
      issue: null,
      startTli: Number(first.Timeline),
      endTli: Number(last.Timeline),
      startLsn: parseLsn(String(first["Start-LSN"])),
      endLsn: parseLsn(String(last["End-LSN"])),
      totalBytes,
      fileCount: files.length,
      checksumAlgorithms: [...algorithms].sort(),
    };
  } catch {
    return failed("WAL-Ranges sai định dạng");
  }
}

// ---------------------------------------------------------------------------------------
// Quét archive
// ---------------------------------------------------------------------------------------

export type ArchiveEntry = { name: string; size: number; mtimeMs: number };
export type ArchiveScan = {
  segBytes: number;
  /** khoá `${tli}:${segNo}` */
  segments: Map<string, { size: number; mtimeMs: number }>;
  /** tli → các lần rẽ nhánh tổ tiên (nội dung <tli>.history); null = tệp hỏng */
  histories: Map<number, TimelineSwitch[] | null>;
  backupHistories: BackupHistory[];
  wrongSize: string[];
  compressed: number;
  partial: number;
  unknown: number;
  maxTli: number | null;
};

const segKey = (tli: number, segNo: number) => `${tli}:${segNo}`;

export function scanArchive(
  entries: readonly ArchiveEntry[],
  readSmallFile: (name: string) => string,
  segBytes = DEFAULT_WAL_SEGMENT_BYTES,
): ArchiveScan {
  const scan: ArchiveScan = {
    segBytes,
    segments: new Map(),
    histories: new Map(),
    backupHistories: [],
    wrongSize: [],
    compressed: 0,
    partial: 0,
    unknown: 0,
    maxTli: null,
  };
  const noteTli = (tli: number) => {
    scan.maxTli = scan.maxTli === null ? tli : Math.max(scan.maxTli, tli);
  };
  for (const entry of entries) {
    const wal = parseWalFileName(entry.name, segBytes);
    if (wal) {
      // Đoạn chưa nén phải đúng kích thước đoạn; khác là cụt/hỏng → không tính là có mặt.
      if (entry.size !== segBytes) scan.wrongSize.push(entry.name);
      else scan.segments.set(segKey(wal.tli, wal.segNo), entry);
      noteTli(wal.tli);
      continue;
    }
    const history = HISTORY_NAME.exec(entry.name);
    if (history) {
      const tli = parseInt(history[1], 16);
      noteTli(tli);
      try {
        scan.histories.set(tli, parseTimelineHistory(readSmallFile(entry.name)));
      } catch {
        scan.histories.set(tli, null);
      }
      continue;
    }
    if (BACKUP_HISTORY_NAME.test(entry.name)) {
      const parsed = parseBackupHistory(readSmallFile(entry.name));
      if (parsed) scan.backupHistories.push(parsed);
      else scan.unknown++;
      continue;
    }
    if (COMPRESSED_NAME.test(entry.name)) scan.compressed++;
    else if (PARTIAL_NAME.test(entry.name)) scan.partial++;
    else scan.unknown++;
  }
  return scan;
}

// ---------------------------------------------------------------------------------------
// Phân tích liên tục + cửa sổ PITR
// ---------------------------------------------------------------------------------------

export type BaseBackupInput = {
  id: string;
  format: "plain" | "tar" | "unknown";
  /** Có tệp tar ngoài base.tar/pg_wal.tar (tablespace) — chưa hỗ trợ diễn tập. */
  hasTablespaces: boolean;
  manifest: BackupManifestSummary;
};

export type BaseBackupState = BaseBackupInput & {
  startSeg: number | null;
  endSeg: number | null;
  stopTime: string | null;
  usable: boolean;
  reason: string;
};

export type PitrAnalysis = {
  segBytes: number;
  latestTli: number | null;
  /** Đường timeline từ gốc tới latestTli: tli + đoạn đầu tiên thuộc tli đó. */
  path: { tli: number; beginSeg: number }[] | null;
  pathIssue: string | null;
  endSeg: number | null;
  endTimeMs: number | null;
  missingCount: number;
  missingSample: string[];
  bases: BaseBackupState[];
  /** Base backup sớm nhất còn chuỗi WAL liên tục tới cuối archive và biết giờ kết thúc. */
  windowStartMs: number | null;
};

function timelinePath(
  scan: ArchiveScan,
  latestTli: number,
): { path: { tli: number; beginSeg: number }[] | null; issue: string | null } {
  if (latestTli === 1) return { path: [{ tli: 1, beginSeg: 0 }], issue: null };
  const history = scan.histories.get(latestTli);
  if (history === undefined) {
    return {
      path: null,
      issue: `thiếu tệp ${walFileName(latestTli, 0, scan.segBytes).slice(0, 8)}.history`,
    };
  }
  if (history === null) return { path: null, issue: "tệp .history hỏng" };
  const path: { tli: number; beginSeg: number }[] = [];
  let begin = 0;
  for (const item of history) {
    path.push({ tli: item.parentTli, beginSeg: begin });
    begin = segmentOf(item.switchLsn, scan.segBytes);
  }
  path.push({ tli: latestTli, beginSeg: begin });
  const ascending = path.every((item, i) => i === 0 || item.beginSeg >= path[i - 1].beginSeg);
  return ascending ? { path, issue: null } : { path: null, issue: "tệp .history có LSN lùi" };
}

/** Tli PostgreSQL sẽ đọc cho một đoạn: tli mới nhất trên đường có beginSeg ≤ segNo. */
function requiredTli(path: { tli: number; beginSeg: number }[], segNo: number): number {
  let tli = path[0].tli;
  for (const item of path) if (item.beginSeg <= segNo) tli = item.tli;
  return tli;
}

export function analyzePitr(scan: ArchiveScan, bases: readonly BaseBackupInput[]): PitrAnalysis {
  const segBytes = scan.segBytes;
  const empty: PitrAnalysis = {
    segBytes,
    latestTli: scan.maxTli,
    path: null,
    pathIssue: null,
    endSeg: null,
    endTimeMs: null,
    missingCount: 0,
    missingSample: [],
    bases: [],
    windowStartMs: null,
  };
  const stopTimes = new Map(scan.backupHistories.map((h) => [h.startLsn, h.stopTime]));
  const withSegments = (
    base: BaseBackupInput,
    usable: boolean,
    reason: string,
  ): BaseBackupState => ({
    ...base,
    startSeg: base.manifest.startLsn === null ? null : segmentOf(base.manifest.startLsn, segBytes),
    endSeg: base.manifest.endLsn === null ? null : segmentOf(base.manifest.endLsn, segBytes),
    stopTime:
      base.manifest.startLsn === null ? null : (stopTimes.get(base.manifest.startLsn) ?? null),
    usable,
    reason,
  });
  if (scan.maxTli === null) {
    return {
      ...empty,
      bases: bases.map((b) => withSegments(b, false, "archive không có đoạn WAL")),
    };
  }
  const { path, issue } = timelinePath(scan, scan.maxTli);
  if (!path) {
    return {
      ...empty,
      pathIssue: issue,
      bases: bases.map((b) => withSegments(b, false, "không dựng được đường timeline")),
    };
  }
  // Cuối archive = đoạn số lớn nhất trên đúng tli mà PostgreSQL sẽ đọc (bỏ nhánh bỏ dở).
  let endSeg: number | null = null;
  let endTimeMs: number | null = null;
  for (const [key, info] of scan.segments) {
    const [tli, segNo] = key.split(":").map(Number);
    if (requiredTli(path, segNo) !== tli) continue;
    if (endSeg === null || segNo > endSeg) {
      endSeg = segNo;
      endTimeMs = info.mtimeMs;
    }
  }
  const pathTlis = new Set(path.map((p) => p.tli));
  const states = bases.map((base) => {
    const m = base.manifest;
    if (!m.ok || m.startLsn === null || m.endLsn === null) {
      return withSegments(base, false, `backup_manifest không hợp lệ: ${m.issue ?? "thiếu"}`);
    }
    if (!pathTlis.has(m.startTli ?? -1) || !pathTlis.has(m.endTli ?? -1)) {
      return withSegments(base, false, "base backup ở timeline không thuộc nhánh hiện tại");
    }
    return withSegments(base, true, "");
  });
  const candidates = states.filter((b) => b.usable && b.startSeg !== null);
  const fromSeg = candidates.length ? Math.min(...candidates.map((b) => b.startSeg!)) : null;
  let missingCount = 0;
  let lastMissing = -1;
  const missingSample: string[] = [];
  if (fromSeg !== null && endSeg !== null) {
    for (let segNo = fromSeg; segNo <= endSeg; segNo++) {
      const tli = requiredTli(path, segNo);
      if (scan.segments.has(segKey(tli, segNo))) continue;
      missingCount++;
      lastMissing = segNo;
      if (missingSample.length < MAX_LISTED) missingSample.push(walFileName(tli, segNo, segBytes));
    }
  }
  for (const base of states) {
    if (!base.usable) continue;
    if (endSeg === null || base.endSeg! > endSeg) {
      Object.assign(base, {
        usable: false,
        reason: "archive kết thúc trước điểm nhất quán của base backup",
      });
    } else if (base.startSeg! <= lastMissing) {
      Object.assign(base, {
        usable: false,
        reason: "chuỗi WAL từ base backup tới cuối archive bị đứt",
      });
    }
  }
  const timed = states.filter((b) => b.usable && b.stopTime).map((b) => Date.parse(b.stopTime!));
  return {
    segBytes,
    latestTli: scan.maxTli,
    path,
    pathIssue: null,
    endSeg,
    endTimeMs,
    missingCount,
    missingSample,
    bases: states,
    windowStartMs: timed.length ? Math.min(...timed) : null,
  };
}

export type PitrTarget = { kind: "latest" } | { kind: "time"; iso: string };

export function parseTarget(raw: string | undefined): PitrTarget | null {
  if (!raw) return null;
  if (raw === "latest") return { kind: "latest" };
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
  if (!iso.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new Error("--target phải là 'latest' hoặc thời điểm ISO 8601 có múi giờ.");
  }
  return { kind: "time", iso: raw };
}

/** Khối `wal` của recovery manifest v1, đo từ archive thật (null khi chưa có cửa sổ). */
export function walCoverageFromAnalysis(analysis: PitrAnalysis): WalCoverage | null {
  const usable = analysis.bases.filter((b) => b.usable && b.stopTime);
  if (
    !usable.length ||
    analysis.endSeg === null ||
    analysis.endTimeMs === null ||
    analysis.latestTli === null
  ) {
    return null;
  }
  const earliest = usable.reduce((a, b) =>
    Date.parse(a.stopTime!) <= Date.parse(b.stopTime!) ? a : b,
  );
  return {
    timeline: analysis.latestTli,
    startLsn: formatLsn(earliest.manifest.startLsn!),
    endLsn: formatLsn(BigInt(analysis.endSeg + 1) * BigInt(analysis.segBytes)),
    windowStart: earliest.stopTime!,
    windowEnd: new Date(analysis.endTimeMs).toISOString(),
    // Theo định nghĩa "dùng được": không đoạn nào thiếu trong [windowStart, windowEnd].
    missingSegments: 0,
  };
}
