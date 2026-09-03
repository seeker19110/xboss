import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveStatus,
  progressFromChecks,
  statusConsistentWithProgress,
} from "@/lib/tien-do/recompute";

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

// ===== progressFromChecks: quy tắc DÙNG CHUNG cho mọi đường ghi % (tick + import Excel) =====

test("progressFromChecks: chỉ đủ 100% khi tick hết ô", () => {
  assert.equal(progressFromChecks(200, 200), 1);
  assert.equal(progressFromChecks(13, 13), 1);
  // Biên của trần 0.99: 199/200 = 0.995, Math.round nửa làm tròn LÊN 1.00 — phải bị ghim
  // lại 0.99, nếu không sẽ báo "hoàn thành" và mở khoá nghiệm thu khi còn 1 ô chưa tick.
  assert.equal(progressFromChecks(199, 200), 0.99);
  assert.equal(progressFromChecks(999, 1000), 0.99);
  assert.equal(progressFromChecks(198, 200), 0.99);
});

test("progressFromChecks: biên rỗng/không có ô nào", () => {
  assert.equal(progressFromChecks(0, 0), 0);
  assert.equal(progressFromChecks(0, 1), 0);
  assert.equal(progressFromChecks(1, 1), 1);
  assert.equal(progressFromChecks(0, 13), 0);
});

test("progressFromChecks: làm tròn 2 chữ số ở khoảng giữa", () => {
  assert.equal(progressFromChecks(1, 3), 0.33);
  assert.equal(progressFromChecks(2, 3), 0.67);
  assert.equal(progressFromChecks(1, 8), 0.13);
});

// ===== statusConsistentWithProgress: bất biến hoan_thanh ⇔ progress>=1, dùng ở mọi route
// cho phép client tự đặt status thủ công (tasks/:id, tasks/batch, tasks/:id/progress) =====

test("statusConsistentWithProgress: progress=1 chỉ chấp nhận hoan_thanh", () => {
  assert.equal(statusConsistentWithProgress("hoan_thanh", 1), true);
  assert.equal(statusConsistentWithProgress("chuan_bi", 1), false);
  assert.equal(statusConsistentWithProgress("dang_thi_cong", 1), false);
  assert.equal(statusConsistentWithProgress("tre", 1), false);
});

test("statusConsistentWithProgress: progress<1 không được là hoan_thanh", () => {
  assert.equal(statusConsistentWithProgress("hoan_thanh", 0.99), false);
  assert.equal(statusConsistentWithProgress("hoan_thanh", 0), false);
  assert.equal(statusConsistentWithProgress("chuan_bi", 0), true);
  assert.equal(statusConsistentWithProgress("dang_thi_cong", 0.5), true);
  assert.equal(statusConsistentWithProgress("tre", 0.5), true);
});

test(
  "recomputePackage: trung bình % làm trên NUMERIC, không lệch vì cộng dồn float",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const { recomputePackage } = await import("@/lib/tien-do/recompute");

    // Bộ số lấy từ nhóm OGHL H6 của file gốc: trung bình thập phân đúng bằng 0.715
    // (10.01/14) → làm tròn half-up phải ra 0.72. Cộng dồn kiểu float ra
    // 0.7149999999999999 → 0.71 (lệch 1 điểm phần trăm).
    const VALUES = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.25, 0.19, 0.19, 0.19, 0.19];

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test avg numeric')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp N')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTAVG', 'Sheet avg')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'N1', 'Nhóm avg')`,
      stId,
    );
    for (const [i, v] of VALUES.entries())
      await insertId(
        `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, ?, ?)`,
        pkgId,
        `N1,${i}`,
        `Task ${i}`,
        v,
      );

    await recomputePackage(pkgId);
    const pkg = await queryOne<{ progress: number }>(
      `SELECT progress FROM work_packages WHERE id = ?`,
      pkgId,
    );
    assert.equal(pkg?.progress, 0.72);
  },
);

