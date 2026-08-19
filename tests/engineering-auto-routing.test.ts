import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBeamSleeve,
  findOptimalRoute3D,
  recommendClashResolution,
  createSleeveSchedule,
  listSleeveSchedules,
} from "@/lib/engineering-auto-routing";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M77: Beam Sleeve Validation — Kiểm tra lỗ khoét dầm hợp chuẩn", () => {
  // Lỗ hợp chuẩn: D = 150mm trên dầm H=700mm, nhịp L=6000mm, vị trí X=1800mm (0.3L)
  const validRes = validateBeamSleeve({
    beamRef: "D1",
    diameterMm: 150,
    beamDepthMm: 700,
    beamSpanMm: 6000,
    distFromSupportMm: 1800,
    sleeveElevationMm: 350,
  });

  assert.equal(validRes.isValid, true, "Lỗ khoét thoả mãn mọi điều kiện TCVN");
  assert.equal(validRes.violations.length, 0);
  assert.equal(validRes.maxAllowedDiameterMm, 233.1);

  // Lỗ vi phạm: D = 300mm > 1/3 H (233.1mm)
  const oversizeRes = validateBeamSleeve({
    beamRef: "D1",
    diameterMm: 300,
    beamDepthMm: 700,
    beamSpanMm: 6000,
    distFromSupportMm: 1800,
    sleeveElevationMm: 350,
  });

  assert.equal(oversizeRes.isValid, false);
  assert.ok(oversizeRes.violations[0].includes("vượt quá giới hạn tối đa"));

  // Lỗ vi phạm: Quá gần gối dầm X=600mm < 0.2L (1200mm)
  const closeRes = validateBeamSleeve({
    beamRef: "D1",
    diameterMm: 150,
    beamDepthMm: 700,
    beamSpanMm: 6000,
    distFromSupportMm: 600,
    sleeveElevationMm: 350,
  });

  assert.equal(closeRes.isValid, false);
  assert.ok(closeRes.violations[0].includes("quá gần gối dầm"));
});

test("M77: 3D Auto-Routing Pathfinding — Tối ưu hướng tuyến và Co lơ", () => {
  const start = { x: 0, y: 0, z: 3000 };
  const end = { x: 4000, y: 3000, z: 3000 };

  // Tuyến trực giao không vật cản
  const directRoute = findOptimalRoute3D(start, end, []);
  assert.ok(directRoute.totalLengthM > 0);
  assert.ok(directRoute.elbowCount >= 0);
  assert.ok(directRoute.estimatedHeadLossPa > 0);

  // Tuyến có vật cản (Dầm chặn trực tiếp)
  const obstacle = {
    minX: 1500,
    minY: -500,
    minZ: 2500,
    maxX: 2500,
    maxY: 3500,
    maxZ: 3500,
    label: "Dầm B1",
  };
  const bypassRoute = findOptimalRoute3D(start, end, [obstacle]);
  assert.ok(bypassRoute.pathExplanation.includes("Bypass"));
  assert.ok(bypassRoute.waypoints.length > 2);
});

test("M77: Multi-Trade Clash Hierarchy — Đề xuất nhường đường ưu tiên", () => {
  const advice = recommendClashResolution("LARGE_HVAC_DUCT", "GRAVITY_DRAINAGE", "Trục B-3");
  assert.equal(
    advice.primaryTrade,
    "GRAVITY_DRAINAGE",
    "Thoát nước trọng lực phải được ưu tiên số 1",
  );
  assert.equal(
    advice.yieldingTrade,
    "LARGE_HVAC_DUCT",
    "Ống gió HVAC phải nhường đường thoát nước",
  );
  assert.ok(advice.solution.includes("LARGE_HVAC_DUCT"));
});

test("M77: Vòng đời Beam Sleeve Schedule trong DB", { skip: !HAS_DB }, async () => {
  const projectId = 1;
  const drawingCode = "DWG-TEST-SLEEVE";

  // 1. Tạo Sleeve
  const sleeve = await createSleeveSchedule({
    projectId,
    drawingCode,
    beamRef: "D-TEST-01",
    diameterMm: 110,
    beamDepthMm: 600,
    beamSpanMm: 5000,
    coordX: 1500,
    coordY: 800,
    coordZ: 3200,
  });

  assert.ok(sleeve.id);
  assert.equal(sleeve.beamRef, "D-TEST-01");

  // 2. Query Sleeves
  const list = await listSleeveSchedules(projectId, drawingCode);
  assert.ok(list.length >= 1);
  assert.equal(list[0].id, sleeve.id);
});
