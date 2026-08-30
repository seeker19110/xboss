import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "OS-3: Predictive OS Catalog, Pipeline Run, Uncertainty Bins và Suggestions",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { listPredictionModels, runPredictionPipeline, listPredictions, decidePrediction } =
      await import("@/lib/ky-thuat/engineering-predictions");

    const projId = await insertId(`INSERT INTO projects (name) VALUES ('Predictive Proj A')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Predict Tester', ?, 'x', 'admin')`,
      `predict-test-${projId}@test.local`,
    );

    try {
      // 1. Catalog models
      const models = await listPredictionModels();
      assert.ok(models.length >= 3, "Phải có ít nhất 3 model chuẩn (schedule, cost, clash)");
      assert.ok(models.some((m) => m.useCase === "schedule_risk"));

      // 2. Tạo task trễ hạn để test schedule_risk pipeline. tasks không có project_id —
      // phải dựng đủ chuỗi WBS: projects → towers → sheet_types → work_packages → tasks.
      const towerId = await insertId(
        `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
        projId,
      );
      const sheetTypeId = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'OGTD', 'Ống gió tầng điển hình')`,
        towerId,
      );
      const packageId = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm AHU')`,
        sheetTypeId,
      );
      await insertId(
        `INSERT INTO tasks (package_id, code, name, status, progress_percent, start_date, end_date)
       VALUES (?, 'A1,01', 'Lắp đặt AHU-01', 'tre', 0.45, '2026-08-01', '2026-08-10')`,
        packageId,
      );

      // 3. Chạy pipeline dự báo
      const runResult = await runPredictionPipeline(projId, "schedule_risk");
      assert.ok(runResult.runId, "Phải trả về runId");
      assert.ok(runResult.outputsCount >= 1, "Phải phát hiện ít nhất 1 rủi ro trễ hạn");

      const firstOutput = runResult.outputs[0];
      assert.equal(firstOutput.entityType, "task");
      assert.ok(firstOutput.score > 0.7, "Điểm rủi ro phải > 0.7");
      assert.ok(
        firstOutput.suggestionId,
        "Phải tự động liên kết đề xuất kỹ thuật (ENG-2 suggestion)",
      );

      // 4. Tra cứu danh sách dự báo
      const list = await listPredictions(projId);
      assert.ok(list.length >= 1);

      // 5. Quyết định tiếp nhận
      const decided = await decidePrediction(projId, firstOutput.id, "accepted");
      assert.equal(decided, true);

      const updatedList = await listPredictions(projId, { status: "accepted" });
      assert.equal(updatedList.length, 1);
      assert.equal(updatedList[0].status, "accepted");
    } finally {
      // towers.project_id không có ON DELETE CASCADE — phải dọn chuỗi WBS ngược từ dưới lên
      // trước khi xoá project (các bảng engineering_* đã cascade theo project_id).
      await run(
        `DELETE FROM tasks WHERE package_id IN (
           SELECT wp.id FROM work_packages wp
           JOIN sheet_types st ON st.id = wp.sheet_type_id
           JOIN towers tw ON tw.id = st.tower_id
           WHERE tw.project_id = ?)`,
        projId,
      );
      await run(
        `DELETE FROM work_packages WHERE sheet_type_id IN (
           SELECT st.id FROM sheet_types st
           JOIN towers tw ON tw.id = st.tower_id
           WHERE tw.project_id = ?)`,
        projId,
      );
      await run(
        `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
        projId,
      );
      await run(`DELETE FROM towers WHERE project_id = ?`, projId);
      await run(`DELETE FROM projects WHERE id = ?`, projId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);
