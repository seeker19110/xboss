import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M22 PR3 — scoping project_id cho cụm vật tư (materials). Không có hàm listMaterials
// trong lib (truy vấn nằm thẳng trong route) nên test trực tiếp bằng SQL, mirror đúng
// điều kiện WHERE m.project_id = ? đã thêm ở app/api/materials/route.ts.
test(
  "materials: cột project_id (M22) scoped đúng — mỗi dự án chỉ thấy vật tư của mình",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Vật tư 1', 'PJT-VT1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Vật tư 2', 'PJT-VT2')`,
    );
    const m1 = await insertId(
      `INSERT INTO materials (name, unit, project_id) VALUES ('Vật tư DA1', 'm', ?)`,
      p1,
    );
    await insertId(
      `INSERT INTO materials (name, unit, project_id) VALUES ('Vật tư DA2', 'm', ?)`,
      p2,
    );

    const rowsP1 = await query<{ id: number }>(`SELECT id FROM materials WHERE project_id = ?`, p1);
    assert.ok(rowsP1.some((r) => r.id === m1));
    assert.equal(rowsP1.length, 1);

    await run(`DELETE FROM materials WHERE project_id IN (?, ?)`, p1, p2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

// Sửa lỗ hổng: /api/materials/reports, /api/materials/import không lọc theo project_id
// (rò rỉ tồn kho/vượt định mức xuyên dự án, vật tư import mồ côi project_id).
test(
  "materials/reports: query overBudget (vượt định mức) chỉ trả vật tư của project đang chọn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Report 1', 'PJT-RP1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Report 2', 'PJT-RP2')`,
    );
    // Cả hai đều vượt định mức (qty_used > qty_planned)
    const m1 = await insertId(
      `INSERT INTO materials (name, unit, project_id, qty_planned, qty_used) VALUES ('VT vượt DA1', 'm', ?, 10, 20)`,
      p1,
    );
    await insertId(
      `INSERT INTO materials (name, unit, project_id, qty_planned, qty_used) VALUES ('VT vượt DA2', 'm', ?, 10, 20)`,
      p2,
    );

    // Mirror đúng điều kiện WHERE của khối "2. Vật tư vượt định mức" trong
    // app/api/materials/reports/route.ts
    const rows = await query<{ id: number }>(
      `SELECT m.id FROM materials m
        WHERE m.qty_used > m.qty_planned AND m.qty_planned > 0 AND m.project_id = ?`,
      p1,
    );
    assert.ok(rows.some((r) => r.id === m1));
    assert.equal(rows.length, 1);

    await run(`DELETE FROM materials WHERE project_id IN (?, ?)`, p1, p2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "materials/import: vật tư mới insert phải gắn đúng project_id của dự án đang chọn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Import 1', 'PJT-IM1')`,
    );

    // Mirror đúng câu INSERT trong app/api/materials/import/route.ts (có cột project_id)
    const m1 = await insertId(
      `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order, project_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      null,
      "BOQ-IMPORT-TEST",
      "VT import test",
      "m",
      0,
      0,
      "dat_hang",
      null,
      1,
      p1,
    );

    const row = await query<{ projectId: number }>(
      `SELECT project_id AS "projectId" FROM materials WHERE id = ?`,
      m1,
    );
    assert.equal(row[0].projectId, p1);

    await run(`DELETE FROM materials WHERE id = ?`, m1);
    await run(`DELETE FROM projects WHERE id = ?`, p1);
  },
);
