import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp lib/assignments.ts (cần Postgres riêng: đặt TEST_DATABASE_URL) =====
// Toàn bộ module chạm DB (cascade phân công sheet → nhóm → task + kế thừa), không có
// hàm thuần nào để test unit riêng.

async function seedProject() {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test assignments')`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTASGN', 'Sheet test')`,
    towerId,
  );
  return { projectId, towerId, stId };
}

async function cleanupProject(
  ids: { projectId: number; towerId: number; stId: number },
  userIds: number[],
) {
  const { run } = await import("@/lib/db");
  // assignment_log FK tới users (changed_by/prev_user_id/new_user_id) → dọn trước khi xoá user.
  await run(
    `DELETE FROM assignment_log WHERE changed_by = ANY(?) OR new_user_id = ANY(?) OR prev_user_id = ANY(?)`,
    userIds,
    userIds,
    userIds,
  );
  await run(
    `DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id = ?)`,
    ids.stId,
  );
  await run(`DELETE FROM work_packages WHERE sheet_type_id = ?`, ids.stId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, ids.stId);
  await run(`DELETE FROM towers WHERE id = ?`, ids.towerId);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
  await run(`DELETE FROM notifications WHERE user_id = ANY(?)`, userIds);
  await run(`DELETE FROM users WHERE id = ANY(?)`, userIds);
}

test(
  "assignSheetManager: cascade xuống nhóm/task chưa gán thủ công, không đụng nhóm/task đã gán thủ công",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { assignSheetManager } = await import("@/lib/assignments");

    const ids = await seedProject();
    const userA = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('User A', 'usera-asgn@test.local', 'x', 'engineer')`,
    );
    const userB = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('User B', 'userb-asgn@test.local', 'x', 'engineer')`,
    );
    const admin = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin-asgn@test.local', 'x', 'admin')`,
    );

    const pkgAuto = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm kế thừa')`,
      ids.stId,
    );
    const pkgManual = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, assigned_to, assigned_manual) VALUES (?, 'A2', 'Nhóm đã gán tay', ?, TRUE)`,
      ids.stId,
      userB,
    );
    const taskAuto = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'A1,01', 'Task kế thừa')`,
      pkgAuto,
    );
    const taskManual = await insertId(
      `INSERT INTO tasks (package_id, code, name, assigned_to, assigned_manual) VALUES (?, 'A1,02', 'Task đã gán tay', ?, TRUE)`,
      pkgAuto,
      userB,
    );

    await assignSheetManager(ids.stId, userA, admin);

    const st = await queryOne<{ manager_id: number }>(
      `SELECT manager_id FROM sheet_types WHERE id = ?`,
      ids.stId,
    );
    assert.equal(st?.manager_id, userA);

    const pAuto = await queryOne<{ assigned_to: number }>(
      `SELECT assigned_to FROM work_packages WHERE id = ?`,
      pkgAuto,
    );
    assert.equal(pAuto?.assigned_to, userA); // kế thừa theo quản lý hệ mới

    const pManual = await queryOne<{ assigned_to: number }>(
      `SELECT assigned_to FROM work_packages WHERE id = ?`,
      pkgManual,
    );
    assert.equal(pManual?.assigned_to, userB); // đã gán tay → không bị cascade đè

    const tAuto = await queryOne<{ assigned_to: number }>(
      `SELECT assigned_to FROM tasks WHERE id = ?`,
      taskAuto,
    );
    assert.equal(tAuto?.assigned_to, userA);

    const tManual = await queryOne<{ assigned_to: number }>(
      `SELECT assigned_to FROM tasks WHERE id = ?`,
      taskManual,
    );
    assert.equal(tManual?.assigned_to, userB); // task đã gán tay không bị cascade đè

    const log = await queryOne<{ new_user_id: number }>(
      `SELECT new_user_id FROM assignment_log WHERE level = 'sheet' AND target_id = ? ORDER BY id DESC LIMIT 1`,
      ids.stId,
    );
    assert.equal(log?.new_user_id, userA);

    await cleanupProject(ids, [userA, userB, admin]);
  },
);

