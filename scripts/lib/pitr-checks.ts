// PITR (A6-FR02/FR04/FR08, QUALITY-FINAL-1/S14) — phân loại kết quả phân tích archive
// (pitr-archive.ts) và số đo diễn tập thành hạng mục PASS/FAIL/NOT_RUN cùng dạng DrCheck của
// verifier khôi phục. THUẦN: không chạm DB/tệp/tiến trình. Mục tiêu so sánh là hằng D08 đóng
// băng (recovery-manifest.ts) — không đọc từ env/CLI để không ai hạ target lấy PASS.
import type { DrCheck } from "./dr-readonly";
import { D08_TARGETS } from "./recovery-manifest";
import {
  walFileName,
  type ArchiveScan,
  type BackupManifestSummary,
  type BaseBackupState,
  type PitrAnalysis,
  type PitrTarget,
} from "./pitr-archive";

/** A6-FR04: archive lag > 2 phút là cảnh báo; > mục tiêu RPO D08 (5 phút) là vi phạm. */
export const ARCHIVE_LAG_WARN_SECONDS = 120;
const DAY_MS = 24 * 3600 * 1000;
const MAX_LISTED = 20;

type Outcome = Omit<DrCheck, "name" | "evidence">;
const check = (name: string, outcome: Outcome): DrCheck => ({
  name,
  evidence: "infrastructure",
  ...outcome,
});

const limited = (items: string[]) =>
  items.length > MAX_LISTED
    ? [...items.slice(0, MAX_LISTED), `…+${items.length - MAX_LISTED}`]
    : items;

export function checkWalSegments(scan: ArchiveScan): DrCheck {
  if (scan.compressed) {
    return check("wal-segments", {
      status: "NOT_RUN",
      reason: `Archive có ${scan.compressed} đoạn nén — verifier chỉ đọc đoạn WAL chưa nén (archive_command dạng cp).`,
    });
  }
  if (scan.wrongSize.length) {
    return check("wal-segments", {
      status: "FAIL",
      reason: `${scan.wrongSize.length} đoạn WAL sai kích thước (cụt/hỏng); không tính là có mặt.`,
      expected: scan.segBytes,
      actual: limited(scan.wrongSize),
    });
  }
  if (!scan.segments.size) {
    return check("wal-segments", { status: "FAIL", reason: "Archive không có đoạn WAL nào." });
  }
  return check("wal-segments", {
    status: "PASS",
    reason: `${scan.segments.size} đoạn WAL đúng kích thước ${scan.segBytes} byte.`,
    actual: { partial: scan.partial, unknownFiles: scan.unknown },
  });
}

export function checkBaseBackupManifests(analysis: PitrAnalysis): DrCheck {
  if (!analysis.bases.length) {
    return check("base-backup-manifests", {
      status: "FAIL",
      reason: "Không tìm thấy base backup nào.",
    });
  }
  const broken = analysis.bases
    .filter((b) => !b.manifest.ok)
    .map((b) => `${b.id}: ${b.manifest.issue}`);
  return check("base-backup-manifests", {
    status: broken.length ? "FAIL" : "PASS",
    reason: broken.length
      ? `${broken.length} base backup có backup_manifest hỏng/thiếu/bị sửa.`
      : `${analysis.bases.length} base backup có backup_manifest nguyên vẹn.`,
    actual: broken.length ? limited(broken) : analysis.bases.length,
  });
}

