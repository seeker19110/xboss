import test from "node:test";
import assert from "node:assert/strict";
import {
  computeSubcontractorTrustScore,
  classifySubconTier,
  recommendShortlistForPackage,
  SubconProfile,
  SubconEvaluationResult,
} from "@/lib/ky-thuat/engineering-subcon-ai";

test("M82: computeSubcontractorTrustScore tính đúng điểm tín nhiệm tổng hợp 5 trục", () => {
  // Nhà thầu hoàn hảo: 100% tiến độ, 100% BBNT, 0 NCR, 100 HSE, 0% cost variance
  const perfectRes = computeSubcontractorTrustScore({
    onTimeCompletionRate: 100,
    bbntPassRate: 100,
    ncrIncidentCount: 0,
    hseSafetyScore: 100,
    costVarianceRate: 0,
  });

  assert.equal(perfectRes.trustScore, 100);
  assert.equal(perfectRes.tierGrade, "TIER_A");

  // Nhà thầu có 2 lỗi NCR và trễ tiến độ
  const penalizedRes = computeSubcontractorTrustScore({
    onTimeCompletionRate: 70, // 70 * 0.3 = 21
    bbntPassRate: 80, // 80 * 0.25 = 20
    ncrIncidentCount: 2, // (100 - 30) = 70 * 0.2 = 14
    hseSafetyScore: 80, // 80 * 0.15 = 12
    costVarianceRate: 10, // (100 - 30) = 70 * 0.1 = 7
  });

  // Tổng = 21 + 20 + 14 + 12 + 7 = 74
  assert.equal(penalizedRes.trustScore, 74);
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
      ncrPenaltyScore: 100,
      hseScore: 95,
      costControlScore: 90,
    },
    summary: "Rất tốt",
  });
  metricsMap.set("sub-2", {
    trustScore: 80,
    tierGrade: "TIER_B",
    componentScores: {
      scheduleScore: 80,
      qualityScore: 80,
      ncrPenaltyScore: 85,
      hseScore: 80,
      costControlScore: 80,
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
