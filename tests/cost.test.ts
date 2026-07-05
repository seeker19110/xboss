import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "costSummary(system): ngân sách BOQ + cam kết (PO không huỷ + giao thầu) + thực chi (mọi type bill)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { costSummary, disciplineBudget } = await import("@/lib/cost");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'dien'`);
    assert.ok(dien);

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test cost')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, discipline_id) VALUES (?, 'TESTCOST', 'Sheet chi phí', ?)`,
      towerId,
      dien!.id,
    );

    // Ngân sách: 1 dòng BOQ 100 x 1000 = 100,000.
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, discipline_id, qty_contract, unit_price)
       VALUES ('TESTBOQ-COST', 'Ống gió test', 'm', ?, 100, 1000)`,
      dien!.id,
    );

    // Cam kết: PO còn hiệu lực 10 x 500 = 5,000 (tính); PO đã huỷ 10 x 999 = 9,990 (KHÔNG tính).
    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test Cost')`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit) VALUES (?, 'Vật tư test cost', 'cái')`,
      stId,
    );
    const poOkId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status) VALUES (?, 'confirmed')`,
      supplierId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 10, 500)`,
      poOkId,
      matId,
    );
    const poCancelledId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status) VALUES (?, 'cancelled')`,
      supplierId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 10, 999)`,
      poCancelledId,
      matId,
    );

    // Cam kết: giao thầu theo tầng 20,000.
    await run(
      `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, 'T1', 20000)`,
      stId,
    );

    // Thực chi: bill 3,000 + advance 1,000 (advance TÍNH vào thực chi — đã quyết 2026-07-04).
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label)
       VALUES ('Test', 'bill', 3000, CURRENT_DATE, ?, 'T1')`,
      stId,
    );
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label)
       VALUES ('Test', 'advance', 1000, CURRENT_DATE, ?, 'T1')`,
      stId,
    );

    const rows = await costSummary("system");
    const row = rows.find((r) => r.key === "dien");
    assert.ok(row, "phải có dòng cho hệ điện");
    assert.equal(row!.budget, 100_000);
    assert.equal(row!.committed, 5_000 + 20_000); // PO huỷ không tính
    assert.equal(row!.actual, 3_000 + 1_000); // advance tính vào thực chi

    assert.equal(await disciplineBudget(dien!.id), 100_000);

    // Dọn dữ liệu test.
    await run(`DELETE FROM payment_bills WHERE sheet_type_id = ?`, stId);
    await run(`DELETE FROM floor_contracts WHERE sheet_type_id = ?`, stId);
    await run(`DELETE FROM po_items WHERE po_id IN (?, ?)`, poOkId, poCancelledId);
    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poOkId, poCancelledId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "getCostSettings/updateCostSettings: đọc mặc định + cập nhật ngưỡng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { getCostSettings, updateCostSettings } = await import("@/lib/cost");

    const before = await getCostSettings();
    assert.equal(before.warnPct, 90);
    assert.equal(before.overPct, 100);

    await updateCostSettings({ warnPct: 80, overPct: 110 });
    const after = await getCostSettings();
    assert.equal(after.warnPct, 80);
    assert.equal(after.overPct, 110);

    // Khôi phục mặc định để không ảnh hưởng test khác.
    await updateCostSettings({ warnPct: 90, overPct: 100 });
  },
);
