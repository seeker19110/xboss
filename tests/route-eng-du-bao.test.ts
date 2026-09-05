import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING — dự báo, đấu thầu & tài chính
// (Đợt 5 chiến dịch coverage — Việc W3). Route:
//   - app/api/engineering/predictions/route.ts                        (GET danh sách dự báo)
//   - app/api/engineering/predictions/[id]/decide/route.ts            (POST chấp nhận/bỏ qua dự báo)
//   - app/api/engineering/predictions/run/route.ts                    (POST chạy pipeline dự báo)
//   - app/api/engineering/prescriptive/scenarios/route.ts             (GET danh sách kịch bản)
//   - app/api/engineering/prescriptive/scenarios/[id]/approve/route.ts (POST phê duyệt kịch bản)
//   - app/api/engineering/prescriptive/simulate/route.ts              (POST mô phỏng What-If)
//   - app/api/engineering/cashflow/forecasts/route.ts                 (GET danh sách dự báo dòng tiền)
//   - app/api/engineering/cashflow/simulate/route.ts                  (POST mô phỏng dòng tiền)
//   - app/api/engineering/fidic/claims/route.ts                       (GET/POST khiếu nại FIDIC)
//   - app/api/engineering/fidic/claims/generate-dossier/route.ts      (POST sinh hồ sơ khiếu nại)
//   - app/api/engineering/fidic-tia/route.ts                          (GET/POST TIA claim)
//   - app/api/engineering/bidding/packages/route.ts                   (GET/POST gói thầu)
//   - app/api/engineering/bidding/quotes/route.ts                     (GET/POST báo giá NCC)
//   - app/api/engineering/bidding/analyze/route.ts                    (POST phân tích đấu thầu)
//   - app/api/engineering/subcon-ai/scores/route.ts                   (GET/POST hồ sơ thầu phụ AI)
//   - app/api/engineering/subcon-ai/evaluate/route.ts                 (POST chấm điểm tín nhiệm)
//   - app/api/engineering/subcon-ai/recommend-shortlist/route.ts      (POST đề xuất mời thầu)
//   - app/api/engineering/carbon-lca/route.ts                         (GET/POST LCA Carbon)
//   - app/api/engineering/qs-bom-explosion/route.ts                   (GET/POST QS omnipotent)
//   - app/api/engineering/shopdrawing-lod400/route.ts                 (GET/POST Shopdrawing LOD400)
//   - app/api/engineering/multi-agent-copilot/route.ts                (GET/POST Co-Pilot đa agent)
//   - app/api/engineering/pinnacle/pulse/route.ts                     (GET/POST Apex Pulse)
//
// Xác nhận (đọc code): không route nào trong cụm này gọi mạng ra ngoài — mọi hàm "AI"/dự báo là
// hàm xác định (deterministic), không `fetch`/LLM/HTTP client nào trong các module
// lib/ky-thuat/engineering-{predictions,prescriptive,cashflow,bidding-matrix,subcon-ai,carbon-lca,
// qs-omnipotent,shopdrawing-omnipotent,multi-agent-copilot,pinnacle-synergy}.ts và
// lib/tai-chinh/contracts-fidic.ts (đã `grep` không thấy `fetch(`/`http`/`openai`/`anthropic`).

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `EngDuBao ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `edb-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-edb', ?, ?)`,
    `EDB ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId };
}

/** Bật một module thử nghiệm (thuNghiem: true trong lib/nen/modules.ts) cho 1 dự án — các route
 * predictions/prescriptive/subcon-ai/fidic-tia gọi `assertModuleEnabled` và mặc định bị TẮT. */
async function batTinhNang(moduleKey: string, projectId: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO feature_flags (module_key, project_id, enabled) VALUES (?, ?, TRUE)
     ON CONFLICT (module_key, project_id) DO UPDATE SET enabled = TRUE`,
    moduleKey,
    projectId,
  );
}

/** Đảm bảo bảng `user_projects` không rỗng trước khi kiểm ca "chưa chọn dự án" — tránh bẫy
 * `visibleProjectIds` coi bảng rỗng = "user thấy mọi dự án" (xem comment đầu tests/helpers/phien.ts). */
