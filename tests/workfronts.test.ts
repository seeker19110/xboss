import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("isForwardTransition: chỉ cho phép đi tới hoặc đứng yên", async () => {
  const { isForwardTransition } = await import("@/lib/workfronts");

  assert.equal(isForwardTransition("pending", "handed_over"), true);
  assert.equal(isForwardTransition("pending", "in_progress"), true);
  assert.equal(isForwardTransition("pending", "pending"), true);
  assert.equal(isForwardTransition("in_progress", "handed_over"), false);
  assert.equal(isForwardTransition("returned", "pending"), false);
});

test("validateWorkFrontUpdate: trạng thái không hợp lệ bị chặn", async () => {
  const { validateWorkFrontUpdate } = await import("@/lib/workfronts");

  assert.equal(
    validateWorkFrontUpdate({
      status: "handed_over" as const,
      handedOverAt: null,
      returnedAt: null,
      blocker: null,
      note: null,
    }),
    null,
  );
  assert.match(
    validateWorkFrontUpdate({
      status: "xxx" as never,
      handedOverAt: null,
      returnedAt: null,
      blocker: null,
      note: null,
    })!,
    /trạng thái/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "updateWorkFrontStatus: tuần tự hợp lệ ghi lịch sử, nhảy ngược bị chặn trừ Admin",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { updateWorkFrontStatus } = await import("@/lib/workfronts");

    const sheetId = await insertId(
      `INSERT INTO sheet_types (code, name, slug) VALUES ('WF-TEST', 'Sheet Test WF', 'wf-test')`,
    );
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('WF Test', 'wf-test@xboss.vn', 'x', 'admin')`,
    );
    const frontId = await insertId(
      `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, '10F')`,
      sheetId,
    );

    const step1 = await updateWorkFrontStatus(
      frontId,
      {
        status: "handed_over",
        handedOverAt: "2026-07-01",
        returnedAt: null,
        blocker: null,
        note: null,
      },
      userId,
      false,
    );
    assert.ok("ok" in step1);

    const historyCount = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM work_front_history WHERE work_front_id = ?`,
      frontId,
    );
    assert.equal(Number(historyCount!.n), 1);

    // Nhảy ngược không phải Admin bị chặn.
    const blocked = await updateWorkFrontStatus(
      frontId,
      { status: "pending", handedOverAt: null, returnedAt: null, blocker: null, note: null },
      userId,
      false,
    );
    assert.ok("error" in blocked);

    // Admin được nhảy ngược.
    const allowed = await updateWorkFrontStatus(
      frontId,
      { status: "pending", handedOverAt: null, returnedAt: null, blocker: null, note: null },
      userId,
      true,
    );
    assert.ok("ok" in allowed);

    await run(`DELETE FROM work_fronts WHERE id = ?`, frontId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
  },
);

test(
  "frontMissingList: xuất hiện khi tầng pending có task tới hạn bắt đầu, không xuất hiện khi đã bàn giao",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { frontMissingList } = await import("@/lib/workfronts");
    const { todayISO } = await import("@/lib/date");

    const sheetId = await insertId(
      `INSERT INTO sheet_types (code, name, slug) VALUES ('WF-TEST2', 'Sheet Test WF2', 'wf-test2')`,
    );
    const frontId = await insertId(
      `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, '11F')`,
      sheetId,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label) VALUES ('WP-WF', 'Nhóm test WF', ?, '11F')`,
      sheetId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (code, name, package_id, start_date, status, progress_percent)
       VALUES ('T-WF', 'Task test WF', ?, ?, 'chuan_bi', 0)`,
      wpId,
      todayISO(),
    );

    const missing = await frontMissingList();
    assert.ok(missing.some((m) => m.workFrontId === frontId));

    // Bàn giao xong → không còn xuất hiện.
    await run(`UPDATE work_fronts SET status = 'handed_over' WHERE id = ?`, frontId);
    const afterHandover = await frontMissingList();
    assert.ok(!afterHandover.some((m) => m.workFrontId === frontId));

    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, wpId);
    await run(`DELETE FROM work_fronts WHERE id = ?`, frontId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
  },
);
