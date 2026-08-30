import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePointCloudDeviation,
  createBcfTopicFromClash,
  generateCncGCodeForDuct,
  generatePipeSpoolCutList,
  GodTierElementData,
  GodTierClashRecord,
} from "@/lib/ky-thuat/engineering-god-tier";

test("God-Tier Extension 1: LiDAR Point Cloud RANSAC Deviation Analysis", () => {
  const elements: GodTierElementData[] = [
    {
      id: "elem-1",
      guid: "GUID-DUCT-101",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió cấp AHU-01",
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 600, height: 400, length: 3000 },
      boundingBox: { min: [-300, 0, -200], max: [300, 3000, 200] },
    },
  ];

  const points = [
    { x: 0, y: 1500, z: 205 }, // Cách 5mm -> PASS
    { x: 0, y: 1500, z: 220 }, // Cách 20mm -> WARNING
    { x: 0, y: 1500, z: 260 }, // Cách 60mm -> CRITICAL
  ];

  const result = analyzePointCloudDeviation(points, elements);

  assert.equal(result.totalPoints, 3);
  assert.equal(result.passPoints, 1);
  assert.equal(result.warningPoints, 1);
  assert.equal(result.criticalPoints, 1);
  assert.equal(result.ncrRequired, true);
  assert.ok(result.ncrReason?.includes("NCR"));
  assert.equal(result.heatmapPoints.length, 3);
});

test("God-Tier Extension 2: openBIM BCF 3.0 Topic Generator", () => {
  const mockClash: GodTierClashRecord = {
    id: "clash-1",
    project_id: 1,
    clash_code: "CLASH-HVAC-PLUMB-001",
    model_id: "model-1",
    element_a_guid: "GUID-A",
    element_a_type: "DUCT_HVAC",
    element_b_guid: "GUID-B",
    element_b_type: "PIPE_PLUMB",
    spatial_point: { x: 1000, y: 2000, z: 3000 },
    clearance_mm: -45,
    status: "detected",
    reroute_solution: {
      clashCode: "CLASH-HVAC-PLUMB-001",
      primaryElementGuid: "GUID-A",
      action: "offset_45_degree",
      description: "Chèn 4 cút 45 độ hạ ống né máng cáp",
      offsetHeightMm: 150,
      diagonalLengthMm: 212,
      hydraulicImpactPa: 12,
      materialCostVnd: 450000,
      ruleApplied: "Ma trận Thứ bậc Không gian Tuyệt đối",
    },
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
  };

  const topic = createBcfTopicFromClash(mockClash, "Ing. Nguyen Van A");

  assert.equal(topic.guid, "BCF-CLASH-HVAC-PLUMB-001");
  assert.equal(topic.topic_type, "Clash");
  assert.equal(topic.topic_status, "Open");
  assert.equal(topic.creation_author, "Ing. Nguyen Van A");
  assert.ok(topic.description.includes("4 cút 45 độ"));
  assert.equal(topic.viewpoint.selection_guids.length, 2);
  assert.equal(topic.viewpoint.selection_guids[0], "GUID-A");
  assert.equal(topic.viewpoint.selection_guids[1], "GUID-B");
});

test("God-Tier Extension 3A: DfMA CNC Duct Cutting G-Code Generator", () => {
  const cnc = generateCncGCodeForDuct(800, 500, 1500, 0.8);

  assert.ok(cnc.gcode.includes("G21"));
  assert.ok(cnc.gcode.includes("G90"));
  assert.ok(cnc.gcode.includes("M03 S1000"));
  assert.ok(cnc.gcode.includes("M05"));
  assert.ok(cnc.gcode.includes("M30"));
  assert.ok(cnc.totalCutLengthMm > 0);
  assert.ok(cnc.estimatedCutTimeSec > 0);
  assert.equal(cnc.flatPattern.widthMm, (800 + 500) * 2 + 25);
  assert.equal(cnc.flatPattern.heightMm, 1500);
});

test("God-Tier Extension 3B: DfMA 1D Pipe Spooling with Remnant Tracking", () => {
  const demands = [
    { code: "SP-01", dia: 100, length: 2500 },
    { code: "SP-02", dia: 100, length: 2000 },
    { code: "SP-03", dia: 100, length: 1500 },
  ];

  const spoolResult = generatePipeSpoolCutList(demands, 6000);

  assert.equal(spoolResult.items.length, 3);
  // DN100 socket depth is 25mm -> 2500 - 50 = 2450
  assert.equal(spoolResult.items[0].cutLengthMm, 2450);
  assert.ok(spoolResult.items[0].qrToken.includes("QR-SPOOL-SP-01"));
  assert.ok(spoolResult.scrapRatePercent >= 0);
  assert.ok(spoolResult.totalStocksUsed >= 1);
});
