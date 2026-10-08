// Diễn tập PITR vào PostgreSQL disposable (A6-FR06, QUALITY-FINAL-1/S14).
//
// Chép base backup sang thư mục diễn tập mới, kiểm bản chép bằng pg_verifybackup, rồi khởi
// động `postgres` ở chế độ khôi phục với cấu hình CÁCH LY truyền qua argv (không qua shell):
//   - không TCP (listen_addresses=''), socket Unix trong thư mục riêng mode 0700;
//   - archive_mode=off, archive_cleanup_command='' (không bao giờ xoá WAL ở kho archive thật),
//     primary_conninfo='' (không stream từ production), shared_preload_libraries='' (không
//     nạp extension có thể gọi ra ngoài), ssl=off;
//   - restore_command chỉ `cp` TỪ archive (đọc), không ghi ngược.
// Đích thời điểm: recovery.signal + recovery_target_action=pause → dừng đúng điểm, không
// promote. Đích 'latest': standby.signal → replay tới hết archive rồi đứng chờ, không promote.
// App/cron/email/Telegram/webhook không chạy trong diễn tập (chỉ có tiến trình postgres).
//
// Preflight chặn TRƯỚC mọi thao tác ghi: marker disposable, quyền thư mục, chồng lấn với
// archive/base backup, cluster đang chạy, tài khoản root, thiếu binary.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chownSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, sep } from "node:path";
import { Client } from "pg";
import type { DrCheck } from "./dr-readonly";
import type { MigrationFact } from "./recovery-manifest";
import { parseLsn, segmentOf, type BaseBackupState, type PitrTarget } from "./pitr-archive";
import { classifyVerifyBackup, type ToolResult } from "./pitr-checks";

export type DrillOwner = { uid: number; gid: number };
type Outcome = Omit<DrCheck, "name" | "evidence">;
const check = (name: string, outcome: Outcome): DrCheck => ({
  name,
  evidence: "infrastructure",
  ...outcome,
});

export const DRILL_MARKER_FILE = "XBOSS_DISPOSABLE";
const MARKER_PATTERN = /^xboss-disposable:[A-Za-z0-9_-]{16,}$/;
// restore_command do PostgreSQL chạy qua shell → đường dẫn archive chỉ nhận ký tự an toàn.
const SHELL_SAFE_PATH = /^\/[A-Za-z0-9._/-]+$/;
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const DRILL_PORT = 5432; // chỉ là tên socket trong thư mục riêng, không mở cổng TCP
const POLL_MS = 500;
const CAUGHT_UP_STABLE_MS = 3_000;
const STALLED_MS = 20_000;
const HOT_STANDBY_PARAMS: Record<string, string> = {
  "max_connections setting": "max_connections",
  "max_worker_processes setting": "max_worker_processes",
  "max_wal_senders setting": "max_wal_senders",
  "max_prepared_xacts setting": "max_prepared_transactions",
  "max_locks_per_xact setting": "max_locks_per_transaction",
};

export type DrillOptions = {
  drillDir: string;
  /** Giá trị env PITR_DRILL_MARKER — phải khớp tệp XBOSS_DISPOSABLE trong drillDir. */
  expectedMarker: string | undefined;
  archiveDir: string;
  baseBackupsDir: string;
  base: BaseBackupState;
  target: PitrTarget;
  /** Đoạn WAL cuối của archive (trên timeline hiện tại) — dùng biết lúc replay đã đuổi kịp. */
  endSeg: number;
  segBytes: number;
  database: string;
  user: string;
  binDir: string | null;
  /** Tiến trình hiện tại là root mà không có owner riêng → postgres từ chối chạy. */
  isRoot: boolean;
  /** Chạy tiến trình PostgreSQL + sở hữu tệp diễn tập dưới uid/gid này (chỉ khi caller là root). */
  owner?: DrillOwner;
  timeoutSeconds: number;
  keep: boolean;
  repoMigrations: readonly MigrationFact[];
};

