import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING — "quy trình & duyệt" (Đợt 5, Việc
// W1). 24 route:
//   - app/api/engineering/agent-sessions/route.ts                                (GET danh sách phiên)
//   - app/api/engineering/agent-sessions/[id]/route.ts                           (GET chi tiết phiên)
//   - app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route.ts (POST chốt xung đột)
//   - app/api/engineering/autonomy/kill-switch/route.ts                          (POST bật/tắt kill switch)
//   - app/api/engineering/autonomy/policies/route.ts                             (GET danh mục + chính sách)
//   - app/api/engineering/autonomy/requests/route.ts                             (GET/POST yêu cầu thực thi)
//   - app/api/engineering/autonomy/requests/[id]/authorize/route.ts              (POST cấp token)
//   - app/api/engineering/autonomy/requests/[id]/execute/route.ts                (POST thực thi)
//   - app/api/engineering/objects/route.ts                                       (GET danh sách object)
//   - app/api/engineering/objects/[id]/route.ts                                  (GET chi tiết object)
//   - app/api/engineering/objects/[id]/review/route.ts                          (POST duyệt/từ chối object)
//   - app/api/engineering/suggestions/route.ts                                   (GET danh sách đề xuất)
//   - app/api/engineering/suggestions/[id]/route.ts                              (GET chi tiết đề xuất)
//   - app/api/engineering/suggestions/[id]/decide/route.ts                       (POST quyết định đề xuất)
//   - app/api/engineering/swarm/debates/route.ts                                 (GET/POST phiên tranh biện)
//   - app/api/engineering/swarm/debates/[id]/route.ts                           (GET chi tiết phiên)
//   - app/api/engineering/swarm/debates/[id]/arguments/route.ts                 (POST thêm lập luận)
//   - app/api/engineering/swarm/debates/[id]/synthesize/route.ts                (POST tổng hợp đồng thuận)
//   - app/api/engineering/swarm/drafts/route.ts                                  (POST soạn hồ sơ tự động)
//   - app/api/engineering/workflows/route.ts                                     (GET/POST workflow)
//   - app/api/engineering/workflows/[id]/route.ts                                (GET chi tiết workflow)
//   - app/api/engineering/workflows/[id]/submit/route.ts                        (POST trình duyệt)
//   - app/api/engineering/workflows/[id]/transition/route.ts                    (POST chuyển trạng thái)
//   - app/api/engineering/workflows/[id]/gates/[seq]/route.ts                   (POST ký gate)
//
// Đặc tả: docs/nang-cap/ENG-3-engineering-workflow-os.md (workflows), ENG-4-multi-agent-
// engineering-os.md (agent-sessions/swarm). BUG THẬT vá cùng đợt: xem cuối file (route
// app/api/engineering/swarm/debates/[id]/arguments/route.ts thiếu kiểm debate thuộc dự án).

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `ENGW1 ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number; role: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `engw1-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-engw1-route', ?, ?)`,
    `ENGW1 ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId, role };
}

/** Bật 1 module `thuNghiem` (autonomy/swarm mặc định TẮT) cho 1 dự án — pattern
 * tests/feature-flags.test.ts. */
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

const greq = (url: string) => new NextRequest(`http://localhost${url}`, { method: "GET" });

// ============================================================================
// Helpers dựng dữ liệu (không có route POST tạo agent-session trong phạm vi W1 — đó là
// /api/v1/engineering/agent-sessions, ngoài phạm vi 24 route được giao. Gọi thẳng hàm lib
// để dựng fixture, đúng khuyến nghị "tự tạo mọi dữ liệu mình cần").
// ============================================================================

async function taoPhienXungDot(
  projectId: number,
): Promise<{ sessionId: string; conflictId: string }> {
  const { openAgentSession } = await import("@/lib/ky-thuat/engineering-agents");
  const { sessionId } = await openAgentSession(projectId, null, {
    intent: `Kiểm tra kích thước ống đứng ${uniq("intent")}`,
    maxRounds: 5,
    conflictBudget: 10,
    claims: [
      {
        agentRole: "specialist",
        agentName: "mep-hvac-v1",
        topic: "duong-kinh-ong-dung",
        claim: "DN100",
        payload: {},
        assumptions: ["theo bản vẽ rev A"],
        confidenceSignals: {},
        sourceAuthority: "derived",
      },
      {
        agentRole: "specialist",
        agentName: "mep-hvac-v2",
        topic: "duong-kinh-ong-dung",
        claim: "DN150",
        payload: {},
        assumptions: ["theo bản vẽ rev B"],
        confidenceSignals: {},
        sourceAuthority: "derived",
      },
    ],
  });
  const { queryOne } = await import("@/lib/db");
  const conflict = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_conflicts WHERE session_id = ? LIMIT 1`,
    sessionId,
  );
  return { sessionId, conflictId: conflict!.id };
}

async function taoObject(projectId: number, userId: number, ten: string): Promise<string> {
  const { createEngineeringObject } = await import("@/lib/ky-thuat/engineering-kernel");
  const obj = await createEngineeringObject(
    {
      projectId,
      objectType: "pipe_segment",
      discipline: "mepf",
      externalKey: uniq(ten),
      name: `Đối tượng ${ten}`,
      properties: {},
      geometryRef: {},
    },
    userId,
  );
  return (obj as { id: string }).id;
}

async function taoSuggestion(
  projectId: number,
  ten: string,
  overrides: { priority?: string; evidenceKind?: "fact" | "inference" } = {},
): Promise<string> {
  const { ingestIntelligencePackage } = await import("@/lib/ky-thuat/engineering-intel");
  const res = await ingestIntelligencePackage(projectId, null, {
    objective: `Rà soát ${uniq(ten)}`,
    provenance: {},
    suggestions: [
      {
        suggestionClass: "mep",
        title: `Đề xuất ${ten}`,
        priority: (overrides.priority as never) ?? "quality",
        severity: "medium",
        confidenceSignals: {},
        evidence: [
          { kind: overrides.evidenceKind ?? "fact", statement: "Ghi nhận tại hiện trường" },
        ],
      },
    ],
  } as never);
  return res.suggestions[0].id;
}

async function chapNhanSuggestion(projectId: number, id: string, userId: number): Promise<void> {
  const { decideSuggestion } = await import("@/lib/ky-thuat/engineering-intel");
  await decideSuggestion(projectId, id, userId, "accepted");
}

function riskInputsThap(overrides: Partial<Record<string, unknown>> = {}) {
  return { reversible: true, ...overrides };
}

async function taoWorkflow(
  pm: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
  body: Record<string, unknown>,
): Promise<{ id: string; status: number; json: Record<string, unknown> }> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/route");
  const res = await POST(
    jreq("/x", { title: `Workflow ${uniq(ten)}`, riskInputs: riskInputsThap(), ...body }),
  );
  const json = await res.json();
  return { id: json.id as string, status: res.status, json };
}

// ============================================================================
// GET /api/engineering/agent-sessions
// ============================================================================

test("GET /api/engineering/agent-sessions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/agent-sessions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/agent-sessions: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("asg403");
  const sub = await taoUser("subcon", "asg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/agent-sessions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/agent-sessions: chưa chọn dự án → danh sách rỗng", S, async () => {
  const eng = await taoUser("engineer", "asgnoproj");
  await dangNhapDuAn(eng, null);
  const { GET } = await import("@/app/api/engineering/agent-sessions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const { sessions } = await res.json();
  assert.deepEqual(sessions, []);
});

test("GET /api/engineering/agent-sessions: liệt kê đúng dự án, cách ly dự án khác", S, async () => {
  const projectA = await taoDuAn("asglistA");
  const projectB = await taoDuAn("asglistB");
  const { sessionId: sA } = await taoPhienXungDot(projectA);
  await taoPhienXungDot(projectB);
  const bch = await taoUser("bch", "asglist");
  await dangNhapDuAn(bch, projectA);
  const { GET } = await import("@/app/api/engineering/agent-sessions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const { sessions } = await res.json();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, sA);
});

// ============================================================================
// GET /api/engineering/agent-sessions/:id
// ============================================================================

test("GET /api/engineering/agent-sessions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/agent-sessions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /api/engineering/agent-sessions/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("asdg403");
  const sub = await taoUser("subcon", "asdg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/agent-sessions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /api/engineering/agent-sessions/:id: phiên thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("asdgisoA");
  const projectB = await taoDuAn("asdgisoB");
  const { sessionId } = await taoPhienXungDot(projectB);
  const pm = await taoUser("pm", "asdgisoA");
  await dangNhapDuAn(pm, projectA);
  const { GET } = await import("@/app/api/engineering/agent-sessions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: sessionId }) });
  assert.equal(res.status, 404);
});

test(
  "GET /api/engineering/agent-sessions/:id: chi tiết đủ claim + xung đột + đề xuất phân xử",
  S,
  async () => {
    const projectId = await taoDuAn("asdgok");
    const { sessionId } = await taoPhienXungDot(projectId);
    const pm = await taoUser("pm", "asdgok");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/agent-sessions/[id]/route");
    const res = await GET(greq("/x"), { params: Promise.resolve({ id: sessionId }) });
    assert.equal(res.status, 200);
    const { session, claims, conflicts } = await res.json();
    assert.equal(session.consensus, "conflict_requires_review");
    assert.equal(claims.length, 2);
    assert.equal(conflicts.length, 1);
    assert.ok(conflicts[0].proposal);
    assert.equal(conflicts[0].proposal.needsHuman, true);
  },
);

// ============================================================================
// POST /api/engineering/agent-sessions/:id/conflicts/:conflictId/resolve
// ============================================================================

test("POST .../conflicts/:cid/resolve: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } =
    await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
  const res = await POST(jreq("/x", {}), {
    params: Promise.resolve({ id: "x", conflictId: "y" }),
  });
  assert.equal(res.status, 401);
});

test(
  "POST .../conflicts/:cid/resolve: engineer xem được nhưng không được chốt → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ares403");
    const eng = await taoUser("engineer", "ares403");
    await dangNhapDuAn(eng, projectId);
    const { POST } =
      await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
    const res = await POST(jreq("/x", {}), {
      params: Promise.resolve({ id: "x", conflictId: "y" }),
    });
    assert.equal(res.status, 403);
  },
);

test("POST .../conflicts/:cid/resolve: thiếu resolution/method → 422", S, async () => {
  const projectId = await taoDuAn("aresval");
  const pm = await taoUser("pm", "aresval");
  const { sessionId, conflictId } = await taoPhienXungDot(projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } =
    await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
  const res = await POST(jreq("/x", {}), {
    params: Promise.resolve({ id: sessionId, conflictId }),
  });
  assert.equal(res.status, 422);
});

test("POST .../conflicts/:cid/resolve: phiên thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("aresisoA");
  const projectB = await taoDuAn("aresisoB");
  const { sessionId, conflictId } = await taoPhienXungDot(projectB);
  const pmA = await taoUser("pm", "aresisoA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } =
    await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
  const res = await POST(jreq("/x", { resolution: "Chọn DN150", method: "evidence_comparison" }), {
    params: Promise.resolve({ id: sessionId, conflictId }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST .../conflicts/:cid/resolve: preference_vote không khai lowRiskPreference → 403 " +
    "(assertVoteAllowed chặn cứng, đúng §19)",
  S,
  async () => {
    const projectId = await taoDuAn("aresvote");
    const pm = await taoUser("pm", "aresvote");
    const { sessionId, conflictId } = await taoPhienXungDot(projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST } =
      await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
    const res = await POST(
      jreq("/x", { resolution: "Chọn theo đa số", method: "preference_vote" }),
      { params: Promise.resolve({ id: sessionId, conflictId }) },
    );
    assert.equal(res.status, 403);
  },
);

test("POST .../conflicts/:cid/resolve: chốt thành công, ghi resolved_by + method", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("aresok");
  const pm = await taoUser("pm", "aresok");
  const { sessionId, conflictId } = await taoPhienXungDot(projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } =
    await import("@/app/api/engineering/agent-sessions/[id]/conflicts/[conflictId]/resolve/route");
  const res = await POST(
    jreq("/x", {
      resolution: "Chọn DN150 theo bản vẽ rev B mới hơn",
      method: "evidence_comparison",
    }),
    { params: Promise.resolve({ id: sessionId, conflictId }) },
  );
  assert.equal(res.status, 200);
  const row = await queryOne<{
    resolution: string;
    resolution_method: string;
    resolved_by: number;
    stage: string;
  }>(
    `SELECT resolution, resolution_method, resolved_by, stage FROM engineering_conflicts WHERE id = ?`,
    conflictId,
  );
  assert.equal(row?.resolution_method, "evidence_comparison");
  assert.equal(row?.resolved_by, pm.id);
  assert.equal(row?.stage, "verified");
});

// ============================================================================
// POST /api/engineering/autonomy/kill-switch
// ============================================================================

test("POST /api/engineering/autonomy/kill-switch: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/autonomy/kill-switch/route");
  const res = await POST(jreq("/x", { isActive: true }));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/autonomy/kill-switch: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ksw403");
  const eng = await taoUser("engineer", "ksw403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/kill-switch/route");
  const res = await POST(jreq("/x", { isActive: true }));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/autonomy/kill-switch: bật → checkAutonomyAllowance bị chặn ngay",
  S,
  async () => {
    const projectId = await taoDuAn("kswok");
    const admin = await taoUser("admin", "kswok");
    await batModule("engineering-autonomy", projectId, admin.id);
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/engineering/autonomy/kill-switch/route");
    const res = await POST(jreq("/x", { isActive: true, reason: "Sự cố hiện trường" }));
    assert.equal(res.status, 200);
    const { checkAutonomyAllowance } = await import("@/lib/ky-thuat/engineering-autonomy");
    const allow = await checkAutonomyAllowance(projectId, "cap_sync_twin_state", "A1", "admin");
    assert.equal(allow.allowed, false);
    assert.match(allow.reason ?? "", /Kill Switch/);

    // Tắt lại để không ảnh hưởng test khác (kill switch không có project_id filter khi
    // project_id NULL — nhưng ở đây ta luôn bật CÓ project_id nên chỉ ảnh hưởng dự án này).
    await POST(jreq("/x", { isActive: false }));
    const allow2 = await checkAutonomyAllowance(projectId, "cap_sync_twin_state", "A1", "admin");
    assert.equal(allow2.allowed, true);
  },
);

// ============================================================================
// GET /api/engineering/autonomy/policies
// ============================================================================

test("GET /api/engineering/autonomy/policies: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/autonomy/policies/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test(
  "GET /api/engineering/autonomy/policies: engineer/bch không có quyền → chỉ subcon 403",
  S,
  async () => {
    const projectId = await taoDuAn("apo403");
    const sub = await taoUser("subcon", "apo403");
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/engineering/autonomy/policies/route");
    const res = await GET();
    assert.equal(res.status, 403);
  },
);

test("GET /api/engineering/autonomy/policies: chưa chọn dự án → 400", S, async () => {
  const eng = await taoUser("engineer", "aponoproj");
  await dangNhapDuAn(eng, null);
  const { GET } = await import("@/app/api/engineering/autonomy/policies/route");
  const res = await GET();
  assert.equal(res.status, 400);
});

test("GET /api/engineering/autonomy/policies: module tắt mặc định → 404", S, async () => {
  const projectId = await taoDuAn("apooff");
  const pm = await taoUser("pm", "apooff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/autonomy/policies/route");
  const res = await GET();
  assert.equal(res.status, 404);
});

test(
  "GET /api/engineering/autonomy/policies: bật module → trả danh mục capability",
  S,
  async () => {
    const projectId = await taoDuAn("apook");
    const pm = await taoUser("pm", "apook");
    await batModule("engineering-autonomy", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/autonomy/policies/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const { capabilities, policies } = await res.json();
    assert.ok(capabilities.some((c: { key: string }) => c.key === "cap_sync_twin_state"));
    assert.deepEqual(policies, []);
  },
);

// ============================================================================
// GET/POST /api/engineering/autonomy/requests
// ============================================================================

test("GET /api/engineering/autonomy/requests: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/autonomy/requests/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/autonomy/requests: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/autonomy/requests/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/autonomy/requests: engineer không có quyền tạo → 403", S, async () => {
  const projectId = await taoDuAn("areq403");
  const eng = await taoUser("engineer", "areq403");
  await batModule("engineering-autonomy", projectId, eng.id);
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/requests/route");
  const res = await POST(jreq("/x", { capabilityKey: "cap_sync_twin_state", intent: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/autonomy/requests: thiếu capabilityKey/intent → 400", S, async () => {
  const projectId = await taoDuAn("areqval");
  const pm = await taoUser("pm", "areqval");
  await batModule("engineering-autonomy", projectId, pm.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/requests/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/autonomy/requests: tạo thành công (Admin/PM mặc định được phép khi " +
    "chưa có policy) → GET liệt kê đúng",
  S,
  async () => {
    const projectId = await taoDuAn("areqok");
    const pm = await taoUser("pm", "areqok");
    await batModule("engineering-autonomy", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/autonomy/requests/route");
    // Không truyền autonomyLevel — kiểm nhánh mặc định "A1" (`(body?.autonomyLevel...) || "A1"`).
    const res = await POST(
      jreq("/x", { capabilityKey: "cap_sync_twin_state", intent: "Đồng bộ twin" }),
    );
    assert.equal(res.status, 200);
    const { request } = await res.json();
    assert.equal(request.status, "dry_run_passed");
    assert.equal(request.projectId, projectId);
    assert.equal(request.autonomyLevel, "A1");

    const list = await GET();
    const { requests } = await list.json();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].id, request.id);
  },
);

test(
  "POST /api/engineering/autonomy/requests: vượt trần capability (A2 khi capability trần A1) → 403",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("areqcap");
    const pm = await taoUser("pm", "areqcap");
    await batModule("engineering-autonomy", projectId, pm.id);
    const capKey = `cap_test_${uniq("cap")}`;
    await run(
      `INSERT INTO engineering_autonomy_capabilities (key, label, max_autonomy_level, risk_class, is_reversible)
       VALUES (?, ?, 'A1', 'low', TRUE)`,
      capKey,
      `Capability ${capKey}`,
    );
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/autonomy/requests/route");
    const res = await POST(jreq("/x", { capabilityKey: capKey, autonomyLevel: "A2", intent: "x" }));
    assert.equal(res.status, 403);
  },
);

// ============================================================================
// POST /api/engineering/autonomy/requests/:id/authorize + execute
// ============================================================================

async function taoExecutionRequest(
  pm: { id: number; passwordHash: string },
  projectId: number,
): Promise<string> {
  await batModule("engineering-autonomy", projectId, pm.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/requests/route");
  const res = await POST(
    jreq("/x", { capabilityKey: "cap_sync_twin_state", autonomyLevel: "A1", intent: "x" }),
  );
  const { request } = await res.json();
  return request.id as string;
}

test("POST .../requests/:id/authorize: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST .../requests/:id/authorize: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("aauth403");
  const eng = await taoUser("engineer", "aauth403");
  await batModule("engineering-autonomy", projectId, eng.id);
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("POST .../requests/:id/authorize: cấp token thành công", S, async () => {
  const projectId = await taoDuAn("aauthok");
  const pm = await taoUser("pm", "aauthok");
  const reqId = await taoExecutionRequest(pm, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: reqId }) });
  assert.equal(res.status, 200);
  const { token, expiresAt } = await res.json();
  assert.ok(token.startsWith("tok_"));
  assert.ok(new Date(expiresAt).getTime() > Date.now());
});

test(
  "POST .../requests/:id/authorize: yêu cầu thuộc dự án khác không cấp được token (không lộ dữ liệu)",
  S,
  async () => {
    const projectA = await taoDuAn("aauthisoA");
    const projectB = await taoDuAn("aauthisoB");
    const pmB = await taoUser("pm", "aauthisoB");
    const reqId = await taoExecutionRequest(pmB, projectB);
    const pmA = await taoUser("pm", "aauthisoA");
    await batModule("engineering-autonomy", projectA, pmA.id);
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
    const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: reqId }) });
    assert.equal(res.status, 500); // route cụm này catch-all lỗi nghiệp vụ về 500 — khoá mã thật, không chỉ "khác 200"
    // Yêu cầu vẫn KHÔNG được cấp token — xác nhận dữ liệu dự án B không đổi.
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ approval_token: string | null; status: string }>(
      `SELECT approval_token, status FROM engineering_execution_requests WHERE id = ?`,
      reqId,
    );
    assert.equal(row?.approval_token, null);
    assert.equal(row?.status, "dry_run_passed");
  },
);

test("POST .../requests/:id/execute: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/execute/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST .../requests/:id/execute: thiếu token → 400", S, async () => {
  const projectId = await taoDuAn("aexecval");
  const pm = await taoUser("pm", "aexecval");
  const reqId = await taoExecutionRequest(pm, projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/execute/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: reqId }) });
  assert.equal(res.status, 400);
});

test("POST .../requests/:id/execute: token sai → thất bại, không hoàn tất", S, async () => {
  const projectId = await taoDuAn("aexecbad");
  const pm = await taoUser("pm", "aexecbad");
  const reqId = await taoExecutionRequest(pm, projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST: authorize } =
    await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
  await authorize(jreq("/x", {}), { params: Promise.resolve({ id: reqId }) });
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/execute/route");
  const res = await POST(jreq("/x", { token: "tok_sai" }), {
    params: Promise.resolve({ id: reqId }),
  });
  assert.equal(res.status, 500); // route cụm này catch-all lỗi nghiệp vụ về 500 — khoá mã thật, không chỉ "khác 200"
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_execution_requests WHERE id = ?`,
    reqId,
  );
  assert.equal(row?.status, "authorized");
});

