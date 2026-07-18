import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====
// Kiểm statement_timeout (M53 PR3): query vượt ngưỡng bị Postgres huỷ (mã lỗi 57014) và
// connection vẫn được trả lại pool đúng cách — không rò rỉ dù query lỗi giữa chừng.

test(
  "getPool: statement_timeout huỷ query pg_sleep quá lâu, connection không bị rò rỉ",
  { skip: !HAS_TEST_DB },
  async () => {
    // Đặt ngưỡng timeout thấp (200ms) trước khi getPool() khởi tạo pool lần đầu trong test này.
    process.env.XBOSS_PG_STMT_TIMEOUT_MS = "200";
    process.env.XBOSS_PG_POOL_MAX = "3";

    const { getPool } = await import("@/lib/db");
    const pool = getPool();

    const before = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };

    await assert.rejects(
      () => pool.query("SELECT pg_sleep(2)"),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, "57014"); // query_canceled (statement timeout)
        return true;
      },
    );

    // Cho pg 1 nhịp để hoàn tất release connection lỗi về pool.
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(pool.waitingCount, 0, "không còn request nào chờ connection");
    assert.ok(
      pool.idleCount >= before.idle,
      "connection dùng để chạy query lỗi phải được trả lại pool (idle), không bị treo/rò rỉ",
    );

    // Query bình thường vẫn chạy được ngay sau đó — xác nhận pool còn hoạt động tốt.
    const rows = await pool.query("SELECT 1 AS ok");
    assert.equal(rows.rows[0].ok, 1);
  },
);
