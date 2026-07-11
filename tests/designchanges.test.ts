import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateDesignChangeInput: title/reason bắt buộc", async () => {
  const { validateDesignChangeInput } = await import("@/lib/designchanges");

  const base = {
    title: "Đổi cao độ trần kỹ thuật tầng 5",
    systemId: null,
    drawingId: null,
    requestedByNote: null,
    reason: "TVGS yêu cầu tăng khoảng hở kỹ thuật",
    impactTechnical: null,
    impactCost: null,
    impactSchedule: null,
  };

  assert.equal(validateDesignChangeInput(base), null);
  assert.match(validateDesignChangeInput({ ...base, title: "" })!, /tiêu đề/i);
  assert.match(validateDesignChangeInput({ ...base, reason: "" })!, /lý do/i);
  assert.match(validateDesignChangeInput({ ...base, title: "   " })!, /tiêu đề/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test("nextDesignChangeCode: sinh mã DC-000N tuần tự", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId } = await import("@/lib/db");
  const { nextDesignChangeCode } = await import("@/lib/designchanges");

  const code1 = await nextDesignChangeCode();
  assert.match(code1, /^DC-\d{4}$/);

  const id1 = await insertId(
    `INSERT INTO design_changes (code, title, reason) VALUES (?, 'DC test 1', 'Lý do 1')`,
    code1,
  );
  const code2 = await nextDesignChangeCode();
  assert.notEqual(code2, code1);

  await run(`DELETE FROM design_changes WHERE id = ?`, id1);
});

