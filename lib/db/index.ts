// DB layer dùng PostgreSQL (pg Pool) — cấu hình qua DATABASE_URL.
// Giữ nguyên API helper (query/queryOne/run) như bản SQLite cũ nhưng async;
// placeholder viết dạng `?` và được chuyển tự động sang $1..$n.
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, PoolClient, types } from "pg";
import { getServerEnv } from "@/lib/nen/env";
import { getRequestContext } from "@/lib/nen/request-context";
import { log } from "@/lib/nen/log";
import { listMigrationFiles } from "@/lib/db/migrate";

// DATE (oid 1082) → giữ nguyên chuỗi 'YYYY-MM-DD' (code so sánh ngày dạng chuỗi).
types.setTypeParser(1082, (v) => v);
// BIGINT (COUNT/SUM) và NUMERIC → number để frontend tính toán được.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => parseFloat(v));

const g = globalThis as unknown as {
  __xbossPool?: Pool;
  __xbossSchemaCompatible?: Promise<void>;
};

export class DatabaseSchemaNotReadyError extends Error {
  readonly code = "XBOSS_SCHEMA_NOT_READY";
  /** missing = chưa có/không đọc được schema_migrations; behind = còn migration chưa áp. */
  readonly reason: "missing" | "behind";

  constructor(message: string, options?: ErrorOptions & { reason?: "missing" | "behind" }) {
    super(message, options);
    this.reason = options?.reason ?? "missing";
    this.name = "DatabaseSchemaNotReadyError";
  }
}

// Transaction context: query/run/insertId tự dùng client này nếu đang trong withTransaction.
// Kèm "khung" ngữ cảnh đã gắn cho transaction (A1-AC04): chế độ chỉ-đọc, actor lúc BEGIN và
// phạm vi dự án (giá trị GUC app.project_id hiện hành) — lời gọi LỒNG đối chiếu với khung này
// để không âm thầm đổi actor/dự án hay nâng quyền giữa chừng transaction.
type TxFrame = {
  client: PoolClient;
  readOnly: boolean;
  actor: { userId?: number; role?: string; orgId?: number; projectId?: number };
  /** Giá trị app.project_id đã đặt: '' = chưa gắn dự án, '*' = liên dự án, 'N' = dự án N. */
  scope: string;
  /** Giá trị app.org_id đã đặt: '' = chưa gắn tổ chức, '*' = liên tổ chức, 'N' = tổ chức N. */
  orgScope: string;
};
const txStorage = new AsyncLocalStorage<TxFrame>();

// Schema DB được quản qua các file .sql đánh số trong migrations/ (chạy bởi runMigrations,
// xem lib/db/migrate.ts + docs/adr/0003-migrations.md). Không còn chuỗi SCHEMA inline ở đây.

