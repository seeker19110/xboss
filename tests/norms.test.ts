import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateNormInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateNormInput } = await import("@/lib/norms");

  const material = {
    resourceType: "material" as const,
    materialId: 1,
    resourceName: null,
    qtyPerUnit: 0.8,
    unitLabel: "kg",
    note: null,
  };
  assert.equal(validateNormInput(material), null);
  assert.match(validateNormInput({ ...material, qtyPerUnit: 0 })!, /định mức\/đơn vị/i);
  assert.match(validateNormInput({ ...material, unitLabel: "" })!, /đơn vị định mức/i);
  assert.match(validateNormInput({ ...material, materialId: null })!, /vật tư \(materialId\)/i);
  assert.match(
    validateNormInput({ ...material, resourceType: "xxx" as never })!,
    /loại nguồn lực/i,
  );

  const labor = {
    resourceType: "labor" as const,
    materialId: null,
    resourceName: "Thợ hàn",
    qtyPerUnit: 0.5,
    unitLabel: "công",
    note: null,
  };
  assert.equal(validateNormInput(labor), null);
  assert.match(validateNormInput({ ...labor, resourceName: null })!, /resourceName/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "normUsage: expected/actual/variancePct tính đúng, expected=0 trả variancePct null",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { normUsage } = await import("@/lib/norms");

    const sheetId = await insertId(
      `INSERT INTO sheet_types (code, name, slug) VALUES ('NM-TEST', 'Sheet Test Norms', 'nm-test')`,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label) VALUES ('WP-NM', 'Nhóm test norms', ?, '5F')`,
      sheetId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (code, name, package_id, progress_percent) VALUES ('T-NM', 'Task test norms', ?, 0.5)`,
      wpId,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract) VALUES ('BOQ-NM', 'Dòng BOQ test', 'm', 100)`,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
      boqId,
      taskId,
    );
    // executedQty = qty_contract(100) * weight(1) * progress(0.5) = 50

    const materialId = await insertId(
      `INSERT INTO materials (name, unit, qty_planned) VALUES ('Vật tư test norms', 'kg', 1000)`,
    );
    const normId = await insertId(
      `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, qty_per_unit, unit_label)
       VALUES (?, 'material', ?, 0.8, 'kg')`,
      boqId,
      materialId,
    );
    // expected = 0.8 * 50 = 40

    // Tiêu hao thực tế 50kg (xuất công trường, floor_label khớp tầng của task).
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, floor_label)
       VALUES (?, -50, 50, 'xuat_cong_truong', '5F')`,
      materialId,
    );
    // Giao dịch ở tầng khác — không được tính vào vì có floor filter.
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, floor_label)
       VALUES (?, -1000, 1000, 'xuat_cong_truong', '99F')`,
      materialId,
    );

    const usage = await normUsage(boqId);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].expected, 40);
    assert.equal(usage[0].actual, 50);
    assert.ok(usage[0].variancePct != null);
    assert.equal(Math.round(usage[0].variancePct!), 25); // (50-40)/40 = 25%

    // qty_contract = 0 → expected = 0 → variancePct null, không lỗi chia 0.
    await run(`UPDATE boq_items SET qty_contract = 0 WHERE id = ?`, boqId);
    const usageZero = await normUsage(boqId);
    assert.equal(usageZero[0].expected, 0);
    assert.equal(usageZero[0].variancePct, null);

    await run(`DELETE FROM boq_norms WHERE id = ?`, normId);
    await run(`DELETE FROM material_transactions WHERE material_id = ?`, materialId);
    await run(`DELETE FROM materials WHERE id = ?`, materialId);
    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, boqId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, wpId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
  },
);

test("overNormItems: xuất hiện/biến mất đúng ngưỡng", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId } = await import("@/lib/db");
  const { overNormItems } = await import("@/lib/norms");

  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract) VALUES ('BOQ-OVER', 'Dòng BOQ over', 'm', 10)`,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (code, name) VALUES ('WP-OVER', 'Nhóm test over')`,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (code, name, package_id, progress_percent) VALUES ('T-OVER', 'Task over', ?, 1)`,
    wpId,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqId,
    taskId,
  );
  // executedQty = 10 * 1 * 1 = 10

  const materialId = await insertId(
    `INSERT INTO materials (name, unit) VALUES ('Vật tư over test', 'kg')`,
  );
  const normId = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, qty_per_unit, unit_label)
       VALUES (?, 'material', ?, 1, 'kg')`,
    boqId,
    materialId,
  );
  // expected = 1 * 10 = 10

  await insertId(
    `INSERT INTO material_transactions (material_id, delta, qty_after, type)
       VALUES (?, -13, 13, 'xuat_cong_truong')`,
    materialId,
  );
  // actual = 13, variance = 30% > ngưỡng mặc định 20%

  const over = await overNormItems();
  assert.ok(over.some((o) => o.normId === normId));

  const overStrict = await overNormItems(50);
  assert.ok(!overStrict.some((o) => o.normId === normId));

  await run(`DELETE FROM boq_norms WHERE id = ?`, normId);
  await run(`DELETE FROM material_transactions WHERE material_id = ?`, materialId);
  await run(`DELETE FROM materials WHERE id = ?`, materialId);
  await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, boqId);
  await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  await run(`DELETE FROM work_packages WHERE id = ?`, wpId);
  await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
});

// M22 — overNormItems lọc theo dự án đang chọn (suy qua boq_items.project_id): 2 dự án,
// mỗi dự án có 1 định mức vượt ngưỡng → truyền projectId chỉ trả đúng dự án đó, không lẫn.
test(
  "overNormItems(projectId): chỉ trả định mức vượt của dự án đó, không rò rỉ chéo (M22+)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { overNormItems } = await import("@/lib/norms");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Over 1', 'PJT-OV1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Over 2', 'PJT-OV2')`);

    // Dựng 1 hạng mục vượt ngưỡng cho mỗi dự án (executedQty=10, expected=10, actual=13 → 30%).
    async function seedOver(projectId: number, suffix: string) {
      const boqId = await insertId(
        `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES (?, 'Dòng BOQ over', 'm', 10, ?)`,
        `BOQ-OV-${suffix}`,
        projectId,
      );
      const wpId = await insertId(
        `INSERT INTO work_packages (code, name) VALUES (?, 'Nhóm over')`,
        `WP-OV-${suffix}`,
      );
      const taskId = await insertId(
        `INSERT INTO tasks (code, name, package_id, progress_percent) VALUES (?, 'Task over', ?, 1)`,
        `T-OV-${suffix}`,
        wpId,
      );
      await run(
        `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
        boqId,
        taskId,
      );
      const materialId = await insertId(
        `INSERT INTO materials (name, unit) VALUES (?, 'kg')`,
        `Vật tư over ${suffix}`,
      );
      const normId = await insertId(
        `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, qty_per_unit, unit_label)
         VALUES (?, 'material', ?, 1, 'kg')`,
        boqId,
        materialId,
      );
      await insertId(
        `INSERT INTO material_transactions (material_id, delta, qty_after, type)
         VALUES (?, -13, 13, 'xuat_cong_truong')`,
        materialId,
      );
      return { boqId, wpId, taskId, materialId, normId };
    }

    const a = await seedOver(p1, "A");
    const b = await seedOver(p2, "B");

    try {
      // Không lọc → cả 2 xuất hiện (tương thích ngược).
      const all = await overNormItems();
      assert.ok(all.some((o) => o.normId === a.normId));
      assert.ok(all.some((o) => o.normId === b.normId));

      // Lọc dự án 1 → chỉ định mức của dự án 1, không lẫn dự án 2.
      const only1 = await overNormItems(undefined, p1);
      assert.ok(only1.some((o) => o.normId === a.normId));
      assert.ok(!only1.some((o) => o.normId === b.normId));

      // Lọc dự án 2 → ngược lại.
      const only2 = await overNormItems(undefined, p2);
      assert.ok(only2.some((o) => o.normId === b.normId));
      assert.ok(!only2.some((o) => o.normId === a.normId));
    } finally {
      for (const x of [a, b]) {
        await run(`DELETE FROM boq_norms WHERE id = ?`, x.normId);
        await run(`DELETE FROM material_transactions WHERE material_id = ?`, x.materialId);
        await run(`DELETE FROM materials WHERE id = ?`, x.materialId);
        await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, x.boqId);
        await run(`DELETE FROM tasks WHERE id = ?`, x.taskId);
        await run(`DELETE FROM work_packages WHERE id = ?`, x.wpId);
        await run(`DELETE FROM boq_items WHERE id = ?`, x.boqId);
      }
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
    }
  },
);

// M22 — scoping định mức BOQ theo dự án đang chọn. boq_norms không có cột project_id
// riêng, suy qua boq_items.project_id (mirror điều kiện WHERE trong các route
// app/api/boq/:id/norms, app/api/boq/:id/norm-usage, app/api/boq-norms/:id).
test(
  "getNorm + check boq_items thuộc project: dự án khác không thấy được (404)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { getNorm } = await import("@/lib/norms");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Norm 1', 'PJT-NM1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Norm 2', 'PJT-NM2')`);

    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES ('BOQ-SCOPE', 'Dòng BOQ scope', 'm', 10, ?)`,
      p1,
    );
    const normId = await insertId(
      `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label)
       VALUES (?, 'labor', 'Thợ scope', 0.5, 'công')`,
      boqId,
    );

    // Dự án đúng (p1) → tìm thấy.
    const found = await getNorm(normId, p1);
    assert.ok(found);
    assert.equal(found!.id, normId);

    // Dự án khác (p2) → không thấy (404 ở route).
    const notFound = await getNorm(normId, p2);
    assert.equal(notFound, null);

    // Mirror check boq_items thuộc project dùng ở app/api/boq/:id/norms & norm-usage.
    const boqItemP1 = await queryOne<{ id: number }>(
      `SELECT id FROM boq_items WHERE id = ? AND project_id = ?`,
      boqId,
      p1,
    );
    assert.ok(boqItemP1);
    const boqItemP2 = await queryOne<{ id: number }>(
      `SELECT id FROM boq_items WHERE id = ? AND project_id = ?`,
      boqId,
      p2,
    );
    assert.equal(boqItemP2, undefined);

    await run(`DELETE FROM boq_norms WHERE id = ?`, normId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
