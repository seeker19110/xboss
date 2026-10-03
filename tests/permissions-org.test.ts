import { HAS_TEST_DB } from "./setup";
import { dangNhapDuAn, dangXuat } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import ExcelJS from "exceljs";

const S = { skip: !HAS_TEST_DB };
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/role-permissions", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

test(
  "quyền hai org: CRUD/HTTP/export độc lập, project khác org bị chặn, token org cũ hết hiệu lực",
  S,
  async () => {
    const { insertId, query, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { getCurrentUser, CAN } = await import("@/lib/bao-mat/auth");
    const { invalidatePermissionCache, setPermissionOverride } =
      await import("@/lib/bao-mat/permissions");
    const { GET, PATCH } = await import("@/app/api/admin/role-permissions/route");
    const { GET: exportSnapshot } = await import("@/app/api/admin/permissions-snapshot/route");
    const orgs: number[] = [];
    const projects: number[] = [];
    const actors: { id: number; orgId: number; passwordHash: string }[] = [];
    try {
      for (const label of ["A", "B"]) {
        const orgId = await insertId(
          `INSERT INTO organizations (name) VALUES (?)`,
          `Quyền org ${label}`,
        );
        orgs.push(orgId);
        projects.push(
          await insertId(
            `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
            `Quyền riêng ${label}`,
            orgId,
          ),
        );
        const id = await insertId(
          `INSERT INTO users (name, email, role, password_hash, org_id) VALUES (?, ?, 'admin', 'perm-org-test', ?)`,
          `Admin ${label}`,
          `perm-org-${orgId}@test.local`,
          orgId,
        );
        actors.push({ id, orgId, passwordHash: "perm-org-test" });
      }
      for (const i of [0, 1]) {
        await dangNhapDuAn(actors[i], projects[i]);
        for (const projectId of [null, projects[i]]) {
          const res = await PATCH(
            request({ role: "viewer", permKey: "viewPayments", allowed: i === 1, projectId }),
          );
          assert.equal(res.status, 200);
        }
      }
      await dangNhapDuAn(actors[0], projects[0]);
      let response: Response = await GET(
        new NextRequest("http://localhost/api/admin/role-permissions"),
      );
      const matrix = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(
        matrix.projects.map((p: { id: number }) => p.id),
        [projects[0]],
      );
      assert.equal(matrix.overrides.length, 1);
      assert.equal(matrix.overrides[0].allowed, false);
      for (const raw of [String(projects[1]), "01", "1e0", "", "9007199254740993"]) {
        response = await GET(
          new NextRequest(`http://localhost/api/admin/role-permissions?projectId=${raw}`),
        );
        assert.equal(response.status, 422);
      }
      response = await PATCH(
        request({ role: "viewer", permKey: "viewPayments", allowed: true, projectId: projects[1] }),
      );
      assert.equal(response.status, 422);
      await runWithRequestContext(
        { userId: actors[0].id, role: "admin", orgId: orgs[0] },
        async () => {
          await assert.rejects(
            setPermissionOverride(
              "viewer",
              "viewPayments",
              true,
              actors[0].id,
              orgs[0],
              projects[1],
            ),
            /Dự án không thuộc tổ chức hiện tại/,
          );
        },
      );
      const exportRes = await exportSnapshot();
      assert.equal(exportRes.status, 200);
      assert.equal(exportRes.headers.get("cache-control"), "private, no-store");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await exportRes.arrayBuffer());
      const exported = JSON.stringify(wb.worksheets[0].getSheetValues());
      assert.ok(exported.includes("Quyền riêng A"));
      assert.ok(!exported.includes("Quyền riêng B"));
      for (const i of [0, 1]) {
        await runWithRequestContext(
          { userId: actors[i].id, role: "viewer", orgId: orgs[i], projectId: projects[i] },
          async () => {
            await invalidatePermissionCache(orgs[i]);
            assert.equal(CAN.viewPayments("viewer"), i === 1);
          },
        );
      }
      for (const projectId of [null, projects[0]]) {
        response = await PATCH(
          request({ role: "viewer", permKey: "viewPayments", allowed: null, projectId }),
        );
        assert.equal(response.status, 200);
      }
      const remaining = await query<{ orgId: number; allowed: boolean }>(
        `SELECT org_id AS "orgId", allowed FROM role_permissions WHERE org_id IN (?, ?)`,
        ...orgs,
      );
      assert.equal(remaining.length, 2);
      assert.ok(remaining.every((row) => row.orgId === orgs[1] && row.allowed));
      await run(`UPDATE users SET org_id = ? WHERE id = ?`, orgs[1], actors[0].id);
      assert.equal(await getCurrentUser(), null, "token org cũ phải bị từ chối");
      assert.equal(CAN.manageUsers("admin"), false, "không giữ snapshot của phiên cũ");
    } finally {
      dangXuat();
      for (const orgId of orgs) {
        await run(`DELETE FROM role_permissions WHERE org_id = ?`, orgId);
        await run(
          `DELETE FROM user_projects WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`,
          orgId,
        );
        await run(`DELETE FROM projects WHERE org_id = ?`, orgId);
        await run(`DELETE FROM users WHERE org_id = ?`, orgId);
        await run(`DELETE FROM organizations WHERE id = ?`, orgId);
      }
    }
  },
);

test(
  "migration quyền org: chạy lặp giữ dữ liệu và chặn index cùng tên sai định nghĩa",
  S,
  async () => {
    const { getPool, query } = await import("@/lib/db");
    await query(`SELECT 1`);
    const sql = readFileSync("migrations/0158_role_permissions_org_scope.sql", "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const before = await client.query("SELECT * FROM role_permissions ORDER BY id");
      await client.query(sql);
      await client.query(sql);
      assert.deepEqual(
        (await client.query("SELECT * FROM role_permissions ORDER BY id")).rows,
        before.rows,
      );
      assert.equal(
        (await client.query("SELECT to_regclass('uq_role_perm_scope') AS old")).rows[0].old,
        null,
      );
      await client.query("DROP INDEX uq_role_perm_org_scope");
      await client.query("CREATE UNIQUE INDEX uq_role_perm_org_scope ON role_permissions (id)");
      await assert.rejects(client.query(sql), /Sai định nghĩa uq_role_perm_org_scope/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  },
);

test("quyền org: service CRUD và snapshot chạy bằng xboss_app NOBYPASSRLS", S, async () => {
  const { insertId, query, run, getPool } = await import("@/lib/db");
  const { runWithRequestContext } = await import("@/lib/nen/request-context");
  const {
    listPermissionOverrides,
    setPermissionOverride,
    invalidatePermissionCache,
    getPermissionOverride,
  } = await import("@/lib/bao-mat/permissions");
  const orgs = [
    await insertId(`INSERT INTO organizations (name) VALUES ('Quyền RLS A')`),
    await insertId(`INSERT INTO organizations (name) VALUES ('Quyền RLS B')`),
  ];
  const ownerPool = getPool();
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.username = "xboss_app";
  url.password = "CHANGE_ME_ON_DEPLOY";
  const appPool = new Pool({ connectionString: url.toString(), allowExitOnIdle: true });
  const runtime = globalThis as unknown as { __xbossPool?: Pool };
  try {
    const role = await appPool.query(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user",
    );
    assert.deepEqual(role.rows[0], { rolbypassrls: false, rolsuper: false });
    runtime.__xbossPool = appPool;
    for (const orgId of orgs) {
      await runWithRequestContext({ userId: 1, role: "admin", orgId }, async () => {
        await setPermissionOverride("viewer", "viewPayments", orgId === orgs[1], null, orgId);
        await invalidatePermissionCache(orgId);
        assert.equal(getPermissionOverride(orgId, "viewer", "viewPayments"), orgId === orgs[1]);
        assert.equal((await listPermissionOverrides(orgId)).length, 1);
      });
    }
    await runWithRequestContext({ userId: 1, role: "admin", orgId: orgs[0] }, async () => {
      await setPermissionOverride("viewer", "viewPayments", null, null, orgs[0]);
      assert.deepEqual(await listPermissionOverrides(orgs[0]), []);
    });
    runtime.__xbossPool = ownerPool;
    const left = await query<{ orgId: number }>(
      `SELECT org_id AS "orgId" FROM role_permissions WHERE org_id IN (?, ?)`,
      ...orgs,
    );
    assert.deepEqual(left, [{ orgId: orgs[1] }]);
  } finally {
    runtime.__xbossPool = ownerPool;
    await appPool.end();
    for (const orgId of orgs) {
      await run(`DELETE FROM role_permissions WHERE org_id = ?`, orgId);
      await run(`DELETE FROM organizations WHERE id = ?`, orgId);
    }
  }
});

test(
  "quyền org: override cũ trỏ dự án org khác bị bỏ qua, không làm sập đăng nhập cả org",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { getCurrentUser, CAN } = await import("@/lib/bao-mat/auth");
    const orgA = await insertId(`INSERT INTO organizations (name) VALUES ('Quyền lệch A')`);
    const orgB = await insertId(`INSERT INTO organizations (name) VALUES ('Quyền lệch B')`);
    const projA = await insertId(`INSERT INTO projects (name, org_id) VALUES ('Lệch A', ?)`, orgA);
    const projB = await insertId(`INSERT INTO projects (name, org_id) VALUES ('Lệch B', ?)`, orgB);
    const adminA = await insertId(
      `INSERT INTO users (name, email, role, password_hash, org_id) VALUES ('Admin lệch', ?, 'admin', 'perm-skew', ?)`,
      `perm-skew-${orgA}@test.local`,
      orgA,
    );
    try {
      // Writer trước PR #544 lấy org của admin nhưng không kiểm org của dự án → dòng lệch này
      // có thể đã tồn tại trên production. Ghi thẳng để mô phỏng dữ liệu cũ.
      await run(
        `INSERT INTO role_permissions (role, perm_key, allowed, project_id, org_id, updated_by)
       VALUES ('admin', 'viewPayments', false, ?, ?, ?)`,
        projB,
        orgA,
        adminA,
      );
      await dangNhapDuAn({ id: adminA, orgId: orgA, passwordHash: "perm-skew" }, projA);
      await runWithRequestContext({}, async () => {
        const user = await getCurrentUser();
        assert.equal(user?.id, adminA, "đăng nhập vẫn chạy được");
        // Dòng lệch không có hiệu lực: admin giữ quyền mặc định ở dự án của mình.
        assert.equal(CAN.viewPayments("admin"), true);
      });
    } finally {
      dangXuat();
      await run(`DELETE FROM role_permissions WHERE org_id = ?`, orgA);
      await run(`DELETE FROM user_projects WHERE user_id = ?`, adminA);
      await run(`DELETE FROM users WHERE id = ?`, adminA);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
      await run(`DELETE FROM organizations WHERE id IN (?, ?)`, orgA, orgB);
    }
  },
);
