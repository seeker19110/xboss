import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "costSummary(system): ngân sách BOQ + cam kết (PO không huỷ + giao thầu) + thực chi (mọi type bill)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { costSummary, systemBudget } = await import("@/lib/cost");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = 'dien'`);
    assert.ok(dien);

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test cost')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, 'TESTCOST', 'Sheet chi phí', ?)`,
      towerId,
      dien!.id,
    );

    // Ngân sách: 1 dòng BOQ 100 x 1000 = 100,000.
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price)
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

    assert.equal(await systemBudget(dien!.id), 100_000);

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
  "costSummary(system, projectId): tách đúng ngân sách/cam kết/thực chi theo dự án, không rò rỉ chéo (M22+)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { costSummary } = await import("@/lib/cost");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = 'dien'`);
    assert.ok(dien);

    // 2 dự án độc lập, mỗi dự án có tháp/sheet/BOQ/PO/giao thầu/bill riêng.
    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Test cost A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Test cost B')`);
    const towerA = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
      projA,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp B')`,
      projB,
    );
    const stA = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, 'TESTCOSTA', 'Sheet chi phí A', ?)`,
      towerA,
      dien!.id,
    );
    const stB = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, 'TESTCOSTB', 'Sheet chi phí B', ?)`,
      towerB,
      dien!.id,
    );

    // Ngân sách: BOQ gắn project_id trực tiếp (migration 0027).
    const boqA = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id)
       VALUES ('TESTBOQ-A', 'Ống gió A', 'm', ?, 100, 1000, ?)`,
      dien!.id,
      projA,
    );
    const boqB = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id)
       VALUES ('TESTBOQ-B', 'Ống gió B', 'm', ?, 200, 1000, ?)`,
      dien!.id,
      projB,
    );

    // Cam kết: PO gắn project_id trực tiếp.
    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test Cost AB')`);
    const matA = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit) VALUES (?, 'Vật tư A', 'cái')`,
      stA,
    );
    const matB = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit) VALUES (?, 'Vật tư B', 'cái')`,
      stB,
    );
    const poA = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status, project_id) VALUES (?, 'confirmed', ?)`,
      supplierId,
      projA,
    );
    const poB = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status, project_id) VALUES (?, 'confirmed', ?)`,
      supplierId,
      projB,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 10, 500)`,
      poA,
      matA,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 10, 700)`,
      poB,
      matB,
    );

    // Cam kết: giao thầu theo tầng (floor_contracts không có project_id riêng, suy qua tower).
    await run(
      `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, 'T1', 20000)`,
      stA,
    );
    await run(
      `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, 'T1', 30000)`,
      stB,
    );

    // Thực chi (payment_bills không có project_id riêng, suy qua tower).
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label)
       VALUES ('Test', 'bill', 3000, CURRENT_DATE, ?, 'T1')`,
      stA,
    );
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label)
       VALUES ('Test', 'bill', 4000, CURRENT_DATE, ?, 'T1')`,
      stB,
    );

    const rowsA = await costSummary("system", true, projA);
    const rowA = rowsA.find((r) => r.key === "dien");
    assert.ok(rowA, "phải có dòng cho hệ điện ở dự án A");
    assert.equal(rowA!.budget, 100_000); // 100 x 1000, không lẫn BOQ B
    assert.equal(rowA!.committed, 5_000 + 20_000); // PO A + giao thầu A
    assert.equal(rowA!.actual, 3_000); // bill A

    const rowsB = await costSummary("system", true, projB);
    const rowB = rowsB.find((r) => r.key === "dien");
    assert.ok(rowB, "phải có dòng cho hệ điện ở dự án B");
    assert.equal(rowB!.budget, 200_000); // 200 x 1000, không lẫn BOQ A
    assert.equal(rowB!.committed, 7_000 + 30_000); // PO B + giao thầu B
    assert.equal(rowB!.actual, 4_000); // bill B

    // Dọn dữ liệu test.
    await run(`DELETE FROM payment_bills WHERE sheet_type_id IN (?, ?)`, stA, stB);
    await run(`DELETE FROM floor_contracts WHERE sheet_type_id IN (?, ?)`, stA, stB);
    await run(`DELETE FROM po_items WHERE po_id IN (?, ?)`, poA, poB);
    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poA, poB);
    await run(`DELETE FROM materials WHERE id IN (?, ?)`, matA, matB);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    await run(`DELETE FROM boq_items WHERE id IN (?, ?)`, boqA, boqB);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, stA, stB);
    await run(`DELETE FROM towers WHERE id IN (?, ?)`, towerA, towerB);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
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
