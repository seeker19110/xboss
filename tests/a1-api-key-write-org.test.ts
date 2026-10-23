import { HAS_TEST_DB } from "./setup"; // chặn DATABASE_URL thật trước mọi import DB/handler
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/bao-mat/api-keys";
import { getRequestContext, runWithRequestContext } from "@/lib/nen/request-context";
import { POST as openSession } from "@/app/api/v1/engineering/agent-sessions/route";
import { POST as addClaims } from "@/app/api/v1/engineering/agent-sessions/[id]/claims/route";

// A1-AC01 P/H: Bearer thật → handler thật → xboss_app/FORCE RLS → owner oracle.
// Không cookie/mock auth/mock DB; mỗi request bắt đầu context rỗng. Không socket HTTP/B.
type Key = { id: number; raw: string; projectId: number | null; scopes: string[] };
type Side = {
  orgId: number;
  userId: number;
  projectId: number;
  intent: string;
  bound: Key;
  global: Key;
  read: Key;
};
type Fixture = { owner: Pool; app: Pool; sides: [Side, Side] };
type Owned = { orgs: number[]; users: number[]; projects: number[]; keys: number[] };
type SessionRow = Record<string, unknown> & {
  id: string;
  project_id: number;
  api_key_id: number;
  round_count: number;
  consensus: string;
  status: string;
};
type ClaimRow = Record<string, unknown> & {
  id: string;
  project_id: number;
  session_id: string;
  round: number;
  claim: string;
  topic: string;
  agent_role: string;
};
type ConflictRow = Record<string, unknown> & {
  id: string;
  project_id: number;
  session_id: string;
  topic: string;
  claim_ids: string[];
};
type Snapshot = { sessions: SessionRow[]; claims: ClaimRow[]; conflicts: ConflictRow[] };
type OpenBody = {
  session: {
    id: string;
    projectId: number;
    intent: string;
    consensus: string;
    status: string;
    roundCount: number;
  };
  claims: { id: string; claim: string; topic: string }[];
  conflicts: unknown[];
};

const g = globalThis as unknown as { __xbossPool?: Pool };
const ROOT = "/api/v1/engineering/agent-sessions";
const TOPIC = "Đường kính ống A1";
const nextClaims = {
  claims: [{ agentRole: "specialist", agentName: "A1 specialist", topic: TOPIC, claim: "DN150" }],
};
const confirmed = { consensus: "conflict_requires_review", roundCount: 2, closed: false };
const options = { skip: !HAS_TEST_DB, concurrency: false };

function sessionInput(side: Side) {
  return {
    intent: side.intent,
    claims: [{ agentRole: "specialist", agentName: "A1 specialist", topic: TOPIC, claim: "DN100" }],
  };
}