// Đọc số nguyên từ env, clamp về [min, max]; giá trị thiếu/không hợp lệ → dùng mặc định.
// Không throw — cấu hình sai chỉ bị ghim về biên thay vì sập app (M53 PR3).
function envIntClamped(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = raw !== undefined ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function getPool(): Pool {
  if (!g.__xbossPool) {
    const env = getServerEnv();
    const url = env.DATABASE_URL;
    // Số connection tối đa trong pool — mặc định 10 (giữ nguyên hành vi cũ), chỉnh qua
    // XBOSS_PG_POOL_MAX khi cần scale (clamp 1–100 để tránh cấu hình sai làm cạn connection
    // Postgres phía server).
    const max = envIntClamped(env.XBOSS_PG_POOL_MAX, 10, 1, 100);
    // Chặn query treo vô hạn (khoá chết, quên WHERE...) — mặc định 30s, chỉnh qua
    // XBOSS_PG_STMT_TIMEOUT_MS (clamp 1s–5 phút). idle_in_transaction cố định 15s: transaction
    // mở rồi bỏ đó (quên COMMIT/ROLLBACK) sẽ tự bị Postgres đóng để không giữ khoá.
    const stmtTimeoutMs = envIntClamped(env.XBOSS_PG_STMT_TIMEOUT_MS, 30_000, 1_000, 300_000);
    g.__xbossPool = new Pool({
      connectionString: url,
      max,
      connectionTimeoutMillis: 10_000,
      // Chỉ bật trong test (tests/setup.ts đặt biến này). Mặc định `pg` giữ connection rỗi
      // thêm 10s, khiến mỗi tiến trình test treo ~10 giây sau khi đã chạy xong — nhân với
      // ~127 file chạm DB là ~21 phút chờ rỗng mỗi lần chạy full suite. Production KHÔNG
      // đặt biến này: server chạy dài hạn, giữ connection rỗi lại là điều mong muốn.
      allowExitOnIdle: process.env.XBOSS_PG_ALLOW_EXIT_ON_IDLE === "1",
      // TZ phiên = Asia/Ho_Chi_Minh — mọi CURRENT_DATE/NOW() trong SQL khớp múi giờ VN dùng
      // trong todayISO() (lib/nen/date.ts), tránh lệch 1 ngày lúc 0h–7h sáng VN khi Postgres
      // mặc định chạy UTC (L3, đợt audit 2026-09-22).
      options: `-c statement_timeout=${stmtTimeoutMs} -c idle_in_transaction_session_timeout=15000 -c timezone=Asia/Ho_Chi_Minh`,
    });
  }
  return g.__xbossPool;
}

// Số liệu quan trắc pool (M53 PR1) — dùng cho GET /api/health (chỉ trả cho Admin/PM).
// pool.totalCount/idleCount/waitingCount là API có sẵn của thư viện `pg`.
export function poolStats(): { total: number; idle: number; waiting: number } {
  const pool = getPool();
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

// Ngưỡng cảnh báo query chậm (ms) — env XBOSS_SLOW_QUERY_MS, mặc định 500, 0 = tắt hẳn.
// Đọc lại mỗi lần gọi (không cache) — parseServerEnv chỉ validate biến có mặt hay không
// (schema z.string().optional()), giá trị số áp mặc định ngay tại đây.
function slowQueryThresholdMs(): number {
  const raw = getServerEnv().XBOSS_SLOW_QUERY_MS;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 500;
}

// Đo thời gian 1 lượt gọi pg query thật (client.query hoặc pool.query) — cảnh báo nếu
// vượt ngưỡng. KHÔNG log params (tránh lộ dữ liệu nhạy cảm vào log).
async function timedPgQuery(
  exec: () => Promise<import("pg").QueryResult>,
  sql: string,
): Promise<import("pg").QueryResult> {
  const threshold = slowQueryThresholdMs();
  if (threshold <= 0) return exec();
  const startedAt = Date.now();
  try {
    return await exec();
  } finally {
    const durationMs = Date.now() - startedAt;
    if (durationMs > threshold) {
      log.warn("slow_query", { sql: sql.slice(0, 120), durationMs });
    }
  }
}

// Runtime chỉ xác minh marker đã áp đủ migration cần cho checkout hiện tại. Đây là
// SELECT thuần; schema thiếu/lỗi thời phải được xử lý bằng `npm run db:migrate` riêng.
function ensureSchemaCompatible(): Promise<void> {
  if (!g.__xbossSchemaCompatible) {
    g.__xbossSchemaCompatible = (async () => {
      let appliedNames: string[];
      try {
        const result = await getPool().query<{ name: string }>(
          "SELECT name FROM schema_migrations ORDER BY name",
        );
        appliedNames = result.rows.map((row) => row.name);
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "42P01" || code === "42501") {
          throw new DatabaseSchemaNotReadyError(
            "Database schema is missing or unreadable. Run `npm run db:migrate` with MIGRATE_DATABASE_URL before starting the app.",
            { cause: err, reason: "missing" },
          );
        }
        throw err;
      }

      const applied = new Set(appliedNames);
      const missing = listMigrationFiles().filter((name) => !applied.has(name));
      if (missing.length > 0) {
        const preview = missing.slice(0, 3).join(", ");
        const more = missing.length > 3 ? ` (+${missing.length - 3} more)` : "";
        throw new DatabaseSchemaNotReadyError(
          `Database schema is behind this app (${missing.length} migration(s) missing: ${preview}${more}). Run npm run db:migrate with MIGRATE_DATABASE_URL before starting the app.`,
          { reason: "behind" },
        );
      }
    })().catch((err) => {
      g.__xbossSchemaCompatible = undefined; // cho phép thử lại sau khi schema được cập nhật
      throw err;
    });
  }
  return g.__xbossSchemaCompatible;
}

// Readiness (Q-AC07): đi đúng đường ensureSchemaCompatible rồi chỉ SELECT đếm/đầu marker.
// Không migrate/seed/ghi. Schema thiếu/lỗi thời → ném DatabaseSchemaNotReadyError.
export async function checkSchemaReady(): Promise<{ applied: number; head: string | null }> {
  await ensureSchemaCompatible();
  const r = await getPool().query<{ applied: number; head: string | null }>(
    "SELECT COUNT(*)::int AS applied, MAX(name) AS head FROM schema_migrations",
  );
  return { applied: r.rows[0].applied, head: r.rows[0].head };
}

// Chuyển placeholder `?` → $1..$n (SQL trong codebase không chứa '?' trong literal).
const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

// S16 (RLS nghiêm ngặt, migration 0165): các bảng theo tổ chức (users, projects, suppliers…)
// KHÔNG còn nhánh "GUC rỗng → cho qua" — thiếu app.org_id là thấy 0 dòng. Câu lệnh chạy NGOÀI
// transaction của một request đã xác thực (getCurrentUser đã gắn orgId vào ngữ cảnh) được bọc
// trong 1 transaction ngắn có SET LOCAL app.org_id = tổ chức của actor, để đường đọc/ghi cũ
// không bị trả rỗng âm thầm. CHỈ đặt app.org_id (không đổi app.project_id/actor/vai trò của
// câu lệnh ngoài transaction như trước). Không có orgId trong ngữ cảnh (cron, đăng nhập, script)
// → chạy như cũ, GUC rỗng → bảng theo tổ chức trả rỗng: đường đó phải tự gọi withOrgScope.
// Dùng SET LOCAL (không set cấp phiên) để giữ tương thích PgBouncer transaction pooling (DEPLOY.md)
// và không để GUC của request này sống tiếp trên connection khi trả về pool.
function orgCuaNguCanh(): string | null {
  const orgId = getRequestContext()?.orgId;
  return orgId != null && Number.isSafeInteger(orgId) && orgId > 0 ? String(orgId) : null;
}

async function chayNgoaiGiaoDich(
  pgSql: string,
  params: unknown[],
  sql: string,
): Promise<import("pg").QueryResult> {
  const orgId = orgCuaNguCanh();
  if (orgId == null) return timedPgQuery(() => getPool().query(pgSql, params), sql);
  const client = await getPool().connect();
  let loiHuyKetNoi: Error | undefined;
  try {
    // BEGIN + set_config chung 1 lượt (giao thức simple query) — giá trị đã kiểm là số nguyên
    // dương ở orgCuaNguCanh và còn qua escapeLiteral, không có đường chèn chuỗi người dùng.
    await client.query(
      `BEGIN; SELECT set_config('app.org_id', ${client.escapeLiteral(orgId)}, true)`,
    );
    const r = await timedPgQuery(() => client.query(pgSql, params), sql);
    await client.query("COMMIT");
    return r;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      loiHuyKetNoi = rbErr instanceof Error ? rbErr : new Error(String(rbErr));
      log.error("rollback_failed", { error: loiHuyKetNoi.message });
    }
    throw err;
  } finally {
    client.release(loiHuyKetNoi);
  }
}