export function checkWalContinuity(analysis: PitrAnalysis): DrCheck {
  if (analysis.pathIssue) {
    return check("wal-continuity", {
      status: "FAIL",
      reason: `Không dựng được đường timeline: ${analysis.pathIssue}.`,
    });
  }
  const usable = analysis.bases.filter((b) => b.usable);
  const detail = {
    timeline: analysis.latestTli,
    endSegment:
      analysis.endSeg === null || analysis.latestTli === null
        ? null
        : walFileName(analysis.latestTli, analysis.endSeg, analysis.segBytes),
    missingSegments: analysis.missingCount,
    missingSample: analysis.missingSample,
    usableBaseBackups: usable.map((b) => b.id),
    unusable: limited(analysis.bases.filter((b) => !b.usable).map((b) => `${b.id}: ${b.reason}`)),
  };
  if (!usable.length) {
    return check("wal-continuity", {
      status: "FAIL",
      reason: analysis.missingCount
        ? `WAL đứt ${analysis.missingCount} đoạn sau base backup mới nhất — không base backup nào phục hồi tới cuối archive.`
        : "Không base backup nào có chuỗi WAL liên tục tới cuối archive.",
      actual: detail,
    });
  }
  return check("wal-continuity", {
    status: "PASS",
    reason: analysis.missingCount
      ? `Chuỗi WAL liên tục từ ${usable.length} base backup tới cuối archive; ${analysis.missingCount} đoạn thiếu nằm trước các base backup đó (cửa sổ bị rút ngắn).`
      : `Chuỗi WAL liên tục từ ${usable.length} base backup tới cuối archive.`,
    actual: detail,
  });
}

export function checkPitrWindow(analysis: PitrAnalysis): DrCheck {
  if (analysis.windowStartMs === null || analysis.endTimeMs === null) {
    const unknownStop = analysis.bases.some((b) => b.usable && !b.stopTime);
    return check("pitr-window", {
      status: "FAIL",
      reason: unknownStop
        ? "Base backup dùng được nhưng không có tệp .backup (STOP TIME theo UTC/lệch số) trong archive — không xác định được mép cửa sổ."
        : "Không có base backup dùng được — cửa sổ PITR rỗng.",
      expected: { pitrWindowDays: D08_TARGETS.pitrWindowDays },
    });
  }
  const days = (analysis.endTimeMs - analysis.windowStartMs) / DAY_MS;
  const ok = days >= D08_TARGETS.pitrWindowDays;
  return check("pitr-window", {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? `Cửa sổ PITR liên tục ${days.toFixed(2)} ngày ≥ mục tiêu D08.`
      : `Cửa sổ PITR liên tục chỉ ${days.toFixed(2)} ngày < ${D08_TARGETS.pitrWindowDays} ngày (thiếu lịch sử, thiếu base backup trước mép cửa sổ hoặc WAL đứt).`,
    expected: { pitrWindowDays: D08_TARGETS.pitrWindowDays },
    actual: {
      windowStart: new Date(analysis.windowStartMs).toISOString(),
      windowEnd: new Date(analysis.endTimeMs).toISOString(),
      windowDays: Math.floor(days * 100) / 100,
    },
  });
}

export function checkArchiveLag(
  analysis: PitrAnalysis,
  nowMs: number,
): { check: DrCheck; warning: string | null } {
  if (analysis.endTimeMs === null) {
    return {
      check: check("archive-lag", {
        status: "FAIL",
        reason: "Archive không có đoạn WAL trên timeline hiện tại.",
      }),
      warning: null,
    };
  }
  const lagSeconds = Math.max(0, Math.round((nowMs - analysis.endTimeMs) / 1000));
  const base = {
    expected: { warnSeconds: ARCHIVE_LAG_WARN_SECONDS, maxSeconds: D08_TARGETS.rpoSeconds },
    actual: { lagSeconds, newestArchivedAt: new Date(analysis.endTimeMs).toISOString() },
  };
  if (lagSeconds > D08_TARGETS.rpoSeconds) {
    return {
      check: check("archive-lag", {
        status: "FAIL",
        reason: `Đoạn WAL mới nhất đã archive cách đây ${lagSeconds}s > ${D08_TARGETS.rpoSeconds}s (archive kẹt, hoặc nguồn rảnh không có canary).`,
        ...base,
      }),
      warning: null,
    };
  }
  const warning =
    lagSeconds > ARCHIVE_LAG_WARN_SECONDS
      ? `archive-lag ${lagSeconds}s vượt ngưỡng cảnh báo ${ARCHIVE_LAG_WARN_SECONDS}s`
      : null;
  return {
    check: check("archive-lag", {
      status: "PASS",
      reason: warning
        ? `CẢNH BÁO: archive lag ${lagSeconds}s > ${ARCHIVE_LAG_WARN_SECONDS}s (chưa vượt ${D08_TARGETS.rpoSeconds}s). Mốc mtime chỉ đo archive, không phải RPO giao dịch.`
        : `Archive lag ${lagSeconds}s ≤ ${ARCHIVE_LAG_WARN_SECONDS}s. Mốc mtime chỉ đo archive, không phải RPO giao dịch.`,
      ...base,
    }),
    warning,
  };
}