async function makeSide(owner: Pool, owned: Owned, name: string): Promise<Side> {
  const org = await owner.query<{ id: number }>(
    "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
    [`A1 key write ${name}`],
  );
  const orgId = org.rows[0].id;
  owned.orgs.push(orgId);
  const project = await owner.query<{ id: number }>(
    "INSERT INTO projects (name, org_id) VALUES ($1, $2) RETURNING id",
    [`A1 key project ${name}`, orgId],
  );
  const projectId = project.rows[0].id;
  owned.projects.push(projectId);
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync("a1-key-fixture-no-cookie", salt, 64).toString("hex")}`;
  const user = await owner.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ($1, $2, $3, 'admin', $4) RETURNING id`,
    [`Admin A1 ${name}`, `a1-key-${name}@test.local`, passwordHash, orgId],
  );
  const userId = user.rows[0].id;
  owned.users.push(userId);
  const createKey = async (
    label: string,
    project: number | null,
    scopes: string[],
  ): Promise<Key> => {
    const raw = generateApiKey();
    const key = await owner.query<{ id: number }>(
      `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by, org_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`A1 ${label} ${name}`, hashApiKey(raw), project, scopes, userId, orgId],
    );
    owned.keys.push(key.rows[0].id);
    return { id: key.rows[0].id, raw, projectId: project, scopes };
  };
  return {
    orgId,
    projectId,
    userId,
    intent: `A1 engineering ${name}`,
    bound: await createKey("bound", projectId, ["engineering"]),
    global: await createKey("global", null, ["engineering"]),
    read: await createKey("read", projectId, ["read"]),
  };
}

async function cleanup(owner: Pool, owned: Owned) {
  // Sessions giữ FK tới key; claims/conflicts cascade theo session. Không chạm audit/receipt.
  await owner.query("DELETE FROM engineering_agent_sessions WHERE project_id = ANY($1::int[])", [
    owned.projects,
  ]);
  await owner.query("DELETE FROM login_rate_limits WHERE key = ANY($1::text[])", [
    owned.keys.map((id) => `api:${id}`),
  ]);
  await owner.query("DELETE FROM api_keys WHERE id = ANY($1::int[])", [owned.keys]);
  await owner.query("DELETE FROM users WHERE id = ANY($1::int[])", [owned.users]);
  await owner.query("DELETE FROM projects WHERE id = ANY($1::int[])", [owned.projects]);
  await owner.query("DELETE FROM organizations WHERE id = ANY($1::int[])", [owned.orgs]);
}

async function withFixture(run: (f: Fixture) => Promise<void>) {
  assert.ok(HAS_TEST_DB, "A1 key write cần TEST_DATABASE_URL disposable; không chạy bằng DB thật");
  const ownerUrl = process.env.TEST_DATABASE_URL!;
  const appUrl = new URL(ownerUrl);
  appUrl.username = "xboss_app";
  appUrl.password = "CHANGE_ME_ON_DEPLOY"; // placeholder test của migration 0069
  const owner = new Pool({ connectionString: ownerUrl, max: 2, allowExitOnIdle: true });
  let app: Pool | undefined;
  const owned: Owned = { orgs: [], projects: [], users: [], keys: [] };
  try {
    app = new Pool({ connectionString: appUrl.toString(), max: 2, allowExitOnIdle: true });
    const suffix = randomBytes(8).toString("hex");
    const A = await makeSide(owner, owned, `a-${suffix}`);
    const B = await makeSide(owner, owned, `b-${suffix}`);
    assert.notEqual(A.orgId, B.orgId);
    assert.notEqual(A.userId, B.userId);
    assert.notEqual(A.projectId, B.projectId);
    await run({ owner, app, sides: [A, B] });
  } finally {
    try {
      await cleanup(owner, owned);
    } finally {
      await Promise.all([owner.end(), app?.end()]);
    }
  }
}

async function request(f: Fixture, key: Key, path: string, body: unknown, sessionId?: string) {
  const previous = g.__xbossPool;
  g.__xbossPool = f.app;
  try {
    assert.equal(getPool(), f.app, "handler phải dùng app pool, không dùng owner oracle");
    return await runWithRequestContext({}, async () => {
      assert.deepEqual(getRequestContext(), {}, "không preseed actor/org/project cho API key");
      const req = new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key.raw}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(req.headers.get("cookie"), null);
      const res = sessionId
        ? await addClaims(req, { params: Promise.resolve({ id: sessionId }) })
        : await openSession(req);
      const responseBody: unknown = await res.json();
      return { status: res.status, body: responseBody, context: { ...getRequestContext() } };
    });
  } finally {
    if (previous === undefined) delete g.__xbossPool;
    else g.__xbossPool = previous;
  }
}

const contextFor = (side: Side) => ({
  projectId: side.projectId,
  userId: side.userId,
  orgId: side.orgId,
});

async function snapshot(f: Fixture): Promise<Snapshot> {
  const ids = f.sides.map((s) => s.projectId);
  const [sessions, claims, conflicts] = await Promise.all([
    f.owner.query<SessionRow>(
      "SELECT * FROM engineering_agent_sessions WHERE project_id = ANY($1::int[]) ORDER BY id",
      [ids],
    ),
    f.owner.query<ClaimRow>(
      "SELECT * FROM engineering_agent_claims WHERE project_id = ANY($1::int[]) ORDER BY id",
      [ids],
    ),
    f.owner.query<ConflictRow>(
      "SELECT * FROM engineering_conflicts WHERE project_id = ANY($1::int[]) ORDER BY id",
      [ids],
    ),
  ]);
  return { sessions: sessions.rows, claims: claims.rows, conflicts: conflicts.rows };
}

function inProject(state: Snapshot, projectId: number): Snapshot {
  return {
    sessions: state.sessions.filter((r) => r.project_id === projectId),
    claims: state.claims.filter((r) => r.project_id === projectId),
    conflicts: state.conflicts.filter((r) => r.project_id === projectId),
  };
}

async function open(f: Fixture, side: Side, key: Key, query = ""): Promise<string> {
  const before = await snapshot(f);
  const result = await request(f, key, `${ROOT}${query}`, sessionInput(side));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.context, contextFor(side));
  const body = result.body as OpenBody;
  assert.match(body.session.id, /^[0-9a-f-]{36}$/i);
  assert.equal(body.session.projectId, side.projectId);
  assert.equal(body.session.intent, side.intent);
  assert.equal(body.session.roundCount, 1);
  assert.equal(body.session.consensus, "consensus_confirmed");
  assert.equal(body.session.status, "open");
  assert.equal(body.claims.length, 1);
  assert.equal(body.claims[0].claim, "DN100");
  assert.equal(body.claims[0].topic, TOPIC);
  assert.deepEqual(body.conflicts, []);
  const after = await snapshot(f);
  const foreign = f.sides.find((s) => s.orgId !== side.orgId)!;
  assert.deepEqual(inProject(after, foreign.projectId), inProject(before, foreign.projectId));
  const db = inProject(after, side.projectId);
  assert.equal(db.sessions.length, 1);
  assert.equal(db.sessions[0].id, body.session.id);
  assert.equal(db.sessions[0].api_key_id, key.id);
  assert.equal(db.claims.length, 1);
  assert.equal(db.claims[0].id, body.claims[0].id);
  assert.equal(db.claims[0].session_id, body.session.id);
  assert.equal(db.claims[0].claim, "DN100");
  assert.equal(db.claims[0].round, 1);
  assert.equal(db.conflicts.length, 0);
  assert.ok(f.app.totalCount > 0, "own positive phải thực sự đi qua app pool");
  return body.session.id;
}

async function denied(
  f: Fixture,
  key: Key,
  path: string,
  body: unknown,
  status: number,
  error: string,
  context: ReturnType<typeof contextFor> | Record<string, never>,
  sessionId?: string,
) {
  const before = await snapshot(f);
  assert.equal(before.sessions.length, 2, "owner oracle phải thấy phiên thật của CẢ HAI org");
  assert.equal(before.claims.length, 2);
  assert.deepEqual(
    new Set(before.sessions.map((s) => s.project_id)),
    new Set(f.sides.map((s) => s.projectId)),
  );
  const result = await request(f, key, path, body, sessionId);
  assert.equal(result.status, status);
  assert.deepEqual(result.body, { error });
  assert.deepEqual(result.context, context);
  assert.deepEqual(
    await snapshot(f),
    before,
    "deny không đổi bất kỳ session/claim/conflict của cả hai project",
  );
}

async function positiveClaim(f: Fixture, side: Side, key: Key, id: string, query = "") {
  const before = await snapshot(f);
  const result = await request(f, key, `${ROOT}/${id}/claims${query}`, nextClaims, id);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, confirmed);
  assert.deepEqual(result.context, contextFor(side));
  const after = await snapshot(f);
  const foreign = f.sides.find((s) => s.orgId !== side.orgId)!;
  assert.deepEqual(inProject(after, foreign.projectId), inProject(before, foreign.projectId));
  const own = inProject(after, side.projectId);
  assert.equal(own.sessions.length, 1);
  assert.equal(own.sessions[0].id, id);
  assert.equal(own.sessions[0].api_key_id, key.id);
  assert.equal(own.sessions[0].round_count, 2);
  assert.equal(own.sessions[0].consensus, "conflict_requires_review");
  assert.equal(own.sessions[0].status, "open");
  assert.equal(own.sessions[0].workflow_id, null);
  assert.equal(own.claims.length, 2);
  assert.deepEqual(
    own.claims.map((c) => [c.round, c.claim]).sort((a, b) => Number(a[0]) - Number(b[0])),
    [
      [1, "DN100"],
      [2, "DN150"],
    ],
  );
  for (const claim of own.claims) {
    assert.equal(claim.session_id, id);
    assert.equal(claim.project_id, side.projectId);
    assert.equal(claim.topic, TOPIC);
    assert.equal(claim.agent_role, "specialist");
  }
  assert.equal(own.conflicts.length, 1);
  const conflict = own.conflicts[0];
  assert.equal(conflict.session_id, id);
  assert.equal(conflict.project_id, side.projectId);
  assert.equal(conflict.topic, TOPIC);
  assert.equal(conflict.conflict_type, "scope");
  assert.equal(conflict.stage, "classified");
  assert.equal(conflict.resolution, null);
  assert.deepEqual([...conflict.claim_ids].sort(), own.claims.map((c) => c.id).sort());
}

test(
  "A1 key write: xboss_app không bypass/owner, ba bảng FORCE RLS và metadata key hai org đúng",
  options,
  async () => {
    await withFixture(async (f) => {
      const role = await f.app.query<{ name: string; rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      );
      assert.deepEqual(role.rows, [{ name: "xboss_app", rolsuper: false, rolbypassrls: false }]);
      const tables = [
        "engineering_agent_sessions",
        "engineering_agent_claims",
        "engineering_conflicts",
      ].sort();
      const policies = await f.app.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
        owns: boolean;
      }>(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              pg_has_role(current_user, c.relowner, 'MEMBER') AS owns
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname`,
        [tables],
      );
      assert.deepEqual(
        policies.rows,
        tables.map((relname) => ({
          relname,
          relrowsecurity: true,
          relforcerowsecurity: true,
          owns: false,
        })),
      );
      for (const side of f.sides) {
        const user = await f.owner.query("SELECT id, org_id, role FROM users WHERE id = $1", [
          side.userId,
        ]);
        assert.deepEqual(user.rows, [{ id: side.userId, org_id: side.orgId, role: "admin" }]);
        const project = await f.owner.query("SELECT id, org_id FROM projects WHERE id = $1", [
          side.projectId,
        ]);
        assert.deepEqual(project.rows, [{ id: side.projectId, org_id: side.orgId }]);
        const keys = [side.bound, side.global, side.read];
        const metadata = await f.owner.query(
          "SELECT id, created_by, org_id, project_id, scopes FROM api_keys WHERE id = ANY($1::int[]) ORDER BY id",
          [keys.map((k) => k.id)],
        );
        assert.deepEqual(
          metadata.rows,
          keys.map((key) => ({
            id: key.id,
            created_by: side.userId,
            org_id: side.orgId,
            project_id: key.projectId,
            scopes: key.scopes,
          })),
        );
      }
    });
  },
);

