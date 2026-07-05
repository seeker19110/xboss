import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateContractInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateContractInput } = await import("@/lib/contracts");

  const base = {
    code: "HD-001",
    kind: "ncc" as const,
    title: "Hợp đồng test",
    partySupplierId: 1,
    partyName: null,
    disciplineId: null,
    value: 1000,
    advancePct: 10,
    retentionPct: 5,
    signedDate: "2026-01-01",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    status: "active" as const,
    note: null,
  };

  assert.equal(validateContractInput(base), null);
  assert.match(validateContractInput({ ...base, code: "" })!, /số hợp đồng/i);
  assert.match(validateContractInput({ ...base, title: "" })!, /tên hợp đồng/i);
  assert.match(validateContractInput({ ...base, kind: "xxx" as never })!, /loại hợp đồng/i);
  assert.match(validateContractInput({ ...base, value: -1 })!, /giá trị hợp đồng/i);
  assert.match(validateContractInput({ ...base, advancePct: 150 })!, /tạm ứng/i);
  assert.match(validateContractInput({ ...base, retentionPct: -1 })!, /giữ lại bảo hành/i);
  assert.match(validateContractInput({ ...base, signedDate: "01/01/2026" })!, /ngày ký/i);
  assert.match(
    validateContractInput({ ...base, validFrom: "2026-12-31", validTo: "2026-01-01" })!,
    /hiệu lực từ/i,
  );
  assert.match(
    validateContractInput({ ...base, kind: "nhan_thau", partyName: null })!,
    /nhận thầu cần tên/i,
  );
  assert.match(
    validateContractInput({ ...base, kind: "giao_thau", partySupplierId: null })!,
    /giao thầu.*ncc cần chọn đối tác/i,
  );
  // nhan_thau hợp lệ khi có partyName, không cần partySupplierId
  assert.equal(
    validateContractInput({
      ...base,
      kind: "nhan_thau",
      partySupplierId: null,
      partyName: "Chủ đầu tư ABC",
    }),
    null,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "listContracts + contractLinkCounts: tổng hợp phụ lục/đã thanh toán/PO đúng, đếm liên kết đúng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listContracts, contractLinkCounts } = await import("@/lib/contracts");

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test HĐ')`);
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, party_supplier_id, value, advance_pct, retention_pct, status)
       VALUES ('HD-TEST-001', 'ncc', 'Hợp đồng test NCC', ?, 100000, 10, 5, 'active')`,
      supplierId,
    );

    // Phụ lục +20,000.
    await insertId(
      `INSERT INTO contract_addenda (contract_id, code, value_delta) VALUES (?, 'PL-01', 20000)`,
      contractId,
    );

    // Đã thanh toán 30,000 (payment_bills bắt buộc paid_date NOT NULL).
    const billId = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id)
       VALUES ('NCC Test HĐ', 'bill', 30000, '2026-07-01', ?)`,
      contractId,
    );

    // PO gắn HĐ, còn hiệu lực, 1 dòng 10 x 500 = 5,000.
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, supplier_id, status, contract_id) VALUES ('PO-TESTHD', ?, 'draft', ?)`,
      supplierId,
      contractId,
    );
    const poItemId = await insertId(
      `INSERT INTO po_items (po_id, qty_ordered, unit_price) VALUES (?, 10, 500)`,
      poId,
    );

    const rows = await listContracts("ncc");
    const row = rows.find((r) => r.id === contractId);
    assert.ok(row);
    assert.equal(Number(row!.value), 100000);
    assert.equal(Number(row!.addendaTotal), 20000);
    assert.equal(Number(row!.paid), 30000);
    assert.equal(Number(row!.poCommitted), 5000);

    const links = await contractLinkCounts(contractId);
    assert.equal(links.bills, 1);
    assert.equal(links.pos, 1);
    assert.equal(links.floorContracts, 0);
    assert.equal(links.boqItems, 0);

    await run(`DELETE FROM po_items WHERE id = ?`, poItemId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM payment_bills WHERE id = ?`, billId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);

test(
  "expiringContracts: xuất hiện đúng khi sắp hết hạn/đã quá hạn, không xuất hiện khi còn xa hoặc không active",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { expiringContracts } = await import("@/lib/contracts");
    const { todayISO, daysFromTodayISO } = await import("@/lib/date");

    const soonId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, valid_to)
       VALUES ('HD-TEST-SOON', 'nhan_thau', 'CĐT Test', 'HĐ sắp hết hạn', 0, 'active', ?)`,
      daysFromTodayISO(10),
    );
    const expiredId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, valid_to)
       VALUES ('HD-TEST-EXPIRED', 'nhan_thau', 'CĐT Test', 'HĐ đã quá hạn', 0, 'active', ?)`,
      daysFromTodayISO(-5),
    );
    const farId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, valid_to)
       VALUES ('HD-TEST-FAR', 'nhan_thau', 'CĐT Test', 'HĐ còn xa hạn', 0, 'active', ?)`,
      daysFromTodayISO(365),
    );
    const draftId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, valid_to)
       VALUES ('HD-TEST-DRAFT', 'nhan_thau', 'CĐT Test', 'HĐ nháp sắp hết hạn', 0, 'draft', ?)`,
      daysFromTodayISO(10),
    );

    const list = await expiringContracts(30);
    const ids = list.map((c) => c.id);
    assert.ok(ids.includes(soonId));
    assert.ok(ids.includes(expiredId));
    assert.ok(!ids.includes(farId));
    assert.ok(!ids.includes(draftId)); // draft không active → không cảnh báo

    const soon = list.find((c) => c.id === soonId);
    const expired = list.find((c) => c.id === expiredId);
    assert.equal(soon!.expired, false);
    assert.equal(expired!.expired, true);
    assert.ok(expired!.validTo < todayISO());

    await run(`DELETE FROM contracts WHERE id IN (?, ?, ?, ?)`, soonId, expiredId, farId, draftId);
  },
);

test(
  "UNIQUE code hợp đồng + UNIQUE(contract_id, code) phụ lục chống trùng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { isUniqueViolation } = await import("@/lib/seqcode");

    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status)
       VALUES ('HD-TEST-DUP', 'nhan_thau', 'CĐT Test', 'HĐ chống trùng', 0, 'active')`,
    );

    await assert.rejects(
      insertId(
        `INSERT INTO contracts (code, kind, party_name, title, value, status)
         VALUES ('HD-TEST-DUP', 'nhan_thau', 'CĐT Test', 'HĐ trùng mã', 0, 'active')`,
      ),
      (err: unknown) => isUniqueViolation(err),
    );

    await insertId(
      `INSERT INTO contract_addenda (contract_id, code, value_delta) VALUES (?, 'PL-DUP', 1000)`,
      contractId,
    );
    await assert.rejects(
      insertId(
        `INSERT INTO contract_addenda (contract_id, code, value_delta) VALUES (?, 'PL-DUP', 2000)`,
        contractId,
      ),
      (err: unknown) => isUniqueViolation(err),
    );

    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);
