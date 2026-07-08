import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("resolveProjectId: cookie hợp lệ → dùng; cookie lạ/rỗng → mặc định dự án đầu; rỗng → null", async () => {
  const { resolveProjectId } = await import("@/lib/projects");

  assert.equal(resolveProjectId([1, 2, 3], "2"), 2);
  assert.equal(
    resolveProjectId([1, 2, 3], "99"),
    1,
    "id không nằm trong dự án thấy được → mặc định",
  );
  assert.equal(resolveProjectId([1, 2, 3], "abc"), 1, "cookie không phải số → mặc định");
  assert.equal(resolveProjectId([1, 2, 3], undefined), 1, "không có cookie → dự án đầu");
  assert.equal(resolveProjectId([], "1"), null, "không có dự án nào → null");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "visibleProjectIds: admin thấy mọi dự án; user theo user_projects; bảng rỗng = mọi user thấy hết",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { visibleProjectIds } = await import("@/lib/projects");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA test 1', 'PJT-T1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA test 2', 'PJT-T2')`);
    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin ProjTest', 'proj-admin@xboss.vn', 'x', 'admin')`,
    );
    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM ProjTest', 'proj-pm@xboss.vn', 'x', 'pm')`,
    );

    // Bảng user_projects rỗng toàn hệ thống → mọi user (kể cả không phải admin) thấy hết.
    const pmSeesAllInitially = await visibleProjectIds({ id: pmId, role: "pm" });
    assert.ok(pmSeesAllInitially.includes(p1) && pmSeesAllInitially.includes(p2));

    // Admin luôn thấy mọi dự án, bất kể user_projects.
    const adminIds = await visibleProjectIds({ id: adminId, role: "admin" });
    assert.ok(adminIds.includes(p1) && adminIds.includes(p2));

    // Có bản ghi user_projects (cho user khác) → PM này giờ chỉ thấy đúng dự án được gán.
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmId, p1);
    const pmIds = await visibleProjectIds({ id: pmId, role: "pm" });
    assert.deepEqual(pmIds, [p1]);

    await run(`DELETE FROM user_projects WHERE user_id = ?`, pmId);
    await run(`DELETE FROM users WHERE id IN (?, ?)`, adminId, pmId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "listProjects/portfolioKpi: tiến độ + việc trễ tính đúng theo từng dự án qua towers.project_id, scoping đúng theo user_projects",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/date");
    const { listProjects, portfolioKpi } = await import("@/lib/projects");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Kpi 1', 'PJT-K1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Kpi 2', 'PJT-K2')`);
    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM KpiTest', 'proj-kpi-pm@xboss.vn', 'x', 'pm')`,
    );

    // Dự án 1: 1 task xong (100%) + 1 task trễ (0%, hạn hôm qua) → avgProgress 0.5, delayed 1.
    const t1 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp Kpi1')`, p1);
    const s1 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'KPI1', 'Sheet Kpi1')`,
      t1,
    );
    const wp1 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'K1', 'Nhóm Kpi1')`,
      s1,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'K1,01', 'Task xong', 1, 'hoan_thanh')`,
      wp1,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status, end_date) VALUES (?, 'K1,02', 'Task trễ', 0, 'tre', ?)`,
      wp1,
      daysFromTodayISO(-1),
    );

    // Dự án 2: 1 task xong (100%), không trễ.
    const t2 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp Kpi2')`, p2);
    const s2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'KPI2', 'Sheet Kpi2')`,
      t2,
    );
    const wp2 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'K2', 'Nhóm Kpi2')`,
      s2,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'K2,01', 'Task xong 2', 1, 'hoan_thanh')`,
      wp2,
    );

    const listAll = await listProjects({ id: pmId, role: "pm" });
    const row1 = listAll.find((p) => p.id === p1)!;
    const row2 = listAll.find((p) => p.id === p2)!;
    assert.equal(Number(row1.totalTasks), 2);
    assert.equal(row1.avgProgress, 0.5);
    assert.equal(Number(row1.delayedCount), 1);
    assert.equal(Number(row2.totalTasks), 1);
    assert.equal(row2.avgProgress, 1);
    assert.equal(Number(row2.delayedCount), 0);

    const kpi = await portfolioKpi({ id: pmId, role: "pm" });
    assert.equal(kpi.totalProjects, 2);
    assert.equal(kpi.totalDelayed, 1);
    // weighted: (0.5*2 + 1*1) / 3 = 2/3
    assert.ok(Math.abs(kpi.avgProgress - 2 / 3) < 1e-9);

    // Gán PM chỉ thấy dự án 1 → listProjects/portfolioKpi chỉ còn dự án đó.
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmId, p1);
    const scoped = await listProjects({ id: pmId, role: "pm" });
    assert.deepEqual(
      scoped.map((p) => p.id),
      [p1],
    );
    const scopedKpi = await portfolioKpi({ id: pmId, role: "pm" });
    assert.equal(scopedKpi.totalProjects, 1);

    await run(`DELETE FROM user_projects WHERE user_id = ?`, pmId);
    await run(`DELETE FROM users WHERE id = ?`, pmId);
    await run(`DELETE FROM tasks WHERE package_id IN (?, ?)`, wp1, wp2);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, wp1, wp2);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, s1, s2);
    await run(`DELETE FROM towers WHERE id IN (?, ?)`, t1, t2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
