// Chính sách retention evidence DR/PITR + thư mục diễn tập run-* (M130, A6-AC06).
// Không chạm DB. Logic quyết định là hàm thuần; phần đĩa chỉ đọc lstat/readdir và xoá đúng 2 mẫu:
// tệp `.json` trong evidence-dir, thư mục `run-*` trong drill-dir. Mặc định dry-run.
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

export const RUN_DIR_PATTERN = /^run-[0-9A-Za-z_-]+$/;
export const DEFAULT_WAL_DIR = "/srv/xboss-wal";
const DAY_MS = 86_400_000;

export type Outcome = "PASS" | "FAIL";
export type ItemKind = "evidence" | "drill-run";
export type Verdict = "keep" | "delete" | "skip";

export type RetentionOptions = {
  evidenceDir: string;
  drillDir: string | null;
  apply: boolean;
  json: boolean;
  evidencePassDays: number;
  evidenceFailDays: number;
  drillPassDays: number;
  drillFailDays: number;
  forceRuns: string[];
  nowMs: number;
};

export type RetentionItem = {
  path: string;
  kind: ItemKind;
  ageDays: number;
  verdict: Verdict;
  reason: string;
  bytes: number;
};

export class RetentionArgError extends Error {}

/** PASS chỉ khi JSON parse được và cờ tổng hợp của verify-dr-restore/verify-pitr === true. */
export function classifyEvidence(text: string): {
  outcome: Outcome;
  timestampMs: number | null;
  drillRunDir: string | null;
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { outcome: "FAIL", timestampMs: null, drillRunDir: null };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { outcome: "FAIL", timestampMs: null, drillRunDir: null };
  }
  const rec = data as Record<string, unknown>;
  const pass = rec.completeDrVerified === true || rec.completePitrVerified === true;
  const stamp = typeof rec.completedAt === "string" ? Date.parse(rec.completedAt) : NaN;
  const run = typeof rec.drillRunDir === "string" && RUN_DIR_PATTERN.test(rec.drillRunDir);
  return {
    outcome: pass ? "PASS" : "FAIL",
    timestampMs: Number.isFinite(stamp) ? stamp : null,
    drillRunDir: run ? (rec.drillRunDir as string) : null,
  };
}

export function decide(
  kind: ItemKind,
  outcome: Outcome,
  ageDays: number,
  opts: Pick<
    RetentionOptions,
    "evidencePassDays" | "evidenceFailDays" | "drillPassDays" | "drillFailDays"
  >,
  forced = false,
): { verdict: "keep" | "delete"; reason: string } {
  if (forced) return { verdict: "delete", reason: "ép xoá sớm theo --force-run" };
  const limit =
    kind === "evidence"
      ? outcome === "PASS"
        ? opts.evidencePassDays
        : opts.evidenceFailDays
      : outcome === "PASS"
        ? opts.drillPassDays
        : opts.drillFailDays;
  const label = `${outcome} ${ageDays.toFixed(1)} ngày / ngưỡng ${limit} ngày`;
  return ageDays > limit
    ? { verdict: "delete", reason: `quá hạn giữ (${label})` }
    : { verdict: "keep", reason: `còn trong hạn giữ (${label})` };
}

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Trả lý do từ chối nếu thư mục nguy hiểm, null nếu an toàn. */
export function dangerousDirReason(dir: string, protectedDirs: readonly string[]): string | null {
  const target = real(dir);
  if (target === resolve("/")) return "là thư mục gốc /";
  if (target === real(homedir())) return "là thư mục HOME";
  for (const guarded of protectedDirs) {
    if (isInside(target, real(guarded))) return `trùng/nằm trong thư mục được bảo vệ ${guarded}`;
  }
  return null;
}

const VALUE_FLAGS = [
  "--evidence-dir",
  "--drill-dir",
  "--evidence-pass-days",
  "--evidence-fail-days",
  "--drill-pass-days",
  "--drill-fail-days",
  "--force-run",
  "--now",
] as const;

