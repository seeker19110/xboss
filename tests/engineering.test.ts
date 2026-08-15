import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// ENG-1 — kho nhận Engineering Object từ hệ thống ngoài (docs/nang-cap/ENG-1-mep-agent-
// integration.md). Integration (cần Postgres qua TEST_DATABASE_URL, không có thì tự skip).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

let U = 0;
let pA = 0;
let pB = 0;
let keyEngA = "";
let keyReadA = "";

function reqOf(path: string, key: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      // ENG-5 §3.1 làm Idempotency-Key thành BẮT BUỘC trên /ingest. Mỗi lần gọi dùng key
      // mới để test ENG-1 giữ nguyên ý nghĩa cũ (xử lý thật, không rơi vào nhánh replay);
      // hành vi lũy đẳng/replay được phủ riêng ở tests/engineering-ingest.test.ts.
      "idempotency-key": randomUUID(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/api-keys");

  U = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('EngTest','eng-test@x.vn','admin','x')`,
  );
  pA = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Eng A', 'PJT-ENGA')`);
  pB = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Eng B', 'PJT-ENGB')`);

  const rawEngA = generateApiKey();
  keyEngA = rawEngA;
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('EngA', ?, ?, ?, ?)`,
    hashApiKey(rawEngA),
    pA,
    ["engineering"],
    U,
  );
  const rawReadA = generateApiKey();
  keyReadA = rawReadA;
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('ReadA', ?, ?, ?, ?)`,
    hashApiKey(rawReadA),
    pA,
    ["read"],
    U,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM engineering_object_relations WHERE project_id IN (?, ?)`, pA, pB);
  await run(
    `DELETE FROM engineering_object_revisions WHERE object_id IN (SELECT id FROM engineering_objects WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM engineering_objects WHERE project_id IN (?, ?)`, pA, pB);
  await run(
    `DELETE FROM engineering_source_revisions WHERE source_id IN (SELECT id FROM engineering_sources WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM engineering_sources WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM api_keys WHERE created_by = ?`, U);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM users WHERE id = ?`, U);
  await run(`DELETE FROM login_rate_limits WHERE key LIKE 'api%'`);
});

test("upsertEngineeringObjectFromExternal: tạo mới rồi upsert cùng externalKey", S, async () => {
  const { upsertEngineeringObjectFromExternal, engineeringObjectExternalInputSchema } =
    await import("@/lib/engineering-kernel");
  const input = engineeringObjectExternalInputSchema.parse({
    projectId: pA,
    objectType: "AHU",
    discipline: "mechanical",
    externalKey: "ahu:test-001",
    name: "AHU tầng 3",
    properties: { capacity_kw: 50 },
  });
  const r1 = await upsertEngineeringObjectFromExternal(input, U);
  assert.equal(r1.created, true);

  const { queryOne } = await import("@/lib/db");
  const row1 = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_objects WHERE id = ?`,
    r1.id,
  );
  assert.equal(row1?.status, "pending_review");

  const input2 = engineeringObjectExternalInputSchema.parse({
    ...input,
    properties: { capacity_kw: 55 },
  });
  const r2 = await upsertEngineeringObjectFromExternal(input2, U);
  assert.equal(r2.id, r1.id);
  assert.equal(r2.created, false);

  const row2 = await queryOne<{ properties: { capacity_kw: number } }>(
    `SELECT properties FROM engineering_objects WHERE id = ?`,
    r1.id,
  );
  assert.equal(row2?.properties.capacity_kw, 55);
});

test("reviewEngineeringObject: duyệt rồi upsert lại KHÔNG reset status", S, async () => {
  const {
    upsertEngineeringObjectFromExternal,
    reviewEngineeringObject,
    engineeringObjectExternalInputSchema,
  } = await import("@/lib/engineering-kernel");
  const input = engineeringObjectExternalInputSchema.parse({
    projectId: pA,
    objectType: "pipe_segment",
    discipline: "plumbing",
    externalKey: "pipe:test-002",
    properties: {},
  });
  const { id } = await upsertEngineeringObjectFromExternal(input, U);

  await reviewEngineeringObject(pA, id, "approved", U, "Đạt yêu cầu");

  const { queryOne } = await import("@/lib/db");
  const afterReview = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_objects WHERE id = ?`,
    id,
  );
  assert.equal(afterReview?.status, "approved");

  await upsertEngineeringObjectFromExternal(
    engineeringObjectExternalInputSchema.parse({ ...input, name: "Ống cập nhật" }),
    U,
  );
  const afterUpsert = await queryOne<{ status: string; name: string }>(
    `SELECT status, name FROM engineering_objects WHERE id = ?`,
    id,
  );
  assert.equal(afterUpsert?.status, "approved");
  assert.equal(afterUpsert?.name, "Ống cập nhật");

  const revisions = await (
    await import("@/lib/db")
  ).query<{ revisionNo: number }>(
    `SELECT revision_no AS "revisionNo" FROM engineering_object_revisions WHERE object_id = ? ORDER BY revision_no`,
    id,
  );
  assert.equal(revisions.length, 3); // tạo mới + duyệt + upsert lại
});

