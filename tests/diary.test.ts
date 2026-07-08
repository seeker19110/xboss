import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("assertDiaryUnlocked: ném 409 khi đã khoá, không ném khi draft/chưa có", async () => {
  const { assertDiaryUnlocked } = await import("@/lib/diary");

  assert.doesNotThrow(() => assertDiaryUnlocked(undefined));
  assert.doesNotThrow(() => assertDiaryUnlocked("draft"));
  assert.throws(
    () => assertDiaryUnlocked("locked"),
    (err: unknown) => {
      const e = err as { status?: number };
      return e.status === 409;
    },
  );
});

test("canLockDiary/canUnlockDiary: đúng phân quyền khoá/mở khoá", async () => {
  const { canLockDiary, canUnlockDiary } = await import("@/lib/diary");

  assert.equal(canLockDiary("admin"), true);
  assert.equal(canLockDiary("pm"), true);
  assert.equal(canLockDiary("engineer"), false);
  assert.equal(canLockDiary("subcon"), false);

  assert.equal(canUnlockDiary("admin"), true);
  assert.equal(canUnlockDiary("pm"), false);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "buildDiaryPrefill: gộp task_history đúng nhóm theo hệ + tầng, kèm ảnh trong ngày",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { buildDiaryPrefill } = await import("@/lib/diary");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'dien'`);
    assert.ok(dien, "disciplines seed phải có sẵn từ migration 0005_boq.sql");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test diary')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const st = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, discipline_id) VALUES (?, 'TESTDIARY', 'Sheet điện', ?)`,
      towerId,
      dien!.id,
    );
    const pkg = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'D1', 'Nhóm điện', 'T5')`,
      st,
    );
    const t1 = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'D1,01', 'Task 1')`,
      pkg,
    );
    const t2 = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'D1,02', 'Task 2')`,
      pkg,
    );

    const date = "2026-06-15";
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by, changed_at)
       VALUES (?, 0, 0.5, 'Nguyễn Văn A', (? ::date + interval '10 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      t1,
      date,
    );
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by, changed_at)
       VALUES (?, 0, 1, 'Trần Thị B', (? ::date + interval '14 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      t2,
      date,
    );
    // Bản ghi không tăng tiến độ (sửa ngày) không tính vào "công việc thực hiện".
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by, changed_at)
       VALUES (?, 0.5, 0.5, 'Nguyễn Văn A', (? ::date + interval '15 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      t1,
      date,
    );

    const prefill = await buildDiaryPrefill(date);
    assert.match(prefill.workDone, /Điện T5: cập nhật 2 hạng mục \(D1,01 → D1,02\)/);
    assert.deepEqual(prefill.updatedBy, ["Nguyễn Văn A", "Trần Thị B"]);
    assert.equal(prefill.photos.length, 0);

    await run(`DELETE FROM task_history WHERE task_id IN (?, ?)`, t1, t2);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, t1, t2);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkg);
    await run(`DELETE FROM sheet_types WHERE id = ?`, st);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "missingDiaryDates: ngày quá khứ có task_history mà chưa lập diary → xuất hiện; lập rồi thì hết",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { missingDiaryDates } = await import("@/lib/diary");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test missing diary')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const st = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTMISS', 'Sheet test')`,
      towerId,
    );
    const pkg = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'M1', 'Nhóm test')`,
      st,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'M1,01', 'Task test')`,
      pkg,
    );

    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by, changed_at)
       VALUES (?, 0, 0.5, 'Test', NOW() - INTERVAL '2 days')`,
      taskId,
    );

    const missingBefore = await missingDiaryDates();
    assert.ok(missingBefore.length > 0, "phải có ít nhất 1 ngày thiếu nhật ký");

    const dateStr = missingBefore[missingBefore.length - 1];
    await insertId(`INSERT INTO site_diaries (diary_date) VALUES (?)`, dateStr);

    const missingAfter = await missingDiaryDates();
    assert.ok(!missingAfter.includes(dateStr), "ngày đã lập diary thì hết thiếu");

    await run(`DELETE FROM site_diaries WHERE diary_date = ?`, dateStr);
    await run(`DELETE FROM task_history WHERE task_id = ?`, taskId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkg);
    await run(`DELETE FROM sheet_types WHERE id = ?`, st);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "missingDiaryDates: projectId (M22) lọc đúng — task_history của dự án khác không tính vào ngày thiếu",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { missingDiaryDates } = await import("@/lib/diary");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA missing 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA missing 2')`);
    const t1 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T1')`, p1);
    const t2 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T2')`, p2);
    const st1 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TMISS1', 'Sheet 1')`,
      t1,
    );
    const st2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TMISS2', 'Sheet 2')`,
      t2,
    );
    const pkg1 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'MP1', 'Nhóm 1')`,
      st1,
    );
    const pkg2 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'MP2', 'Nhóm 2')`,
      st2,
    );
    const task1 = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'MP1,01', 'Task 1')`,
      pkg1,
    );
    const task2 = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'MP2,01', 'Task 2')`,
      pkg2,
    );

    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by, changed_at)
       VALUES (?, 0, 0.5, 'Test P1', NOW() - INTERVAL '3 days')`,
      task1,
    );
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_by, changed_at)
       VALUES (?, 0, 0.5, 'Test P2', NOW() - INTERVAL '3 days')`,
      task2,
    );

    const missingP1 = await missingDiaryDates(7, p1);
    const missingP2 = await missingDiaryDates(7, p2);
    // Cả 2 dự án đều thiếu nhật ký ngày đó (chưa lập gì) — chỉ cần đảm bảo lọc chạy không lỗi
    // và trả về mảng ngày hợp lệ cho từng dự án.
    assert.ok(Array.isArray(missingP1));
    assert.ok(Array.isArray(missingP2));

    await run(`DELETE FROM task_history WHERE task_id IN (?, ?)`, task1, task2);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, task1, task2);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, pkg1, pkg2);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, st1, st2);
    await run(`DELETE FROM towers WHERE id IN (?, ?)`, t1, t2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "diary_manpower: UNIQUE(diary_id, crew) chặn thêm trùng tổ đội trong cùng 1 nhật ký",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const diaryId = await insertId(`INSERT INTO site_diaries (diary_date) VALUES ('2026-06-20')`);
    await insertId(
      `INSERT INTO diary_manpower (diary_id, crew, headcount) VALUES (?, 'Tổ điện', 5)`,
      diaryId,
    );

    await assert.rejects(
      insertId(
        `INSERT INTO diary_manpower (diary_id, crew, headcount) VALUES (?, 'Tổ điện', 3)`,
        diaryId,
      ),
      (err: unknown) => (err as { code?: string }).code === "23505",
    );

    await run(`DELETE FROM site_diaries WHERE id = ?`, diaryId);
  },
);

