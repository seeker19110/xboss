import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm ENGINEERING — đấu thầu & tài chính
// (Đợt 5 chiến dịch coverage — Việc W3). Route:
//   - app/api/engineering/cashflow/forecasts/route.ts                 (GET danh sách dự báo dòng tiền)
//   - app/api/engineering/cashflow/simulate/route.ts                  (POST mô phỏng dòng tiền)
//   - app/api/engineering/bidding/packages/route.ts                   (GET/POST gói thầu)
//   - app/api/engineering/bidding/quotes/route.ts                     (GET/POST báo giá NCC)
//   - app/api/engineering/bidding/analyze/route.ts                    (POST phân tích đấu thầu)
//   - app/api/engineering/qs-bom-explosion/route.ts                   (GET/POST QS omnipotent)
//   - app/api/engineering/shopdrawing-lod400/route.ts                 (GET/POST Shopdrawing LOD400)
//   - app/api/engineering/pinnacle/pulse/route.ts                     (GET/POST Apex Pulse)
//
// (carbon-lca, multi-agent-copilot, prescriptive, fidic/claims đã bị xoá 2026-09-21; predictions,
// fidic-tia, subcon-ai đã bị xoá 2026-09-22 — 3/6 module `thuNghiem: true` không ai bật, cùng đợt
// xoá autonomy/engineering-graph/combine — xem PROGRESS.md.)
//
// Xác nhận (đọc code): không route nào trong cụm này gọi mạng ra ngoài — mọi hàm "AI"/dự báo là
// hàm xác định (deterministic), không `fetch`/LLM/HTTP client nào trong các module
// lib/ky-thuat/engineering-{cashflow,bidding-matrix,qs-omnipotent,shopdrawing-omnipotent,
// pinnacle-synergy}.ts (đã `grep` không thấy `fetch(`/`http`/`openai`/`anthropic`).

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

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

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
    assert.equal(
      analyzeBody.data.rankings[0].vendorName,
      "NCC rẻ",
      "giá thấp hơn xếp hạng cao hơn",
    );
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

test(
  "POST /api/engineering/bidding/analyze: gói thầu thuộc dự án khác → 404 (không phải 500)",
  S,
  async () => {
    // Trước đây catch chung ép mọi lỗi về 500, kể cả "Không tìm thấy" — client không phân biệt
    // được "gói thầu không thuộc dự án này" (kết quả nghiệp vụ bình thường) với sự cố hệ thống.
    // Dữ liệu KHÔNG lộ ở cả hai bản (runBiddingAnalysis đã lọc project_id trong SELECT), đây
    // thuần là mã lỗi. Nay bám khuôn route anh em cùng thư mục (graph/lineage/impact).
    const projectA = await taoDuAn("banalyzeisoA");
    const projectB = await taoDuAn("banalyzeisoB");
    const pmB = await taoUser("pm", "banalyzeisoB");
    await dangNhapDuAn(pmB, projectB);
    const pkgB = await taoGoiThau(pmB, projectB, "banalyzeisoB");
    const pmA = await taoUser("pm", "banalyzeisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/engineering/bidding/analyze/route");
    const res = await POST(jreq("/x", { packageId: pkgB }));
    assert.equal(res.status, 404);
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

test(
  "POST /api/engineering/qs-bom-explosion: bch không có quyền (chỉ manageDrawings) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("qsbom403");
    const u = await taoUser("bch", "qsbom403");
    await dangNhapDuAn(u, projectId);
    const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
    const res = await POST(jreq("/x", {}));
    assert.equal(res.status, 403);
  },
);

test(
  "POST /api/engineering/qs-bom-explosion: action explode_bom thiếu tham số → 422",
  S,
  async () => {
    const projectId = await taoDuAn("qsbomval");
    const pm = await taoUser("pm", "qsbomval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
    const res = await POST(jreq("/x", { action: "explode_bom" }));
    assert.equal(res.status, 422);
  },
);

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

test(
  "POST /api/engineering/qs-bom-explosion: action fidic_claim thiếu tham số → 422",
  S,
  async () => {
    const projectId = await taoDuAn("qsfidval");
    const pm = await taoUser("pm", "qsfidval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/qs-bom-explosion/route");
    const res = await POST(jreq("/x", { action: "fidic_claim" }));
    assert.equal(res.status, 422);
  },
);

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

test(
  "POST /api/engineering/shopdrawing-lod400: convert_lod400 thiếu segments → 400",
  S,
  async () => {
    const projectId = await taoDuAn("sd400val");
    const pm = await taoUser("pm", "sd400val");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
    const res = await POST(jreq("/x", { action: "convert_lod400" }));
    assert.equal(res.status, 400);
  },
);

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

test(
  "POST /api/engineering/shopdrawing-lod400: action plenum_clearance trả kết quả phân tích",
  S,
  async () => {
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
  },
);

test(
  "POST /api/engineering/shopdrawing-lod400: action spatial_hierarchy trả kết quả phân cấp",
  S,
  async () => {
    const projectId = await taoDuAn("sd400hier");
    const pm = await taoUser("pm", "sd400hier");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/engineering/shopdrawing-lod400/route");
    const res = await POST(jreq("/x", { action: "spatial_hierarchy", discipline: "hvac" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.hierarchy);
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
