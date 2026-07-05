import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBoq } from "@/lib/boq";

test("makeBoq: sheet có mapping tĩnh → prefix là slug viết hoa", () => {
  assert.equal(makeBoq("OGTĐ", "A1"), "OGTD-A1");
  assert.equal(makeBoq("ODNN Zone 1", "A1"), "ODNN1-A1");
});

test("makeBoq: mã hàng có dấu phẩy → đổi thành gạch nối", () => {
  assert.equal(makeBoq("OGCH", "OGCH4,06"), "OGCH-OGCH4-06");
  assert.equal(makeBoq("ODNN Zone 1", "A1,r7"), "ODNN1-A1-r7");
});

test("makeBoq: sheet không có mapping tĩnh → giữ nguyên mã sheet viết hoa", () => {
  assert.equal(makeBoq("dientu", "B2"), "DIENTU-B2");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "boqTakenBy: mã trùng ở tasks/work_packages/materials đều bị phát hiện xuyên bảng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqTakenBy } = await import("@/lib/boq");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test boq')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTBOQ', 'Sheet test boq')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, boq_code) VALUES (?, 'B1', 'Nhóm test', 'BOQ-PKG-01')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'B1,01', 'Task test', 'BOQ-TASK-01')`,
      pkgId,
    );
    const materialId = await insertId(
      `INSERT INTO materials (name, boq_code) VALUES ('Vật tư test', 'BOQ-MAT-01')`,
    );

    // Chưa ai dùng → null.
    assert.equal(await boqTakenBy("BOQ-CHUA-DUNG"), null);

    // Trùng với task ở bảng khác (work_packages) → phát hiện.
    const takenByTask = await boqTakenBy("BOQ-TASK-01");
    assert.match(takenByTask ?? "", /task .*Task test/);

    const takenByPkg = await boqTakenBy("BOQ-PKG-01");
    assert.match(takenByPkg ?? "", /nhóm .*Nhóm test/);

    const takenByMaterial = await boqTakenBy("BOQ-MAT-01");
    assert.match(takenByMaterial ?? "", /vật tư .*Vật tư test/);

    // Loại trừ chính bản ghi đang sửa → không báo trùng với chính nó.
    assert.equal(await boqTakenBy("BOQ-TASK-01", { table: "tasks", id: taskId }), null);
    assert.equal(await boqTakenBy("BOQ-PKG-01", { table: "work_packages", id: pkgId }), null);
    assert.equal(await boqTakenBy("BOQ-MAT-01", { table: "materials", id: materialId }), null);

    // exclude không khớp record đang trùng → vẫn báo trùng như thường.
    assert.match(
      (await boqTakenBy("BOQ-TASK-01", { table: "tasks", id: taskId + 999 })) ?? "",
      /task/,
    );

    // Dọn dữ liệu test.
    await run(`DELETE FROM materials WHERE id = ?`, materialId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "boqTakenBy: mã trùng với dòng boq_items cũng bị phát hiện + loại trừ chính nó khi sửa",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqTakenBy } = await import("@/lib/boq");

    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit) VALUES ('BOQ-ITEM-01', 'Ống gió D200', 'm')`,
    );

    const takenBy = await boqTakenBy("BOQ-ITEM-01");
    assert.match(takenBy ?? "", /dòng BOQ .*Ống gió D200/);
    assert.equal(await boqTakenBy("BOQ-ITEM-01", { table: "boq_items", id: boqId }), null);

    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
  },
);

test(
  "boqExecutedQty: qty_contract × Σ(weight × progress) qua task đã map, weight không cần = 1",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqExecutedQty } = await import("@/lib/boq");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test boq exec')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTBOQEXEC', 'Sheet test')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'E1', 'Nhóm test')`,
      stId,
    );
    const taskA = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'E1,01', 'Task A', 1)`,
      pkgId,
    );
    const taskB = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'E1,02', 'Task B', 0.5)`,
      pkgId,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract) VALUES ('BOQ-EXEC-01', 'Ống gió D200', 'm', 100)`,
    );

    // Chưa map task nào → KL thực hiện = 0.
    assert.equal(await boqExecutedQty(boqId), 0);

    // Map 60% khối lượng vào task A (100% xong) + 40% vào task B (50% xong).
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 0.6), (?, ?, 0.4)`,
      boqId,
      taskA,
      boqId,
      taskB,
    );
    // 100 × (0.6×1 + 0.4×0.5) = 100 × 0.8 = 80
    assert.equal(await boqExecutedQty(boqId), 80);

    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, boqId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, taskA, taskB);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
