import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp audit trail (M43 PR1): trigger Postgres ghi audit_log tự động, actor lấy
// từ SET LOCAL do withTransaction truyền qua ngữ cảnh request. Cần TEST_DATABASE_URL.
const S = Date.now().toString(36); // hậu tố duy nhất tránh đụng UNIQUE khi chạy lại trên cùng DB

test(
  "UPDATE trong withTransaction có ngữ cảnh → audit_log ghi đúng actor + chỉ cột đổi",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");

    const uid = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Audit Tester', ?, 'admin', 'x')`,
      `audit-${S}@test.vn`,
    );
    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ gốc', 100)`,
      `AUD-A-${S}`,
    );

    await runWithRequestContext({ userId: uid, role: "admin", requestId: "req-1" }, async () => {
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ?, value = ? WHERE id = ?`, "HĐ sửa", 200, cid);
      });
    });

    const rows = await query<{
      actor_id: number;
      actor_role: string;
      request_id: string;
      changes: Record<string, [unknown, unknown]>;
    }>(
      `SELECT actor_id, actor_role, request_id, changes FROM audit_log
        WHERE entity_type = 'contracts' AND entity_id = ? AND action = 'UPDATE'
        ORDER BY id DESC LIMIT 1`,
      cid,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_id, uid);
    assert.equal(rows[0].actor_role, "admin");
    assert.equal(rows[0].request_id, "req-1");
    // changes chỉ chứa cột thật sự đổi, mỗi cột là [cũ, mới].
    assert.deepEqual(Object.keys(rows[0].changes).sort(), ["title", "value"]);
    assert.deepEqual(rows[0].changes.title, ["HĐ gốc", "HĐ sửa"]);
    assert.deepEqual(rows[0].changes.value, [100, 200]);
  },
);

test("UPDATE không đổi giá trị nào → không ghi audit_log", { skip: !HAS_TEST_DB }, async () => {
  const { insertId, run, query, withTransaction } = await import("@/lib/db");
  const { runWithRequestContext } = await import("@/lib/request-context");

  const cid = await insertId(
    `INSERT INTO contracts (code, kind, title) VALUES (?, 'nhan_thau', 'HĐ noop')`,
    `AUD-N-${S}`,
  );
  const before = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_log WHERE entity_type='contracts' AND entity_id=? AND action='UPDATE'`,
    cid,
  );

  await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
    await withTransaction(async () => {
      await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ noop", cid); // đúng giá trị hiện tại
    });
  });

  const after = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_log WHERE entity_type='contracts' AND entity_id=? AND action='UPDATE'`,
    cid,
  );
  assert.equal(Number(after[0].n), Number(before[0].n));
});

test("DELETE → audit_log ghi snapshot đầy đủ hàng", { skip: !HAS_TEST_DB }, async () => {
  const { insertId, run, query, withTransaction } = await import("@/lib/db");
  const { runWithRequestContext } = await import("@/lib/request-context");

  const code = `AUD-D-${S}`;
  const cid = await insertId(
    `INSERT INTO contracts (code, kind, title) VALUES (?, 'nhan_thau', 'HĐ xoá')`,
    code,
  );
  await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
    await withTransaction(async () => {
      await run(`DELETE FROM contracts WHERE id = ?`, cid);
    });
  });

  const rows = await query<{ changes: Record<string, unknown> }>(
    `SELECT changes FROM audit_log WHERE entity_type='contracts' AND entity_id=? AND action='DELETE'`,
    cid,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changes.code, code); // snapshot chứa toàn bộ cột
  assert.equal(rows[0].changes.title, "HĐ xoá");
});

test(
  "Ghi ngoài transaction (không có ngữ cảnh) → vẫn log nhưng actor NULL",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query } = await import("@/lib/db");

    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title) VALUES (?, 'nhan_thau', 'HĐ noctx')`,
      `AUD-X-${S}`,
    );
    // Không bọc withTransaction, không có runWithRequestContext → không SET LOCAL.
    await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ noctx sửa", cid);

    const rows = await query<{ actor_id: number | null }>(
      `SELECT actor_id FROM audit_log WHERE entity_type='contracts' AND entity_id=? AND action='UPDATE'`,
      cid,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_id, null);
  },
);
