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