/**
 * Chọn base backup cho điểm đích và chặn đích sai TRƯỚC mọi thao tác ghi: đích trong tương lai,
 * trước điểm nhất quán của mọi base backup dùng được, hoặc sau đoạn WAL cuối đã archive.
 */
export function selectTarget(
  analysis: PitrAnalysis,
  target: PitrTarget | null,
  nowMs: number,
): { check: DrCheck; base: BaseBackupState | null } {
  if (!target) {
    return {
      check: check("pitr-target", {
        status: "NOT_RUN",
        reason: "Chưa chọn điểm khôi phục (--target).",
      }),
      base: null,
    };
  }
  const usable = analysis.bases.filter((b) => b.usable);
  if (target.kind === "latest") {
    const newest = usable.sort((a, b) => b.startSeg! - a.startSeg!)[0] ?? null;
    return {
      check: newest
        ? check("pitr-target", {
            status: "PASS",
            reason: "Đích 'latest': base backup mới nhất có WAL liên tục tới cuối archive.",
            actual: { baseBackupId: newest.id },
          })
        : check("pitr-target", {
            status: "FAIL",
            reason: "Không có base backup dùng được cho đích 'latest'.",
          }),
      base: newest,
    };
  }
  const targetMs = Date.parse(target.iso);
  const fail = (reason: string) => ({
    check: check("pitr-target", {
      status: "FAIL",
      reason: `Đích sai: ${reason}; dừng trước khi tạo dữ liệu đích.`,
      expected: {
        earliest:
          analysis.windowStartMs === null ? null : new Date(analysis.windowStartMs).toISOString(),
        latest: analysis.endTimeMs === null ? null : new Date(analysis.endTimeMs).toISOString(),
      },
      actual: target.iso,
    }),
    base: null,
  });
  if (targetMs > nowMs) return fail("thời điểm trong tương lai");
  if (analysis.endTimeMs === null || targetMs > analysis.endTimeMs) {
    return fail("sau đoạn WAL cuối đã archive");
  }
  const eligible = usable
    .filter((b) => b.stopTime && Date.parse(b.stopTime) <= targetMs)
    .sort((a, b) => Date.parse(b.stopTime!) - Date.parse(a.stopTime!));
  if (!eligible.length) return fail("trước điểm nhất quán của mọi base backup dùng được");
  return {
    check: check("pitr-target", {
      status: "PASS",
      reason: "Đích nằm trong cửa sổ có base backup + WAL liên tục.",
      actual: { target: new Date(targetMs).toISOString(), baseBackupId: eligible[0].id },
    }),
    base: eligible[0],
  };
}

// ---------------------------------------------------------------------------------------
// Phân loại kết quả công cụ + RPO/RTO + tổng hợp
// ---------------------------------------------------------------------------------------

export type ToolResult = { status: number | null; error?: { code?: string } | null };

/** pg_verifybackup: thiếu binary → NOT_RUN; thoát 0 → PASS; còn lại → FAIL (không in stderr). */
export function classifyVerifyBackup(result: ToolResult, manifest: BackupManifestSummary): Outcome {
  if (result.error) {
    return {
      status: "NOT_RUN",
      reason:
        result.error.code === "ENOENT"
          ? "Không có pg_verifybackup cùng phiên bản PostgreSQL — chưa kiểm được nội dung base backup."
          : "Không chạy được pg_verifybackup.",
    };
  }
  if (result.status !== 0) {
    return {
      status: "FAIL",
      reason:
        "pg_verifybackup báo base backup hỏng/thiếu tệp hoặc WAL cần cho điểm nhất quán không đọc được.",
    };
  }
  if (manifest.checksumAlgorithms.includes("NONE")) {
    return {
      status: "NOT_RUN",
      reason:
        "backup_manifest không có checksum nội dung (NONE) — chỉ kiểm được kích thước, chưa đủ chứng minh.",
    };
  }
  return {
    status: "PASS",
    reason: "pg_verifybackup xác nhận mọi tệp của base backup và WAL tới điểm nhất quán.",
    actual: { files: manifest.fileCount, checksum: manifest.checksumAlgorithms },
  };
}