export type DrillResult = {
  checks: DrCheck[];
  /** Mốc DB khôi phục sẵn sàng + kiểm xong (ms epoch); null khi không tới được. */
  dbReadyMs: number | null;
  lastReplayedCommitMs: number | null;
  replay: { lsn: string; timeline: number | null; inRecovery: boolean } | null;
  runDirName: string | null;
  kept: boolean;
};

export const DRILL_CHECKS = [
  "drill-preflight",
  "base-backup-integrity",
  "drill-restore",
  "drill-isolation",
  "drill-replay-point",
  "drill-migrations",
] as const;

/** Mọi hạng mục diễn tập ở cùng một trạng thái (vd NOT_RUN khi không diễn tập). */
export function drillSkipped(reason: string, status: "NOT_RUN" | "FAIL" = "NOT_RUN"): DrCheck[] {
  return DRILL_CHECKS.map((name) => check(name, { status, reason }));
}

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/** Thư mục binary PostgreSQL: env → /usr/lib/postgresql/<major>/bin → PATH. */
export function resolvePgBinDir(major: string | null, explicit: string | undefined): string | null {
  if (explicit) return explicit;
  if (major && existsSync(`/usr/lib/postgresql/${major}/bin/postgres`)) {
    return `/usr/lib/postgresql/${major}/bin`;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir && existsSync(join(dir, "postgres"))) return dir;
  }
  return null;
}

export function preflightDrill(options: DrillOptions): Outcome {
  const fail = (reason: string): Outcome => ({
    status: "FAIL",
    reason: `${reason}; dừng trước khi ghi.`,
  });
  const notRun = (reason: string): Outcome => ({ status: "NOT_RUN", reason });
  if (!options.expectedMarker || !MARKER_PATTERN.test(options.expectedMarker)) {
    return fail("Thiếu/sai PITR_DRILL_MARKER (dạng xboss-disposable:<token ≥16 ký tự>)");
  }
  let info;
  try {
    info = lstatSync(options.drillDir);
  } catch {
    return fail("Thư mục diễn tập không tồn tại");
  }
  if (!info.isDirectory()) return fail("Thư mục diễn tập không phải thư mục thật (symlink?)");
  const expectedUid = options.owner?.uid ?? process.getuid?.() ?? -1;
  if (info.uid !== expectedUid || (info.mode & 0o077) !== 0) {
    return fail("Thư mục diễn tập phải thuộc user chạy PostgreSQL và mode 0700");
  }
  let marker = "";
  try {
    marker = readFileSync(join(options.drillDir, DRILL_MARKER_FILE), "utf8").trim();
  } catch {
    // marker rỗng → không khớp bên dưới
  }
  if (marker !== options.expectedMarker) {
    return fail(
      `Thiếu tệp ${DRILL_MARKER_FILE} hoặc marker không khớp — đích không được xác nhận disposable`,
    );
  }
  if (
    existsSync(join(options.drillDir, "postmaster.pid")) ||
    existsSync(join(options.drillDir, "PG_VERSION"))
  ) {
    return fail("Thư mục diễn tập là data directory của một cluster");
  }
  const drill = realpathSync(options.drillDir);
  let archive = "";
  try {
    archive = realpathSync(options.archiveDir);
    for (const real of [archive, realpathSync(options.baseBackupsDir)]) {
      if (isInside(drill, real) || isInside(real, drill)) {
        return fail("Thư mục diễn tập chồng lấn kho archive/base backup");
      }
    }
  } catch {
    return fail("Không đọc được đường dẫn archive/base backup");
  }
  if (!SHELL_SAFE_PATH.test(archive)) {
    return fail(
      "Đường dẫn archive có ký tự không an toàn cho restore_command (chỉ nhận /A-Za-z0-9._-)",
    );
  }
  if (!IDENT.test(options.database) || !IDENT.test(options.user)) {
    return fail("--drill-database/--drill-user phải là định danh PostgreSQL thường");
  }
  if (options.base.format === "unknown") return fail("Base backup không phải định dạng plain/tar");
  if (options.base.hasTablespaces)
    return notRun("Base backup có tablespace riêng — diễn tập chưa hỗ trợ.");
  if (options.isRoot && !options.owner)
    return notRun("PostgreSQL không chạy dưới root — chạy diễn tập bằng user hệ thống riêng.");
  if (!options.binDir) return notRun("Không tìm thấy binary PostgreSQL (đặt PITR_PG_BIN_DIR).");
  for (const tool of ["postgres", "pg_verifybackup", "pg_controldata"]) {
    if (!existsSync(join(options.binDir, tool)))
      return notRun(`Thiếu binary ${tool} trong thư mục PostgreSQL.`);
  }
  return {
    status: "PASS",
    reason: "Marker disposable khớp, thư mục riêng 0700, không chồng lấn kho backup, đủ binary.",
  };
}

