import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test hồi quy cho đợt audit 2026-07-19: hạ tầng idempotency (unique index +
// truy vấn check-trùng-key) chống double-submit khi mạng công trường chập chờn.
// Mirror đúng SQL trong route, không gọi route handler trực tiếp (getCurrentUser()
// dùng next/headers, không chạy được ngoài request scope thật — đúng giới hạn đã
// ghi nhận ở PROGRESS.md).

test(
  "material_transactions: unique index (material_id, type, idempotency_key) chặn ghi trùng key",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const matId = await insertId(
      `INSERT INTO materials (name, unit, qty_stock, qty_used) VALUES ('VT idempotency test', 'm', 100, 0)`,
    );

    // Cùng material + type + key: lần 2 phải bị chặn bởi unique index.
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, idempotency_key)
       VALUES (?, -1, 99, 'xuat_cong_truong', 'key-1')`,
      matId,
    );
    await assert.rejects(
      insertId(
        `INSERT INTO material_transactions (material_id, delta, qty_after, type, idempotency_key)
         VALUES (?, -1, 98, 'xuat_cong_truong', 'key-1')`,
        matId,
      ),
      /duplicate key value violates unique constraint/,
    );

    // Key khác nhau: không bị chặn.
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, idempotency_key)
       VALUES (?, -1, 97, 'xuat_cong_truong', 'key-2')`,
      matId,
    );

    // idempotency_key = NULL (client cũ chưa gửi header): partial index không áp dụng,
    // ghi trùng nhiều lần vẫn được (hành vi y hệt trước migration 0072 — không breaking).
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type)
       VALUES (?, -1, 96, 'xuat_cong_truong')`,
      matId,
    );
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type)
       VALUES (?, -1, 95, 'xuat_cong_truong')`,
      matId,
    );

    await run(`DELETE FROM material_transactions WHERE material_id = ?`, matId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
  },
);

test(
  "warehouse_receipts: unique index (po_id, idempotency_key) chặn tạo phiếu nhập trùng key cho cùng PO",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, status) VALUES ('PO-IDEM-TEST', 'confirmed')`,
    );
    const po2Id = await insertId(
      `INSERT INTO purchase_orders (po_code, status) VALUES ('PO-IDEM-TEST-2', 'confirmed')`,
    );

    await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id, idempotency_key) VALUES ('WR-IDEM-1', ?, 'rk-1')`,
      poId,
    );
    // Cùng PO + cùng key: lần 2 phải bị chặn.
    await assert.rejects(
      insertId(
        `INSERT INTO warehouse_receipts (receipt_code, po_id, idempotency_key) VALUES ('WR-IDEM-1B', ?, 'rk-1')`,
        poId,
      ),
      /duplicate key value violates unique constraint/,
    );

    // Key khác nhau trên cùng PO: không bị chặn (2 phiếu nhập hợp lệ khác lần).
    await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id, idempotency_key) VALUES ('WR-IDEM-2', ?, 'rk-2')`,
      poId,
    );

    // Cùng key nhưng khác PO: không bị chặn (unique theo cặp po_id+key).
    await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id, idempotency_key) VALUES ('WR-IDEM-3', ?, 'rk-1')`,
      po2Id,
    );

    // idempotency_key = NULL: partial index không áp dụng, không chặn.
    await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id) VALUES ('WR-IDEM-4', ?)`,
      poId,
    );
    await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id) VALUES ('WR-IDEM-5', ?)`,
      poId,
    );

    await run(`DELETE FROM warehouse_receipts WHERE po_id IN (?, ?)`, poId, po2Id);
    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poId, po2Id);
  },
);

test(
  "PO receive: mirror đúng truy vấn check-trùng-key của route — gọi lại cùng key trả về receipt đã tạo, không tạo phiếu mới",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, status) VALUES ('PO-IDEM-FLOW', 'confirmed')`,
    );

    // Lần gọi 1: chưa có key nào trùng → tạo mới (mirror route.ts dòng check dup).
    const dup1 = await queryOne<{ id: number; receipt_code: string }>(
      `SELECT id, receipt_code FROM warehouse_receipts WHERE po_id = ? AND idempotency_key = ?`,
      poId,
      "flow-key",
    );
    assert.equal(dup1, undefined);
    const rid1 = await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id, idempotency_key) VALUES ('WR-FLOW-1', ?, 'flow-key')`,
      poId,
    );

    // Lần gọi 2 (double-submit, cùng key): route phải thấy dup và trả lại receipt cũ,
    // không insert thêm — mô phỏng đúng nhánh "if (dup) return {...}" trong route.
    const dup2 = await queryOne<{ id: number; receipt_code: string }>(
      `SELECT id, receipt_code FROM warehouse_receipts WHERE po_id = ? AND idempotency_key = ?`,
      poId,
      "flow-key",
    );
    assert.ok(dup2);
    assert.equal(dup2!.id, rid1);
    assert.equal(dup2!.receipt_code, "WR-FLOW-1");

    const countRows = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM warehouse_receipts WHERE po_id = ? AND idempotency_key = 'flow-key'`,
      poId,
    );
    assert.equal(countRows!.count, "1");

    await run(`DELETE FROM warehouse_receipts WHERE po_id = ?`, poId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
  },
);
