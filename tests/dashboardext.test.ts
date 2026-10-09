import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "tableExists: true với bảng có sẵn, false với bảng chưa tồn tại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { tableExists } = await import("@/lib/tien-do/dashboardext");
    assert.equal(await tableExists("tasks"), true);
    assert.equal(await tableExists("bang_khong_ton_tai_xyz"), false);
  },
);

test(
  "workfrontBlock: đếm đúng tầng chưa sẵn sàng mặt bằng (công tác cuối chưa bàn giao) có task tới hạn + tổng ngày chờ luỹ kế (M46 — model tầng×công tác, thay M14 cũ); S16: thiếu dự án = 0, không JOIN task dự án khác cùng tên tầng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { workfrontBlock } = await import("@/lib/tien-do/dashboardext");
    const { daysFromTodayISO } = await import("@/lib/nen/date");

    // sort_order rất lớn để chắc chắn là "công tác cuối" toàn cục trong lúc test chạy,
    // không phụ thuộc/đụng tới 7 công tác seed sẵn (Trắc đạc..Đóng trần) hay dữ liệu
    // test khác đang có trong DB tích hợp dùng chung.
    const stageId = await insertId(
      `INSERT INTO construction_stages (name, sort_order, duration_days) VALUES ('Test D9 stage cuối', 9999, 1)`,
    );
    // 3 dự án mới (đếm theo dự án nên con số chính xác, không lẫn dữ liệu test khác):
    // A có tầng D9F + task quá hạn; B chỉ có task ở tầng D9G; C có tầng D9G nhưng không có task.
    const ids: {
      projects: number[];
      towers: number[];
      sheets: number[];
      wps: number[];
      tasks: number[];
      fronts: number[];
    } = { projects: [], towers: [], sheets: [], wps: [], tasks: [], fronts: [] };
    const duAn = async (ten: string) => {
      const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, ten);
      const towerId = await insertId(
        `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`,
        projectId,
      );
      const sheetId = await insertId(
        `INSERT INTO sheet_types (code, name, slug, tower_id) VALUES (?, ?, ?, ?)`,
        `WF-${projectId}`,
        `Sheet WF ${projectId}`,
        `d9-wf-${projectId}`,
        towerId,
      );
      ids.projects.push(projectId);
      ids.towers.push(towerId);
      ids.sheets.push(sheetId);
      return { projectId, sheetId };
    };
    const tang = async (projectId: number, floor: string) =>
      ids.fronts.push(
        await insertId(
          `INSERT INTO floor_stage_fronts (project_id, floor_label, stage_id) VALUES (?, ?, ?)`,
          projectId,
          floor,
          stageId,
        ),
      );
    const taskQuaHan = async (sheetId: number, floor: string) => {
      const wpId = await insertId(
        `INSERT INTO work_packages (code, name, sheet_type_id, floor_label) VALUES (?, 'Nhóm test WF', ?, ?)`,
        `WF-${sheetId}-${floor}`,
        sheetId,
        floor,
      );
      ids.wps.push(wpId);
      ids.tasks.push(
        await insertId(
          `INSERT INTO tasks (code, name, package_id, start_date, status, progress_percent)
           VALUES (?, 'Task test WF', ?, ?, 'chuan_bi', 0)`,
          `T-${wpId}`,
          wpId,
          daysFromTodayISO(-4), // đã quá hạn bắt đầu 4 ngày
        ),
      );
    };

    try {
      const a = await duAn("Test WF A");
      const b = await duAn("Test WF B");
      const c = await duAn("Test WF C");
      await tang(a.projectId, "D9F");
      await taskQuaHan(a.sheetId, "D9F");
      await taskQuaHan(b.sheetId, "D9G");
      await tang(c.projectId, "D9G");

      const blockA = await workfrontBlock(a.projectId);
      assert.ok(blockA !== null);
      assert.equal(blockA!.waitingFloors, 1);
      assert.equal(blockA!.cumulativeWaitDays, 4);

      // S16: tầng D9G của C không được đếm task tầng D9G của dự án B.
      assert.equal((await workfrontBlock(c.projectId))!.waitingFloors, 0);
      // S16: chưa chọn dự án → không đếm xuyên dự án/tổ chức (trước đây phạm vi '*').
      assert.equal((await workfrontBlock(null))!.waitingFloors, 0);
    } finally {
      for (const id of ids.tasks) await run(`DELETE FROM tasks WHERE id = ?`, id);
      for (const id of ids.wps) await run(`DELETE FROM work_packages WHERE id = ?`, id);
      for (const id of ids.fronts) await run(`DELETE FROM floor_stage_fronts WHERE id = ?`, id);
      for (const id of ids.sheets) await run(`DELETE FROM sheet_types WHERE id = ?`, id);
      for (const id of ids.towers) await run(`DELETE FROM towers WHERE id = ?`, id);
      for (const id of ids.projects) await run(`DELETE FROM projects WHERE id = ?`, id);
      await run(`DELETE FROM construction_stages WHERE id = ?`, stageId);
    }
  },
);

test(
  "qualityBlock: đếm đúng NCR mở/quá hạn/đóng-30-ngày + tỷ lệ đạt inspection",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { qualityBlock } = await import("@/lib/tien-do/dashboardext");
    const { daysFromTodayISO } = await import("@/lib/nen/date");

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
    const { voBlock } = await import("@/lib/tien-do/dashboardext");

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
  "bySystemBlock: mỗi hệ trong danh mục systems đều có 1 dòng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query } = await import("@/lib/db");
    const { bySystemBlock } = await import("@/lib/tien-do/dashboardext");

    const systems = await query<{ code: string }>(`SELECT code FROM systems`);
    const rows = await bySystemBlock();
    assert.equal(rows.length, systems.length);
    for (const d of systems) assert.ok(rows.some((r) => r.code === d.code));
  },
);

