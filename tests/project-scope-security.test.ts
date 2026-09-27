import { HAS_TEST_DB } from "./setup";
import { dangNhap, datCookie } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { insertId, run } from "@/lib/db";
import { hashPassword } from "@/lib/bao-mat/auth";
import {
  visibleProjectIds,
  getCurrentProjectId,
  chotProjectIdChoGhi,
} from "@/lib/ha-tang/projects";
import { getRequestContext, runWithRequestContext } from "@/lib/nen/request-context";

test(
  "scope PostgreSQL: tenant, membership, cookie và ngữ cảnh đã thu hồi",
  { skip: !HAS_TEST_DB },
  async () => {
    const orgA = await insertId(`INSERT INTO organizations (name) VALUES ('Scope A')`);
    const orgB = await insertId(`INSERT INTO organizations (name) VALUES ('Scope B')`);
    const own = await insertId(`INSERT INTO projects (name, org_id) VALUES ('Scope own', ?)`, orgA);
    const other = await insertId(
      `INSERT INTO projects (name, org_id) VALUES ('Scope other', ?)`,
      orgB,
    );
    const passwordHash = hashPassword("fixture-project-password");
    const userId = await insertId(
      `INSERT INTO users (name, email, role, password_hash, org_id) VALUES ('Scope PM', ?, 'pm', ?, ?)`,
      `scope-${Date.now()}@test.local`,
      passwordHash,
      orgA,
    );
    const actor = { id: userId, role: "pm" as const, orgId: orgA };
    try {
      assert.deepEqual(await visibleProjectIds(actor), []);
      assert.deepEqual(await visibleProjectIds({ ...actor, role: "admin" }), [own]);
      await run(
        `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?), (?, ?)`,
        userId,
        own,
        userId,
        other,
      );
      assert.deepEqual(await visibleProjectIds(actor), [own]);
      assert.deepEqual(await chotProjectIdChoGhi(actor, other, own), { ok: false });
      assert.deepEqual(await chotProjectIdChoGhi(actor, own, null), { ok: true, projectId: own });
      dangNhap({ id: userId, passwordHash, orgId: orgA }, other);
      await runWithRequestContext({ projectId: own }, async () => {
        assert.equal(await getCurrentProjectId(actor), null);
        assert.equal(getRequestContext()?.projectId, undefined);
        datCookie("xboss_project", String(own));
        assert.equal(await getCurrentProjectId(actor), own);
        await run(`DELETE FROM user_projects WHERE user_id = ?`, userId);
        assert.equal(await getCurrentProjectId(actor), null);
      });
    } finally {
      await run(`DELETE FROM user_projects WHERE user_id = ?`, userId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, own, other);
      await run(`DELETE FROM organizations WHERE id IN (?, ?)`, orgA, orgB);
    }
  },
);
