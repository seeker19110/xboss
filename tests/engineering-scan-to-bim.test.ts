import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeScanVsBimDeviations,
  findNearestScannedPoint,
  BimSpoolModel,
  ScannedPoint3D,
} from "@/lib/ky-thuat/engineering-scan-to-bim";

test("M70/M89: findNearestScannedPoint tìm chính xác điểm scan gần nhất trong không gian 3D", () => {
  const points: ScannedPoint3D[] = [
    { pointId: "PT-01", x: 1000, y: 1000, z: 1000 },
    { pointId: "PT-02", x: 5000, y: 5000, z: 5000 },
    { pointId: "PT-03", x: 1005, y: 1005, z: 1005 }, // Cách [1000,1000,1000] ~8.66mm
  ];

  const nearest = findNearestScannedPoint([1000, 1000, 1000], points);
  assert.ok(nearest !== null);
  assert.equal(nearest?.pointId, "PT-01"); // Distance 0
});

test("M70/M89: analyzeScanVsBimDeviations tính toán chính xác sai lệch không gian và phân loại ngưỡng", () => {
  const models: BimSpoolModel[] = [
    {
      spoolCode: "SP-01",
      discipline: "firefighting",
      systemCode: "FP",
      nominalSpec: "DN100",
      designStartPoint: [1000, 2000, 2800],
      designEndPoint: [6000, 2000, 2800],
      lengthM: 5.0,
    },
    {
      spoolCode: "SP-02",
      discipline: "plumbing",
      systemCode: "DRAIN",
      nominalSpec: "DN150",
      designStartPoint: [2000, 3000, 2700],
      designEndPoint: [8000, 3000, 2700],
      lengthM: 6.0,
    },
    {
      spoolCode: "SP-03",
      discipline: "hvac",
      systemCode: "ACMV",
      nominalSpec: "600x400",
      designStartPoint: [1000, 5000, 2600],
      designEndPoint: [7000, 5000, 2600],
      lengthM: 6.0,
    },
  ];

  const points: ScannedPoint3D[] = [
    { pointId: "P1", x: 1005, y: 2005, z: 2805 }, // Lệch ~8.66mm <= 15mm -> within_tolerance
    { pointId: "P2", x: 2015, y: 3015, z: 2715 }, // Lệch ~25.98mm (15-35mm) -> moderate_slope_warning
    { pointId: "P3", x: 1030, y: 5030, z: 2630 }, // Lệch ~51.96mm > 35mm -> critical_clash_defect
  ];

  const res = analyzeScanVsBimDeviations("SCAN-01", "LiDAR", models, points, 15.0);

  assert.equal(res.spoolsAnalyzedCount, 3);
  assert.equal(res.deviations[0].status, "within_tolerance");
  assert.equal(res.deviations[1].status, "moderate_slope_warning");
  assert.equal(res.deviations[2].status, "critical_clash_defect");
  assert.equal(res.defectsCount, 2);
  assert.ok(res.maxDeviationMm > 50);
  assert.ok(res.deviations[2].remediationRecommendation.includes("LỆCH LỚN"));
});

test("M70/M89: analyzeScanVsBimDeviations hoạt động an toàn khi không có điểm scan (fallback to design)", () => {
  const models: BimSpoolModel[] = [
    {
      spoolCode: "SP-01",
      discipline: "hvac",
      systemCode: "SA",
      nominalSpec: "Duct",
      designStartPoint: [1000, 2000, 3000],
      designEndPoint: [5000, 2000, 3000],
      lengthM: 4.0,
    },
  ];

  const res = analyzeScanVsBimDeviations("SCAN-EMPTY", "Manual", models, []);
  assert.equal(res.spoolsAnalyzedCount, 1);
  assert.equal(res.deviations[0].euclideanDeviationMm, 0);
  assert.equal(res.deviations[0].status, "within_tolerance");
});
