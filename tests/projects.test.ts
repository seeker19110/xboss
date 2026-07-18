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
  "listProjects/portfolioKpi: % tiến độ + số việc trễ tính đúng theo dự án, không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listProjects, portfolioKpi } = await import("@/lib/projects");

    const YESTERDAY = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

    const p1 = await insertId(
      `INSERT INTO projects (name, code, status) VALUES ('DA Portfolio 1', 'PJT-PF1', 'active')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code, status) VALUES ('DA Portfolio 2', 'PJT-PF2', 'closed')`,
    );
    const tw1 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp PF1')`, p1);
    const tw2 = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp PF2')`, p2);
    const st1 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'PF1SHEET', 'Sheet PF1')`,
      tw1,
    );
    const st2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'PF2SHEET', 'Sheet PF2')`,
      tw2,
    );
    const pkg1 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'PF1', 'Nhóm PF1')`,
      st1,
    );
    const pkg2 = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'PF2', 'Nhóm PF2')`,
      st2,
    );

    // Dự án 1: 1 task 100%, 1 task trễ (0%, quá hạn) → avg 50%, 1 việc trễ.
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'PF1,01', 'Task xong', 1, 'hoan_thanh')`,
      pkg1,
    );
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, end_date, status) VALUES (?, 'PF1,02', 'Task trễ', 0, ?, 'tre')`,
      pkg1,
      YESTERDAY,
    );
    // Dự án 2: 1 task 100%, không trễ.
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'PF2,01', 'Task xong', 1, 'hoan_thanh')`,
      pkg2,
    );

    const admin = { id: -1, role: "admin" as const };
    const list = await listProjects(admin);
    const l1 = list.find((p) => p.id === p1);
    const l2 = list.find((p) => p.id === p2);
    assert.ok(l1 && l2);
    assert.equal(l1!.progressPercent, 0.5);
    assert.equal(l1!.delayedCount, 1);
    assert.equal(l1!.status, "active");
    assert.equal(l2!.progressPercent, 1);
    assert.equal(l2!.delayedCount, 0);
    assert.equal(l2!.status, "closed");

    const kpi = await portfolioKpi(admin);
    assert.ok(kpi.totalProjects >= 2);
    assert.ok(kpi.totalDelayed >= 1);

    await run(`DELETE FROM tasks WHERE package_id IN (?, ?)`, pkg1, pkg2);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, pkg1, pkg2);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, st1, st2);
    await run(`DELETE FROM towers WHERE id IN (?, ?)`, tw1, tw2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "listProjects(orgId)/listOrganizations: lọc theo tổ chức; org_id NULL không tạo mục org (M51 PR4)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listProjects, listOrganizations } = await import("@/lib/projects");

    const o1 = await insertId(
      `INSERT INTO organizations (name, tax_code) VALUES ('Tổ chức A', '0100000001')`,
    );
    const o2 = await insertId(`INSERT INTO organizations (name) VALUES ('Tổ chức B')`);
    const pA = await insertId(
      `INSERT INTO projects (name, code, org_id) VALUES ('DA Org A', 'PJT-ORGA', ?)`,
      o1,
    );
    const pB = await insertId(
      `INSERT INTO projects (name, code, org_id) VALUES ('DA Org B', 'PJT-ORGB', ?)`,
      o2,
    );
    const pNull = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA không org', 'PJT-ORGN')`,
    );

    const admin = { id: -1, role: "admin" as const };

    // Không truyền orgId → thấy cả 3.
    const all = await listProjects(admin);
    const allIds = all.map((p) => p.id);
    assert.ok(
      allIds.includes(pA) && allIds.includes(pB) && allIds.includes(pNull),
      "không lọc → thấy hết",
    );
    assert.equal(all.find((p) => p.id === pA)!.orgId, o1);
    assert.equal(all.find((p) => p.id === pNull)!.orgId, null);

    // Lọc theo org A → chỉ dự án org A.
    const onlyA = await listProjects(admin, o1);
    assert.deepEqual(
      onlyA.map((p) => p.id),
      [pA],
    );

    // listOrganizations chỉ liệt kê org có dự án user thấy, không tính dự án org_id NULL.
    const orgs = await listOrganizations(admin);
    const orgIds = orgs.map((o) => o.id);
    assert.ok(orgIds.includes(o1) && orgIds.includes(o2));

    await run(`DELETE FROM projects WHERE id IN (?, ?, ?)`, pA, pB, pNull);
    await run(`DELETE FROM organizations WHERE id IN (?, ?)`, o1, o2);
  },
);
