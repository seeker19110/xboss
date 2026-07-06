import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateMeetingInput: bắt buộc ngày/loại/tiêu đề", async () => {
  const { validateMeetingInput } = await import("@/lib/meetings");

  const base = {
    meetingDate: "2026-07-06",
    kind: "weekly" as const,
    title: "Họp giao ban tuần 28",
    attendees: null,
    content: null,
  };

  assert.equal(validateMeetingInput(base), null);
  assert.match(validateMeetingInput({ ...base, meetingDate: "06/07/2026" })!, /ngày họp/i);
  assert.match(validateMeetingInput({ ...base, kind: "xxx" as never })!, /loại họp/i);
  assert.match(validateMeetingInput({ ...base, title: "" })!, /tiêu đề/i);
});

test("validateMeetingActionInput: bắt buộc nội dung, hạn đúng định dạng", async () => {
  const { validateMeetingActionInput } = await import("@/lib/meetings");

  const base = {
    content: "Gửi lại bản vẽ shop tầng 12",
    assignee: null,
    dueDate: null,
    taskId: null,
  };
  assert.equal(validateMeetingActionInput(base), null);
  assert.equal(validateMeetingActionInput({ ...base, dueDate: "2026-07-10" }), null);
  assert.match(validateMeetingActionInput({ ...base, content: "" })!, /nội dung/i);
  assert.match(validateMeetingActionInput({ ...base, dueDate: "10/07/2026" })!, /hạn hoàn thành/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "openMeetingActions + overdueMeetingActions + setMeetingActionStatus: quá hạn đúng theo assignee, done ghi done_at",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { openMeetingActions, overdueMeetingActions, setMeetingActionStatus } =
      await import("@/lib/meetings");
    const { daysFromTodayISO, todayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Meeting Test', 'meeting-test@xboss.vn', 'x', 'engineer')`,
    );
    const otherId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Meeting Other', 'meeting-other@xboss.vn', 'x', 'engineer')`,
    );
    const meetingId = await insertId(
      `INSERT INTO meetings (meeting_date, kind, title) VALUES (?, 'weekly', 'Họp test')`,
      todayISO(),
    );

    const overdueId = await insertId(
      `INSERT INTO meeting_actions (meeting_id, content, assignee, due_date) VALUES (?, 'Việc quá hạn', ?, ?)`,
      meetingId,
      userId,
      daysFromTodayISO(-3),
    );
    const notDueId = await insertId(
      `INSERT INTO meeting_actions (meeting_id, content, assignee, due_date) VALUES (?, 'Việc còn hạn', ?, ?)`,
      meetingId,
      userId,
      daysFromTodayISO(5),
    );

    // Đang mở: cả 2 việc, sắp theo hạn — quá hạn đứng trước.
    const open = await openMeetingActions(userId);
    assert.deepEqual(
      open.filter((a) => [overdueId, notDueId].includes(a.id)).map((a) => a.id),
      [overdueId, notDueId],
    );

    // Quá hạn: chỉ việc trễ, đúng theo assignee.
    const overdue = await overdueMeetingActions(userId);
    assert.ok(overdue.some((a) => a.id === overdueId));
    assert.ok(!overdue.some((a) => a.id === notDueId));
    const forOther = await overdueMeetingActions(otherId);
    assert.ok(!forOther.some((a) => a.id === overdueId));
    const all = await overdueMeetingActions();
    assert.ok(all.some((a) => a.id === overdueId));

    // Done ghi done_at + biến khỏi danh sách mở; mở lại xoá done_at.
    assert.equal(await setMeetingActionStatus(overdueId, "done"), true);
    const doneRow = await queryOne<{ status: string; done_at: string | null }>(
      `SELECT status, done_at FROM meeting_actions WHERE id = ?`,
      overdueId,
    );
    assert.equal(doneRow?.status, "done");
    assert.ok(doneRow?.done_at != null);
    assert.ok(!(await openMeetingActions(userId)).some((a) => a.id === overdueId));

    assert.equal(await setMeetingActionStatus(overdueId, "open"), true);
    const reopened = await queryOne<{ status: string; done_at: string | null }>(
      `SELECT status, done_at FROM meeting_actions WHERE id = ?`,
      overdueId,
    );
    assert.equal(reopened?.status, "open");
    assert.equal(reopened?.done_at, null);

    await run(`DELETE FROM meetings WHERE id = ?`, meetingId); // cascade xoá actions
    await run(`DELETE FROM users WHERE id IN (?, ?)`, userId, otherId);
  },
);
