import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====
//
// Chống rò rỉ chéo dự án ở 2 route thanh toán (giống lớp lỗi M22 payment-certs/costs):
// GET /api/payments/bills và GET /api/payments/floors trước đây KHÔNG lọc project_id,
// chỉ lọc theo tên người phụ trách → trả dữ liệu mọi dự án. Người dùng xác nhận đây là
// bug. Test chạy TRỰC TIẾP đúng câu SQL trong 2 route (route dùng getCurrentUser đọc
// cookie nên không gọi HTTP handler trực tiếp trong node:test được).
//
// Hậu tố RUN gắn vào mọi mã cứng để chạy lặp nhiều lần trên cùng DB không đụng UNIQUE.
const RUN = Date.now().toString(36);

test(
  "GET /api/payments/bills: lọc project_id → không rò rỉ bill dự án khác (M22+)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query, run, insertId } = await import("@/lib/db");

    // 2 dự án, mỗi dự án 1 tháp + 1 sheet cùng responsible + bill riêng.
    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Pay scope A ${RUN}')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Pay scope B ${RUN}')`);
    const towerA = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
      projA,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp B')`,
      projB,
    );
    const stA = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, responsible)
       VALUES (?, 'PAYA-${RUN}', 'Sheet A', 'paya-${RUN}', 'Nguyễn Văn A')`,
      towerA,
    );
    const stB = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, responsible)
       VALUES (?, 'PAYB-${RUN}', 'Sheet B', 'payb-${RUN}', 'Nguyễn Văn A')`,
      towerB,
    );
    await run(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label)
       VALUES (?, 'PAYAWP-${RUN}', 'Nhóm A', 'T1')`,
      stA,
    );
    await run(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label)
       VALUES (?, 'PAYBWP-${RUN}', 'Nhóm B', 'T1')`,
      stB,
    );
    const billA = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
       VALUES ('Nguyễn Văn A', 'bill', 1000, CURRENT_DATE, ?, 'T1', ?)`,
      stA,
      projA,
    );
    const billB = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
       VALUES ('Nguyễn Văn A', 'bill', 2000, CURRENT_DATE, ?, 'T1', ?)`,
      stB,
      projB,
    );

    try {
      // SQL y hệt route GET /api/payments/bills (phần lọc project_id của Việc 1).
      const billsSql = `
        SELECT pb.id, pb.amount, pb.project_id AS "projectId"
          FROM payment_bills pb
          LEFT JOIN users u ON u.id = pb.created_by
          LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
          LEFT JOIN LATERAL (
            SELECT name FROM work_packages
            WHERE sheet_type_id = pb.sheet_type_id AND floor_label = pb.floor_label
            LIMIT 1
          ) wp ON pb.sheet_type_id IS NOT NULL AND pb.floor_label IS NOT NULL`;

      // Lọc theo dự án A → chỉ thấy bill A, không thấy bill B.
      const filtered = await query<{ id: number }>(
        `${billsSql} WHERE pb.project_id = ? OR pb.project_id IS NULL ORDER BY pb.paid_date ASC, pb.id ASC`,
        projA,
      );
      const filteredIds = filtered.map((r) => r.id);
      assert.ok(filteredIds.includes(billA), "phải thấy bill dự án A");
      assert.ok(!filteredIds.includes(billB), "KHÔNG được thấy bill dự án B");

      // Không lọc (projectId=null, hành vi cũ) → thấy cả 2.
      const all = await query<{ id: number }>(`${billsSql} ORDER BY pb.paid_date ASC, pb.id ASC`);
      const allIds = all.map((r) => r.id);
      assert.ok(allIds.includes(billA) && allIds.includes(billB), "không lọc phải thấy cả 2 bill");
    } finally {
      await run(`DELETE FROM payment_bills WHERE id IN (?, ?)`, billA, billB);
      await run(`DELETE FROM work_packages WHERE sheet_type_id IN (?, ?)`, stA, stB);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, stA, stB);
      await run(`DELETE FROM towers WHERE id IN (?, ?)`, towerA, towerB);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
    }
  },
);

