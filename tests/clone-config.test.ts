import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Template dự án (M51 PR3): clone-config sao chép CẤU HÌNH, KHÔNG sao chép dữ liệu giao dịch.
test(
  "cloneProjectConfig: chép đủ nhóm cấu hình, không chép dữ liệu giao dịch, không đụng BOQCODE",
  { skip: !HAS_TEST_DB },
  async () => {
    const { query, queryOne, insertId, run } = await import("@/lib/db");
    const { cloneProjectConfig } = await import("@/lib/clone-config");

    // Người thực hiện sao chép (created_by/updated_by).
    const actorId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Clone Admin', ?, 'x:y', 'admin')`,
      `clone-admin-${Date.now()}@xboss.vn`,
    );

    // ===== Dự án NGUỒN + cấu hình =====
    const srcId = await insertId(`INSERT INTO projects (name) VALUES ('Nguồn clone-config')`);

    // 2 tháp.
    const towerA = await insertId(
      `INSERT INTO towers (project_id, name, description) VALUES (?, 'Tháp A', 'mô tả A')`,
      srcId,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp B')`,
      srcId,
    );

    // Hệ (systems) — toàn cục, sheet gắn system_id.
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'ACMV clone') RETURNING id`,
      `acmv-clone-${Date.now()}`,
    );

    // 3 sheet_types trên 2 tháp. Đặt slug nguồn duy nhất toàn run (token) — vì slug là
    // UNIQUE toàn hệ, nếu clone chép nguyên slug thì sẽ trùng với sheet nguồn → buộc
    // clone-config phải SINH slug mới (kích hoạt nhánh thêm suffix).
    const tok = Date.now();
    const srcSlugs = [`ogtd-${tok}`, `oghl-${tok}`, `odnn1-${tok}`];
    const sheet1 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, responsible, system_id, slug) VALUES (?, 'OGTD', 'Ống gió TĐ', 'KS An', ?, ?) RETURNING id`,
      towerA,
      sysId,
      srcSlugs[0],
    );
    await run(
      `INSERT INTO sheet_types (tower_id, code, name, system_id, slug) VALUES (?, 'OGHL', 'Ống gió HL', ?, ?)`,
      towerA,
      sysId,
      srcSlugs[1],
    );
    await run(
      `INSERT INTO sheet_types (tower_id, code, name, system_id, slug) VALUES (?, 'ODNN1', 'ĐHKK Zone 1', ?, ?)`,
      towerB,
      sysId,
      srcSlugs[2],
    );

    // nav_settings gắn dự án nguồn.
    await run(
      `INSERT INTO nav_settings (node_key, project_id, enabled, updated_by) VALUES ('dash.moi-truong', ?, false, ?)`,
      srcId,
      actorId,
    );

    // approval_flows + steps gắn dự án nguồn.
    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name, active) VALUES (?, 'variation', 'Duyệt VO', true) RETURNING id`,
      srcId,
    );
    await run(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days) VALUES (?, 1, 'pm', NULL, 3)`,
      flowId,
    );
    await run(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days) VALUES (?, 2, 'admin', 100000000, 5)`,
      flowId,
    );

    // alert_rules gắn dự án nguồn.
    await run(
      `INSERT INTO alert_rules (project_id, metric, operator, threshold, channel, active, created_by)
       VALUES (?, 'spi', 'lt', 0.9, 'notification', true, ?)`,
      srcId,
      actorId,
    );

    // ===== Dữ liệu GIAO DỊCH ở nguồn (phải KHÔNG bị chép) =====
    // work_package + task (WBS).
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm A1') RETURNING id`,
      sheet1,
    );
    await run(`INSERT INTO tasks (package_id, code, name) VALUES (?, 'A1,01', 'Task A1.01')`, wpId);
    // contract gắn project_id nguồn, boq_code duy nhất toàn hệ (registry boq_codes).
    const srcBoqCode = `BOQ-CLONE-${Date.now()}`;
    await run(
      `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'giao_thau', 'HĐ nguồn', ?)`,
      `HD-CLONE-${Date.now()}`,
      srcId,
    );
    await run(
      `INSERT INTO boq_items (code, name, unit, project_id) VALUES (?, 'Vật tư nguồn', 'm', ?)`,
      srcBoqCode,
      srcId,
    );

    // Đếm registry BOQCODE trước clone.
    const boqBefore = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM boq_codes`);

    // ===== Clone =====
    const res = await cloneProjectConfig(
      srcId,
      { name: "Đích clone-config", code: `DICH-${Date.now()}` },
      actorId,
    );
    const dstId = res.projectId;

    // ===== Kiểm cấu hình đã chép đủ =====
    assert.equal(res.towers, 2, "phải chép 2 tháp");
    assert.equal(res.sheetTypes, 3, "phải chép 3 sheet_types");
    assert.equal(res.navSettings, 1, "phải chép 1 nav_settings");
    assert.equal(res.approvalFlows, 1, "phải chép 1 approval_flow");
    assert.equal(res.approvalSteps, 2, "phải chép 2 approval_steps");
    assert.equal(res.alertRules, 1, "phải chép 1 alert_rule");

    const dstTowers = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM towers WHERE project_id = ?`,
      dstId,
    );
    assert.equal(dstTowers?.n, 2);

    const dstSheets = await query<{ code: string; system_id: number | null; slug: string | null }>(
      `SELECT st.code, st.system_id, st.slug FROM sheet_types st
        JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ? ORDER BY st.code`,
      dstId,
    );
    assert.deepEqual(
      dstSheets.map((s) => s.code),
      ["ODNN1", "OGHL", "OGTD"],
    );
    // Giữ hệ (system_id) khi chép.
    assert.ok(dstSheets.every((s) => s.system_id === sysId));

    // slug là khoá routing UNIQUE toàn hệ: mọi sheet đích phải có slug (KHÔNG NULL),
    // hợp lệ, không trùng nhau và không trùng slug sheet nguồn (đã bị chiếm).
    const dstSlugs = dstSheets.map((s) => s.slug);
    assert.ok(
      dstSlugs.every((s) => s != null && /^[a-z0-9][a-z0-9-]{0,49}$/.test(s)),
      "mọi sheet đích phải có slug hợp lệ, không NULL",
    );
    assert.equal(
      new Set(dstSlugs).size,
      dstSlugs.length,
      "slug các sheet đích không được trùng nhau",
    );
    assert.ok(
      dstSlugs.every((s) => !srcSlugs.includes(s as string)),
      "slug sheet đích không được trùng slug sheet nguồn (đã chiếm)",
    );
    // UNIQUE toàn hệ thật: không dòng nào khác cùng slug.
    for (const s of dstSlugs) {
      const dup = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM sheet_types WHERE slug = ?`,
        s,
      );
      assert.equal(dup?.n, 1, `slug "${s}" phải là duy nhất toàn hệ`);
    }

    const dstNav = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM nav_settings WHERE project_id = ?`,
      dstId,
    );
    assert.equal(dstNav?.n, 1);

    const dstSteps = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM approval_steps s
        JOIN approval_flows f ON f.id = s.flow_id WHERE f.project_id = ?`,
      dstId,
    );
    assert.equal(dstSteps?.n, 2);

    const dstAlerts = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM alert_rules WHERE project_id = ?`,
      dstId,
    );
    assert.equal(dstAlerts?.n, 1);

    // ===== KHÔNG chép dữ liệu giao dịch =====
    const dstTasks = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tasks t
        JOIN work_packages wp ON wp.id = t.package_id
        JOIN sheet_types st ON st.id = wp.sheet_type_id
        JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?`,
      dstId,
    );
    assert.equal(dstTasks?.n, 0, "dự án đích KHÔNG được có task");

    const dstWp = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM work_packages wp
        JOIN sheet_types st ON st.id = wp.sheet_type_id
        JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?`,
      dstId,
    );
    assert.equal(dstWp?.n, 0, "dự án đích KHÔNG được có work_package");

    const dstContracts = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM contracts WHERE project_id = ?`,
      dstId,
    );
    assert.equal(dstContracts?.n, 0, "dự án đích KHÔNG được có hợp đồng");

    const dstBoq = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM boq_items WHERE project_id = ?`,
      dstId,
    );
    assert.equal(dstBoq?.n, 0, "dự án đích KHÔNG được có boq_items");

    // ===== BOQCODE toàn hệ không phát sinh dòng registry mới =====
    const boqAfter = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM boq_codes`);
    assert.equal(boqAfter?.n, boqBefore?.n, "clone-config KHÔNG được thêm dòng registry boq_codes");
    // Mã nguồn vẫn thuộc đúng bảng/row cũ (không bị dời).
    const owner = await queryOne<{ table_name: string }>(
      `SELECT table_name FROM boq_codes WHERE code = ?`,
      srcBoqCode,
    );
    assert.equal(owner?.table_name, "boq_items");
  },
);
