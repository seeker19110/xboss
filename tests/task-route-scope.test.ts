import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Đợt audit 2026-07-18: 3 route GET đọc dữ liệu chi tiết task/work package
// (`tasks/:id/history`, `tasks/:id/dimensions`, `workpackages/:id/dimensions`) thiếu
// `canTouchTask`/`canTouchPackage` dù route "anh em" cùng resource (`comments`,
// `photos`, `documents`, `bbnt`, `drawing`) đều có — subcon xem được lịch sử/ma trận
// nghiệm thu của task/nhóm KHÔNG được giao. Test này khoá đúng hành vi của
// `canTouchTask`/`canTouchPackage` (hàm dùng chung cho cả 3 route vừa sửa lẫn các
// route đã đúng từ trước) — không cần dựng HTTP request giả, vì cả 5+ route đều gọi
// thẳng 2 hàm này ngay sau khi parse id.

test(
  "canTouchTask: subcon không được giao task → false; được giao → true; vai trò khác luôn true",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { canTouchTask } = await import("@/lib/auth");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('DA Scope Task')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTSCOPE', 'Sheet test')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'GRP1', 'Nhóm 1')`,
      stId,
    );

    const subconA = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Subcon A', 'subconA-scope@test.local', 'x', 'subcon')`,
    );
    const subconB = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Subcon B', 'subconB-scope@test.local', 'x', 'subcon')`,
    );
    const engineer = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Eng', 'eng-scope@test.local', 'x', 'engineer')`,
    );

    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, assigned_to) VALUES (?, 'T1', 'Task 1', ?)`,
      pkgId,
      subconA,
    );

    const userA = { id: subconA, role: "subcon" as const, name: "A", email: "a" };
    const userB = { id: subconB, role: "subcon" as const, name: "B", email: "b" };
    const userEng = { id: engineer, role: "engineer" as const, name: "E", email: "e" };

    assert.equal(await canTouchTask(userA, taskId), true, "subcon được giao → true");
    assert.equal(await canTouchTask(userB, taskId), false, "subcon KHÔNG được giao → false");
    assert.equal(
      await canTouchTask(userEng, taskId),
      true,
      "vai trò không phải subcon → luôn true",
    );

    // Dọn theo đúng thứ tự phụ thuộc.
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM users WHERE id IN (?, ?, ?)`, subconA, subconB, engineer);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    assert.equal(await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskId), undefined);
  },
);

test(
  "canTouchPackage: subcon không được giao work package → false; được giao → true",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { canTouchPackage } = await import("@/lib/auth");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('DA Scope Pkg')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTSCOPEPKG', 'Sheet test')`,
      towerId,
    );

    const subconOwner = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Subcon Owner', 'subconowner-scope@test.local', 'x', 'subcon')`,
    );
    const subconOther = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Subcon Other', 'subconother-scope@test.local', 'x', 'subcon')`,
    );

    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, assigned_to) VALUES (?, 'GRP2', 'Nhóm 2', ?)`,
      stId,
      subconOwner,
    );

    const owner = { id: subconOwner, role: "subcon" as const, name: "O", email: "o" };
    const other = { id: subconOther, role: "subcon" as const, name: "X", email: "x" };

    assert.equal(await canTouchPackage(owner, pkgId), true, "subcon được giao nhóm → true");
    assert.equal(await canTouchPackage(other, pkgId), false, "subcon KHÔNG được giao nhóm → false");

    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM users WHERE id IN (?, ?)`, subconOwner, subconOther);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
