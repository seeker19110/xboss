import { HAS_TEST_DB } from "./setup";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { query, queryOne, withTransaction } from "../lib/db";
import {
  buildPlanTemplate,
  buildTrackingTemplate,
  parsePlanUpload,
  parseTrackingUpload,
} from "../lib/system-upload";
import ExcelJS from "exceljs";

if (HAS_TEST_DB) {
  describe("M64 — Upload & export kế hoạch/tracking theo hệ", () => {
    test("buildPlanTemplate và buildTrackingTemplate", async () => {
      // 1. Chuẩn bị dữ liệu mẫu
      const orgId = 1;
      const systemId = (await query<{ id: number }>("SELECT id FROM systems LIMIT 1"))[0]?.id;
      if (!systemId) return;

      const projectId = (await query<{ id: number }>("SELECT id FROM projects LIMIT 1"))[0]?.id;
      if (!projectId) return;

      // 2. Chạy thử buildPlanTemplate
      const planWb = await buildPlanTemplate(systemId, projectId);
      assert.ok(planWb instanceof ExcelJS.Workbook);
      const planWs = planWb.getWorksheet("Kế hoạch");
      assert.ok(planWs);
      assert.equal(planWs.getCell("A1").value, "BOQCODE");
      assert.equal(planWs.getCell("F1").value, "Ngày bắt đầu KH");
      assert.equal(planWs.getCell("G1").value, "Ngày kết thúc KH");

      // 3. Chạy thử buildTrackingTemplate
      const trackingWb = await buildTrackingTemplate(systemId, projectId);
      assert.ok(trackingWb instanceof ExcelJS.Workbook);
    });

    test("parsePlanUpload cập nhật đúng ngày & recompute", async () => {
      const systemId = (await query<{ id: number }>("SELECT id FROM systems LIMIT 1"))[0]?.id;
      if (!systemId) return;

      const projectId = (await query<{ id: number }>("SELECT id FROM projects LIMIT 1"))[0]?.id;
      if (!projectId) return;

      // Thêm task test trong hệ
      const stId = (
        await query<{ id: number }>("SELECT id FROM sheet_types WHERE system_id = ? LIMIT 1", [
          systemId,
        ])
      )[0]?.id;
      if (!stId) return;

      const wpId = (
        await query<{ id: number }>(
          "SELECT id FROM work_packages WHERE sheet_type_id = ? LIMIT 1",
          [stId],
        )
      )[0]?.id;
      if (!wpId) return;

      const testBoq = "M64_TEST_BOQ_PLAN";
      await query("DELETE FROM tasks WHERE boq_code = ?", [testBoq]);
      const taskRes = await query<{ id: number }>(
        `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent, status)
         VALUES (?, 'M64P', 'Task Test Plan', ?, '2026-08-01', '2026-08-10', 0, 'chuan_bi')
         RETURNING id`,
        [wpId, testBoq],
      );
      const taskId = taskRes[0]?.id;
      assert.ok(taskId);

      // Tạo workbook buffer giả lập upload
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

      // Chạy parse
      const res = await parsePlanUpload(systemId, projectId, buffer, "M64_Test_Admin");
      assert.equal(res.matched, 1);
      assert.equal(res.unmatched, 0);
      assert.equal(res.warnings.length, 0);

      // Kiểm tra giá trị đã thay đổi trong DB
      const updated = await queryOne<{ start_date: string; end_date: string }>(
        `SELECT start_date::text AS "start_date", end_date::text AS "end_date" FROM tasks WHERE id = ?`,
        [taskId],
      );
      assert.equal(updated?.start_date, "2026-08-05");
      assert.equal(updated?.end_date, "2026-08-15");

      // Cleanup
      await query("DELETE FROM tasks WHERE id = ?", [taskId]);
    });

    test("parseTrackingUpload cập nhật đúng dimensions & recompute", async () => {
      const systemId = (await query<{ id: number }>("SELECT id FROM systems LIMIT 1"))[0]?.id;
      if (!systemId) return;

      const projectId = (await query<{ id: number }>("SELECT id FROM projects LIMIT 1"))[0]?.id;
      if (!projectId) return;

      // Tìm sheet_type
      const st = (
        await query<{ id: number; code: string }>(
          `SELECT id, code FROM sheet_types WHERE system_id = ? LIMIT 1`,
          [systemId],
        )
      )[0];
      if (!st) return;

      const wpId = (
        await query<{ id: number }>(
          "SELECT id FROM work_packages WHERE sheet_type_id = ? LIMIT 1",
          [st.id],
        )
      )[0]?.id;
      if (!wpId) return;

      const testBoq = "M64_TEST_BOQ_TRACK";
      await query("DELETE FROM tasks WHERE boq_code = ?", [testBoq]);
      const taskRes = await query<{ id: number }>(
        `INSERT INTO tasks (package_id, code, name, boq_code, start_date, end_date, progress_percent, status)
         VALUES (?, 'M64T', 'Task Test Track', ?, '2026-08-01', '2026-08-10', 0, 'dang_thi_cong')
         RETURNING id`,
        [wpId, testBoq],
      );
      const taskId = taskRes[0]?.id;
      assert.ok(taskId);

      // Thêm dimensions
      await query("DELETE FROM progress_dimensions WHERE task_id = ?", [taskId]);
      await query(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed, value, sort_order)
         VALUES (?, 'Ống D20', 0, 0, 1), (?, 'Ống D25', 0, 0, 2)`,
        [taskId, taskId],
      );

      // Tạo workbook buffer giả lập upload
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(st.code);
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

      // Chạy parse
      const res = await parseTrackingUpload(systemId, projectId, buffer, "M64_Test_Admin");
      assert.equal(res.matched, 1);
      assert.equal(res.unmatched, 0);

      // Kiểm tra progress_dimensions
      const dims = await query<{ label: string; installed: number }>(
        `SELECT dimension_label AS label, installed FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`,
        [taskId],
      );
      assert.equal(dims.length, 2);
      assert.equal(dims[0]?.label, "Ống D20");
      assert.equal(dims[0]?.installed, 1);
      assert.equal(dims[1]?.label, "Ống D25");
      assert.equal(dims[1]?.installed, 0);

      // Cleanup
      await query("DELETE FROM progress_dimensions WHERE task_id = ?", [taskId]);
      await query("DELETE FROM tasks WHERE id = ?", [taskId]);
    });
  });
}
