import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// ENG-5 (C1) — hợp đồng ingest: lũy đẳng theo external key, cách ly dự án, giới hạn payload.
// Đặc tả: docs/nang-cap/ENG-5-integration-contract-pilot.md §2/§3/§4.
// Integration (cần Postgres qua TEST_DATABASE_URL, không có thì tự skip).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

let U = 0;
let pA = 0;
let pB = 0;
let keyA = "";
let keyB = "";

function ingestReq(key: string, body: unknown, idem?: string, corr?: string): NextRequest {
  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  if (idem !== undefined) headers["idempotency-key"] = idem;
  if (corr !== undefined) headers["x-correlation-id"] = corr;
  return new NextRequest("http://localhost/api/v1/engineering/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function post(key: string, body: unknown, idem = randomUUID(), corr?: string) {
  const { POST } = await import("@/app/api/v1/engineering/ingest/route");
  const res = await POST(ingestReq(key, body, idem, corr));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

// payload chuẩn §3.2 (source lồng revision + objects + relations theo external key)
function payload(suffix: string, relations = true) {
  return {
    contractVersion: "2026-08-15",
    source: {
      externalKey: `drawing:test:${suffix}`,
      sourceType: "drawing",
      title: `HVAC ${suffix}`,
      revision: {
        externalRevisionKey: `drawing:test:${suffix}:R01`,
        revisionNo: 1,
        parserName: "mepf-cad-parser",
        parserVersion: "1.4.0",
      },
    },
    objects: [
      {
        externalKey: `duct:${suffix}`,
        objectType: "component",
        discipline: "hvac",
        name: "Ống gió",
      },
      { externalKey: `ahu:${suffix}`, objectType: "component", discipline: "hvac", name: "AHU" },
    ],
    relations: relations
      ? [
          {
            fromExternalKey: `duct:${suffix}`,
            toExternalKey: `ahu:${suffix}`,
            relationType: "SERVES",
          },
        ]
      : [],
  };
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/api-keys");

  U = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('Eng5','eng5-test@x.vn','admin','x')`,
  );
  pA = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Eng5 A', 'PJT-E5A')`);
  pB = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Eng5 B', 'PJT-E5B')`);

  keyA = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('E5A', ?, ?, ?, ?)`,
    hashApiKey(keyA),
    pA,
    ["engineering"],
    U,
  );
  keyB = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('E5B', ?, ?, ?, ?)`,
    hashApiKey(keyB),
    pB,
    ["engineering"],
    U,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM engineering_ingest_requests WHERE project_id IN (?, ?)`, pA, pB);
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

test(
  "(1) ingest đầy đủ: 201, tạo source+revision+objects+relations theo external key",
  S,
  async () => {
    const r = await post(keyA, payload("t1"));
    assert.equal(r.status, 201);
    assert.equal((r.body.objects as unknown[]).length, 2);
    assert.equal((r.body.relations as unknown[]).length, 1);
    assert.ok(r.body.sourceRevisionId, "phải trả sourceRevisionId");
    assert.equal(r.body.contractVersion, "2026-08-15");
    // relation resolve được từ external key (agent không cần biết UUID nội bộ — §2.2)
    assert.equal((r.body.relations as { created: boolean }[])[0].created, true);
  },
);

test(
  "(2) retry cùng Idempotency-Key + cùng body → 200 replay, KHÔNG nhân bản dữ liệu",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const idem = randomUUID();
    const p = payload("t2");

    const first = await post(keyA, p, idem);
    assert.equal(first.status, 201);

    const countAfterFirst = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_object_relations WHERE project_id = ?`,
      pA,
    );

    const replay = await post(keyA, p, idem);
    assert.equal(replay.status, 200, "replay phải là 200, không phải 201");
    assert.deepEqual(replay.body, first.body, "replay phải trả NGUYÊN response cũ");

    const countAfterReplay = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_object_relations WHERE project_id = ?`,
      pA,
    );
    assert.equal(countAfterReplay?.n, countAfterFirst?.n, "replay không được tạo thêm relation");
  },
);

test("(3) cùng Idempotency-Key nhưng body KHÁC → 409", S, async () => {
  const idem = randomUUID();
  const a = await post(keyA, payload("t3a"), idem);
  assert.equal(a.status, 201);
  const b = await post(keyA, payload("t3b"), idem);
  assert.equal(b.status, 409);
});

test("(4) thiếu header Idempotency-Key → 422 kèm JSON Pointer", S, async () => {
  const { POST } = await import("@/app/api/v1/engineering/ingest/route");
  const res = await POST(ingestReq(keyA, payload("t4"), undefined));
  assert.equal(res.status, 422);
  const body = (await res.json()) as { pointer?: string };
  assert.equal(body.pointer, "/headers/Idempotency-Key");
});

test(
  "(5) gửi lại cùng external key bằng Idempotency-Key MỚI → không tạo source/object trùng",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const p = payload("t5");

    const r1 = await post(keyA, p, randomUUID());
    assert.equal(r1.status, 201);
    const r2 = await post(keyA, p, randomUUID()); // key idempotency khác → xử lý thật lại
    assert.equal(r2.status, 201);

    const src = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_sources WHERE project_id = ? AND external_key = ?`,
      pA,
      "drawing:test:t5",
    );
    assert.equal(src?.n, 1, "source phải lũy đẳng theo external_key");

    const obj = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_objects WHERE project_id = ? AND external_key = ?`,
      pA,
      "duct:t5",
    );
    assert.equal(obj?.n, 1, "object phải lũy đẳng theo external_key");

    const rel = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_object_relations r
       JOIN engineering_objects o ON o.id = r.from_object_id
      WHERE r.project_id = ? AND o.external_key = ?`,
      pA,
      "duct:t5",
    );
    assert.equal(rel?.n, 1, "relation phải lũy đẳng — đây là lỗ hổng ENG-5 vá");

    // revision cũng lũy đẳng theo externalRevisionKey
    assert.equal(r1.body.sourceRevisionId, r2.body.sourceRevisionId);
  },
);