for (const index of [0, 1] as const) {
  const direction = index === 0 ? "A→B" : "B→A";
  test(
    `A1 key write ${direction}: bound engineering key không thêm claim vào foreign session`,
    options,
    async () => {
      await withFixture(async (f) => {
        const own = f.sides[index];
        const foreign = f.sides[1 - index];
        const id = await open(f, own, own.bound);
        const foreignId = await open(f, foreign, foreign.bound);
        await denied(
          f,
          own.bound,
          `${ROOT}/${foreignId}/claims`,
          nextClaims,
          422,
          "Phiên không tồn tại hoặc không thuộc dự án đang chọn",
          contextFor(own),
          foreignId,
        );
        await positiveClaim(f, own, own.bound, id);
      });
    },
  );
  test(
    `A1 key write ${direction}: global engineering key chỉ mở phiên/ghi claim trong own org`,
    options,
    async () => {
      await withFixture(async (f) => {
        const own = f.sides[index];
        const foreign = f.sides[1 - index];
        const id = await open(f, own, own.global, `?project=${own.projectId}`);
        const foreignId = await open(f, foreign, foreign.bound);
        await denied(
          f,
          own.global,
          `${ROOT}?project=${foreign.projectId}`,
          sessionInput(own),
          404,
          "Dự án không tồn tại",
          {},
        );
        await denied(
          f,
          own.global,
          `${ROOT}/${foreignId}/claims?project=${foreign.projectId}`,
          nextClaims,
          404,
          "Dự án không tồn tại",
          {},
          foreignId,
        );
        await positiveClaim(f, own, own.global, id, `?project=${own.projectId}`);
      });
    },
  );
  test(
    `A1 key write ${direction}: read scope của admin bị 403 với own target/payload hợp lệ`,
    options,
    async () => {
      await withFixture(async (f) => {
        const own = f.sides[index];
        const foreign = f.sides[1 - index];
        const id = await open(f, own, own.bound);
        await open(f, foreign, foreign.bound);
        await denied(
          f,
          own.read,
          ROOT,
          sessionInput(own),
          403,
          "API key không có quyền truy cập tài nguyên này",
          {},
        );
        await denied(
          f,
          own.read,
          `${ROOT}/${id}/claims`,
          nextClaims,
          403,
          "API key không có quyền truy cập tài nguyên này",
          {},
          id,
        );
        await positiveClaim(f, own, own.bound, id);
      });
    },
  );
}
