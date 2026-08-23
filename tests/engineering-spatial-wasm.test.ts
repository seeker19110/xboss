import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePolylineSweepVolume,
  detectAabbVoxelClashes,
  optimize2dSheetNesting,
  hashComputeInput,
} from "@/lib/ky-thuat/engineering-spatial-wasm";

test("M73: computePolylineSweepVolume tính chính xác độ dài 3D và thể tích không gian", () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 3000, y: 0, z: 0 },
    { x: 3000, y: 4000, z: 0 },
  ];

  // Tuyến ống hình chữ nhật 500x300mm
  const resRect = computePolylineSweepVolume(points, {
    shape: "rectangular",
    widthMm: 500,
    heightMm: 300,
  });

  assert.equal(resRect.totalLengthM, 7.0); // 3m + 4m = 7m
  assert.equal(resRect.crossSectionAreaM2, 0.15); // 0.5 * 0.3 = 0.15 m2
  assert.equal(resRect.totalVolumeM3, 1.05); // 0.15 * 7 = 1.05 m3
  assert.equal(resRect.boundingVolume.dimensionsM.x, 3.0);
  assert.equal(resRect.boundingVolume.dimensionsM.y, 4.0);

  // Tuyến ống tròn DN200
  const resCirc = computePolylineSweepVolume(points, {
    shape: "circular",
    diameterMm: 200,
  });
  assert.equal(resCirc.totalLengthM, 7.0);
  assert.ok(resCirc.totalVolumeM3 > 0.21 && resCirc.totalVolumeM3 < 0.23);
});

test("M73: detectAabbVoxelClashes phát hiện chính xác va chạm cứng và vi phạm khoảng hở", () => {
  const elements = [
    {
      id: "DUCT-01",
      name: "Ống gió 600x400",
      system: "hvac",
      min: [1000, 1000, 3000] as [number, number, number],
      max: [5000, 1600, 3400] as [number, number, number],
    },
    {
      id: "PIPE-01",
      name: "Ống nước DN100",
      system: "plumbing",
      min: [3000, 500, 3100] as [number, number, number],
      max: [3200, 3000, 3300] as [number, number, number],
    },
    {
      id: "TRAY-01",
      name: "Máng cáp điện",
      system: "electrical",
      min: [1000, 1000, 3450] as [number, number, number],
      max: [5000, 1400, 3550] as [number, number, number],
    },
  ];

  // Check va chạm cứng
  const clashes = detectAabbVoxelClashes(elements, 0);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].elementA, "DUCT-01");
  assert.equal(clashes[0].elementB, "PIPE-01");
  assert.equal(clashes[0].clashType, "hard_overlap");
  assert.ok(clashes[0].penetrationDepthMm > 0);

  // Check với khoảng hở 100mm -> Bắt thêm TRAY-01 cách DUCT-01 50mm
  const softClashes = detectAabbVoxelClashes(elements, 100);
  assert.ok(softClashes.length >= 2);
  const softPair = softClashes.find((c) => c.elementA === "DUCT-01" && c.elementB === "TRAY-01");
  assert.ok(softPair);
  assert.equal(softPair.clashType, "soft_clearance");
});

test("M73: optimize2dSheetNesting tối ưu hóa xếp phôi tấm tôn đạt tỷ lệ sử dụng cao", () => {
  const parts = [
    { id: "FLANGE-A", widthMm: 500, heightMm: 500, quantity: 4 },
    { id: "PANEL-B", widthMm: 600, heightMm: 1000, quantity: 2 },
    { id: "BRACKET-C", widthMm: 200, heightMm: 300, quantity: 8 },
  ];

  const res = optimize2dSheetNesting(parts, 1200, 2400, 5);

  assert.ok(res.totalSheetsRequired >= 1);
  assert.equal(res.totalPartsPlaced, 14); // 4 + 2 + 8
  assert.ok(res.totalUsedAreaM2 > 2.0);
  assert.ok(res.overallScrapPercent >= 0 && res.overallScrapPercent < 60);
});

test("M73: hashComputeInput sinh mã băm SHA-256 xác định bất biến thứ tự key", () => {
  const obj1 = { b: 2, a: 1, c: { y: 20, x: 10 } };
  const obj2 = { a: 1, b: 2, c: { x: 10, y: 20 } };

  const hash1 = hashComputeInput(obj1);
  const hash2 = hashComputeInput(obj2);

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
});
