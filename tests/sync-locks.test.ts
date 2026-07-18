import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====
// M53 PR4: acquireSyncLock/releaseSyncLock (dùng chung bảng sync_locks, pattern đã có ở
// lib/material-sync.ts) — chống gửi trùng daily-report/weekly-report khi 2 request chạm
// route gần như đồng thời.

test(
  "acquireSyncLock: giữ khoá thành công lần đầu, lần thứ 2 cùng tên thất bại tới khi release",
  { skip: !HAS_TEST_DB },
  async () => {
    const { acquireSyncLock, releaseSyncLock } = await import("@/lib/sync-locks");
    const name = `test:sync-lock:${Date.now()}`;

    assert.equal(await acquireSyncLock(name), true, "lần đầu phải giữ được khoá");
    assert.equal(await acquireSyncLock(name), false, "đang bị giữ → không giữ được lần 2");

    await releaseSyncLock(name);
    assert.equal(await acquireSyncLock(name), true, "sau release phải giữ lại được");

    await releaseSyncLock(name);
  },
);

test(
  "acquireSyncLock: khoá quá hạn staleMinutes tự coi như hết hạn, giữ lại được dù chưa release",
  { skip: !HAS_TEST_DB },
  async () => {
    const { acquireSyncLock, releaseSyncLock } = await import("@/lib/sync-locks");
    const { run } = await import("@/lib/db");
    const name = `test:sync-lock-stale:${Date.now()}`;

    assert.equal(await acquireSyncLock(name), true);
    // Giả lập khoá cũ (process trước crash không release): lùi locked_at ra quá khứ.
    await run(
      `UPDATE sync_locks SET locked_at = NOW() - INTERVAL '11 minutes' WHERE name = ?`,
      name,
    );
    assert.equal(
      await acquireSyncLock(name, 10),
      true,
      "khoá quá staleMinutes phải tự coi như hết hạn",
    );

    await releaseSyncLock(name);
  },
);
