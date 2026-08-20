// tests/engineering-cad-carbon-lifecycle.test.ts — Unit tests for 6D Carbon LCA & 7D Predictive Asset Lifecycle (M76 / M92)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculate6dCarbonLca,
  evaluateAssetHealthAndRul,
  exportDigitalTwinPassport,
  EMBODIED_CARBON_FACTORS,
} from "@/lib/engineering-cad-carbon-lifecycle";
import { fitCylinderRansac, generateAsBuiltRedlineAndStamp } from "@/lib/engineering-scan-to-bim";

test("M76: calculate6dCarbonLca tính toán phát thải carbon ẩn theo ISO 14040/14044", () => {
  const elements = [
    { category: "galvanized_steel" as const, weightKg: 2000 }, // 2000 * 2.85 = 5700 kgCO2e
    { category: "black_steel" as const, weightKg: 3000 }, // 3000 * 2.15 = 6450 kgCO2e
    { category: "copper" as const, weightKg: 500 }, // 500 * 3.82 = 1910 kgCO2e
    { category: "ppr_plastic" as const, weightKg: 800 }, // 800 * 2.41 = 1928 kgCO2e
  ];

  const result = calculate6dCarbonLca(elements, 4000); // 4000 m2 sàn

  assert.equal(result.totalWeightKg, 6300);
  assert.ok(result.totalEmbodiedCarbonKgCo2e > 15000);
  assert.ok(result.totalEmbodiedCarbonTonCo2e > 15.0);
  assert.equal(result.breakdownByMaterial.length, 4);
  assert.ok(
    ["Low-Carbon Apex (A+)", "Standard (B)", "High-Emissions Alert (C)"].includes(
      result.complianceRating,
    ),
  );
});

test("M76: evaluateAssetHealthAndRul tính toán tuổi thọ còn lại RUL và dự báo MTBF", () => {
  const asset = {
    installedDateISO: "2024-01-01T00:00:00.000Z",
    expectedLifespanYears: 15,
    mtbfHours: 20000,
    currentOperatingHours: 10000,
    incidentCount: 1,
  };

  const result = evaluateAssetHealthAndRul(asset);

  assert.ok(result.remainingUsefulLifePercent > 0);
  assert.ok(result.healthScorePercent > 0);
  assert.ok(result.daysToNextFailurePredicted > 0);
  assert.equal(result.riskStatus, "healthy");
});

test("M76: exportDigitalTwinPassport xuất hộ chiếu số LOD 500 với Merkle Root Proof", () => {
  const assets = [
    {
      recordCode: "REC-PUMP-01",
      assetGuid: "GUID-PUMP-001",
      equipmentName: "Bơm ly tâm Chiller",
      systemCode: "HVAC_CHILLER",
      serialNumber: "SN-2026-X889",
      installedDate: "2026-06-01",
      expectedLifespanYears: 15,
      mtbfHours: 25000,
      currentOperatingHours: 1200,
      remainingUsefulLifePercent: 99.0,
      maintenanceCycleDays: 90,
      nextMaintenanceDate: "2026-09-01",
      healthScorePercent: 99.0,
      maintenanceLog: [],
    },
  ];

  const passport = exportDigitalTwinPassport("PRJ-TT-AVIO-A", assets, 18.5);

  assert.ok(passport.passportToken.startsWith("PASSPORT-LOD500-"));
  assert.equal(passport.lodStandard, "LOD 500 - As-Built Operational Twin");
  assert.equal(passport.totalBimAssetsCount, 1);
  assert.equal(passport.totalEmbodiedCarbonTonCo2e, 18.5);
  assert.ok(passport.merkleProofRoot.startsWith("MERKLE-ROOT:0x"));
});

test("M76: fitCylinderRansac trích xuất hình trụ ống từ đám mây điểm 3D", () => {
  // Tạo đám mây điểm nhân tạo xung quanh hình trụ R=50mm dọc trục Z
  const points = [];
  for (let i = 0; i < 30; i++) {
    const theta = (i / 30) * Math.PI * 2;
    const x = Math.cos(theta) * 50;
    const y = Math.sin(theta) * 50;
    const z = (i % 5) * 200;
    points.push({ pointId: `PT-${i}`, x, y, z });
  }

  const result = fitCylinderRansac(points, 50.0, 50, 5.0);

  assert.equal(result.totalPoints, 30);
  assert.ok(result.inliersCount >= 15);
  assert.equal(result.estimatedRadiusMm, 50.0);
  assert.equal(result.estimatedDiameterMm, 100.0);
});

test("M76: generateAsBuiltRedlineAndStamp sinh con dấu hoàn công NĐ 06/2021 Mẫu 02", () => {
  const deviations = [
    {
      spoolCode: "SP-01",
      discipline: "HVAC",
      designCoordinate: [0, 0, 0] as [number, number, number],
      actualScannedCoordinate: [20, 0, 0] as [number, number, number],
      deltaXMm: 20,
      deltaYMm: 0,
      deltaZMm: 0,
      euclideanDeviationMm: 20, // > 15mm -> Critical Rev Cloud
      toleranceThresholdMm: 15,
      status: "moderate_slope_warning" as const,
      remediationRecommendation: "Chỉnh ty treo",
    },
  ];

  const result = generateAsBuiltRedlineAndStamp("DWG-AB-001", deviations, true);

  assert.equal(result.stampType, "form_02_4way");
  assert.deepEqual(result.stampDimensionsMm, [120, 80]);
  assert.ok(result.svgRedlineOverlay.includes("BẢN VẼ HOÀN CÔNG"));
  assert.ok(result.svgRedlineOverlay.includes("MERKLE-SEAL:"));
  assert.ok(result.merkleSealHash.startsWith("MERKLE-SEAL:"));
});
