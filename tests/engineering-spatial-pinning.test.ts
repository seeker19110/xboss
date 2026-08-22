import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBoundingBoxFromPoints,
  isPointInPolygon,
  calculatePolylineLength,
  generateSpatialPinSummary,
  createSpatialAnnotation,
  listSpatialAnnotations,
  updateAnnotationStatus,
  linkAnnotationToEntity,
} from "@/lib/engineering-spatial-pinning";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M74: Thuật toán tính Bounding Box AABB từ tập điểm toạ độ", () => {
  const points = [
    { x: 10, y: 20, z: 5 },
    { x: 100, y: 50, z: 15 },
    { x: -20, y: 80, z: 0 },
    { x: 50, y: -10, z: 20 },
  ];

  const bbox = computeBoundingBoxFromPoints(points);
  assert.equal(bbox.minX, -20);
  assert.equal(bbox.maxX, 100);
  assert.equal(bbox.width, 120);
  assert.equal(bbox.minY, -10);
  assert.equal(bbox.maxY, 80);
  assert.equal(bbox.height, 90);
  assert.equal(bbox.minZ, 0);
  assert.equal(bbox.maxZ, 20);
  assert.equal(bbox.depth, 20);
});

test("M74: Thuật toán Ray-Casting kiểm tra điểm nằm trong đa giác Polyline", () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  assert.equal(
    isPointInPolygon({ x: 50, y: 50 }, polygon),
    true,
    "Điểm (50, 50) phải nằm trong hình vuông (0..100)",
  );
  assert.equal(
    isPointInPolygon({ x: 150, y: 50 }, polygon),
    false,
    "Điểm (150, 50) phải nằm ngoài hình vuông",
  );
  assert.equal(
    isPointInPolygon({ x: -10, y: -10 }, polygon),
    false,
    "Điểm (-10, -10) phải nằm ngoài hình vuông",
  );
});

test("M74: Thuật toán tính chiều dài tuyến ống / cáp 3D Polyline", () => {
  const line3D = [
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 4, z: 0 }, // length = 5
    { x: 3, y: 4, z: 12 }, // length = 12 -> total = 17
  ];

  const len = calculatePolylineLength(line3D);
  assert.equal(len, 17);
});

test("M74: Tổng hợp chỉ số Spatial Pin Summary", () => {
  const sampleAnnots: any[] = [
    { annotType: "progress_pin", severity: "normal", status: "open" },
    { annotType: "ncr_issue", severity: "critical", status: "open" },
    { annotType: "ncr_issue", severity: "medium", status: "resolved" },
    { annotType: "bbnt_request", severity: "high", status: "open" },
  ];

  const sum = generateSpatialPinSummary(sampleAnnots);
  assert.equal(sum.total, 4);
  assert.equal(sum.openIssues, 3);
  assert.equal(sum.resolvedIssues, 1);
  assert.equal(sum.criticalIssues, 2);
  assert.equal(sum.progressPins, 1);
  assert.equal(sum.bbntRequests, 1);
});

test("M74: Vòng đời Spatial Annotation & Pinning trong DB", { skip: !HAS_DB }, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Spatial Pinning Proj')`);
  const drawingCode = "DWG-TEST-001";

  // 1. Tạo pin
  const pin = await createSpatialAnnotation({
    projectId,
    drawingCode,
    floorId: "FL08",
    annotType: "ncr_issue",
    coordX: 350.5,
    coordY: 420.0,
    coordZ: 3.5,
    title: "Ống gió va chạm dầm",
    description: "Cần khoan lỗ sleeve dầm",
    severity: "critical",
  });

  assert.ok(pin.id);
  assert.equal(pin.status, "open");
  assert.equal(pin.coordX, 350.5);

  // 2. Query pins
  const list = await listSpatialAnnotations(projectId, { drawingCode });
  assert.ok(list.length >= 1);
  assert.equal(list[0].id, pin.id);

  // 3. Link to Entity
  const linked = await linkAnnotationToEntity(projectId, pin.id, "NCR", "NCR-2026-001");
  assert.equal(linked, true);

  // 4. Update status
  const updated = await updateAnnotationStatus(projectId, pin.id, "resolved", "Đã mở sleeve");
  assert.equal(updated, true);
});
