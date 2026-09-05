import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeSubcontractorTrustScore,
  classifySubconTier,
  recommendShortlistForPackage,
  SubconProfile,
  SubconEvaluationResult,
} from "@/lib/ky-thuat/engineering-subcon-ai";

const S = { skip: !HAS_TEST_DB };

test("M82: computeSubcontractorTrustScore tính đúng điểm tín nhiệm trên 3 trục có dữ liệu thật", () => {
  // Nhà thầu hoàn hảo: 100% tiến độ, 100% BBNT, 100 HSE → 100 * (30+25+15)/70 = 100
  const perfectRes = computeSubcontractorTrustScore({
    onTimeCompletionRate: 100,
    bbntPassRate: 100,
    hseSafetyScore: 100,
  });

  assert.equal(perfectRes.trustScore, 100);
  assert.equal(perfectRes.tierGrade, "TIER_A");

  // Nhà thầu trễ tiến độ, BBNT/HSE khá — tính tay theo trọng số MỚI:
  //   70 * 30/70 = 2100/70 = 30
  //   80 * 25/70 = 2000/70 = 28,571428…
  //   80 * 15/70 = 1200/70 = 17,142857…
  //   tổng = 75,714285… → toFixed(2) = 75,71
  const penalizedRes = computeSubcontractorTrustScore({
    onTimeCompletionRate: 70,
    bbntPassRate: 80,
    hseSafetyScore: 80,
  });

  assert.equal(penalizedRes.trustScore, 75.71);
  assert.equal(penalizedRes.tierGrade, "TIER_B");
});

test("M82: classifySubconTier phân hạng chính xác A/B/C/D", () => {
  assert.equal(classifySubconTier(90), "TIER_A");
  assert.equal(classifySubconTier(85), "TIER_A");
  assert.equal(classifySubconTier(84.9), "TIER_B");
  assert.equal(classifySubconTier(70), "TIER_B");
  assert.equal(classifySubconTier(69.9), "TIER_C");
  assert.equal(classifySubconTier(50), "TIER_C");
  assert.equal(classifySubconTier(49.9), "TIER_D");
});

test("M82: recommendShortlistForPackage xếp hạng đúng top ứng viên thầu phù hợp", () => {
  const profiles: SubconProfile[] = [
    {
      id: "sub-1",
      projectId: 1,
      companyName: "Thầu PCCC Hưng Thịnh",
      primaryDiscipline: "FIRE_FIGHTING",
      specialties: ["FM200", "Sprinkler"],
      workforceCapacity: 30,
      equipmentAssets: [],
      certifications: [],
    },
    {
      id: "sub-2",
      projectId: 1,
      companyName: "Thầu Điện Đại Nam",
      primaryDiscipline: "ELECTRICAL",
      specialties: ["Trạm 22kV"],
      workforceCapacity: 20,
      equipmentAssets: [],
      certifications: [],
    },
  ];

  const metricsMap = new Map<string, SubconEvaluationResult>();
  metricsMap.set("sub-1", {
    trustScore: 92,
    tierGrade: "TIER_A",
    componentScores: {
      scheduleScore: 90,
      qualityScore: 95,
      hseScore: 95,
    },
    summary: "Rất tốt",
  });
  metricsMap.set("sub-2", {
    trustScore: 80,
    tierGrade: "TIER_B",
    componentScores: {
      scheduleScore: 80,
      qualityScore: 80,
      hseScore: 80,
    },
    summary: "Bình thường",
  });

  const candidates = recommendShortlistForPackage(
    {
      packageName: "Gói PCCC Tòa Nhà",
      discipline: "FIRE_FIGHTING",
      estimatedBudget: 2000000000,
      requiredCapacity: 15,
      requiredSpecialties: ["FM200"],
    },
    profiles,
    metricsMap,
  );

  assert.equal(candidates.length, 2);
  assert.equal(
    candidates[0].profileId,
    "sub-1",
    "Thầu PCCC phải xếp hạng 1 vì cùng chuyên ngành và Trust cao",
  );
  assert.ok(candidates[0].matchScore > candidates[1].matchScore);
});

// ===== Route POST /api/engineering/subcon-ai/evaluate (Đợt 6, Việc F) =====
// Trước quyết định nghiệp vụ 2026-09-05, route này LUÔN trả 422 vì 2/5 chỉ số bắt buộc
// (ncrIncidentCount, costVarianceRate) chưa có bảng nguồn nên bị gán cứng null. Công thức
// nay chỉ còn 3 chỉ số có dữ liệu thật ⇒ hồ sơ đã gắn supplier_id + có kỳ đánh giá phải
// chấm điểm được. Hai ca dưới là bằng chứng tính năng chạy được lần đầu.

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `M82F ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-m82f', ?, 1)`,
    `M82F ${ten}`,
    `m82f-${uniq(ten)}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId: 1 };
}

/** Module engineering-subcon-ai đánh dấu `thuNghiem` nên mặc định TẮT — phải bật theo dự án. */
async function batModule(projectId: number, actorId: number): Promise<void> {
  const ff = await import("@/lib/ha-tang/feature-flags");
  await ff.setFlag("engineering-subcon-ai", projectId, true, actorId, 1);
}

async function taoNhaCungCap(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name) VALUES (?)`, `M82F NCC ${uniq(ten)}`);
}

