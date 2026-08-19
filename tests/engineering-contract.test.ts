import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// ENG-5 §5 — Hợp đồng ingest: OpenAPI máy-đọc-được + fixture có version.
//
// Hai việc file này làm:
//   1. CHỐNG DRIFT (§5.2): đối chiếu docs/api/engineering-ingest.openapi.json với nguồn sự
//      thật thật sự trong code (enum Zod + hằng số giới hạn ở lib/engineering-ingest.ts).
//      Đặc tả gợi ý "sinh Zod và OpenAPI từ một nguồn type chung" — làm vậy phải thêm
//      dependency sinh mã. Ở đây đạt ĐÚNG MỤC TIÊU đó (không lệch) bằng test đối chiếu,
//      không thêm gói mới: sửa một bên mà quên bên kia là CI đỏ ngay.
//   2. CHẠY FIXTURE (§5.3): nạp tests/fixtures/engineering-ingest/*.json qua route THẬT.
//      Cùng bộ fixture đó copy sang repo MEPF-Agents làm consumer-contract test (§5.4).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ClaimLike } from "@/lib/engineering-agents";

const S = { skip: !HAS_TEST_DB };
const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "engineering-ingest");
const OPENAPI_PATH = join(process.cwd(), "docs", "api", "engineering-ingest.openapi.json");

type OpenApiDoc = {
  info: { version: string };
  components: {
    schemas: {
      IngestRequest: {
        properties: {
          objects: { minItems: number; maxItems: number };
          relations: { maxItems: number };
        };
      };
      Source: { properties: { sourceType: { enum: string[] } } };
    };
  };
};

function openapi(): OpenApiDoc {
  return JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiDoc;
}

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Record<string, unknown>;
}

let U = 0;
let pA = 0;
let pB = 0;
let keyA = "";
let keyB = "";

function reqOf(key: string, body: unknown, idem?: string): NextRequest {
  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  if (idem !== undefined) headers["idempotency-key"] = idem;
  return new NextRequest("http://localhost/api/v1/engineering/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function post(key: string, body: unknown, idem?: string) {
  const { POST } = await import("@/app/api/v1/engineering/ingest/route");
  const res = await POST(reqOf(key, body, idem));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/api-keys");
  U = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('Contract','contract-test@x.vn','admin','x')`,
  );
  pA = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Contract A', 'PJT-CTA')`);
  pB = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Contract B', 'PJT-CTB')`);
  keyA = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('CtA', ?, ?, ?, ?)`,
    hashApiKey(keyA),
    pA,
    ["engineering"],
    U,
  );
  keyB = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('CtB', ?, ?, ?, ?)`,
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
});

// ---------------------------------------------------------------------------------------
// 1. Chống drift OpenAPI ↔ code (thuần, không cần DB)
// ---------------------------------------------------------------------------------------

test("OpenAPI: giới hạn objects/relations khớp hằng số route thật", async () => {
  const { MAX_OBJECTS, MAX_RELATIONS } = await import("@/lib/engineering-ingest");
  const doc = openapi();
  const p = doc.components.schemas.IngestRequest.properties;
  assert.equal(
    p.objects.maxItems,
    MAX_OBJECTS,
    "maxItems objects trong OpenAPI phải khớp MAX_OBJECTS",
  );
  assert.equal(p.relations.maxItems, MAX_RELATIONS, "maxItems relations phải khớp MAX_RELATIONS");
  assert.equal(p.objects.minItems, 1, "objects rỗng bị route từ chối nên minItems phải là 1");
});

test("OpenAPI: enum sourceType khớp schema Zod (nguồn sự thật)", async () => {
  const { engineeringSourceInputSchema } = await import("@/lib/engineering-kernel");
  const shape = engineeringSourceInputSchema.shape as unknown as {
    sourceType: { options: readonly string[] };
  };
  const fromZod = [...shape.sourceType.options].sort();
  const fromDoc = [...openapi().components.schemas.Source.properties.sourceType.enum].sort();
  assert.deepEqual(fromDoc, fromZod, "enum sourceType lệch giữa OpenAPI và Zod");
});

test("Fixture: mọi file pin cùng contractVersion với OpenAPI", () => {
  const version = openapi().info.version;
  for (const f of [
    "01-happy-path.json",
    "02-retry-same-key-same-body.json",
    "03-conflict-same-key-different-body.json",
    "04-missing-idempotency-key.json",
    "05-relation-unknown-key.json",
    "06-relation-cross-project.json",
    "07-limits-exceeded.json",
  ]) {
    assert.equal(fixture(f).contractVersion, version, `${f} pin sai contractVersion`);
  }
});

// ---------------------------------------------------------------------------------------
// 2. Chạy fixture qua route thật
// ---------------------------------------------------------------------------------------