test("POST .../requests/:id/execute: đủ chu trình authorize → execute → completed", S, async () => {
  const projectId = await taoDuAn("aexecok");
  const pm = await taoUser("pm", "aexecok");
  const reqId = await taoExecutionRequest(pm, projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST: authorize } =
    await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
  const authRes = await authorize(jreq("/x", {}), { params: Promise.resolve({ id: reqId }) });
  const { token } = await authRes.json();
  const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/execute/route");
  const res = await POST(jreq("/x", { token }), { params: Promise.resolve({ id: reqId }) });
  assert.equal(res.status, 200);
  const { request } = await res.json();
  assert.equal(request.status, "completed");
  assert.equal(request.approvalToken, null);
});

test(
  "POST .../requests/:id/execute: kill switch bật ngay trước khi thực thi → chặn thực thi " +
    "và ghi BỀN status='killed' (Đợt 6 đã vá ranh giới transaction — xem mục cuối file)",
  S,
  async () => {
    const projectId = await taoDuAn("aexecks");
    const pm = await taoUser("pm", "aexecks");
    const reqId = await taoExecutionRequest(pm, projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST: authorize } =
      await import("@/app/api/engineering/autonomy/requests/[id]/authorize/route");
    const authRes = await authorize(jreq("/x", {}), { params: Promise.resolve({ id: reqId }) });
    const { token } = await authRes.json();

    const { POST: killSwitch } = await import("@/app/api/engineering/autonomy/kill-switch/route");
    const admin = await taoUser("admin", "aexecks");
    await dangNhapDuAn(admin, projectId);
    const ksRes = await killSwitch(jreq("/x", { isActive: true, reason: "Khẩn cấp" }));
    assert.equal(
      ksRes.status,
      200,
      `bật kill switch thất bại: ${JSON.stringify(await ksRes.json())}`,
    );

    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/autonomy/requests/[id]/execute/route");
    const res = await POST(jreq("/x", { token }), { params: Promise.resolve({ id: reqId }) });
    // Chặn thực thi thật (không rơi vào 'completed') — đây là bất biến an toàn quan trọng
    // nhất và ĐÃ đúng.
    assert.equal(res.status, 500); // route cụm này catch-all lỗi nghiệp vụ về 500 — khoá mã thật, không chỉ "khác 200"
    const body = await res.json();
    assert.match(body.error, /Kill Switch/);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_execution_requests WHERE id = ?`,
      reqId,
    );
    // Sau bản vá Đợt 6: lệnh huỷ được ghi ở transaction riêng nên KHÔNG bị throw cuốn theo.
    assert.equal(row?.status, "killed");
  },
);

// ============================================================================
// GET /api/engineering/objects
// ============================================================================

test("GET /api/engineering/objects: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/objects/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/objects: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("obg403");
  const eng = await taoUser("engineer", "obg403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/engineering/objects/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/objects: liệt kê đúng dự án, cách ly dự án khác", S, async () => {
  const projectA = await taoDuAn("obglistA");
  const projectB = await taoDuAn("obglistB");
  const pmA = await taoUser("pm", "obglistA");
  const objA = await taoObject(projectA, pmA.id, "obglistA");
  await taoObject(projectB, pmA.id, "obglistB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/engineering/objects/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const { objects } = await res.json();
  assert.equal(objects.length, 1);
  assert.equal(objects[0].id, objA);
});

// ============================================================================
// GET /api/engineering/objects/:id
// ============================================================================

test("GET /api/engineering/objects/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/objects/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /api/engineering/objects/:id: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("obdg403");
  const eng = await taoUser("engineer", "obdg403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/engineering/objects/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /api/engineering/objects/:id: object thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("obdgisoA");
  const projectB = await taoDuAn("obdgisoB");
  const pmB = await taoUser("pm", "obdgisoB");
  const objB = await taoObject(projectB, pmB.id, "obdgisoB");
  const pmA = await taoUser("pm", "obdgisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/engineering/objects/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: objB }) });
  assert.equal(res.status, 404);
});

test("GET /api/engineering/objects/:id: chi tiết có object/relations/revisions", S, async () => {
  const projectId = await taoDuAn("obdgok");
  const pm = await taoUser("pm", "obdgok");
  const objId = await taoObject(projectId, pm.id, "obdgok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/objects/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: objId }) });
  assert.equal(res.status, 200);
  const { object, relations, revisions } = await res.json();
  assert.equal(object.id, objId);
  assert.deepEqual(relations, []);
  assert.deepEqual(revisions, []);
});

// ============================================================================
// POST /api/engineering/objects/:id/review
// ============================================================================

test("POST /api/engineering/objects/:id/review: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/objects/[id]/review/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST /api/engineering/objects/:id/review: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("obrv403");
  const eng = await taoUser("engineer", "obrv403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/objects/[id]/review/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "x" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/engineering/objects/:id/review: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("obrvval");
  const pm = await taoUser("pm", "obrvval");
  const objId = await taoObject(projectId, pm.id, "obrvval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/objects/[id]/review/route");
  const res = await POST(jreq("/x", { decision: "maybe" }), {
    params: Promise.resolve({ id: objId }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/engineering/objects/:id/review: object thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("obrvisoA");
  const projectB = await taoDuAn("obrvisoB");
  const pmB = await taoUser("pm", "obrvisoB");
  const objB = await taoObject(projectB, pmB.id, "obrvisoB");
  const pmA = await taoUser("pm", "obrvisoA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/engineering/objects/[id]/review/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: objB }),
  });
  assert.equal(res.status, 404);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_objects WHERE id = ?`,
    objB,
  );
  assert.equal(row?.status, "pending_review");
});

