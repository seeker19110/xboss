import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M123 PR2 (§16) — lọc dự án cho baselines (app/api/baselines/route.ts +
// app/api/baselines/[id]/route.ts).
//
// Route dùng getCurrentUser()/getCurrentProjectId() đọc cookie qua next/headers → không gọi
// handler trực tiếp được trong node:test (không có request context của Next). Bám đúng cách
// tests/approvals-task-proposal.test.ts đang làm: tái hiện ĐÚNG câu SQL route dùng (JOIN
// tasks → work_packages → sheet_types → towers → project_id, INSERT baselines/baseline_tasks
// có project_id, SELECT có WHERE project_id = ?) rồi kiểm bất biến cách ly dự án qua đó.

const RUN = Date.now().toString(36);

async function seedProject(suffix: string) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES (?)`,
    `M123 BL ${suffix} ${RUN}`,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`,
    projectId,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
    towerId,
    `S-${suffix}-${RUN}`,
    `Sheet ${suffix}`,
    `sheet-${suffix.toLowerCase()}-${RUN}`,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, ?)`,
    sheetId,
    `WP-${suffix}-${RUN}`,
    `Nhóm ${suffix}`,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, start_date, end_date)
     VALUES (?, ?, ?, 0.5, '2026-01-01', '2026-01-10')`,
    wpId,
    `TASK-${suffix}-${RUN}`,
    `Task ${suffix}`,
  );
  return { projectId, towerId, sheetId, wpId, taskId };
}

// Tái hiện chính xác 2 câu SQL của POST /api/baselines: đếm task của dự án + INSERT
// baseline_tasks lọc theo cùng chuỗi JOIN tasks→work_packages→sheet_types→towers.
async function chotBaseline(projectId: number, name: string) {
  const { queryOne, insertId, run, withTransaction } = await import("@/lib/db");
  const taskCount = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ?`,
    projectId,
  );
  return withTransaction(async () => {
    const baselineId = await insertId(
      `INSERT INTO baselines (name, project_id) VALUES (?, ?)`,
      name,
      projectId,
    );
    await run(
      `INSERT INTO baseline_tasks (baseline_id, task_id, start_date, end_date, progress_percent)
       SELECT ?, t.id, t.start_date, t.end_date, t.progress_percent
         FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?`,
      baselineId,
      projectId,
    );
    return { baselineId, taskCount: Number(taskCount?.n ?? 0) };
  });
}

test(
  "baselines: chốt ở dự án A không cuốn task của dự án B (AC2) + GET/DELETE lọc đúng dự án (AC3)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query, queryOne, run } = await import("@/lib/db");

    const a = await seedProject("A");
    const b = await seedProject("B");
    let baselineIdA = 0;

    try {
      // AC2: chốt baseline ở dự án A → baseline_tasks không chứa task của B.
      const { baselineId, taskCount } = await chotBaseline(a.projectId, `Baseline A ${RUN}`);
      baselineIdA = baselineId;
      assert.equal(taskCount, 1, "dự án A chỉ có đúng 1 task lúc chốt");

      const rows = await query<{ taskId: number }>(
        `SELECT task_id AS "taskId" FROM baseline_tasks WHERE baseline_id = ?`,
        baselineIdA,
      );
      assert.deepEqual(
        rows.map((r) => r.taskId),
        [a.taskId],
        "baseline_tasks chỉ được chứa task của dự án A",
      );
      assert.ok(
        !rows.some((r) => r.taskId === b.taskId),
        "baseline_tasks KHÔNG được cuốn task của dự án B",
      );

      // AC3: GET (SELECT ... WHERE b.project_id = ?) ở dự án B không thấy baseline của A.
      const listB = await query<{ id: number }>(
        `SELECT id FROM baselines WHERE project_id = ? ORDER BY id DESC`,
        b.projectId,
      );
      assert.ok(
        !listB.some((r) => r.id === baselineIdA),
        "GET ở dự án B không được trả baseline của dự án A",
      );

      const listA = await query<{ id: number }>(
        `SELECT id FROM baselines WHERE project_id = ? ORDER BY id DESC`,
        a.projectId,
      );
      assert.ok(
        listA.some((r) => r.id === baselineIdA),
        "GET ở dự án A phải thấy baseline vừa chốt",
      );

      // AC3: DELETE khi đang ở dự án B nhưng id thuộc dự án A → không tìm thấy (404), giống
      // đúng câu SELECT id FROM baselines WHERE id = ? AND project_id = ? mà route dùng.
      const foundFromB = await queryOne<{ id: number }>(
        `SELECT id FROM baselines WHERE id = ? AND project_id = ?`,
        baselineIdA,
        b.projectId,
      );
      assert.equal(foundFromB, undefined, "DELETE từ dự án B phải coi như không tồn tại (404)");

      const foundFromA = await queryOne<{ id: number }>(
        `SELECT id FROM baselines WHERE id = ? AND project_id = ?`,
        baselineIdA,
        a.projectId,
      );
      assert.ok(foundFromA, "DELETE từ đúng dự án A phải tìm thấy baseline");
    } finally {
      if (baselineIdA) {
        await run(`DELETE FROM baseline_tasks WHERE baseline_id = ?`, baselineIdA);
        await run(`DELETE FROM baselines WHERE id = ?`, baselineIdA);
      }
      await run(`DELETE FROM tasks WHERE id IN (?, ?)`, a.taskId, b.taskId);
      await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, a.wpId, b.wpId);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, a.sheetId, b.sheetId);
      await run(`DELETE FROM towers WHERE id IN (?, ?)`, a.towerId, b.towerId);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, a.projectId, b.projectId);
    }
  },
);
