import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

test(
  "quyền dự án: ưu tiên dự án > tổ chức > mặc định; upsert và cascade giữ đúng phạm vi",
  S,
  async () => {
    const { insertId, query, run } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { CAN } = await import("@/lib/bao-mat/auth");
    const { setPermissionOverride, invalidatePermissionCache, getPermissionOverride } =
      await import("@/lib/bao-mat/permissions");
    const orgId = await insertId(`INSERT INTO organizations (name) VALUES ('Quyền dự án')`);
    const a = await insertId(`INSERT INTO projects (name, org_id) VALUES ('Quyền A', ?)`, orgId);
    const b = await insertId(`INSERT INTO projects (name, org_id) VALUES ('Quyền B', ?)`, orgId);
    const actor = await insertId(
      `INSERT INTO users (name, email, role, org_id, password_hash) VALUES ('Admin quyền', ?, 'admin', ?, 'test')`,
      `perm-${orgId}@test.local`,
      orgId,
    );
    try {
      await runWithRequestContext({ userId: actor, role: "admin", orgId }, async () => {
        await setPermissionOverride("engineer", "editProgress", false, actor, orgId, a);
        await setPermissionOverride("viewer", "viewPayments", true, actor, orgId);
        await setPermissionOverride("viewer", "viewPayments", true, actor, orgId);
        await setPermissionOverride("viewer", "viewPayments", false, actor, orgId, a);
        assert.equal(getPermissionOverride(orgId, "engineer", "editProgress", a), false);
        assert.equal(getPermissionOverride(orgId, "engineer", "editProgress", b), undefined);
        assert.equal(getPermissionOverride(orgId, "viewer", "viewPayments", a), false);
        assert.equal(getPermissionOverride(orgId, "viewer", "viewPayments", b), true);
        assert.equal(getPermissionOverride(orgId, "viewer", "viewPayments"), true);
      });
      for (const projectId of [a, b]) {
        await runWithRequestContext(
          { userId: actor, role: "engineer", orgId, projectId },
          async () => {
            assert.equal(
              CAN.editProgress("engineer"),
              false,
              "request mới chưa nạp không được mở quyền",
            );
            await invalidatePermissionCache(orgId);
            assert.equal(CAN.editProgress("engineer"), projectId === b);
            assert.equal(CAN.viewPayments("viewer"), projectId === b);
          },
        );
      }
      const rows = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM role_permissions WHERE org_id = ? AND project_id IS NULL`,
        orgId,
      );
      assert.equal(Number(rows[0].n), 1, "upsert cấp tổ chức không nhân dòng");
      await run(`DELETE FROM projects WHERE id = ?`, a);
      const after = await query<{ projectId: number | null }>(
        `SELECT project_id AS "projectId" FROM role_permissions WHERE org_id = ?`,
        orgId,
      );
      assert.deepEqual(after, [{ projectId: null }], "cascade chỉ xóa quyền dự án bị xóa");
      await runWithRequestContext({ userId: actor, role: "admin", orgId }, async () => {
        await invalidatePermissionCache(orgId);
        assert.equal(getPermissionOverride(orgId, "viewer", "viewPayments"), true);
        await setPermissionOverride("viewer", "viewPayments", null, actor, orgId);
        assert.equal(getPermissionOverride(orgId, "viewer", "viewPayments"), undefined);
      });
    } finally {
      await run(`DELETE FROM role_permissions WHERE org_id = ?`, orgId);
      await run(`DELETE FROM projects WHERE org_id = ?`, orgId);
      await run(`DELETE FROM users WHERE org_id = ?`, orgId);
      await run(`DELETE FROM organizations WHERE id = ?`, orgId);
    }
  },
);
