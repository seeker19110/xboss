import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("isValidPoTransition: đi đúng thứ tự 6 bước, chặn nhảy cóc, cho phép huỷ đúng chỗ", async () => {
  const { isValidPoTransition } = await import("@/lib/procurement");

  // Tiến đúng thứ tự.
  assert.equal(isValidPoTransition("draft", "confirmed"), true);
  assert.equal(isValidPoTransition("confirmed", "delivering"), true);
  assert.equal(isValidPoTransition("received", "reconciled"), true);
  // Idempotent (giữ nguyên trạng thái không phải lỗi).
  assert.equal(isValidPoTransition("confirmed", "confirmed"), true);

  // Nhảy cóc → chặn.
  assert.equal(isValidPoTransition("draft", "delivering"), false);
  assert.equal(isValidPoTransition("draft", "received"), false);
  assert.equal(isValidPoTransition("confirmed", "reconciled"), false);
  // "partial"/"received" do route /receive tự set theo số lượng nhận, không phải bước thủ công.
  assert.equal(isValidPoTransition("confirmed", "partial"), false);
  assert.equal(isValidPoTransition("delivering", "received"), false);

  // Huỷ được từ confirmed/delivering/partial, không được từ draft (xoá thay vì huỷ) hay
  // sau khi đã nhận đủ/đối chiếu.
  assert.equal(isValidPoTransition("confirmed", "cancelled"), true);
  assert.equal(isValidPoTransition("delivering", "cancelled"), true);
  assert.equal(isValidPoTransition("partial", "cancelled"), true);
  assert.equal(isValidPoTransition("draft", "cancelled"), false);
  assert.equal(isValidPoTransition("received", "cancelled"), false);
  assert.equal(isValidPoTransition("reconciled", "cancelled"), false);
  assert.equal(isValidPoTransition("cancelled", "confirmed"), false);
});

test("nextVehicleStatus: đúng thứ tự Duyệt→Vào→Ra, idempotent, chặn nhảy cóc", async () => {
  const { nextVehicleStatus } = await import("@/lib/procurement");

  assert.equal(nextVehicleStatus("approve", "registered"), "approved");
  assert.equal(nextVehicleStatus("enter", "registered"), "entered");
  assert.equal(nextVehicleStatus("enter", "approved"), "entered");
  assert.equal(nextVehicleStatus("exit", "entered"), "exited");

  // Idempotent: gọi lại hành động đã ở đúng đích → trả về chính trạng thái đó (không lỗi).
  assert.equal(nextVehicleStatus("enter", "entered"), "entered");
  assert.equal(nextVehicleStatus("exit", "exited"), "exited");
  assert.equal(nextVehicleStatus("approve", "approved"), "approved");

  // Nhảy cóc / sai thứ tự → null (route trả 409).
  assert.equal(nextVehicleStatus("exit", "registered"), null);
  assert.equal(nextVehicleStatus("exit", "approved"), null);
  assert.equal(nextVehicleStatus("enter", "exited"), null);
  assert.equal(nextVehicleStatus("approve", "entered"), null);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "poLateList: PO quá expected_date mà chưa đủ hàng → xuất hiện; nhận đủ/huỷ thì biến mất",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, daysFromTodayISO } = await import("@/lib/db");
    const { poLateList } = await import("@/lib/procurement");

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test Late')`);
    const poLateId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status, expected_date) VALUES (?, 'confirmed', ?)`,
      supplierId,
      daysFromTodayISO(-2),
    );
    const poOnTimeId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status, expected_date) VALUES (?, 'confirmed', ?)`,
      supplierId,
      daysFromTodayISO(5),
    );

    let late = await poLateList();
    let ids = late.map((p) => p.id);
    assert.ok(ids.includes(poLateId), "PO quá hạn phải xuất hiện");
    assert.ok(!ids.includes(poOnTimeId), "PO còn hạn không xuất hiện");

    // Nhận đủ hàng → không còn trễ.
    await run(`UPDATE purchase_orders SET status = 'received' WHERE id = ?`, poLateId);
    late = await poLateList();
    ids = late.map((p) => p.id);
    assert.ok(!ids.includes(poLateId), "PO đã nhận đủ thì hết trễ");

    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poLateId, poOnTimeId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);