/** Hồ sơ thầu phụ M82; `supplierId = null` để mô phỏng hồ sơ chưa gắn nhà cung cấp. */
async function taoHoSo(projectId: number, supplierId: number | null): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_subcon_profiles (project_id, supplier_id, company_name, primary_discipline)
     VALUES (?, ?, ?, 'HVAC') RETURNING id`,
    projectId,
    supplierId,
    `M82F Cty ${uniq("hs")}`,
  );
  return row!.id;
}

async function taoKyDanhGia(
  supplierId: number,
  evaluatedBy: number,
  diem: { safety: number; quality: number; schedule: number },
): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO subcon_evaluations (supplier_id, period, safety_score, quality_score, schedule_score, evaluated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    supplierId,
    uniq("2026-Q"),
    diem.safety,
    diem.quality,
    diem.schedule,
    evaluatedBy,
  );
}

test(
  "M82 route: hồ sơ đã gắn supplier_id + có kỳ đánh giá → 200 kèm trustScore từ 3 chỉ số",
  S,
  async () => {
    const { POST } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
    const { NextRequest } = await import("next/server");
    const { queryOne } = await import("@/lib/db");

    const pm = await taoUser("pm", "pm-ok");
    const duAn = await taoDuAn("ok");
    await batModule(duAn, pm.id);
    await batModule(duAn, pm.id);
    const ncc = await taoNhaCungCap("ok");
    const hoSo = await taoHoSo(duAn, ncc);
    // Thang 1–5 → %: schedule 5 → 100%, quality 4 → 75%, safety 3 → 50%.
    await taoKyDanhGia(ncc, pm.id, { safety: 3, quality: 4, schedule: 5 });

    await dangNhapDuAn(pm, duAn);
    const res = await POST(
      new NextRequest("http://localhost/api/engineering/subcon-ai/evaluate", {
        method: "POST",
        body: JSON.stringify({ profileId: hoSo }),
      }),
    );
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));

    // Tính tay theo trọng số mới:
    //   100 * 30/70 = 3000/70
    //    75 * 25/70 = 1875/70
    //    50 * 15/70 =  750/70
    //   tổng = 5625/70 = 80,357142… → toFixed(2) = 80,36 → TIER_B
    assert.equal(body.evaluation.trustScore, 80.36);
    assert.equal(body.evaluation.tierGrade, "TIER_B");
    assert.deepEqual(body.evaluation.componentScores, {
      scheduleScore: 100,
      qualityScore: 75,
      hseScore: 50,
    });

    // Đã ghi thật một dòng chỉ số; 2 cột bỏ dùng để NULL, không phải mặc định 0.
    const luu = await queryOne<{
      trustScore: number;
      ncrCount: number | null;
      costVarianceRate: number | null;
    }>(
      `SELECT trust_score AS "trustScore", ncr_incident_count AS "ncrCount",
              cost_variance_rate AS "costVarianceRate"
         FROM engineering_subcon_performance_metrics WHERE profile_id = ?`,
      hoSo,
    );
    assert.equal(Number(luu!.trustScore), 80.36);
    assert.equal(luu!.ncrCount, null);
    assert.equal(luu!.costVarianceRate, null);
    dangXuat();
  },
);

test("M82 route: hồ sơ chưa gắn supplier_id → vẫn 422, không ghi dòng nào", S, async () => {
  const { POST } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
  const { NextRequest } = await import("next/server");
  const { queryOne } = await import("@/lib/db");

  const pm = await taoUser("pm", "pm-thieu");
  const duAn = await taoDuAn("thieu");
  await batModule(duAn, pm.id);
  const hoSo = await taoHoSo(duAn, null);

  await dangNhapDuAn(pm, duAn);
  const res = await POST(
    new NextRequest("http://localhost/api/engineering/subcon-ai/evaluate", {
      method: "POST",
      body: JSON.stringify({ profileId: hoSo }),
    }),
  );
  const body = await res.json();
  assert.equal(res.status, 422, JSON.stringify(body));
  assert.equal(
    body.thieuDuLieu.some((t: { chiSo: string }) => t.chiSo === "onTimeCompletionRate"),
    true,
  );
  // Hai chỉ số đã bỏ không còn nằm trong danh sách "thiếu dữ liệu".
  assert.equal(
    body.thieuDuLieu.some((t: { chiSo: string }) =>
      ["ncrIncidentCount", "costVarianceRate"].includes(t.chiSo),
    ),
    false,
  );

  const luu = await queryOne(
    `SELECT id FROM engineering_subcon_performance_metrics WHERE profile_id = ?`,
    hoSo,
  );
  assert.equal(luu ?? null, null, "422 không được ghi dòng chỉ số nào");
  dangXuat();
});

test("M82 route: hồ sơ đã gắn supplier_id nhưng chưa có kỳ đánh giá nào → 422", S, async () => {
  const { POST } = await import("@/app/api/engineering/subcon-ai/evaluate/route");
  const { NextRequest } = await import("next/server");

  const pm = await taoUser("pm", "pm-chuadg");
  const duAn = await taoDuAn("chuadg");
  await batModule(duAn, pm.id);
  const ncc = await taoNhaCungCap("chuadg");
  const hoSo = await taoHoSo(duAn, ncc);

  await dangNhapDuAn(pm, duAn);
  const res = await POST(
    new NextRequest("http://localhost/api/engineering/subcon-ai/evaluate", {
      method: "POST",
      body: JSON.stringify({ profileId: hoSo }),
    }),
  );
  const body = await res.json();
  assert.equal(res.status, 422, JSON.stringify(body));
  assert.equal(body.metrics.soKyDanhGia, 0);
  dangXuat();
});
