import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateVoInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateVoInput } = await import("@/lib/vo");

  const base = {
    title: "Bổ sung ống gió tầng 5",
    reason: "design_change" as const,
    description: null,
    disciplineId: null,
    lines: [{ code: "VO-L1", name: "Ống gió D200", unit: "m", qty: 10, unitPrice: 500 }],
  };

  assert.equal(validateVoInput(base), null);
  assert.match(validateVoInput({ ...base, title: "" })!, /tên phát sinh/i);
  assert.match(validateVoInput({ ...base, reason: "xxx" as never })!, /lý do phát sinh/i);
  assert.match(validateVoInput({ ...base, lines: [] })!, /ít nhất 1 dòng/i);
  assert.match(validateVoInput({ ...base, lines: [{ ...base.lines[0], code: "" }] })!, /thiếu mã/i);
  assert.match(
    validateVoInput({ ...base, lines: [{ ...base.lines[0], qty: 0 }] })!,
    /khối lượng phải > 0/i,
  );
  assert.match(
    validateVoInput({ ...base, lines: [{ ...base.lines[0], unitPrice: -1 }] })!,
    /đơn giá phải/i,
  );
  assert.match(
    validateVoInput({
      ...base,
      lines: [base.lines[0], { ...base.lines[0] }],
    })!,
    /trùng với dòng khác/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "listVariations/getVariation: proposedValue/approvedValue đúng theo trạng thái duyệt",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listVariations, getVariation } = await import("@/lib/vo");

    const voId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status)
       VALUES ('VO-TEST-001', 'VO test', 'other', 'draft')`,
    );
    const line1 = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, vo_id)
       VALUES ('VO-TEST-L1', 'Dòng 1', 'm', 10, 100, ?)`,
      voId,
    );
    const line2 = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, vo_id)
       VALUES ('VO-TEST-L2', 'Dòng 2', 'm', 20, 200, ?)`,
      voId,
    );

    // Nháp: proposedValue tính đủ, approvedValue = 0 (chưa duyệt).
    let vo = await getVariation(voId);
    assert.equal(Number(vo!.proposedValue), 10 * 100 + 20 * 200);
    assert.equal(Number(vo!.approvedValue), 0);

    // Duyệt một phần: dòng 1 duyệt đủ, dòng 2 duyệt phân nửa.
    await run(`UPDATE boq_items SET qty_approved = 10 WHERE id = ?`, line1);
    await run(`UPDATE boq_items SET qty_approved = 10 WHERE id = ?`, line2); // 10/20 = phân nửa
    await run(`UPDATE variation_orders SET status = 'partially_approved' WHERE id = ?`, voId);

    vo = await getVariation(voId);
    assert.equal(Number(vo!.approvedValue), 10 * 100 + 10 * 200);

    const rows = await listVariations({ status: "partially_approved" });
    assert.ok(rows.some((r) => r.id === voId));
    assert.equal(
      (await listVariations({ status: "draft" })).some((r) => r.id === voId),
      false,
    );

    await run(`DELETE FROM variation_orders WHERE id = ?`, voId); // cascade xoá boq_items
  },
);

test(
  "pendingVariations: chỉ xuất hiện VO 'submitted' quá hạn N ngày chưa quyết",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { pendingVariations } = await import("@/lib/vo");
    const { daysFromTodayISO } = await import("@/lib/date");

    const overdueId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status, submitted_at)
       VALUES ('VO-TEST-OVERDUE', 'VO quá hạn', 'other', 'submitted', ?)`,
      daysFromTodayISO(-10),
    );
    const freshId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status, submitted_at)
       VALUES ('VO-TEST-FRESH', 'VO mới trình', 'other', 'submitted', ?)`,
      daysFromTodayISO(-1),
    );
    const draftId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status)
       VALUES ('VO-TEST-DRAFT', 'VO nháp', 'other', 'draft')`,
    );

    const pending = await pendingVariations(7);
    const ids = pending.map((v) => v.id);
    assert.ok(ids.includes(overdueId));
    assert.ok(!ids.includes(freshId));
    assert.ok(!ids.includes(draftId));

    await run(`DELETE FROM variation_orders WHERE id IN (?, ?, ?)`, overdueId, freshId, draftId);
  },
);

test(
  "lib/cost.ts budgetBySystem/disciplineBudget: gồm/loại VO đã duyệt theo includeVo",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { costSummary, disciplineBudget } = await import("@/lib/cost");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'dien'`);
    assert.ok(dien);

    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, discipline_id, qty_contract, unit_price)
       VALUES ('VO-TEST-BOQ-BASE', 'Gốc', 'm', ?, 100, 1000)`,
      dien!.id,
    );
    const voId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, discipline_id, status)
       VALUES ('VO-TEST-COST', 'VO test cost', 'other', ?, 'approved')`,
      dien!.id,
    );
    await insertId(
      `INSERT INTO boq_items (code, name, unit, discipline_id, qty_contract, qty_approved, unit_price, vo_id)
       VALUES ('VO-TEST-BOQ-VO', 'Dòng VO', 'm', ?, 10, 10, 500, ?)`,
      dien!.id,
      voId,
    );

    // includeVo=true (mặc định): 100,000 (gốc) + 5,000 (VO đã duyệt) = 105,000.
    const rowsWithVo = await costSummary("system", true);
    const rowWithVo = rowsWithVo.find((r) => r.key === "dien");
    assert.equal(Number(rowWithVo!.budget), 100_000 + 5_000);
    assert.equal(await disciplineBudget(dien!.id, true), 100_000 + 5_000);

    // includeVo=false: chỉ dòng gốc.
    const rowsNoVo = await costSummary("system", false);
    const rowNoVo = rowsNoVo.find((r) => r.key === "dien");
    assert.equal(Number(rowNoVo!.budget), 100_000);
    assert.equal(await disciplineBudget(dien!.id, false), 100_000);

    await run(`DELETE FROM variation_orders WHERE id = ?`, voId); // cascade xoá dòng KL của VO
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
  },
);

test(
  "listVariations/getVariation: scoped đúng theo project_id (M22), không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listVariations, getVariation } = await import("@/lib/vo");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA VO 1', 'PJT-VO1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA VO 2', 'PJT-VO2')`);
    const vo1 = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status, project_id)
       VALUES ('VO-SCOPE-01', 'VO DA1', 'other', 'draft', ?)`,
      p1,
    );
    const vo2 = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status, project_id)
       VALUES ('VO-SCOPE-02', 'VO DA2', 'other', 'draft', ?)`,
      p2,
    );

    const list1 = await listVariations({ projectId: p1 });
    assert.ok(list1.some((v) => v.id === vo1));
    assert.ok(!list1.some((v) => v.id === vo2));

    assert.ok(await getVariation(vo1, p1));
    assert.equal(await getVariation(vo2, p1), undefined);

    await run(`DELETE FROM variation_orders WHERE id IN (?, ?)`, vo1, vo2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