export function parseRetentionArgs(
  argv: readonly string[],
  defaultNowMs: number,
): RetentionOptions {
  const values = new Map<string, string[]>();
  let apply = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--apply") apply = true;
    else if (flag === "--json") json = true;
    else if ((VALUE_FLAGS as readonly string[]).includes(flag)) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw new RetentionArgError(`Cờ ${flag} thiếu giá trị.`);
      const list = values.get(flag) ?? [];
      if (list.length && flag !== "--force-run")
        throw new RetentionArgError(`Cờ ${flag} chỉ 1 lần.`);
      values.set(flag, [...list, value]);
    } else throw new RetentionArgError(`Cờ không hợp lệ: ${flag ?? ""}`);
  }
  const days = (flag: string, fallback: number): number => {
    const raw = values.get(flag)?.[0];
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new RetentionArgError(`${flag} phải là số ngày ≥ 0.`);
    return n;
  };
  const evidenceDir = values.get("--evidence-dir")?.[0];
  if (!evidenceDir) throw new RetentionArgError("Thiếu --evidence-dir <thư mục>.");
  const forceRuns = values.get("--force-run") ?? [];
  for (const id of forceRuns) {
    if (!RUN_DIR_PATTERN.test(id)) throw new RetentionArgError(`--force-run không hợp lệ: ${id}`);
  }
  const drillDir = values.get("--drill-dir")?.[0] ?? null;
  if (forceRuns.length && !drillDir) throw new RetentionArgError("--force-run cần --drill-dir.");
  const nowRaw = values.get("--now")?.[0];
  const nowMs = nowRaw === undefined ? defaultNowMs : Date.parse(nowRaw);
  if (!Number.isFinite(nowMs)) throw new RetentionArgError("--now phải là ISO hợp lệ.");
  return {
    evidenceDir,
    drillDir,
    apply,
    json,
    evidencePassDays: days("--evidence-pass-days", 35),
    evidenceFailDays: days("--evidence-fail-days", 365),
    drillPassDays: days("--drill-pass-days", 7),
    drillFailDays: days("--drill-fail-days", 35),
    forceRuns,
    nowMs,
  };
}

function dirBytes(path: string): number {
  let total = 0;
  for (const name of readdirSync(path)) {
    const st = lstatSync(join(path, name));
    if (st.isDirectory()) total += dirBytes(join(path, name));
    else total += st.size; // symlink tính kích thước chính liên kết, không theo liên kết
  }
  return total;
}

function ageOf(nowMs: number, stampMs: number): number {
  return Math.max(0, (nowMs - stampMs) / DAY_MS);
}

/** Lập kế hoạch (chỉ đọc đĩa). Evidence quét trước để suy kết quả PASS/FAIL của run-* qua `drillRunDir`. */
export function planRetention(opts: RetentionOptions): {
  items: RetentionItem[];
  warnings: string[];
} {
  const items: RetentionItem[] = [];
  const warnings: string[] = [];
  const runOutcome = new Map<string, Outcome>();

  for (const name of readdirSync(opts.evidenceDir).sort()) {
    const path = join(opts.evidenceDir, name);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) {
      warnings.push(`Bỏ qua symlink: ${path}`);
      continue;
    }
    if (!st.isFile() || !name.endsWith(".json")) continue;
    const info = classifyEvidence(readFileSync(path, "utf8"));
    if (info.drillRunDir) runOutcome.set(info.drillRunDir, info.outcome);
    const ageDays = ageOf(opts.nowMs, info.timestampMs ?? st.mtimeMs);
    items.push({
      path,
      kind: "evidence",
      ageDays,
      bytes: st.size,
      ...decide("evidence", info.outcome, ageDays, opts),
    });
  }

  if (opts.drillDir) {
    for (const name of readdirSync(opts.drillDir).sort()) {
      if (!RUN_DIR_PATTERN.test(name)) continue;
      const path = join(opts.drillDir, name);
      const st = lstatSync(path);
      if (st.isSymbolicLink()) {
        warnings.push(`Bỏ qua symlink: ${path}`);
        continue;
      }
      if (!st.isDirectory()) continue;
      // Thư mục run-* không có tệp kết quả riêng: lấy PASS từ evidence JSON trỏ tới nó, không có → FAIL.
      const outcome = runOutcome.get(name) ?? "FAIL";
      const ageDays = ageOf(opts.nowMs, st.mtimeMs);
      items.push({
        path,
        kind: "drill-run",
        ageDays,
        bytes: dirBytes(path),
        ...decide("drill-run", outcome, ageDays, opts, opts.forceRuns.includes(name)),
      });
    }
    for (const id of opts.forceRuns) {
      if (!items.some((item) => item.kind === "drill-run" && item.path.endsWith(sep + id))) {
        warnings.push(`--force-run ${id}: không tìm thấy thư mục (hoặc là symlink).`);
      }
    }
  }
  return { items, warnings };
}