type Exec = { owner?: DrillOwner };

function run(exec: Exec, cmd: string, args: string[]): ToolResult & { stdout: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    ...(exec.owner ?? {}),
  });
  return {
    status: result.status,
    error: result.error ? { code: (result.error as NodeJS.ErrnoException).code } : null,
    stdout: result.stdout ?? "",
  };
}

function own(exec: Exec, path: string): void {
  if (exec.owner) chownSync(path, exec.owner.uid, exec.owner.gid);
}

function writeOwned(exec: Exec, path: string, content: string): void {
  writeFileSync(path, content, { flag: "wx", mode: 0o600 });
  own(exec, path);
}

/** pg_verifybackup trên một thư mục data (bản gốc plain hoặc bản chép trong diễn tập). */
export function verifyBaseBackup(
  binDir: string | null,
  exec: Exec,
  dataDir: string,
  manifestPath: string,
  archiveDir: string,
): ToolResult {
  if (!binDir) return { status: null, error: { code: "ENOENT" } };
  return run(exec, join(binDir, "pg_verifybackup"), [
    "-q",
    "-m",
    manifestPath,
    "-w",
    archiveDir,
    dataDir,
  ]);
}

function readLogTail(path: string): string {
  try {
    const size = statSync(path).size;
    const length = Math.min(size, 64 * 1024);
    const buffer = Buffer.alloc(length);
    const fd = openSync(path, "r");
    try {
      readSync(fd, buffer, 0, length, size - length);
    } finally {
      closeSync(fd);
    }
    return buffer.toString("utf8");
  } catch {
    return "";
  }
}

/** Phân loại lý do dừng từ log PostgreSQL — chỉ trả câu tự viết, không lặp lại nội dung log. */
export function classifyRecoveryLog(log: string): string {
  const rules: [RegExp, string][] = [
    [
      /recovery ended before configured recovery target was reached/,
      "WAL kết thúc trước điểm đích (thiếu đoạn WAL hoặc đích sau điểm cuối archive)",
    ],
    [/before consistent recovery point/, "Điểm đích trước điểm nhất quán của base backup"],
    [
      /(could not locate|invalid) (a valid |required )?checkpoint|could not find redo location/,
      "Không đọc được checkpoint của base backup (thiếu WAL đầu hoặc backup hỏng)",
    ],
    [
      /insufficient parameter settings|hot standby is not possible/,
      "Tham số hot standby thấp hơn nguồn",
    ],
    [
      /incorrect (resource manager data )?checksum|invalid magic number|invalid record length|contrecord/,
      "WAL hỏng",
    ],
    [/could not open file .*backup_label|invalid data in file "backup_label"/, "backup_label hỏng"],
    [
      /requested timeline \d+ is not a child|is not in this server's history/,
      "Timeline không khớp lịch sử",
    ],
  ];
  for (const [pattern, reason] of rules) if (pattern.test(log)) return reason;
  return "PostgreSQL dừng/không sẵn sàng khi khôi phục — xem postgres.log trong thư mục diễn tập";
}

function controlParams(exec: Exec, binDir: string, dataDir: string): string[] {
  const output = run(exec, join(binDir, "pg_controldata"), [dataDir]).stdout;
  const args: string[] = [];
  for (const line of output.split("\n")) {
    const index = line.indexOf(":");
    const name = HOT_STANDBY_PARAMS[line.slice(0, index).trim()];
    const value = line.slice(index + 1).trim();
    if (index > 0 && name && /^\d+$/.test(value)) args.push("-c", `${name}=${value}`);
  }
  return args;
}

