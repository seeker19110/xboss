import { HAS_TEST_DB } from "./setup";
import { dangNhap } from "./helpers/phien";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { insertId, queryOne, run } from "@/lib/db";
import { hashPassword } from "@/lib/bao-mat/auth";
import { generateApiKey, hashApiKey, requireApiKey } from "@/lib/bao-mat/api-keys";
import { getRequestContext, runWithRequestContext } from "@/lib/nen/request-context";
import { POST } from "@/app/api/admin/api-keys/route";

const S = { skip: !HAS_TEST_DB };
const prefix = Date.now().toString(36);
let sequence = 0;
const ownedOrgs: number[] = [];
const ownedProjects: number[] = [];
const ownedUsers: number[] = [];

after(async () => {
  if (!HAS_TEST_DB) return;
  for (const id of ownedUsers) await run(`DELETE FROM api_keys WHERE created_by = ?`, id);
  for (const id of ownedUsers) await run(`DELETE FROM users WHERE id = ?`, id);
  for (const id of ownedProjects) await run(`DELETE FROM projects WHERE id = ?`, id);
  for (const id of ownedOrgs) await run(`DELETE FROM organizations WHERE id = ?`, id);
});

async function fixture() {
  const orgA = await insertId(`INSERT INTO organizations (name) VALUES ('Key org A')`);
  ownedOrgs.push(orgA);
  const orgB = await insertId(`INSERT INTO organizations (name) VALUES ('Key org B')`);
  ownedOrgs.push(orgB);
  const ownProject = await insertId(`INSERT INTO projects (name, org_id) VALUES ('Own', ?)`, orgA);
  ownedProjects.push(ownProject);
  const otherProject = await insertId(
    `INSERT INTO projects (name, org_id) VALUES ('Other', ?)`,
    orgB,
  );
  ownedProjects.push(otherProject);
  const passwordHash = hashPassword("mat-khau-test-api-key");
  const userId = await insertId(
    `INSERT INTO users (name, email, role, password_hash, org_id) VALUES ('Admin key', ?, 'admin', ?, ?)`,
    `key-tenant-${prefix}-${++sequence}@test.local`,
    passwordHash,
    orgA,
  );
  ownedUsers.push(userId);
  dangNhap({ id: userId, passwordHash, orgId: orgA });
  async function key(projectId: number | null) {
    const raw = generateApiKey();
    await insertId(
      `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by, org_id)
       VALUES ('Test key', ?, ?, ?, ?, ?)`,
      hashApiKey(raw),
      projectId,
      ["read"],
      userId,
      orgA,
    );
    return raw;
  }
  return { orgA, userId, ownProject, otherProject, key };
}

function readRequest(raw: string, project: number) {
  return new NextRequest(`http://localhost/api/v1/tasks?project=${project}`, {
    headers: { authorization: `Bearer ${raw}` },
  });
}

test("API key: admin không cấp key cho dự án ngoài tổ chức", S, async () => {
  const f = await fixture();
  const response = await POST(
    new NextRequest("http://localhost/api/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "Foreign project", projectId: f.otherProject }),
    }),
  );
  assert.equal(response.status, 404);
  const count = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM api_keys WHERE created_by = ?`,
    f.userId,
  );
  assert.equal(count?.n, 0);
});

test("API key: key toàn cục chỉ truy cập dự án cùng tổ chức", S, async () => {
  const f = await fixture();
  const raw = await f.key(null);
  await runWithRequestContext({}, async () => {
    const denied = await requireApiKey(readRequest(raw, f.otherProject), "read");
    assert.ok(denied instanceof Response);
    assert.equal(denied.status, 404);
    assert.deepEqual(getRequestContext(), {});
    const allowed = await requireApiKey(readRequest(raw, f.ownProject), "read");
    assert.ok(!(allowed instanceof Response));
    assert.deepEqual(getRequestContext(), {
      orgId: f.orgA,
      projectId: f.ownProject,
      userId: f.userId,
    });
  });
});

test("API key: key gắn nhầm dự án tổ chức khác cũng bị từ chối", S, async () => {
  const f = await fixture();
  const raw = await f.key(f.otherProject);
  const response = await requireApiKey(readRequest(raw, f.ownProject), "read");
  assert.ok(response instanceof Response);
  assert.equal(response.status, 404);
});