test(
  "bySystemBlock(projectId): budgetUsedPct khớp getCostReport (exact), ngân sách 0 → 0 không chia 0",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { bySystemBlock } = await import("@/lib/tien-do/dashboardext");
    const { getCostReport } = await import("@/lib/tai-chinh/cost");

    const pId = await insertId(`INSERT INTO projects (name) VALUES ('Test BSB Cost')`);
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES ('BSBC', 'Hệ test BSB cost')`,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, project_id, qty_contract, unit_price)
       VALUES ('BSBC-BOQ', 'BOQ', 'm', ?, ?, 1, 800)`,
      sysId,
      pId,
    );
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp BSBC')`,
      pId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (code, name, slug, system_id, tower_id)
       VALUES ('BSBC', 'Sheet BSBC', 'bsbc', ?, ?)`,
      sysId,
      towerId,
    );
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, status, project_id) VALUES ('BSBC-PO', 'confirmed', ?)`,
      pId,
    );
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, project_id, name, unit) VALUES (?, ?, 'VT', 'm')`,
      sheetId,
      pId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 1, 200)`,
      poId,
      matId,
    );
    try {
      const rows = await bySystemBlock(pId);
      const row = rows.find((r) => r.code === "BSBC");
      assert.ok(row);
      assert.equal(row!.budgetUsedPct, 25); // 200/800
      const report = await getCostReport(
        { kind: "project", projectId: pId },
        { groupBy: "system", includeVo: true },
      );
      const rep = report.rows.find((r) => r.systemCode === "BSBC");
      assert.equal(row!.budgetUsedPct, Number(rep!.usageBasisPoints) / 100);
      for (const r of rows.filter((x) => x.code !== "BSBC")) {
        assert.equal(r.budgetUsedPct, 0); // ngân sách 0 → 0, không NaN/Infinity
      }
      // Không dự án → không số liệu chi phí (fail-closed).
      assert.ok((await bySystemBlock()).every((r) => r.budgetUsedPct === 0));
    } finally {
      await run(`DELETE FROM po_items WHERE po_id = ?`, poId);
      await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
      await run(`DELETE FROM materials WHERE id = ?`, matId);
      await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
      await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
      await run(`DELETE FROM towers WHERE id = ?`, towerId);
      await run(`DELETE FROM systems WHERE id = ?`, sysId);
      await run(`DELETE FROM projects WHERE id = ?`, pId);
    }
  },
);

// ===== Test tích hợp: lọc theo projectId (chống rò rỉ chéo dự án, M22 PR — audit) =====
// 2 dự án riêng biệt, mỗi dự án 1 NCR + 1 PO + 1 VO gắn project_id khác nhau. Truyền
// projectId của dự án B phải KHÔNG thấy dữ liệu của dự án A (và ngược lại).

test(
  "qualityBlock(projectId): NCR của dự án khác không lẫn vào khi lọc theo 1 dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { qualityBlock } = await import("@/lib/tien-do/dashboardext");

    const pA = await insertId(`INSERT INTO projects (name) VALUES ('Test QB Leak A')`);
    const pB = await insertId(`INSERT INTO projects (name) VALUES ('Test QB Leak B')`);

    const ncrA = await insertId(
      `INSERT INTO ncrs (code, description, status, project_id) VALUES ('NCR-LEAK-A', 'Lỗi A', 'open', ?)`,
      pA,
    );
    const ncrB = await insertId(
      `INSERT INTO ncrs (code, description, status, project_id) VALUES ('NCR-LEAK-B', 'Lỗi B', 'open', ?)`,
      pB,
    );

    const blockA = await qualityBlock(pA);
    const blockB = await qualityBlock(pB);
    // Mỗi dự án chỉ thấy đúng 1 NCR mở của chính nó — không lẫn NCR dự án kia.
    assert.equal(blockA.ncrOpen, 1);
    assert.equal(blockB.ncrOpen, 1);

    await run(`DELETE FROM ncrs WHERE id IN (?, ?)`, ncrA, ncrB);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  },
);

test(
  "procurementBlock(projectId): PO trễ giao của dự án khác không lẫn vào",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { procurementBlock } = await import("@/lib/tien-do/dashboardext");
    const { daysFromTodayISO } = await import("@/lib/nen/date");

    const pA = await insertId(`INSERT INTO projects (name) VALUES ('Test Proc Leak A')`);
    const pB = await insertId(`INSERT INTO projects (name) VALUES ('Test Proc Leak B')`);

    const poA = await insertId(
      `INSERT INTO purchase_orders (po_code, status, expected_date, project_id)
       VALUES ('PO-LEAK-A', 'draft', ?, ?)`,
      daysFromTodayISO(-3),
      pA,
    );
    const poB = await insertId(
      `INSERT INTO purchase_orders (po_code, status, expected_date, project_id)
       VALUES ('PO-LEAK-B', 'draft', ?, ?)`,
      daysFromTodayISO(-3),
      pB,
    );

    const blockA = await procurementBlock(pA);
    const blockB = await procurementBlock(pB);
    assert.equal(blockA.poLate, 1);
    assert.equal(blockB.poLate, 1);

    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poA, poB);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  },
);
