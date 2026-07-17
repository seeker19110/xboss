import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test M43 PR2 — /api/admin/audit-log (+ /export). Route handler tự nó gọi next/headers
// (cookies()/headers()) nên không gọi được ngoài request scope thật của Next — thay vào đó
// kiểm 2 lớp: (1) buildAuditFilter (hàm thuần, unit test) dựng đúng WHERE/params từ query
// params; (2) tích hợp — tạo audit_log thật bằng UPDATE/DELETE contract trong
// withTransaction + runWithRequestContext (như tests/audit-log.test.ts), rồi chạy đúng câu
// SQL route dùng (buildAuditFilter + LIMIT/OFFSET) để kiểm lọc entity+entityId và phân trang.

test("buildAuditFilter: rỗng khi không có param nào", async () => {
  const { buildAuditFilter } = await import("@/lib/audit");
  const { where, params } = buildAuditFilter(new URLSearchParams());
  assert.equal(where, "");
  assert.deepEqual(params, []);
});

test("buildAuditFilter: chỉ áp điều kiện cho param có mặt, giữ đúng thứ tự params", async () => {
  const { buildAuditFilter } = await import("@/lib/audit");
  const { where, params } = buildAuditFilter(
    new URLSearchParams({ entity: "contracts", entityId: "5", from: "2026-01-01" }),
  );
  assert.equal(where, "WHERE al.entity_type = ? AND al.entity_id = ? AND al.at::date >= ?");
  assert.deepEqual(params, ["contracts", 5, "2026-01-01"]);
});

test("buildAuditFilter: bỏ qua entityId/actorId không phải số", async () => {
  const { buildAuditFilter } = await import("@/lib/audit");
  const { where, params } = buildAuditFilter(new URLSearchParams({ entityId: "abc" }));
  assert.equal(where, "");
  assert.deepEqual(params, []);
});

test("buildAuditFilter: projectId != null → giới hạn dự án + bản ghi toàn cục (đứng đầu)", async () => {
  const { buildAuditFilter } = await import("@/lib/audit");
  const { where, params } = buildAuditFilter(new URLSearchParams({ entity: "contracts" }), 7);
  assert.equal(where, "WHERE (al.project_id = ? OR al.project_id IS NULL) AND al.entity_type = ?");
  assert.deepEqual(params, [7, "contracts"]);
});

test("buildAuditFilter: projectId null → không thêm điều kiện dự án (tương thích ngược)", async () => {
  const { buildAuditFilter } = await import("@/lib/audit");
  const { where, params } = buildAuditFilter(new URLSearchParams(), null);
  assert.equal(where, "");
  assert.deepEqual(params, []);
});

const S = Date.now().toString(36); // hậu tố duy nhất tránh đụng UNIQUE khi chạy lại trên cùng DB
const PAGE_SIZE = 50;

test(
  "lọc entity+entityId qua audit_log thật trả đúng dòng, không lẫn thực thể khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { buildAuditFilter } = await import("@/lib/audit");

    const cidA = await insertId(
      `INSERT INTO contracts (code, kind, title) VALUES (?, 'nhan_thau', 'HĐ A')`,
      `AUDAPI-A-${S}`,
    );
    const cidB = await insertId(
      `INSERT INTO contracts (code, kind, title) VALUES (?, 'nhan_thau', 'HĐ B')`,
      `AUDAPI-B-${S}`,
    );

    await runWithRequestContext({ userId: 1, role: "admin", requestId: `req-${S}` }, async () => {
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ A sửa", cidA);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ B sửa", cidB);
      });
    });

    const { where, params } = buildAuditFilter(
      new URLSearchParams({ entity: "contracts", entityId: String(cidA) }),
    );
    const rows = await query<{ entityId: number; entityType: string }>(
      `SELECT al.entity_id AS "entityId", al.entity_type AS "entityType"
         FROM audit_log al ${where} ORDER BY al.id DESC`,
      ...params,
    );
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.entityType, "contracts");
      assert.equal(r.entityId, cidA);
    }
  },
);

test(
  "phân trang: trang 2 (offset PAGE_SIZE) không lặp lại dòng của trang 1",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");

    // Sinh > PAGE_SIZE dòng audit_log cho 1 contract riêng (mỗi UPDATE 1 dòng vì title đổi).
    const N = PAGE_SIZE + 5;
    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title) VALUES (?, 'nhan_thau', 'HĐ phân trang')`,
      `AUDAPI-PG-${S}`,
    );
    await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
      for (let i = 0; i < N; i++) {
        await withTransaction(async () => {
          await run(`UPDATE contracts SET title = ? WHERE id = ?`, `HĐ phân trang ${i}`, cid);
        });
      }
    });

    const page1 = await query<{ id: number }>(
      `SELECT al.id FROM audit_log al WHERE al.entity_type = 'contracts' AND al.entity_id = ?
        ORDER BY al.id DESC LIMIT ? OFFSET ?`,
      cid,
      PAGE_SIZE,
      0,
    );
    const page2 = await query<{ id: number }>(
      `SELECT al.id FROM audit_log al WHERE al.entity_type = 'contracts' AND al.entity_id = ?
        ORDER BY al.id DESC LIMIT ? OFFSET ?`,
      cid,
      PAGE_SIZE,
      PAGE_SIZE,
    );
    assert.equal(page1.length, PAGE_SIZE);
    assert.ok(page2.length >= 1);
    const ids1 = new Set(page1.map((r) => r.id));
    for (const r of page2) assert.equal(ids1.has(r.id), false);
    // Trang 1 luôn có id lớn hơn (mới hơn) toàn bộ trang 2 (ORDER BY id DESC).
    assert.ok(Math.min(...page1.map((r) => r.id)) > Math.max(...page2.map((r) => r.id)));
  },
);
