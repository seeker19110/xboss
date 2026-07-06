import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateTenderInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateTenderInput } = await import("@/lib/tender");

  assert.equal(validateTenderInput({ name: "Gói 1", items: [{ boqItemId: 1, qty: 10 }] }), null);
  assert.match(
    validateTenderInput({ name: "", items: [{ boqItemId: 1, qty: 10 }] })!,
    /tên gói thầu/i,
  );
  assert.match(validateTenderInput({ name: "Gói 1", items: [] })!, /ít nhất 1 dòng/i);
  assert.match(
    validateTenderInput({ name: "Gói 1", items: [{ boqItemId: 1, qty: 0 }] })!,
    /khối lượng mời phải > 0/i,
  );
  assert.match(
    validateTenderInput({
      name: "Gói 1",
      items: [
        { boqItemId: 1, qty: 10 },
        { boqItemId: 1, qty: 5 },
      ],
    })!,
    /trùng lặp/i,
  );
});

test("validateBidPrices: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateBidPrices } = await import("@/lib/tender");

  assert.equal(validateBidPrices([{ boqItemId: 1, unitPrice: 1000 }]), null);
  assert.equal(validateBidPrices([]), null); // cho phép chào rỗng (chỉ lump sum)
  assert.match(validateBidPrices([{ boqItemId: 1, unitPrice: -1 }])!, /phải ≥ 0/i);
  assert.match(
    validateBidPrices([
      { boqItemId: 1, unitPrice: 1000 },
      { boqItemId: 1, unitPrice: 2000 },
    ])!,
    /trùng lặp/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

async function setupTenderWithBoq() {
  const { insertId } = await import("@/lib/db");
  const supplierAId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Tender A')`);
  const supplierBId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Tender B')`);
  const boqId1 = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract) VALUES ('TENDER-L1', 'Dòng 1', 'm', 100)`,
  );
  const boqId2 = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract) VALUES ('TENDER-L2', 'Dòng 2', 'm', 50)`,
  );
  const tenderId = await insertId(
    `INSERT INTO tender_packages (code, name) VALUES ('GT-TEST-001', 'Gói thầu test')`,
  );
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO tender_items (tender_id, boq_item_id, qty) VALUES (?, ?, 100), (?, ?, 50)`,
    tenderId,
    boqId1,
    tenderId,
    boqId2,
  );
  return { supplierAId, supplierBId, boqId1, boqId2, tenderId };
}

test(
  "comparisonTable: NCC chào thiếu dòng → total chỉ cộng dòng đã chào, quotedLines/totalLines đúng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { comparisonTable } = await import("@/lib/tender");
    const { supplierAId, supplierBId, boqId1, boqId2, tenderId } = await setupTenderWithBoq();

    // NCC A chào đủ 2 dòng: 100*1000 + 50*2000 = 200,000.
    const bidA = await insertId(
      `INSERT INTO tender_bids (tender_id, supplier_id) VALUES (?, ?)`,
      tenderId,
      supplierAId,
    );
    await run(
      `INSERT INTO tender_bid_prices (bid_id, boq_item_id, unit_price) VALUES (?, ?, 1000), (?, ?, 2000)`,
      bidA,
      boqId1,
      bidA,
      boqId2,
    );

    // NCC B chỉ chào dòng 1 (thiếu dòng 2): 100*900 = 90,000, quotedLines=1/2.
    const bidB = await insertId(
      `INSERT INTO tender_bids (tender_id, supplier_id) VALUES (?, ?)`,
      tenderId,
      supplierBId,
    );
    await run(
      `INSERT INTO tender_bid_prices (bid_id, boq_item_id, unit_price) VALUES (?, ?, 900)`,
      bidB,
      boqId1,
    );

    const { items, bids } = await comparisonTable(tenderId);
    assert.equal(items.length, 2);
    const a = bids.find((b) => b.bidId === bidA)!;
    const b = bids.find((b) => b.bidId === bidB)!;
    assert.equal(a.total, 200_000);
    assert.equal(a.quotedLines, 2);
    assert.equal(b.total, 90_000); // không cộng 0 cho dòng thiếu
    assert.equal(b.quotedLines, 1);
    assert.equal(b.totalLines, 2);
    assert.equal(b.prices[boqId2], undefined); // dòng thiếu không có giá (UI hiện "—")

    await run(`DELETE FROM tender_packages WHERE id = ?`, tenderId); // cascade items/bids/prices
    await run(`DELETE FROM boq_items WHERE id IN (?, ?)`, boqId1, boqId2);
    await run(`DELETE FROM suppliers WHERE id IN (?, ?)`, supplierAId, supplierBId);
  },
);

test(
  "awardTender: sinh đúng 1 hợp đồng giao thầu với giá trị = total của bid thắng, chuyển trạng thái awarded",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { awardTender } = await import("@/lib/tender");
    const { supplierAId, boqId1, boqId2, tenderId } = await setupTenderWithBoq();

    // userId thật (không hardcode 1 — id đó không đảm bảo tồn tại, phụ thuộc thứ tự
    // chạy các file test khác cùng bảng users dùng chung; hardcode gây lỗi FK
    // contracts_created_by_fkey ngẫu nhiên khi chạy song song, đã thấy thật trong CI).
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Award Tester', 'award-tender@test.local', 'x', 'admin')`,
    );

    const bidA = await insertId(
      `INSERT INTO tender_bids (tender_id, supplier_id) VALUES (?, ?)`,
      tenderId,
      supplierAId,
    );
    await run(
      `INSERT INTO tender_bid_prices (bid_id, boq_item_id, unit_price) VALUES (?, ?, 1000), (?, ?, 2000)`,
      bidA,
      boqId1,
      bidA,
      boqId2,
    );

    const { contractId } = await awardTender(tenderId, bidA, userId);
    const contract = await queryOne<{
      value: number;
      kind: string;
      partySupplierId: number;
      status: string;
    }>(
      `SELECT value, kind, party_supplier_id AS "partySupplierId", status FROM contracts WHERE id = ?`,
      contractId,
    );
    assert.equal(Number(contract!.value), 200_000);
    assert.equal(contract!.kind, "giao_thau");
    assert.equal(contract!.partySupplierId, supplierAId);

    const tender = await queryOne<{
      status: string;
      awardedBidId: number;
      awardedContractId: number;
    }>(
      `SELECT status, awarded_bid_id AS "awardedBidId", awarded_contract_id AS "awardedContractId" FROM tender_packages WHERE id = ?`,
      tenderId,
    );
    assert.equal(tender!.status, "awarded");
    assert.equal(tender!.awardedBidId, bidA);
    assert.equal(tender!.awardedContractId, contractId);

    // Trao thầu lần 2 phải bị chặn (đã awarded).
    await assert.rejects(awardTender(tenderId, bidA, userId), /đã được trao thầu rồi/i);

    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
    await run(`DELETE FROM tender_packages WHERE id = ?`, tenderId);
    await run(`DELETE FROM boq_items WHERE id IN (?, ?)`, boqId1, boqId2);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierAId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);