async function damBaoUserProjectsKhongRong(): Promise<void> {
  const { queryOne } = await import("@/lib/db");
  const hang = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM user_projects`);
  if ((hang?.n ?? 0) > 0) return;
  const pid = await taoDuAn("nhieu");
  const u = await taoUser("viewer", "nhieu");
  await dangNhapDuAn(u, pid);
  dangXuat();
}

async function taoNCC(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, `NCC ${uniq(ten)}`, orgId);
}

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

async function dungSheet(projectId: number, ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp EDB')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet EDB')`,
    towerId,
    `EDB${uniq(ten)}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoNhom(sheetTypeId: number, code: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES (?, ?, ?, 0)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
  );
}

async function taoTaskTre(
  packageId: number,
  code: string,
  overrides: { progress?: number; status?: string; endDate?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status, end_date)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
    packageId,
    code,
    `Task ${code}`,
    overrides.progress ?? 0.3,
    overrides.status ?? "tre",
    overrides.endDate ?? "2020-01-01",
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

// ============================================================================
// GET /api/engineering/predictions + POST run + POST [id]/decide
// ============================================================================

test("GET /api/engineering/predictions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/predictions/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/predictions: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("predview403");
  const u = await taoUser("subcon", "predview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/predictions/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/predictions: chưa chọn dự án → 400", S, async () => {
  await damBaoUserProjectsKhongRong();
  const u = await taoUser("pm", "predview400");
  dangNhap(u);
  const { GET } = await import("@/app/api/engineering/predictions/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("GET /api/engineering/predictions: module đang tắt → 404", S, async () => {
  const projectId = await taoDuAn("predoff");
  const pm = await taoUser("pm", "predoff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/predictions/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 404);
});

test("POST /api/engineering/predictions/run: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/predictions/run/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/predictions/run: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("predrun403");
  const eng = await taoUser("engineer", "predrun403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/predictions/run/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/predictions/run: chạy pipeline schedule_risk trên task trễ hạn → " +
    "sinh dự báo + suggestion, GET/decide đọc lại đúng dữ liệu",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("predrunok");
    const pm = await taoUser("pm", "predrunok");
    await batTinhNang("engineering-predictions", projectId);
    const { sheetTypeId } = await dungSheet(projectId, "predrunok");
    const pkgId = await taoNhom(sheetTypeId, `PK-${uniq("predrunok")}`);
    const taskId = await taoTaskTre(pkgId, `T-${uniq("predrunok")}`);

    await dangNhapDuAn(pm, projectId);
    const { POST: RUN } = await import("@/app/api/engineering/predictions/run/route");
    const runRes = await RUN(jreq("/x", { useCase: "schedule_risk" }));
    assert.equal(runRes.status, 200);
    const runBody = await runRes.json();
    assert.equal(runBody.outputsCount, 1);
    assert.equal(runBody.outputs[0].entityId, String(taskId));
    assert.equal(runBody.outputs[0].status, "active");
    assert.ok(runBody.outputs[0].suggestionId, "phải tự tạo suggestion kèm theo dự báo");

    // GET danh sách phải thấy đúng dự báo vừa tạo
    const { GET } = await import("@/app/api/engineering/predictions/route");
    const listRes = await GET(jreq("/x", undefined, "GET"));
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.predictions.length, 1);
    const predictionId = listBody.predictions[0].id;

    // Quyết định "accepted" → cập nhật đúng dòng
    const { POST: DECIDE } = await import("@/app/api/engineering/predictions/[id]/decide/route");
    const decideRes = await DECIDE(jreq("/x", { decision: "accepted" }), {
      params: Promise.resolve({ id: predictionId }),
    });
    assert.equal(decideRes.status, 200);
    assert.equal((await decideRes.json()).success, true);

    const row = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_prediction_outputs WHERE id = ?`,
      predictionId,
    );
    assert.equal(row?.status, "accepted");
  },
);

test("POST /api/engineering/predictions/run: useCase clash_priority chạy trên engineering_objects đang pending_review", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("predclash");
  const pm = await taoUser("pm", "predclash");
  await batTinhNang("engineering-predictions", projectId);
  const objRow = await queryOne<{ id: string }>(
    `INSERT INTO engineering_objects
       (project_id, external_key, object_type, discipline, status, created_by, updated_by)
     VALUES (?, ?, 'pipe', 'hvac', 'pending_review', ?, ?) RETURNING id`,
    projectId,
    `OBJ-${uniq("predclash")}`,
    pm.id,
    pm.id,
  );
  const objId = objRow!.id;
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/predictions/run/route");
  const res = await POST(jreq("/x", { useCase: "clash_priority" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.outputsCount, 1);
  assert.equal(body.outputs[0].entityId, objId);
  assert.equal(body.outputs[0].entityType, "object");
});

test("POST /api/engineering/predictions/[id]/decide: decision không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("preddecval");
  const pm = await taoUser("pm", "preddecval");
  await batTinhNang("engineering-predictions", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/predictions/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "khong-hop-le" }), {
    params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/predictions/[id]/decide: dự báo thuộc dự án khác → " +
    "không cập nhật (success=false), dữ liệu dự án B giữ nguyên",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectA = await taoDuAn("preddecisoA");
    const projectB = await taoDuAn("preddecisoB");
    const pmA = await taoUser("pm", "preddecisoA");
    const pmB = await taoUser("pm", "preddecisoB");
    await batTinhNang("engineering-predictions", projectA);
    await batTinhNang("engineering-predictions", projectB);
    const { sheetTypeId } = await dungSheet(projectB, "preddecisoB");
    const pkgId = await taoNhom(sheetTypeId, `PK-${uniq("preddecisoB")}`);
    await taoTaskTre(pkgId, `T-${uniq("preddecisoB")}`);

    await dangNhapDuAn(pmB, projectB);
    const { POST: RUN } = await import("@/app/api/engineering/predictions/run/route");
    const runRes = await RUN(jreq("/x", { useCase: "schedule_risk" }));
    const predictionId = (await runRes.json()).outputs[0].id;

    await dangNhapDuAn(pmA, projectA);
    const { POST: DECIDE } = await import("@/app/api/engineering/predictions/[id]/decide/route");
    const decideRes = await DECIDE(jreq("/x", { decision: "dismissed" }), {
      params: Promise.resolve({ id: predictionId }),
    });
    assert.equal(decideRes.status, 200);
    assert.equal((await decideRes.json()).success, false);

    const row = await queryOne<{ status: string; project_id: number }>(
      `SELECT status, project_id FROM engineering_prediction_outputs WHERE id = ?`,
      predictionId,
    );
    assert.equal(row?.status, "active", "trạng thái của dự án B không đổi");
    assert.equal(row?.project_id, projectB);
  },
);

// ============================================================================
// GET /api/engineering/prescriptive/scenarios + POST simulate + POST [id]/approve
// ============================================================================

