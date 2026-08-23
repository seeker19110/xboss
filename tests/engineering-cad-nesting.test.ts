// tests/engineering-cad-nesting.test.ts — Unit tests for CAD Nesting & MEPF Hydraulics (M89)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nestPipeSegments1D,
  nestDuctSheets2D,
  generateSpoolQrPayload,
  calcHazenWilliams,
  calcDarcyWeisbach,
  validateVelocityLimit,
  sizeDuctByVelocity,
} from "@/lib/ky-thuat/engineering-cad-nesting";

test("M89: 1D Pipe Nesting FFD xếp phôi tối ưu vào cây tiêu chuẩn 6.0m", () => {
  const segments = [
    { spoolCode: "SP-01", lengthMm: 3800 },
    { spoolCode: "SP-02", lengthMm: 3500 },
    { spoolCode: "SP-03", lengthMm: 2400 },
    { spoolCode: "SP-04", lengthMm: 2100 },
  ];

  const result = nestPipeSegments1D(segments, 6000, 2);

  assert.equal(result.totalSegments, 4);
  assert.equal(result.totalBarsUsed, 2); // 3800+2100=5900+2 (Bar 1), 3500+2400=5900+2 (Bar 2)
  assert.equal(result.bars.length, 2);
  assert.equal(result.unplacedSegments.length, 0);
  assert.ok(result.wastePercent <= 2.0);
  assert.equal(result.efficiencyGrade, "A");
});

test("M89: 1D Pipe Nesting xử lý đầu vào rỗng an toàn", () => {
  const result = nestPipeSegments1D([], 6000, 2);
  assert.equal(result.totalSegments, 0);
  assert.equal(result.totalBarsUsed, 0);
  assert.equal(result.bars.length, 0);
});

test("M89: 1D Pipe Nesting nhận diện đoạn dài hơn cây phôi tiêu chuẩn", () => {
  const segments = [
    { spoolCode: "SP-LONG", lengthMm: 7500 }, // > 6000
    { spoolCode: "SP-NORMAL", lengthMm: 3000 },
  ];

  const result = nestPipeSegments1D(segments, 6000, 2);
  assert.equal(result.unplacedSegments.length, 1);
  assert.equal(result.unplacedSegments[0].spoolCode, "SP-LONG");
  assert.equal(result.totalBarsUsed, 1);
});

test("M89: 2D Duct Sheet Guillotine Nesting xếp phôi tôn vào khổ 1200x2400mm", () => {
  const rects = [
    { spoolCode: "RECT-01", widthMm: 600, heightMm: 800 },
    { spoolCode: "RECT-02", widthMm: 500, heightMm: 800 },
    { spoolCode: "RECT-03", widthMm: 600, heightMm: 1000 },
  ];

  const result = nestDuctSheets2D(rects, 1200, 2400, 10);
  assert.equal(result.totalPlacedRects, 3);
  assert.ok(result.totalSheets >= 1);
  assert.ok(result.totalUsedAreaM2 > 0);
});

test("M89: generateSpoolQrPayload sinh chuỗi mã QR chuẩn định danh XBoss", () => {
  const spool = {
    projectId: 101,
    spoolCode: "SP-CHW-DN150-01",
    systemCode: "CHW-S",
    dimensionSpec: "DN150 L=4.5m",
    floorLabel: "B2",
  };

  const { qrData, displayLabel } = generateSpoolQrPayload(spool);
  assert.ok(qrData.includes("XBOSS|PRJ:101|SPOOL:SP-CHW-DN150-01"));
  assert.ok(qrData.includes("SPEC:DN150 L=4.5m"));
  assert.ok(qrData.includes("SYS:CHW-S"));
  assert.equal(displayLabel, "SP-CHW-DN150-01 [DN150 L=4.5m]");
});

test("M89: calcHazenWilliams tính toán chính xác lưu lượng và tổn thất cột áp", () => {
  const res = calcHazenWilliams(2.5, 100, 10.0, 120);

  assert.ok(Math.abs(res.velocityMs - 0.318) < 0.05);
  assert.ok(res.headLossPerMeterPa > 0);
  assert.ok(res.totalHeadLossPa > 0);
  assert.ok(res.pressureDropBar > 0);
});

test("M89: calcDarcyWeisbach tính toán dòng chảy rối và hệ số ma sát", () => {
  const res = calcDarcyWeisbach(3.0, 100, 0.046, 15.0, 25.0);

  assert.ok(res.velocityMs > 0.3);
  assert.ok(res.reynoldsNumber > 2300); // Dòng chảy rối
  assert.ok(res.frictionFactor > 0);
  assert.ok(res.totalHeadLossPa > 0);
});

test("M89: validateVelocityLimit phát hiện vi phạm vận tốc Invariant và cảnh báo xâm thực", () => {
  // Ống hút bơm giới hạn 1.2 m/s -> 1.8 m/s phải FAIL
  const pumpFail = validateVelocityLimit(1.8, "pump_suction");
  assert.equal(pumpFail.ok, false);
  assert.equal(pumpFail.status, "fail");
  assert.ok(pumpFail.message.includes("VẬN TỐC VƯỢT GIỚI HẠN"));

  // Nước cấp 1.4 m/s -> PASS
  const waterPass = validateVelocityLimit(1.4, "domestic_water");
  assert.equal(waterPass.ok, true);
  assert.equal(waterPass.status, "pass");

  // Nước cấp 0.4 m/s -> WARNING lắng cặn
  const waterLow = validateVelocityLimit(0.4, "domestic_water");
  assert.equal(waterLow.status, "warning");
});

test("M89: sizeDuctByVelocity tính toán tiết diện ống gió làm tròn 50mm", () => {
  const sizing = sizeDuctByVelocity(1000, 6.0, 1.5);

  assert.ok(sizing.widthMm >= 100);
  assert.ok(sizing.heightMm >= 100);
  assert.equal(sizing.widthMm % 50, 0); // Làm tròn 50mm
  assert.equal(sizing.heightMm % 50, 0);
  assert.ok(sizing.actualVelocityMs > 0);
  assert.ok(sizing.equivalentDiameterMm > 0);
});