// Chạy 1 câu lệnh: trong withTransaction thì dùng client của transaction, ngoài thì qua
// chayNgoaiGiaoDich (tự gắn app.org_id của actor nếu có).
function thucThi(pgSql: string, params: unknown[], sql: string): Promise<import("pg").QueryResult> {
  const tx = txStorage.getStore()?.client;
  if (tx) return timedPgQuery(() => tx.query(pgSql, params), sql);
  return chayNgoaiGiaoDich(pgSql, params, sql);
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  await ensureSchemaCompatible();
  const r = await thucThi(toPg(sql), params, sql);
  return r.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await query<T>(sql, ...params);
  return rows[0];
}

export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  await ensureSchemaCompatible();
  const r = await thucThi(toPg(sql), params, sql);
  return { changes: r.rowCount ?? 0 };
}

// INSERT trả về id (thay cho lastInsertRowid của SQLite).
// Không append RETURNING id nếu SQL đã có sẵn (vd: INSERT ON CONFLICT ... RETURNING id).
export async function insertId(sql: string, ...params: unknown[]): Promise<number> {
  await ensureSchemaCompatible();
  const pgSql = toPg(sql);
  const needsReturning = !/returning\s+id\s*$/i.test(pgSql.trim());
  const finalSql = needsReturning ? pgSql + " RETURNING id" : pgSql;
  const r = await thucThi(finalSql, params, sql);
  return Number(r.rows[0].id);
}