test("POST /api/engineering/objects/:id/review: duyệt thành công, ghi revision", S, async () => {
  const { query } = await import("@/lib/db");
  const projectId = await taoDuAn("obrvok");
  const pm = await taoUser("pm", "obrvok");
  const objId = await taoObject(projectId, pm.id, "obrvok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/objects/[id]/review/route");
  const res = await POST(jreq("/x", { decision: "approved", note: "Khớp bản vẽ" }), {
    params: Promise.resolve({ id: objId }),
  });
  assert.equal(res.status, 200);
  const revs = await query(
    `SELECT id FROM engineering_object_revisions WHERE object_id = ?`,
    objId,
  );
  assert.equal(revs.length, 1);
});

// ============================================================================
// GET /api/engineering/suggestions
// ============================================================================

test("GET /api/engineering/suggestions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/suggestions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/suggestions: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("sgg403");
  const sub = await taoUser("subcon", "sgg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/suggestions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/suggestions: liệt kê đúng dự án, cách ly dự án khác", S, async () => {
  const projectA = await taoDuAn("sgglistA");
  const projectB = await taoDuAn("sgglistB");
  const sA = await taoSuggestion(projectA, "sgglistA");
  await taoSuggestion(projectB, "sgglistB");
  const eng = await taoUser("engineer", "sgglist");
  await dangNhapDuAn(eng, projectA);
  const { GET } = await import("@/app/api/engineering/suggestions/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 200);
  const { suggestions } = await res.json();
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].id, sA);
});

