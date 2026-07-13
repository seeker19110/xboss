import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp chứng minh /api/notifications không rò rỉ cảnh báo chéo dự án (đa dự án, M22+).
// Không gọi HTTP route (auth/cookie phức tạp) — test trực tiếp các hàm lib đã nhận projectId
// và câu SQL thô tương đương khối "delayed" trong route (cùng cách tests/diary.test.ts test
// hàm nội bộ thay vì gọi API).

test(
  "poLateList(projectId): chỉ trả PO trễ của đúng dự án được lọc, không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, daysFromTodayISO } = await import("@/lib/db");
    const { poLateList } = await import("@/lib/procurement");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA notif PO 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA notif PO 2')`);
    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NCC notif test')`);

    const poP1 = await insertId(
      `INSERT INTO purchase_orders (project_id, supplier_id, status, expected_date) VALUES (?, ?, 'confirmed', ?)`,
      p1,
      supplierId,
      daysFromTodayISO(-2),
    );
    const poP2 = await insertId(
      `INSERT INTO purchase_orders (project_id, supplier_id, status, expected_date) VALUES (?, ?, 'confirmed', ?)`,
      p2,
      supplierId,
      daysFromTodayISO(-2),
    );

    // Không lọc (projectId = undefined) → thấy cả 2 dự án — hành vi tương thích ngược.
    const all = await poLateList();
    const allIds = all.map((p) => p.id);
    assert.ok(allIds.includes(poP1) && allIds.includes(poP2));

    // Lọc theo dự án 1 → chỉ thấy PO của dự án 1, không lẫn PO của dự án 2.
    const onlyP1 = await poLateList(p1);
    const idsP1 = onlyP1.map((p) => p.id);
    assert.ok(idsP1.includes(poP1), "PO trễ của đúng dự án phải xuất hiện");
    assert.ok(!idsP1.includes(poP2), "PO trễ của dự án khác không được lộ");

    await run(`DELETE FROM purchase_orders WHERE id IN (?, ?)`, poP1, poP2);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "vehicleLateList(projectId): chỉ trả xe trễ của đúng dự án được lọc, không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { vehicleLateList } = await import("@/lib/procurement");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA notif xe 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA notif xe 2')`);

    const vP1 = await insertId(
      `INSERT INTO vehicle_logs (project_id, plate, expected_at, status)
       VALUES (?, 'NOTIF-P1', NOW() - INTERVAL '3 hours', 'registered')`,
      p1,
    );
    const vP2 = await insertId(
      `INSERT INTO vehicle_logs (project_id, plate, expected_at, status)
       VALUES (?, 'NOTIF-P2', NOW() - INTERVAL '3 hours', 'registered')`,
      p2,
    );

    const onlyP1 = await vehicleLateList(p1);
    const idsP1 = onlyP1.map((v) => v.id);
    assert.ok(idsP1.includes(vP1), "Xe trễ của đúng dự án phải xuất hiện");
    assert.ok(!idsP1.includes(vP2), "Xe trễ của dự án khác không được lộ");

    await run(`DELETE FROM vehicle_logs WHERE id IN (?, ?)`, vP1, vP2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "SQL thô khối 'delayed' (JOIN towers): task trễ chỉ hiện đúng theo project_id của tower, " +
    "chứng minh cách lọc dùng trong app/api/notifications/route.ts",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, todayISO, daysFromTodayISO, query } = await import("@/lib/db");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA notif delayed 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA notif delayed 2')`);
    const tw1 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp N1')`, p1);
    const tw2 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp N2')`, p2);
    const st1 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'NOTIFDL1', 'Sheet N1')`,
      tw1,
    );
    const st2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'NOTIFDL2', 'Sheet N2')`,
      tw2,
    );
    const pkg1 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'N1', 'Nhóm N1')`,
      st1,
    );
    const pkg2 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'N2', 'Nhóm N2')`,
      st2,
    );
    // Cả 2 task đều trễ (end_date quá khứ, chưa xong) nhưng thuộc 2 dự án khác nhau.
    const t1 = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, 'N1,01', 'Task trễ dự án 1', ?, 0, 'tre')`,
      pkg1,
      daysFromTodayISO(-3),
    );
    const t2 = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, 'N2,01', 'Task trễ dự án 2', ?, 0, 'tre')`,
      pkg2,
      daysFromTodayISO(-3),
    );

    // Câu SQL tương đương khối "delayed" trong app/api/notifications/route.ts sau khi thêm
    // JOIN towers + điều kiện tw.project_id = ?.
    const today = todayISO();
    const delayedInP1 = await query<{ id: number }>(
      `SELECT t.id
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
          AND t.status NOT IN ('hoan_thanh','nghiem_thu') AND tw.project_id = ?`,
      today,
      p1,
    );
    const idsP1 = delayedInP1.map((r) => r.id);
    assert.ok(idsP1.includes(t1), "Task trễ của đúng dự án phải xuất hiện");
    assert.ok(!idsP1.includes(t2), "Task trễ của dự án khác không được lộ chéo dự án");

    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, t1, t2);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, pkg1, pkg2);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, st1, st2);
    await run(`DELETE FROM towers WHERE id IN (?, ?)`, tw1, tw2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "câu SELECT cuối cùng của GET /api/notifications trả kèm sheetSlug/floorLabel " +
    "(M40 — cần cho click-through chuông thông báo dựng đúng URL /tracking/<slug>?floor=)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, query } = await import("@/lib/db");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('U notif M40', 'u-notif-m40@test.local', 'x', 'admin')`,
    );
    const tw = await insertId(`INSERT INTO towers (name) VALUES ('Tháp M40')`);
    const st = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'NOTIFM40', 'Sheet M40', 'notif-m40')`,
      tw,
    );
    const pkg = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'M40', 'Nhóm M40', 'Tầng 5')`,
      st,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status)
       VALUES (?, 'M40,01', 'Task M40', 0, 'dang_thi_cong')`,
      pkg,
    );
    const notifId = await insertId(
      `INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, 'delayed', 'test M40')`,
      userId,
      taskId,
    );

    // Câu SELECT tương đương phần cuối route.ts sau khi thêm LEFT JOIN sheet_types/work_packages.
    const rows = await query<{
      id: number;
      taskId: number | null;
      sheetSlug: string | null;
      floorLabel: string | null;
    }>(
      `SELECT n.id, n.task_id AS "taskId", st.slug AS "sheetSlug", wp.floor_label AS "floorLabel"
         FROM notifications n
         LEFT JOIN tasks t ON t.id = n.task_id
         LEFT JOIN work_packages wp ON wp.id = t.package_id
         LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
        WHERE n.id = ?`,
      notifId,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sheetSlug, "notif-m40");
    assert.equal(rows[0].floorLabel, "Tầng 5");

    await run(`DELETE FROM notifications WHERE id = ?`, notifId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkg);
    await run(`DELETE FROM sheet_types WHERE id = ?`, st);
    await run(`DELETE FROM towers WHERE id = ?`, tw);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);
