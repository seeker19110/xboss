import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateCommissioningItems: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateCommissioningItems } = await import("@/lib/handover");

  assert.equal(validateCommissioningItems([]), true);
  assert.equal(validateCommissioningItems([{ label: "Chạy thử bơm", type: "pass_fail" }]), true);
  assert.equal(
    validateCommissioningItems([{ label: "Áp lực đường ống", type: "measure", unit: "bar" }]),
    true,
  );
  // không phải mảng
  assert.equal(validateCommissioningItems({}), false);
  assert.equal(validateCommissioningItems(null), false);
  // thiếu label
  assert.equal(validateCommissioningItems([{ type: "pass_fail" }]), false);
  // label rỗng
  assert.equal(validateCommissioningItems([{ label: "  ", type: "pass_fail" }]), false);
  // type không hợp lệ
  assert.equal(validateCommissioningItems([{ label: "Bước 1", type: "xxx" }]), false);
});

test("validateCommissioningInput/validateHandoverItemInput/validatePunchInput: đủ ca biên", async () => {
  const {
    validateCommissioningInput,
    validateHandoverItemInput,
    validatePunchInput,
    validateDemobInput,
    validateLessonInput,
  } = await import("@/lib/handover");

  assert.equal(
    validateCommissioningInput({
      code: null,
      systemName: "Hệ thống PCCC",
      disciplineId: null,
      checklist: [],
      result: "draft",
      testedAt: null,
      note: null,
    }),
    null,
  );
  assert.match(
    validateCommissioningInput({
      code: null,
      systemName: "",
      disciplineId: null,
      checklist: [],
      result: "draft",
      testedAt: null,
      note: null,
    })!,
    /tên hệ thống/i,
  );
  assert.match(
    validateCommissioningInput({
      code: null,
      systemName: "X",
      disciplineId: null,
      checklist: [],
      result: "xxx" as never,
      testedAt: null,
      note: null,
    })!,
    /kết quả/i,
  );
  assert.match(
    validateCommissioningInput({
      code: null,
      systemName: "X",
      disciplineId: null,
      checklist: [],
      result: "draft",
      testedAt: "01/01/2026",
      note: null,
    })!,
    /ngày chạy thử/i,
  );

  assert.equal(
    validateHandoverItemInput({
      title: "Tầng 1",
      disciplineId: null,
      workPackageId: null,
      status: "pending",
      handoverDate: null,
    }),
    null,
  );
  assert.match(
    validateHandoverItemInput({
      title: "",
      disciplineId: null,
      workPackageId: null,
      status: "pending",
      handoverDate: null,
    })!,
    /tên hạng mục/i,
  );

  assert.equal(
    validatePunchInput({
      handoverItemId: null,
      description: "Rò rỉ nước",
      severity: "high",
      status: "open",
      dueDate: null,
      assignee: null,
    }),
    null,
  );
  assert.match(
    validatePunchInput({
      handoverItemId: null,
      description: "",
      severity: null,
      status: "open",
      dueDate: null,
      assignee: null,
    })!,
    /mô tả tồn tại/i,
  );
  assert.match(
    validatePunchInput({
      handoverItemId: null,
      description: "X",
      severity: "xxx" as never,
      status: "open",
      dueDate: null,
      assignee: null,
    })!,
    /mức độ/i,
  );

  assert.equal(
    validateDemobInput({ title: "Tháo lán trại", category: null, status: "pending", note: null }),
    null,
  );
  assert.match(
    validateDemobInput({ title: "", category: null, status: "pending", note: null })!,
    /tên hạng mục/i,
  );

  assert.equal(validateLessonInput({ title: "Bài học 1", category: null, content: null }), null);
  assert.match(validateLessonInput({ title: "", category: null, content: null })!, /tiêu đề/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "handoverProgress: tính đúng % bàn giao/punch open theo severity/% T&C đạt theo dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { handoverProgress } = await import("@/lib/handover");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA HG 1', 'PJT-HG1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA HG 2', 'PJT-HG2')`);

    const hiIds: number[] = [];
    hiIds.push(
      await insertId(
        `INSERT INTO handover_items (project_id, title, status) VALUES (?, 'HM 1', 'accepted')`,
        p1,
      ),
    );
    hiIds.push(
      await insertId(
        `INSERT INTO handover_items (project_id, title, status) VALUES (?, 'HM 2', 'pending')`,
        p1,
      ),
    );
    hiIds.push(
      await insertId(
        `INSERT INTO handover_items (project_id, title, status) VALUES (?, 'HM P2', 'accepted')`,
        p2,
      ),
    );

    const punchIds: number[] = [];
    punchIds.push(
      await insertId(
        `INSERT INTO punch_list (project_id, description, severity, status) VALUES (?, 'Tồn 1', 'high', 'open')`,
        p1,
      ),
    );
    punchIds.push(
      await insertId(
        `INSERT INTO punch_list (project_id, description, severity, status) VALUES (?, 'Tồn 2', 'low', 'fixing')`,
        p1,
      ),
    );
    punchIds.push(
      await insertId(
        `INSERT INTO punch_list (project_id, description, severity, status) VALUES (?, 'Tồn 3', 'high', 'closed')`,
        p1,
      ),
    );

    const tcIds: number[] = [];
    tcIds.push(
      await insertId(
        `INSERT INTO commissioning (project_id, system_name, result) VALUES (?, 'Hệ 1', 'passed')`,
        p1,
      ),
    );
    tcIds.push(
      await insertId(
        `INSERT INTO commissioning (project_id, system_name, result) VALUES (?, 'Hệ 2', 'testing')`,
        p1,
      ),
    );

    const r1 = await handoverProgress(p1);
    assert.equal(r1.itemsTotal, 2);
    assert.equal(r1.itemsAccepted, 1);
    assert.equal(r1.itemsAcceptedPercent, 50);
    assert.equal(r1.punchOpen, 2); // open + fixing, không tính closed
    assert.equal(r1.punchOpenBySeverity.high, 1);
    assert.equal(r1.punchOpenBySeverity.low, 1);
    assert.equal(r1.commissioningTotal, 2);
    assert.equal(r1.commissioningPassed, 1);
    assert.equal(r1.commissioningPassedPercent, 50);

    const r2 = await handoverProgress(p2);
    assert.equal(r2.itemsTotal, 1);
    assert.equal(r2.itemsAcceptedPercent, 100);
    assert.equal(r2.punchOpen, 0);
    assert.equal(r2.commissioningTotal, 0);
    assert.equal(r2.commissioningPassedPercent, 0);

    await run(`DELETE FROM punch_list WHERE id = ANY(?)`, punchIds);
    await run(`DELETE FROM commissioning WHERE id = ANY(?)`, tcIds);
    await run(`DELETE FROM handover_items WHERE id = ANY(?)`, hiIds);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "overduePunch: xuất hiện đúng khi quá hạn chưa đóng, tự dọn khi đóng/gia hạn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { overduePunch } = await import("@/lib/handover");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Punch User', 'punchuser@test.local', 'x', 'engineer')`,
    );

    const overdueId = await insertId(
      `INSERT INTO punch_list (description, status, due_date, assignee)
       VALUES ('Tồn quá hạn', 'open', ?, ?)`,
      daysFromTodayISO(-3),
      userId,
    );
    const notYetId = await insertId(
      `INSERT INTO punch_list (description, status, due_date, assignee)
       VALUES ('Tồn còn hạn', 'open', ?, ?)`,
      daysFromTodayISO(5),
      userId,
    );
    const closedOverdueId = await insertId(
      `INSERT INTO punch_list (description, status, due_date, assignee)
       VALUES ('Tồn quá hạn nhưng đã đóng', 'closed', ?, ?)`,
      daysFromTodayISO(-3),
      userId,
    );

    let list = await overduePunch(userId);
    let ids = list.map((p) => p.id);
    assert.ok(ids.includes(overdueId));
    assert.ok(!ids.includes(notYetId));
    assert.ok(!ids.includes(closedOverdueId));

    // Đóng punch quá hạn → tự dọn khỏi danh sách cảnh báo.
    await run(`UPDATE punch_list SET status = 'closed' WHERE id = ?`, overdueId);
    list = await overduePunch(userId);
    ids = list.map((p) => p.id);
    assert.ok(!ids.includes(overdueId));

    // notification dedup: chèn 2 lần liên tiếp không tạo bản ghi trùng.
    const reopenedId = await insertId(
      `INSERT INTO punch_list (description, status, due_date, assignee)
       VALUES ('Tồn quá hạn cho notif', 'open', ?, ?)`,
      daysFromTodayISO(-1),
      userId,
    );
    const insertOne = async () => {
      const rows = await overduePunch(userId);
      const values = rows.map(() => `(?, ?, 'punch_overdue', ?)`).join(", ");
      const params = rows.flatMap((p) => [userId, p.id, `test ${p.description}`]);
      if (rows.length === 0) return;
      await run(
        `INSERT INTO notifications (user_id, punch_item_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, punch_item_id) WHERE punch_item_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne();
    const count = await (
      await import("@/lib/db")
    ).queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'punch_overdue' AND punch_item_id = ?`,
      userId,
      reopenedId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(
      `DELETE FROM punch_list WHERE id IN (?, ?, ?, ?)`,
      overdueId,
      notYetId,
      closedOverdueId,
      reopenedId,
    );
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);

test(
  "vòng đời punch/handover status: pending→handed_over→accepted, open→fixing→closed",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const hiId = await insertId(
      `INSERT INTO handover_items (title, status) VALUES ('HM vòng đời', 'pending')`,
    );
    await run(`UPDATE handover_items SET status = 'handed_over' WHERE id = ?`, hiId);
    let hi = await queryOne<{ status: string }>(
      `SELECT status FROM handover_items WHERE id = ?`,
      hiId,
    );
    assert.equal(hi?.status, "handed_over");
    await run(`UPDATE handover_items SET status = 'accepted' WHERE id = ?`, hiId);
    hi = await queryOne<{ status: string }>(`SELECT status FROM handover_items WHERE id = ?`, hiId);
    assert.equal(hi?.status, "accepted");

    const punchId = await insertId(
      `INSERT INTO punch_list (handover_item_id, description, status) VALUES (?, 'Tồn vòng đời', 'open')`,
      hiId,
    );
    await run(`UPDATE punch_list SET status = 'fixing' WHERE id = ?`, punchId);
    let punch = await queryOne<{ status: string }>(
      `SELECT status FROM punch_list WHERE id = ?`,
      punchId,
    );
    assert.equal(punch?.status, "fixing");
    await run(`UPDATE punch_list SET status = 'closed' WHERE id = ?`, punchId);
    punch = await queryOne<{ status: string }>(
      `SELECT status FROM punch_list WHERE id = ?`,
      punchId,
    );
    assert.equal(punch?.status, "closed");

    // handover_item_id nullable — punch không gắn hạng mục cụ thể vẫn tạo được.
    const looseId = await insertId(
      `INSERT INTO punch_list (description, status) VALUES ('Tồn không gắn hạng mục', 'open')`,
    );
    const loose = await queryOne<{ handoverItemId: number | null }>(
      `SELECT handover_item_id AS "handoverItemId" FROM punch_list WHERE id = ?`,
      looseId,
    );
    assert.equal(loose?.handoverItemId, null);

    await run(`DELETE FROM punch_list WHERE id IN (?, ?)`, punchId, looseId);
    await run(`DELETE FROM handover_items WHERE id = ?`, hiId);
  },
);
