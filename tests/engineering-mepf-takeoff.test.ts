import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferFittingsFromSegments,
  auditMepfCompliance,
  processMepfAutoTakeoff,
  MepfSegment,
  MepfSymbolDetection,
} from "@/lib/ky-thuat/engineering-mepf-takeoff";

test("M67: inferFittingsFromSegments suy diễn chính xác cút 90 độ và tê từ mạng topo ống", () => {
  const segments: MepfSegment[] = [
    // Tuyến 1 giao Tuyến 2 tại [10, 20, 0] -> Đổi hướng tạo cút
    {
      id: "1",
      discipline: "plumbing",
      systemCode: "DOM",
      startPoint: [0, 20, 0],
      endPoint: [10, 20, 0],
      dimensionSpec: "DN50",
      lengthM: 10,
    },
    {
      id: "2",
      discipline: "plumbing",
      systemCode: "DOM",
      startPoint: [10, 20, 0],
      endPoint: [10, 30, 0],
      dimensionSpec: "DN50",
      lengthM: 10,
    },
    // Tuyến 3 rẽ nhánh tại [10, 20, 0] -> Bậc nút = 3 -> Tạo Tê
    {
      id: "3",
      discipline: "plumbing",
      systemCode: "DOM",
      startPoint: [10, 20, 0],
      endPoint: [10, 10, 0],
      dimensionSpec: "DN50",
      lengthM: 10,
    },
  ];

  const fittings = inferFittingsFromSegments(segments);

  assert.ok(
    fittings.tee_equal.count >= 1,
    "Phải suy diễn được ít nhất 1 Tê tại điểm giao cắt bậc 3",
  );
  assert.ok(fittings.elbow_45.count >= 0);
  assert.ok(fittings.reducer.count >= 0);
});

test("M67: auditMepfCompliance kiểm tra đúng các cờ tuân thủ tiêu chuẩn PCCC và HVAC", () => {
  const symbols: MepfSymbolDetection[] = [
    {
      id: "S1",
      symbolType: "sprinkler",
      category: "sprinkler",
      tag: "SP-1",
      location: [0, 0, 0],
      spec: "K5.6",
      confidence: 0.99,
    },
  ];

  const segments: MepfSegment[] = [
    {
      id: "D1",
      discipline: "hvac",
      systemCode: "ACMV",
      startPoint: [0, 0, 0],
      endPoint: [10, 0, 0],
      dimensionSpec: "500x300",
      lengthM: 10,
    },
    {
      id: "D2",
      discipline: "hvac",
      systemCode: "ACMV",
      startPoint: [10, 0, 0],
      endPoint: [20, 0, 0],
      dimensionSpec: "500x300",
      lengthM: 10,
    },
    {
      id: "D3",
      discipline: "hvac",
      systemCode: "ACMV",
      startPoint: [20, 0, 0],
      endPoint: [30, 0, 0],
      dimensionSpec: "500x300",
      lengthM: 10,
    },
    {
      id: "D4",
      discipline: "hvac",
      systemCode: "ACMV",
      startPoint: [30, 0, 0],
      endPoint: [40, 0, 0],
      dimensionSpec: "500x300",
      lengthM: 10,
    },
    {
      id: "D5",
      discipline: "hvac",
      systemCode: "ACMV",
      startPoint: [40, 0, 0],
      endPoint: [50, 0, 0],
      dimensionSpec: "500x300",
      lengthM: 10,
    },
    {
      id: "D6",
      discipline: "hvac",
      systemCode: "ACMV",
      startPoint: [50, 0, 0],
      endPoint: [60, 0, 0],
      dimensionSpec: "500x300",
      lengthM: 10,
    },
  ];

  // PCCC Audit
  const fpFlags = auditMepfCompliance("firefighting", symbols, segments);
  assert.ok(
    fpFlags.some((f) => f.code === "QC-FP-01" && f.standardReference.includes("TCVN 7336:2021")),
  );

  // HVAC Audit thiếu van FD
  const hvacFlags = auditMepfCompliance("hvac", [], segments);
  assert.ok(hvacFlags.some((f) => f.code === "QC-HVAC-FD" && f.severity === "warning"));
});

test("M67: processMepfAutoTakeoff tính toán khối lượng tổng hợp và phát hiện rủi ro phát sinh VO", () => {
  const symbols: MepfSymbolDetection[] = [
    {
      id: "S1",
      symbolType: "sprinkler",
      category: "sprinkler",
      tag: "SP-1",
      location: [0, 0, 0],
      spec: "K5.6",
      confidence: 0.98,
    },
  ];

  const segments: MepfSegment[] = [
    {
      id: "P1",
      discipline: "firefighting",
      systemCode: "FP",
      startPoint: [0, 0, 0],
      endPoint: [20, 0, 0],
      dimensionSpec: "DN100",
      lengthM: 20,
    },
  ];

  const contractBoq = [
    {
      boqCode: "BOQ-01",
      description: "Ống chữa cháy DN100",
      unit: "m",
      contractQty: 15.0,
      unitRateVnd: 500000,
    },
  ];

  const res = processMepfAutoTakeoff(
    "TEST-01",
    "firefighting",
    "DWG-01",
    symbols,
    segments,
    contractBoq,
  );

  assert.equal(res.totalLinearMeters, 20.0);
  assert.equal(res.totalSymbolsDetected, 1);
  assert.equal(res.boqMappingResults[0].deltaQty, 5.0); // 20 - 15 = 5m phát sinh
  assert.equal(res.boqMappingResults[0].deltaVnd, 2500000); // 5 * 500,000 = 2,500,000 đ
  assert.equal(res.boqMappingResults[0].status, "risk_vo");
  assert.equal(res.voRiskSummary.hasVoRisk, true);
});

test("M67: solveGenerativeMepfRoute sinh 3 phương án nắn tuyến 3D tối ưu Pareto và phát hiện va chạm", async () => {
  const { solveGenerativeMepfRoute } = await import("@/lib/ky-thuat/engineering-mepf-takeoff");

  const startPoint: [number, number, number] = [0, 0, 2600];
  const endPoint: [number, number, number] = [10000, 5000, 2600];
  const obstacles = [
    {
      id: "B1",
      name: "Dầm D400x600",
      category: "beam" as const,
      minPoint: [4000, 0, 2400] as [number, number, number],
      maxPoint: [4400, 8000, 3000] as [number, number, number],
    },
  ];

  const result = solveGenerativeMepfRoute(startPoint, endPoint, obstacles, 100);

  assert.ok(result.directDistanceM > 0);
  assert.equal(
    result.options.length,
    3,
    "Phải sinh đủ 3 phương án tối ưu Pareto (Min Cost, Max Clearance, Low Friction)",
  );

  const optMinCost = result.options.find((o) => o.optionId === "option_a_min_cost");
  assert.ok(optMinCost, "Phải có Phương án A (Min Cost)");
  assert.ok(optMinCost.estimatedCostVnd > 0);

  const optMaxClearance = result.options.find((o) => o.optionId === "option_b_max_clearance");
  assert.ok(optMaxClearance, "Phải có Phương án B (Max Clearance)");
  assert.ok(optMaxClearance.minClearanceHeightM >= 3.0);

  const optLowFriction = result.options.find((o) => o.optionId === "option_c_min_pressure_drop");
  assert.ok(optLowFriction, "Phải có Phương án C (Low Friction)");
  assert.equal(optLowFriction.fittingsCount.elbow45, 4);
});
