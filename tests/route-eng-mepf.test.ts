import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING — MEPF & hiện trường số
// (Đợt 5 chiến dịch coverage — Việc W4). Route (23):
//   - app/api/engineering/mepf-hydraulic/route.ts            (GET lịch sử / POST tính thủy lực)
//   - app/api/engineering/mepf-nesting/route.ts               (GET lịch sử / POST tối ưu cắt phôi)
//   - app/api/engineering/mepf-predictive/route.ts            (GET lịch sử / POST bảo trì tiên đoán)
//   - app/api/engineering/mepf-takeoff/route.ts                (GET lịch sử / POST bóc tách KL AI)
//   - app/api/engineering/mepf-tc/route.ts                     (GET ma trận T&C / POST tạo·log·đánh giá)
//   - app/api/engineering/mepf-voice/route.ts                  (GET nhật ký / POST phân tích giọng nói)
//   - app/api/engineering/pipe-mass-balance/route.ts           (GET lịch sử / POST đối soát mass-balance)
//   - app/api/engineering/pipe-spool-tracking/route.ts         (GET danh sách / POST cập nhật Spool)
//   - app/api/engineering/iot/devices/route.ts                 (GET danh sách thiết bị IoT)
//   - app/api/engineering/iot/telemetry/route.ts                (GET lịch sử / POST ghi nhận đo lường)
//   - app/api/engineering/iot/alerts/route.ts                   (GET / PATCH xử lý cảnh báo)
//   - app/api/engineering/spatial/compute/route.ts              (POST tính toán không gian có cache)
//   - app/api/engineering/spatial/annotations/route.ts          (GET / POST điểm ghim không gian)
//   - app/api/engineering/spatial/annotations/[id]/route.ts     (PATCH / DELETE 1 điểm ghim)
//   - app/api/engineering/logistics/shipments/route.ts          (GET / POST lô hàng)
//   - app/api/engineering/logistics/scan-receive/route.ts       (POST quét nhận vật tư QR)
//   - app/api/engineering/ledger/merkle/route.ts                (GET / POST sổ cái Merkle)
//   - app/api/engineering/ledger/verify-proof/route.ts          (POST xác thực Merkle Proof)
//   - app/api/engineering/hse-vision/scan/route.ts               (POST quét ảnh an toàn HSE)
//   - app/api/engineering/hse-vision/scans/route.ts              (GET danh sách quét)
//   - app/api/engineering/edge-vision-tracking/route.ts          (GET / POST audit cốt thép·detection)
//   - app/api/engineering/generative-routing/route.ts            (GET / POST giải tuyến 3D A*)
//   - app/api/engineering/closed-loop-sync/route.ts               (GET / POST đồng bộ Spool→WBS→IPC)
//
// BUG THẬT lộ ra khi viết test này (đã sửa cùng nhánh):
//   1) 9 hàm `list*` trong lib/ky-thuat/engineering-mepf-{hydraulic,nesting,predictive,takeoff,voice}.ts
//      + engineering-{generative-routing,pipe-stash-hunter,edge-vision-tracking}.ts gọi
//      `query(sql, [projectId])` — TRUYỀN HẲN MỘT MẢNG làm 1 tham số REST thay vì spread —
//      khiến Postgres nhận `$1` là giá trị mảng `{"<id>"}` thay vì số nguyên/bigint và luôn
//      ném lỗi "invalid input syntax for type integer/bigint" → route GET tương ứng LUÔN 500,
//      chưa từng chạy được. Đã sửa thành truyền tham số trực tiếp (rest), khớp đúng khuôn hàm
//      anh em cùng file dùng đúng (`listTcMatrices` trong engineering-mepf-tc.ts).
//   2) `app/api/engineering/iot/devices/route.ts` (GET) thiếu hẳn kiểm `CAN.viewEngineeringIot`
//      trong khi 2 route anh em cùng cụm (`iot/telemetry`, `iot/alerts`) đều kiểm — subcon (và
//      mọi vai trò khác) xem được toàn bộ thiết bị IoT + trị đo mới nhất của dự án. Đã bổ sung
//      đúng quyền như 2 route anh em.
const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `MEPF route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `mepf-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-mepf-route', ?, ?)`,
    `MEPF ${ten}`,
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

/**
 * Bật module `thuNghiem` (mặc định TẮT) cho 1 dự án — dùng cho cụm iot/edge-vision/generative-routing.
 *
 * `actorId` BẮT BUỘC là id user CÓ THẬT: `feature_flags.updated_by` có khoá ngoại tới `users`.
 * Trước đây helper gán cứng `1` — chạy riêng thì xanh (user seed id=1 còn), chạy cả bộ thì file
 * test khác đã xoá user đó ⇒ vỡ khoá ngoại, 11 ca đỏ. Đúng lớp lỗi "giả định trạng thái toàn cục"
 * đã ghi ở Đợt 4 (PROGRESS.md, mục "Bài học hạ tầng test").
 */
