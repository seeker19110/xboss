import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING "zero-error, tuân thủ & tri thức"
// (Đợt 5 chiến dịch coverage — Việc W2). Route:
//   - app/api/engineering/zero-error/challenge/route.ts           (GET/POST mã thử thách động)
//   - app/api/engineering/zero-error/issue-certificate/route.ts   (POST cấp chứng chỉ kiểm toán)
//   - app/api/engineering/zero-error/pour-permits/route.ts        (GET lệnh đổ bê tông)
//   - app/api/engineering/zero-error/reconcile-quad/route.ts      (POST đối soát định lượng 4 chiều)
//   - app/api/engineering/zero-error/verify-photo/route.ts        (POST xác thực ảnh hiện trường)
//   - app/api/engineering/compliance/rules/route.ts                (GET danh mục quy chuẩn)
//   - app/api/engineering/compliance/audits/route.ts               (GET biên bản kiểm định)
//   - app/api/engineering/compliance/audit-element/route.ts        (POST đối soát 1 đối tượng)
//   - app/api/engineering/compliance/scan-all/route.ts             (POST quét toàn bộ đối tượng)
//   - app/api/engineering/data-quality/route.ts                    (GET vấn đề chất lượng dữ liệu)
//   - app/api/engineering/data-quality/[id]/resolve/route.ts       (POST xử lý vấn đề)
//   - app/api/engineering/memory/lessons/route.ts                  (GET/POST bài học kinh nghiệm)
//   - app/api/engineering/memory/patterns/route.ts                 (GET/POST mẫu quy luật tri thức)
//   - app/api/engineering/memory/transfer/route.ts                 (POST chuyển giao tri thức)
//   - app/api/engineering/esign/envelopes/route.ts                 (GET/POST hồ sơ trình ký)
//   - app/api/engineering/digital-handover/route.ts                (GET/POST passport bàn giao số)
//   - app/api/engineering/smart-ipc/route.ts                       (GET/POST Smart IPC 4 cổng)
//   - app/api/engineering/project-health/route.ts                  (GET/POST chỉ số sức khỏe dự án)
//   - app/api/engineering/graph/route.ts                           (GET đồ thị quan hệ kỹ thuật)
//   - app/api/engineering/taxonomy/route.ts                        (GET danh mục taxonomy)
//   - app/api/engineering/lineage/[id]/route.ts                    (GET phả hệ đối tượng)
//   - app/api/engineering/impact/[id]/route.ts                     (GET phân tích tác động)
//
// Lưu ý đã đọc code xác nhận (ghi trong báo cáo cuối, không lặp lại ở đây):
//   - `smart-ipc`/`graph` nằm sau `assertModuleEnabled` với module `engineering-nextgen-apex`/
//     `engineering-graph` — cả hai `thuNghiem: true` nên MẶC ĐỊNH TẮT cho mọi dự án; test phải
//     `setFlag` bật trước khi kiểm nhánh 200, và có ca riêng kiểm 404 khi CHƯA bật (mặc định).
//   - `smart-ipc` Gate 1 (Scan-to-BIM) LUÔN `available: false` với dữ liệu mới (không còn ai ghi
//     `engineering_scan_to_bim_runs`) — test phản ánh đúng hành vi đó, KHÔNG cố làm nó pass.
//   - Không route nào trong 22 route này chạm lưu trữ file (đọc lib nền `engineering-zero-error-
//     tracker.ts` xác nhận: challenge/issue-certificate/reconcile-quad/verify-photo chỉ nhận JSON
//     body, không multipart/File) — không có ca upload trong file này.

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
// GET/POST /api/engineering/zero-error/challenge
// ============================================================================

