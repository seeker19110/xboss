import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "OS-3: Predictive OS Catalog, Pipeline Run, Uncertainty Bins và Suggestions",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { listPredictionModels, runPredictionPipeline, listPredictions, decidePrediction } =
      await import("@/lib/engineering-predictions");

    const projId = await insertId(`INSERT INTO projects (name) VALUES ('Predictive Proj A')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Predict Tester', ?, 'x', 'admin')`,
      `predict-test-${projId}@test.local`,
    );

    let towerId: number | undefined;
    let sheetTypeId: number | undefined;
    let packageId: number | undefined;

    try {
      // 1. Catalog models
      const models = await listPredictionModels();
      assert.ok(models.length >= 3, "Phải có ít nhất 3 model chuẩn (schedule, cost, clash)");
      assert.ok(models.some((m) => m.useCase === "schedule_risk"));

      // 2. Tạo task trễ hạn để test schedule_risk pipeline (đi qua đúng chuỗi WBS
      // Project → Tower → SheetType → WorkPackage → Task — tasks không có cột project_id)
      towerId = await insertId(
        `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
        projId,
      );
      sheetTypeId = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'ogtd', 'OGTĐ')`,
        towerId,
      );
      packageId = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Hệ ống gió')`,
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
      if (packageId) await run(`DELETE FROM tasks WHERE package_id = ?`, packageId);
      if (packageId) await run(`DELETE FROM work_packages WHERE id = ?`, packageId);
      if (sheetTypeId) await run(`DELETE FROM sheet_types WHERE id = ?`, sheetTypeId);
      if (towerId) await run(`DELETE FROM towers WHERE id = ?`, towerId);
      await run(`DELETE FROM projects WHERE id = ?`, projId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);
