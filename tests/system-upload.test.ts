import { HAS_TEST_DB } from "./setup";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { query, queryOne, insertId } from "../lib/db";
import {
  buildPlanTemplate,
  buildTrackingTemplate,
  parsePlanUpload,
  parseTrackingUpload,
} from "../lib/system-upload";
import ExcelJS from "exceljs";

// Test tự tạo project/tower/sheet_type/work_package riêng (KHÔNG phụ thuộc dữ liệu có
// sẵn trong DB test — CI chạy trên Postgres trống, chỉ có 6 dòng `systems` từ migration
// seed, bảng `projects` rỗng) — đúng convention `tests/recompute.test.ts`/`boq.test.ts`.
// Guard `if (!x) return` kiểu SELECT ... LIMIT 1 từng khiến 2/3 test "pass" giả mà không
// chạy logic gì (projectId luôn null) — bài học M64 review.
async function setupSystemFixture(): Promise<{
  systemId: number;
  projectId: number;
  sheetTypeId: number;
  sheetCode: string;
  workPackageId: number;
}> {
  const system = await queryOne<{ id: number }>(`SELECT id FROM systems LIMIT 1`);
  assert.ok(system, "cần ít nhất 1 hệ (systems) — migration seed phải có sẵn");
  const systemId = system!.id;

  const projectCode = `M64-TEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const projectId = await insertId(
    `INSERT INTO projects (name, code) VALUES ('Test M64', ?)`,
    projectCode,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp Test M64')`,
    projectId,
  );
  const sheetCode = `M64TEST${Date.now()}`;
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet Test M64', ?)`,
    towerId,
    sheetCode,
    systemId,
  );
  const workPackageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'WP1', 'Nhóm Test M64')`,
    sheetTypeId,
  );

  return { systemId, projectId, sheetTypeId, sheetCode, workPackageId };
}

if (HAS_TEST_DB) {
  describe("M64 — Upload & export kế hoạch/tracking theo hệ", () => {
    test("buildPlanTemplate và buildTrackingTemplate", async () => {
      const { systemId, projectId } = await setupSystemFixture();

      const planWb = await buildPlanTemplate(systemId, projectId);
      assert.ok(planWb instanceof ExcelJS.Workbook);
      const planWs = planWb.getWorksheet("Kế hoạch");
      assert.ok(planWs);
      assert.equal(planWs.getCell("A1").value, "BOQCODE");
      assert.equal(planWs.getCell("F1").value, "Ngày bắt đầu KH");
      assert.equal(planWs.getCell("G1").value, "Ngày kết thúc KH");

      const trackingWb = await buildTrackingTemplate(systemId, projectId);
      assert.ok(trackingWb instanceof ExcelJS.Workbook);
    });

    test("parsePlanUpload cập nhật đúng ngày & recompute", async () => {
      const { systemId, projectId, workPackageId } = await setupSystemFixture();

      const testBoq = "M64_TEST_BOQ_PLAN";
      const taskId = await insertId(
        `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent, status)
         VALUES (?, 'M64P', 'Task Test Plan', ?, '2026-08-01', '2026-08-10', 0, 'chuan_bi')`,
        workPackageId,
        testBoq,
      );
      assert.ok(taskId);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Kế hoạch");
      ws.addRow([
        "BOQCODE",
        "Sheet",
        "Nhóm",
        "Mã",
        "Tên công việc",
        "Ngày bắt đầu KH",
        "Ngày kết thúc KH",
      ]);
      ws.addRow([testBoq, "Sheet1", "WP1", "M64P", "Task Test Plan", "2026-08-05", "2026-08-15"]);

      const buffer = (await wb.xlsx.writeBuffer()) as any;

      const res = await parsePlanUpload(systemId, projectId, buffer, "M64_Test_Admin");
      assert.equal(res.matched, 1);
      assert.equal(res.unmatched, 0);
      assert.equal(res.warnings.length, 0);

      const updated = await queryOne<{ start_date: string; end_date: string }>(
        `SELECT start_date::text AS "start_date", end_date::text AS "end_date" FROM tasks WHERE id = ?`,
        taskId,
      );
      assert.equal(updated?.start_date, "2026-08-05");
      assert.equal(updated?.end_date, "2026-08-15");
    });

    test("parsePlanUpload: BOQCODE thuộc hệ khác → unmatched, không đụng dữ liệu", async () => {
      const fixtureA = await setupSystemFixture();
      // Hệ B khác — cùng `systems` (chỉ 6 dòng cố định) nên lấy hệ còn lại nếu có,
      // nếu không thì tự tạo work_package/sheet_type ở CÙNG hệ nhưng project khác để
      // vẫn kiểm được nhánh "boq thuộc dự án/hệ khác không bị đụng".
      const other = await queryOne<{ id: number }>(
        `SELECT id FROM systems WHERE id != ? LIMIT 1`,
        fixtureA.systemId,
      );
      const fixtureB = await setupSystemFixture();
      const boqOther = "M64_TEST_BOQ_OTHER";
      const otherTaskId = await insertId(
        `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent, status)
         VALUES (?, 'M64O', 'Task hệ khác', ?, '2026-08-01', '2026-08-10', 0, 'chuan_bi')`,
        fixtureB.workPackageId,
        boqOther,
      );

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Kế hoạch");
      ws.addRow([
        "BOQCODE",
        "Sheet",
        "Nhóm",
        "Mã",
        "Tên công việc",
        "Ngày bắt đầu KH",
        "Ngày kết thúc KH",
      ]);
      ws.addRow([boqOther, "Sheet1", "WP1", "M64O", "Task hệ khác", "2026-09-01", "2026-09-10"]);
      ws.addRow([
        "KHONG_TON_TAI",
        "Sheet1",
        "WP1",
        "M64X",
        "Không tồn tại",
        "2026-09-01",
        "2026-09-10",
      ]);
      const buffer = (await wb.xlsx.writeBuffer()) as any;

      const res = await parsePlanUpload(
        fixtureA.systemId,
        fixtureA.projectId,
        buffer,
        "M64_Test_Admin",
      );
      assert.equal(res.matched, 0);
      assert.equal(res.unmatched, 2);

      const untouched = await queryOne<{ start_date: string }>(
        `SELECT start_date::text AS "start_date" FROM tasks WHERE id = ?`,
        otherTaskId,
      );
      assert.equal(untouched?.start_date, "2026-08-01"); // không bị ghi đè bởi upload của hệ A
      void other;
    });

    test("parseTrackingUpload cập nhật đúng dimensions & recompute", async () => {
      const { sheetCode, workPackageId } = await setupSystemFixture();
      // systemId lấy lại qua work_package → sheet_type để đảm bảo khớp đúng fixture vừa tạo
      const st = await queryOne<{ id: number; system_id: number }>(
        `SELECT st.id, st.system_id FROM sheet_types st
           JOIN work_packages wp ON wp.sheet_type_id = st.id
          WHERE wp.id = ?`,
        workPackageId,
      );
      assert.ok(st);

      const testBoq = "M64_TEST_BOQ_TRACK";
      const taskId = await insertId(
        `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent, status)
         VALUES (?, 'M64T', 'Task Test Track', ?, '2026-08-01', '2026-08-10', 0, 'dang_thi_cong')`,
        workPackageId,
        testBoq,
      );
      assert.ok(taskId);

      await query(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed, value, sort_order)
         VALUES (?, 'Ống D20', 0, 0, 1), (?, 'Ống D25', 0, 0, 2)`,
        taskId,
        taskId,
      );

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetCode);
      ws.addRow([
        "BOQCODE",
        "Mã",
        "Chi tiết công việc",
        "Tầng",
        "Người phụ trách",
        "Bắt đầu",
        "Kết thúc",
        "% Tiến độ",
        "Trạng thái",
        "Ống D20",
        "Ống D25",
      ]);
      ws.addRow([
        testBoq,
        "M64T",
        "Task Test Track",
        "T1",
        "Tuan",
        "2026-08-01",
        "2026-08-10",
        "0%",
        "Đang thi công",
        "x", // Đã lắp
        "○", // Chưa lắp
      ]);

      const buffer = (await wb.xlsx.writeBuffer()) as any;

      const res = await parseTrackingUpload(st!.system_id, null, buffer, "M64_Test_Admin");
      assert.equal(res.matched, 1);
      assert.equal(res.unmatched, 0);

      const dims = await query<{ label: string; installed: number }>(
        `SELECT dimension_label AS label, installed FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`,
        taskId,
      );
      assert.equal(dims.length, 2);
      assert.equal(dims[0]?.label, "Ống D20");
      assert.equal(dims[0]?.installed, 1);
      assert.equal(dims[1]?.label, "Ống D25");
      assert.equal(dims[1]?.installed, 0);

      const task = await queryOne<{ progress_percent: number }>(
        `SELECT progress_percent FROM tasks WHERE id = ?`,
        taskId,
      );
      assert.equal(task?.progress_percent, 0.5); // 1/2 dimension đã tick — recomputeTask chạy thật
    });
  });
}