test("Fixture 01 + 02 + 03: happy path → replay 200 → xung đột 409", S, async () => {
  const fx1 = fixture("01-happy-path.json");
  const idem = randomUUID();

  const r1 = await post(keyA, fx1.request, idem);
  const e1 = fx1.expect as Record<string, number | boolean>;
  assert.equal(r1.status, e1.status);
  assert.equal((r1.body.objects as unknown[]).length, e1.objectCount);
  assert.equal((r1.body.relations as unknown[]).length, e1.relationCount);
  assert.ok(r1.body.sourceRevisionId, "phải trả sourceRevisionId");

  // 02 — cùng key, cùng body → replay nguyên response
  const r2 = await post(keyA, fx1.request, idem);
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.body, r1.body, "replay phải trả NGUYÊN response cũ");

  // 03 — cùng key, body khác → 409
  const fx3 = fixture("03-conflict-same-key-different-body.json");
  const r3 = await post(keyA, fx3.request, idem);
  assert.equal(r3.status, (fx3.expect as { status: number }).status);
  assert.equal(r3.body.pointer, (fx3.expect as { pointer: string }).pointer);
});

test("Fixture 04: thiếu Idempotency-Key → 422 đúng pointer", S, async () => {
  const fx = fixture("04-missing-idempotency-key.json");
  const { POST } = await import("@/app/api/v1/engineering/ingest/route");
  const res = await POST(reqOf(keyA, fx.request, undefined));
  const body = (await res.json()) as { pointer?: string };
  assert.equal(res.status, (fx.expect as { status: number }).status);
  assert.equal(body.pointer, (fx.expect as { pointer: string }).pointer);
});

test("Fixture 05: relation trỏ key không tồn tại → 422 đúng pointer", S, async () => {
  const fx = fixture("05-relation-unknown-key.json");
  const r = await post(keyA, fx.request, randomUUID());
  assert.equal(r.status, (fx.expect as { status: number }).status);
  assert.equal(r.body.pointer, (fx.expect as { pointer: string }).pointer);
});

test("Fixture 06: CÁCH LY DỰ ÁN — relation trỏ key dự án khác → 422, không tạo gì", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const fx = fixture("06-relation-cross-project.json");

  // dựng object "ahu:fx:cross" ở DỰ ÁN KHÁC (key B)
  const setup = fx.setupInOtherProject as { objects: unknown[] };
  const rb = await post(keyB, { contractVersion: fx.contractVersion, ...setup }, randomUUID());
  assert.equal(rb.status, 201);

  const ra = await post(keyA, fx.request, randomUUID());
  assert.equal(ra.status, (fx.expect as { status: number }).status);
  assert.equal(ra.body.pointer, (fx.expect as { pointer: string }).pointer);

  const leak = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM engineering_object_relations r
       JOIN engineering_objects o ON o.id = r.to_object_id
      WHERE o.external_key = ?`,
    "ahu:fx:cross",
  );
  assert.equal(leak?.n, 0, "không được tạo relation chéo dự án");
});

test("Fixture 07: vượt giới hạn objects → 422", S, async () => {
  const { MAX_OBJECTS } = await import("@/lib/engineering-ingest");
  const fx = fixture("07-limits-exceeded.json");
  const n = (fx.generate as { objects: number }).objects;
  assert.equal(n, MAX_OBJECTS + 1, "fixture phải vượt đúng 1 phần tử so với giới hạn thật");
  const objects = Array.from({ length: n }, (_, i) => ({
    externalKey: `gen:${i}`,
    objectType: "component",
  }));
  const r = await post(keyA, { contractVersion: fx.contractVersion, objects }, randomUUID());
  assert.equal(r.status, (fx.expect as { status: number }).status);
  assert.equal(r.body.pointer, (fx.expect as { pointer: string }).pointer);
});

test("Fixture 08: Agent claims conflict — phân loại và phân xử theo authority (C2 §5.7)", async () => {
  const { detectConflicts, classifyConflict, proposeResolution } =
    await import("@/lib/engineering-agents");
  const fx = fixture("08-agent-claims-conflict.json") as {
    request: { topic: string; claims: Array<Partial<ClaimLike>> };
    expect: {
      hasConflict: boolean;
      conflictType: string;
      winningAuthority: string;
      majorityVoteApplied: boolean;
      selectedClaimIndex: number;
      humanResolutionRequired: boolean;
    };
  };

  const claims: ClaimLike[] = fx.request.claims.map((c, i) => ({
    id: `claim-${i}`,
    agentRole: c.agentRole ?? "specialist",
    topic: fx.request.topic,
    claim: c.claim ?? "",
    assumptions: c.assumptions ?? [],
    confidence: c.confidence ?? "medium",
    sourceAuthority: c.sourceAuthority ?? "derived",
    sourceRevisionId: c.sourceRevisionId ?? null,
    payload: c.payload ?? {},
  }));

  const conflicts = detectConflicts(claims);
  assert.equal(conflicts.length > 0, fx.expect.hasConflict);

  const conflictType = classifyConflict(claims);
  assert.equal(conflictType, fx.expect.conflictType);

  const resolution = proposeResolution("data", claims);
  assert.equal(resolution.winnerClaimId, claims[fx.expect.selectedClaimIndex].id);
  assert.equal(resolution.method, "source_authority");
  assert.equal(resolution.needsHuman, fx.expect.humanResolutionRequired);
});