test("reviewEngineeringObject: object thuộc dự án khác → ném lỗi", S, async () => {
  const {
    upsertEngineeringObjectFromExternal,
    reviewEngineeringObject,
    engineeringObjectExternalInputSchema,
  } = await import("@/lib/engineering-kernel");
  const { id } = await upsertEngineeringObjectFromExternal(
    engineeringObjectExternalInputSchema.parse({
      projectId: pA,
      objectType: "panel",
      discipline: "electrical",
      externalKey: "panel:test-003",
      properties: {},
    }),
    U,
  );
  await assert.rejects(() => reviewEngineeringObject(pB, id, "approved", U));
});

test("listEngineeringObjects: cách ly đa dự án", S, async () => {
  const {
    upsertEngineeringObjectFromExternal,
    listEngineeringObjects,
    engineeringObjectExternalInputSchema,
  } = await import("@/lib/engineering-kernel");
  await upsertEngineeringObjectFromExternal(
    engineeringObjectExternalInputSchema.parse({
      projectId: pA,
      objectType: "AHU",
      discipline: "mechanical",
      externalKey: "ahu:isolation-a",
      properties: {},
    }),
    U,
  );
  const listA = await listEngineeringObjects(pA);
  const listB = await listEngineeringObjects(pB);
  assert.ok(listA.some((o) => (o as { externalKey: string }).externalKey === "ahu:isolation-a"));
  assert.ok(!listB.some((o) => (o as { externalKey: string }).externalKey === "ahu:isolation-a"));
});

test("POST /api/v1/engineering/ingest: scope read → 403, scope engineering → 201", S, async () => {
  const { POST } = await import("@/app/api/v1/engineering/ingest/route");

  const forbidden = await POST(
    reqOf("/api/v1/engineering/ingest", keyReadA, {
      objects: [{ objectType: "AHU", externalKey: "x" }],
    }),
  );
  assert.equal(forbidden.status, 403);

  const payload = {
    source: {
      // ENG-5 §3.3: source/revision nay định danh bằng external key (lũy đẳng khi retry).
      externalKey: "drawing:m-101:l3",
      externalRevisionKey: "drawing:m-101:l3:R01",
      sourceType: "drawing",
      title: "M-101 Tầng 3",
      revisionNo: 1,
      parserName: "cad_geometry",
    },
    objects: [
      { objectType: "AHU", discipline: "mechanical", externalKey: "ahu:ingest-a", name: "AHU-A" },
      {
        objectType: "duct",
        discipline: "mechanical",
        externalKey: "duct:ingest-a",
        name: "Ống gió A",
      },
    ],
    relations: [
      { fromObjectId: "", toObjectId: "", relationType: "serves" }, // sẽ bị 422 vì không phải UUID — kiểm nhánh lỗi objects trước
    ],
  };
  const noRelations = { ...payload, relations: [] };
  const ok = await POST(reqOf("/api/v1/engineering/ingest", keyEngA, noRelations));
  assert.equal(ok.status, 201);
  const body = (await ok.json()) as { objects: { externalKey: string; created: boolean }[] };
  assert.equal(body.objects.length, 2);
  assert.ok(body.objects.every((o) => o.created));

  const { listEngineeringObjects } = await import("@/lib/engineering-kernel");
  const list = await listEngineeringObjects(pA, { status: "pending_review" });
  assert.ok(list.some((o) => (o as { externalKey: string }).externalKey === "ahu:ingest-a"));
});

test(
  "POST /api/v1/engineering/ingest: validate objects rỗng/thiếu externalKey → 422",
  S,
  async () => {
    const { POST } = await import("@/app/api/v1/engineering/ingest/route");

    const empty = await POST(reqOf("/api/v1/engineering/ingest", keyEngA, { objects: [] }));
    assert.equal(empty.status, 422);

    const missing = await POST(
      reqOf("/api/v1/engineering/ingest", keyEngA, {
        objects: [{ objectType: "AHU" }], // thiếu externalKey
      }),
    );
    assert.equal(missing.status, 422);
    const j = (await missing.json()) as { error: string };
    assert.match(j.error, /objects\[0\]/);
  },
);