// ============================================================================
// GET /api/engineering/suggestions/:id
// ============================================================================

test("GET /api/engineering/suggestions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/suggestions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /api/engineering/suggestions/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("sgdg403");
  const sub = await taoUser("subcon", "sgdg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/suggestions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /api/engineering/suggestions/:id: đề xuất thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("sgdgisoA");
  const projectB = await taoDuAn("sgdgisoB");
  const sB = await taoSuggestion(projectB, "sgdgisoB");
  const eng = await taoUser("engineer", "sgdgisoA");
  await dangNhapDuAn(eng, projectA);
  const { GET } = await import("@/app/api/engineering/suggestions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: sB }) });
  assert.equal(res.status, 404);
});

test("GET /api/engineering/suggestions/:id: chi tiết kèm evidence", S, async () => {
  const projectId = await taoDuAn("sgdgok");
  const sId = await taoSuggestion(projectId, "sgdgok");
  const eng = await taoUser("engineer", "sgdgok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/engineering/suggestions/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: sId }) });
  assert.equal(res.status, 200);
  const { suggestion, evidence } = await res.json();
  assert.equal(suggestion.id, sId);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].kind, "fact");
});

// ============================================================================
// POST /api/engineering/suggestions/:id/decide
// ============================================================================

test("POST /api/engineering/suggestions/:id/decide: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/suggestions/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "accepted" }), {
    params: Promise.resolve({ id: "x" }),
  });
  assert.equal(res.status, 401);
});

test(
  "POST /api/engineering/suggestions/:id/decide: engineer xem được nhưng không được quyết định → 403",
  S,
  async () => {
    const projectId = await taoDuAn("sgd403");
    const eng = await taoUser("engineer", "sgd403");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/engineering/suggestions/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "accepted" }), {
      params: Promise.resolve({ id: "x" }),
    });
    assert.equal(res.status, 403);
  },
);

