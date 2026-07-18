// DB layer dùng PostgreSQL (pg Pool) — cấu hình qua DATABASE_URL.
// Giữ nguyên API helper (query/queryOne/run) như bản SQLite cũ nhưng async;
// placeholder viết dạng `?` và được chuyển tự động sang $1..$n.
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, PoolClient, types } from "pg";
import { getServerEnv } from "@/lib/env";
import { getRequestContext } from "@/lib/request-context";
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

export function getPool(): Pool {
  if (!g.__xbossPool) {
    const url = getServerEnv().DATABASE_URL;
    g.__xbossPool = new Pool({ connectionString: url, max: 10 });
  }
  return g.__xbossPool;
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
  const r = tx ? await tx.query(toPg(sql), params) : await getPool().query(toPg(sql), params);
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
  const r = tx ? await tx.query(toPg(sql), params) : await getPool().query(toPg(sql), params);
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
  const r = tx ? await tx.query(finalSql, params) : await getPool().query(finalSql, params);
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
// app.project_id — lưới an toàn RLS (migration 0067) chỉ áp được khi GUC tồn tại; đọc
// ngoài transaction (như trước PR2) không có GUC nên rơi vào nhánh "chuyển tiếp" của
// policy. Tái dùng nguyên `withTransaction` (không viết cơ chế set GUC mới): mở transaction,
// set_config LOCAL rồi chạy fn, COMMIT khi xong (SET TRANSACTION READ ONLY vì chỉ đọc).
// projectId = '*' cho ngữ cảnh cross-project hợp lệ (portfolio/cron/export toàn cục).
export async function withProjectScope<T>(
  projectId: number | "*",
  fn: () => Promise<T>,
): Promise<T> {
  return withTransaction(async () => {
    const client = txStorage.getStore();
    if (!client) throw new Error("withProjectScope: thiếu transaction client (không thể xảy ra)");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query(`SELECT set_config('app.project_id', $1, true)`, [String(projectId)]);
    return fn();
  });
}

// todayISO/daysFromTodayISO chuyển sang lib/date.ts (thuần, không phụ thuộc pg)
// để dùng lại được ở client — re-export ở đây cho code server hiện có.
export { todayISO, daysFromTodayISO } from "@/lib/date";
