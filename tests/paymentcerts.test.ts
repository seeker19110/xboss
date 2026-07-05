import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateCertItems: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateCertItems } = await import("@/lib/paymentcerts");

  assert.equal(validateCertItems([{ boqItemId: 1, qtyPeriod: 10 }]), null);
  assert.match(validateCertItems([])!, /ít nhất 1 dòng/i);
  assert.match(validateCertItems([{ boqItemId: NaN, qtyPeriod: 10 }])!, /thiếu dòng boq/i);
  assert.match(validateCertItems([{ boqItemId: 1, qtyPeriod: -1 }])!, /phải ≥ 0/i);
  assert.match(
    validateCertItems([
      { boqItemId: 1, qtyPeriod: 10 },
      { boqItemId: 1, qtyPeriod: 5 },
    ])!,
    /trùng lặp/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

async function setupContractWithBoq() {
  const { run, insertId } = await import("@/lib/db");
  const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test IPC')`);
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_supplier_id, value, advance_pct, retention_pct, status)
     VALUES ('HD-TEST-IPC', 'giao_thau', 'HĐ test IPC', ?, 100000, 10, 5, 'active')`,
    supplierId,
  );
  const boqId1 = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
     VALUES ('IPC-TEST-L1', 'Dòng 1', 'm', 100, 1000, ?)`,
    contractId,
  );
  const boqId2 = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
     VALUES ('IPC-TEST-L2', 'Dòng 2', 'm', 50, 2000, ?)`,
    contractId,
  );
  return { supplierId, contractId, boqId1, boqId2, run, insertId };
}

test(
  "suggestQtyForContract: gợi ý KL = KL thực hiện − luỹ kế đợt approved trước (draft/rejected không tính)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, contractId, boqId1 } = await setupContractWithBoq();
    const { suggestQtyForContract } = await import("@/lib/paymentcerts");

    // Map task hoàn thành 60% vào dòng 1 (qty_contract=100) → KL thực hiện = 60.
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test IPC')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTIPC', 'Sheet test')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'I1', 'Nhóm test')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'I1,01', 'Task test', 0.6)`,
      pkgId,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
      boqId1,
      taskId,
    );

    // Chưa có đợt approved trước → gợi ý = KL thực hiện = 60.
    let suggested = await suggestQtyForContract(contractId);
    assert.equal(suggested.find((s) => s.boqItemId === boqId1)!.qtySuggested, 60);

    // Tạo 1 đợt approved với qty_cumulative = 30 cho dòng 1 → gợi ý lần sau = 60 − 30 = 30.
    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
       VALUES ('IPC-TEST-001', ?, 1, 'approved')`,
      contractId,
    );
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, 30, 30, 1000)`,
      certId,
      boqId1,
    );
    suggested = await suggestQtyForContract(contractId);
    assert.equal(suggested.find((s) => s.boqItemId === boqId1)!.qtySuggested, 30);

    // Luỹ kế đợt trước (60) ≥ KL thực hiện (60) → gợi ý không âm (0), không phải -0 hay số âm.
    await run(`UPDATE payment_cert_items SET qty_cumulative = 60 WHERE cert_id = ?`, certId);
    suggested = await suggestQtyForContract(contractId);
    assert.equal(suggested.find((s) => s.boqItemId === boqId1)!.qtySuggested, 0);

    await run(`DELETE FROM payment_certs WHERE id = ?`, certId); // cascade payment_cert_items
    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, boqId1);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM boq_items WHERE contract_id = ?`, contractId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);

test(
  "certTotals: tính đúng periodValue/advanceDeduct/retentionDeduct/approvedValue",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, contractId, boqId1, boqId2 } = await setupContractWithBoq();
    const { certTotals } = await import("@/lib/paymentcerts");

    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
       VALUES ('IPC-TEST-002', ?, 1, 'draft')`,
      contractId,
    );
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, 10, 10, 1000), (?, ?, 5, 5, 2000)`,
      certId,
      boqId1,
      certId,
      boqId2,
    );

    const totals = await certTotals(certId);
    // periodValue = 10*1000 + 5*2000 = 20,000; advance 10% = 2,000; retention 5% = 1,000.
    assert.equal(totals.periodValue, 20_000);
    assert.equal(totals.advanceDeduct, 2_000);
    assert.equal(totals.retentionDeduct, 1_000);
    assert.equal(totals.approvedValue, 20_000 - 2_000 - 1_000);

    await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
    await run(`DELETE FROM boq_items WHERE contract_id = ?`, contractId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);

test(
  "overContractCerts: xuất hiện khi luỹ kế đợt approved vượt giá trị HĐ, biến mất khi không còn vượt",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, contractId, boqId1 } = await setupContractWithBoq();
    const { overContractCerts } = await import("@/lib/paymentcerts");

    // HĐ giá trị 100,000 — đợt approved luỹ kế 150 * 1000 = 150,000 > 100,000 → phải cảnh báo.
    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
       VALUES ('IPC-TEST-003', ?, 1, 'approved')`,
      contractId,
    );
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, 150, 150, 1000)`,
      certId,
      boqId1,
    );

    let over = await overContractCerts();
    assert.ok(over.some((o) => o.contractId === contractId));

    // Sửa lại luỹ kế về mức không vượt (80,000 < 100,000) → không còn cảnh báo.
    await run(`UPDATE payment_cert_items SET qty_cumulative = 80 WHERE cert_id = ?`, certId);
    over = await overContractCerts();
    assert.ok(!over.some((o) => o.contractId === contractId));

    await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
    await run(`DELETE FROM boq_items WHERE contract_id = ?`, contractId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);

test(
  "UNIQUE(contract_id, period_no) chống trùng đợt trên cùng hợp đồng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, contractId } = await setupContractWithBoq();
    const { isUniqueViolation } = await import("@/lib/seqcode");

    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no) VALUES ('IPC-TEST-004', ?, 1)`,
      contractId,
    );
    await assert.rejects(
      insertId(
        `INSERT INTO payment_certs (code, contract_id, period_no) VALUES ('IPC-TEST-005', ?, 1)`,
        contractId,
      ),
      (err: unknown) => isUniqueViolation(err),
    );

    await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
    await run(`DELETE FROM boq_items WHERE contract_id = ?`, contractId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);
