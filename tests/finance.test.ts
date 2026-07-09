import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateCashTransactionInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateCashTransactionInput } = await import("@/lib/finance");

  assert.equal(
    validateCashTransactionInput({
      txDate: "2026-07-09",
      direction: "in",
      category: "tạm ứng",
      amount: 1_000_000,
      isPettyCash: false,
      contractId: null,
      supplierId: null,
      voucherCode: null,
      description: null,
    }),
    null,
  );
  assert.match(
    validateCashTransactionInput({
      txDate: "09/07/2026",
      direction: "in",
      category: null,
      amount: 1,
      isPettyCash: false,
      contractId: null,
      supplierId: null,
      voucherCode: null,
      description: null,
    })!,
    /ngày giao dịch/i,
  );
  assert.match(
    validateCashTransactionInput({
      txDate: "2026-07-09",
      direction: "xxx" as never,
      category: null,
      amount: 1,
      isPettyCash: false,
      contractId: null,
      supplierId: null,
      voucherCode: null,
      description: null,
    })!,
    /chiều giao dịch/i,
  );
  assert.match(
    validateCashTransactionInput({
      txDate: "2026-07-09",
      direction: "out",
      category: null,
      amount: 0,
      isPettyCash: false,
      contractId: null,
      supplierId: null,
      voucherCode: null,
      description: null,
    })!,
    /số tiền/i,
  );
});

test("validateAdvanceInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateAdvanceInput } = await import("@/lib/finance");

  assert.equal(
    validateAdvanceInput({
      code: "TU-001",
      advanceDate: "2026-07-01",
      amount: 5_000_000,
      recipient: "Nguyễn Văn A",
      reason: "Mua vật tư",
      proposalId: null,
    }),
    null,
  );
  assert.match(
    validateAdvanceInput({
      code: null,
      advanceDate: null,
      amount: 0,
      recipient: "A",
      reason: null,
      proposalId: null,
    })!,
    /số tiền tạm ứng/i,
  );
  assert.match(
    validateAdvanceInput({
      code: null,
      advanceDate: null,
      amount: 100,
      recipient: null,
      reason: null,
      proposalId: null,
    })!,
    /người nhận/i,
  );
  assert.match(
    validateAdvanceInput({
      code: null,
      advanceDate: "01/07/2026",
      amount: 100,
      recipient: "A",
      reason: null,
      proposalId: null,
    })!,
    /ngày tạm ứng/i,
  );
});

test("deriveAdvanceStatus: open/partially_settled/settled", async () => {
  const { deriveAdvanceStatus } = await import("@/lib/finance");

  assert.equal(deriveAdvanceStatus(1000, 0), "open");
  assert.equal(deriveAdvanceStatus(1000, 400), "partially_settled");
  assert.equal(deriveAdvanceStatus(1000, 1000), "settled");
  assert.equal(deriveAdvanceStatus(1000, 1200), "settled"); // hoàn vượt vẫn coi là settled
});

test("validateInvoiceInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateInvoiceInput } = await import("@/lib/finance");

  assert.equal(
    validateInvoiceInput({
      invoiceNo: "HD001",
      invoiceDate: "2026-07-01",
      direction: "out",
      netAmount: 1_000_000,
      vatAmount: 100_000,
      vatRate: 10,
      counterparty: "Công ty A",
      contractId: null,
      paymentBillId: null,
    }),
    null,
  );
  assert.match(
    validateInvoiceInput({
      invoiceNo: null,
      invoiceDate: null,
      direction: "xxx" as never,
      netAmount: 1,
      vatAmount: 1,
      vatRate: 10,
      counterparty: null,
      contractId: null,
      paymentBillId: null,
    })!,
    /chiều hoá đơn/i,
  );
  assert.match(
    validateInvoiceInput({
      invoiceNo: null,
      invoiceDate: null,
      direction: "in",
      netAmount: -1,
      vatAmount: 1,
      vatRate: 10,
      counterparty: null,
      contractId: null,
      paymentBillId: null,
    })!,
    /trước thuế/i,
  );
  assert.match(
    validateInvoiceInput({
      invoiceNo: null,
      invoiceDate: null,
      direction: "in",
      netAmount: 1,
      vatAmount: 1,
      vatRate: 150,
      counterparty: null,
      contractId: null,
      paymentBillId: null,
    })!,
    /thuế suất/i,
  );
});

