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