async function batModule(moduleKey: string, projectId: number, actorId: number): Promise<void> {
  const { setFlag } = await import("@/lib/ha-tang/feature-flags");
  await setFlag(moduleKey, projectId, true, actorId, 1);
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

// ============================================================================
// GET/POST /api/engineering/mepf-hydraulic
// ============================================================================

test("GET /api/engineering/mepf-hydraulic: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/mepf-hydraulic/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/mepf-hydraulic: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("hydra403");
  const sub = await taoUser("subcon", "hydra403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/mepf-hydraulic/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test(
  "POST rồi GET /api/engineering/mepf-hydraulic: tính & lưu thành công, tra cứu lại thấy " +
    "đúng bản ghi vừa tạo (BUG THẬT: GET này 500 trước khi sửa, xem chú thích đầu file)",
  S,
  async () => {
    const projectId = await taoDuAn("hydraok");
    const eng = await taoUser("engineer", "hydraok");
    await dangNhapDuAn(eng, projectId);
    const { POST, GET } = await import("@/app/api/engineering/mepf-hydraulic/route");
    const calcCode = `HYDR-${uniq("code")}`;
    const resPost = await POST(
      jreq("/x", { calcCode, systemType: "chilled_water", flowRateM3h: 30, pipeLengthM: 60 }),
    );
    assert.equal(resPost.status, 200);
    const bodyPost = await resPost.json();
    assert.equal(bodyPost.success, true);
    assert.equal(bodyPost.analysis.calcCode, calcCode);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.calculations.some((c: any) => c.calc_code === calcCode));
  },
);

test("GET /api/engineering/mepf-hydraulic: chưa chọn dự án → 400", S, async () => {
  // Vai trò không phải admin, KHÔNG gán vào dự án nào (không dùng dangNhapDuAn) — vì
  // visibleProjectIds() chỉ trả "mọi dự án" khi bảng user_projects RỖNG TOÀN CỤC, mà các
  // ca khác trong bộ test đã chèn dữ liệu, nên user không gán sẽ thấy đúng 0 dự án.
  const pm = await taoUser("pm", "hydranoproj");
  dangNhap(pm, null);
  const { GET } = await import("@/app/api/engineering/mepf-hydraulic/route");
  const res = await GET();
  assert.equal(res.status, 400);
});

// ============================================================================
// GET/POST /api/engineering/mepf-nesting
// ============================================================================

test("GET /api/engineering/mepf-nesting: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/mepf-nesting/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/mepf-nesting: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("nest403");
  const sub = await taoUser("subcon", "nest403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-nesting/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST rồi GET /api/engineering/mepf-nesting: tối ưu cắt phôi & tra lại danh sách",
  S,
  async () => {
    const projectId = await taoDuAn("nestok");
    const pm = await taoUser("pm", "nestok");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/mepf-nesting/route");
    const planCode = `NEST-${uniq("code")}`;
    const res = await POST(jreq("/x", { planCode, stockLengthM: 6 }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.plan.planCode, planCode);
    assert.ok(body.plan.totalSheetsRequired ?? body.plan.sheets ?? true);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.plans.some((p: any) => p.plan_code === planCode));
  },
);

// ============================================================================
// GET/POST /api/engineering/mepf-predictive
// ============================================================================

test("GET /api/engineering/mepf-predictive: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/mepf-predictive/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/mepf-predictive: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("predict403");
  const sub = await taoUser("subcon", "predict403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-predictive/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST rồi GET /api/engineering/mepf-predictive: tính MTBF/RUL & tra lại danh sách",
  S,
  async () => {
    const projectId = await taoDuAn("predictok");
    const eng = await taoUser("engineer", "predictok");
    await dangNhapDuAn(eng, projectId);
    const { POST, GET } = await import("@/app/api/engineering/mepf-predictive/route");
    const assetCode = `PUMP-${uniq("code")}`;
    const res = await POST(jreq("/x", { assetCode, operatingHoursTotal: 5000 }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.evaluation.assetCode, assetCode);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.assets.some((a: any) => a.asset_code === assetCode));
  },
);

// ============================================================================
// GET/POST /api/engineering/mepf-takeoff
// ============================================================================

test("GET /api/engineering/mepf-takeoff: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/mepf-takeoff/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/mepf-takeoff: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("tkoff403");
  const sub = await taoUser("subcon", "tkoff403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-takeoff/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/mepf-takeoff: action=generative_route thiếu startPoint/endPoint → 400",
  S,
  async () => {
    const projectId = await taoDuAn("tkoffval");
    const eng = await taoUser("engineer", "tkoffval");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/engineering/mepf-takeoff/route");
    const res = await POST(jreq("/x", { action: "generative_route" }));
    assert.equal(res.status, 400);
  },
);

test("POST /api/engineering/mepf-takeoff: action=generative_route đủ toạ độ → 200", S, async () => {
  const projectId = await taoDuAn("tkoffgen");
  const eng = await taoUser("engineer", "tkoffgen");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-takeoff/route");
  const res = await POST(
    jreq("/x", {
      action: "generative_route",
      startPoint: { x: 0, y: 0, z: 3000 },
      endPoint: { x: 1000, y: 0, z: 3000 },
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.solution);
});

test(
  "POST rồi GET /api/engineering/mepf-takeoff: bóc tách khối lượng AI & tra lại danh sách",
  S,
  async () => {
    const projectId = await taoDuAn("tkoffok");
    const eng = await taoUser("engineer", "tkoffok");
    await dangNhapDuAn(eng, projectId);
    const { POST, GET } = await import("@/app/api/engineering/mepf-takeoff/route");
    const sessionCode = `TKOFF-${uniq("code")}`;
    const res = await POST(jreq("/x", { sessionCode, discipline: "all" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result.sessionCode, sessionCode);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.runs.some((r: any) => r.session_code === sessionCode));
  },
);

// ============================================================================
// GET/POST /api/engineering/mepf-tc
// ============================================================================

test("GET /api/engineering/mepf-tc: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/mepf-tc/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/mepf-tc: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("tc403");
  const sub = await taoUser("subcon", "tc403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-tc/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/mepf-tc: action không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("tcbadact");
  const eng = await taoUser("engineer", "tcbadact");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-tc/route");
  const res = await POST(jreq("/x", { action: "khong_ton_tai" }));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/mepf-tc: add_log thiếu matrixId → 400", S, async () => {
  const projectId = await taoDuAn("tcaddloglack");
  const eng = await taoUser("engineer", "tcaddloglack");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-tc/route");
  const res = await POST(jreq("/x", { action: "add_log" }));
  assert.equal(res.status, 400);
});

test(
  "Luồng MEPF T&C đầy đủ: tạo ma trận → ghi log → GET theo matrixId → " +
    "evaluate_hydrostatic → evaluate_interlock",
  S,
  async () => {
    const projectId = await taoDuAn("tcflow");
    const eng = await taoUser("engineer", "tcflow");
    await dangNhapDuAn(eng, projectId);
    const { POST, GET } = await import("@/app/api/engineering/mepf-tc/route");

    const matrixCode = `TC-${uniq("code")}`;
    const resCreate = await POST(
      jreq("/x", { action: "create_matrix", matrixCode, testType: "hydrostatic_pipe" }),
    );
    assert.equal(resCreate.status, 200);
    const { matrixId } = await resCreate.json();
    assert.ok(matrixId);

    const resLog = await POST(
      jreq("/x", { action: "add_log", matrixId, recordedValue: 10.2, unit: "Bar" }),
    );
    assert.equal(resLog.status, 200);

    const resGetLogs = await GET(jreq(`/x?matrixId=${matrixId}`, undefined, "GET"));
    assert.equal(resGetLogs.status, 200);
    const bodyLogs = await resGetLogs.json();
    assert.equal(bodyLogs.totalCount, 1);

    const resGetMatrices = await GET(jreq("/x", undefined, "GET"));
    assert.equal(resGetMatrices.status, 200);
    const bodyMatrices = await resGetMatrices.json();
    assert.ok(bodyMatrices.matrices.some((m: any) => m.matrix_code === matrixCode));

    const resHydro = await POST(
      jreq("/x", {
        action: "evaluate_hydrostatic",
        initialPressureBar: 10,
        finalPressureBar: 9.9,
        durationMinutes: 120,
        requiredDurationMinutes: 120,
        allowableDropBar: 0.2,
      }),
    );
    assert.equal(resHydro.status, 200);
    assert.equal((await resHydro.json()).success, true);

    const resInterlock = await POST(jreq("/x", { action: "evaluate_interlock", scenarios: [] }));
    assert.equal(resInterlock.status, 200);
  },
);

// ============================================================================
// GET/POST /api/engineering/mepf-voice
// ============================================================================

test("GET /api/engineering/mepf-voice: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/mepf-voice/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/mepf-voice: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("voice403");
  const sub = await taoUser("subcon", "voice403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-voice/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/mepf-voice: action không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("voicebad");
  const eng = await taoUser("engineer", "voicebad");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/engineering/mepf-voice/route");
  const res = await POST(jreq("/x", { action: "khong_ton_tai" }));
  assert.equal(res.status, 400);
});

test(
  "POST rồi GET /api/engineering/mepf-voice: parse_voice lưu nhật ký & tra lại danh sách; " +
    "action=productivity tính năng suất — không gọi mạng thật (hàm phân tích văn bản thuần)",
  S,
  async () => {
    const projectId = await taoDuAn("voiceok");
    const eng = await taoUser("engineer", "voiceok");
    await dangNhapDuAn(eng, projectId);
    const { POST, GET } = await import("@/app/api/engineering/mepf-voice/route");

    const resParse = await POST(
      jreq("/x", { action: "parse_voice", text: "Đã lắp xong 50 mét ống DN100 tại tầng 5" }),
    );
    assert.equal(resParse.status, 200);
    const bodyParse = await resParse.json();
    assert.equal(bodyParse.success, true);
    assert.ok(bodyParse.logId);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.equal(bodyGet.logs.length, 1);

    const resProd = await POST(
      jreq("/x", {
        action: "productivity",
        actualQty: 50,
        headcount: 4,
        workingHours: 8,
        normRate: 2.5,
      }),
    );
    assert.equal(resProd.status, 200);
    assert.equal((await resProd.json()).success, true);
  },
);

// ============================================================================
// GET/POST /api/engineering/pipe-mass-balance
// ============================================================================

test("GET /api/engineering/pipe-mass-balance: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/pipe-mass-balance/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/pipe-mass-balance: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("mba403");
  const sub = await taoUser("subcon", "mba403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/pipe-mass-balance/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/pipe-mass-balance: check_phantom_breaker & calc_jit_reorder là " +
    "tính toán thuần, không ghi DB",
  S,
  async () => {
    const projectId = await taoDuAn("mbapure");
    const pm = await taoUser("pm", "mbapure");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/pipe-mass-balance/route");

    const resPhantom = await POST(
      jreq("/x", {
        action: "check_phantom_breaker",
        claimedInstallM: 100,
        totalStockIssuedToSubconM: 60,
      }),
    );
    assert.equal(resPhantom.status, 200);
    assert.equal((await resPhantom.json()).success, true);

    const resJit = await POST(
      jreq("/x", { action: "calc_jit_reorder", installRateMPerDay: 20, supplierLeadDays: 10 }),
    );
    assert.equal(resJit.status, 200);
    assert.equal((await resJit.json()).success, true);
  },
);

test(
  "POST rồi GET /api/engineering/pipe-mass-balance: đối soát mass-balance 5 chiều & tra lại lịch sử " +
    "(BUG THẬT: GET này 500 trước khi sửa vì listMassBalanceAudits truyền mảng thay vì spread)",
  S,
  async () => {
    const projectId = await taoDuAn("mbaok");
    const pm = await taoUser("pm", "mbaok");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/pipe-mass-balance/route");
    const auditCode = `MBA-${uniq("code")}`;
    const res = await POST(jreq("/x", { auditCode }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result.auditCode, auditCode);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.audits.some((a: any) => a.audit_code === auditCode));
  },
);

// ============================================================================
// GET/POST /api/engineering/pipe-spool-tracking
// ============================================================================

test("GET /api/engineering/pipe-spool-tracking: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/pipe-spool-tracking/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/pipe-spool-tracking: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("spool403");
  const sub = await taoUser("subcon", "spool403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/pipe-spool-tracking/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST rồi GET /api/engineering/pipe-spool-tracking: cập nhật trạng thái Spool & lọc theo status",
  S,
  async () => {
    const projectId = await taoDuAn("spoolok");
    const pm = await taoUser("pm", "spoolok");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/pipe-spool-tracking/route");
    const spoolCode = `SP-${uniq("code")}`;
    const res = await POST(jreq("/x", { spoolCode, currentStatus: "FLOOR_STAGED" }));
    assert.equal(res.status, 200);
    assert.ok((await res.json()).spoolId);

    const resGet = await GET(jreq("/x?status=FLOOR_STAGED", undefined, "GET"));
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.spools.some((s: any) => s.spool_code === spoolCode));

    const resGetOther = await GET(jreq("/x?status=DELIVERED_TO_SITE", undefined, "GET"));
    assert.equal(resGetOther.status, 200);
    const bodyGetOther = await resGetOther.json();
    assert.ok(!bodyGetOther.spools.some((s: any) => s.spool_code === spoolCode));
  },
);

// ============================================================================
// GET /api/engineering/iot/devices  (module `engineering-iot-telemetry` mặc định TẮT)
// ============================================================================

test("GET /api/engineering/iot/devices: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/iot/devices/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/engineering/iot/devices: subcon không có quyền xem IoT → 403 " +
    "(BUG THẬT: route này trước đây KHÔNG kiểm CAN.viewEngineeringIot như 2 route anh em " +
    "iot/telemetry, iot/alerts — đã bổ sung cùng nhánh, xem chú thích đầu file)",
  S,
  async () => {
    const projectId = await taoDuAn("iotdev403");
    const sub = await taoUser("subcon", "iotdev403");
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/engineering/iot/devices/route");
    const res = await GET(jreq("/x", undefined, "GET"));
    assert.equal(res.status, 403);
  },
);

test(
  "GET /api/engineering/iot/devices: module engineering-iot-telemetry mặc định TẮT → 404",
  S,
  async () => {
    const projectId = await taoDuAn("iotdevoff");
    const pm = await taoUser("pm", "iotdevoff");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/iot/devices/route");
    const res = await GET(jreq("/x", undefined, "GET"));
    assert.equal(res.status, 404);
  },
);

test(
  "GET /api/engineering/iot/devices: bật module → thấy thiết bị + trị đo mới nhất",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const projectId = await taoDuAn("iotdevon");
    const pm = await taoUser("pm", "iotdevon");
    await batModule("engineering-iot-telemetry", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);

    const deviceRows = await run(
      `INSERT INTO engineering_iot_devices (project_id, device_code, device_name, device_type, location_area, unit)
       VALUES (?, ?, 'Cảm biến AQI', 'AIR_QUALITY', 'Tầng hầm B1', 'ug/m3')`,
      projectId,
      `SENSOR-${uniq("code")}`,
    );
    assert.equal(deviceRows.changes, 1);

    const { GET } = await import("@/app/api/engineering/iot/devices/route");
    const res = await GET(jreq("/x", undefined, "GET"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].deviceType, "AIR_QUALITY");
    void insertId; // giữ import cho nhất quán khuôn file, không dùng ở test này
  },
);

// ============================================================================
// GET/POST /api/engineering/iot/telemetry
// ============================================================================

async function taoThietBiIot(
  projectId: number,
  deviceType = "AIR_QUALITY",
  thresholdMax: number | null = 50,
): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_iot_devices (project_id, device_code, device_name, device_type, location_area, unit, threshold_max)
     VALUES (?, ?, 'Thiết bị test', ?, 'Tầng hầm B1', 'ug/m3', ?)
     RETURNING id`,
    projectId,
    `SENSOR-${uniq("dev")}`,
    deviceType,
    thresholdMax,
  );
  return row!.id;
}

test("GET /api/engineering/iot/telemetry: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/iot/telemetry/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/iot/telemetry: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("telem403");
  const sub = await taoUser("subcon", "telem403");
  await batModule("engineering-iot-telemetry", projectId, sub.id);
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/iot/telemetry/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/iot/telemetry: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "telemnoproj");
  dangNhap(pm, null);
  const { GET } = await import("@/app/api/engineering/iot/telemetry/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/iot/telemetry: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "telempnoproj");
  dangNhap(pm, null);
  const { POST } = await import("@/app/api/engineering/iot/telemetry/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/iot/telemetry: thiếu deviceId/metricValue → 400", S, async () => {
  const projectId = await taoDuAn("telemval");
  const pm = await taoUser("pm", "telemval");
  await batModule("engineering-iot-telemetry", projectId, pm.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/iot/telemetry/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/iot/telemetry: deviceId không tồn tại trong dự án → 404",
  S,
  async () => {
    const projectId = await taoDuAn("telem404");
    const pm = await taoUser("pm", "telem404");
    await batModule("engineering-iot-telemetry", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/iot/telemetry/route");
    const res = await POST(
      jreq("/x", { deviceId: "00000000-0000-0000-0000-000000000000", metricValue: 10 }),
    );
    assert.equal(res.status, 404);
  },
);

test(
  "POST /api/engineering/iot/telemetry: ghi giá trị NORMAL không sinh cảnh báo; ghi giá trị " +
    "vượt ngưỡng sinh cảnh báo; lặp lại giá trị vượt ngưỡng KHÔNG sinh cảnh báo trùng (dedup)",
  S,
  async () => {
    const projectId = await taoDuAn("telemflow");
    const pm = await taoUser("pm", "telemflow");
    await batModule("engineering-iot-telemetry", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const deviceId = await taoThietBiIot(projectId, "AIR_QUALITY", 50);
    const { POST } = await import("@/app/api/engineering/iot/telemetry/route");

    const resNormal = await POST(jreq("/x", { deviceId, metricValue: 20 }));
    assert.equal(resNormal.status, 200);
    assert.equal((await resNormal.json()).alert, null);

    const resAlert1 = await POST(jreq("/x", { deviceId, metricValue: 120 }));
    assert.equal(resAlert1.status, 200);
    const bodyAlert1 = await resAlert1.json();
    assert.ok(bodyAlert1.alert);

    const resAlert2 = await POST(jreq("/x", { deviceId, metricValue: 130 }));
    assert.equal(resAlert2.status, 200);
    const bodyAlert2 = await resAlert2.json();
    assert.equal(bodyAlert2.alert, null); // dedup: đã có cảnh báo đang mở cho thiết bị này

    const { GET } = await import("@/app/api/engineering/iot/telemetry/route");
    const resList = await GET(jreq(`/x?deviceId=${deviceId}`, undefined, "GET"));
    const bodyList = await resList.json();
    assert.equal(bodyList.data.length, 3);
  },
);

// ============================================================================
// GET/PATCH /api/engineering/iot/alerts
// ============================================================================

test("GET /api/engineering/iot/alerts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/iot/alerts/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("PATCH /api/engineering/iot/alerts: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("alert403");
  const sub = await taoUser("subcon", "alert403");
  await batModule("engineering-iot-telemetry", projectId, sub.id);
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/engineering/iot/alerts/route");
  const res = await PATCH(jreq("/x", { alertId: "x" }, "PATCH"));
  assert.equal(res.status, 403);
});

test("PATCH /api/engineering/iot/alerts: thiếu alertId → 400", S, async () => {
  const projectId = await taoDuAn("alertval");
  const pm = await taoUser("pm", "alertval");
  await batModule("engineering-iot-telemetry", projectId, pm.id);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/engineering/iot/alerts/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"));
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/engineering/iot/alerts: xử lý cảnh báo dự án khác → 404, dữ liệu dự án B " +
    "không đổi trong DB",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectA = await taoDuAn("alertisoA");
    const projectB = await taoDuAn("alertisoB");
    const pmA = await taoUser("pm", "alertisoA");
    const pmB = await taoUser("pm", "alertisoB");
    await batModule("engineering-iot-telemetry", projectA, pmA.id);
    await batModule("engineering-iot-telemetry", projectB, pmB.id);

    // Sinh 1 cảnh báo thật trong dự án B qua chính route telemetry.
    await dangNhapDuAn(pmB, projectB);
    const deviceIdB = await taoThietBiIot(projectB, "NOISE", 70);
    const { POST: POST_TELEM } = await import("@/app/api/engineering/iot/telemetry/route");
    const resTelem = await POST_TELEM(jreq("/x", { deviceId: deviceIdB, metricValue: 200 }));
    const { alert: alertB } = await resTelem.json();
    assert.ok(alertB);

    // Đứng ở dự án A cố xử lý cảnh báo của dự án B → 404.
    await dangNhapDuAn(pmA, projectA);
    const { PATCH } = await import("@/app/api/engineering/iot/alerts/route");
    const res = await PATCH(jreq("/x", { alertId: alertB.id, isResolved: true }, "PATCH"));
    assert.equal(res.status, 404);

    const rowB = await queryOne<{ is_resolved: boolean }>(
      `SELECT is_resolved FROM engineering_iot_threshold_alerts WHERE id = ?`,
      alertB.id,
    );
    assert.equal(rowB?.is_resolved, false);
  },
);

test(
  "GET rồi PATCH /api/engineering/iot/alerts: xử lý cảnh báo trong đúng dự án → 200",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("alertok");
    const pm = await taoUser("pm", "alertok");
    await batModule("engineering-iot-telemetry", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const deviceId = await taoThietBiIot(projectId, "GAS_LEAK", 25);
    const { POST: POST_TELEM } = await import("@/app/api/engineering/iot/telemetry/route");
    const resTelem = await POST_TELEM(jreq("/x", { deviceId, metricValue: 60 }));
    const { alert } = await resTelem.json();
    assert.ok(alert);

    const { GET, PATCH } = await import("@/app/api/engineering/iot/alerts/route");
    const resGet = await GET(jreq("/x", undefined, "GET"));
    assert.equal(resGet.status, 200);
    assert.ok((await resGet.json()).data.some((a: any) => a.id === alert.id));

    const resPatch = await PATCH(jreq("/x", { alertId: alert.id, isResolved: true }, "PATCH"));
    assert.equal(resPatch.status, 200);
    const bodyPatch = await resPatch.json();
    // Route trả nguyên `RETURNING *` (snake_case), không alias camelCase.
    assert.equal(bodyPatch.data.is_resolved, true);

    const row = await queryOne<{ is_resolved: boolean; resolved_by: number }>(
      `SELECT is_resolved, resolved_by FROM engineering_iot_threshold_alerts WHERE id = ?`,
      alert.id,
    );
    assert.equal(row?.is_resolved, true);
    assert.equal(row?.resolved_by, pm.id);
  },
);

// ============================================================================
// POST /api/engineering/spatial/compute
// ============================================================================

test("POST /api/engineering/spatial/compute: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/spatial/compute/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/spatial/compute: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("spatial403");
  const sub = await taoUser("subcon", "spatial403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/spatial/compute/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/spatial/compute: computeType không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("spatialbad");
  const pm = await taoUser("pm", "spatialbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/spatial/compute/route");
  const res = await POST(jreq("/x", { computeType: "khong_ton_tai" }));
  assert.equal(res.status, 400);
});

test(
  "POST /api/engineering/spatial/compute: polyline chỉ 1 điểm → 422 (đúng cú pháp nhưng " +
    "không đủ dữ liệu để quét thể tích — trước đây cả cụm ép về 500)",
  S,
  async () => {
    const projectId = await taoDuAn("spatial422");
    const pm = await taoUser("pm", "spatial422");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/spatial/compute/route");
    const res = await POST(
      jreq("/x", {
        computeType: "sweep_volume",
        cacheKey: `SPATIAL-${uniq("p1")}`,
        points: [{ x: 0, y: 0, z: 3200 }],
      }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /ít nhất 2 điểm/);
  },
);

test(
  "POST /api/engineering/spatial/compute: sweep_volume, voxel_clashes, sheet_nesting — " +
    "gọi lại đúng cacheKey + input thì fromCache=true (bộ đệm hoạt động đúng)",
  S,
  async () => {
    const projectId = await taoDuAn("spatialok");
    const pm = await taoUser("pm", "spatialok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/spatial/compute/route");
    const cacheKey = `SPATIAL-${uniq("key")}`;

    const res1 = await POST(jreq("/x", { computeType: "sweep_volume", cacheKey }));
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.result.fromCache, false);

    const res2 = await POST(jreq("/x", { computeType: "sweep_volume", cacheKey }));
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.result.fromCache, true);

    const resVoxel = await POST(jreq("/x", { computeType: "voxel_clashes" }));
    assert.equal(resVoxel.status, 200);

    const resNest = await POST(jreq("/x", { computeType: "sheet_nesting" }));
    assert.equal(resNest.status, 200);
  },
);

// ============================================================================
// GET/POST /api/engineering/spatial/annotations
// ============================================================================

test("GET /api/engineering/spatial/annotations: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/spatial/annotations/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/spatial/annotations: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("annot403");
  const sub = await taoUser("subcon", "annot403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/spatial/annotations/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/spatial/annotations: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("annotval");
  const pm = await taoUser("pm", "annotval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/spatial/annotations/route");
  const res = await POST(jreq("/x", { drawingCode: "DWG-01" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/spatial/annotations: gửi projectId của dự án khác (không được gán) → 403, " +
    "không tạo bản ghi nào",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectA = await taoDuAn("annotisoA");
    const projectB = await taoDuAn("annotisoB");
    const pmA = await taoUser("pm", "annotisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/spatial/annotations/route");
    const res = await POST(
      jreq("/x", {
        projectId: projectB,
        drawingCode: "DWG-ISO",
        annotType: "general_note",
        coordX: 1,
        coordY: 1,
        title: "Ghi chú lạ",
      }),
    );
    assert.equal(res.status, 403);
    const rows = await query(
      `SELECT id FROM engineering_spatial_annotations WHERE project_id = ?`,
      projectB,
    );
    assert.equal(rows.length, 0);
  },
);

test(
  "POST rồi GET /api/engineering/spatial/annotations: tạo điểm ghim & tra lại danh sách",
  S,
  async () => {
    const projectId = await taoDuAn("annotok");
    const pm = await taoUser("pm", "annotok");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/spatial/annotations/route");
    const drawingCode = `DWG-${uniq("code")}`;
    const res = await POST(
      jreq("/x", {
        drawingCode,
        annotType: "ncr_issue",
        coordX: 100,
        coordY: 200,
        title: "Va chạm ống & dầm",
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "open");

    const resGet = await GET(jreq(`/x?drawingCode=${drawingCode}`, undefined, "GET"));
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.equal(bodyGet.data.length, 1);
    assert.equal(bodyGet.data[0].id, body.data.id);
  },
);

// ============================================================================
// PATCH/DELETE /api/engineering/spatial/annotations/[id]
// ============================================================================

async function taoAnnotation(
  user: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
): Promise<string> {
  await dangNhapDuAn(user, projectId);
  const { POST } = await import("@/app/api/engineering/spatial/annotations/route");
  const res = await POST(
    jreq("/x", {
      drawingCode: `DWG-${uniq(ten)}`,
      annotType: "general_note",
      coordX: 1,
      coordY: 1,
      title: `Ghi chú ${ten}`,
    }),
  );
  const { data } = await res.json();
  return data.id as string;
}

test("PATCH /api/engineering/spatial/annotations/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
  const res = await PATCH(jreq("/x", {}), {
    params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/engineering/spatial/annotations/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("annotp403");
  const sub = await taoUser("subcon", "annotp403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
  const res = await PATCH(jreq("/x", {}), {
    params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/engineering/spatial/annotations/:id: id sai định dạng UUID → 400", S, async () => {
  const projectId = await taoDuAn("annotpbad");
  const pm = await taoUser("pm", "annotpbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
  const res = await PATCH(jreq("/x", { status: "resolved" }), {
    params: Promise.resolve({ id: "khong-phai-uuid" }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/engineering/spatial/annotations/:id: cập nhật trạng thái đúng dự án → 200, " +
    "DB đổi đúng thành resolved",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("annotpok");
    const pm = await taoUser("pm", "annotpok");
    const id = await taoAnnotation(pm, projectId, "pok");
    const { PATCH } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
    const res = await PATCH(jreq("/x", { status: "resolved" }), {
      params: Promise.resolve({ id }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_spatial_annotations WHERE id = ?`,
      id,
    );
    assert.equal(row?.status, "resolved");
  },
);

test(
  "DELETE /api/engineering/spatial/annotations/:id: xoá điểm ghim của dự án khác → 403, " +
    "bản ghi dự án B vẫn còn nguyên",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectA = await taoDuAn("annotdisoA");
    const projectB = await taoDuAn("annotdisoB");
    const pmA = await taoUser("pm", "annotdisoA");
    const pmB = await taoUser("pm", "annotdisoB");
    const idB = await taoAnnotation(pmB, projectB, "disoB");

    await dangNhapDuAn(pmA, projectA);
    const { DELETE } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
    const res = await DELETE(jreq(`/x?projectId=${projectB}`, undefined, "DELETE"), {
      params: Promise.resolve({ id: idB }),
    });
    assert.equal(res.status, 403);

    const row = await queryOne<{ id: string }>(
      `SELECT id FROM engineering_spatial_annotations WHERE id = ?`,
      idB,
    );
    assert.ok(row);
  },
);

test(
  "DELETE /api/engineering/spatial/annotations/:id: xoá trong đúng dự án → 200, hết trong DB",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("annotdok");
    const pm = await taoUser("pm", "annotdok");
    const id = await taoAnnotation(pm, projectId, "dok");
    const { DELETE } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id }) });
    assert.equal(res.status, 200);
    const row = await queryOne(`SELECT id FROM engineering_spatial_annotations WHERE id = ?`, id);
    assert.equal(row, undefined);
  },
);

