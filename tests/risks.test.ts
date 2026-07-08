import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateRiskInput: title/category bắt buộc, probability/impact 1–5", async () => {
  const { validateRiskInput } = await import("@/lib/risks");

  const base = {
    title: "Chậm bàn giao mặt bằng",
    description: null,
    category: "schedule" as const,
    probability: 3,
    impact: 4,
    mitigation: null,
    owner: null,
  };

  assert.equal(validateRiskInput(base), null);
  assert.match(validateRiskInput({ ...base, title: "" })!, /tên rủi ro/i);
  assert.match(validateRiskInput({ ...base, category: "xxx" as never })!, /nhóm rủi ro/i);
  assert.match(validateRiskInput({ ...base, probability: 0 })!, /xác suất/i);
  assert.match(validateRiskInput({ ...base, probability: 6 })!, /xác suất/i);
  assert.match(validateRiskInput({ ...base, probability: 2.5 })!, /xác suất/i);
  assert.match(validateRiskInput({ ...base, impact: NaN })!, /mức ảnh hưởng/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "risks: score = probability × impact, CHECK 1–5 chặn ở DB, mã tuần tự R-000N",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listRisks, nextRiskCode } = await import("@/lib/risks");

    const code1 = await nextRiskCode();
    const id1 = await insertId(
      `INSERT INTO risks (code, title, category, probability, impact) VALUES (?, 'Rủi ro test', 'cost', 4, 5)`,
      code1,
    );
    const code2 = await nextRiskCode();
    assert.notEqual(code2, code1);
    assert.match(code2, /^R-\d{4}$/);

    const rows = await listRisks();
    const row = rows.find((r) => r.id === id1);
    assert.equal(row?.score, 20);
    assert.equal(row?.status, "open");

    // CHECK constraint chặn probability/impact ngoài 1–5 ngay ở DB.
    await assert.rejects(
      insertId(
        `INSERT INTO risks (code, title, category, probability, impact) VALUES ('R-9999', 'Sai', 'cost', 6, 1)`,
      ),
    );

    // Lọc theo trạng thái.
    const closed = await listRisks({ status: "closed" });
    assert.ok(!closed.some((r) => r.id === id1));

    await run(`DELETE FROM risks WHERE id = ?`, id1);
  },
);

test(
  "listRisks: scoped đúng theo project_id (M22), không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listRisks } = await import("@/lib/risks");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Rủi ro 1', 'PJT-RK1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Rủi ro 2', 'PJT-RK2')`,
    );
    const r1 = await insertId(
      `INSERT INTO risks (code, title, category, probability, impact, project_id) VALUES ('R-8001', 'Rủi ro DA1', 'cost', 3, 3, ?)`,
      p1,
    );
    await insertId(
      `INSERT INTO risks (code, title, category, probability, impact, project_id) VALUES ('R-8002', 'Rủi ro DA2', 'cost', 3, 3, ?)`,
      p2,
    );

    const list1 = await listRisks({ projectId: p1 });
    assert.ok(list1.some((r) => r.id === r1));
    assert.equal(list1.length, 1);

    await run(`DELETE FROM risks WHERE code IN ('R-8001', 'R-8002')`);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
