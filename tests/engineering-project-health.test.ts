import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateEngineeringHealthIndex,
  ProjectHealthMetricsInput,
} from "@/lib/ky-thuat/engineering-project-health";

test("M72: calculateEngineeringHealthIndex tính đúng EHI % và phân loại sức khỏe dự án", () => {
  const input: ProjectHealthMetricsInput = {
    spiIndex: 1.05,
    cpiIndex: 1.02,
    qualityPassRatePercent: 98.0,
    bimGeometryAccuracyPercent: 95.0,
    lcaCarbonScorePercent: 92.0,
    baselinePlannedCompletionDate: "2026-12-30",
    scheduleVarianceDays: -5,
  };

  const res = calculateEngineeringHealthIndex(input);

  assert.ok(res.healthIndexPercent >= 90);
  assert.equal(res.healthTier, "Flawless / Thượng Hạng");
  assert.ok(res.projectedCompletionP50 <= "2026-12-30");
  assert.ok(res.projectedCompletionP80 > res.projectedCompletionP50);
});
