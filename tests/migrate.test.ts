import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { listMigrationFiles } from "@/lib/db/migrate";

// ===== Test thuần (không cần DB) =====

test("listMigrationFiles: chỉ .sql, sắp theo số thứ tự, có baseline", () => {
  const files = listMigrationFiles();
  assert.ok(files.length >= 1, "phải có ít nhất 1 migration");
  assert.equal(files[0], "0001_baseline.sql", "baseline phải là file đầu tiên");
  assert.ok(
    files.every((f) => f.endsWith(".sql")),
    "chỉ nhận đuôi .sql",
  );
  // Đã sắp thứ tự tăng dần (sort chuỗi = sort số vì đánh số cố định chữ số).
  const sorted = [...files].sort();
  assert.deepEqual(files, sorted, "phải trả về danh sách đã sắp thứ tự");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

// KHÔNG drop schema ở đây: node:test chạy các file test song song trên cùng DB test,
// DROP SCHEMA sẽ xoá dữ liệu của test khác đang chạy (đua). Thay vào đó kiểm trên DB
// đã migrate (trạng thái thực tế: bất kỳ test chạm DB nào cũng đã kích hoạt ensureSchema).
test(
  "runMigrations: áp đủ file, ghi schema_migrations, chạy lại là no-op (idempotent)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { getPool } = await import("@/lib/db");
    const { runMigrations } = await import("@/lib/db/migrate");
    const pool = getPool();

    // Đảm bảo mọi migration đã áp (an toàn khi gọi lặp).
    await runMigrations(pool);

    // schema_migrations ghi nhận đúng, đủ danh sách file.
    const applied = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    assert.deepEqual(
      applied.rows.map((r) => r.name),
      listMigrationFiles(),
      "schema_migrations phải khớp danh sách file",
    );

    // Baseline đã tạo bảng thật (kiểm 1 bảng lõi).
    const tbl = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks'`,
    );
    assert.equal(tbl.rowCount, 1, "bảng tasks phải tồn tại sau migrate");

    // Chạy lại: không áp gì thêm (idempotent) — thuộc tính cốt lõi của hệ migrate.
    const secondRun = await runMigrations(pool);
    assert.deepEqual(secondRun, [], "chạy lại không áp migration nào");
  },
);