test("GET /zero-error/challenge: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /zero-error/challenge: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("chal403");
  const sub = await taoUser("subcon", "chal403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /zero-error/challenge: chưa chọn dự án → 400", S, async () => {
  // Dùng role KHÔNG PHẢI admin: admin luôn "thấy" mọi dự án (visibleProjectIds trả toàn bộ
  // bảng projects), nên getCurrentProjectId của admin không bao giờ null. Vai trò thường không
  // được gán vào dự án nào (dangNhapDuAn(_, null) không ghi user_projects) mới rơi vào nhánh
  // "chưa chọn dự án" thật sự.
  const pm = await taoUser("pm", "chalnoproj");
  await dangNhapDuAn(pm, null);
  const { GET } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res = await GET();
  assert.equal(res.status, 400);
});

test("GET /zero-error/challenge: hạnh phúc → sinh mã #XB- hợp lệ", S, async () => {
  const projectId = await taoDuAn("chalok");
  const eng = await taoUser("engineer", "chalok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.projectId, projectId);
  assert.ok(String(data.challenge.challengeCode).startsWith("#XB-"));

  // POST verify với đúng mã vừa sinh → isValid true
  const { POST } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res2 = await POST(jreq("/x", { code: data.challenge.challengeCode }));
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.isValid, true);
});

test("POST /zero-error/challenge: thiếu mã → 400", S, async () => {
  const projectId = await taoDuAn("chalmiss");
  const eng = await taoUser("engineer", "chalmiss");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res = await POST(jreq("/x", { code: "" }));
  assert.equal(res.status, 400);
});

test("POST /zero-error/challenge: mã sai/hết hạn → isValid false", S, async () => {
  const projectId = await taoDuAn("chalbad");
  const eng = await taoUser("engineer", "chalbad");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/challenge/route");
  const res = await POST(jreq("/x", { code: "#XB-0000" }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.isValid, false);
});

// ============================================================================
// POST /api/engineering/zero-error/issue-certificate
// ============================================================================

test("POST /zero-error/issue-certificate: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/zero-error/issue-certificate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /zero-error/issue-certificate: engineer đủ quyền, subcon không → 403", S, async () => {
  const projectId = await taoDuAn("cert403");
  const sub = await taoUser("subcon", "cert403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/issue-certificate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /zero-error/issue-certificate: hạnh phúc → chứng chỉ Merkle bất biến", S, async () => {
  const projectId = await taoDuAn("certok");
  const eng = await taoUser("engineer", "certok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/issue-certificate/route");
  const res = await POST(
    jreq("/x", { zone: "Zone Test", taskIds: ["T-1"], reconciledQty: "50" }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.certificate.certificateNumber.startsWith("CERT-ZE-"));
  assert.ok(data.certificate.merkleLeafHash.length > 0);
});

// ============================================================================
// GET /api/engineering/zero-error/pour-permits
// ============================================================================

test("GET /zero-error/pour-permits: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/zero-error/pour-permits/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /zero-error/pour-permits: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("pour403");
  const sub = await taoUser("subcon", "pour403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/zero-error/pour-permits/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /zero-error/pour-permits: hạnh phúc → PERMIT_ACTIVE (dữ liệu mẫu đã đạt)", S, async () => {
  const projectId = await taoDuAn("pourok");
  const eng = await taoUser("engineer", "pourok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/engineering/zero-error/pour-permits/route");
  const res = await GET(greq("/x?zone=Zone Test"));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.zone, "Zone Test");
  assert.equal(data.circuitBreaker.status, "PERMIT_ACTIVE");
  assert.equal(data.summary.permitReady, true);
});

// ============================================================================
// POST /api/engineering/zero-error/reconcile-quad
// ============================================================================

test("POST /zero-error/reconcile-quad: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/zero-error/reconcile-quad/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /zero-error/reconcile-quad: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("rec403");
  const sub = await taoUser("subcon", "rec403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/reconcile-quad/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /zero-error/reconcile-quad: vượt khối lượng thiết kế BIM → REJECTED", S, async () => {
  const projectId = await taoDuAn("recreject");
  const eng = await taoUser("engineer", "recreject");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/reconcile-quad/route");
  const res = await POST(
    jreq("/x", {
      reportedQty: 150,
      bimDesignQty: 100,
      boqApprovedQty: 200,
      warehouseReceivedQty: 300,
      warehouseUsedQty: 0,
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "REJECTED_QUANTITY_BREACH");
  assert.equal(data.reconciliation.allowed, false);
});

test("POST /zero-error/reconcile-quad: trong hạn mức → APPROVED", S, async () => {
  const projectId = await taoDuAn("recapprove");
  const eng = await taoUser("engineer", "recapprove");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/reconcile-quad/route");
  const res = await POST(
    jreq("/x", {
      reportedQty: 50,
      bimDesignQty: 100,
      boqApprovedQty: 200,
      warehouseReceivedQty: 300,
      warehouseUsedQty: 0,
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "APPROVED_QUANTITY");
  assert.equal(data.reconciliation.allowed, true);
});

// ============================================================================
// POST /api/engineering/zero-error/verify-photo
// ============================================================================

test("POST /zero-error/verify-photo: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/zero-error/verify-photo/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /zero-error/verify-photo: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("vp403");
  const sub = await taoUser("subcon", "vp403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/verify-photo/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /zero-error/verify-photo: mock GPS → từ chối, yêu cầu kiểm tra thực địa", S, async () => {
  const projectId = await taoDuAn("vpmock");
  const eng = await taoUser("engineer", "vpmock");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/zero-error/verify-photo/route");
  const res = await POST(
    jreq("/x", {
      challengeCode: "#XB-0000",
      lat: 10.7769,
      lon: 106.7009,
      isMockLocation: true,
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.recommendedAction, "REQUIRE_PHYSICAL_INSPECTION");
  assert.equal(data.checks.geofence.reason, "MOCK_GPS_DETECTED");
});

test("POST /zero-error/verify-photo: hạnh phúc → mã hợp lệ + GPS đúng + AI tin cậy cao → APPROVE_STAGE", S, async () => {
  const projectId = await taoDuAn("vpok");
  const eng = await taoUser("engineer", "vpok");
  await dangNhapDuAn(eng, projectId);
  const { GET: challengeGET } = await import(
    "@/app/api/engineering/zero-error/challenge/route"
  );
  const chalRes = await challengeGET();
  const chal = (await chalRes.json()).challenge.challengeCode;

  const { POST } = await import("@/app/api/engineering/zero-error/verify-photo/route");
  const res = await POST(
    jreq("/x", {
      challengeCode: chal,
      lat: 10.7769,
      lon: 106.7009,
      isMockLocation: false,
      rawConfidence: 0.98,
      bimMatchedPercent: 99,
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.recommendedAction, "APPROVE_STAGE");
});

// ============================================================================
// GET /api/engineering/compliance/rules
// ============================================================================

test("GET /compliance/rules: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/compliance/rules/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /compliance/rules: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("rules403");
  const sub = await taoUser("subcon", "rules403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/compliance/rules/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /compliance/rules: hạnh phúc → danh mục quy chuẩn đã seed", S, async () => {
  const projectId = await taoDuAn("rulesok");
  const viewer = await taoUser("viewer", "rulesok");
  await dangNhapDuAn(viewer, projectId);
  const { GET } = await import("@/app/api/engineering/compliance/rules/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.some((r: { standard_code: string }) => r.standard_code === "TCVN 9385:2012"));
});

// ============================================================================
// GET /api/engineering/compliance/audits
// ============================================================================

test("GET /compliance/audits: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/compliance/audits/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /compliance/audits: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("aud403");
  const sub = await taoUser("subcon", "aud403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/compliance/audits/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /compliance/audits: chưa chọn dự án → 400", S, async () => {
  const cdt = await taoUser("cdt", "audnoproj");
  await dangNhapDuAn(cdt, null);
  const { GET } = await import("@/app/api/engineering/compliance/audits/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 400);
});

test("GET /compliance/audits: hạnh phúc → chỉ thấy audit của đúng dự án", S, async () => {
  const projA = await taoDuAn("audA");
  const projB = await taoDuAn("audB");
  const eng = await taoUser("engineer", "audok");
  const objA = await taoEngObj(projA, eng.id, "A", {
    discipline: "electrical",
    properties: { grounding_resistance_ohm: 15 },
  });
  const objB = await taoEngObj(projB, eng.id, "B", {
    discipline: "electrical",
    properties: { grounding_resistance_ohm: 15 },
  });
  const { queryOne } = await import("@/lib/db");
  const rule = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_compliance_rules WHERE standard_code = 'TCVN 9385:2012'`,
  );

  await dangNhapDuAn(eng, projA);
  const { POST: auditElementPOST } = await import(
    "@/app/api/engineering/compliance/audit-element/route"
  );
  await auditElementPOST(jreq("/x", { objectId: objA, ruleId: rule!.id }));
  // ghi 1 bản ghi cho dự án B trực tiếp qua DB để kiểm cách ly
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO engineering_compliance_audits (project_id, object_id, rule_id, compliance_status, finding_details, evidence_snapshot)
     VALUES (?, ?, ?, 'non_compliant', 'x', '{}'::jsonb)`,
    projB,
    objB,
    rule!.id,
  );

  const { GET } = await import("@/app/api/engineering/compliance/audits/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.every((a: { object_id: string }) => a.object_id !== objB));
  assert.ok(data.some((a: { object_id: string }) => a.object_id === objA));
});

// ============================================================================
// POST /api/engineering/compliance/audit-element
// ============================================================================

test("POST /compliance/audit-element: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/compliance/audit-element/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /compliance/audit-element: bch (chỉ xem) không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ae403");
  const bch = await taoUser("bch", "ae403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/engineering/compliance/audit-element/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /compliance/audit-element: thiếu objectId/ruleId → 400", S, async () => {
  const projectId = await taoDuAn("aemiss");
  const eng = await taoUser("engineer", "aemiss");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/compliance/audit-element/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test("POST /compliance/audit-element: đối tượng thuộc dự án khác → 404 (đã vá, trước đây 500)", S, async () => {
  const projA = await taoDuAn("aeA");
  const projB = await taoDuAn("aeB");
  const eng = await taoUser("engineer", "ae404");
  const objB = await taoEngObj(projB, eng.id, "aeB");
  const { queryOne } = await import("@/lib/db");
  const rule = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_compliance_rules WHERE standard_code = 'TCVN 9385:2012'`,
  );
  await dangNhapDuAn(eng, projA);
  const { POST } = await import("@/app/api/engineering/compliance/audit-element/route");
  const res = await POST(jreq("/x", { objectId: objB, ruleId: rule!.id }));
  assert.equal(res.status, 404);

  // Dữ liệu dự án B không đổi: không có audit nào được tạo cho objB
  const count = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM engineering_compliance_audits WHERE object_id = ?`,
    objB,
  );
  assert.equal(Number(count!.n), 0);
});

test("POST /compliance/audit-element: hạnh phúc → non_compliant khi vi phạm điện trở nối đất", S, async () => {
  const projectId = await taoDuAn("aeok");
  const eng = await taoUser("engineer", "aeok");
  const obj = await taoEngObj(projectId, eng.id, "aeok", {
    discipline: "electrical",
    properties: { grounding_resistance_ohm: 20 },
  });
  const { queryOne } = await import("@/lib/db");
  const rule = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_compliance_rules WHERE standard_code = 'TCVN 9385:2012'`,
  );
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/compliance/audit-element/route");
  const res = await POST(jreq("/x", { objectId: obj, ruleId: rule!.id }));
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.audit.compliance_status, "non_compliant");
});

// ============================================================================
// POST /api/engineering/compliance/scan-all
// ============================================================================

test("POST /compliance/scan-all: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/compliance/scan-all/route");
  const res = await POST();
  assert.equal(res.status, 401);
});

test("POST /compliance/scan-all: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("sa403");
  const sub = await taoUser("subcon", "sa403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/compliance/scan-all/route");
  const res = await POST();
  assert.equal(res.status, 403);
});

test("POST /compliance/scan-all: hạnh phúc → quét đúng đối tượng của dự án, sinh audit", S, async () => {
  const projectId = await taoDuAn("saok");
  const eng = await taoUser("engineer", "saok");
  await taoEngObj(projectId, eng.id, "sa1", {
    discipline: "electrical",
    properties: { grounding_resistance_ohm: 20 },
  });
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/compliance/scan-all/route");
  const res = await POST();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.totalObjects, 1);
  assert.ok(data.createdAudits >= 1);
  assert.ok(data.nonCompliantCount >= 1);
});

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

test("POST /data-quality/:id/resolve: vấn đề thuộc dự án khác → 404, dữ liệu dự án B không đổi", S, async () => {
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
});

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
// GET/POST /api/engineering/memory/lessons
// ============================================================================

test("GET /memory/lessons: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/memory/lessons/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /memory/lessons: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ml403");
  const sub = await taoUser("subcon", "ml403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/memory/lessons/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("POST /memory/lessons: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("mlmiss");
  const pm = await taoUser("pm", "mlmiss");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/memory/lessons/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

test("POST /memory/lessons: bch (chỉ xem) không có quyền ghi → 403", S, async () => {
  const projectId = await taoDuAn("ml403b");
  const bch = await taoUser("bch", "ml403b");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/engineering/memory/lessons/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /memory/lessons + GET: hạnh phúc → tạo bài học, lọc theo workPackageCode", S, async () => {
  const projectId = await taoDuAn("mlok");
  const pm = await taoUser("pm", "mlok");
  await dangNhapDuAn(pm, projectId);
  const wp = uniq("WP-ML");
  const { POST } = await import("@/app/api/engineering/memory/lessons/route");
  const res = await POST(
    jreq("/x", {
      sourceProjectId: projectId,
      workPackageCode: wp,
      observedProblem: "Rò rỉ mối nối ống nước",
      rootCause: "Không đủ áp lực thử",
      prescribedPreventativeAction: "Tăng thời gian giữ áp thử",
    }),
  );
  assert.equal(res.status, 201);

  const { GET } = await import("@/app/api/engineering/memory/lessons/route");
  const res2 = await GET(greq(`/x?workPackageCode=${wp}`));
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.length, 1);
  assert.equal(data2[0].work_package_code, wp);
});

// ============================================================================
// GET/POST /api/engineering/memory/patterns
// ============================================================================

test("GET /memory/patterns: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/memory/patterns/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /memory/patterns: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("mp403");
  const sub = await taoUser("subcon", "mp403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/memory/patterns/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("POST /memory/patterns: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("mpmiss");
  const pm = await taoUser("pm", "mpmiss");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/memory/patterns/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

test("POST /memory/patterns: bch (chỉ xem) không có quyền ghi → 403", S, async () => {
  const projectId = await taoDuAn("mp403b");
  const bch = await taoUser("bch", "mp403b");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/engineering/memory/patterns/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /memory/patterns: patternType không thuộc danh mục hợp lệ → 500 (CHECK constraint DB)", S, async () => {
  const projectId = await taoDuAn("mpbad");
  const pm = await taoUser("pm", "mpbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/memory/patterns/route");
  const res = await POST(
    jreq("/x", {
      patternType: "khong_ton_tai",
      category: uniq("bad"),
      patternMetrics: { x: 1 },
      lessonLearned: "x",
    }),
  );
  assert.equal(res.status, 500);
});

test("POST /memory/patterns + GET: hạnh phúc → đăng ký mẫu tri thức, lọc theo type", S, async () => {
  const projectId = await taoDuAn("mpok");
  const pm = await taoUser("pm", "mpok");
  await dangNhapDuAn(pm, projectId);
  const category = uniq("HVAC-Duct");
  const { POST } = await import("@/app/api/engineering/memory/patterns/route");
  const res = await POST(
    jreq("/x", {
      patternType: "material_waste_rate",
      category,
      patternMetrics: { wastePercent: 5.2 },
      confidenceScore: 0.9,
      lessonLearned: "Cắt ống dư gây hao hụt vượt định mức",
    }),
  );
  assert.equal(res.status, 201);

  const { GET } = await import("@/app/api/engineering/memory/patterns/route");
  const res2 = await GET(greq("/x?type=material_waste_rate"));
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.ok(data2.some((p: { category: string }) => p.category === category));
});

// ============================================================================
// POST /api/engineering/memory/transfer
// ============================================================================

test("POST /memory/transfer: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/memory/transfer/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /memory/transfer: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("mt403");
  const sub = await taoUser("subcon", "mt403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/memory/transfer/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /memory/transfer: thiếu category → 422", S, async () => {
  const projectId = await taoDuAn("mtmiss");
  const eng = await taoUser("engineer", "mtmiss");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/memory/transfer/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

test("POST /memory/transfer: hạnh phúc → khớp mẫu tri thức đã đăng ký, gợi ý điều chỉnh", S, async () => {
  const projectId = await taoDuAn("mtok");
  const pm = await taoUser("pm", "mtok");
  await dangNhapDuAn(pm, projectId);
  const category = uniq("Plumbing-Waste");
  const { POST: patternPOST } = await import("@/app/api/engineering/memory/patterns/route");
  await patternPOST(
    jreq("/x", {
      patternType: "material_waste_rate",
      category,
      patternMetrics: { wastePercent: 6.0 },
      confidenceScore: 0.95,
      lessonLearned: "Hao hụt do đo sai chiều dài",
    }),
  );

  const { POST } = await import("@/app/api/engineering/memory/transfer/route");
  const res = await POST(jreq("/x", { category }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.length >= 1);
  assert.ok(data[0].similarityScore >= 0.5);
  assert.ok(["low", "medium", "high"].includes(data[0].recommendedAdjustments.riskClass));
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

test("POST /esign/envelopes: chỉ định dự án không được phép truy cập → 403 (chặn IDOR)", S, async () => {
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
});

test("POST /esign/envelopes + GET: hạnh phúc → tạo hồ sơ trình ký, thấy lại trong danh sách", S, async () => {
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
});

// ============================================================================
// GET/POST /api/engineering/digital-handover
// ============================================================================

test("GET /digital-handover: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/digital-handover/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /digital-handover: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("dh403");
  const sub = await taoUser("subcon", "dh403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/digital-handover/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /digital-handover: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "dhnoproj");
  await dangNhapDuAn(pm, null);
  const { GET } = await import("@/app/api/engineering/digital-handover/route");
  const res = await GET();
  assert.equal(res.status, 400);
});

test("POST /digital-handover: bch (chỉ xem) không có quyền ghi → 403", S, async () => {
  const projectId = await taoDuAn("dh403b");
  const bch = await taoUser("bch", "dh403b");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/engineering/digital-handover/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /digital-handover + GET: hạnh phúc → đóng gói passport LOD 500, đọc lại được", S, async () => {
  const projectId = await taoDuAn("dhok");
  const pm = await taoUser("pm", "dhok");
  await dangNhapDuAn(pm, projectId);
  const passportCode = uniq("PASS-TEST");
  const { POST } = await import("@/app/api/engineering/digital-handover/route");
  const res = await POST(jreq("/x", { passportCode, totalSpoolsCount: 10 }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.passport.passportCode, passportCode);

  // Trước khi vá `listDigitalHandoverPassports` (query(sql, [projectId]) thay vì
  // query(sql, projectId)) route này 500 "invalid input syntax for type integer" — nay đọc lại
  // được danh sách đúng dự án.
  const { GET } = await import("@/app/api/engineering/digital-handover/route");
  const res2 = await GET();
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.ok(
    data2.passports.some((p: { passport_code: string }) => p.passport_code === passportCode),
  );
});

// ============================================================================
// GET/POST /api/engineering/smart-ipc
// ============================================================================

test("GET /smart-ipc: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /smart-ipc: engineer không có quyền xem thanh toán → 403", S, async () => {
  const projectId = await taoDuAn("ipc403");
  const eng = await taoUser("engineer", "ipc403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /smart-ipc: module engineering-nextgen-apex TẮT mặc định → 404", S, async () => {
  const projectId = await taoDuAn("ipcoff");
  const pm = await taoUser("pm", "ipcoff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await GET();
  assert.equal(res.status, 404);
});

test("POST /smart-ipc: thiếu grossClaimedVnd → 422", S, async () => {
  const projectId = await taoDuAn("ipcmiss");
  const pm = await taoUser("pm", "ipcmiss");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-nextgen-apex", projectId, pm.id);
  const { POST } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await POST(jreq("/x", { ipcNumber: "IPC-1", periodMonth: "2026-09", contractorName: "A" }));
  assert.equal(res.status, 422);
});

test("POST /smart-ipc: engineer không có quyền giải ngân → 403", S, async () => {
  const projectId = await taoDuAn("ipc403b");
  const eng = await taoUser("engineer", "ipc403b");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /smart-ipc: hạnh phúc → thiếu tham chiếu cả 4 cổng → held_by_gates (KHÔNG mặc định pass)", S, async () => {
  const projectId = await taoDuAn("ipcok");
  const pm = await taoUser("pm", "ipcok");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-nextgen-apex", projectId, pm.id);
  const ipcNumber = uniq("IPC");
  const { POST } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await POST(
    jreq("/x", {
      ipcNumber,
      periodMonth: "2026-09",
      contractorName: "Nhà thầu Test",
      grossClaimedVnd: "500000000",
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.result.allGatesCleared, false);
  assert.equal(data.result.paymentStatus, "held_by_gates");
  assert.equal(data.result.gateStatuses.gate1, "khong_du_du_lieu");
  assert.equal(data.result.netPayableVnd, 0);
});

test("POST /smart-ipc: Gate 4 — khối lượng VƯỢT hạn mức BOQ → failed nhưng chỉ là cảnh báo", S, async () => {
  // Đợt 6 (Việc E): nửa "đối soát kho" của Gate 4 đã bị gỡ vì bất khả thi về cấu trúc —
  // `materials.boq_code` KHÔNG BAO GIỜ trùng được với `boq_items.code` do registry `boq_codes`
  // (migrations/0029_boq_codes.sql) coi mã BOQ là duy nhất XUYÊN BẢNG tasks/work_packages/
  // materials/boq_items (trigger `boq_codes_sync()` chặn 23505). Nửa "khối lượng ≤ hạn mức BOQ"
  // thì vẫn chạy đúng: dưới đây claimedQty 60 > qty_contract 50 nên Gate 4 vẫn kết luận
  // `failed` — nhưng theo quyết định nghiệp vụ 2026-09-05 nó chỉ còn là CẢNH BÁO, lý do nằm ở
  // `gate4WarningReasons` chứ không trộn vào `blockedGateReasons`.
  const projectId = await taoDuAn("ipcgate4");
  const pm = await taoUser("pm", "ipcgate4");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-nextgen-apex", projectId, pm.id);
  const { insertId } = await import("@/lib/db");
  const boqCode = uniq("BOQ-IPC");
  await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, ?, 'm', 50, 1000, ?)`,
    boqCode,
    "Dòng BOQ IPC",
    projectId,
  );
  const ipcNumber = uniq("IPC4");
  const { POST } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await POST(
    jreq("/x", {
      ipcNumber,
      periodMonth: "2026-09",
      contractorName: "Nhà thầu Test",
      grossClaimedVnd: "500000000",
      refs: { boqCode, claimedQty: 60 },
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.result.gateStatuses.gate4, "failed");
  assert.equal(data.result.gate4QuadReconcilePassed, false);
  assert.equal(data.result.gate4WarningReasons.length, 1);
  assert.ok(
    !data.result.blockedGateReasons.some((r: string) => r.includes("Gate 4")),
    "lý do Gate 4 không được trộn vào danh sách cổng chặn",
  );
});

test("POST /smart-ipc: Gate 4 — trong hạn mức BOQ nhưng chưa đối soát được kho → khong_du_du_lieu", S, async () => {
  // "failed" sẽ nói sai rằng hồ sơ có vấn đề: khối lượng nằm trong hạn mức hợp đồng, chỉ là
  // hệ thống chưa có nguồn dữ liệu kho theo mã BOQ. Trạng thái đúng là `khong_du_du_lieu`.
  const projectId = await taoDuAn("ipcgate4kho");
  const pm = await taoUser("pm", "ipcgate4kho");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-nextgen-apex", projectId, pm.id);
  const { insertId } = await import("@/lib/db");
  const boqCode = uniq("BOQ-IPCKHO");
  await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, ?, 'm', 50, 1000, ?)`,
    boqCode,
    "Dòng BOQ IPC trong hạn mức",
    projectId,
  );
  const { POST } = await import("@/app/api/engineering/smart-ipc/route");
  const res = await POST(
    jreq("/x", {
      ipcNumber: uniq("IPC4KHO"),
      periodMonth: "2026-09",
      contractorName: "Nhà thầu Test",
      grossClaimedVnd: "500000000",
      refs: { boqCode, claimedQty: 40 },
    }),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.result.gateStatuses.gate4, "khong_du_du_lieu");
  assert.equal(data.result.gate4QuadReconcilePassed, false);
  // Gate 1–3 vẫn thiếu tham chiếu trong ca này nên hồ sơ vẫn bị chặn — nhưng CHỈ vì 3 cổng đó.
  assert.equal(data.result.blockedGateReasons.length, 3);
  assert.equal(data.result.allGatesCleared, false);
});

test("POST /smart-ipc: gọi lại cùng ipcNumber → cập nhật (ON CONFLICT), không tạo dòng mới", S, async () => {
  const projectId = await taoDuAn("ipcidem");
  const pm = await taoUser("pm", "ipcidem");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-nextgen-apex", projectId, pm.id);
  const ipcNumber = uniq("IPCIDEM");
  const { POST } = await import("@/app/api/engineering/smart-ipc/route");
  const body = {
    ipcNumber,
    periodMonth: "2026-09",
    contractorName: "Nhà thầu Test",
    grossClaimedVnd: "300000000",
  };
  await POST(jreq("/x", body));
  const res2 = await POST(jreq("/x", body));
  assert.equal(res2.status, 200);

  const { queryOne } = await import("@/lib/db");
  const count = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM engineering_smart_ipc_records WHERE project_id = ? AND ipc_number = ?`,
    projectId,
    ipcNumber,
  );
  assert.equal(Number(count!.n), 1);
});

// ============================================================================
// GET/POST /api/engineering/project-health
// ============================================================================

test("GET /project-health: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/project-health/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /project-health: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ph403");
  const sub = await taoUser("subcon", "ph403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/project-health/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /project-health: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "phnoproj");
  await dangNhapDuAn(pm, null);
  const { GET } = await import("@/app/api/engineering/project-health/route");
  const res = await GET();
  assert.equal(res.status, 400);
});

test("POST /project-health: bch (chỉ xem) không có quyền ghi → 403", S, async () => {
  const projectId = await taoDuAn("ph403b");
  const bch = await taoUser("bch", "ph403b");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/engineering/project-health/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /project-health + GET: hạnh phúc → tính EHI, lưu và đọc lại đúng dự án", S, async () => {
  const projectId = await taoDuAn("phok");
  const pm = await taoUser("pm", "phok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/project-health/route");
  const res = await POST(jreq("/x", { spiIndex: 1.05, cpiIndex: 1.02 }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.snapshot.healthIndexPercent >= 0);

  // Trước khi vá `listProjectHealthSnapshots` (cùng lớp lỗi tham số mảng), route này 500.
  const { GET } = await import("@/app/api/engineering/project-health/route");
  const res2 = await GET();
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.totalCount, 1);
});

// ============================================================================
// GET /api/engineering/graph
// ============================================================================

test("GET /graph: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/graph/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /graph: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("gr403");
  const sub = await taoUser("subcon", "gr403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/graph/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /graph: module engineering-graph TẮT mặc định → 404", S, async () => {
  const projectId = await taoDuAn("groff");
  const pm = await taoUser("pm", "groff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/graph/route");
  const res = await GET(greq("/x?objectId=abc"));
  assert.equal(res.status, 404);
});

test("GET /graph: thiếu objectId lẫn externalKey → 400", S, async () => {
  const projectId = await taoDuAn("grmiss");
  const pm = await taoUser("pm", "grmiss");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-graph", projectId, pm.id);
  const { GET } = await import("@/app/api/engineering/graph/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 400);
});

test("GET /graph: object không tồn tại trong dự án → 404", S, async () => {
  const projectId = await taoDuAn("grnf");
  const pm = await taoUser("pm", "grnf");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-graph", projectId, pm.id);
  const { GET } = await import("@/app/api/engineering/graph/route");
  const res = await GET(greq("/x?objectId=00000000-0000-0000-0000-000000000000"));
  assert.equal(res.status, 404);
});

test("GET /graph: hạnh phúc → duyệt đồ thị quan hệ 2 đối tượng", S, async () => {
  const projectId = await taoDuAn("grok");
  const pm = await taoUser("pm", "grok");
  const a = await taoEngObj(projectId, pm.id, "grA");
  const b = await taoEngObj(projectId, pm.id, "grB");
  await taoRelation(projectId, pm.id, a, b, "CONNECTED_TO");
  await dangNhapDuAn(pm, projectId);
  await batModule("engineering-graph", projectId, pm.id);
  const { GET } = await import("@/app/api/engineering/graph/route");
  const res = await GET(greq(`/x?objectId=${a}&depth=2`));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.rootId, a);
  assert.ok(data.nodes.some((n: { id: string }) => n.id === b));
  assert.ok(data.edges.length >= 1);
});

// ============================================================================
// GET /api/engineering/taxonomy
// ============================================================================

test("GET /taxonomy: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/taxonomy/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /taxonomy: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("tx403");
  const sub = await taoUser("subcon", "tx403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/taxonomy/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /taxonomy: hạnh phúc → danh mục loại đối tượng và quan hệ đã seed", S, async () => {
  const projectId = await taoDuAn("txok");
  const bch = await taoUser("bch", "txok");
  await dangNhapDuAn(bch, projectId);
  const { GET } = await import("@/app/api/engineering/taxonomy/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.objectTypes.some((t: { key: string }) => t.key === "equipment"));
  assert.ok(data.relationTypes.some((t: { key: string }) => t.key === "CONNECTED_TO"));
});

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
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) });
  assert.equal(res.status, 404);
});

test("GET /impact/:id: hạnh phúc → đếm đúng upstream/downstream, cảnh báo khi ảnh hưởng không gian", S, async () => {
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
  assert.ok(
    data.criticalPathAlerts.some((a: string) => a.includes("không gian")),
  );
});