test(
  "pendingDesignChanges: chỉ xuất hiện DC submitted/assessing quá hạn N ngày, tự dọn khi hết điều kiện, scoping đúng theo dự án (M22)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { pendingDesignChanges } = await import("@/lib/designchanges");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA test DC 1', 'PJT-DC1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA test DC 2', 'PJT-DC2')`,
    );

    const overdueP1 = await insertId(
      `INSERT INTO design_changes (project_id, code, title, reason, status, created_at)
       VALUES (?, 'DC-TEST-OVERDUE', 'DC quá hạn', 'Lý do', 'submitted', NOW() - INTERVAL '10 days')`,
      p1,
    );
    const overdueAssessingP1 = await insertId(
      `INSERT INTO design_changes (project_id, code, title, reason, status, created_at)
       VALUES (?, 'DC-TEST-ASSESSING', 'DC đang đánh giá quá hạn', 'Lý do', 'assessing', NOW() - INTERVAL '10 days')`,
      p1,
    );
    const freshP1 = await insertId(
      `INSERT INTO design_changes (project_id, code, title, reason, status, created_at)
       VALUES (?, 'DC-TEST-FRESH', 'DC mới trình', 'Lý do', 'submitted', NOW() - INTERVAL '1 days')`,
      p1,
    );
    const approvedP1 = await insertId(
      `INSERT INTO design_changes (project_id, code, title, reason, status, created_at)
       VALUES (?, 'DC-TEST-APPROVED', 'DC đã duyệt', 'Lý do', 'approved', NOW() - INTERVAL '10 days')`,
      p1,
    );
    const overdueP2 = await insertId(
      `INSERT INTO design_changes (project_id, code, title, reason, status, created_at)
       VALUES (?, 'DC-TEST-OTHER-PROJECT', 'DC dự án khác', 'Lý do', 'submitted', NOW() - INTERVAL '10 days')`,
      p2,
    );

    // Không lọc theo dự án: thấy cả DC dự án 1 lẫn dự án 2 quá hạn.
    const pendingAll = await pendingDesignChanges(7);
    const idsAll = pendingAll.map((d) => d.id);
    assert.ok(idsAll.includes(overdueP1));
    assert.ok(idsAll.includes(overdueAssessingP1));
    assert.ok(!idsAll.includes(freshP1));
    assert.ok(!idsAll.includes(approvedP1));
    assert.ok(idsAll.includes(overdueP2));

    // Lọc theo dự án 1: không lẫn DC của dự án 2 (scoping M22).
    const pendingP1 = await pendingDesignChanges(7, p1);
    const idsP1 = pendingP1.map((d) => d.id);
    assert.ok(idsP1.includes(overdueP1));
    assert.ok(!idsP1.includes(overdueP2));

    // Duyệt xong → biến khỏi pendingDesignChanges (đã có quyết định).
    await run(`UPDATE design_changes SET status = 'approved' WHERE id = ?`, overdueP1);
    const afterApprove = await pendingDesignChanges(7, p1);
    assert.ok(!afterApprove.some((d) => d.id === overdueP1));

    await run(
      `DELETE FROM design_changes WHERE id IN (?, ?, ?, ?, ?)`,
      overdueP1,
      overdueAssessingP1,
      freshP1,
      approvedP1,
      overdueP2,
    );
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "decideDesignChange: vòng đời submitted→approved/rejected, bắt buộc ghi chú khi có tác động chi phí/tiến độ, markDrawingUpdated chỉ sau khi đã duyệt",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { decideDesignChange, markDrawingUpdated } = await import("@/lib/designchanges");

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM DC Test', 'dc-pm@xboss.vn', 'x', 'pm')`,
    );

    // DC không có tác động chi phí/tiến độ → duyệt không cần ghi chú.
    const dc1 = await insertId(
      `INSERT INTO design_changes (code, title, reason, status)
       VALUES ('DC-TEST-D1', 'DC không tác động', 'Lý do', 'submitted')`,
    );
    const r1 = await decideDesignChange({
      designChangeId: dc1,
      decision: "approved",
      decisionNote: null,
      decidedBy: pmId,
    });
    assert.ok(typeof r1 !== "string");
    const dc1Row = await queryOne<{ status: string }>(
      `SELECT status FROM design_changes WHERE id = ?`,
      dc1,
    );
    assert.equal(dc1Row?.status, "approved");

    // DC có tác động chi phí → duyệt thiếu ghi chú bị chặn, có ghi chú thì qua.
    const dc2 = await insertId(
      `INSERT INTO design_changes (code, title, reason, impact_cost, status)
       VALUES ('DC-TEST-D2', 'DC có tác động chi phí', 'Lý do', 'Phát sinh vật tư', 'submitted')`,
    );
    const noNote = await decideDesignChange({
      designChangeId: dc2,
      decision: "approved",
      decisionNote: null,
      decidedBy: pmId,
    });
    assert.equal(typeof noNote, "string");
    const withNote = await decideDesignChange({
      designChangeId: dc2,
      decision: "approved",
      decisionNote: "Đã thống nhất chi phí phát sinh với CĐT",
      decidedBy: pmId,
    });
    assert.ok(typeof withNote !== "string");

    // markDrawingUpdated: chỉ hợp lệ khi DC đã 'approved'; DC1 (approved) → OK; DC còn
    // 'submitted' → lỗi.
    const dc3 = await insertId(
      `INSERT INTO design_changes (code, title, reason, status)
       VALUES ('DC-TEST-D3', 'DC chưa duyệt', 'Lý do', 'submitted')`,
    );
    const errPending = await markDrawingUpdated(dc3);
    assert.ok(errPending);
    const okApproved = await markDrawingUpdated(dc1);
    assert.equal(okApproved, null);
    const dc1After = await queryOne<{ status: string }>(
      `SELECT status FROM design_changes WHERE id = ?`,
      dc1,
    );
    assert.equal(dc1After?.status, "drawing_updated");

    // Quyết lại lần nữa (đã có quyết định) → bị chặn.
    const again = await decideDesignChange({
      designChangeId: dc2,
      decision: "rejected",
      decisionNote: "x",
      decidedBy: pmId,
    });
    assert.equal(typeof again, "string");

    await run(`DELETE FROM design_changes WHERE id IN (?, ?, ?)`, dc1, dc2, dc3);
    await run(`DELETE FROM users WHERE id = ?`, pmId);
  },
);