test(
  "GET /api/payments/floors: lọc project_id qua tower/bill → không rò rỉ tầng dự án khác (M22+)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query, run, insertId } = await import("@/lib/db");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Pay floor A ${RUN}')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Pay floor B ${RUN}')`);
    const towerA = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
      projA,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp B')`,
      projB,
    );
    const stA = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, responsible)
       VALUES (?, 'PFA-${RUN}', 'Sheet A', 'pfa-${RUN}', 'Nguyễn Văn A')`,
      towerA,
    );
    const stB = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, responsible)
       VALUES (?, 'PFB-${RUN}', 'Sheet B', 'pfb-${RUN}', 'Nguyễn Văn A')`,
      towerB,
    );
    await run(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label)
       VALUES (?, 'PFAWP-${RUN}', 'Nhóm A', 'T1')`,
      stA,
    );
    await run(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label)
       VALUES (?, 'PFBWP-${RUN}', 'Nhóm B', 'T1')`,
      stB,
    );
    const billA = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
       VALUES ('Nguyễn Văn A', 'bill', 1000, CURRENT_DATE, ?, 'T1', ?)`,
      stA,
      projA,
    );
    const billB = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
       VALUES ('Nguyễn Văn A', 'bill', 2000, CURRENT_DATE, ?, 'T1', ?)`,
      stB,
      projB,
    );

    try {
      // floorRows: SQL y hệt route (Việc 2) với lọc qua towers.
      const floorRows = await query<{ sheetTypeId: number }>(
        `
        SELECT st.id AS "sheetTypeId", st.code AS "sheetType",
               wp.floor_label AS "floorLabel",
               COALESCE(fc.contract_value, 0) AS "contractValue"
          FROM work_packages wp
          JOIN sheet_types st ON wp.sheet_type_id = st.id
          JOIN towers tw ON tw.id = st.tower_id
          LEFT JOIN floor_contracts fc
                 ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
         WHERE st.responsible = ?
           AND wp.floor_label IS NOT NULL AND wp.floor_label <> '' AND tw.project_id = ?
         GROUP BY st.id, st.code, wp.floor_label, fc.contract_value
         ORDER BY st.id, wp.floor_label`,
        "Nguyễn Văn A",
        projA,
      );
      const floorSheetIds = floorRows.map((r) => r.sheetTypeId);
      assert.ok(floorSheetIds.includes(stA), "phải thấy tầng sheet dự án A");
      assert.ok(!floorSheetIds.includes(stB), "KHÔNG được thấy tầng sheet dự án B");

      // histRows: SQL y hệt route (Việc 2) với lọc project_id trực tiếp trên payment_bills.
      const histRows = await query<{ sheetTypeId: number }>(
        `
        SELECT sheet_type_id AS "sheetTypeId", floor_label AS "floorLabel",
               period, pct_this_period AS "pctThisPeriod",
               amount, paid_date AS "paidDate"
          FROM payment_bills
         WHERE responsible = ? AND type = 'bill'
           AND sheet_type_id IS NOT NULL AND floor_label IS NOT NULL
           AND (project_id = ? OR project_id IS NULL)
         ORDER BY paid_date ASC, id ASC`,
        "Nguyễn Văn A",
        projA,
      );
      const histSheetIds = histRows.map((r) => r.sheetTypeId);
      assert.ok(histSheetIds.includes(stA), "lịch sử phải thấy bill dự án A");
      assert.ok(!histSheetIds.includes(stB), "lịch sử KHÔNG được thấy bill dự án B");
    } finally {
      await run(`DELETE FROM payment_bills WHERE id IN (?, ?)`, billA, billB);
      await run(`DELETE FROM work_packages WHERE sheet_type_id IN (?, ?)`, stA, stB);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, stA, stB);
      await run(`DELETE FROM towers WHERE id IN (?, ?)`, towerA, towerB);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
    }
  },
);