export function rpoCheck(input: {
  target: PitrTarget | null;
  incidentMs: number;
  lastReplayedCommitMs: number | null;
}): DrCheck {
  if (input.target?.kind !== "latest") {
    return check("rpo", {
      status: "NOT_RUN",
      reason:
        "RPO chỉ đo được khi diễn tập khôi phục tới cuối archive (--target latest --drill-dir).",
    });
  }
  if (input.lastReplayedCommitMs === null) {
    return check("rpo", {
      status: "NOT_RUN",
      reason: "Không có mốc commit đã replay (chưa diễn tập hoặc WAL không có giao dịch/canary).",
    });
  }
  const seconds = Math.round((input.incidentMs - input.lastReplayedCommitMs) / 1000);
  const evidence = {
    expected: D08_TARGETS.rpoSeconds,
    actual: {
      rpoSeconds: seconds,
      incidentAt: new Date(input.incidentMs).toISOString(),
      lastReplayedCommitAt: new Date(input.lastReplayedCommitMs).toISOString(),
      sourceResolution:
        "commit cuối được replay (pg_last_xact_replay_timestamp) — cận trên; nguồn rảnh không có canary làm số đo lớn hơn thực",
    },
  };
  if (seconds < 0) {
    return check("rpo", {
      status: "FAIL",
      reason: "Mốc sự cố (--incident-at) trước commit cuối đã khôi phục — mốc đo sai.",
      ...evidence,
    });
  }
  const ok = seconds <= D08_TARGETS.rpoSeconds;
  return check("rpo", {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? `Dữ liệu mất tối đa ${seconds}s ≤ ${D08_TARGETS.rpoSeconds}s (đo cấp giao dịch qua WAL replay).`
      : `Dữ liệu mất tối đa ${seconds}s > ${D08_TARGETS.rpoSeconds}s; không hạ target để lấy PASS.`,
    ...evidence,
  });
}

/**
 * Diễn tập chỉ đo được phần DB (từ mốc sự cố tới DB khôi phục sẵn sàng) — RTO đầy đủ còn
 * gồm khởi động app + smoke/UAT. Vượt target ở phần DB → FAIL; còn lại NOT_RUN, không PASS.
 */
export function rtoCheck(dbReadySeconds: number | null): DrCheck {
  if (dbReadySeconds === null) {
    return check("rto", {
      status: "NOT_RUN",
      reason: "Chưa diễn tập khôi phục (--drill-dir) nên chưa có số đo.",
    });
  }
  const evidence = { expected: D08_TARGETS.rtoSeconds, actual: { dbReadySeconds } };
  return dbReadySeconds > D08_TARGETS.rtoSeconds
    ? check("rto", {
        status: "FAIL",
        reason: `Riêng phần khôi phục DB đã mất ${dbReadySeconds}s > ${D08_TARGETS.rtoSeconds}s; cần nâng năng lực recovery.`,
        ...evidence,
      })
    : check("rto", {
        status: "NOT_RUN",
        reason: `Phần DB mất ${dbReadySeconds}s; RTO đầy đủ còn cần thời điểm app sẵn sàng + smoke/UAT (ghi vào biên bản diễn tập).`,
        ...evidence,
      });
}

export function summarizePitr(results: readonly DrCheck[]) {
  const counts = { PASS: 0, FAIL: 0, NOT_RUN: 0 };
  for (const result of results) counts[result.status]++;
  return {
    completePitrVerified: results.length > 0 && counts.PASS === results.length,
    counts,
    // 0 = mọi hạng mục PASS; 1 = có FAIL; 2 = không FAIL nhưng còn NOT_RUN.
    exitCode: counts.FAIL ? 1 : counts.NOT_RUN ? 2 : 0,
  };
}
