import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING "tuân thủ & tri thức"
// (Đợt 5 chiến dịch coverage — Việc W2). Route:
//   - app/api/engineering/data-quality/route.ts                    (GET vấn đề chất lượng dữ liệu)
//   - app/api/engineering/data-quality/[id]/resolve/route.ts       (POST xử lý vấn đề)
//   - app/api/engineering/esign/envelopes/route.ts                 (GET/POST hồ sơ trình ký)
//   - app/api/engineering/lineage/[id]/route.ts                    (GET phả hệ đối tượng)
//   - app/api/engineering/impact/[id]/route.ts                     (GET phân tích tác động)
//
// (compliance/**, memory/**, compliance/audit-element, digital-handover, project-health,
// taxonomy đã bị xoá 2026-09-21; route/lib smart-ipc (module `engineering-nextgen-apex`) và
// graph traversal (module `engineering-graph`) đã bị xoá 2026-09-22 — 2/6 module
// `thuNghiem: true` không ai bật, xem PROGRESS.md. `lineage`/`impact` vẫn dùng chung
// lib/ky-thuat/engineering-graph.ts với `data-quality`, GIỮ NGUYÊN. Cả 5 route
// `zero-error/**` đã bị xoá 2026-09-22 cùng module engineering-zero-error-tracker.)
//
// Lưu ý đã đọc code xác nhận (ghi trong báo cáo cuối, không lặp lại ở đây):
//   - Không route nào trong các route còn lại chạm lưu trữ file — không có ca upload ở đây.

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `EngZE route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number; name: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `engze-${uniq(ten)}@test.local`;
  const name = `EngZE ${ten}`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-engze-route', ?, ?)`,
    name,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId, name };
}

