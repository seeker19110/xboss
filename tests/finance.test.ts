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

test("parseInvoiceBody: đọc body JSON thành InvoiceInput", async () => {
  const { parseInvoiceBody } = await import("@/lib/finance");

  const input = parseInvoiceBody({
    invoiceNo: " HD001 ",
    invoiceDate: "2026-07-01",
    direction: "out",
    netAmount: "1000000",
    vatAmount: "100000",
    vatRate: "10",
    counterparty: " Công ty A ",
  });
  assert.equal(input.invoiceNo, "HD001");
  assert.equal(input.direction, "out");
  assert.equal(input.netAmount, 1000000);
  assert.equal(input.vatAmount, 100000);
  assert.equal(input.vatRate, 10);
  assert.equal(input.counterparty, "Công ty A");
  assert.equal(input.contractId, null);

  const empty = parseInvoiceBody({});
  assert.equal(empty.invoiceNo, null);
  assert.equal(empty.netAmount, 0);
  assert.equal(empty.vatRate, null);
});

test("parsePayrollBody: đọc body JSON thành PayrollInput", async () => {
  const { parsePayrollBody } = await import("@/lib/finance");

  const input = parsePayrollBody({
    period: "2026-07",
    personnelId: "5",
    workdays: "26",
    rate: "300000",
    gross: "7800000",
    deductions: "200000",
    net: "7600000",
    status: "approved",
  });
  assert.equal(input.period, "2026-07");
  assert.equal(input.personnelId, 5);
  assert.equal(input.crewId, null);
  assert.equal(input.workdays, 26);
  assert.equal(input.status, "approved");

  const empty = parsePayrollBody({});
  assert.equal(empty.status, "draft");
  assert.equal(empty.workdays, 0);
});

test(
  "vatSummary: gộp đúng VAT vào/ra theo kỳ, không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { vatSummary } = await import("@/lib/finance");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA VAT 1', 'PJT-VAT1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA VAT 2', 'PJT-VAT2')`);

    const ids: number[] = [];
    ids.push(
      await insertId(
        `INSERT INTO invoices (project_id, invoice_date, direction, net_amount, vat_amount)
         VALUES (?, '2026-07-05', 'out', 10000000, 1000000)`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO invoices (project_id, invoice_date, direction, net_amount, vat_amount)
         VALUES (?, '2026-07-06', 'in', 4000000, 400000)`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO invoices (project_id, invoice_date, direction, net_amount, vat_amount)
         VALUES (?, '2026-07-07', 'out', 999999999, 99999999)`,
        p2,
      ),
    );

    const vat1 = await vatSummary("2026-07", p1);
    assert.equal(vat1.vatOut, 1000000);
    assert.equal(vat1.vatIn, 400000);
    assert.equal(vat1.netVat, 600000);

    const vat2 = await vatSummary("2026-07", p2);
    assert.equal(vat2.vatOut, 99999999);
    assert.equal(vat2.vatIn, 0);

    await run(`DELETE FROM invoices WHERE id = ANY(?)`, ids);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "payrollFromAttendance: tính đúng công theo người từ attendance thật, bỏ chấm công theo tổ (gộp)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { payrollFromAttendance } = await import("@/lib/finance");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA LUONG 1', 'PJT-LUONG1')`,
    );
    const personnelId = await insertId(
      `INSERT INTO personnel (project_id, full_name) VALUES (?, 'Nguyễn Văn Công')`,
      p1,
    );
    const crewId = await insertId(
      `INSERT INTO crews (project_id, name) VALUES (?, 'Tổ điện nước')`,
      p1,
    );

    const attIds: number[] = [];
    // Chấm công theo người: 3 ngày có mặt trong kỳ 2026-07.
    for (const d of ["2026-07-01", "2026-07-02", "2026-07-03"]) {
      attIds.push(
        await insertId(
          `INSERT INTO attendance (project_id, work_date, personnel_id, present)
           VALUES (?, ?, ?, true)`,
          p1,
          d,
          personnelId,
        ),
      );
    }
    // Chấm công theo tổ (gộp, headcount) — không tách được người cụ thể, không vào gợi ý.
    attIds.push(
      await insertId(
        `INSERT INTO attendance (project_id, work_date, crew_id, headcount)
         VALUES (?, '2026-07-01', ?, 5)`,
        p1,
        crewId,
      ),
    );

    const suggestions = await payrollFromAttendance("2026-07", p1);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].personnelId, personnelId);
    assert.equal(suggestions[0].workdays, 3);

    await run(`DELETE FROM attendance WHERE id = ANY(?)`, attIds);
    await run(`DELETE FROM crews WHERE id = ?`, crewId);
    await run(`DELETE FROM personnel WHERE id = ?`, personnelId);
    await run(`DELETE FROM projects WHERE id = ?`, p1);
  },
);

test(
  "advanceOverdueList: chỉ trả tạm ứng quá ngưỡng ngày chưa settled, scoping đúng dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { advanceOverdueList } = await import("@/lib/finance");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA TUQH 1', 'PJT-TUQH1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA TUQH 2', 'PJT-TUQH2')`,
    );

    // Quá hạn: tạm ứng cách đây 40 ngày, chưa settled.
    const overdueId = await insertId(
      `INSERT INTO advances (project_id, code, advance_date, amount, recipient, status)
       VALUES (?, 'TU-OVERDUE', CURRENT_DATE - INTERVAL '40 days', 2000000, 'A', 'open')`,
      p1,
    );
    // Chưa quá hạn: mới tạm ứng 5 ngày trước.
    const freshId = await insertId(
      `INSERT INTO advances (project_id, code, advance_date, amount, recipient, status)
       VALUES (?, 'TU-FRESH', CURRENT_DATE - INTERVAL '5 days', 1000000, 'B', 'open')`,
      p1,
    );
    // Đã settled dù quá hạn ngày — không được tính là quá hạn hoàn ứng.
    const settledId = await insertId(
      `INSERT INTO advances (project_id, code, advance_date, amount, settled_amount, recipient, status)
       VALUES (?, 'TU-SETTLED', CURRENT_DATE - INTERVAL '50 days', 3000000, 3000000, 'C', 'settled')`,
      p1,
    );
    // Dự án khác — không được lẫn vào kết quả DA1.
    const otherProjectId = await insertId(
      `INSERT INTO advances (project_id, code, advance_date, amount, recipient, status)
       VALUES (?, 'TU-OTHERPRJ', CURRENT_DATE - INTERVAL '40 days', 5000000, 'D', 'open')`,
      p2,
    );

    const overdue1 = await advanceOverdueList(30, p1);
    assert.equal(overdue1.length, 1);
    assert.equal(overdue1[0].id, overdueId);

    const overdue2 = await advanceOverdueList(30, p2);
    assert.equal(overdue2.length, 1);
    assert.equal(overdue2[0].id, otherProjectId);

    await run(
      `DELETE FROM advances WHERE id IN (?, ?, ?, ?)`,
      overdueId,
      freshId,
      settledId,
      otherProjectId,
    );
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
