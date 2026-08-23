// Kiểm tra sức khoẻ hệ thống cho GET /api/health (uptime monitor ping mỗi phút, xem
// docs/ops/backup.md). Tách hàm thuần khỏi route để test được (inject queryOneFn giả lập
// lỗi DB) mà không cần route thật/next headers.
import { queryOne } from "@/lib/db";

// Timeout ping DB — DB treo (network chết nửa chừng, không refuse ngay) không được để
// health-check treo theo, uptime monitor cần trả lời trong thời gian hợp lý.
const DB_PING_TIMEOUT_MS = 3000;

export type HealthResult = {
  status: "ok" | "degraded";
  db: boolean;
  migration: string | null;
  uptime_s: number;
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
  } catch {
    return { status: "degraded", db: false, migration: null, uptime_s };
  }
}