async function taoEngObj(
  projectId: number,
  userId: number,
  ten: string,
  overrides: {
    objectType?: string;
    discipline?: string;
    properties?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_objects
      (project_id, external_key, object_type, name, discipline, status, properties, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 'approved', ?::jsonb, ?, ?)
     RETURNING id`,
    projectId,
    `OBJ-${uniq(ten)}`,
    overrides.objectType ?? "equipment",
    `Đối tượng ${ten}`,
    overrides.discipline ?? "electrical",
    JSON.stringify(overrides.properties ?? {}),
    userId,
    userId,
  );
  return row!.id;
}

async function taoRelation(
  projectId: number,
  userId: number,
  fromId: string,
  toId: string,
  relationType = "CONNECTED_TO",
): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_object_relations (project_id, from_object_id, to_object_id, relation_type, created_by)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    projectId,
    fromId,
    toId,
    relationType,
    userId,
  );
  return row!.id;
}

async function batModule(moduleKey: string, projectId: number, actorId: number): Promise<void> {
  const ff = await import("@/lib/ha-tang/feature-flags");
  await ff.setFlag(moduleKey, projectId, true, actorId, 1);
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

const greq = (url: string) => new NextRequest(`http://localhost${url}`);

// ============================================================================
// GET /api/engineering/data-quality
// ============================================================================

test("GET /data-quality: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/data-quality/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /data-quality: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("dq403");
  const sub = await taoUser("subcon", "dq403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/data-quality/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /data-quality: chưa chọn dự án → trả issues rỗng (không chặn)", S, async () => {
  const pm = await taoUser("pm", "dqnoproj");
  await dangNhapDuAn(pm, null);
  const { GET } = await import("@/app/api/engineering/data-quality/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.issues, []);
});

test("GET /data-quality: hạnh phúc → phát hiện object mồ côi (orphan)", S, async () => {
  const projectId = await taoDuAn("dqok");
  const pm = await taoUser("pm", "dqok");
  await taoEngObj(projectId, pm.id, "orphan");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/data-quality/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.issues.some((i: { issueRule: string }) => i.issueRule === "orphan_object"));

  // Lọc theo severity
  const res2 = await GET(greq("/x?severity=medium"));
  const data2 = await res2.json();
  assert.ok(data2.issues.every((i: { severity: string }) => i.severity === "medium"));
});

// ============================================================================
// POST /api/engineering/data-quality/[id]/resolve
// ============================================================================

test("POST /data-quality/:id/resolve: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/data-quality/[id]/resolve/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST /data-quality/:id/resolve: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("dqr403");
  const sub = await taoUser("subcon", "dqr403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/data-quality/[id]/resolve/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("POST /data-quality/:id/resolve: thiếu ghi chú → 400", S, async () => {
  const projectId = await taoDuAn("dqrmiss");
  const eng = await taoUser("engineer", "dqrmiss");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/data-quality/[id]/resolve/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 400);
});

test(
  "POST /data-quality/:id/resolve: vấn đề thuộc dự án khác → 404, dữ liệu dự án B không đổi",
  S,
  async () => {
    const projA = await taoDuAn("dqrA");
    const projB = await taoDuAn("dqrB");
    const eng = await taoUser("engineer", "dqr404");
    const { insertId, queryOne } = await import("@/lib/db");
    const issueId = await (async () => {
      const row = await queryOne<{ id: string }>(
        `INSERT INTO engineering_data_quality_issues (project_id, entity_type, entity_id, issue_rule, severity, description)
       VALUES (?, 'object', 'e1', 'orphan_object', 'medium', 'x') RETURNING id`,
        projB,
      );
      return row!.id;
    })();
    await dangNhapDuAn(eng, projA);
    const { POST } = await import("@/app/api/engineering/data-quality/[id]/resolve/route");
    const res = await POST(jreq("/x", { note: "đã xử lý" }), {
      params: Promise.resolve({ id: issueId }),
    });
    assert.equal(res.status, 404);

    const check = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_data_quality_issues WHERE id = ?`,
      issueId,
    );
    assert.equal(check!.status, "open");
    void insertId;
  },
);

test("POST /data-quality/:id/resolve: hạnh phúc → chuyển resolved", S, async () => {
  const projectId = await taoDuAn("dqrok");
  const eng = await taoUser("engineer", "dqrok");
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_data_quality_issues (project_id, entity_type, entity_id, issue_rule, severity, description)
     VALUES (?, 'object', 'e1', 'orphan_object', 'medium', 'x') RETURNING id`,
    projectId,
  );
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/data-quality/[id]/resolve/route");
  const res = await POST(jreq("/x", { note: "đã xử lý xong" }), {
    params: Promise.resolve({ id: row!.id }),
  });
  assert.equal(res.status, 200);
  const check = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_data_quality_issues WHERE id = ?`,
    row!.id,
  );
  assert.equal(check!.status, "resolved");
});

// ============================================================================
// GET/POST /api/engineering/esign/envelopes
// ============================================================================

test("GET /esign/envelopes: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/esign/envelopes/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /esign/envelopes: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ee403");
  const sub = await taoUser("subcon", "ee403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/esign/envelopes/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST /esign/envelopes: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("eemiss");
  const eng = await taoUser("engineer", "eemiss");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/esign/envelopes/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

test(
  "POST /esign/envelopes: chỉ định dự án không được phép truy cập → 403 (chặn IDOR)",
  S,
  async () => {
    const projA = await taoDuAn("eeA");
    const projB = await taoDuAn("eeB");
    const eng = await taoUser("engineer", "eeIDOR");
    await dangNhapDuAn(eng, projA);
    const { POST } = await import("@/app/api/engineering/esign/envelopes/route");
    const res = await POST(
      jreq("/x", {
        projectId: projB,
        title: "BBNT test",
        documentType: "BBNT",
        documentPayload: { a: 1 },
        signatories: [{ signerName: "A", signerRole: "CONTRACTOR_ENGINEER" }],
      }),
    );
    assert.equal(res.status, 403);
  },
);

test(
  "POST /esign/envelopes + GET: hạnh phúc → tạo hồ sơ trình ký, thấy lại trong danh sách",
  S,
  async () => {
    const projectId = await taoDuAn("eeok");
    const eng = await taoUser("engineer", "eeok");
    await dangNhapDuAn(eng, projectId);
    const title = uniq("BBNT-Test");
    const { POST } = await import("@/app/api/engineering/esign/envelopes/route");
    const res = await POST(
      jreq("/x", {
        title,
        documentType: "BBNT",
        documentPayload: { note: "test" },
        signatories: [
          { signerName: "KS Nhà thầu", signerRole: "CONTRACTOR_ENGINEER" },
          { signerName: "TVGS", signerRole: "SUPERVISION_CONSULTANT" },
          { signerName: "CĐT", signerRole: "CLIENT_REP" },
        ],
      }),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.title, title);
    assert.equal(data.data.signatories.length, 3);

    const { GET } = await import("@/app/api/engineering/esign/envelopes/route");
    const res2 = await GET();
    const data2 = await res2.json();
    assert.ok(data2.data.some((e: { title: string }) => e.title === title));
  },
);

// ============================================================================
// GET /api/engineering/lineage/[id]
// ============================================================================

test("GET /lineage/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/lineage/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /lineage/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("li403");
  const sub = await taoUser("subcon", "li403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/lineage/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /lineage/:id: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "linoproj");
  await dangNhapDuAn(pm, null);
  const { GET } = await import("@/app/api/engineering/lineage/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 400);
});

test("GET /lineage/:id: đối tượng thuộc dự án khác → 404", S, async () => {
  const projA = await taoDuAn("liA");
  const projB = await taoDuAn("liB");
  const pm = await taoUser("pm", "li404");
  const objB = await taoEngObj(projB, pm.id, "liB");
  await dangNhapDuAn(pm, projA);
  const { GET } = await import("@/app/api/engineering/lineage/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: objB }) });
  assert.equal(res.status, 404);
});

test("GET /lineage/:id: hạnh phúc → phả hệ đầy đủ, có quan hệ outgoing", S, async () => {
  const projectId = await taoDuAn("liok");
  const pm = await taoUser("pm", "liok");
  const a = await taoEngObj(projectId, pm.id, "liA");
  const b = await taoEngObj(projectId, pm.id, "liB");
  await taoRelation(projectId, pm.id, a, b, "SERVES");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/lineage/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: a }) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.object.id, a);
  assert.equal(data.relations.outgoing.length, 1);
  assert.equal(data.relations.outgoing[0].target.id, b);
});

// ============================================================================
// GET /api/engineering/impact/[id]
// ============================================================================

test("GET /impact/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/impact/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /impact/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("im403");
  const sub = await taoUser("subcon", "im403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/impact/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /impact/:id: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "imnoproj");
  await dangNhapDuAn(pm, null);
  const { GET } = await import("@/app/api/engineering/impact/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 400);
});

test("GET /impact/:id: đối tượng không tồn tại trong dự án → 404", S, async () => {
  const projectId = await taoDuAn("imnf");
  const pm = await taoUser("pm", "imnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/impact/[id]/route");
  const res = await GET(greq("/x"), {
    params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /impact/:id: hạnh phúc → đếm đúng upstream/downstream, cảnh báo khi ảnh hưởng không gian",
  S,
  async () => {
    const projectId = await taoDuAn("imok");
    const pm = await taoUser("pm", "imok");
    const upstream = await taoEngObj(projectId, pm.id, "imUp");
    const target = await taoEngObj(projectId, pm.id, "imTarget");
    const space = await taoEngObj(projectId, pm.id, "imSpace", { objectType: "space" });
    await taoRelation(projectId, pm.id, upstream, target, "FEEDS");
    await taoRelation(projectId, pm.id, target, space, "SERVES");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/impact/[id]/route");
    const res = await GET(greq("/x"), { params: Promise.resolve({ id: target }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.targetObject.id, target);
    assert.equal(data.upstreamCount, 1);
    assert.equal(data.downstreamCount, 1);
    assert.ok(data.criticalPathAlerts.some((a: string) => a.includes("không gian")));
  },
);
