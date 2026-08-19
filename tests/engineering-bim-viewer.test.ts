import test from "node:test";
import assert from "node:assert/strict";
import {
  generateParametricMepfMesh,
  compute4DSimulationState,
  compute3DSectionCut,
  filterElementsPropertySet,
  calculateModelBoundingBox,
  BimElement,
  WbsTaskSnapshot,
} from "@/lib/engineering-bim-viewer";

test("M80: generateParametricMepfMesh tạo đúng lưới 3D cho Ống gió và Ống nước", () => {
  // Test ống gió hình hộp chữ nhật
  const ductMesh = generateParametricMepfMesh(
    "DUCT_STRAIGHT",
    { width: 600, height: 400, length: 5000 },
    { x: 0, y: 0, z: 2800 },
  );

  assert.ok(
    ductMesh.vertices.length >= 24,
    "Lưới ống gió hình hộp phải có ít nhất 8 đỉnh (24 tọa độ)",
  );
  assert.ok(ductMesh.indices.length >= 36, "Hình hộp phải có 12 tam giác (36 chỉ số)");
  assert.equal(ductMesh.dimensions.width, 600);
  assert.equal(ductMesh.dimensions.height, 400);

  // Test ống nước hình trụ tròn
  const pipeMesh = generateParametricMepfMesh(
    "PIPE_STRAIGHT",
    { diameter: 100, length: 4000 },
    { x: 1000, y: 1000, z: 3000 },
  );

  assert.ok(pipeMesh.vertices.length > 0, "Lưới ống nước phải có đỉnh");
  assert.ok(pipeMesh.indices.length > 0, "Lưới ống nước phải có chỉ số tam giác");
  assert.equal(pipeMesh.dimensions.diameter, 100);
});

test("M80: compute4DSimulationState tính toán chuẩn xác 5 trạng thái 4D WBS", () => {
  const elements: BimElement[] = [
    {
      id: "elem-1",
      modelId: "model-1",
      projectId: 1,
      guid: "GUID-1",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió 1",
      geometryData: generateParametricMepfMesh("DUCT_STRAIGHT", { width: 500, height: 400 }),
      properties: {},
      wbsTaskId: 101,
    },
    {
      id: "elem-2",
      modelId: "model-1",
      projectId: 1,
      guid: "GUID-2",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió 2",
      geometryData: generateParametricMepfMesh("DUCT_STRAIGHT", { width: 500, height: 400 }),
      properties: {},
      wbsTaskId: 102,
    },
    {
      id: "elem-3",
      modelId: "model-1",
      projectId: 1,
      guid: "GUID-3",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_WATER",
      name: "Ống nước 3",
      geometryData: generateParametricMepfMesh("PIPE_STRAIGHT", { diameter: 100 }),
      properties: {},
      wbsTaskId: 103,
    },
  ];

  const wbsMap = new Map<number, WbsTaskSnapshot>();
  // Task 101: Đã nghiệm thu
  wbsMap.set(101, {
    id: 101,
    startDate: "2026-08-01",
    endDate: "2026-08-10",
    progress: 1.0,
    status: "nghiem_thu",
    approvedDate: "2026-08-10",
  });
  // Task 102: Đang thi công
  wbsMap.set(102, {
    id: 102,
    startDate: "2026-08-05",
    endDate: "2026-08-25",
    progress: 0.5,
    status: "dang_thi_cong",
  });
  // Task 103: Chưa khởi công
  wbsMap.set(103, {
    id: 103,
    startDate: "2026-08-28",
    endDate: "2026-09-10",
    progress: 0.0,
    status: "chuan_bi",
  });

  const simResult = compute4DSimulationState(elements, "2026-08-15", wbsMap);

  assert.equal(simResult.totalElements, 3);
  assert.equal(simResult.countsByStatus.approved, 1, "Phần tử 1 phải có trạng thái approved");
  assert.equal(simResult.countsByStatus.in_progress, 1, "Phần tử 2 phải có trạng thái in_progress");
  assert.equal(simResult.countsByStatus.not_started, 1, "Phần tử 3 phải có trạng thái not_started");
  assert.ok(simResult.overallProgressPercent > 0, "Tiến độ tổng thể phải lớn hơn 0");
});

test("M80: compute3DSectionCut cắt đúng phần tử theo mặt phẳng Z", () => {
  const elements: BimElement[] = [
    {
      id: "elem-low",
      modelId: "model-1",
      projectId: 1,
      guid: "GUID-LOW",
      elementType: "SLAB",
      systemType: "STRUCTURE",
      name: "Sàn Tầng 1 (Z=0)",
      geometryData: {
        vertices: [0, 0, 0, 10, 0, 0, 10, 10, 0],
        indices: [0, 1, 2],
        dimensions: {},
      },
      properties: {},
    },
    {
      id: "elem-high",
      modelId: "model-1",
      projectId: 1,
      guid: "GUID-HIGH",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió Trần (Z=3500)",
      geometryData: {
        vertices: [0, 0, 3.5, 10, 0, 3.5, 10, 10, 3.5],
        indices: [0, 1, 2],
        dimensions: {},
      },
      properties: {},
    },
  ];

  // Cắt tại Z = 2000 mm
  const cutRes = compute3DSectionCut(elements, { axis: "z", offset: 2000 });
  assert.equal(cutRes.visibleElements.length, 1);
  assert.equal(cutRes.visibleElements[0].id, "elem-low");
  assert.equal(cutRes.clippedCount, 1);
});

test("M80: filterElementsPropertySet lọc chính xác theo Psets và thuộc tính", () => {
  const elements: BimElement[] = [
    {
      id: "elem-hvac",
      modelId: "model-1",
      projectId: 1,
      guid: "G1",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió lớn",
      geometryData: { vertices: [], indices: [], dimensions: {} },
      properties: { pset: { airflow: 5000, pressureDrop: 25, material: "Tôn mạ kẽm" } },
    },
    {
      id: "elem-pipe",
      modelId: "model-1",
      projectId: 1,
      guid: "G2",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_WATER",
      name: "Ống nước PPR",
      geometryData: { vertices: [], indices: [], dimensions: {} },
      properties: { pset: { airflow: 0, pressureDrop: 80, material: "PPR" } },
    },
  ];

  const filteredHvac = filterElementsPropertySet(elements, { systemType: "HVAC_SUPPLY" });
  assert.equal(filteredHvac.length, 1);
  assert.equal(filteredHvac[0].id, "elem-hvac");

  const filteredAirflow = filterElementsPropertySet(elements, { minAirflow: 3000 });
  assert.equal(filteredAirflow.length, 1);
  assert.equal(filteredAirflow[0].id, "elem-hvac");

  const filteredMaterial = filterElementsPropertySet(elements, { material: "PPR" });
  assert.equal(filteredMaterial.length, 1);
  assert.equal(filteredMaterial[0].id, "elem-pipe");
});

test("M80: calculateModelBoundingBox tính đúng tọa độ AABB", () => {
  const elements: BimElement[] = [
    {
      id: "e1",
      modelId: "m1",
      projectId: 1,
      guid: "G1",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Duct",
      geometryData: {
        vertices: [-2.5, -1.0, 0.5, 5.0, 3.0, 4.0],
        indices: [],
        dimensions: {},
      },
      properties: {},
    },
  ];

  const bbox = calculateModelBoundingBox(elements);
  assert.equal(bbox.min[0], -2500);
  assert.equal(bbox.min[1], -1000);
  assert.equal(bbox.min[2], 500);
  assert.equal(bbox.max[0], 5000);
  assert.equal(bbox.max[1], 3000);
  assert.equal(bbox.max[2], 4000);
});