test("GET /api/engineering/prescriptive/scenarios: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/prescriptive/scenarios/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/prescriptive/scenarios: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("presview403");
  const u = await taoUser("subcon", "presview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/prescriptive/scenarios/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/prescriptive/scenarios: module đang tắt → 404", S, async () => {
  const projectId = await taoDuAn("presoff");
  const pm = await taoUser("pm", "presoff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/prescriptive/scenarios/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 404);
});

test("POST /api/engineering/prescriptive/simulate: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/prescriptive/simulate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/prescriptive/simulate: engineer không được kích hoạt (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("pressim403");
  const eng = await taoUser("engineer", "pressim403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/prescriptive/simulate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/prescriptive/simulate: thiếu trường bắt buộc → 400", S, async () => {
  const projectId = await taoDuAn("pressimval");
  const pm = await taoUser("pm", "pressimval");
  await batTinhNang("engineering-prescriptive", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/prescriptive/simulate/route");
  const res = await POST(jreq("/x", { scenarioCode: "SC1" }));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/prescriptive/simulate: mô phỏng thành công → 201, Pareto Frontier " +
    "khác rỗng; GET liệt kê lại đúng; POST [id]/approve chuyển trạng thái approved",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("pressimok");
    const pm = await taoUser("pm", "pressimok");
    await batTinhNang("engineering-prescriptive", projectId);
    await dangNhapDuAn(pm, projectId);

    const { POST: SIM } = await import("@/app/api/engineering/prescriptive/simulate/route");
    const simRes = await SIM(
      jreq("/x", {
        scenarioCode: `SC-${uniq("pressimok")}`,
        triggerReason: "Chậm tiến độ trục MEPF Zone A",
        baselineScheduleDays: 90,
        baselineCostVnd: 5_000_000_000,
      }),
    );
    assert.equal(simRes.status, 201);
    const simBody = await simRes.json();
    assert.equal(simBody.success, true);
    assert.ok(simBody.scenario.pareto_frontier.length > 0);
    const scenarioId = simBody.scenario.id;

    const { GET } = await import("@/app/api/engineering/prescriptive/scenarios/route");
    const listRes = await GET(jreq("/x", undefined, "GET"));
    const listBody = await listRes.json();
    assert.equal(listBody.length, 1);
    assert.equal(listBody[0].id, scenarioId);

    const { POST: APPROVE } = await import(
      "@/app/api/engineering/prescriptive/scenarios/[id]/approve/route"
    );
    const approveRes = await APPROVE(jreq("/x", {}), {
      params: Promise.resolve({ id: scenarioId }),
    });
    assert.equal(approveRes.status, 200);
    const approveBody = await approveRes.json();
    assert.equal(approveBody.scenario.status, "approved");
    assert.equal(approveBody.scenario.approved_by, pm.id);

    const row = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_prescriptive_scenarios WHERE id = ?`,
      scenarioId,
    );
    assert.equal(row?.status, "approved");
  },
);

test(
  "POST /api/engineering/prescriptive/scenarios/[id]/approve: kịch bản thuộc dự án khác → " +
    "404, dữ liệu dự án B không đổi",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectA = await taoDuAn("presisoA");
    const projectB = await taoDuAn("presisoB");
    const pmA = await taoUser("pm", "presisoA");
    const pmB = await taoUser("pm", "presisoB");
    await batTinhNang("engineering-prescriptive", projectA);
    await batTinhNang("engineering-prescriptive", projectB);

    await dangNhapDuAn(pmB, projectB);
    const { POST: SIM } = await import("@/app/api/engineering/prescriptive/simulate/route");
    const simRes = await SIM(
      jreq("/x", {
        scenarioCode: `SC-${uniq("presisoB")}`,
        triggerReason: "lý do B",
        baselineScheduleDays: 60,
        baselineCostVnd: 2_000_000_000,
      }),
    );
    const scenarioId = (await simRes.json()).scenario.id;

    await dangNhapDuAn(pmA, projectA);
    const { POST: APPROVE } = await import(
      "@/app/api/engineering/prescriptive/scenarios/[id]/approve/route"
    );
    const approveRes = await APPROVE(jreq("/x", {}), {
      params: Promise.resolve({ id: scenarioId }),
    });
    assert.equal(approveRes.status, 404);

    const row = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_prescriptive_scenarios WHERE id = ?`,
      scenarioId,
    );
    assert.equal(row?.status, "simulated", "kịch bản dự án B không bị đổi trạng thái");
  },
);

// ============================================================================
// GET /api/engineering/cashflow/forecasts + POST simulate
// ============================================================================

test("GET /api/engineering/cashflow/forecasts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/cashflow/forecasts/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/cashflow/forecasts: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cfview403");
  const u = await taoUser("subcon", "cfview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/cashflow/forecasts/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST /api/engineering/cashflow/simulate: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/cashflow/simulate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/cashflow/simulate: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cfsim403");
  const u = await taoUser("subcon", "cfsim403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/cashflow/simulate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/cashflow/simulate: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("cfsimval");
  const pm = await taoUser("pm", "cfsimval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/cashflow/simulate/route");
  const res = await POST(jreq("/x", { runName: "Run 1" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/cashflow/simulate: mô phỏng thành công → 201/200 với kỳ T0 tạm ứng " +
    "đúng advancePercent, GET liệt kê lại đúng",
  S,
  async () => {
    const projectId = await taoDuAn("cfsimok");
    const pm = await taoUser("pm", "cfsimok");
    await dangNhapDuAn(pm, projectId);

    const { POST } = await import("@/app/api/engineering/cashflow/simulate/route");
    const res = await POST(
      jreq("/x", {
        runName: `Run-${uniq("cfsimok")}`,
        totalContractValue: 10_000_000_000,
        advancePercent: 20,
        retentionPercent: 5,
        paymentDelayDays: 30,
        durationPeriods: 6,
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    // Kỳ T0 = tạm ứng = 20% giá trị hợp đồng — phép nhân đơn giản trên số nhập, không cộng
    // dồn nhiều dòng tiền từ DB (không vi phạm quy ước Tiền tệ M45 PR1).
    assert.equal(body.data.projections[0].projectedCashIn, 2_000_000_000);
    assert.equal(body.data.projections.length, 7); // T0 + 6 kỳ
    assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.data.risk.riskLevel));

    const { GET } = await import("@/app/api/engineering/cashflow/forecasts/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 1);
    assert.equal(Number(listBody.data[0].totalContractValue), 10_000_000_000);
  },
);

test(
  "POST /api/engineering/cashflow/simulate: gửi projectId của dự án không thuộc quyền → 403 " +
    "(chotProjectIdChoGhi chặn IDOR)",
  S,
  async () => {
    const projectA = await taoDuAn("cfidorA");
    const projectB = await taoDuAn("cfidorB");
    const pmA = await taoUser("pm", "cfidorA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/cashflow/simulate/route");
    const res = await POST(
      jreq("/x", {
        projectId: projectB,
        runName: "x",
        totalContractValue: 1_000_000,
      }),
    );
    assert.equal(res.status, 403);
  },
);

// ============================================================================
// GET/POST /api/engineering/fidic/claims + POST generate-dossier
// ============================================================================

test("GET /api/engineering/fidic/claims: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/fidic/claims/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/fidic/claims: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("fcview403");
  const u = await taoUser("subcon", "fcview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/fidic/claims/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST /api/engineering/fidic/claims: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/fidic/claims/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/fidic/claims: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("fcval");
  const pm = await taoUser("pm", "fcval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/fidic/claims/route");
  const res = await POST(jreq("/x", { claimCode: "CLM-1" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/fidic/claims: lập khiếu nại thành công → GET liệt kê lại đúng dossier",
  S,
  async () => {
    const projectId = await taoDuAn("fcok");
    const pm = await taoUser("pm", "fcok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/fidic/claims/route");
    const res = await POST(
      jreq("/x", {
        claimCode: `CLM-${uniq("fcok")}`,
        eventType: "ACCESS_DELAY",
        eventTitle: "Chậm bàn giao mặt bằng trục A",
        eventDate: "2026-01-01",
        noticeDate: "2026-01-10",
        eotDaysClaimed: 14,
        costClaimedVnd: 500_000_000,
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id);

    const { GET } = await import("@/app/api/engineering/fidic/claims/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 1);
    assert.equal(listBody.data[0].eot_days_claimed, 14);
    assert.ok(listBody.data[0].dossier_content.includes("EXTENSION OF TIME"));
  },
);

test(
  "POST /api/engineering/fidic/claims: gửi projectId dự án không thuộc quyền → 403",
  S,
  async () => {
    const projectA = await taoDuAn("fcidorA");
    const projectB = await taoDuAn("fcidorB");
    const pmA = await taoUser("pm", "fcidorA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/fidic/claims/route");
    const res = await POST(
      jreq("/x", {
        projectId: projectB,
        claimCode: `CLM-${uniq("fcidor")}`,
        eventTitle: "x",
        eventDate: "2026-01-01",
        noticeDate: "2026-01-05",
      }),
    );
    assert.equal(res.status, 403);
  },
);

test("POST /api/engineering/fidic/claims/generate-dossier: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/fidic/claims/generate-dossier/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/fidic/claims/generate-dossier: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("fcgen403");
  const u = await taoUser("subcon", "fcgen403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/fidic/claims/generate-dossier/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/fidic/claims/generate-dossier: sinh hồ sơ TIA đúng số ngày sự kiện " +
    "trên đường găng (critical path)",
  S,
  async () => {
    const projectId = await taoDuAn("fcgenok");
    const pm = await taoUser("pm", "fcgenok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/fidic/claims/generate-dossier/route");
    const res = await POST(
      jreq("/x", {
        claimCode: "CLM-TIA-1",
        eventDate: "2026-01-01",
        noticeDate: "2026-01-05",
        dailyOverheadVnd: 10_000_000,
        events: [
          {
            title: "Chậm bàn giao",
            eventType: "ACCESS_DELAY",
            startDate: "2026-01-01",
            endDate: "2026-01-10",
            isOnCriticalPath: true,
            directDelayDays: 9,
          },
          {
            title: "Sự kiện không trên đường găng",
            eventType: "OTHER",
            startDate: "2026-01-01",
            endDate: "2026-01-03",
            isOnCriticalPath: false,
            directDelayDays: 2,
          },
        ],
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.tia.eotDaysRecommended, 9, "chỉ tính sự kiện trên đường găng");
    assert.equal(body.data.tia.prolongationCostVnd, 9 * 10_000_000);
    assert.equal(body.data.compliance.isCompliant, true);
  },
);

// ============================================================================
// GET/POST /api/engineering/fidic-tia
// ============================================================================

test("GET /api/engineering/fidic-tia: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/fidic-tia/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/fidic-tia: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ftview403");
  const u = await taoUser("subcon", "ftview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/fidic-tia/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/engineering/fidic-tia: module đang tắt → 404", S, async () => {
  const projectId = await taoDuAn("ftoff");
  const pm = await taoUser("pm", "ftoff");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/fidic-tia/route");
  const res = await GET();
  assert.equal(res.status, 404);
});

test("POST /api/engineering/fidic-tia: bch không có quyền tạo (chỉ Admin/PM/Engineer) → 403", S, async () => {
  const projectId = await taoDuAn("ftpost403");
  const u = await taoUser("bch", "ftpost403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/fidic-tia/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/fidic-tia: phân tích + lưu hồ sơ TIA → merkleProofHash & deadline " +
    "đúng 28 ngày; GET liệt kê lại",
  S,
  async () => {
    const projectId = await taoDuAn("ftok");
    const pm = await taoUser("pm", "ftok");
    await batTinhNang("engineering-nextgen-apex", projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/fidic-tia/route");
    const res = await POST(
      jreq("/x", {
        claimCode: `TIA-${uniq("ftok")}`,
        delayEventTitle: "Chậm bàn giao mặt bằng",
        eventCategory: "EMPLOYER_DELAY",
        delayStartDate: "2026-02-01",
        delayEndDate: "2026-02-11",
        impactedTasks: [
          { taskId: 1, taskName: "T1", originalDurationDays: 10, delayDays: 10 },
        ],
        dailyOverheadCostVnd: 20_000_000,
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.match(body.result.merkleProofHash, /^MERKLE-CLAIM-[0-9A-F]{24}$/);
    assert.equal(body.result.timeBarDeadlineDate, "2026-03-01");
    assert.equal(body.result.totalProlongationCostVnd, 10 * 20_000_000);

    const { GET } = await import("@/app/api/engineering/fidic-tia/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listBody.totalCount, 1);
  },
);

// ============================================================================
// GET/POST /api/engineering/bidding/packages + quotes + POST analyze
// ============================================================================

test("GET /api/engineering/bidding/packages: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/bidding/packages/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/bidding/packages: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("bpview403");
  const u = await taoUser("subcon", "bpview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/bidding/packages/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/bidding/packages: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("bpval");
  const pm = await taoUser("pm", "bpval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/bidding/packages/route");
  const res = await POST(jreq("/x", { packageCode: "PKG1" }));
  assert.equal(res.status, 422);
});

async function taoGoiThau(pm: { id: number }, projectId: number, ten: string): Promise<string> {
  const { POST } = await import("@/app/api/engineering/bidding/packages/route");
  const res = await POST(
    jreq("/x", {
      packageCode: `PKG-${uniq(ten)}`,
      title: `Gói thầu ${ten}`,
      discipline: "hvac",
      targetBudgetVnd: 1_000_000_000,
    }),
  );
  const body = await res.json();
  return body.data.id;
}

test(
  "POST /api/engineering/bidding/packages: tạo thành công → GET liệt kê lại đúng dự án",
  S,
  async () => {
    const projectId = await taoDuAn("bpok");
    const pm = await taoUser("pm", "bpok");
    await dangNhapDuAn(pm, projectId);
    const pkgId = await taoGoiThau(pm, projectId, "bpok");
    assert.ok(pkgId);

    const { GET } = await import("@/app/api/engineering/bidding/packages/route");
    const listRes = await GET(jreq("/x", undefined, "GET"));
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 1);
    assert.equal(listBody.data[0].id, pkgId);
  },
);

test(
  "POST /api/engineering/bidding/packages: gửi projectId dự án không thuộc quyền → 403",
  S,
  async () => {
    const projectA = await taoDuAn("bpidorA");
    const projectB = await taoDuAn("bpidorB");
    const pmA = await taoUser("pm", "bpidorA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/bidding/packages/route");
    const res = await POST(
      jreq("/x", {
        projectId: projectB,
        packageCode: "PKGX",
        title: "x",
        discipline: "hvac",
        targetBudgetVnd: 1,
      }),
    );
    assert.equal(res.status, 403);
  },
);

test("GET /api/engineering/bidding/quotes: thiếu packageId → 400", S, async () => {
  const projectId = await taoDuAn("bqval");
  const pm = await taoUser("pm", "bqval");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/bidding/quotes/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/bidding/quotes: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("bqinval");
  const pm = await taoUser("pm", "bqinval");
  await dangNhapDuAn(pm, projectId);
  const pkgId = await taoGoiThau(pm, projectId, "bqinval");
  const { POST } = await import("@/app/api/engineering/bidding/quotes/route");
  const res = await POST(jreq("/x", { packageId: pkgId }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/bidding/quotes → analyze: xếp hạng 2 báo giá theo composite score",
  S,
  async () => {
    const projectId = await taoDuAn("banalyze");
    const pm = await taoUser("pm", "banalyze");
    await dangNhapDuAn(pm, projectId);
    const pkgId = await taoGoiThau(pm, projectId, "banalyze");

    const { POST: QUOTE } = await import("@/app/api/engineering/bidding/quotes/route");
    const q1 = await QUOTE(
      jreq("/x", {
        packageId: pkgId,
        vendorName: "NCC rẻ",
        totalAmountVnd: 900_000_000,
        lineItems: [],
        capacityScore: 90,
        safetyScore: 90,
        technicalComplianceScore: 90,
      }),
    );
    assert.equal(q1.status, 200);
    const q2 = await QUOTE(
      jreq("/x", {
        packageId: pkgId,
        vendorName: "NCC đắt",
        totalAmountVnd: 1_500_000_000,
        lineItems: [],
      }),
    );
    assert.equal(q2.status, 200);

    const { GET } = await import("@/app/api/engineering/bidding/quotes/route");
    const listRes = await GET(jreq(`/x?packageId=${pkgId}`, undefined, "GET"));
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 2);

    const { POST: ANALYZE } = await import("@/app/api/engineering/bidding/analyze/route");
    const analyzeRes = await ANALYZE(jreq("/x", { packageId: pkgId }));
    assert.equal(analyzeRes.status, 200);
    const analyzeBody = await analyzeRes.json();
    assert.equal(analyzeBody.data.quotesCount, 2);
    assert.equal(analyzeBody.data.rankings.length, 2);
    assert.equal(analyzeBody.data.rankings[0].vendorName, "NCC rẻ", "giá thấp hơn xếp hạng cao hơn");
    assert.match(analyzeBody.data.provenanceToken, /^BID-ANALYTICS-[0-9A-F]{16}$/);
  },
);

test("POST /api/engineering/bidding/analyze: thiếu packageId → 400", S, async () => {
  const projectId = await taoDuAn("banalyzeval");
  const pm = await taoUser("pm", "banalyzeval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/bidding/analyze/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

// ============================================================================
// GET/POST /api/engineering/subcon-ai/scores + evaluate + recommend-shortlist
// ============================================================================

test("GET /api/engineering/subcon-ai/scores: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/engineering/subcon-ai/scores: subcon không có quyền xem → 403 " +
    "(BUG THẬT đã vá cùng đợt này — route trước đây KHÔNG kiểm CAN nào, mọi user đăng nhập kể " +
    "cả thầu phụ đọc được điểm tín nhiệm + chỉ số thương mại của MỌI thầu phụ khác trong dự án)",
  S,
  async () => {
    const projectId = await taoDuAn("saview403");
    const u = await taoUser("subcon", "saview403");
    await dangNhapDuAn(u, projectId);
    const { GET } = await import("@/app/api/engineering/subcon-ai/scores/route");
    const res = await GET(jreq("/x", undefined, "GET"));
    assert.equal(res.status, 403);
  },
);

test("POST /api/engineering/subcon-ai/scores: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/subcon-ai/scores: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("sapost403");
  const eng = await taoUser("engineer", "sapost403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/subcon-ai/scores: module đang tắt → 404", S, async () => {
  const projectId = await taoDuAn("saoff");
  const pm = await taoUser("pm", "saoff");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const res = await POST(jreq("/x", { supplierId: 999999 }));
  assert.equal(res.status, 404);
});

test("POST /api/engineering/subcon-ai/scores: supplierId sai kiểu → 422", S, async () => {
  const projectId = await taoDuAn("saval");
  const pm = await taoUser("pm", "saval");
  await batTinhNang("engineering-subcon-ai", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const res = await POST(jreq("/x", { supplierId: "abc" }));
  assert.equal(res.status, 422);
});

test("POST /api/engineering/subcon-ai/scores: không tìm thấy nhà cung cấp → 404", S, async () => {
  const projectId = await taoDuAn("sasup404");
  const pm = await taoUser("pm", "sasup404");
  await batTinhNang("engineering-subcon-ai", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const res = await POST(jreq("/x", { supplierId: 999999, primaryDiscipline: "HVAC" }));
  assert.equal(res.status, 404);
});

test(
  "POST /api/engineering/subcon-ai/scores: tạo hồ sơ thành công → 201, GET (với quyền) thấy lại; " +
    "tạo trùng nhà cung cấp trong cùng dự án → 409",
  S,
  async () => {
    const projectId = await taoDuAn("saok");
    const pm = await taoUser("pm", "saok");
    await batTinhNang("engineering-subcon-ai", projectId);
    const supplierId = await taoNCC("saok");
    await dangNhapDuAn(pm, projectId);

    const { POST } = await import("@/app/api/engineering/subcon-ai/scores/route");
    const res = await POST(jreq("/x", { supplierId, primaryDiscipline: "HVAC" }));
    assert.equal(res.status, 201);
    const { id: profileId } = await res.json();
    assert.ok(profileId);

    const { GET } = await import("@/app/api/engineering/subcon-ai/scores/route");
    const listRes = await GET(jreq("/x", undefined, "GET"));
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 1);
    assert.equal(listBody.data[0].id, profileId);

    const dup = await POST(jreq("/x", { supplierId, primaryDiscipline: "HVAC" }));
    assert.equal(dup.status, 409);
  },
);

test("POST /api/engineering/subcon-ai/evaluate: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/subcon-ai/evaluate: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("saeval403");
  const eng = await taoUser("engineer", "saeval403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/subcon-ai/evaluate: thiếu profileId → 400", S, async () => {
  const projectId = await taoDuAn("saevalmiss");
  const pm = await taoUser("pm", "saevalmiss");
  await batTinhNang("engineering-subcon-ai", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/subcon-ai/evaluate: hồ sơ thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("saevalisoA");
  const projectB = await taoDuAn("saevalisoB");
  const pmA = await taoUser("pm", "saevalisoA");
  const pmB = await taoUser("pm", "saevalisoB");
  await batTinhNang("engineering-subcon-ai", projectA);
  await batTinhNang("engineering-subcon-ai", projectB);
  const supplierId = await taoNCC("saevaliso");
  await dangNhapDuAn(pmB, projectB);
  const { POST: CREATE } = await import("@/app/api/engineering/subcon-ai/scores/route");
  const createRes = await CREATE(jreq("/x", { supplierId, primaryDiscipline: "HVAC" }));
  const { id: profileId } = await createRes.json();

  await dangNhapDuAn(pmA, projectA);
  const { POST: EVAL } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
  const res = await EVAL(jreq("/x", { profileId }));
  assert.equal(res.status, 404);
});

test(
  "POST /api/engineering/subcon-ai/evaluate: chưa đủ dữ liệu hệ thống (ncr/chi phí chưa có " +
    "nguồn) → 422, KHÔNG ghi dòng nào vào engineering_subcon_performance_metrics",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("saevalnodata");
    const pm = await taoUser("pm", "saevalnodata");
    await batTinhNang("engineering-subcon-ai", projectId);
    const supplierId = await taoNCC("saevalnodata");
    await dangNhapDuAn(pm, projectId);
    const { POST: CREATE } = await import("@/app/api/engineering/subcon-ai/scores/route");
    const createRes = await CREATE(jreq("/x", { supplierId, primaryDiscipline: "HVAC" }));
    const { id: profileId } = await createRes.json();

    const { POST: EVAL } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
    const res = await EVAL(jreq("/x", { profileId }));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(Array.isArray(body.thieuDuLieu));

    const rows = await query(
      `SELECT * FROM engineering_subcon_performance_metrics WHERE profile_id = ?`,
      profileId,
    );
    assert.equal(rows.length, 0, "không được ghi điểm khi thiếu dữ liệu");
  },
);

test("POST /api/engineering/subcon-ai/recommend-shortlist: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/subcon-ai/recommend-shortlist/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/subcon-ai/recommend-shortlist: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("sasl403");
  const eng = await taoUser("engineer", "sasl403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/recommend-shortlist/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/subcon-ai/recommend-shortlist: thiếu tên gói/chuyên ngành → 400", S, async () => {
  const projectId = await taoDuAn("saslval");
  const pm = await taoUser("pm", "saslval");
  await batTinhNang("engineering-subcon-ai", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/subcon-ai/recommend-shortlist/route");
  const res = await POST(jreq("/x", { packageName: "Gói A" }));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/subcon-ai/recommend-shortlist: đề xuất danh sách với hồ sơ chưa từng " +
    "được chấm điểm → dùng điểm mặc định TIER_B, vẫn xếp hạng thành công",
  S,
  async () => {
    const projectId = await taoDuAn("saslok");
    const pm = await taoUser("pm", "saslok");
    await batTinhNang("engineering-subcon-ai", projectId);
    const supplierId = await taoNCC("saslok");
    await dangNhapDuAn(pm, projectId);
    const { POST: CREATE } = await import("@/app/api/engineering/subcon-ai/scores/route");
    await CREATE(jreq("/x", { supplierId, primaryDiscipline: "HVAC" }));

    const { POST } = await import("@/app/api/engineering/subcon-ai/recommend-shortlist/route");
    const res = await POST(
      jreq("/x", { packageName: "Gói cơ điện HVAC", discipline: "HVAC", requiredCapacity: 5 }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.candidates.length, 1);
    assert.equal(body.data.candidates[0].tierGrade, "TIER_B");
  },
);

// ============================================================================
// GET/POST /api/engineering/carbon-lca
// ============================================================================

test("GET /api/engineering/carbon-lca: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/carbon-lca/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/carbon-lca: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("clcview403");
  const u = await taoUser("subcon", "clcview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/carbon-lca/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST /api/engineering/carbon-lca: bch không có quyền thực thi (chỉ Admin/PM/Engineer) → 403", S, async () => {
  const projectId = await taoDuAn("clcpost403");
  const u = await taoUser("bch", "clcpost403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/carbon-lca/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/carbon-lca: tính phát thải Carbon từ danh mục vật liệu tuỳ chỉnh → " +
    "lưu báo cáo, GET liệt kê lại; gọi lại cùng reportCode → cập nhật (không tạo dòng mới)",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("clcok");
    const pm = await taoUser("pm", "clcok");
    await dangNhapDuAn(pm, projectId);
    const reportCode = `LCA-${uniq("clcok")}`;
    const { POST } = await import("@/app/api/engineering/carbon-lca/route");
    const res = await POST(
      jreq("/x", {
        reportCode,
        grossFloorAreaM2: 10000,
        materials: [{ materialType: "steel_pipe", description: "Ống thép", weightKg: 1000 }],
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.result.totalEmbodiedCarbonKgCo2e > 0);

    // Gọi lại lần 2 cùng reportCode nhưng đổi khối lượng — phải UPDATE, không tạo dòng thứ 2.
    await POST(
      jreq("/x", {
        reportCode,
        grossFloorAreaM2: 10000,
        materials: [{ materialType: "steel_pipe", description: "Ống thép", weightKg: 2000 }],
      }),
    );
    const rows = await query(
      `SELECT * FROM engineering_carbon_lca_reports WHERE project_id = ? AND report_code = ?`,
      projectId,
      reportCode,
    );
    assert.equal(rows.length, 1, "ON CONFLICT phải cập nhật thay vì chèn thêm dòng");

    const { GET } = await import("@/app/api/engineering/carbon-lca/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.equal(listBody.totalCount, 1);
  },
);

// ============================================================================
// GET/POST /api/engineering/qs-bom-explosion
// ============================================================================

test("GET /api/engineering/qs-bom-explosion: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/qs-bom-explosion/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/qs-bom-explosion: bch không có quyền (chỉ manageDrawings) → 403", S, async () => {
  const projectId = await taoDuAn("qsbom403");
  const u = await taoUser("bch", "qsbom403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/qs-bom-explosion: action explode_bom thiếu tham số → 422", S, async () => {
  const projectId = await taoDuAn("qsbomval");
  const pm = await taoUser("pm", "qsbomval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
  const res = await POST(jreq("/x", { action: "explode_bom" }));
  assert.equal(res.status, 422);
});

test("POST /api/engineering/qs-bom-explosion: action lạ → 400", S, async () => {
  const projectId = await taoDuAn("qsbombad");
  const pm = await taoUser("pm", "qsbombad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
  const res = await POST(jreq("/x", { action: "khong-ton-tai" }));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/qs-bom-explosion: explode_bom hợp lệ → lưu bản ghi, GET liệt kê lại",
  S,
  async () => {
    const projectId = await taoDuAn("qsbomok");
    const pm = await taoUser("pm", "qsbomok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
    const res = await POST(
      jreq("/x", {
        action: "explode_bom",
        itemCode: `BOQ-${uniq("qsbomok")}`,
        itemDescription: "Ống thép SCH40 DN100",
        unit: "m",
        contractRateVnd: 520000,
        quantity: 100,
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.bomId);

    const { GET } = await import("@/app/api/engineering/qs-bom-explosion/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listBody.totalCount, 1);
  },
);

test("POST /api/engineering/qs-bom-explosion: action fidic_claim thiếu tham số → 422", S, async () => {
  const projectId = await taoDuAn("qsfidval");
  const pm = await taoUser("pm", "qsfidval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
  const res = await POST(jreq("/x", { action: "fidic_claim" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/qs-bom-explosion: action fidic_claim hợp lệ → sinh hồ sơ bảo vệ VO",
  S,
  async () => {
    const projectId = await taoDuAn("qsfidok");
    const pm = await taoUser("pm", "qsfidok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
    const res = await POST(
      jreq("/x", {
        action: "fidic_claim",
        eventDescription: "Phát sinh khối lượng ống DN100",
        deltaVoQty: 50,
        unitRateVnd: 500000,
        impactDays: 3,
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.claimDoc.impactAnalysis.directCostIncreaseVnd, 50 * 500000);
    assert.equal(body.claimDoc.impactAnalysis.extensionOfTimeDays, 3);
  },
);

// ============================================================================
// GET/POST /api/engineering/shopdrawing-lod400
// ============================================================================

test("GET /api/engineering/shopdrawing-lod400: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/shopdrawing-lod400/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/shopdrawing-lod400: bch không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("sd400_403");
  const u = await taoUser("bch", "sd400_403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/shopdrawing-lod400: convert_lod400 thiếu segments → 400", S, async () => {
  const projectId = await taoDuAn("sd400val");
  const pm = await taoUser("pm", "sd400val");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
  const res = await POST(jreq("/x", { action: "convert_lod400" }));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/shopdrawing-lod400: action lạ → 400", S, async () => {
  const projectId = await taoDuAn("sd400bad");
  const pm = await taoUser("pm", "sd400bad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
  const res = await POST(jreq("/x", { action: "khong-ton-tai" }));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/shopdrawing-lod400: convert_lod400 hợp lệ → lưu run, GET liệt kê lại",
  S,
  async () => {
    const projectId = await taoDuAn("sd400ok");
    const pm = await taoUser("pm", "sd400ok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
    const res = await POST(
      jreq("/x", {
        action: "convert_lod400",
        runCode: `LOD-${uniq("sd400ok")}`,
        segments: [
          {
            id: "SEG-1",
            discipline: "hvac",
            systemCode: "SUPPLY-AIR",
            nominalSpec: "DN100",
            outerDiameterMm: 114,
            startPoint: [0, 0, 0],
            endPoint: [12, 0, 0],
            lengthM: 12,
          },
        ],
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.runId);

    const { GET } = await import("@/app/api/engineering/shopdrawing-lod400/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listBody.totalCount, 1);
  },
);

test("POST /api/engineering/shopdrawing-lod400: action plenum_clearance trả kết quả phân tích", S, async () => {
  const projectId = await taoDuAn("sd400plenum");
  const pm = await taoUser("pm", "sd400plenum");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
  const res = await POST(
    jreq("/x", {
      action: "plenum_clearance",
      beamBottomElevationMm: 2800,
      ceilingElevationMm: 2350,
      originalDuct: { widthMm: 600, heightMm: 400 },
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.analysis);
});

test("POST /api/engineering/shopdrawing-lod400: action spatial_hierarchy trả kết quả phân cấp", S, async () => {
  const projectId = await taoDuAn("sd400hier");
  const pm = await taoUser("pm", "sd400hier");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
  const res = await POST(jreq("/x", { action: "spatial_hierarchy", discipline: "hvac" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.hierarchy);
});

// ============================================================================
// GET/POST /api/engineering/multi-agent-copilot
// ============================================================================

test("GET /api/engineering/multi-agent-copilot: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/multi-agent-copilot/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/multi-agent-copilot: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("macview403");
  const u = await taoUser("subcon", "macview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/multi-agent-copilot/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST /api/engineering/multi-agent-copilot: bch không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("macpost403");
  const u = await taoUser("bch", "macpost403");
  await dangNhapDuAn(u, projectId);
  const { POST } = await import("@/app/api/engineering/multi-agent-copilot/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/multi-agent-copilot: khởi tạo phiên tranh luận → lưu, GET liệt kê lại",
  S,
  async () => {
    const projectId = await taoDuAn("macok");
    const pm = await taoUser("pm", "macok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/multi-agent-copilot/route");
    const res = await POST(
      jreq("/x", { sessionCode: `DEBATE-${uniq("macok")}`, discipline: "hvac" }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.sessionId);

    const { GET } = await import("@/app/api/engineering/multi-agent-copilot/route");
    const listRes = await GET();
    const listBody = await listRes.json();
    assert.equal(listBody.totalCount, 1);
  },
);

// ============================================================================
// GET/POST /api/engineering/pinnacle/pulse
// ============================================================================

test("GET /api/engineering/pinnacle/pulse: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/pinnacle/pulse/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/pinnacle/pulse: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ppview403");
  const u = await taoUser("subcon", "ppview403");
  await dangNhapDuAn(u, projectId);
  const { GET } = await import("@/app/api/engineering/pinnacle/pulse/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test(
  "GET /api/engineering/pinnacle/pulse: chưa có snapshot nào → tự tính & lưu 1 bản; gọi lại " +
    "lần 2 → dùng lại snapshot cũ (không tạo thêm dòng)",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("ppok");
    const pm = await taoUser("pm", "ppok");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/pinnacle/pulse/route");
    const res1 = await GET();
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.ok(body1.data.apexIndex >= 0);

    const res2 = await GET();
    const body2 = await res2.json();
    assert.equal(body2.data.id, body1.data.id, "lần gọi thứ 2 phải dùng lại snapshot đã có");

    const rows = await query(
      `SELECT * FROM engineering_apex_system_pulses WHERE project_id = ?`,
      projectId,
    );
    assert.equal(rows.length, 1);
  },
);

test("POST /api/engineering/pinnacle/pulse: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/pinnacle/pulse/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test(
  "POST /api/engineering/pinnacle/pulse: actionType → điều phối lệnh + ghi lại pulse mới",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("ppaction");
    const pm = await taoUser("pm", "ppaction");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/pinnacle/pulse/route");
    const res = await POST(jreq("/x", { actionType: "rerun_scan", payload: { note: "x" } }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.action.actionType, "rerun_scan");
    assert.equal(body.data.action.resultStatus, "COMPLETED");
    assert.ok(body.data.pulse.apexIndex >= 0);

    const rows = await query(
      `SELECT * FROM engineering_apex_command_actions WHERE project_id = ?`,
      projectId,
    );
    assert.equal(rows.length, 1);
  },
);

test(
  "POST /api/engineering/pinnacle/pulse: gửi projectId dự án không thuộc quyền → 403",
  S,
  async () => {
    const projectA = await taoDuAn("ppidorA");
    const projectB = await taoDuAn("ppidorB");
    const pmA = await taoUser("pm", "ppidorA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/pinnacle/pulse/route");
    const res = await POST(jreq("/x", { projectId: projectB }));
    assert.equal(res.status, 403);
  },
);