test(
  "vehicleLateList: xe quá giờ dự kiến ≥2h chưa vào cổng → xuất hiện; đã vào thì biến mất",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { vehicleLateList } = await import("@/lib/procurement");

    const lateId = await insertId(
      `INSERT INTO vehicle_logs (plate, expected_at, status) VALUES ('LATE-01', NOW() - INTERVAL '3 hours', 'registered')`,
    );
    const onTimeId = await insertId(
      `INSERT INTO vehicle_logs (plate, expected_at, status) VALUES ('ONTIME-01', NOW() + INTERVAL '1 hour', 'registered')`,
    );

    let late = await vehicleLateList();
    let ids = late.map((v) => v.id);
    assert.ok(ids.includes(lateId));
    assert.ok(!ids.includes(onTimeId));

    await run(
      `UPDATE vehicle_logs SET status = 'entered', entered_at = NOW() WHERE id = ?`,
      lateId,
    );
    late = await vehicleLateList();
    ids = late.map((v) => v.id);
    assert.ok(!ids.includes(lateId), "xe đã vào cổng thì hết trễ");

    await run(`DELETE FROM vehicle_logs WHERE id IN (?, ?)`, lateId, onTimeId);
  },
);

test(
  "supplier_ratings: UNIQUE(supplier_id, po_id) chặn đánh giá trùng cho cùng 1 PO",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test Rating')`);
    const poId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status) VALUES (?, 'received')`,
      supplierId,
    );

    await insertId(
      `INSERT INTO supplier_ratings (supplier_id, po_id, quality, delivery, price) VALUES (?, ?, 5, 4, 5)`,
      supplierId,
      poId,
    );
    await assert.rejects(
      insertId(
        `INSERT INTO supplier_ratings (supplier_id, po_id, quality, delivery, price) VALUES (?, ?, 3, 3, 3)`,
        supplierId,
        poId,
      ),
      /duplicate key|unique/i,
    );

    await run(`DELETE FROM supplier_ratings WHERE supplier_id = ?`, supplierId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);

test(
  "supplierSummary: điểm TB 3 tiêu chí + công nợ (Σ PO chưa huỷ − Σ payment_bills)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { supplierSummary } = await import("@/lib/procurement");

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC Test Summary')`);
    const matId = await insertId(
      `INSERT INTO materials (name, unit) VALUES ('VT test summary', 'cái')`,
    );

    const poOkId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status) VALUES (?, 'received')`,
      supplierId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 10, 1000)`,
      poOkId,
      matId,
    );
    const poCancelledId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, status) VALUES (?, 'cancelled')`,
      supplierId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 100, 999)`,
      poCancelledId,
      matId,
    );
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, responsible_supplier_id)
       VALUES ('Test', 'bill', 4000, CURRENT_DATE, ?)`,
      supplierId,
    );
    await insertId(
      `INSERT INTO supplier_ratings (supplier_id, po_id, quality, delivery, price) VALUES (?, ?, 4, 5, 3)`,
      supplierId,
      poOkId,
    );

    const summary = await supplierSummary(supplierId);
    assert.equal(summary.ratingsCount, 1);
    assert.equal(summary.avgQuality, 4);
    assert.equal(summary.avgDelivery, 5);
    assert.equal(summary.avgPrice, 3);
    assert.equal(summary.totalOrdered, 10_000); // PO huỷ (100 x 999) không tính
    assert.equal(summary.totalPaid, 4_000);
    assert.equal(summary.debt, 6_000);

    await run(`DELETE FROM supplier_ratings WHERE supplier_id = ?`, supplierId);
    await run(`DELETE FROM payment_bills WHERE responsible_supplier_id = ?`, supplierId);
    await run(`DELETE FROM po_items WHERE po_id IN (?, ?)`, poOkId, poCancelledId);
    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poOkId, poCancelledId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);
