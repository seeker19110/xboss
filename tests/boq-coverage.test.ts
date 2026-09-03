import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { NGUONG_LECH_WEIGHT } from "@/lib/khoi-luong/boq-coverage";

test("NGUONG_LECH_WEIGHT: ngưỡng lệch nhỏ, không bắt lỗi sai số làm tròn 4 chữ số", () => {
  // weight là NUMERIC(5,4) → sai số làm tròn tối đa ~1e-4 mỗi dòng; ngưỡng 0.01 rộng hơn
  // hai bậc nên chia đều 3 phần (0.3333×3 = 0.9999) KHÔNG bị coi là lệch.
  assert.ok(NGUONG_LECH_WEIGHT > 3e-4);
  assert.ok(NGUONG_LECH_WEIGHT < 0.05);
});

test(
  "doPhuBoq: đếm task đã map theo hệ + liệt kê dòng BOQ có Σweight ≠ 1 (M122 AC6)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { doPhuBoq, doPhuGon } = await import("@/lib/khoi-luong/boq-coverage");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test do phu BOQ')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp P')`,
      projectId,
    );
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES ('TESTCOV', 'Hệ đo độ phủ')`,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, 'TESTCOV', 'Sheet phủ', ?)`,
      towerId,
      sysId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'P1', 'Nhóm phủ')`,
      stId,
    );
    const taskIds: number[] = [];
    for (let i = 1; i <= 4; i++)
      taskIds.push(
        await insertId(
          `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, ?)`,
          pkgId,
          `P1,0${i}`,
          `Task phủ ${i}`,
        ),
      );

    // 3 dòng BOQ, đều có Σweight ≠ 1 để AC6 phải liệt kê đủ cả 3.
    const boqIds: number[] = [];
    for (const [i, w] of [0.5, 1.5, 0.25].entries()) {
      const id = await insertId(
        `INSERT INTO boq_items (project_id, code, name, unit) VALUES (?, ?, ?, 'm')`,
        projectId,
        `TESTCOV-${i}`,
        `Dòng BOQ ${i}`,
      );
      boqIds.push(id);
      await run(
        `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, ?)`,
        id,
        taskIds[0],
        w,
      );
    }
    // Task thứ 2 map vào CẢ 3 dòng BOQ: vẫn chỉ được đếm là MỘT task đã map, nếu dùng JOIN
    // thay vì EXISTS thì độ phủ sẽ vọt lên trên 100%.
    for (const id of boqIds)
      await run(
        `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
        id,
        taskIds[1],
      );

    const kq = await doPhuBoq({ projectId });
    assert.equal(kq.tong, 4);
    assert.equal(kq.daMap, 2);
    assert.equal(kq.tyLe, 0.5);
    assert.deepEqual(
      kq.theoHe.map((h) => [h.he, h.tong, h.daMap]),
      [["TESTCOV", 4, 2]],
    );

    const lech = [...kq.weightLech].sort((a, b) => a.code.localeCompare(b.code));
    assert.equal(lech.length, 3);
    assert.deepEqual(
      lech.map((d) => [d.code, Math.round(d.tongWeight * 100) / 100, d.soTask]),
      [
        ["TESTCOV-0", 1.5, 2],
        ["TESTCOV-1", 2.5, 2],
        ["TESTCOV-2", 1.25, 2],
      ],
    );

    // Lọc theo hệ khác → không còn task nào trong phạm vi.
    assert.equal((await doPhuBoq({ projectId, systemCode: "KHONG-CO" })).tong, 0);
    // doPhuGon phải khớp đúng 3 con số của bản đầy đủ.
    assert.deepEqual(await doPhuGon({ projectId }), { tong: 4, daMap: 2, tyLe: 0.5 });
    // Không chọn dự án → trả rỗng, không đếm chéo dự án khác.
    assert.equal((await doPhuBoq({ projectId: null })).tong, 0);

    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ANY(?)`, boqIds);
    await run(`DELETE FROM boq_items WHERE id = ANY(?)`, boqIds);
    await run(`DELETE FROM tasks WHERE package_id = ?`, pkgId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM systems WHERE id = ?`, sysId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
