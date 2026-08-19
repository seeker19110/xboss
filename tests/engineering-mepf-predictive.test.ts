import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAssetReliabilityAndRul, MepfAssetInput } from "@/lib/engineering-mepf-predictive";

test("M71: calculateAssetReliabilityAndRul tính toán chính xác MTBF, RUL và Health Score theo Weibull", () => {
  const asset: MepfAssetInput = {
    assetCode: "PUMP-01",
    assetName: "Bơm Chiller CHW-P01",
    systemType: "chiller_pump",
    installationDate: "2025-01-01",
    operatingHoursTotal: 5000,
    designedMtbfHours: 25000,
  };

  const res = calculateAssetReliabilityAndRul(asset);

  assert.equal(res.assetCode, "PUMP-01");
  assert.equal(res.mtbfHours, 25000);
  assert.ok(res.healthScorePercent > 80);
  assert.ok(res.remainingUsefulLifeDays > 500);
  assert.equal(res.riskLevel, "low");
});

test("M71: calculateAssetReliabilityAndRul cảnh báo nguy cơ hỏng hóc khi thiết bị chạy quá giờ định mức", () => {
  const wornAsset: MepfAssetInput = {
    assetCode: "FAN-01",
    assetName: "Quạt Hút Khói PCCC",
    systemType: "smoke_exhaust_fan",
    installationDate: "2022-01-01",
    operatingHoursTotal: 17500,
    designedMtbfHours: 18000,
  };

  const res = calculateAssetReliabilityAndRul(wornAsset);

  assert.ok(res.healthScorePercent < 50);
  assert.ok(res.remainingUsefulLifeDays < 40);
  assert.equal(res.riskLevel, "critical");
  assert.ok(res.maintenanceActionRecommended.includes("CẢNH BÁO NGUY CƠ HỎNG CAO"));
});
