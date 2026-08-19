import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAabbIntersection,
  get4DStatusColor,
  generateClashRerouteSolution,
  computeElementQto,
  BoundingBox3D,
} from "@/lib/engineering-bim-cad";

test("BIM-CAD: checkAabbIntersection phát hiện chính xác va chạm cứng (Hard Clash)", () => {
  const boxA: BoundingBox3D = { min: [1000, 2000, 2800], max: [5000, 2500, 3100] };
  const boxB: BoundingBox3D = { min: [3000, 1800, 2700], max: [3400, 4000, 3300] }; // Giao nhau ở trục X: 3000-3400, Y: 2000-2500, Z: 2800-3100

  const result = checkAabbIntersection(boxA, boxB, 50);
  assert.equal(result.isHardClash, true);
  assert.equal(result.overlapX, 400);
  assert.equal(result.overlapY, 500);
  assert.equal(result.overlapZ, 300);
  assert.equal(result.center.x, 3200);
  assert.equal(result.center.y, 2250);
  assert.equal(result.center.z, 2950);
});

test("BIM-CAD: checkAabbIntersection phát hiện vi phạm khoảng cách an toàn (Soft Clearance Clash)", () => {
  const boxA: BoundingBox3D = { min: [1000, 2000, 2800], max: [2000, 2500, 3100] };
  const boxB: BoundingBox3D = { min: [2030, 2000, 2800], max: [3000, 2500, 3100] }; // Cách nhau 30mm theo trục X (< ngưỡng 50mm)

  const result = checkAabbIntersection(boxA, boxB, 50);
  assert.equal(result.isHardClash, false);
  assert.equal(result.isSoftClash, true);
  assert.equal(result.clearanceDistanceMm, 30);
});

test("BIM-CAD: get4DStatusColor trả về đúng mã màu tiến độ và ưu tiên cảnh báo xung đột", () => {
  assert.equal(get4DStatusColor("nghiem_thu", 1.0, false).colorHex, "#10b981");
  assert.equal(get4DStatusColor("tre", 0.5, false).colorHex, "#f97316");
  assert.equal(get4DStatusColor("dang_thi_cong", 0.4, false).colorHex, "#3b82f6");
  // Có xung đột không gian -> bắt buộc đổi sang màu đỏ (#ef4444)
  assert.equal(get4DStatusColor("nghiem_thu", 1.0, true).colorHex, "#ef4444");
});

test("BIM-CAD: generateClashRerouteSolution sinh 3 phương án nắn tuyến với đánh giá tối ưu", () => {
  const solution = generateClashRerouteSolution(
    "CLASH-001",
    { guid: "DUCT-01", type: "IfcDuctSegment", system: "HVAC SA" },
    { guid: "BEAM-01", type: "IfcBeam", system: "Structure" },
  );

  assert.equal(solution.clashCode, "CLASH-001");
  assert.equal(solution.options.length, 3);
  assert.equal(solution.recommendedIndex, 0);
  assert.ok(solution.options[0].tradeOffScore >= solution.options[1].tradeOffScore);
});

test("BIM-CAD: computeElementQto tính toán khối lượng chính xác theo loại hình học", () => {
  // Ống gió: tính diện tích m2
  const duct = {
    elementType: "IfcDuctSegment",
    spatial_bounding_box: { min: [0, 0, 0], max: [4000, 500, 300] } as BoundingBox3D,
  };
  const qtoDuct = computeElementQto(duct);
  assert.equal(qtoDuct.unit, "m2");
  assert.ok(qtoDuct.quantity > 0);

  // Ống nước: tính chiều dài m
  const pipe = {
    elementType: "IfcPipeSegment",
    spatial_bounding_box: { min: [0, 0, 0], max: [6000, 100, 100] } as BoundingBox3D,
  };
  const qtoPipe = computeElementQto(pipe);
  assert.equal(qtoPipe.unit, "m");
  assert.equal(qtoPipe.quantity, 6);

  // Dầm bê tông: tính thể tích m3
  const beam = {
    elementType: "IfcBeam",
    spatial_bounding_box: { min: [0, 0, 0], max: [5000, 400, 600] } as BoundingBox3D,
  };
  const qtoBeam = computeElementQto(beam);
  assert.equal(qtoBeam.unit, "m3");
  assert.equal(qtoBeam.quantity, 1.2);
});