test(
  "assignPackage: gán thủ công cascade xuống task chưa gán tay; userId=null trả về kế thừa quản lý hệ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { assignPackage } = await import("@/lib/assignments");

    const ids = await seedProject();
    const manager = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Manager', 'manager-asgn@test.local', 'x', 'engineer')`,
    );
    const worker = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Worker', 'worker-asgn@test.local', 'x', 'engineer')`,
    );
    const admin = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin2', 'admin2-asgn@test.local', 'x', 'admin')`,
    );
    await run(`UPDATE sheet_types SET manager_id = ? WHERE id = ?`, manager, ids.stId);

    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'B1', 'Nhóm B1')`,
      ids.stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'B1,01', 'Task B1')`,
      pkgId,
    );

    await assignPackage(pkgId, worker, admin);
    let pkg = await queryOne<{ assigned_to: number; assigned_manual: boolean }>(
      `SELECT assigned_to, assigned_manual FROM work_packages WHERE id = ?`,
      pkgId,
    );
    assert.equal(pkg?.assigned_to, worker);
    assert.equal(pkg?.assigned_manual, true);
    let task = await queryOne<{ assigned_to: number }>(
      `SELECT assigned_to FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(task?.assigned_to, worker); // cascade xuống task chưa gán tay

    // Đưa về kế thừa (userId=null) → lấy quản lý hệ hiện tại.
    await assignPackage(pkgId, null, admin);
    pkg = await queryOne<{ assigned_to: number; assigned_manual: boolean }>(
      `SELECT assigned_to, assigned_manual FROM work_packages WHERE id = ?`,
      pkgId,
    );
    assert.equal(pkg?.assigned_to, manager);
    assert.equal(pkg?.assigned_manual, false);

    await cleanupProject(ids, [manager, worker, admin]);
  },
);

test(
  "assignTask: gán thủ công + đưa về kế thừa từ nhóm; inheritedAssigneeFor đọc đúng assigned_to của nhóm",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { assignTask, inheritedAssigneeFor } = await import("@/lib/assignments");

    const ids = await seedProject();
    const pkgOwner = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PkgOwner', 'pkgowner-asgn@test.local', 'x', 'engineer')`,
    );
    const worker = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Worker2', 'worker2-asgn@test.local', 'x', 'engineer')`,
    );
    const admin = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin3', 'admin3-asgn@test.local', 'x', 'admin')`,
    );

    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, assigned_to) VALUES (?, 'C1', 'Nhóm C1', ?)`,
      ids.stId,
      pkgOwner,
    );
    assert.equal(await inheritedAssigneeFor(pkgId), pkgOwner);

    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'C1,01', 'Task C1')`,
      pkgId,
    );

    await assignTask(taskId, worker, admin);
    let task = await queryOne<{ assigned_to: number; assigned_manual: boolean }>(
      `SELECT assigned_to, assigned_manual FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(task?.assigned_to, worker);
    assert.equal(task?.assigned_manual, true);

    await assignTask(taskId, null, admin);
    task = await queryOne<{ assigned_to: number; assigned_manual: boolean }>(
      `SELECT assigned_to, assigned_manual FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(task?.assigned_to, pkgOwner); // về kế thừa từ nhóm
    assert.equal(task?.assigned_manual, false);

    await cleanupProject(ids, [pkgOwner, worker, admin]);
  },
);

test(
  "userWorkloads: đếm đúng tổng + số trễ theo từng người, bỏ qua task đã xong/nghiệm thu",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { userWorkloads } = await import("@/lib/assignments");

    const ids = await seedProject();
    const worker = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Worker3', 'worker3-asgn@test.local', 'x', 'engineer')`,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'D1', 'Nhóm D1')`,
      ids.stId,
    );
    // 1 task trễ thật (end_date quá khứ, chưa xong), 1 task chưa trễ, 1 task đã hoàn thành
    // (không tính dù end_date quá khứ) để xác nhận đúng điều kiện lọc.
    const t1 = await insertId(
      `INSERT INTO tasks (package_id, code, name, assigned_to, end_date, progress_percent, status)
       VALUES (?, 'D1,01', 'Task trễ', ?, '2020-01-01', 0.5, 'tre')`,
      pkgId,
      worker,
    );
    const t2 = await insertId(
      `INSERT INTO tasks (package_id, code, name, assigned_to, end_date, progress_percent, status)
       VALUES (?, 'D1,02', 'Task chưa trễ', ?, '2099-01-01', 0, 'chuan_bi')`,
      pkgId,
      worker,
    );
    const t3 = await insertId(
      `INSERT INTO tasks (package_id, code, name, assigned_to, end_date, progress_percent, status)
       VALUES (?, 'D1,03', 'Task đã xong dù end_date quá khứ', ?, '2020-01-01', 1, 'hoan_thanh')`,
      pkgId,
      worker,
    );

    const workloads = await userWorkloads();
    const w = workloads.get(worker);
    assert.ok(w, "phải có bản ghi workload cho worker");
    assert.equal(w!.total, 2); // t3 đã hoàn thành nên bị loại khỏi workload (status IN hoan_thanh/nghiem_thu)
    assert.equal(w!.delayed, 1); // chỉ t1 thoả điều kiện trễ

    await run(`DELETE FROM tasks WHERE id IN (?, ?, ?)`, t1, t2, t3);
    await cleanupProject(ids, [worker]);
  },
);
