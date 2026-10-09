// Kiểm tra sức khoẻ hệ thống cho GET /api/health (uptime monitor ping mỗi phút, xem
// docs/ops/backup.md). Tách hàm thuần khỏi route để test được (inject queryOneFn giả lập
// lỗi DB) mà không cần route thật/next headers.
import { queryOne, checkSchemaReady, DatabaseSchemaNotReadyError } from "@/lib/db";

// Timeout ping DB — DB treo (network chết nửa chừng, không refuse ngay) không được để
// health-check treo theo, uptime monitor cần trả lời trong thời gian hợp lý.
const DB_PING_TIMEOUT_MS = 3000;

export type HealthResult = {
  status: "ok" | "degraded";
  db: boolean;
  migration: string | null;
  uptime_s: number;
  errorCode?: "schema_not_ready" | "database_unavailable";
};

type QueryOneFn = <T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
) => Promise<T | undefined>;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DB ping timeout")), ms)),
  ]);
}

// queryOneFn injectable cho test (mặc định = queryOne thật từ lib/db). KHÔNG lộ version
// app/hostname/disk chi tiết — chỉ trả 4 trường public-safe.
export async function checkHealth(queryOneFn: QueryOneFn = queryOne): Promise<HealthResult> {
  const uptime_s = Math.round(process.uptime());
  try {
    const [, migrationRow] = await withTimeout(
      Promise.all([
        queryOneFn<{ ok: number }>("SELECT 1 AS ok"),
        queryOneFn<{ name: string | null }>("SELECT MAX(name) AS name FROM schema_migrations"),
      ]),
      DB_PING_TIMEOUT_MS,
    );
    return { status: "ok", db: true, migration: migrationRow?.name ?? null, uptime_s };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    return {
      status: "degraded",
      db: false,
      migration: null,
      uptime_s,
      errorCode: code === "XBOSS_SCHEMA_NOT_READY" ? "schema_not_ready" : "database_unavailable",
    };
  }
}

export type ReadinessResult =
  | { ready: true; schema: "ok"; migrationsApplied: number; appliedHead: string | null }
  | {
      ready: false;
      reason: "schema_missing" | "schema_behind" | "db_unavailable";
      error: string;
    };

const READY_MESSAGES = {
  schema_missing: "Schema cơ sở dữ liệu chưa sẵn sàng — cần chạy migration bằng job riêng",
  schema_behind: "Schema cơ sở dữ liệu cũ hơn phiên bản app — cần chạy migration bằng job riêng",
  db_unavailable: "Không kết nối được cơ sở dữ liệu",
} as const;

// Readiness ≠ liveness (/api/health): chỉ SELECT, không auto-migrate/seed. Thông điệp cố định,
// không đưa err.message (có thể chứa host/chuỗi kết nối) vào body.
export async function checkReadiness(
  checkFn: typeof checkSchemaReady = checkSchemaReady,
): Promise<ReadinessResult> {
  try {
    const r = await withTimeout(checkFn(), DB_PING_TIMEOUT_MS);
    return { ready: true, schema: "ok", migrationsApplied: r.applied, appliedHead: r.head };
  } catch (err) {
    const reason =
      err instanceof DatabaseSchemaNotReadyError ||
      (err as { code?: string } | null)?.code === "XBOSS_SCHEMA_NOT_READY"
        ? (err as { reason?: string }).reason === "behind"
          ? "schema_behind"
          : "schema_missing"
        : "db_unavailable";
    return { ready: false, reason, error: READY_MESSAGES[reason] };
  }
}
