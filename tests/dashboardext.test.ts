import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "tableExists: true với bảng có sẵn, false với bảng chưa tồn tại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { tableExists } = await import("@/lib/dashboardext");
    assert.equal(await tableExists("tasks"), true);
    assert.equal(await tableExists("no_such_table_xyz"), false);
  },
);

test(
  "workfrontBlock: đếm tầng pending + tổng ngày chờ luỹ kế đúng (M14 đã làm)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { workfrontBlock } = await import("@/lib/dashboardext");
    const { daysFromTodayISO } = await import("@/lib/date");

    const stId = await insertId(
      `INSERT INTO sheet_types (code, name, slug) VALUES ('D9WF', 'Sheet test D9 WF', 'd9wf')`,
    );
    const frontId = await insertId(
      `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, '20F')`,
      stId,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label) VALUES ('D9WF-1', 'Nhóm test D9 WF', ?, '20F')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (code, name, package_id, start_date, status, progress_percent)
       VALUES ('D9WF-T1', 'Task test D9 WF', ?, ?, 'chuan_bi', 0)`,
      wpId,
      daysFromTodayISO(-7),
    );

    const block = await workfrontBlock();
    assert.ok(block != null);
    assert.ok(block!.waitingFloors >= 1);
    assert.ok(block!.cumulativeWaitDays >= 7);

    await run(`UPDATE work_fronts SET status = 'handed_over' WHERE id = ?`, frontId);
    const afterHandover = await workfrontBlock();
    assert.equal(afterHandover!.waitingFloors, block!.waitingFloors - 1);

    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, wpId);
    await run(`DELETE FROM work_fronts WHERE id = ?`, frontId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
  },
);

test(
  "qualityBlock: đếm đúng NCR mở/quá hạn/đóng-30-ngày + tỷ lệ đạt inspection",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { qualityBlock } = await import("@/lib/dashboardext");
    const { daysFromTodayISO } = await import("@/lib/date");

    // work_packages có thể rỗng trong DB test tích hợp (không seed sẵn) — tự tạo
    // đủ chuỗi FK project→tower→sheet_type→work_package (pattern tests/boq.test.ts).
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test dashboard D9')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTD9', 'Sheet test D9')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'D9-1', 'Nhóm test D9')`,
      stId,
    );

    const openId = await insertId(
      `INSERT INTO ncrs (code, description, status, due_date) VALUES ('NCR-TEST-D9-1', 'Lỗi test', 'open', ?)`,
      daysFromTodayISO(-5), // quá hạn
    );
    const closedRecentId = await insertId(
      `INSERT INTO ncrs (code, description, status, closed_at) VALUES ('NCR-TEST-D9-2', 'Lỗi test 2', 'closed', NOW())`,
    );

    const checklistId = await insertId(
      `INSERT INTO qc_checklists (name, items) VALUES ('Checklist test D9', '[]'::jsonb)`,
    );
    const passId = await insertId(
      `INSERT INTO qc_inspections (checklist_id, work_package_id, status) VALUES (?, ?, 'passed')`,
      checklistId,
      pkgId,
    );
    const failId = await insertId(
      `INSERT INTO qc_inspections (checklist_id, work_package_id, status) VALUES (?, ?, 'failed')`,
      checklistId,
      pkgId,
    );

    const block = await qualityBlock();
    assert.ok(block.ncrOpen >= 1);
    assert.ok(block.ncrOverdue >= 1);
    assert.ok(block.ncrClosed30d >= 1);
    assert.ok(block.inspectionPassRate != null && block.inspectionPassRate > 0);

    await run(`DELETE FROM ncrs WHERE id IN (?, ?)`, openId, closedRecentId);
    await run(`DELETE FROM qc_inspections WHERE id IN (?, ?)`, passId, failId);
    await run(`DELETE FROM qc_checklists WHERE id = ?`, checklistId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "voBlock: gộp giá trị VO theo trạng thái (approved gộp cả partially_approved/contract_added)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { voBlock } = await import("@/lib/dashboardext");

    const draftId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status) VALUES ('VO-D9-1', 'VO draft', 'other', 'draft')`,
    );
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, vo_id) VALUES ('VO-D9-L1', 'Dòng', 'm', 10, 1000, ?)`,
      draftId,
    );
    const approvedId = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status) VALUES ('VO-D9-2', 'VO approved', 'other', 'approved')`,
    );
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, qty_approved, unit_price, vo_id) VALUES ('VO-D9-L2', 'Dòng', 'm', 10, 8, 2000, ?)`,
      approvedId,
    );

    const block = await voBlock();
    assert.equal(block.draft, 10_000); // 10 * 1000 (đề xuất, chưa duyệt)
    assert.equal(block.approved, 16_000); // 8 * 2000 (đã duyệt)

    await run(`DELETE FROM variation_orders WHERE id IN (?, ?)`, draftId, approvedId);
  },
);

test(
  "byDisciplineBlock: mỗi hệ trong danh mục disciplines đều có 1 dòng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query } = await import("@/lib/db");
    const { byDisciplineBlock } = await import("@/lib/dashboardext");

    const disciplines = await query<{ code: string }>(`SELECT code FROM disciplines`);
    const rows = await byDisciplineBlock();
    assert.equal(rows.length, disciplines.length);
    for (const d of disciplines) assert.ok(rows.some((r) => r.code === d.code));
  },
);
