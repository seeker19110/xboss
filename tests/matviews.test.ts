import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== M47 PR2 — materialized views (mv_progress_daily, mv_cost_by_month), migrations/0055_matviews.sql =====

test(
  "mv_progress_daily: khớp tay 3 ca — có lịch sử, nền trước sự kiện đầu, không có lịch sử",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query } = await import("@/lib/db");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('M47 MV P1')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp MV')`,
      projectId,
    );
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES ('MVACMV', 'Điều hoà MV')`,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, 'MV-SH', 'Sheet MV', 'm47-mv', ?)`,
      towerId,
      sysId,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'MV-WP', 'Nhóm MV')`,
      sheetId,
    );

    // Task A: có lịch sử, old_progress đầu tiên không NULL (0.1) — trước sự kiện đầu phải
    // dùng old_progress đó, KHÔNG phải progress hiện tại.
    const tA = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent, start_date, end_date)
       VALUES (?, 'MV-A', 'Task A', 'dang_thi_cong', 0.9, '2026-06-01', '2026-06-10')`,
      wpId,
    );
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, 0.1, 0.6, '2026-06-04T08:00:00Z')`,
      tA,
    );
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, 0.6, 0.9, '2026-06-06T08:00:00Z')`,
      tA,
    );

    // Task B: có lịch sử nhưng old_progress đầu tiên NULL — nền trước sự kiện phải là 0
    // (khớp `oldProgress ?? 0` trong app/api/dashboard/scurve/route.ts), KHÔNG phải progress hiện tại.
    const tB = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent, start_date, end_date)
       VALUES (?, 'MV-B', 'Task B', 'dang_thi_cong', 0.5, '2026-06-01', '2026-06-10')`,
      wpId,
    );
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, NULL, 0.5, '2026-06-05T08:00:00Z')`,
      tB,
    );

    // Task C: chưa từng có history — coi như progress hiện tại không đổi suốt mọi ngày.
    const tC = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent, start_date, end_date)
       VALUES (?, 'MV-C', 'Task C', 'dang_thi_cong', 0.3, '2026-06-01', '2026-06-10')`,
      wpId,
    );
    void tC;

    await run(`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_progress_daily`);

    const rows = await query<{ date: string; avgProgress: number }>(
      `SELECT date, avg_progress AS "avgProgress" FROM mv_progress_daily
        WHERE project_id = ? AND system_id = ? AND date BETWEEN '2026-06-02' AND '2026-06-06'
        ORDER BY date`,
      projectId,
      sysId,
    );
    const byDate = new Map(rows.map((r) => [r.date, r.avgProgress]));

    // Tay tính: 06-02 → (0.1 + 0 + 0.3)/3; 06-04 → (0.6+0+0.3)/3; 06-05 → (0.6+0.5+0.3)/3; 06-06 → (0.9+0.5+0.3)/3
    assert.ok(Math.abs((byDate.get("2026-06-02") ?? 0) - 0.1 / 3 - 0.3 / 3) < 1e-9);
    assert.ok(Math.abs((byDate.get("2026-06-04") ?? 0) - (0.6 + 0 + 0.3) / 3) < 1e-9);
    assert.ok(Math.abs((byDate.get("2026-06-05") ?? 0) - (0.6 + 0.5 + 0.3) / 3) < 1e-9);
    assert.ok(Math.abs((byDate.get("2026-06-06") ?? 0) - (0.9 + 0.5 + 0.3) / 3) < 1e-9);

    // Dọn dữ liệu — chạy lại nhiều lần trên cùng DB (dev/local) không đụng slug/mã cố định
    // ('m47-mv', 'MVACMV'...) của lần chạy trước (khác CI luôn dùng Postgres ephemeral).
    await run(`DELETE FROM task_history WHERE task_id IN (?, ?)`, tA, tB);
    await run(`DELETE FROM tasks WHERE package_id = ?`, wpId);
    await run(`DELETE FROM work_packages WHERE id = ?`, wpId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
    await run(`DELETE FROM systems WHERE id = ?`, sysId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "mv_cost_by_month: committed (PO + floor_contracts) và actual (payment_bills) khớp tay",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query } = await import("@/lib/db");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('M47 MV Cost P1')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp MV Cost')`,
      projectId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'MVC-SH', 'Sheet MV Cost', 'm47-mvcost')`,
      towerId,
    );
    const supId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC MV')`);
    const poId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, project_id, status, created_at)
       VALUES (?, ?, 'issued', '2026-06-15T00:00:00Z')`,
      supId,
      projectId,
    );
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit) VALUES (?, 'Ống MV', 'm')`,
      sheetId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 100, 50000)`,
      poId,
      matId,
    );
    await run(
      `INSERT INTO payment_bills (sheet_type_id, paid_date, amount, responsible) VALUES (?, '2026-06-20', 2000000, 'PM')`,
      sheetId,
    );

    await run(`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cost_by_month`);

    const row = await query<{ committed: string; actual: string }>(
      `SELECT committed::text AS committed, actual::text AS actual
         FROM mv_cost_by_month WHERE project_id = ? AND month = '2026-06'`,
      projectId,
    );
    assert.equal(row.length, 1);
    assert.equal(Number(row[0].committed), 100 * 50000);
    assert.equal(Number(row[0].actual), 2000000);

    await run(`DELETE FROM payment_bills WHERE sheet_type_id = ?`, sheetId);
    await run(`DELETE FROM po_items WHERE po_id = ?`, poId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "lib/reports.ts cost_by_month: MV path và fallback trực tiếp cho cùng kết quả",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { runReport } = await import("@/lib/reports");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('M47 Reports Cost P1')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp Reports Cost')`,
      projectId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'RC-SH', 'Sheet RC', 'm47-rc')`,
      towerId,
    );
    const supId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC RC')`);
    const poId = await insertId(
      `INSERT INTO purchase_orders (supplier_id, project_id, status, created_at)
       VALUES (?, ?, 'issued', '2026-07-10T00:00:00Z')`,
      supId,
      projectId,
    );
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit) VALUES (?, 'Ống RC', 'm')`,
      sheetId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 20, 30000)`,
      poId,
      matId,
    );
    await run(
      `INSERT INTO payment_bills (sheet_type_id, paid_date, amount, responsible) VALUES (?, '2026-07-12', 300000, 'PM')`,
      sheetId,
    );

    // MV chưa refresh cho dự án này → fallback trực tiếp.
    const fallback = await runReport("cost_by_month", {}, projectId);
    assert.deepEqual(fallback.rows, [{ month: "2026-07", committed: 600000, actual: 300000 }]);

    // Refresh MV rồi gọi lại → phải ra cùng kết quả (MV path).
    await run(`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cost_by_month`);
    const cached = await runReport("cost_by_month", {}, projectId);
    assert.deepEqual(cached.rows, fallback.rows);

    await run(`DELETE FROM payment_bills WHERE sheet_type_id = ?`, sheetId);
    await run(`DELETE FROM po_items WHERE po_id = ?`, poId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
