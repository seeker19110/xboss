import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M22 — scoping đa dự án cho QC (qc_inspections, task_documents) và phiếu YCNT
// (inspection_requests). Các bảng này không có cột project_id riêng (ADR-0004) —
// project được suy qua chuỗi join task/work_package/sheet_type/tower. Không có hàm
// lib riêng (SQL nằm thẳng trong route) nên test mirror đúng điều kiện WHERE/EXISTS
// đã thêm ở app/api/qc/inspections, app/api/qc/documents, app/api/inspection-requests
// (xem tests/materials-scope.test.ts cho cùng pattern).

async function setupTwoProjects() {
  const { insertId } = await import("@/lib/db");
  const p1 = await insertId(
    `INSERT INTO projects (name, code) VALUES ('DA QC Scope 1', 'PJT-QCS1')`,
  );
  const p2 = await insertId(
    `INSERT INTO projects (name, code) VALUES ('DA QC Scope 2', 'PJT-QCS2')`,
  );
  const tw1 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp QCS1')`, p1);
  const tw2 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp QCS2')`, p2);
  const st1 = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'QCS1SHEET', 'Sheet QCS1')`,
    tw1,
  );
  const st2 = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'QCS2SHEET', 'Sheet QCS2')`,
    tw2,
  );
  const pkg1 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'QCS1', 'Nhóm QCS1')`,
    st1,
  );
  const pkg2 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'QCS2', 'Nhóm QCS2')`,
    st2,
  );
  const task1 = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'QCS1,01', 'Task QCS1', 1)`,
    pkg1,
  );
  const task2 = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'QCS2,01', 'Task QCS2', 1)`,
    pkg2,
  );
  return { p1, p2, tw1, tw2, st1, st2, pkg1, pkg2, task1, task2 };
}