/** Đang chạy bên trong withTransaction? Dùng cho helper BẮT BUỘC chung transaction với caller
 *  (vd khoá advisory xact của receipt offline — ngoài transaction khoá nhả ngay sau câu lệnh). */
export function dangTrongGiaoDich(): boolean {
  return txStorage.getStore() != null;
}

// A1-AC04 — lời gọi LỒNG chỉ được tái dùng transaction đang mở khi KHÔNG đổi ngữ cảnh đã gắn:
// cùng actor (user/vai trò/tổ chức/dự án của request lúc BEGIN), không đòi REPEATABLE READ mới,
// và không nâng transaction chỉ-đọc thành ghi. Vi phạm → throw (transaction ngoài ROLLBACK),
// không âm thầm chạy tiếp với ngữ cảnh sai. Trường lúc BEGIN chưa có (undefined) được phép có
// sau đó (getCurrentUser/getCurrentProjectId vá ngữ cảnh muộn) — chỉ chặn khi ĐỔI giá trị.
function kiemTraLoiGoiLong(
  frame: TxFrame,
  opts: { isolation?: "repeatable_read"; readOnly?: boolean },
  ham: string,
): void {
  if (opts.isolation === "repeatable_read")
    throw new Error(
      `${ham}: không thể yêu cầu REPEATABLE READ khi đang lồng trong transaction có sẵn`,
    );
  if (frame.readOnly && !opts.readOnly)
    throw new Error(`${ham}: không thể nâng transaction chỉ-đọc thành ghi trong lời gọi lồng`);
  const ctx = getRequestContext();
  for (const k of ["userId", "role", "orgId", "projectId"] as const) {
    if (frame.actor[k] !== undefined && ctx?.[k] !== frame.actor[k])
      throw new Error(`${ham}: lời gọi lồng mang ngữ cảnh actor/dự án khác transaction đang mở`);
  }
}

