// DB layer dùng PostgreSQL (pg Pool) — cấu hình qua DATABASE_URL.
// Giữ nguyên API helper (query/queryOne/run) như bản SQLite cũ nhưng async;
// placeholder viết dạng `?` và được chuyển tự động sang $1..$n.
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, PoolClient, types } from "pg";
import { getServerEnv } from "@/lib/env";
import { getRequestContext } from "@/lib/request-context";
import { log } from "@/lib/log";
import { runMigrations } from "./migrate";

// DATE (oid 1082) → giữ nguyên chuỗi 'YYYY-MM-DD' (code so sánh ngày dạng chuỗi).
types.setTypeParser(1082, (v) => v);
// BIGINT (COUNT/SUM) và NUMERIC → number để frontend tính toán được.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => parseFloat(v));

const g = globalThis as unknown as { __xbossPool?: Pool; __xbossSchemaReady?: Promise<unknown> };

// Transaction context: query/run/insertId tự dùng client này nếu đang trong withTransaction.
const txStorage = new AsyncLocalStorage<PoolClient>();

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
      options: `-c statement_timeout=${stmtTimeoutMs} -c idle_in_transaction_session_timeout=15000`,
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

// Tự áp migration 1 lần mỗi process khi query đầu tiên chạy. runMigrations dùng
// advisory lock nên nhiều process/instance chạy song song vẫn an toàn (không còn phải
// bắt lỗi race 23505/42P07 như bản chạy chuỗi SCHEMA trực tiếp).
function ensureSchema(): Promise<unknown> {
  if (!g.__xbossSchemaReady) {
    g.__xbossSchemaReady = runMigrations(getPool()).catch((err) => {
      g.__xbossSchemaReady = undefined; // cho phép thử lại nếu lần đầu lỗi mạng
      throw err;
    });
  }
  return g.__xbossSchemaReady;
}

// Chuyển placeholder `?` → $1..$n (SQL trong codebase không chứa '?' trong literal).
const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

export async function query<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  await ensureSchema();
  const tx = txStorage.getStore();
  const pgSql = toPg(sql);
  const r = await timedPgQuery(
    () => (tx ? tx.query(pgSql, params) : getPool().query(pgSql, params)),
    sql,
  );
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
  await ensureSchema();
  const tx = txStorage.getStore();
  const pgSql = toPg(sql);
  const r = await timedPgQuery(
    () => (tx ? tx.query(pgSql, params) : getPool().query(pgSql, params)),
    sql,
  );
  return { changes: r.rowCount ?? 0 };
}

// INSERT trả về id (thay cho lastInsertRowid của SQLite).
// Không append RETURNING id nếu SQL đã có sẵn (vd: INSERT ON CONFLICT ... RETURNING id).
export async function insertId(sql: string, ...params: unknown[]): Promise<number> {
  await ensureSchema();
  const pgSql = toPg(sql);
  const needsReturning = !/returning\s+id\s*$/i.test(pgSql.trim());
  const finalSql = needsReturning ? pgSql + " RETURNING id" : pgSql;
  const tx = txStorage.getStore();
  const r = await timedPgQuery(
    () => (tx ? tx.query(finalSql, params) : getPool().query(finalSql, params)),
    sql,
  );
  return Number(r.rows[0].id);
}

// Bọc nhiều thao tác ghi vào 1 transaction — COMMIT khi fn thành công, ROLLBACK khi throw.
// Mọi query/run/insertId bên trong fn tự dùng cùng client (qua AsyncLocalStorage).
// Reentrant: gọi lồng bên trong 1 withTransaction khác (vd recomputePackage tự bọc
// nhưng được recomputeTask gọi từ trong transaction của route) tái dùng luôn client hiện
// có thay vì mở connection/transaction thứ 2 — tránh treo (2 client cùng chờ khoá nhau).
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStorage.getStore()) return fn();
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Truyền ngữ cảnh actor xuống Postgres qua SET LOCAL (set_config ..., true) để trigger
    // audit (migration 0049) ghi được ai/vai trò/dự án/request-id. Tự hết hạn khi COMMIT/
    // ROLLBACK; giá trị thiếu truyền '' (trigger dùng NULLIF để chuyển về NULL).
    const ctx = getRequestContext();
    if (ctx) {
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
                set_config('app.project_id', $3, true), set_config('app.request_id', $4, true)`,
        [
          ctx.userId != null ? String(ctx.userId) : "",
          ctx.role ?? "",
          ctx.projectId != null ? String(ctx.projectId) : "",
          ctx.requestId ?? "",
        ],
      );
    }
    const result = await txStorage.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Bọc đường ĐỌC (GET) nhóm bảng tài chính trong 1 transaction read-only có đặt GUC
// app.project_id — lưới an toàn RLS (migration 0069) chỉ áp được khi GUC tồn tại; đọc
// ngoài transaction (như trước PR2) không có GUC nên rơi vào nhánh "chuyển tiếp" của
// policy. Tái dùng nguyên `withTransaction` (không viết cơ chế set GUC mới): mở transaction,
// set_config LOCAL rồi chạy fn, COMMIT khi xong (SET TRANSACTION READ ONLY vì chỉ đọc).
// projectId = '*' cho ngữ cảnh cross-project hợp lệ (portfolio/cron/export toàn cục).
// opts.readOnly (mặc định true — giữ nguyên hành vi cũ) chỉ chặn ghi bằng SET TRANSACTION
// READ ONLY; đặt false cho route đọc-xen-ghi (vd notifications: đọc bảng phạm vi RLS rồi
// INSERT/DELETE bảng notifications không-RLS trong cùng 1 transaction).
export async function withProjectScope<T>(
  projectId: number | "*",
  fn: () => Promise<T>,
  opts?: { readOnly?: boolean },
): Promise<T> {
  const readOnly = opts?.readOnly ?? true;
  return withTransaction(async () => {
    const client = txStorage.getStore();
    if (!client) throw new Error("withProjectScope: thiếu transaction client (không thể xảy ra)");
    if (readOnly) await client.query("SET TRANSACTION READ ONLY");
    await client.query(`SELECT set_config('app.project_id', $1, true)`, [String(projectId)]);
    return fn();
  });
}

// todayISO/daysFromTodayISO chuyển sang lib/date.ts (thuần, không phụ thuộc pg)
// để dùng lại được ở client — re-export ở đây cho code server hiện có.
export { todayISO, daysFromTodayISO } from "@/lib/date";