async function teardown(ids: {
  p1: number;
  p2: number;
  tw1: number;
  tw2: number;
  st1: number;
  st2: number;
  pkg1: number;
  pkg2: number;
  task1: number;
  task2: number;
}) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM tasks WHERE id IN (?, ?)`, ids.task1, ids.task2);
  await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, ids.pkg1, ids.pkg2);
  await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, ids.st1, ids.st2);
  await run(`DELETE FROM towers WHERE id IN (?, ?)`, ids.tw1, ids.tw2);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, ids.p1, ids.p2);
}

test(
  "qc_inspections: mirror WHERE tw.project_id — chỉ thấy lần kiểm tra thuộc dự án đang chọn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");
    const ids = await setupTwoProjects();

    const checklistId = await insertId(
      `INSERT INTO qc_checklists (name, items) VALUES ('Checklist scope', '[]'::jsonb)`,
    );
    const insp1 = await insertId(
      `INSERT INTO qc_inspections (checklist_id, task_id, status) VALUES (?, ?, 'draft')`,
      checklistId,
      ids.task1,
    );
    const insp2 = await insertId(
      `INSERT INTO qc_inspections (checklist_id, task_id, status) VALUES (?, ?, 'draft')`,
      checklistId,
      ids.task2,
    );

    const rows = await query<{ id: number }>(
      `SELECT i.id
         FROM qc_inspections i
         LEFT JOIN tasks t ON t.id = i.task_id
         LEFT JOIN work_packages wp ON wp.id = i.work_package_id
         LEFT JOIN work_packages wp2 ON wp2.id = t.package_id
         LEFT JOIN sheet_types st ON st.id = COALESCE(wp.sheet_type_id, wp2.sheet_type_id)
         LEFT JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?`,
      ids.p1,
    );
    assert.ok(rows.some((r) => r.id === insp1));
    assert.ok(!rows.some((r) => r.id === insp2));

    await run(`DELETE FROM qc_inspections WHERE id IN (?, ?)`, insp1, insp2);
    await run(`DELETE FROM qc_checklists WHERE id = ?`, checklistId);
    await teardown(ids);
  },
);

test(
  "task_documents: mirror WHERE tw.project_id — chỉ thấy hồ sơ chất lượng thuộc dự án đang chọn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");
    const ids = await setupTwoProjects();

    const doc1 = await insertId(
      `INSERT INTO task_documents (task_id, file_name, doc_category) VALUES (?, 'd1.pdf', 'hoan_cong')`,
      ids.task1,
    );
    const doc2 = await insertId(
      `INSERT INTO task_documents (task_id, file_name, doc_category) VALUES (?, 'd2.pdf', 'hoan_cong')`,
      ids.task2,
    );

    const rows = await query<{ id: number }>(
      `SELECT d.id
         FROM task_documents d
         JOIN tasks t ON t.id = d.task_id
         LEFT JOIN work_packages wp ON wp.id = t.package_id
         LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
         LEFT JOIN towers tw ON tw.id = st.tower_id
        WHERE d.task_id IS NOT NULL AND tw.project_id = ?`,
      ids.p1,
    );
    assert.ok(rows.some((r) => r.id === doc1));
    assert.ok(!rows.some((r) => r.id === doc2));

    await run(`DELETE FROM task_documents WHERE id IN (?, ?)`, doc1, doc2);
    await teardown(ids);
  },
);

test(
  "inspection_requests: mirror EXISTS(...tw2.project_id) — list/detail không lẫn phiếu YCNT dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query, queryOne } = await import("@/lib/db");
    const { nextSeqCode, withUniqueRetry } = await import("@/lib/seqcode");
    const ids = await setupTwoProjects();

    const code1 = await withUniqueRetry(async () => {
      const code = await nextSeqCode("inspection_requests", "code", "YCNT-", 4);
      const reqId = await insertId(
        `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, NOW())`,
        code,
      );
      await run(
        `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
        reqId,
        ids.task1,
      );
      return { code, reqId };
    });
    const code2 = await withUniqueRetry(async () => {
      const code = await nextSeqCode("inspection_requests", "code", "YCNT-", 4);
      const reqId = await insertId(
        `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, NOW())`,
        code,
      );
      await run(
        `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
        reqId,
        ids.task2,
      );
      return { code, reqId };
    });

    // List (EXISTS ... tw2.project_id = p1): chỉ thấy phiếu 1.
    const list = await query<{ id: number }>(
      `SELECT r.id
         FROM inspection_requests r
        WHERE EXISTS (SELECT 1 FROM inspection_request_tasks rt2
                        JOIN tasks t2 ON t2.id = rt2.task_id
                        JOIN work_packages wp2 ON wp2.id = t2.package_id
                        JOIN sheet_types st2 ON st2.id = wp2.sheet_type_id
                        JOIN towers tw2 ON tw2.id = st2.tower_id
                       WHERE rt2.request_id = r.id AND tw2.project_id = ?)`,
      ids.p1,
    );
    assert.ok(list.some((r) => r.id === code1.reqId));
    assert.ok(!list.some((r) => r.id === code2.reqId));

    // Detail (requestInProject): true cho phiếu đúng dự án, false cho phiếu dự án khác.
    const detail1 = await queryOne<{ id: number }>(
      `SELECT rt.request_id AS id
         FROM inspection_request_tasks rt
         JOIN tasks t ON t.id = rt.task_id
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE rt.request_id = ? AND tw.project_id = ?
        LIMIT 1`,
      code1.reqId,
      ids.p1,
    );
    assert.ok(detail1, "phiếu YCNT dự án 1 phải thấy được khi context = dự án 1");

    const detail2InP1 = await queryOne<{ id: number }>(
      `SELECT rt.request_id AS id
         FROM inspection_request_tasks rt
         JOIN tasks t ON t.id = rt.task_id
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE rt.request_id = ? AND tw.project_id = ?
        LIMIT 1`,
      code2.reqId,
      ids.p1,
    );
    assert.equal(detail2InP1, undefined, "phiếu YCNT dự án 2 phải 404 khi context = dự án 1");

    await run(`DELETE FROM inspection_requests WHERE id IN (?, ?)`, code1.reqId, code2.reqId);
    await teardown(ids);
  },
);
