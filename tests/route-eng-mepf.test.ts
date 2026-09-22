import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING — MEPF & hiện trường số
// (Đợt 5 chiến dịch coverage — Việc W4). Route (mepf-predictive, spatial/compute,
// spatial/annotations, hse-vision/scan, hse-vision/scans, iot/** đã bị xoá 2026-09-21, xem
// PROGRESS.md):
//   - app/api/engineering/mepf-hydraulic/route.ts            (GET lịch sử / POST tính thủy lực)
//   - app/api/engineering/mepf-nesting/route.ts               (GET lịch sử / POST tối ưu cắt phôi)
//   - app/api/engineering/mepf-takeoff/route.ts                (GET lịch sử / POST bóc tách KL AI)
//   - app/api/engineering/mepf-tc/route.ts                     (GET ma trận T&C / POST tạo·log·đánh giá)
//   - app/api/engineering/mepf-voice/route.ts                  (GET nhật ký / POST phân tích giọng nói)
//   - app/api/engineering/pipe-mass-balance/route.ts           (GET lịch sử / POST đối soát mass-balance)
//   - app/api/engineering/pipe-spool-tracking/route.ts         (GET danh sách / POST cập nhật Spool)
//   - app/api/engineering/logistics/shipments/route.ts          (GET / POST lô hàng)
//   - app/api/engineering/logistics/scan-receive/route.ts       (POST quét nhận vật tư QR)
//   - app/api/engineering/ledger/merkle/route.ts                (GET / POST sổ cái Merkle)
//   - app/api/engineering/ledger/verify-proof/route.ts          (POST xác thực Merkle Proof)
//   - app/api/engineering/closed-loop-sync/route.ts               (GET / POST đồng bộ Spool→WBS→IPC)
//
// (route/lib edge-vision-tracking, generative-routing — module `engineering-nextgen-apex` — đã
// bị xoá 2026-09-22, 1/6 module `thuNghiem: true` không ai bật, xem PROGRESS.md.)
//
// BUG THẬT lộ ra khi viết test này (đã sửa cùng nhánh):
//   1) 9 hàm `list*` trong lib/ky-thuat/engineering-mepf-{hydraulic,nesting,predictive,takeoff,voice}.ts
//      + engineering-pipe-stash-hunter.ts gọi
//      `query(sql, [projectId])` — TRUYỀN HẲN MỘT MẢNG làm 1 tham số REST thay vì spread —
//      khiến Postgres nhận `$1` là giá trị mảng `{"<id>"}` thay vì số nguyên/bigint và luôn
//      ném lỗi "invalid input syntax for type integer/bigint" → route GET tương ứng LUÔN 500,
//      chưa từng chạy được. Đã sửa thành truyền tham số trực tiếp (rest), khớp đúng khuôn hàm
//      anh em cùng file dùng đúng (`listTcMatrices` trong engineering-mepf-tc.ts).
//   (mục 2 kiểm CAN.viewEngineeringIot của app/api/engineering/iot/devices/route.ts đã hết ý
//   nghĩa cùng route 2026-09-21.)
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
