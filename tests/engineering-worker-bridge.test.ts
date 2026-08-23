import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { bridgeTaskResultToEngineering } from "@/lib/engineering-worker-bridge";
import {
  enqueueAsyncTask,
  claimNextAsyncTask,
  completeAsyncTask,
} from "@/lib/engineering-task-queue";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("MEPF Worker Bridge: API signatures và functions", () => {
  assert.equal(typeof bridgeTaskResultToEngineering, "function");
});

test(
  "MEPF Worker Bridge: Chuyển đổi kết quả Task sang Engineering Objects & Gate 0 Workflow",
  { skip: !HAS_DB },
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Worker Bridge Proj')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Worker Bridge Tester', ?, 'x', 'admin')`,
      `worker-bridge-test-${projectId}@x.vn`,
    );

    // 1. Tạo và hoàn tất một async task mẫu HVAC
    const task = await enqueueAsyncTask({
      projectId,
      taskType: "mepf.hvac.calc",
      payload: { room: "P201", area: 150 },
      createdBy: userId,
    });

    assert.ok(task.id);

    // completeAsyncTask chỉ chuyển 'processing' -> 'completed' — phải claim trước.
    const claimed = await claimNextAsyncTask("worker-bridge-test", ["mepf.hvac.calc"], 5);
    assert.equal(claimed?.id, task.id);

    const sampleResult = {
      spools: [
        {
          spool_id: "DUCT-SPOOL-001",
          type: "duct_spool",
          discipline: "HVAC",
          dimensions: "600x400",
          length_m: 5.8,
          area_m2: 11.6,
          material: "Galvanized Steel",
          thickness_mm: 0.8,
        },
        {
          spool_id: "DUCT-SPOOL-002",
          type: "duct_spool",
          discipline: "HVAC",
          dimensions: "400x300",
          length_m: 3.2,
          area_m2: 4.48,
          material: "Galvanized Steel",
          thickness_mm: 0.8,
        },
      ],
    };

    await completeAsyncTask(task.id, sampleResult);

    // 2. Thực hiện Bridge sang Engineering
    const bridgeRes = await bridgeTaskResultToEngineering({
      taskId: task.id,
      projectId,
      userId,
    });

    assert.ok(bridgeRes.sourceId, "Phải sinh sourceId");
    assert.ok(bridgeRes.sourceRevisionId, "Phải sinh sourceRevisionId");
    assert.equal(bridgeRes.createdObjectIds.length, 2, "Phải sinh đúng 2 objects");
    assert.ok(bridgeRes.suggestionId, "Phải sinh suggestionId");
    // Gate 0 (§8) cấm lập workflow từ đề xuất chưa được chấp nhận — đề xuất do worker sinh
    // ra luôn ở trạng thái chờ duyệt, nên bridge KHÔNG tạo workflow ở bước này. Workflow
    // được lập sau, khi người duyệt chấp nhận đề xuất (ENG-2).
    assert.equal(bridgeRes.workflowId, null, "Chưa được lập workflow khi đề xuất chưa chấp nhận");
    assert.ok(bridgeRes.summary.includes("thành công"));
  },
);
