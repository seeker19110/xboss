// Fixture tổng hợp cho kiểm chứng báo cáo A4-AC08 — DÙNG CHUNG bởi tests/bao-cao-a4-ac08.test.ts
// (cỡ nhỏ, vài chục dòng) và scripts/bench-reports.ts (cỡ đích D09, 10.000 task).
// Mỗi dự án dựng bằng vài câu INSERT … generate_series (không lặp theo số dòng ở phía JS) và
// có tiền tố tên/mã để nhận ra phần mình tạo.
import type { run as RunFn, query as QueryFn } from "@/lib/db";

export type Db = { run: typeof RunFn; query: typeof QueryFn };

export type CoDuAn = {
  /** Số sheet (mỗi sheet gán một hệ trong systems.id 1..6, vòng lại nếu nhiều hơn). */
  sheets: number;
  packagesPerSheet: number;
  tasksPerPackage: number;
  dimsPerTask: number;
  /** Số tầng (floor_contracts + thanh toán) mỗi sheet — đây là số NHÓM của báo cáo theo tầng. */
  floorsPerSheet: number;
  boqItems: number;
  /** Số PO (mỗi PO 2 dòng hàng) gắn vật tư của sheet. */
  poCount: number;
};

export type KetQuaDuAn = { projectId: number; taskCount: number };

/** Tạo một dự án bench/test đầy đủ nguồn; `tag` phải duy nhất trong DB (tiền tố mã BOQ/PO). */
export async function taoDuAnMau(db: Db, tag: string, co: CoDuAn): Promise<KetQuaDuAn> {
  const { run, query } = db;
  const [proj] = await query<{ id: number }>(
    `INSERT INTO projects (name) VALUES (?) RETURNING id`,
    `BENCH ${tag}`,
  );
  const projectId = proj.id;
  const [tower] = await query<{ id: number }>(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp bench') RETURNING id`,
    projectId,
  );
  // Sheet: system_id = ((i-1) % 6) + 1.
  await run(
    `INSERT INTO sheet_types (tower_id, code, name, system_id)
     SELECT ?, 'SH' || i, 'Sheet ' || i, ((i - 1) % 6) + 1 FROM generate_series(1, ?) AS i`,
    tower.id,
    co.sheets,
  );
  await run(
    `INSERT INTO work_packages (sheet_type_id, code, name, start_date, end_date)
     SELECT st.id, 'A' || k, 'Nhóm ' || k,
            CURRENT_DATE - 30, CURRENT_DATE + (k % 40) - 10
       FROM sheet_types st CROSS JOIN generate_series(1, ?) AS k
      WHERE st.tower_id = ?`,
    co.packagesPerSheet,
    tower.id,
  );
  // Task: tiến độ 0..1 theo vòng, một phần trễ (end_date quá khứ, chưa xong).
  await run(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status, start_date, end_date)
     SELECT wp.id, wp.code || ',' || lpad(j::text, 3, '0'), 'Task ' || j,
            ((wp.id + j) % 5) / 4.0,
            CASE WHEN ((wp.id + j) % 5) = 4 THEN 'hoan_thanh' ELSE 'dang_thi_cong' END,
            CURRENT_DATE - 20, CURRENT_DATE + ((wp.id + j) % 30) - 15
       FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       CROSS JOIN generate_series(1, ?) AS j
      WHERE st.tower_id = ?`,
    co.tasksPerPackage,
    tower.id,
  );
  if (co.dimsPerTask > 0) {
    await run(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed)
       SELECT t.id, 'D' || d, CASE WHEN d % 2 = 0 THEN 1 ELSE 0 END
         FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         CROSS JOIN generate_series(1, ?) AS d
        WHERE st.tower_id = ?`,
      co.dimsPerTask,
      tower.id,
    );
  }
  // BOQ: system_id vòng 1..6, mỗi dòng thứ 7 chưa gán hệ.
  await run(
    `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id)
     SELECT ?::text || '-B' || i, 'BOQ ' || i, 'm',
            CASE WHEN i % 7 = 0 THEN NULL ELSE (i % 6) + 1 END,
            (10 + i % 50)::numeric, (1000 + i * 13 % 997)::numeric(15,2), ?::int
       FROM generate_series(1, ?) AS i`,
    tag,
    projectId,
    co.boqItems,
  );
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value)
     SELECT st.id, 'T' || f, (50000 + f * 1000)::numeric
       FROM sheet_types st CROSS JOIN generate_series(1, ?) AS f
      WHERE st.tower_id = ?`,
    co.floorsPerSheet,
    tower.id,
  );
  // Thanh toán: mỗi (sheet, tầng) 2 dòng + 3 dòng advance không sheet (chưa gán).
  await run(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
     SELECT 'bench', 'bill', (2000 + f * 7 + n)::numeric(15,2), CURRENT_DATE, st.id, 'T' || f, ?::int
       FROM sheet_types st
       CROSS JOIN generate_series(1, ?) AS f
       CROSS JOIN generate_series(1, 2) AS n
      WHERE st.tower_id = ?`,
    projectId,
    co.floorsPerSheet,
    tower.id,
  );
  await run(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     SELECT 'bench', 'advance', (500 + n)::numeric(15,2), CURRENT_DATE, ?::int
       FROM generate_series(1, 3) AS n`,
    projectId,
  );
  if (co.poCount > 0) {
    await run(
      `INSERT INTO materials (sheet_type_id, project_id, name, unit)
       SELECT st.id, ?::int, 'VT bench', 'cái' FROM sheet_types st WHERE st.tower_id = ?`,
      projectId,
      tower.id,
    );
    await run(
      `INSERT INTO purchase_orders (po_code, status, project_id)
       SELECT ?::text || '-PO' || i, 'confirmed', ?::int FROM generate_series(1, ?) AS i`,
      tag,
      projectId,
      co.poCount,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price)
       SELECT po.id, (SELECT m.id FROM materials m WHERE m.project_id = po.project_id
                       ORDER BY m.id OFFSET (po.id % ?) LIMIT 1),
              (po.id % 9 + 1)::float8 * k, (100 + k)::numeric
         FROM purchase_orders po CROSS JOIN generate_series(1, 2) AS k
        WHERE po.project_id = ?`,
      co.sheets,
      projectId,
    );
  }
  const [{ n }] = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id WHERE st.tower_id = ?`,
    tower.id,
  );
  return { projectId, taskCount: Number(n) };
}

/** Xoá một dự án do `taoDuAnMau` tạo (con trước cha). */
export async function xoaDuAnMau(db: Db, projectId: number): Promise<void> {
  const { run } = db;
  const sheets = `SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id
                   WHERE tw.project_id = ?`;
  await run(`DELETE FROM payment_bills WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM purchase_orders WHERE project_id = ?`, projectId);
  await run(`DELETE FROM materials WHERE project_id = ?`, projectId);
  await run(`DELETE FROM floor_contracts WHERE sheet_type_id IN (${sheets})`, projectId);
  await run(`DELETE FROM boq_items WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM progress_dimensions WHERE task_id IN (
       SELECT t.id FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
        WHERE wp.sheet_type_id IN (${sheets}))`,
    projectId,
  );
  await run(
    `DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id IN (${sheets}))`,
    projectId,
  );
  await run(`DELETE FROM work_packages WHERE sheet_type_id IN (${sheets})`, projectId);
  await run(`DELETE FROM sheet_types WHERE id IN (${sheets})`, projectId);
  await run(`DELETE FROM towers WHERE project_id = ?`, projectId);
  await run(`DELETE FROM user_projects WHERE project_id = ?`, projectId);
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
}