// Bọc nhiều thao tác ghi vào 1 transaction — COMMIT khi fn thành công, ROLLBACK khi throw.
// Mọi query/run/insertId bên trong fn tự dùng cùng client (qua AsyncLocalStorage).
// Reentrant: gọi lồng bên trong 1 withTransaction khác (vd recomputePackage tự bọc
// nhưng được recomputeTask gọi từ trong transaction của route) tái dùng luôn client hiện
// có thay vì mở connection/transaction thứ 2 — tránh treo (2 client cùng chờ khoá nhau).
// Lời gọi lồng phải qua kiemTraLoiGoiLong (cùng actor, không nâng chỉ-đọc → ghi).
// opts.isolation = "repeatable_read": mở transaction MỚI bằng BEGIN ISOLATION LEVEL REPEATABLE
// READ (phải nằm ngay trong BEGIN — set_config chạy sau BEGIN khiến SET TRANSACTION ISOLATION
// lỗi) để mọi câu đọc trong fn thấy cùng 1 snapshot. Lồng trong transaction có sẵn mà đòi
// repeatable_read → throw (fail-fast, không lặng lẽ mất đảm bảo nhất quán).
export async function withTransaction<T>(
  fn: () => Promise<T>,
  opts?: { isolation?: "repeatable_read"; readOnly?: boolean },
): Promise<T> {
  const repeatableRead = opts?.isolation === "repeatable_read";
  const frameNgoai = txStorage.getStore();
  if (frameNgoai) {
    kiemTraLoiGoiLong(frameNgoai, opts ?? {}, "withTransaction");
    return fn();
  }
  await ensureSchemaCompatible();
  const client = await getPool().connect();
  // Lỗi khi ROLLBACK (mất kết nối, timeout…) → huỷ hẳn connection thay vì trả về pool: một
  // connection chưa chắc đã thoát transaction có thể mang GUC app.* (SET LOCAL) của request này
  // sang request sau (A1-AC04).
  let loiHuyKetNoi: Error | undefined;
  try {
    // Mọi tuỳ chọn (isolation/READ ONLY) nằm ngay trong câu BEGIN — không SET TRANSACTION
    // sau đó, để chế độ đọc-chỉ có hiệu lực từ câu lệnh đầu tiên (A4-FR06).
    await client.query(
      "BEGIN" +
        (repeatableRead ? " ISOLATION LEVEL REPEATABLE READ" : "") +
        (opts?.readOnly ? " READ ONLY" : ""),
    );
    // Truyền ngữ cảnh actor xuống Postgres qua SET LOCAL (set_config ..., true) để trigger
    // audit (migration 0049) ghi được ai/vai trò/dự án/request-id. Tự hết hạn khi COMMIT/
    // ROLLBACK; giá trị thiếu truyền '' (trigger dùng NULLIF để chuyển về NULL).
    const ctx = getRequestContext();
    if (ctx) {
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
                set_config('app.project_id', $3, true), set_config('app.request_id', $4, true),
                set_config('app.org_id', $5, true)`,
        [
          ctx.userId != null ? String(ctx.userId) : "",
          ctx.role ?? "",
          ctx.projectId != null ? String(ctx.projectId) : "",
          ctx.requestId ?? "",
          ctx.orgId != null ? String(ctx.orgId) : "",
        ],
      );
    }
    // Chụp giá trị (không giữ tham chiếu) — patchRequestContext sửa tại chỗ object ngữ cảnh.
    const frame: TxFrame = {
      client,
      readOnly: !!opts?.readOnly,
      actor: {
        userId: ctx?.userId ?? undefined,
        role: ctx?.role || undefined,
        orgId: ctx?.orgId ?? undefined,
        projectId: ctx?.projectId ?? undefined,
      },
      scope: ctx?.projectId != null ? String(ctx.projectId) : "",
      orgScope: ctx?.orgId != null ? String(ctx.orgId) : "",
    };
    const result = await txStorage.run(frame, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      loiHuyKetNoi = rbErr instanceof Error ? rbErr : new Error(String(rbErr));
      log.error("rollback_failed", { error: loiHuyKetNoi.message });
    }
    throw err;
  } finally {
    client.release(loiHuyKetNoi);
  }
}

// Bọc đường ĐỌC (GET) nhóm bảng tài chính trong 1 transaction read-only có đặt GUC
// app.project_id — lưới an toàn RLS (migration 0069) chỉ áp được khi GUC tồn tại; đọc
// ngoài transaction (như trước PR2) không có GUC nên rơi vào nhánh "chuyển tiếp" của
// policy. Tái dùng nguyên `withTransaction` (không viết cơ chế set GUC mới): mở transaction,
// set_config LOCAL rồi chạy fn, COMMIT khi xong (BEGIN ... READ ONLY vì chỉ đọc).
// projectId = '*' cho ngữ cảnh cross-project hợp lệ (portfolio/cron/export toàn cục).
// opts.readOnly (mặc định true — giữ nguyên hành vi cũ) chỉ chặn ghi bằng BEGIN ... READ ONLY; đặt false cho route đọc-xen-ghi (vd notifications: đọc bảng phạm vi RLS rồi
// INSERT/DELETE bảng notifications không-RLS trong cùng 1 transaction).
export async function withProjectScope<T>(
  projectId: number | "*",
  fn: () => Promise<T>,
  opts?: { readOnly?: boolean; isolation?: "repeatable_read" },
): Promise<T> {
  const readOnly = opts?.readOnly ?? true;
  const scope = String(projectId);
  // Lồng bên trong 1 withProjectScope/withTransaction khác (vd hàm đọc gọi lại chính nó,
  // hoặc 1 hàm ghi gọi 1 hàm đọc nội bộ trước khi ghi) tái dùng transaction hiện có — CHỈ
  // đặt READ ONLY (trong BEGIN) khi ĐANG MỞ transaction mới (client này thật sự chạy BEGIN).
  // Postgres không cho hạ READ ONLY về READ WRITE giữa chừng: nếu lời gọi lồng bên trong
  // (mặc định readOnly=true vì là đọc) tự đặt READ ONLY trên transaction cha ĐANG GHI, mọi
  // câu lệnh ghi sau đó trong transaction cha sẽ lỗi "cannot execute ... in a read-only
  // transaction" dù bản thân transaction cha gọi với readOnly:false.
  // A1-AC04: lời gọi lồng phải CÙNG phạm vi dự án với transaction đang mở. Transaction chưa
  // gắn dự án (GUC rỗng — mở ngoài ngữ cảnh dự án) được gắn đúng 1 lần; đã gắn rồi thì mọi
  // phạm vi khác (dự án khác, '*' ↔ dự án) đều bị từ chối — GUC SET LOCAL sống tới hết
  // transaction nên đổi giữa chừng sẽ áp nhầm cho cả phần còn lại của transaction ngoài.
  const frameNgoai = txStorage.getStore();
  if (frameNgoai) {
    kiemTraLoiGoiLong(frameNgoai, { isolation: opts?.isolation, readOnly }, "withProjectScope");
    if (frameNgoai.scope === scope) return fn();
    if (frameNgoai.scope !== "")
      throw new Error(
        `withProjectScope: lời gọi lồng đổi phạm vi dự án ('${frameNgoai.scope}' → '${scope}') bị từ chối`,
      );
    // Gán khung TRƯỚC khi await để lời gọi lồng chạy song song (Promise.all) thấy ngay.
    frameNgoai.scope = scope;
    await frameNgoai.client.query(`SELECT set_config('app.project_id', $1, true)`, [scope]);
    return fn();
  }
  return withTransaction(
    async () => {
      const frame = txStorage.getStore();
      if (!frame) throw new Error("withProjectScope: thiếu transaction client (không thể xảy ra)");
      frame.scope = scope;
      await frame.client.query(`SELECT set_config('app.project_id', $1, true)`, [scope]);
      return fn();
    },
    { isolation: opts?.isolation, readOnly },
  );
}

// S16 — cùng khuôn withProjectScope nhưng cho GUC app.org_id (RLS các bảng theo tổ chức,
// migration 0165 đã bỏ nhánh "GUC rỗng → cho qua"). Dùng cho đường CHƯA có actor trong ngữ cảnh
// (đăng nhập, cron bằng CRON_SECRET, route công khai, script): orgId = tổ chức cụ thể, hoặc '*'
// khi THẬT SỰ cần liên tổ chức (vd tra tài khoản theo email lúc đăng nhập — chưa biết org). '*'
// chỉ do server đặt tường minh, không bao giờ lấy từ đầu vào client. Lồng trong transaction đã
// gắn tổ chức khác → throw (không nâng từ 1 org lên '*' hay đổi org giữa chừng).
export async function withOrgScope<T>(
  orgId: number | "*",
  fn: () => Promise<T>,
  opts?: { readOnly?: boolean },
): Promise<T> {
  if (orgId !== "*" && !(Number.isSafeInteger(orgId) && orgId > 0))
    throw new Error(`withOrgScope: tổ chức không hợp lệ (${String(orgId)})`);
  const readOnly = opts?.readOnly ?? true;
  const scope = String(orgId);
  const datPhamVi = async (frame: TxFrame) => {
    frame.orgScope = scope;
    await frame.client.query(`SELECT set_config('app.org_id', $1, true)`, [scope]);
  };
  const frameNgoai = txStorage.getStore();
  if (frameNgoai) {
    kiemTraLoiGoiLong(frameNgoai, { readOnly }, "withOrgScope");
    if (frameNgoai.orgScope === scope) return fn();
    if (frameNgoai.orgScope !== "")
      throw new Error(
        `withOrgScope: lời gọi lồng đổi phạm vi tổ chức ('${frameNgoai.orgScope}' → '${scope}') bị từ chối`,
      );
    await datPhamVi(frameNgoai);
    return fn();
  }
  // Ngoài transaction nhưng request đã xác thực (ngữ cảnh có orgId): chỉ được dùng đúng org đó —
  // không nâng lên '*' hay đổi org (cùng bất biến với nhánh lồng ở trên; '*' chỉ dành cho đường
  // CHƯA có actor: đăng nhập, cron bằng secret, script).
  const orgNguCanh = getRequestContext()?.orgId;
  if (orgNguCanh != null && String(orgNguCanh) !== scope)
    throw new Error(
      `withOrgScope: request đã thuộc tổ chức '${String(orgNguCanh)}' không được đổi phạm vi sang '${scope}'`,
    );
  return withTransaction(
    async () => {
      const frame = txStorage.getStore();
      if (!frame) throw new Error("withOrgScope: thiếu transaction client (không thể xảy ra)");
      await datPhamVi(frame);
      return fn();
    },
    { readOnly },
  );
}

// todayISO/daysFromTodayISO chuyển sang lib/date.ts (thuần, không phụ thuộc pg)
// để dùng lại được ở client — re-export ở đây cho code server hiện có.
export { todayISO, daysFromTodayISO } from "@/lib/nen/date";