// Hai ca dưới khoá bản vá "không báo thành công khống": trước đây PATCH/DELETE bỏ qua giá trị
// trả về của lib (lib ĐÃ tự tính đúng "có đụng dòng nào không") và luôn trả `success: true`,
// nên thao tác lên điểm ghim không tồn tại/đã xoá vẫn báo thành công — client không phân biệt
// được "đã xử lý" với "chưa từng có".
test(
  "DELETE /api/engineering/spatial/annotations/:id: id hợp lệ nhưng không tồn tại → 404",
  S,
  async () => {
    const projectId = await taoDuAn("annotdmiss");
    const pm = await taoUser("pm", "annotdmiss");
    await dangNhapDuAn(pm, projectId);
    const { DELETE } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(res.status, 404);
  },
);

test(
  "PATCH /api/engineering/spatial/annotations/:id: id hợp lệ nhưng không tồn tại → 404",
  S,
  async () => {
    const projectId = await taoDuAn("annotpmiss");
    const pm = await taoUser("pm", "annotpmiss");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/engineering/spatial/annotations/[id]/route");
    const res = await PATCH(jreq("/x", { status: "resolved" }, "PATCH"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(res.status, 404);
  },
);

// ============================================================================
// GET/POST /api/engineering/logistics/shipments
// ============================================================================

test("GET /api/engineering/logistics/shipments: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/logistics/shipments/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/logistics/shipments: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ship403");
  const sub = await taoUser("subcon", "ship403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/logistics/shipments/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/logistics/shipments: thiếu trường bắt buộc → 422", S, async () => {
  const projectId = await taoDuAn("shipval");
  const pm = await taoUser("pm", "shipval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/logistics/shipments/route");
  const res = await POST(jreq("/x", { shipmentCode: "SHP-01" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/logistics/shipments: gửi projectId dự án khác (không được gán) → 403",
  S,
  async () => {
    const projectA = await taoDuAn("shipisoA");
    const projectB = await taoDuAn("shipisoB");
    const pmA = await taoUser("pm", "shipisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/logistics/shipments/route");
    const res = await POST(
      jreq("/x", {
        projectId: projectB,
        shipmentCode: "SHP-ISO",
        doNumber: "DO-01",
        poNumber: "PO-01",
        supplierName: "NCC Test",
        manifest: [],
      }),
    );
    assert.equal(res.status, 403);
  },
);

test(
  "POST rồi GET /api/engineering/logistics/shipments: tạo lô hàng & lọc theo status",
  S,
  async () => {
    const projectId = await taoDuAn("shipok");
    const pm = await taoUser("pm", "shipok");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/logistics/shipments/route");
    const shipmentCode = `SHP-${uniq("code")}`;
    const res = await POST(
      jreq("/x", {
        shipmentCode,
        doNumber: "DO-99",
        poNumber: "PO-99",
        supplierName: "NCC Test",
        manifest: [
          {
            itemCode: "PIPE-100",
            itemName: "Ống 100",
            orderedQty: 10,
            deliveredQty: 10,
            unit: "cây",
          },
        ],
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "dispatched");

    const resGet = await GET(jreq("/x?status=dispatched", undefined, "GET"));
    assert.equal(resGet.status, 200);
    assert.ok((await resGet.json()).data.some((s: any) => s.shipmentCode === shipmentCode));
  },
);

// ============================================================================
// POST /api/engineering/logistics/scan-receive
// ============================================================================

test("POST /api/engineering/logistics/scan-receive: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/logistics/scan-receive/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/logistics/scan-receive: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("scan403");
  const sub = await taoUser("subcon", "scan403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/logistics/scan-receive/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/logistics/scan-receive: thiếu mã QR → 422", S, async () => {
  const projectId = await taoDuAn("scanval");
  const pm = await taoUser("pm", "scanval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/logistics/scan-receive/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/logistics/scan-receive: quét mã QR hợp lệ tạo bởi chính hệ thống → 200, " +
    "ghi đúng project_id đang đăng nhập (không tin projectId trong chuỗi QR)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("scanok");
    const pm = await taoUser("pm", "scanok");
    await dangNhapDuAn(pm, projectId);
    const { generateMaterialQrCode } = await import("@/lib/ky-thuat/engineering-qr-logistics");
    const itemCode = `PIPE-${uniq("code")}`;
    const qrCode = generateMaterialQrCode({ projectId, itemCode, batchNo: "B01", quantity: 5 });

    const { POST } = await import("@/app/api/engineering/logistics/scan-receive/route");
    const res = await POST(jreq("/x", { qrCode }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.tagRecord.itemCode, itemCode);

    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM engineering_material_qr_tags WHERE qr_code = ?`,
      qrCode,
    );
    assert.equal(row?.project_id, projectId);
  },
);

test(
  "POST /api/engineering/logistics/scan-receive: mã QR sai checksum → 400 (lỗi đầu vào của " +
    "người quét, KHÔNG phải sự cố máy chủ — trước đây cả cụm ép về 500)",
  S,
  async () => {
    const projectId = await taoDuAn("scanbadqr");
    const pm = await taoUser("pm", "scanbadqr");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/logistics/scan-receive/route");
    const res = await POST(
      jreq("/x", { qrCode: "XB-MAT|v1|P1|ITEM|B1|Tmaterial_unit|Q1|CHKdeadbeef" }),
    );
    assert.equal(res.status, 400);
    // Hình dạng thân phản hồi KHÔNG đổi: vẫn { error: "<thông điệp tiếng Việt>" }.
    assert.match((await res.json()).error, /Mã QR không hợp lệ/);
  },
);

// ============================================================================
// GET/POST /api/engineering/ledger/merkle
// ============================================================================

test("GET /api/engineering/ledger/merkle: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/ledger/merkle/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/ledger/merkle: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("merkle403");
  const sub = await taoUser("subcon", "merkle403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/ledger/merkle/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("GET /api/engineering/ledger/merkle: batchCode không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("merkle404");
  const pm = await taoUser("pm", "merkle404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/engineering/ledger/merkle/route");
  const res = await GET(jreq("/x?batchCode=KHONG-TON-TAI", undefined, "GET"));
  assert.equal(res.status, 404);
});

test(
  "POST rồi GET /api/engineering/ledger/merkle: niêm phong batch, tra theo batchCode, " +
    "và batch của dự án khác không thấy được (404) dù đúng batchCode",
  S,
  async () => {
    const projectA = await taoDuAn("merkleisoA");
    const projectB = await taoDuAn("merkleisoB");
    const pmA = await taoUser("pm", "merkleisoA");
    const pmB = await taoUser("pm", "merkleisoB");
    const batchCode = `MERKLE-${uniq("code")}`;

    await dangNhapDuAn(pmA, projectA);
    const { POST, GET } = await import("@/app/api/engineering/ledger/merkle/route");
    const resPost = await POST(jreq("/x", { batchCode, records: [{ event: "TEST", n: 1 }] }));
    assert.equal(resPost.status, 200);
    const bodyPost = await resPost.json();
    assert.ok(bodyPost.merkleRoot);
    assert.equal(bodyPost.leafCount, 1);

    const resGetSelf = await GET(jreq(`/x?batchCode=${batchCode}`, undefined, "GET"));
    assert.equal(resGetSelf.status, 200);
    assert.equal((await resGetSelf.json()).root.merkle_root, bodyPost.merkleRoot);

    await dangNhapDuAn(pmB, projectB);
    const resGetOther = await GET(jreq(`/x?batchCode=${batchCode}`, undefined, "GET"));
    assert.equal(resGetOther.status, 404);

    await dangNhapDuAn(pmA, projectA);
    const resList = await GET(jreq("/x", undefined, "GET"));
    assert.equal(resList.status, 200);
    assert.ok((await resList.json()).roots.some((r: any) => r.batch_code === batchCode));
  },
);

test(
  "POST /api/engineering/ledger/merkle: body rỗng dùng batchCode/records/metadata mặc định " +
    "vẫn niêm phong thành công (4 bản ghi mẫu)",
  S,
  async () => {
    const projectId = await taoDuAn("merkledef");
    const pm = await taoUser("pm", "merkledef");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/ledger/merkle/route");
    const res = await POST(jreq("/x", {}));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.leafCount, 4);
  },
);

test("GET /api/engineering/ledger/merkle: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "merklenoproj");
  dangNhap(pm, null);
  const { GET } = await import("@/app/api/engineering/ledger/merkle/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("POST /api/engineering/ledger/merkle: chưa chọn dự án → 400", S, async () => {
  const pm = await taoUser("pm", "merklepnoproj");
  dangNhap(pm, null);
  const { POST } = await import("@/app/api/engineering/ledger/merkle/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

// ============================================================================
// POST /api/engineering/ledger/verify-proof
// ============================================================================

test("POST /api/engineering/ledger/verify-proof: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/ledger/verify-proof/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/ledger/verify-proof: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("verify403");
  const sub = await taoUser("subcon", "verify403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/ledger/verify-proof/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/engineering/ledger/verify-proof: thiếu leafHash và expectedRoot → 400",
  S,
  async () => {
    const projectId = await taoDuAn("verifyval");
    const pm = await taoUser("pm", "verifyval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/ledger/verify-proof/route");
    const res = await POST(jreq("/x", {}));
    assert.equal(res.status, 400);
  },
);

test(
  "POST /api/engineering/ledger/verify-proof: bằng chứng hợp lệ → isValid=true (PASS); " +
    "sửa một byte của hash trong proof → isValid=false (FAIL) — bất biến quan trọng nhất của " +
    "sổ cái Merkle, dùng thẳng buildMerkleTree/generateMerkleProof của chính module thật",
  S,
  async () => {
    const projectId = await taoDuAn("verifyok");
    const pm = await taoUser("pm", "verifyok");
    await dangNhapDuAn(pm, projectId);
    const { hashLeafRecord, buildMerkleTree, generateMerkleProof } =
      await import("@/lib/bao-mat/merkle-audit-ledger");

    const records = [
      { event: "A", n: 1 },
      { event: "B", n: 2 },
      { event: "C", n: 3 },
      { event: "D", n: 4 },
    ];
    const leafHashes = records.map((r) => hashLeafRecord(r));
    const tree = buildMerkleTree(leafHashes);
    const leafIndex = 2;
    const proof = generateMerkleProof(leafIndex, tree.treeLevels);

    const { POST } = await import("@/app/api/engineering/ledger/verify-proof/route");
    const resValid = await POST(
      jreq("/x", { leafHash: leafHashes[leafIndex], proof, expectedRoot: tree.root }),
    );
    assert.equal(resValid.status, 200);
    const bodyValid = await resValid.json();
    assert.equal(bodyValid.isValid, true);

    // Sửa 1 byte của hash bước đầu tiên trong proof → phải FAIL.
    const proofHong = proof.map((p: any, i: number) =>
      i === 0 ? { ...p, hash: (p.hash[0] === "0" ? "1" : "0") + p.hash.slice(1) } : p,
    );
    const resInvalid = await POST(
      jreq("/x", { leafHash: leafHashes[leafIndex], proof: proofHong, expectedRoot: tree.root }),
    );
    assert.equal(resInvalid.status, 200);
    const bodyInvalid = await resInvalid.json();
    assert.equal(bodyInvalid.isValid, false);
  },
);

test(
  "POST /api/engineering/ledger/verify-proof: truyền leafRecord thay vì leafHash → route tự " +
    "băm bằng hashLeafRecord() thật",
  S,
  async () => {
    const projectId = await taoDuAn("verifyrec");
    const pm = await taoUser("pm", "verifyrec");
    await dangNhapDuAn(pm, projectId);
    const { hashLeafRecord, buildMerkleTree, generateMerkleProof } =
      await import("@/lib/bao-mat/merkle-audit-ledger");
    const records = [{ event: "X" }, { event: "Y" }];
    const tree = buildMerkleTree(records.map((r) => hashLeafRecord(r)));
    const proof = generateMerkleProof(0, tree.treeLevels);

    const { POST } = await import("@/app/api/engineering/ledger/verify-proof/route");
    const res = await POST(jreq("/x", { leafRecord: records[0], proof, expectedRoot: tree.root }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.isValid, true);
    assert.equal(body.leafHash, hashLeafRecord(records[0]));
  },
);

// ============================================================================
// POST /api/engineering/hse-vision/scan
// ============================================================================

test("POST /api/engineering/hse-vision/scan: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/engineering/hse-vision/scan/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/engineering/hse-vision/scan: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("hsescan403");
  const sub = await taoUser("subcon", "hsescan403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/hse-vision/scan/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/engineering/hse-vision/scan: thiếu scanName/imageUrl → 422", S, async () => {
  const projectId = await taoDuAn("hsescanval");
  const pm = await taoUser("pm", "hsescanval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/engineering/hse-vision/scan/route");
  const res = await POST(jreq("/x", { scanName: "Quét A" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/engineering/hse-vision/scan: gửi projectId dự án khác (không được gán) → 403",
  S,
  async () => {
    const projectA = await taoDuAn("hsescanisoA");
    const projectB = await taoDuAn("hsescanisoB");
    const pmA = await taoUser("pm", "hsescanisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/hse-vision/scan/route");
    const res = await POST(
      jreq("/x", { projectId: projectB, scanName: "Quét lạ", imageUrl: "https://x/img.jpg" }),
    );
    assert.equal(res.status, 403);
  },
);

test(
  "POST /api/engineering/hse-vision/scan: quét ảnh thành công — hàm phát hiện nguy cơ là " +
    "băm hash xác định trên URL ảnh, không gọi mạng/API thị giác thật",
  S,
  async () => {
    const projectId = await taoDuAn("hsescanok");
    const pm = await taoUser("pm", "hsescanok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/hse-vision/scan/route");
    const res = await POST(
      jreq("/x", { scanName: "Quét công trường A", imageUrl: "https://x/img-test.jpg" }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.scan.id);
  },
);

// ============================================================================
// GET /api/engineering/hse-vision/scans
// ============================================================================

test("GET /api/engineering/hse-vision/scans: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/hse-vision/scans/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/hse-vision/scans: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("hsescans403");
  const sub = await taoUser("subcon", "hsescans403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/hse-vision/scans/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test(
  "GET /api/engineering/hse-vision/scans: chỉ thấy scan của dự án đang chọn theo cookie " +
    "(quy hồi IDOR: query ?projectId=<dự án khác> KHÔNG được dùng)",
  S,
  async () => {
    const projectA = await taoDuAn("hseisoA");
    const projectB = await taoDuAn("hseisoB");
    const pmA = await taoUser("pm", "hseisoA");
    const pmB = await taoUser("pm", "hseisoB");

    await dangNhapDuAn(pmB, projectB);
    const { POST: SCAN_POST } = await import("@/app/api/engineering/hse-vision/scan/route");
    const scanNameB = `Quét B ${uniq("b")}`;
    await SCAN_POST(jreq("/x", { scanName: scanNameB, imageUrl: "https://x/b.jpg" }));

    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/engineering/hse-vision/scans/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(!body.data.some((s: any) => s.scanName === scanNameB));
  },
);

// ============================================================================
// GET/POST /api/engineering/edge-vision-tracking  (module `engineering-nextgen-apex` mặc định TẮT)
// ============================================================================

test("GET /api/engineering/edge-vision-tracking: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/edge-vision-tracking/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/engineering/edge-vision-tracking: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("edge403");
  const sub = await taoUser("subcon", "edge403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/edge-vision-tracking/route");
  const res = await GET(jreq("/x", undefined, "GET"));
  assert.equal(res.status, 403);
});

test(
  "GET /api/engineering/edge-vision-tracking: module engineering-nextgen-apex mặc định TẮT → 404",
  S,
  async () => {
    const projectId = await taoDuAn("edgeoff");
    const pm = await taoUser("pm", "edgeoff");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/edge-vision-tracking/route");
    const res = await GET(jreq("/x", undefined, "GET"));
    assert.equal(res.status, 404);
  },
);

test(
  "POST rồi GET /api/engineering/edge-vision-tracking: audit cốt thép trước đổ bê tông & " +
    "detection 360 (BUG THẬT: GET của cả 2 nhánh 500 trước khi sửa — xem chú thích đầu file)",
  S,
  async () => {
    const projectId = await taoDuAn("edgeok");
    const pm = await taoUser("pm", "edgeok");
    await batModule("engineering-nextgen-apex", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/edge-vision-tracking/route");

    const auditCode = `REBAR-${uniq("code")}`;
    const resRebar = await POST(jreq("/x", { action: "audit_rebar", auditCode }));
    assert.equal(resRebar.status, 200);
    assert.equal((await resRebar.json()).result.auditCode, auditCode);

    const resGetRebar = await GET(jreq("/x?type=rebar", undefined, "GET"));
    assert.equal(resGetRebar.status, 200);
    const bodyGetRebar = await resGetRebar.json();
    assert.ok(bodyGetRebar.rebarAudits.some((a: any) => a.audit_code === auditCode));

    const detectionCode = `DET-${uniq("code")}`;
    const resDet = await POST(jreq("/x", { action: "detect_360", detectionCode }));
    assert.equal(resDet.status, 200);
    assert.equal((await resDet.json()).detection.detectionCode, detectionCode);

    const resGetDet = await GET(jreq("/x?type=detection", undefined, "GET"));
    assert.equal(resGetDet.status, 200);
    const bodyGetDet = await resGetDet.json();
    assert.ok(bodyGetDet.detections.some((d: any) => d.detection_code === detectionCode));
  },
);

// ============================================================================
// GET/POST /api/engineering/generative-routing  (module `engineering-nextgen-apex` mặc định TẮT)
// ============================================================================

test("GET /api/engineering/generative-routing: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/generative-routing/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/engineering/generative-routing: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("genr403");
  const sub = await taoUser("subcon", "genr403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/engineering/generative-routing/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test(
  "GET /api/engineering/generative-routing: module engineering-nextgen-apex mặc định TẮT → 404",
  S,
  async () => {
    const projectId = await taoDuAn("genroff");
    const pm = await taoUser("pm", "genroff");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/engineering/generative-routing/route");
    const res = await GET();
    assert.equal(res.status, 404);
  },
);

test(
  "POST rồi GET /api/engineering/generative-routing: giải tuyến 3D A* & tra lại lịch sử " +
    "(BUG THẬT: GET này 500 trước khi sửa vì listGenerativeRoutingRuns truyền mảng thay vì spread)",
  S,
  async () => {
    const projectId = await taoDuAn("genrok");
    const pm = await taoUser("pm", "genrok");
    await batModule("engineering-nextgen-apex", projectId, pm.id);
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/generative-routing/route");
    const routingCode = `ROUTE-${uniq("code")}`;
    const res = await POST(jreq("/x", { routingCode }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result.routingCode, routingCode);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.runs.some((r: any) => r.routing_code === routingCode));
  },
);

// ============================================================================
// GET/POST /api/engineering/closed-loop-sync
// ============================================================================

async function taoWbsTask(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${uniq(ten)}`,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, ?)`,
    towerId,
    `SH-${uniq(ten)}`,
    `Sheet ${ten}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, ?)`,
    sheetTypeId,
    `WP-${uniq(ten)}`,
    `Gói ${ten}`,
  );
  return insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, ?, ?, 0.5, 'dang_thi_cong')`,
    packageId,
    `T-${uniq(ten)}`,
    `Việc ${ten}`,
  );
}

test("GET /api/engineering/closed-loop-sync: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/engineering/closed-loop-sync/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/engineering/closed-loop-sync: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cls403");
  const sub = await taoUser("subcon", "cls403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/engineering/closed-loop-sync/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test(
  "POST rồi GET /api/engineering/closed-loop-sync: đồng bộ Spool→WBS→IPC, cập nhật đúng " +
    "tiến độ task trong CÙNG dự án, provenanceToken băm SHA-256 thật (không phải test giả)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("clsok");
    const pm = await taoUser("pm", "clsok");
    const taskId = await taoWbsTask(projectId, "clsok");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/engineering/closed-loop-sync/route");
    const spoolId = `SP-${uniq("code")}`;
    const res = await POST(
      jreq("/x", { spoolId, wbsTaskId: taskId, calculatedQty: 10, unitRateVnd: 500000 }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.syncedAmountVnd, 5_000_000);
    assert.match(body.provenanceToken, /^SIG-PAY-[0-9A-F]{24}$/);

    const rowLog = await queryOne<{ synced_amount_vnd: number }>(
      `SELECT synced_amount_vnd FROM engineering_closed_loop_sync_logs WHERE sync_code = ?`,
      body.syncCode,
    );
    assert.equal(Number(rowLog?.synced_amount_vnd), 5_000_000);

    const rowTask = await queryOne<{ progress_percent: number }>(
      `SELECT progress_percent FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.ok(Number(rowTask?.progress_percent) > 0.5);

    const resGet = await GET();
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.ok(bodyGet.logs.some((l: any) => l.sync_code === body.syncCode));
  },
);

test(
  "POST /api/engineering/closed-loop-sync: wbsTaskId thuộc dự án KHÁC → không cập nhật tiến độ " +
    "task đó (JOIN lọc theo project_id chặn đúng), log vẫn ghi thành công",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectA = await taoDuAn("clsisoA");
    const projectB = await taoDuAn("clsisoB");
    const pmA = await taoUser("pm", "clsisoA");
    const taskIdB = await taoWbsTask(projectB, "clsisoB");

    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/closed-loop-sync/route");
    const res = await POST(
      jreq("/x", { spoolId: "SP-ISO", wbsTaskId: taskIdB, calculatedQty: 5, unitRateVnd: 100000 }),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).success, true);

    const rowTaskB = await queryOne<{ progress_percent: number }>(
      `SELECT progress_percent FROM tasks WHERE id = ?`,
      taskIdB,
    );
    assert.equal(Number(rowTaskB?.progress_percent), 0.5); // không đổi — vẫn là giá trị khởi tạo
  },
);
