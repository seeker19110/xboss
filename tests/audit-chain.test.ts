import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp hash-chain audit_log (M43 PR3, migrations/0050_document_hash.sql +
// lib/audit-chain.ts::verifyAuditChain). Cần TEST_DATABASE_URL.
const S = Date.now().toString(36); // hậu tố duy nhất tránh đụng UNIQUE khi chạy lại trên cùng DB

test(
  "verifyAuditChain: chuỗi hợp lệ sau vài UPDATE liên tiếp trong withTransaction",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { verifyAuditChain } = await import("@/lib/audit-chain");

    const uid = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Chain Tester', ?, 'admin', 'x')`,
      `chain-${S}@test.vn`,
    );
    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ chain', 100)`,
      `CHAIN-A-${S}`,
    );

    await runWithRequestContext({ userId: uid, role: "admin" }, async () => {
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ chain 1", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ chain 2", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ chain 3", cid);
      });
    });

    const result = await verifyAuditChain();
    assert.ok(result.checked > 0);
    // Chỉ khẳng định KHÔNG có lỗi nào ở đúng các dòng audit của contract test này — không
    // khẳng định `result.ok` toàn cục, vì DB test dùng chung có thể còn dòng cũ từ lần chạy
    // trước (vd bị test "tamper" bên dưới cố ý sửa tay) — không liên quan gì tới đúng/sai
    // của chuỗi hash cho phần dữ liệu test này vừa tạo.
    const myRows = await query<{ id: number }>(
      `SELECT id FROM audit_log WHERE entity_type='contracts' AND entity_id=? ORDER BY id ASC`,
      cid,
    );
    assert.equal(myRows.length, 4); // 1 INSERT + 3 UPDATE
    const myErrorIds = new Set(result.errors.map((e) => e.id));
    for (const r of myRows) {
      assert.ok(
        !myErrorIds.has(r.id),
        `dòng audit_log id=${r.id} (contract test) không được báo lỗi`,
      );
    }
  },
);

test(
  "verifyAuditChain: phát hiện đúng dòng bị sửa tay trực tiếp trong audit_log",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { verifyAuditChain } = await import("@/lib/audit-chain");

    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ tamper', 100)`,
      `CHAIN-T-${S}`,
    );

    await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ tamper 1", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ tamper 2", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ tamper 3", cid);
      });
    });

    const rows = await query<{ id: number }>(
      `SELECT id FROM audit_log WHERE entity_type='contracts' AND entity_id=? AND action='UPDATE' ORDER BY id ASC`,
      cid,
    );
    assert.equal(rows.length, 3);
    const middleId = rows[1].id; // dòng giữa chuỗi 3 thao tác trên cùng contract

    // Giả lập bị sửa trực tiếp ngoài luồng app (role test là owner DB nên bỏ qua được
    // REVOKE của migration 0049 — đúng ghi chú "chỉ mang tính khai báo" trong migration).
    await run(
      `UPDATE audit_log SET changes = '{"title": ["bị sửa tay", "khác"]}'::jsonb WHERE id = ?`,
      middleId,
    );

    const result = await verifyAuditChain();
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 1, "phải phát hiện ít nhất 1 dòng lệch");
    const err = result.errors.find((e) => e.id === middleId);
    assert.ok(err, "phải phát hiện đúng dòng bị sửa (middleId)");
  },
);