function postgresMajor(exec: Exec, binDir: string): string | null {
  const match = /\(PostgreSQL\) (\d+)/.exec(
    run(exec, join(binDir, "postgres"), ["--version"]).stdout,
  );
  return match ? match[1] : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Server = { child: ChildProcess; exited: () => boolean };

function startServer(exec: Exec, binDir: string, args: string[], logPath: string): Server {
  const fd = openSync(logPath, "wx", 0o600);
  own(exec, logPath);
  let done = false;
  const child = spawn(join(binDir, "postgres"), args, {
    stdio: ["ignore", fd, fd],
    ...(exec.owner ?? {}),
  });
  closeSync(fd);
  child.on("exit", () => {
    done = true;
  });
  child.on("error", () => {
    done = true;
  });
  return { child, exited: () => done };
}

async function stopServer(server: Server): Promise<void> {
  if (server.exited()) return;
  server.child.kill("SIGINT"); // fast shutdown
  for (let waited = 0; waited < 60_000 && !server.exited(); waited += POLL_MS) await sleep(POLL_MS);
  if (!server.exited()) server.child.kill("SIGQUIT");
}

function errorCode(error: unknown): string {
  return (error as { code?: string } | null)?.code ?? "";
}

async function connect(sockDir: string, options: DrillOptions): Promise<Client> {
  const client = new Client({
    host: sockDir,
    port: DRILL_PORT,
    user: options.user,
    database: options.database,
    connectionTimeoutMillis: 5_000,
    options: "-c default_transaction_read_only=on -c statement_timeout=60000",
  });
  await client.connect();
  return client;
}

class DrillError extends Error {}

async function waitReady(
  server: Server,
  sockDir: string,
  options: DrillOptions,
  deadline: number,
): Promise<Client> {
  for (;;) {
    if (server.exited()) throw new DrillError("exited");
    if (Date.now() > deadline)
      throw new DrillError("Hết thời gian chờ PostgreSQL khôi phục tới điểm nhất quán.");
    try {
      return await connect(sockDir, options);
    } catch (error) {
      const code = errorCode(error);
      if (code === "3D000" || code === "28000") {
        throw new DrillError(
          "Bản khôi phục không có database/role chỉ định (--drill-database/--drill-user).",
        );
      }
      // 57P03 = đang khởi động/khôi phục; ENOENT/ECONNREFUSED = socket chưa có.
      await sleep(POLL_MS);
    }
  }
}

async function waitTarget(
  client: Client,
  server: Server,
  options: DrillOptions,
  deadline: number,
): Promise<void> {
  let lastLsn = "";
  let lastChange = Date.now();
  for (;;) {
    if (server.exited()) throw new DrillError("exited");
    if (Date.now() > deadline) throw new DrillError("Hết thời gian chờ replay tới điểm đích.");
    let row;
    try {
      ({
        rows: [row],
      } = await client.query(
        "SELECT pg_get_wal_replay_pause_state() AS pause, pg_last_wal_replay_lsn()::text AS lsn",
      ));
    } catch {
      throw new DrillError("exited");
    }
    if (options.target.kind === "time") {
      if (row?.pause === "paused") return;
    } else {
      const lsn = String(row?.lsn ?? "");
      if (lsn !== lastLsn) {
        lastLsn = lsn;
        lastChange = Date.now();
      }
      const idle = Date.now() - lastChange;
      const segment = lsn ? segmentOf(parseLsn(lsn), options.segBytes) : -1;
      if (segment >= options.endSeg && idle >= CAUGHT_UP_STABLE_MS) return;
      if (segment < options.endSeg && idle >= STALLED_MS) {
        throw new DrillError("Replay dừng trước đoạn WAL cuối của archive (WAL đứt/hỏng).");
      }
    }
    await sleep(POLL_MS);
  }
}

function recoveryArgs(
  options: DrillOptions,
  paths: { conf: string; hba: string; ident: string; sock: string; data: string; archive: string },
): string[] {
  const settings: Record<string, string> = {
    config_file: paths.conf,
    hba_file: paths.hba,
    ident_file: paths.ident,
    listen_addresses: "",
    port: String(DRILL_PORT),
    unix_socket_directories: paths.sock,
    unix_socket_permissions: "0700",
    ssl: "off",
    archive_mode: "off",
    archive_command: "",
    archive_cleanup_command: "",
    recovery_end_command: "",
    primary_conninfo: "",
    primary_slot_name: "",
    restore_command: `cp "${paths.archive}/%f" "%p"`,
    shared_preload_libraries: "",
    shared_buffers: "128MB",
    huge_pages: "off",
    hot_standby: "on",
    recovery_target_timeline: "latest",
    wal_retrieve_retry_interval: "1s",
    logging_collector: "off",
    cluster_name: "xboss_pitr_drill",
  };
  if (options.target.kind === "time") {
    // Dạng lệch số "+00": lúc khởi động PostgreSQL chưa nạp bảng viết tắt múi giờ nên "Z" bị từ chối.
    settings.recovery_target_time = new Date(Date.parse(options.target.iso))
      .toISOString()
      .replace("T", " ")
      .replace("Z", "+00");
    settings.recovery_target_action = "pause";
    settings.recovery_target_inclusive = "on";
  }
  return [
    "-D",
    paths.data,
    ...Object.entries(settings).flatMap(([key, value]) => ["-c", `${key}=${value}`]),
  ];
}

async function isolationCheck(client: Client): Promise<DrCheck> {
  let rows;
  try {
    ({ rows } = await client.query(
      `SELECT current_setting('listen_addresses') AS listen, current_setting('archive_mode') AS archive,
            current_setting('archive_cleanup_command') AS cleanup, current_setting('primary_conninfo') AS primary,
            current_setting('shared_preload_libraries') AS preload, pg_is_in_recovery() AS recovery`,
    ));
  } catch (error) {
    if (errorCode(error) !== "42501") throw error;
    return check("drill-isolation", {
      status: "NOT_RUN",
      reason:
        "Role diễn tập không đọc được primary_conninfo/archive_cleanup_command — cấp pg_read_all_settings (vd pg_monitor) hoặc dùng role quản trị của bản sao.",
    });
  }
  const row = rows[0] ?? {};
  const ok =
    row.listen === "" &&
    row.archive === "off" &&
    row.cleanup === "" &&
    row.primary === "" &&
    row.preload === "" &&
    row.recovery === true;
  return check("drill-isolation", {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? "Đích không mở TCP, không archive/xoá WAL, không nối primary, không nạp extension, vẫn ở chế độ khôi phục chỉ-đọc."
      : "Cấu hình cách ly của đích không như kỳ vọng — có nguy cơ tác dụng phụ ra ngoài.",
    actual: ok
      ? undefined
      : { listenTcp: row.listen !== "", archive: row.archive, recovery: row.recovery },
  });
}

async function migrationsCheck(client: Client, repo: readonly MigrationFact[]): Promise<DrCheck> {
  try {
    const { rows } = await client.query("SELECT name FROM schema_migrations ORDER BY name ASC");
    const applied = new Set(rows.map((row) => String(row.name)));
    const expected = repo.map((m) => m.name);
    const missing = expected.filter((name) => !applied.has(name));
    const extra = [...applied].filter((name) => !expected.includes(name));
    const ok = !missing.length && !extra.length;
    return check("drill-migrations", {
      status: ok ? "PASS" : "FAIL",
      reason: ok
        ? `${expected.length} migration của bản khôi phục khớp mã nguồn đang dùng (không tự migrate).`
        : `Bản khôi phục lệch mã nguồn: thiếu ${missing.length}, thừa ${extra.length} migration — dùng đúng app SHA của snapshot.`,
      expected: expected.length,
      actual: ok ? applied.size : { missing: missing.slice(0, 20), extra: extra.slice(0, 20) },
    });
  } catch {
    return check("drill-migrations", {
      status: "FAIL",
      reason: "Bản khôi phục không đọc được schema_migrations.",
    });
  }
}

export async function runPitrDrill(options: DrillOptions): Promise<DrillResult> {
  const result: DrillResult = {
    checks: [],
    dbReadyMs: null,
    lastReplayedCommitMs: null,
    replay: null,
    runDirName: null,
    kept: false,
  };
  const preflight = preflightDrill(options);
  if (preflight.status !== "PASS") {
    return {
      ...result,
      checks: [
        check("drill-preflight", preflight),
        ...drillSkipped("Preflight chưa đạt — không tạo gì.").slice(1),
      ],
    };
  }
  const exec: Exec = { owner: options.owner };
  const binDir = options.binDir!;
  const runDirName = `run-${new Date().toISOString().replace(/[-:.]/g, "")}-${randomBytes(4).toString("hex")}`;
  const runDir = join(options.drillDir, runDirName);
  const paths = {
    data: join(runDir, "data"),
    sock: join(runDir, "s"),
    conf: join(runDir, "pitr.conf"),
    hba: join(runDir, "pitr_hba.conf"),
    ident: join(runDir, "pitr_ident.conf"),
    log: join(runDir, "postgres.log"),
    archive: realpathSync(options.archiveDir),
  };
  const baseDir = join(options.baseBackupsDir, options.base.id);
  const checks: DrCheck[] = [check("drill-preflight", preflight)];
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  let server: Server | null = null;
  let client: Client | null = null;
  const pending = new Set<string>(DRILL_CHECKS.slice(1));
  const push = (item: DrCheck) => {
    checks.push(item);
    pending.delete(item.name);
  };
  try {
    for (const dir of [runDir, paths.data, paths.sock]) {
      mkdirSync(dir, { mode: 0o700 });
      own(exec, dir);
    }
    // Chép/giải nén base backup bằng tiến trình con (không shell) dưới đúng user PostgreSQL.
    const copy =
      options.base.format === "plain"
        ? run(exec, "cp", ["-R", "-p", `${baseDir}/.`, `${paths.data}/`])
        : run(exec, "tar", [
            existsSync(join(baseDir, "base.tar.gz")) ? "-xzf" : "-xf",
            join(baseDir, existsSync(join(baseDir, "base.tar.gz")) ? "base.tar.gz" : "base.tar"),
            "-C",
            paths.data,
          ]);
    if (copy.status !== 0) {
      push(
        check("drill-restore", {
          status: "FAIL",
          reason: "Không chép/giải nén được base backup vào thư mục diễn tập.",
        }),
      );
      return finish();
    }
    const verify = verifyBaseBackup(
      binDir,
      exec,
      paths.data,
      join(baseDir, "backup_manifest"),
      paths.archive,
    );
    push(check("base-backup-integrity", classifyVerifyBackup(verify, options.base.manifest)));
    if (verify.status !== 0) {
      push(
        check("drill-restore", {
          status: "FAIL",
          reason: "Base backup không qua pg_verifybackup — không khởi động khôi phục.",
        }),
      );
      return finish();
    }
    const major = readFileSync(join(paths.data, "PG_VERSION"), "utf8").trim();
    if (postgresMajor(exec, binDir) !== major) {
      push(
        check("drill-restore", {
          status: "NOT_RUN",
          reason: `Cần binary PostgreSQL ${major} cho base backup này (đặt PITR_PG_BIN_DIR).`,
        }),
      );
      return finish();
    }
    writeOwned(
      exec,
      join(paths.data, options.target.kind === "time" ? "recovery.signal" : "standby.signal"),
      "",
    );
    writeOwned(exec, paths.conf, "# Cấu hình diễn tập PITR XBoss — mọi tham số truyền qua argv.\n");
    writeOwned(exec, paths.hba, "local all all trust\n");
    writeOwned(exec, paths.ident, "");
    const args = [...recoveryArgs(options, paths), ...controlParams(exec, binDir, paths.data)];
    server = startServer(exec, binDir, args, paths.log);
    try {
      client = await waitReady(server, paths.sock, options, deadline);
      await waitTarget(client, server, options, deadline);
    } catch (error) {
      const reason =
        error instanceof DrillError && error.message !== "exited"
          ? error.message
          : classifyRecoveryLog(readLogTail(paths.log));
      push(check("drill-restore", { status: "FAIL", reason }));
      return finish();
    }
    const { rows } = await client.query(
      `SELECT pg_is_in_recovery() AS in_recovery, pg_last_wal_replay_lsn()::text AS lsn,
              pg_last_xact_replay_timestamp() AS last_commit,
              (SELECT timeline_id FROM pg_control_checkpoint()) AS tli`,
    );
    const row = rows[0] ?? {};
    const lastCommit = row.last_commit instanceof Date ? row.last_commit.getTime() : null;
    result.replay = {
      lsn: String(row.lsn ?? ""),
      timeline: typeof row.tli === "number" ? row.tli : null,
      inRecovery: row.in_recovery === true,
    };
    push(
      check("drill-restore", {
        status: "PASS",
        reason:
          options.target.kind === "time"
            ? "PostgreSQL disposable khôi phục và dừng (pause) đúng điểm đích."
            : "PostgreSQL disposable replay hết archive và đứng ở chế độ standby (không promote).",
        actual: {
          baseBackupId: options.base.id,
          replayLsn: result.replay.lsn,
          timeline: result.replay.timeline,
        },
      }),
    );
    push(await isolationCheck(client));
    const targetMs = options.target.kind === "time" ? Date.parse(options.target.iso) : null;
    const overshoot = targetMs !== null && lastCommit !== null && lastCommit > targetMs;
    push(
      check("drill-replay-point", {
        status: overshoot || lastCommit === null ? "FAIL" : "PASS",
        reason: overshoot
          ? "Commit cuối được replay SAU điểm đích — khôi phục vượt đích."
          : lastCommit === null
            ? "Không có commit nào được replay — không chứng minh được điểm khôi phục."
            : "Commit cuối được replay không vượt điểm đích.",
        expected: options.target.kind === "time" ? options.target.iso : "latest",
        actual: {
          lastReplayedCommitAt: lastCommit === null ? null : new Date(lastCommit).toISOString(),
          replayLsn: result.replay.lsn,
        },
      }),
    );
    // Mốc commit chỉ dùng đo RPO khi điểm khôi phục đã được chứng minh đúng.
    if (!overshoot) result.lastReplayedCommitMs = lastCommit;
    push(await migrationsCheck(client, options.repoMigrations));
    result.dbReadyMs = Date.now();
    return finish();
  } catch (error) {
    // Gán lỗi cho bước đang dở: trước khi khôi phục xong là drill-restore, sau đó là mục kiểm
    // chưa có kết quả đầu tiên — không tạo mục trùng tên.
    push(
      check(pending.has("drill-restore") ? "drill-restore" : ([...pending][0] ?? "drill-restore"), {
        status: "FAIL",
        reason: `Lỗi khi diễn tập (${errorCode(error) || "không rõ"}); giữ thư mục để điều tra.`,
      }),
    );
    return finish();
  }

  async function finish(): Promise<DrillResult> {
    if (client) await client.end().catch(() => undefined);
    if (server) await stopServer(server);
    for (const name of pending)
      checks.push(
        check(name, {
          status: "NOT_RUN",
          reason: "Không tới được bước này (bước trước thất bại).",
        }),
      );
    const order = new Map<string, number>(DRILL_CHECKS.map((name, i) => [name, i]));
    checks.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
    const allPass = checks.every((item) => item.status === "PASS");
    // A6-AC06: thất bại thì GIỮ thư mục (log + data) làm bằng chứng; chỉ dọn khi PASS và
    // không yêu cầu giữ. Chỉ xoá đúng thư mục run-* do lần chạy này tạo.
    const kept = !allPass || options.keep;
    if (!kept && existsSync(runDir) && readdirSync(options.drillDir).includes(runDirName)) {
      rmSync(runDir, { recursive: true, force: true });
    }
    return { ...result, checks, runDirName, kept: kept && existsSync(runDir) };
  }
}
