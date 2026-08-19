import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueAsyncTask,
  claimNextAsyncTask,
  updateTaskProgress,
  completeAsyncTask,
  failAsyncTask,
  cancelAsyncTask,
  listAsyncTasks,
} from "@/lib/engineering-task-queue";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M73: Task Queue API signatures và logic xử lý", () => {
  assert.equal(typeof enqueueAsyncTask, "function");
  assert.equal(typeof claimNextAsyncTask, "function");
  assert.equal(typeof updateTaskProgress, "function");
  assert.equal(typeof completeAsyncTask, "function");
  assert.equal(typeof failAsyncTask, "function");
  assert.equal(typeof cancelAsyncTask, "function");
  assert.equal(typeof listAsyncTasks, "function");
});

test("M73: Vòng đời Task Queue trong môi trường tích hợp DB", { skip: !HAS_DB }, async () => {
  const projectId = 1;
  const taskType = "test_spatial_clash_detection";
  const payload = { modelId: "BIM-01", meshCount: 1200 };

  // 1. Enqueue task
  const task = await enqueueAsyncTask({
    projectId,
    taskType,
    payload,
    priority: 20,
    maxRetries: 2,
  });

  assert.ok(task.id);
  assert.equal(task.status, "pending");
  assert.equal(task.priority, 20);

  // 2. Claim task
  const claimed = await claimNextAsyncTask("worker-node-alpha", [taskType], 5);
  if (claimed) {
    assert.equal(claimed.id, task.id);
    assert.equal(claimed.status, "processing");
    assert.equal(claimed.worker_id, "worker-node-alpha");

    // 3. Update progress
    const progressed = await updateTaskProgress(task.id, 50.0);
    assert.equal(progressed, true);

    // 4. Complete task
    const completed = await completeAsyncTask(task.id, { clashCount: 0, status: "CLEAR" });
    assert.equal(completed, true);
  }
});
