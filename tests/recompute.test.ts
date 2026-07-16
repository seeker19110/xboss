import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStatus } from "@/lib/recompute";

const YESTERDAY = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

test("deriveStatus: đủ 100% → hoan_thanh", () => {
  assert.equal(deriveStatus(1, YESTERDAY), "hoan_thanh");
});

test("deriveStatus: quá hạn + chưa xong → tre", () => {
  assert.equal(deriveStatus(0.5, YESTERDAY), "tre");
  assert.equal(deriveStatus(0, YESTERDAY), "tre");
});

test("deriveStatus: còn hạn → theo tiến độ", () => {
  assert.equal(deriveStatus(0, TOMORROW), "chuan_bi");
  assert.equal(deriveStatus(0.3, TOMORROW), "dang_thi_cong");
  assert.equal(deriveStatus(0, null), "chuan_bi");
});

test("deriveStatus: đã nghiệm thu thì giữ nguyên", () => {
  assert.equal(deriveStatus(0.5, YESTERDAY, "nghiem_thu"), "nghiem_thu");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "recomputeTask: % task = số ô checked / tổng ô, package = trung bình task",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { recomputeTask } = await import("@/lib/recompute");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test recompute')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TEST', 'Sheet test')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'T1', 'Nhóm test')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date) VALUES (?, 'T1,01', 'Task test', ?)`,
      pkgId,
      TOMORROW,
    );

    // 4 dimension, 1 đã lắp → 25%
    for (let i = 1; i <= 4; i++) {
      await run(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, ?, ?)`,
        taskId,
        `CH 0${i}`,
        i === 1 ? 1 : 0,
      );
    }

    const result = await recomputeTask(taskId, "tester");
    assert.ok(result);
    assert.equal(result.progress, 0.25);
    assert.equal(result.status, "dang_thi_cong");

    const task = await queryOne<{ progress_percent: number }>(
      `SELECT progress_percent FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(task?.progress_percent, 0.25);

    const pkg = await queryOne<{ progress: number }>(
      `SELECT progress FROM work_packages WHERE id = ?`,
      pkgId,
    );
    assert.equal(pkg?.progress, 0.25);

    const hist = await queryOne<{ new_progress: number; changed_by: string }>(
      `SELECT new_progress, changed_by FROM task_history WHERE task_id = ? ORDER BY id DESC`,
      taskId,
    );
    assert.equal(hist?.new_progress, 0.25);
    assert.equal(hist?.changed_by, "tester");

    // Dọn dữ liệu test.
    await run(`DELETE FROM task_history WHERE task_id = ?`, taskId);
    await run(`DELETE FROM progress_dimensions WHERE task_id = ?`, taskId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "recomputeTask: task.end_date NULL kế thừa ngày KT nhóm — trễ theo ngày nhóm, không phải hằng số 'không bao giờ trễ'",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { recomputeTask, recomputeTasksInheritingDates } = await import("@/lib/recompute");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test date inherit')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp DI')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'DI', 'Sheet date inherit')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, end_date) VALUES (?, 'DI1', 'Nhóm DI', ?)`,
      stId,
      TOMORROW,
    );
    // Task KHÔNG có end_date riêng — phải kế thừa ngày KT nhóm.
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent) VALUES (?, 'DI1,01', 'Task kế thừa', 'dang_thi_cong', 0.5)`,
      pkgId,
    );

    await recomputeTask(taskId);
    let task = await queryOne<{ status: string }>(`SELECT status FROM tasks WHERE id = ?`, taskId);
    assert.equal(task?.status, "dang_thi_cong", "nhóm còn hạn → task kế thừa chưa trễ");

    // Nhóm quá hạn (như PATCH /api/workpackages/:id đổi endDate) → task kế thừa phải
    // tính lại thành trễ dù CHÍNH task chưa từng được update trực tiếp.
    await run(`UPDATE work_packages SET end_date = ? WHERE id = ?`, YESTERDAY, pkgId);
    await recomputeTasksInheritingDates(pkgId);

    task = await queryOne<{ status: string }>(`SELECT status FROM tasks WHERE id = ?`, taskId);
    assert.equal(task?.status, "tre", "nhóm quá hạn → task kế thừa (end_date NULL) phải lên trễ");

    // Task có ngày riêng (override) không bị ảnh hưởng bởi nhóm quá hạn.
    const taskId2 = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent, end_date)
       VALUES (?, 'DI1,02', 'Task tự đặt ngày', 'dang_thi_cong', 0.5, ?)`,
      pkgId,
      TOMORROW,
    );
    await recomputeTask(taskId2);
    const task2 = await queryOne<{ status: string }>(
      `SELECT status FROM tasks WHERE id = ?`,
      taskId2,
    );
    assert.equal(task2?.status, "dang_thi_cong", "task có end_date riêng không kế thừa ngày nhóm");

    // Dọn dữ liệu test.
    await run(`DELETE FROM task_history WHERE task_id IN (?, ?)`, taskId, taskId2);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, taskId, taskId2);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "recomputePackage: xoá task cuối trong nhóm → progress về 0, không giữ % cũ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { recomputePackage } = await import("@/lib/recompute");

    const projectId = await insertId(
      `INSERT INTO projects (name) VALUES ('Test recompute empty pkg')`,
    );
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TEST2', 'Sheet test 2')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'T2', 'Nhóm test 2')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'T2,01', 'Task test', 0.8)`,
      pkgId,
    );

    // Giả lập nhóm đang có % cũ (như trước khi xoá task cuối) rồi mới xoá task.
    await run(
      `UPDATE work_packages SET progress = 0.8, status = 'dang_thi_cong' WHERE id = ?`,
      pkgId,
    );
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);

    await recomputePackage(pkgId);

    const pkg = await queryOne<{ progress: number }>(
      `SELECT progress FROM work_packages WHERE id = ?`,
      pkgId,
    );
    assert.equal(pkg?.progress, 0); // không được giữ 0.8 cũ — nhóm rỗng không còn "đang dở dang"

    // Dọn dữ liệu test.
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