/** Xoá đúng các mục verdict=delete. Idempotent: mục đã mất thì bỏ qua. */
export function applyRetention(items: readonly RetentionItem[]): {
  files: number;
  dirs: number;
  bytes: number;
} {
  const done = { files: 0, dirs: 0, bytes: 0 };
  for (const item of items) {
    if (item.verdict !== "delete" || !existsSync(item.path)) continue;
    if (item.kind === "evidence") {
      if (!lstatSync(item.path).isFile()) continue;
      unlinkSync(item.path);
      done.files++;
    } else {
      if (!lstatSync(item.path).isDirectory()) continue;
      rmSync(item.path, { recursive: true });
      done.dirs++;
    }
    done.bytes += item.bytes;
  }
  return done;
}

/** Chạy toàn bộ; trả exit code (0 ok, 2 tham số sai/thư mục nguy hiểm). */
export function runRetention(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  log: (line: string) => void,
  nowMs: number = Date.now(),
): number {
  let opts: RetentionOptions;
  try {
    opts = parseRetentionArgs(argv, nowMs);
    const protectedDirs = [env.BACKUP_DIR || "backups", DEFAULT_WAL_DIR];
    for (const dir of [opts.evidenceDir, opts.drillDir]) {
      if (!dir) continue;
      if (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
        throw new RetentionArgError(`Không phải thư mục: ${dir}`);
      }
      const reason = dangerousDirReason(dir, protectedDirs);
      if (reason) throw new RetentionArgError(`Từ chối ${dir}: ${reason}.`);
    }
  } catch (error) {
    if (!(error instanceof RetentionArgError)) throw error;
    log(`Lỗi: ${error.message}`);
    return 2;
  }

  const { items, warnings } = planRetention(opts);
  const toDelete = items.filter((item) => item.verdict === "delete");
  const bytes = toDelete.reduce((sum, item) => sum + item.bytes, 0);
  const summary = {
    total: items.length,
    toDelete: toDelete.length,
    toKeep: items.length - toDelete.length,
    bytes,
  };
  if (opts.json) {
    log(JSON.stringify({ dryRun: !opts.apply, items, warnings, summary }, null, 2));
  } else {
    log(
      opts.apply
        ? "== retention-cleanup: ÁP DỤNG (xoá thật) =="
        : "== retention-cleanup: DRY-RUN (không xoá) ==",
    );
    for (const w of warnings) log(`CẢNH BÁO: ${w}`);
    for (const item of items) {
      log(
        `${item.verdict === "delete" ? "XOÁ" : "GIỮ"}\t${item.kind}\t${item.ageDays.toFixed(1)}d\t${item.bytes}B\t${item.path}\t${item.reason}`,
      );
    }
    log(
      `Tổng: ${summary.total} mục, xoá ${summary.toDelete}, giữ ${summary.toKeep}, giải phóng ${bytes} byte.`,
    );
  }
  if (opts.apply) {
    const done = applyRetention(items);
    if (opts.json) log(JSON.stringify({ applied: done }));
    else log(`Đã xoá ${done.files} tệp evidence, ${done.dirs} thư mục run-*, ${done.bytes} byte.`);
  } else if (!opts.json) {
    log("Chưa xoá gì. Đọc danh sách rồi chạy lại với --apply để xoá.");
  }
  return 0;
}
