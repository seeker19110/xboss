import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateHseInput: đủ ca hợp lệ/không hợp lệ theo kind", async () => {
  const { validateHseInput } = await import("@/lib/hse");

  const base = {
    kind: "toolbox" as const,
    recordDate: "2026-07-01",
    floorLabel: null,
    area: null,
    description: "Toolbox talk sáng thứ 2",
    severity: null,
    permitType: null,
    permitFrom: null,
    permitTo: null,
    actionRequired: null,
    actionAssignee: null,
    actionDue: null,
  };

  assert.equal(validateHseInput(base), null);
  assert.match(validateHseInput({ ...base, kind: "xxx" as never })!, /loại ghi nhận/i);
  assert.match(validateHseInput({ ...base, recordDate: "01/07/2026" })!, /ngày ghi nhận/i);
  assert.match(validateHseInput({ ...base, description: "" })!, /mô tả/i);

  assert.match(
    validateHseInput({ ...base, kind: "incident", severity: null })!,
    /sự cố\/cận nguy cần mức độ/i,
  );
  assert.equal(validateHseInput({ ...base, kind: "incident", severity: "high" }), null);

  assert.match(
    validateHseInput({ ...base, kind: "permit", permitType: null })!,
    /giấy phép cần loại hợp lệ/i,
  );
  assert.match(
    validateHseInput({
      ...base,
      kind: "permit",
      permitType: "hot_work",
      permitFrom: null,
      permitTo: null,
    })!,
    /khung giờ hiệu lực/i,
  );
  assert.equal(
    validateHseInput({
      ...base,
      kind: "permit",
      permitType: "hot_work",
      permitFrom: "2026-07-01T08:00:00Z",
      permitTo: "2026-07-01T17:00:00Z",
    }),
    null,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "openHseActions + closeHseAction: quá hạn đúng theo assignee, đóng xong không còn xuất hiện",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { openHseActions, closeHseAction } = await import("@/lib/hse");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('HSE Test', 'hse-test@xboss.vn', 'x', 'engineer')`,
    );
    const otherId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('HSE Other', 'hse-other@xboss.vn', 'x', 'engineer')`,
    );

    const overdueId = await insertId(
      `INSERT INTO hse_records
         (kind, record_date, description, action_required, action_assignee, action_due, action_status)
       VALUES ('incident', ?, 'Sự cố test', 'Khắc phục ngay', ?, ?, 'open')`,
      daysFromTodayISO(-5),
      userId,
      daysFromTodayISO(-2),
    );
    const notDueId = await insertId(
      `INSERT INTO hse_records
         (kind, record_date, description, action_required, action_assignee, action_due, action_status)
       VALUES ('incident', ?, 'Sự cố test 2', 'Khắc phục', ?, ?, 'open')`,
      daysFromTodayISO(-1),
      userId,
      daysFromTodayISO(5),
    );

    const forUser = await openHseActions(userId);
    assert.ok(forUser.some((a) => a.id === overdueId));
    assert.ok(!forUser.some((a) => a.id === notDueId));

    const forOther = await openHseActions(otherId);
    assert.ok(!forOther.some((a) => a.id === overdueId));

    const allOverdue = await openHseActions();
    assert.ok(allOverdue.some((a) => a.id === overdueId));

    const closed = await closeHseAction(overdueId);
    assert.equal(closed, true);
    const afterClose = await openHseActions(userId);
    assert.ok(!afterClose.some((a) => a.id === overdueId));

    await run(`DELETE FROM hse_records WHERE id IN (?, ?)`, overdueId, notDueId);
    await run(`DELETE FROM users WHERE id IN (?, ?)`, userId, otherId);
  },
);

test(
  "listHse/getHse: scoped đúng theo project_id (M22), không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listHse, getHse } = await import("@/lib/hse");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA HSE 1', 'PJT-HSE1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA HSE 2', 'PJT-HSE2')`);
    const h1 = await insertId(
      `INSERT INTO hse_records (kind, record_date, description, project_id) VALUES ('toolbox', '2026-07-01', 'HSE DA1', ?)`,
      p1,
    );
    const h2 = await insertId(
      `INSERT INTO hse_records (kind, record_date, description, project_id) VALUES ('toolbox', '2026-07-01', 'HSE DA2', ?)`,
      p2,
    );

    const list1 = await listHse({ projectId: p1 });
    assert.ok(list1.some((h) => h.id === h1));
    assert.ok(!list1.some((h) => h.id === h2));

    assert.ok(await getHse(h1, p1));
    assert.equal(await getHse(h2, p1), null);

    await run(`DELETE FROM hse_records WHERE id IN (?, ?)`, h1, h2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