test("(6) relation trỏ external key KHÔNG tồn tại → 422 kèm pointer đúng chỉ số", S, async () => {
  const p = {
    ...payload("t6", false),
    relations: [
      { fromExternalKey: "duct:t6", toExternalKey: "khong-ton-tai:xyz", relationType: "SERVES" },
    ],
  };
  const r = await post(keyA, p);
  assert.equal(r.status, 422);
  assert.equal(r.body.pointer, "/relations/0/toExternalKey");
});

test(
  "(7) CÁCH LY DỰ ÁN: relation trỏ external key của dự án khác → 422, không tạo gì",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    // dựng object "ahu:cross" ở dự án B
    const rb = await post(keyB, {
      ...payload("cross", false),
      objects: [{ externalKey: "ahu:cross", objectType: "component" }],
    });
    assert.equal(rb.status, 201);

    // dự án A cố trỏ sang key của B → phải bị từ chối (key của B "không tồn tại" trong A)
    const ra = await post(keyA, {
      ...payload("t7", false),
      objects: [{ externalKey: "duct:t7", objectType: "component" }],
      relations: [
        { fromExternalKey: "duct:t7", toExternalKey: "ahu:cross", relationType: "SERVES" },
      ],
    });
    assert.equal(ra.status, 422);
    assert.equal(ra.body.pointer, "/relations/0/toExternalKey");

    const leak = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_object_relations r
       JOIN engineering_objects o ON o.id = r.to_object_id
      WHERE o.external_key = ?`,
      "ahu:cross",
    );
    assert.equal(leak?.n, 0, "không được tạo relation chéo dự án");
  },
);

test("(8) vượt giới hạn objects/relations → 422", S, async () => {
  const many = Array.from({ length: 501 }, (_, i) => ({
    externalKey: `o:${i}`,
    objectType: "component",
  }));
  const r = await post(keyA, { objects: many });
  assert.equal(r.status, 422);
  assert.equal(r.body.pointer, "/objects");

  const rel = Array.from({ length: 2001 }, () => ({
    fromExternalKey: "a",
    toExternalKey: "b",
    relationType: "X",
  }));
  const r2 = await post(keyA, { objects: [{ externalKey: "x", objectType: "c" }], relations: rel });
  assert.equal(r2.status, 422);
  assert.equal(r2.body.pointer, "/relations");
});

test("(9) X-Correlation-Id: giữ nguyên khi client gửi, tự sinh khi thiếu", S, async () => {
  const corr = randomUUID();
  const r = await post(keyA, payload("t9a"), randomUUID(), corr);
  assert.equal(r.res.headers.get("X-Correlation-Id"), corr);
  assert.equal(r.body.correlationId, corr);

  const r2 = await post(keyA, payload("t9b"), randomUUID());
  const generated = r2.res.headers.get("X-Correlation-Id");
  assert.ok(generated && generated.length >= 36, "thiếu header thì server phải tự sinh");
});

test("(10) key sai scope không vào được ingest", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/api-keys");
  const readKey = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('E5read', ?, ?, ?, ?)`,
    hashApiKey(readKey),
    pA,
    ["read"],
    U,
  );
  const r = await post(readKey, payload("t10"));
  assert.ok(r.status === 401 || r.status === 403, `scope sai phải bị chặn, nhận ${r.status}`);
  await run(`DELETE FROM api_keys WHERE key_hash = ?`, hashApiKey(readKey));
});
