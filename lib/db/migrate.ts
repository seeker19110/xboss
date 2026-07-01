// Hệ migrate nhẹ, không ORM: chạy các file .sql đánh số trong migrations/ theo thứ tự,
// ghi nhận file đã áp vào bảng schema_migrations. Bám triết lý raw SQL của XBoss
// (xem docs/adr/0003-migrations.md). Gọi tự động lúc boot qua ensureSchema (lib/db)
// và thủ công qua `npm run db:migrate` (scripts/migrate.ts).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

// Thư mục migrations ở gốc repo (self-host chạy `next start` từ đây; tsx/test cũng cwd = root).
export const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// Khoá tư vấn (advisory lock) toàn cục: serialize migrate giữa nhiều process/instance
// (multi-instance production hoặc test chạy song song). Số bất kỳ, cố định.
const MIGRATION_LOCK_KEY = 918_273_645;

// Danh sách file migration đã sắp thứ tự. Tên đánh số 4 chữ số (0001_, 0002_…) nên
// sắp theo chuỗi = sắp theo số. Chỉ nhận đuôi .sql.
export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

// Áp mọi migration chưa chạy. Trả về danh sách file vừa áp (rỗng nếu đã cập nhật).
// - 1 client giữ suốt phiên: acquire advisory lock → tạo bảng theo dõi → chạy từng file
//   trong 1 transaction riêng (một file lỗi không kéo theo file trước) → ghi schema_migrations.
// - Idempotent: file đã ghi trong schema_migrations thì bỏ qua.
export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const ran: string[] = [];
  try {
    // Chờ tới khi giành được khoá — process khác đang migrate thì xếp hàng, xong sẽ thấy đã áp.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const appliedRows = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(appliedRows.rows.map((r) => r.name));

    for (const file of listMigrationFiles()) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        ran.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${file} lỗi: ${err instanceof Error ? err.message : String(err)}`,
          {
            cause: err,
          },
        );
      }
    }
    return ran;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
