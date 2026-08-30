import test from "node:test";
import assert from "node:assert/strict";
import "@/tests/setup";
import {
  calculateDuctQtoM2,
  calculatePipeQtoM,
  calculatePhysicalEarnedValue,
  compute3WayVariance,
} from "@/lib/ky-thuat/engineering-cad-qto";
import {
  inferFittingsFromSegments,
  auditMepfCompliance,
} from "@/lib/ky-thuat/engineering-mepf-takeoff";
import { computeElementQto, checkAabbIntersection } from "@/lib/ky-thuat/engineering-bim-cad";
import { nestPipeSegments1D, calcHazenWilliams } from "@/lib/ky-thuat/engineering-cad-nesting";

test("Zero Hallucination - CAD Duct QTO produces exact geometric area without fake additions", () => {
  // Width 500mm, Height 300mm, Length 10m, flange buffer 5%
  // Perimeter = 2 * (0.5 + 0.3) = 1.6m
  // Raw Area = 1.6 * 10 = 16.0 m2
  // Total Area with 5% flange = 16.0 * 1.05 = 16.8 m2
  const area = calculateDuctQtoM2(500, 300, 10, 0.05);
  assert.equal(area, 16.8);

  // Zero dimensions must return strictly 0 without synthetic floor
  assert.equal(calculateDuctQtoM2(0, 300, 10), 0);
  assert.equal(calculateDuctQtoM2(500, 0, 10), 0);
  assert.equal(calculateDuctQtoM2(500, 300, 0), 0);
});

test("Zero Hallucination - Pipe QTO produces strictly positive linear measurements", () => {
  assert.equal(calculatePipeQtoM(12.456), 12.456);
  assert.equal(calculatePipeQtoM(-5), 0);
  assert.equal(calculatePipeQtoM(0), 0);
});

test("Zero Hallucination - Fitting inference produces zero fittings when input segments are empty", () => {
  const fittings = inferFittingsFromSegments([]);
  assert.equal(fittings.elbow_90.count, 0);
  assert.equal(fittings.elbow_90.estimatedMaterialCostVnd, 0);
  assert.equal(fittings.tee_equal.count, 0);
  assert.equal(fittings.tee_equal.estimatedMaterialCostVnd, 0);
  assert.equal(fittings.reducer.count, 0);
  assert.equal(fittings.reducer.estimatedMaterialCostVnd, 0);
});

test("Deterministic Topo Fitting Inference - Identifies exact junctions without hallucination", () => {
  // 2 orthogonal connecting segments meeting at (1000, 0, 0)
  const segments = [
    {
      id: "seg-1",
      discipline: "plumbing" as const,
      systemCode: "CHW",
      startPoint: [0, 0, 0] as [number, number, number],
      endPoint: [1000, 0, 0] as [number, number, number],
      dimensionSpec: "DN100",
      lengthM: 1.0,
    },
    {
      id: "seg-2",
      discipline: "plumbing" as const,
      systemCode: "CHW",
      startPoint: [1000, 0, 0] as [number, number, number],
      endPoint: [1000, 1000, 0] as [number, number, number],
      dimensionSpec: "DN100",
      lengthM: 1.0,
    },
  ];

  const fittings = inferFittingsFromSegments(segments);
  // Exactly 1 bend (elbow_90) formed at the joint
  assert.equal(fittings.elbow_90.count, 1);
  assert.equal(fittings.elbow_90.estimatedMaterialCostVnd, 120000);
});

test("Deterministic 3-Way Variance - Accurately flags VO risk strictly based on BOQ delta", () => {
  const normal = compute3WayVariance(100, 100, 80, 60, 500000);
  assert.equal(normal.status, "normal");
  assert.equal(normal.deltaVoQty, 0);
  assert.equal(normal.estimatedVoVnd, 0);

  // Shop exceeds contract by 20% (> 15% threshold => critical_variance)
  const critical = compute3WayVariance(100, 120, 50, 30, 500000);
  assert.equal(critical.status, "critical_variance");
  assert.equal(critical.deltaVoQty, 20);
  assert.equal(critical.estimatedVoVnd, 10000000); // 20 * 500,000 = 10,000,000
});

test("Deterministic Physical Earned Value - Computes zero EV when no spools exist", () => {
  const ev = calculatePhysicalEarnedValue([]);
  assert.equal(ev.earnedQty, 0);
  assert.equal(ev.totalPlannedQty, 0);
  assert.equal(ev.percentComplete, 0);
});

test("Deterministic Physical Earned Value - Computes exact weighted progress", () => {
  const spools = [
    { calculated_qty: 10, status: "bbnt_approved" as const }, // weight 1.0 -> 10
    { calculated_qty: 10, status: "installed" as const }, // weight 0.75 -> 7.5
  ];
  const ev = calculatePhysicalEarnedValue(spools);
  assert.equal(ev.totalPlannedQty, 20);
  assert.equal(ev.earnedQty, 17.5);
  assert.equal(ev.percentComplete, 87.5);
});

test("Deterministic BIM QTO - computeElementQto returns exact values based on bounding box geometry", () => {
  // Empty bounding box
  const emptyQto = computeElementQto({
    elementType: "IfcDuctSegment",
    spatial_bounding_box: { min: [0, 0, 0], max: [0, 0, 0] },
    properties: {},
  });
  assert.equal(emptyQto.quantity, 0);
  assert.equal(emptyQto.unit, "m2");

  // Rectangular Duct: width 600mm, height 400mm, length 5000mm (5m)
  // Perimeter = 2 * (0.6 + 0.4) = 2.0m
  // Area = 2.0 * 5.0 = 10.0 m2
  const ductQto = computeElementQto({
    elementType: "IfcDuctSegment",
    spatial_bounding_box: { min: [0, 0, 0], max: [5000, 600, 400] },
    properties: {},
  });
  assert.equal(ductQto.quantity, 10.0);
  assert.equal(ductQto.unit, "m2");
});

test("Deterministic Nesting 1D - nestPipeSegments1D returns 0 bars for empty segments", () => {
  const result = nestPipeSegments1D([], 6000, 3);
  assert.equal(result.totalBarsUsed, 0);
  assert.equal(result.totalWasteMm, 0);
  assert.equal(result.totalUsedLengthMm, 0);
  assert.equal(result.bars.length, 0);
});

test("Deterministic Hydraulic Calculation - Hazen Williams formula determinism", () => {
  // Flow rate 10 l/s, pipe diameter 100mm, length 10m
  const result = calcHazenWilliams(10, 100, 10, 120);
  assert.ok(result.velocityMs > 1.2 && result.velocityMs < 1.3); // Area = ~0.00785 m2 => v = 0.01 / 0.00785 = ~1.273 m/s
  assert.ok(result.pressureDropBar > 0);
  assert.ok(result.totalHeadLossPa > 0);
});

test("Zero Hallucination Compliance - auditMepfCompliance does not flag spurious errors on empty data", () => {
  const flags = auditMepfCompliance("all", [], []);
  // Should not invent non-existent fire damper violations when no duct segments exist
  const fdWarning = flags.find((f) => f.code === "QC-HVAC-FD");
  assert.equal(fdWarning, undefined);
});