test("POST /api/engineering/suggestions/:id/decide: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("sgdval");
  const pm = await taoUser("pm", "sgdval");
  const sId = await taoSuggestion(projectId, "sgdval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/suggestions/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "maybe" }), {
    params: Promise.resolve({ id: sId }),
  });
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/suggestions/:id/decide: đề xuất thuộc dự án khác → 404",
  S,
  async () => {
    const projectA = await taoDuAn("sgdisoA");
    const projectB = await taoDuAn("sgdisoB");
    const sB = await taoSuggestion(projectB, "sgdisoB");
    const pmA = await taoUser("pm", "sgdisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/suggestions/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "accepted" }), {
      params: Promise.resolve({ id: sB }),
    });
    assert.equal(res.status, 404);
  },
);

test(
  "POST /api/engineering/suggestions/:id/decide: chấp nhận thành công, ghi decidedBy/note",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("sgdok");
    const pm = await taoUser("pm", "sgdok");
    const sId = await taoSuggestion(projectId, "sgdok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/suggestions/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "accepted", note: "Đồng ý áp dụng" }), {
      params: Promise.resolve({ id: sId }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string; decided_by: number; decision_note: string }>(
      `SELECT status, decided_by, decision_note FROM engineering_suggestions WHERE id = ?`,
      sId,
    );
    assert.equal(row?.status, "accepted");
    assert.equal(row?.decided_by, pm.id);
    assert.equal(row?.decision_note, "Đồng ý áp dụng");
  },
);

// ============================================================================
// GET/POST /api/engineering/swarm/debates
// ============================================================================

test("GET /api/engineering/swarm/debates: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/swarm/debates/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/swarm/debates: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("swg403");
  const sub = await taoUser("subcon", "swg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/swarm/debates/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/engineering/swarm/debates: module tắt mặc định → 404", S, async () => {
  const projectId = await taoDuAn("swgoff");
  const pm = await taoUser("pm", "swgoff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/swarm/debates/route");
  const res = await GET();
  assert.equal(res.status, 404);
});

test("POST /api/engineering/swarm/debates: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/swarm/debates/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/swarm/debates: thiếu topic/triggerEvent → 422", S, async () => {
  const projectId = await taoDuAn("swpval");
  const pm = await taoUser("pm", "swpval");
  await batModule("engineering-swarm", projectId, pm.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/swarm/debates/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

async function taoDebate(
  pm: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
): Promise<string> {
  await batModule("engineering-swarm", projectId, pm.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/swarm/debates/route");
  const res = await POST(
    jreq("/x", { topic: `Chủ đề ${uniq(ten)}`, triggerEvent: "design_change_detected" }),
  );
  const json = await res.json();
  return json.id as string;
}

test(
  "POST /api/engineering/swarm/debates: tạo thành công → GET liệt kê đúng dự án",
  S,
  async () => {
    const projectA = await taoDuAn("swplistA");
    const projectB = await taoDuAn("swplistB");
    const pmA = await taoUser("pm", "swplistA");
    const pmB = await taoUser("pm", "swplistB");
    const idA = await taoDebate(pmA, projectA, "swplistA");
    await taoDebate(pmB, projectB, "swplistB");

    await batModule("engineering-swarm", projectA, pmA.id);
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/engineering/swarm/debates/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const debates = await res.json();
    assert.equal(debates.length, 1);
    assert.equal(debates[0].id, idA);
  },
);

// ============================================================================
// GET /api/engineering/swarm/debates/:id
// ============================================================================

test("GET /api/engineering/swarm/debates/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/swarm/debates/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /api/engineering/swarm/debates/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("swdg403");
  const sub = await taoUser("subcon", "swdg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/swarm/debates/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /api/engineering/swarm/debates/:id: phiên thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("swdgisoA");
  const projectB = await taoDuAn("swdgisoB");
  const pmB = await taoUser("pm", "swdgisoB");
  const debateB = await taoDebate(pmB, projectB, "swdgisoB");
  const pmA = await taoUser("pm", "swdgisoA");
  await batModule("engineering-swarm", projectA, pmA.id);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/engineering/swarm/debates/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: debateB }) });
  assert.equal(res.status, 404);
});

test("GET /api/engineering/swarm/debates/:id: chi tiết kèm lập luận", S, async () => {
  const projectId = await taoDuAn("swdgok");
  const pm = await taoUser("pm", "swdgok");
  const debateId = await taoDebate(pm, projectId, "swdgok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/swarm/debates/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: debateId }) });
  assert.equal(res.status, 200);
  const debate = await res.json();
  assert.equal(debate.id, debateId);
  assert.deepEqual(debate.arguments, []);
});

// ============================================================================
// POST /api/engineering/swarm/debates/:id/arguments
// ============================================================================

test("POST .../debates/:id/arguments: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST .../debates/:id/arguments: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("swag403");
  const sub = await taoUser("subcon", "swag403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("POST .../debates/:id/arguments: thiếu agentRole/stance/argumentText → 422", S, async () => {
  const projectId = await taoDuAn("swagval");
  const pm = await taoUser("pm", "swagval");
  const debateId = await taoDebate(pm, projectId, "swagval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: debateId }) });
  assert.equal(res.status, 422);
});

test(
  "POST .../debates/:id/arguments: BUG THẬT đã vá — debate thuộc dự án khác → 404, KHÔNG " +
    "còn ghi được lập luận xuyên dự án (trước đây route gọi thẳng addSwarmArgument(params.id, ...) " +
    "không hề kiểm phiên có thuộc dự án đang chọn hay không)",
  S,
  async () => {
    const projectA = await taoDuAn("swagisoA");
    const projectB = await taoDuAn("swagisoB");
    const pmB = await taoUser("pm", "swagisoB");
    const debateB = await taoDebate(pmB, projectB, "swagisoB");
    const pmA = await taoUser("pm", "swagisoA");
    await batModule("engineering-swarm", projectA, pmA.id);
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
    const res = await POST(
      jreq("/x", { agentRole: "agent_mepf", stance: "object", argumentText: "Xâm nhập trái phép" }),
      { params: Promise.resolve({ id: debateB }) },
    );
    assert.equal(res.status, 404);
    const { query } = await import("@/lib/db");
    const rows = await query(
      `SELECT id FROM engineering_swarm_arguments WHERE debate_id = ?`,
      debateB,
    );
    assert.equal(rows.length, 0, "dự án B không được có lập luận nào bị ghi trái phép");
  },
);

test(
  "POST .../debates/:id/arguments: thêm lập luận thành công, đúng trọng số uy quyền",
  S,
  async () => {
    const projectId = await taoDuAn("swagok");
    const pm = await taoUser("pm", "swagok");
    const debateId = await taoDebate(pm, projectId, "swagok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
    const res = await POST(
      jreq("/x", {
        agentRole: "agent_safety",
        stance: "object",
        argumentText: "Vi phạm khoảng cách an toàn",
      }),
      { params: Promise.resolve({ id: debateId }) },
    );
    assert.equal(res.status, 201);
    const arg = await res.json();
    assert.equal(arg.authority_weight, 2.0);
  },
);

// ============================================================================
// POST /api/engineering/swarm/debates/:id/synthesize
// ============================================================================

test("POST .../debates/:id/synthesize: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/synthesize/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test(
  "POST .../debates/:id/synthesize: engineer không có quyền hoà giải (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("swsy403");
    const eng = await taoUser("engineer", "swsy403");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/synthesize/route");
    const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "x" }) });
    assert.equal(res.status, 403);
  },
);