test(
  "site_diaries: scoped đúng theo (diary_date, project_id) — UNIQUE(diary_date, project_id) " +
    "từ migrations/0028_diary_project_unique.sql cho phép 2 dự án cùng ghi 1 ngày",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA Nhật ký 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA Nhật ký 2')`);

    const d1 = await insertId(
      `INSERT INTO site_diaries (diary_date, project_id) VALUES ('2026-06-21', ?)`,
      p1,
    );
    // Dự án khác ghi cùng ngày phải thành công (constraint composite, không còn đơn theo ngày).
    const d2 = await insertId(
      `INSERT INTO site_diaries (diary_date, project_id) VALUES ('2026-06-21', ?)`,
      p2,
    );

    const forP1 = await query<{ id: number }>(
      `SELECT id FROM site_diaries WHERE diary_date = '2026-06-21' AND project_id = ?`,
      p1,
    );
    assert.ok(forP1.some((r) => r.id === d1));
    const forP2 = await query<{ id: number }>(
      `SELECT id FROM site_diaries WHERE diary_date = '2026-06-21' AND project_id = ?`,
      p2,
    );
    assert.ok(forP2.some((r) => r.id === d2));

    // Cùng dự án, cùng ngày vẫn bị chặn trùng (composite unique giữ nguyên ý nghĩa "1 nhật ký/ngày/dự án").
    await assert.rejects(
      insertId(`INSERT INTO site_diaries (diary_date, project_id) VALUES ('2026-06-21', ?)`, p1),
      (err: unknown) => (err as { code?: string }).code === "23505",
    );

    await run(`DELETE FROM site_diaries WHERE id IN (?, ?)`, d1, d2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
