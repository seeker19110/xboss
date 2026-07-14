import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M22 — scoping tháp (towers) theo dự án user thấy được / dự án đang chọn. Không có
// hàm listTowers trong lib (truy vấn nằm thẳng trong route) nên test trực tiếp bằng
// SQL, mirror đúng điều kiện đã thêm ở app/api/towers/route.ts.
test(
  "towers: GET chỉ thấy tháp của dự án user được gán (mirror WHERE project_id = ANY(?))",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");
    const { visibleProjectIds } = await import("@/lib/projects");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Tháp 1', 'PJT-TW1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Tháp 2', 'PJT-TW2')`);
    const tw1 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp DA1')`, p1);
    await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp DA2')`, p2);

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM TowerTest', 'pm-tower@xboss.vn', 'x', 'pm')`,
    );
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmId, p1);

    const visible = await visibleProjectIds({ id: pmId, role: "pm" });
    assert.deepEqual(visible, [p1]);

    const towers = await query<{ id: number }>(
      `SELECT id FROM towers WHERE project_id = ANY(?) ORDER BY id`,
      visible,
    );
    assert.ok(towers.some((t) => t.id === tw1));
    assert.equal(towers.length, 1);

    await run(`DELETE FROM user_projects WHERE user_id = ?`, pmId);
    await run(`DELETE FROM users WHERE id = ?`, pmId);
    await run(`DELETE FROM towers WHERE project_id IN (?, ?)`, p1, p2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "towers: POST gắn tháp mới vào dự án đang chọn (resolveProjectId), không phải project id nhỏ nhất",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { resolveProjectId, visibleProjectIds } = await import("@/lib/projects");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Tháp A', 'PJT-TWA')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Tháp B', 'PJT-TWB')`);

    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin TowerTest', 'admin-tower@xboss.vn', 'x', 'admin')`,
    );

    const visible = await visibleProjectIds({ id: adminId, role: "admin" });
    // Cookie chọn p2 (không phải project id nhỏ nhất p1) → getCurrentProjectId phải trả p2.
    const chosenProjectId = resolveProjectId(visible, String(p2));
    assert.equal(chosenProjectId, p2);

    const id = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
      chosenProjectId,
      "Tháp mới POST test",
    );
    const tower = await queryOne<{ projectId: number }>(
      `SELECT project_id AS "projectId" FROM towers WHERE id = ?`,
      id,
    );
    assert.equal(tower!.projectId, p2);
    assert.notEqual(tower!.projectId, p1);

    await run(`DELETE FROM towers WHERE id = ?`, id);
    await run(`DELETE FROM users WHERE id = ?`, adminId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