test("validatePayrollInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validatePayrollInput } = await import("@/lib/finance");

  assert.equal(
    validatePayrollInput({
      period: "2026-07",
      crewId: 1,
      personnelId: null,
      workdays: 26,
      rate: 300_000,
      gross: 7_800_000,
      deductions: 200_000,
      net: 7_600_000,
      status: "draft",
    }),
    null,
  );
  assert.match(
    validatePayrollInput({
      period: "07-2026",
      crewId: 1,
      personnelId: null,
      workdays: 26,
      rate: 300_000,
      gross: 7_800_000,
      deductions: 200_000,
      net: 7_600_000,
      status: "draft",
    })!,
    /kỳ lương/i,
  );
  assert.match(
    validatePayrollInput({
      period: "2026-07",
      crewId: null,
      personnelId: null,
      workdays: 26,
      rate: 300_000,
      gross: 7_800_000,
      deductions: 200_000,
      net: 7_600_000,
      status: "draft",
    })!,
    /tổ đội hoặc nhân sự/i,
  );
  assert.match(
    validatePayrollInput({
      period: "2026-07",
      crewId: 1,
      personnelId: null,
      workdays: -1,
      rate: 300_000,
      gross: 7_800_000,
      deductions: 200_000,
      net: 7_600_000,
      status: "draft",
    })!,
    /công phải/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "cashflowActual: gộp đúng thu/chi theo tháng, không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { cashflowActual } = await import("@/lib/finance");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA TC 1', 'PJT-TC1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA TC 2', 'PJT-TC2')`);

    const ids: number[] = [];
    ids.push(
      await insertId(
        `INSERT INTO cash_transactions (project_id, tx_date, direction, amount) VALUES (?, '2026-07-05', 'in', 5000000)`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO cash_transactions (project_id, tx_date, direction, amount) VALUES (?, '2026-07-06', 'out', 2000000)`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO cash_transactions (project_id, tx_date, direction, amount) VALUES (?, '2026-07-07', 'in', 999999999)`,
        p2,
      ),
    );

    const rows1 = await cashflowActual(p1, 12);
    const month = rows1.find((r) => r.month === "2026-07");
    assert.ok(month);
    assert.equal(month!.in, 5000000);
    assert.equal(month!.out, 2000000);

    const rows2 = await cashflowActual(p2, 12);
    const month2 = rows2.find((r) => r.month === "2026-07");
    assert.equal(month2!.in, 999999999);
    assert.equal(month2!.out, 0);

    await run(`DELETE FROM cash_transactions WHERE id = ANY(?)`, ids);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "receivables/payables: khớp HĐ + PO 2 dự án không lẫn (scoping)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { receivables, payables } = await import("@/lib/finance");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA CN 1', 'PJT-CN1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA CN 2', 'PJT-CN2')`);

    // HĐ nhận thầu (phải thu): giá trị 100tr, đã thu 30tr → còn 70tr.
    const cInId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, project_id)
       VALUES ('HD-FIN-IN-1', 'nhan_thau', 'CĐT Test', 'HĐ nhận thầu DA1', 100000000, 'active', ?)`,
      p1,
    );
    const billInId = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id)
       VALUES ('CĐT Test', 'bill', 30000000, '2026-07-01', ?)`,
      cInId,
    );

    // HĐ giao thầu (phải trả): giá trị 50tr, đã trả 10tr → còn 40tr.
    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test Finance')`);
    const cOutId = await insertId(
      `INSERT INTO contracts (code, kind, party_supplier_id, title, value, status, project_id)
       VALUES ('HD-FIN-OUT-1', 'giao_thau', ?, 'HĐ giao thầu DA1', 50000000, 'active', ?)`,
      supplierId,
      p1,
    );
    const billOutId = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id)
       VALUES ('NCC Test Finance', 'bill', 10000000, '2026-07-01', ?)`,
      cOutId,
    );

    // PO không gắn HĐ (DA1): 5 × 200,000 = 1tr — cộng thêm vào phải trả.
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, supplier_id, status, project_id) VALUES ('PO-FIN-1', ?, 'draft', ?)`,
      supplierId,
      p1,
    );
    const poItemId = await insertId(
      `INSERT INTO po_items (po_id, qty_ordered, unit_price) VALUES (?, 5, 200000)`,
      poId,
    );

    // Dự án 2: HĐ nhận thầu riêng, không được lẫn vào DA1.
    const cP2Id = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, project_id)
       VALUES ('HD-FIN-IN-2', 'nhan_thau', 'CĐT Test 2', 'HĐ nhận thầu DA2', 999999999, 'active', ?)`,
      p2,
    );

    const rcv1 = await receivables(p1);
    assert.equal(rcv1, 100000000 - 30000000);

    const pay1 = await payables(p1);
    assert.equal(pay1, 50000000 - 10000000 + 5 * 200000);

    const rcv2 = await receivables(p2);
    assert.equal(rcv2, 999999999);
    const pay2 = await payables(p2);
    assert.equal(pay2, 0);

    await run(`DELETE FROM po_items WHERE id = ?`, poItemId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM payment_bills WHERE id IN (?, ?)`, billInId, billOutId);
    await run(`DELETE FROM contracts WHERE id IN (?, ?, ?)`, cInId, cOutId, cP2Id);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "advances: settle chuyển status đúng draft(open)→partially_settled→settled, không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { deriveAdvanceStatus, advanceOutstanding } = await import("@/lib/finance");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA TU 1', 'PJT-TU1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA TU 2', 'PJT-TU2')`);

    const advId = await insertId(
      `INSERT INTO advances (project_id, code, amount, recipient) VALUES (?, 'TU-SCOPE-1', 1000000, 'A')`,
      p1,
    );
    const advP2Id = await insertId(
      `INSERT INTO advances (project_id, code, amount, recipient) VALUES (?, 'TU-SCOPE-2', 500000, 'B')`,
      p2,
    );

    let row = await queryOne<{ status: string; settledAmount: number }>(
      `SELECT status, settled_amount AS "settledAmount" FROM advances WHERE id = ?`,
      advId,
    );
    assert.equal(row?.status, "open");

    // Hoàn ứng một phần: 400,000/1,000,000 → partially_settled.
    let newSettled = Number(row!.settledAmount) + 400000;
    let newStatus = deriveAdvanceStatus(1000000, newSettled);
    assert.equal(newStatus, "partially_settled");
    await run(
      `UPDATE advances SET settled_amount = ?, status = ? WHERE id = ?`,
      newSettled,
      newStatus,
      advId,
    );

    row = await queryOne<{ status: string; settledAmount: number }>(
      `SELECT status, settled_amount AS "settledAmount" FROM advances WHERE id = ?`,
      advId,
    );
    assert.equal(row?.status, "partially_settled");

    // Hoàn ứng phần còn lại: 600,000 nữa → settled.
    newSettled = Number(row!.settledAmount) + 600000;
    newStatus = deriveAdvanceStatus(1000000, newSettled);
    assert.equal(newStatus, "settled");
    await run(
      `UPDATE advances SET settled_amount = ?, status = ? WHERE id = ?`,
      newSettled,
      newStatus,
      advId,
    );

    row = await queryOne<{ status: string; settledAmount: number }>(
      `SELECT status, settled_amount AS "settledAmount" FROM advances WHERE id = ?`,
      advId,
    );
    assert.equal(row?.status, "settled");
    assert.equal(Number(row?.settledAmount), 1000000);

    // Scoping: DA1 đã settled hết → outstanding = 0; DA2 vẫn còn nguyên 500,000.
    assert.equal(await advanceOutstanding(p1), 0);
    assert.equal(await advanceOutstanding(p2), 500000);

    await run(`DELETE FROM advances WHERE id IN (?, ?)`, advId, advP2Id);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