test(
  "POST .../debates/:id/synthesize: phiên thuộc dự án khác → lỗi, không hoà giải nhầm",
  S,
  async () => {
    const projectA = await taoDuAn("swsyisoA");
    const projectB = await taoDuAn("swsyisoB");
    const pmB = await taoUser("pm", "swsyisoB");
    const debateB = await taoDebate(pmB, projectB, "swsyisoB");
    const pmA = await taoUser("pm", "swsyisoA");
    await batModule("engineering-swarm", projectA, pmA.id);
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/synthesize/route");
    const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: debateB }) });
    assert.equal(res.status, 500); // route cụm này catch-all lỗi nghiệp vụ về 500 — khoá mã thật, không chỉ "khác 200"
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_swarm_debates WHERE id = ?`,
      debateB,
    );
    assert.equal(row?.status, "open");
  },
);

test("POST .../debates/:id/synthesize: đồng thuận tuyệt đối khi mọi agent concur", S, async () => {
  const projectId = await taoDuAn("swsyok1");
  const pm = await taoUser("pm", "swsyok1");
  const debateId = await taoDebate(pm, projectId, "swsyok1");
  const { POST: addArg } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
  await dangNhapDuAn(pm, projectId);
  await addArg(
    jreq("/x", { agentRole: "agent_structural", stance: "concur", argumentText: "Đồng ý" }),
    { params: Promise.resolve({ id: debateId }) },
  );
  const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/synthesize/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: debateId }) });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, "synthesized");
  assert.equal(updated.consensus_level, "unanimous");
});

test("POST .../debates/:id/synthesize: cần người quyết khi phản đối áp đảo", S, async () => {
  const projectId = await taoDuAn("swsyok2");
  const pm = await taoUser("pm", "swsyok2");
  const debateId = await taoDebate(pm, projectId, "swsyok2");
  await dangNhapDuAn(pm, projectId);
  const { POST: addArg } = await import("@/app/api/engineering/swarm/debates/[id]/arguments/route");
  await addArg(
    jreq("/x", { agentRole: "agent_safety", stance: "object", argumentText: "Không an toàn" }),
    { params: Promise.resolve({ id: debateId }) },
  );
  await addArg(
    jreq("/x", { agentRole: "agent_reviewer", stance: "concur", argumentText: "Vẫn ổn" }),
    { params: Promise.resolve({ id: debateId }) },
  );
  const { POST } = await import("@/app/api/engineering/swarm/debates/[id]/synthesize/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: debateId }) });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.consensus_level, "human_escalation_required");
});

// ============================================================================
// POST /api/engineering/swarm/drafts
// ============================================================================

test("POST /api/engineering/swarm/drafts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/swarm/drafts/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/swarm/drafts: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("swdr403");
  const sub = await taoUser("subcon", "swdr403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/swarm/drafts/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/swarm/drafts: thiếu draftType/title/topic/synthesis → 422",
  S,
  async () => {
    const projectId = await taoDuAn("swdrval");
    const pm = await taoUser("pm", "swdrval");
    await batModule("engineering-swarm", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/swarm/drafts/route");
    const res = await POST(jreq("/x", {}));
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/engineering/swarm/drafts: soạn thảo thành công kèm token dùng 1 lần",
  S,
  async () => {
    const projectId = await taoDuAn("swdrok");
    const pm = await taoUser("pm", "swdrok");
    await batModule("engineering-swarm", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/swarm/drafts/route");
    const res = await POST(
      jreq("/x", {
        draftType: "rfi",
        title: "RFI thay đổi tuyến ống",
        topic: "Tuyến ống trục kỹ thuật tầng 5",
        synthesis: "Đồng thuận dời tuyến ống 200mm",
      }),
    );
    assert.equal(res.status, 201);
    const draft = await res.json();
    assert.ok(draft.singleUseToken.startsWith("TKN-"));
    assert.equal(draft.isAuthorized, false);
    assert.ok(draft.provenanceHash.length > 0);
  },
);

// ============================================================================
// GET/POST /api/engineering/workflows
// ============================================================================

test("GET /api/engineering/workflows: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/workflows/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/workflows: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wfg403");
  const sub = await taoUser("subcon", "wfg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/workflows/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/workflows: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/workflows/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/workflows: bch xem được nhưng không tạo được → 403", S, async () => {
  const projectId = await taoDuAn("wfp403");
  const bch = await taoUser("bch", "wfp403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/workflows: thiếu title → 422 (zod)", S, async () => {
  const projectId = await taoDuAn("wfpval");
  const pm = await taoUser("pm", "wfpval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/route");
  const res = await POST(jreq("/x", { riskInputs: riskInputsThap() }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/workflows: Gate 0 chặn khi non-reversible thiếu rollbackStrategy " +
    "→ 422 kèm danh sách check hỏng, KHÔNG tạo bản ghi",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("wfg0");
    const pm = await taoUser("pm", "wfg0");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/route");
    const before = await query(
      `SELECT id FROM engineering_workflows WHERE project_id = ?`,
      projectId,
    );
    const res = await POST(
      jreq("/x", { title: "Đổi kích thước ống chính", riskInputs: { reversible: false } }),
    );
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.gate0);
    assert.equal(
      body.gate0.checks.some((c: { ok: boolean }) => !c.ok),
      true,
    );
    const after = await query(
      `SELECT id FROM engineering_workflows WHERE project_id = ?`,
      projectId,
    );
    assert.equal(after.length, before.length);
  },
);

test(
  "POST /api/engineering/workflows: Gate 0 chặn khi suggestion nguồn chưa 'accepted' → 422",
  S,
  async () => {
    const projectId = await taoDuAn("wfg0sug");
    const pm = await taoUser("pm", "wfg0sug");
    const sId = await taoSuggestion(projectId, "wfg0sug");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/route");
    const res = await POST(
      jreq("/x", { title: "Áp dụng đề xuất", suggestionId: sId, riskInputs: riskInputsThap() }),
    );
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/engineering/workflows: safetyRisk → luôn PROFILE-E (critical) bất kể yếu tố khác",
  S,
  async () => {
    const projectId = await taoDuAn("wfprofE");
    const pm = await taoUser("pm", "wfprofE");
    const { id, status } = await taoWorkflow(pm, projectId, "wfprofE", {
      riskInputs: { safetyRisk: true, reversible: true },
    });
    assert.equal(status, 201);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ profile: string; risk_class: string }>(
      `SELECT profile, risk_class FROM engineering_workflows WHERE id = ?`,
      id,
    );
    assert.equal(row?.risk_class, "critical");
    assert.equal(row?.profile, "E");
  },
);

test(
  "POST /api/engineering/workflows: không side effect → PROFILE-A dù risk gì đi nữa",
  S,
  async () => {
    const projectId = await taoDuAn("wfprofA");
    const pm = await taoUser("pm", "wfprofA");
    const { id, status } = await taoWorkflow(pm, projectId, "wfprofA", {
      hasSideEffect: false,
      riskInputs: { safetyRisk: true, reversible: true },
    });
    assert.equal(status, 201);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ profile: string }>(
      `SELECT profile FROM engineering_workflows WHERE id = ?`,
      id,
    );
    assert.equal(row?.profile, "A");
  },
);

test("GET /api/engineering/workflows: liệt kê đúng dự án + lọc theo state", S, async () => {
  const projectA = await taoDuAn("wflistA");
  const projectB = await taoDuAn("wflistB");
  const pmA = await taoUser("pm", "wflistA");
  const pmB = await taoUser("pm", "wflistB");
  const wfA = await taoWorkflow(pmA, projectA, "wflistA", {});
  await taoWorkflow(pmB, projectB, "wflistB", {});
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/engineering/workflows/route");
  const res = await GET(greq("/x?state=draft"));
  assert.equal(res.status, 200);
  const { workflows } = await res.json();
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].id, wfA.id);
});

// ============================================================================
// GET /api/engineering/workflows/:id
// ============================================================================

test("GET /api/engineering/workflows/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/workflows/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("GET /api/engineering/workflows/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wfdg403");
  const sub = await taoUser("subcon", "wfdg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/workflows/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test("GET /api/engineering/workflows/:id: workflow thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("wfdgisoA");
  const projectB = await taoDuAn("wfdgisoB");
  const pmB = await taoUser("pm", "wfdgisoB");
  const wfB = await taoWorkflow(pmB, projectB, "wfdgisoB", {});
  const pmA = await taoUser("pm", "wfdgisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/engineering/workflows/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: wfB.id }) });
  assert.equal(res.status, 404);
});

test("GET /api/engineering/workflows/:id: chi tiết đủ gate + event tạo", S, async () => {
  const projectId = await taoDuAn("wfdgok");
  const pm = await taoUser("pm", "wfdgok");
  const wf = await taoWorkflow(pm, projectId, "wfdgok", { riskInputs: riskInputsThap() });
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/workflows/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: wf.id }) });
  assert.equal(res.status, 200);
  const { workflow, gates, events } = await res.json();
  assert.equal(workflow.state, "draft");
  assert.equal(gates.length, 1); // low risk, hasSideEffect mặc định true → PROFILE-B (1 gate)
  assert.equal(events.length, 1);
  assert.equal(events[0].toState, "draft");
});

// ============================================================================
// POST /api/engineering/workflows/:id/submit
// ============================================================================

test("POST /api/engineering/workflows/:id/submit: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/workflows/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST /api/engineering/workflows/:id/submit: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wfs403");
  const sub = await taoUser("subcon", "wfs403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/workflows/:id/submit: workflow thuộc dự án khác → 422 (không lộ/không đổi)",
  S,
  async () => {
    const projectA = await taoDuAn("wfsisoA");
    const projectB = await taoDuAn("wfsisoB");
    const pmB = await taoUser("pm", "wfsisoB");
    const wfB = await taoWorkflow(pmB, projectB, "wfsisoB", {});
    const pmA = await taoUser("pm", "wfsisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: wfB.id }) });
    assert.equal(res.status, 422);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ state: string }>(
      `SELECT state FROM engineering_workflows WHERE id = ?`,
      wfB.id,
    );
    assert.equal(row?.state, "draft");
  },
);

test(
  "POST /api/engineering/workflows/:id/submit: PROFILE-A (không side effect) tự duyệt luôn",
  S,
  async () => {
    const projectId = await taoDuAn("wfsA");
    const pm = await taoUser("pm", "wfsA");
    const wf = await taoWorkflow(pm, projectId, "wfsA", { hasSideEffect: false });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ state: string }>(
      `SELECT state FROM engineering_workflows WHERE id = ?`,
      wf.id,
    );
    assert.equal(row?.state, "approved");
  },
);

test(
  "POST /api/engineering/workflows/:id/submit: trình duyệt xong không trình lại được → 422",
  S,
  async () => {
    const projectId = await taoDuAn("wfstwice");
    const pm = await taoUser("pm", "wfstwice");
    const wf = await taoWorkflow(pm, projectId, "wfstwice", {});
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    const first = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });
    assert.equal(first.status, 200);
    const second = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });
    assert.equal(second.status, 422);
  },
);

// ============================================================================
// POST /api/engineering/workflows/:id/gates/:seq — ký gate + SoD
// ============================================================================

test("POST .../gates/:seq: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "x", seq: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST .../gates/:seq: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("gts403");
  const sub = await taoUser("subcon", "gts403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "x", seq: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST .../gates/:seq: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("gtsval");
  const pm = await taoUser("pm", "gtsval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
  const res = await POST(jreq("/x", { decision: "maybe" }), {
    params: Promise.resolve({ id: "x", seq: "1" }),
  });
  assert.equal(res.status, 422);
});

test("POST .../gates/:seq: seq không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("gtsseq");
  const pm = await taoUser("pm", "gtsseq");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "x", seq: "0" }),
  });
  assert.equal(res.status, 422);
});

test(
  "POST .../gates/:seq: người tạo workflow không được tự ký (separation of duties)",
  S,
  async () => {
    const projectId = await taoDuAn("sodcreator");
    // Người tạo phải là 'engineer' để KHỚP required_role của gate 1 — nếu không, route sẽ
    // trả lỗi sai vai trò trước khi kịp chạm luật SoD (bài học đo được: assertSeparationOfDuties
    // chạy SAU kiểm required_role trong approveGate).
    const creatorEng = await taoUser("engineer", "sodcreator");
    const wf = await taoWorkflow(creatorEng, projectId, "sodcreator", {});
    await dangNhapDuAn(creatorEng, projectId);
    const { POST: submit } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    await submit(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });
    // Người tạo (đúng vai trò 'engineer' của gate 1) vẫn không được tự ký chính gate đó.
    const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
    const res = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: wf.id, seq: "1" }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /không được tự ký/);
  },
);

test("POST .../gates/:seq: sai vai trò yêu cầu của gate → 422", S, async () => {
  const projectId = await taoDuAn("gtsrole");
  const pm = await taoUser("pm", "gtsrole");
  const wf = await taoWorkflow(pm, projectId, "gtsrole", {});
  await dangNhapDuAn(pm, projectId);
  const { POST: submit } = await import("@/app/api/engineering/workflows/[id]/submit/route");
  await submit(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });
  // PROFILE-B: gate 1 yêu cầu 'engineer'. Một PM khác (không phải người tạo, không phải
  // admin) không đủ vai trò để ký.
  const pm2 = await taoUser("pm", "gtsrole2");
  await dangNhapDuAn(pm2, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: wf.id, seq: "1" }),
  });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /yêu cầu vai trò/);
});

test(
  "POST .../gates/:seq: đủ chu trình PROFILE-C (gate 1 engineer → gate 2 pm) → workflow approved",
  S,
  async () => {
    const projectId = await taoDuAn("gtsflowC");
    const creator = await taoUser("pm", "gtsflowC");
    const wf = await taoWorkflow(creator, projectId, "gtsflowC", {
      riskInputs: { crossDiscipline: true, reversible: true },
    });
    const { queryOne } = await import("@/lib/db");
    const profileRow = await queryOne<{ profile: string }>(
      `SELECT profile FROM engineering_workflows WHERE id = ?`,
      wf.id,
    );
    assert.equal(profileRow?.profile, "C");

    await dangNhapDuAn(creator, projectId);
    const { POST: submit } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    await submit(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });

    const eng = await taoUser("engineer", "gtsflowC");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
    const g1 = await POST(jreq("/x", { decision: "approved", comments: "Đạt kỹ thuật" }), {
      params: Promise.resolve({ id: wf.id, seq: "1" }),
    });
    assert.equal(g1.status, 200);

    const pm2 = await taoUser("pm", "gtsflowC2");
    await dangNhapDuAn(pm2, projectId);
    const g2 = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: wf.id, seq: "2" }),
    });
    assert.equal(g2.status, 200);

    const wfRow = await queryOne<{ state: string }>(
      `SELECT state FROM engineering_workflows WHERE id = ?`,
      wf.id,
    );
    assert.equal(wfRow?.state, "approved");
  },
);

test(
  "POST .../gates/:seq: từ chối ở gate đầu → workflow rejected ngay, gate sau không cần ký",
  S,
  async () => {
    const projectId = await taoDuAn("gtsreject");
    const creator = await taoUser("pm", "gtsreject");
    const wf = await taoWorkflow(creator, projectId, "gtsreject", {
      riskInputs: { crossDiscipline: true, reversible: true },
    });
    await dangNhapDuAn(creator, projectId);
    const { POST: submit } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    await submit(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });

    const eng = await taoUser("engineer", "gtsreject");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
    const g1 = await POST(jreq("/x", { decision: "rejected", comments: "Không đạt" }), {
      params: Promise.resolve({ id: wf.id, seq: "1" }),
    });
    assert.equal(g1.status, 200);

    const { queryOne } = await import("@/lib/db");
    const wfRow = await queryOne<{ state: string }>(
      `SELECT state FROM engineering_workflows WHERE id = ?`,
      wf.id,
    );
    assert.equal(wfRow?.state, "rejected");
    const gate2 = await queryOne<{ decision: string | null }>(
      `SELECT decision FROM engineering_workflow_gates WHERE workflow_id = ? AND seq = 2`,
      wf.id,
    );
    assert.equal(gate2?.decision, null);
  },
);

test(
  "POST .../gates/:seq: risk cao — một người không được ký 2 gate trong cùng workflow",
  S,
  async () => {
    const projectId = await taoDuAn("sodtwogates");
    const creator = await taoUser("pm", "sodtwogates");
    // regulatoryRisk → high → PROFILE-D (gate 1 engineer, gate 2 pm, gate 3 admin).
    const wf = await taoWorkflow(creator, projectId, "sodtwogates", {
      riskInputs: { regulatoryRisk: true, reversible: true },
    });
    const { queryOne } = await import("@/lib/db");
    const profileRow = await queryOne<{ profile: string; risk_class: string }>(
      `SELECT profile, risk_class FROM engineering_workflows WHERE id = ?`,
      wf.id,
    );
    assert.equal(profileRow?.profile, "D");
    assert.equal(profileRow?.risk_class, "high");

    await dangNhapDuAn(creator, projectId);
    const { POST: submit } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    await submit(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });

    // Admin ký được mọi gate (vai trò cao nhất) — dùng cùng 1 admin ký gate 1 rồi thử ký
    // gate 2 → phải bị chặn bởi luật "1 người tối đa 1 gate" khi risk cao/tới hạn.
    const admin = await taoUser("admin", "sodtwogates");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
    const g1 = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: wf.id, seq: "1" }),
    });
    assert.equal(g1.status, 200);
    const g2 = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: wf.id, seq: "2" }),
    });
    assert.equal(g2.status, 422);
    assert.match((await g2.json()).error, /không được ký 2 gate/);
  },
);

test(
  "POST .../gates/:seq: ký khi workflow chưa 'awaiting_approval' (còn draft) → 422",
  S,
  async () => {
    const projectId = await taoDuAn("gtsdraft");
    const creator = await taoUser("pm", "gtsdraft");
    const wf = await taoWorkflow(creator, projectId, "gtsdraft", {});
    const eng = await taoUser("engineer", "gtsdraft");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/gates/[seq]/route");
    const res = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: wf.id, seq: "1" }),
    });
    assert.equal(res.status, 422);
  },
);

// ============================================================================
// POST /api/engineering/workflows/:id/transition
// ============================================================================

test("POST /api/engineering/workflows/:id/transition: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
  const res = await POST(jreq("/x", { to: "executing" }), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 401);
});

test("POST /api/engineering/workflows/:id/transition: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wft403");
  const sub = await taoUser("subcon", "wft403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
  const res = await POST(jreq("/x", { to: "executing" }), { params: Promise.resolve({ id: "x" }) });
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/workflows/:id/transition: trạng thái đích không hợp lệ → 422",
  S,
  async () => {
    const projectId = await taoDuAn("wftval");
    const pm = await taoUser("pm", "wftval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
    const res = await POST(jreq("/x", { to: "khong_ton_tai" }), {
      params: Promise.resolve({ id: "x" }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/engineering/workflows/:id/transition: chuyển bậy draft→completed bị chặn (state machine)",
  S,
  async () => {
    const projectId = await taoDuAn("wftbad");
    const pm = await taoUser("pm", "wftbad");
    const wf = await taoWorkflow(pm, projectId, "wftbad", {});
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
    const res = await POST(jreq("/x", { to: "completed" }), {
      params: Promise.resolve({ id: wf.id }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/engineering/workflows/:id/transition: workflow thuộc dự án khác → 422, không đổi state",
  S,
  async () => {
    const projectA = await taoDuAn("wftisoA");
    const projectB = await taoDuAn("wftisoB");
    const pmB = await taoUser("pm", "wftisoB");
    const wfB = await taoWorkflow(pmB, projectB, "wftisoB", {});
    const pmA = await taoUser("pm", "wftisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
    const res = await POST(jreq("/x", { to: "cancelled" }), {
      params: Promise.resolve({ id: wfB.id }),
    });
    assert.equal(res.status, 422);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ state: string }>(
      `SELECT state FROM engineering_workflows WHERE id = ?`,
      wfB.id,
    );
    assert.equal(row?.state, "draft");
  },
);

test(
  "POST /api/engineering/workflows/:id/transition: approved → executing → validating_result → " +
    "completed, mọi bước ghi event có lý do",
  S,
  async () => {
    const projectId = await taoDuAn("wftflow");
    const pm = await taoUser("pm", "wftflow");
    const wf = await taoWorkflow(pm, projectId, "wftflow", { hasSideEffect: false }); // PROFILE-A auto-approve
    await dangNhapDuAn(pm, projectId);
    const { POST: submit } = await import("@/app/api/engineering/workflows/[id]/submit/route");
    const s = await submit(jreq("/x", undefined), { params: Promise.resolve({ id: wf.id }) });
    assert.equal(s.status, 200);

    const { POST } = await import("@/app/api/engineering/workflows/[id]/transition/route");
    const t1 = await POST(jreq("/x", { to: "executing", reason: "Đang thi công thật" }), {
      params: Promise.resolve({ id: wf.id }),
    });
    assert.equal(t1.status, 200);
    const t2 = await POST(jreq("/x", { to: "validating_result" }), {
      params: Promise.resolve({ id: wf.id }),
    });
    assert.equal(t2.status, 200);
    const t3 = await POST(jreq("/x", { to: "completed", reason: "Nghiệm thu xong" }), {
      params: Promise.resolve({ id: wf.id }),
    });
    assert.equal(t3.status, 200);

    const { GET } = await import("@/app/api/engineering/workflows/[id]/route");
    const detail = await GET(greq("/x"), { params: Promise.resolve({ id: wf.id }) });
    const { workflow, events } = await detail.json();
    assert.equal(workflow.state, "completed");
    assert.ok(
      events.some(
        (e: { toState: string; reason: string | null }) =>
          e.toState === "executing" && e.reason === "Đang thi công thật",
      ),
    );
    assert.ok(events.some((e: { toState: string }) => e.toState === "completed"));
  },
);

// ============================================================================
// ĐÃ VÁ Ở ĐỢT 6 (Việc A) — giữ lại ghi chú để không ai "sửa lùi" về khuôn cũ
// ============================================================================
//
// lib/ky-thuat/engineering-autonomy.ts::executeExecutionRequest trước đây ghi
// `UPDATE ... SET status='killed'` rồi `throw` NGAY SAU, cả hai trong cùng một
// `withProjectScope(projectId, ..., { readOnly: false })` — vốn bọc `withTransaction`
// (lib/db/index.ts) — nên ROLLBACK xoá luôn lệnh huỷ vừa ghi. Bản ghi ở lại `authorized` với
// `approval_token` còn hạn 15 phút: bật kill switch rồi tắt lại trong cửa sổ đó thì đúng yêu
// cầu lẽ ra đã bị huỷ vẫn thực thi được thật.
//
// Bản vá giữ một transaction cho đường thành công, còn nhánh huỷ trả về giá trị đánh dấu rồi
// ghi `status='killed', approval_token = NULL` ở một transaction THỨ HAI trước khi `throw`;
// kèm `SELECT ... FOR UPDATE` + `UPDATE ... AND status='authorized' AND approval_token = ?`
// để đóng cửa sổ đua. Ca ở trên vì thế nay khẳng định `status = 'killed'` (không còn
// 'authorized'). Phủ đầy đủ bất biến: tests/engineering-autonomy-kill-switch.test.ts.