test("deriveStatus: đã nghiệm thu thì giữ nguyên", () => {
  assert.equal(deriveStatus(0.5, YESTERDAY, "nghiem_thu"), "nghiem_thu");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "recomputeTask: % task = số ô checked / tổng ô, package = trung bình task",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { recomputeTask } = await import("@/lib/tien-do/recompute");

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
    const { recomputeTask, recomputeTasksInheritingDates } =
      await import("@/lib/tien-do/recompute");

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
    const { recomputePackage } = await import("@/lib/tien-do/recompute");

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

// ===== M120: ngày thực tế của task (actual_start_date / actual_end_date) =====
// Bảng chân lý FR5 + quyết định D1 (actual_start_date KHÔNG BAO GIỜ tự xoá). Chạy qua
// recomputeTask (đường tick lưới) và PATCH progress (đường nhập tay) đều phải cho cùng kết quả
// — vì vậy cả 2 gọi chung capNhatNgayThucTe.

test(
  "capNhatNgayThucTe: AC4/AC5/AC6 — bắt đầu khi >0, kết thúc khi =1, xoá ngày KT khi tụt <1 nhưng GIỮ ngày BĐ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { recomputeTask } = await import("@/lib/tien-do/recompute");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test ngay thuc te')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp NTT')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'NTT', 'Sheet ngày thực tế')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'NTT1', 'Nhóm NTT')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date) VALUES (?, 'NTT1,01', 'Task ngày thực tế', ?)`,
      pkgId,
      TOMORROW,
    );

    const dims: number[] = [];
    for (let i = 1; i <= 3; i++) {
      dims.push(
        await insertId(
          `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, ?, 0)`,
          taskId,
          `Ô ${i}`,
        ),
      );
    }
    const ngayThucTe = () =>
      queryOne<{ actual_start_date: string | null; actual_end_date: string | null }>(
        `SELECT actual_start_date, actual_end_date FROM tasks WHERE id = ?`,
        taskId,
      );
    const homNay = new Date().toISOString().slice(0, 10);

    // Chưa tick ô nào → chưa có ngày thực tế nào.
    await recomputeTask(taskId);
    let t = await ngayThucTe();
    assert.equal(t?.actual_start_date, null, "0% → chưa có ngày bắt đầu thực tế");
    assert.equal(t?.actual_end_date, null);

    // AC4: tick 1/3 ô → có ngày bắt đầu, chưa có ngày kết thúc.
    await run(`UPDATE progress_dimensions SET installed = 1 WHERE id = ?`, dims[0]);
    await recomputeTask(taskId);
    t = await ngayThucTe();
    assert.equal(t?.actual_start_date, homNay, "AC4: >0% → đặt ngày bắt đầu thực tế = hôm nay");
    assert.equal(t?.actual_end_date, null, "AC4: chưa 100% → chưa có ngày kết thúc");

    // AC5: tick nốt 2 ô còn lại → 100% → có ngày kết thúc.
    await run(`UPDATE progress_dimensions SET installed = 1 WHERE id IN (?, ?)`, dims[1], dims[2]);
    await recomputeTask(taskId);
    t = await ngayThucTe();
    assert.equal(t?.actual_end_date, homNay, "AC5: 100% → đặt ngày kết thúc thực tế");

    // AC6: bỏ tick 1 ô → mất ngày kết thúc, NHƯNG giữ ngày bắt đầu (quyết định D1).
    await run(`UPDATE progress_dimensions SET installed = 0 WHERE id = ?`, dims[2]);
    await recomputeTask(taskId);
    t = await ngayThucTe();
    assert.equal(t?.actual_end_date, null, "AC6: tụt dưới 100% → xoá ngày kết thúc thực tế");
    assert.equal(t?.actual_start_date, homNay, "AC6/D1: ngày bắt đầu thực tế KHÔNG bị xoá");

    // D1 chặt hơn: về đúng 0% vẫn giữ ngày bắt đầu.
    await run(`UPDATE progress_dimensions SET installed = 0 WHERE task_id = ?`, taskId);
    await recomputeTask(taskId);
    t = await ngayThucTe();
    assert.equal(t?.actual_start_date, homNay, "D1: về 0% vẫn giữ ngày bắt đầu thực tế");
    assert.equal(t?.actual_end_date, null);

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
  "capNhatNgayThucTe: AC7 — task KHÔNG có ô dimension (nhập % tay) vẫn có ngày thực tế",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { capNhatNgayThucTe } = await import("@/lib/tien-do/recompute");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test ngay tay')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp NT')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'NT', 'Sheet nhập tay')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'NT1', 'Nhóm NT')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'NT1,01', 'Task nhập tay')`,
      pkgId,
    );
    const homNay = new Date().toISOString().slice(0, 10);
    const ngayThucTe = () =>
      queryOne<{ actual_start_date: string | null; actual_end_date: string | null }>(
        `SELECT actual_start_date, actual_end_date FROM tasks WHERE id = ?`,
        taskId,
      );

    // Đường nhập % thủ công (FR6) — cùng hàm với đường tick lưới.
    await capNhatNgayThucTe(taskId, 1);
    let t = await ngayThucTe();
    assert.equal(t?.actual_start_date, homNay, "AC7: 100% nhập tay → có cả ngày bắt đầu");
    assert.equal(t?.actual_end_date, homNay, "AC7: 100% nhập tay → có ngày kết thúc");

    // Hạ % xuống → mất ngày kết thúc, giữ ngày bắt đầu (cùng luật với đường lưới).
    await capNhatNgayThucTe(taskId, 0.4);
    t = await ngayThucTe();
    assert.equal(t?.actual_end_date, null);
    assert.equal(t?.actual_start_date, homNay);

    // Lũy đẳng: gọi lại nhiều lần không đổi kết quả (offline retry gửi lại cùng giá trị).
    await capNhatNgayThucTe(taskId, 0.4);
    t = await ngayThucTe();
    assert.equal(t?.actual_start_date, homNay);
    assert.equal(t?.actual_end_date, null);

    // Dọn dữ liệu test.
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
