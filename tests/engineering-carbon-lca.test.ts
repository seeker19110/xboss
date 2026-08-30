import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEmbodiedCarbonLCA, MaterialLcaItem } from "@/lib/ky-thuat/engineering-carbon-lca";

test("M71: calculateEmbodiedCarbonLCA tính toán đúng tổng phát thải và điểm LEED công trình xanh", () => {
  const materials: MaterialLcaItem[] = [
    { materialType: "steel_pipe", description: "Ống thép SCH40", weightKg: 10000 }, // 10000 * 2.85 = 28500 kg
    { materialType: "galvanized_duct", description: "Tôn tráng kẽm", weightKg: 5000 }, // 5000 * 2.40 = 12000 kg
    { materialType: "copper_cable", description: "Cáp đồng", weightKg: 2000 }, // 2000 * 5.60 = 11200 kg
  ];
  // Tổng = 28500 + 12000 + 11200 = 51700 kgCO2e = 51.7 tấn CO2e
  // GFA = 2000 m2 -> Cường độ = 51700 / 2000 = 25.85 kgCO2e/m2 (< 35 -> LEED Platinum 5 điểm)

  const res = calculateEmbodiedCarbonLCA("LCA-01", materials, 2000.0);

  assert.equal(res.reportCode, "LCA-01");
  assert.equal(res.totalMaterialWeightKg, 17000);
  assert.equal(res.totalEmbodiedCarbonKgCo2e, 51700);
  assert.equal(res.totalEmbodiedCarbonTonCo2e, 51.7);
  assert.equal(res.carbonIntensityKgCo2ePerM2, 25.85);
  assert.equal(res.leedPointsEstimated, 5);
  assert.equal(res.greenCertificationTier, "LEED Platinum Eligible");
});
