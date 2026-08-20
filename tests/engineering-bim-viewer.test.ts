// tests/engineering-bim-viewer.test.ts — Unit tests for BIM Viewer & 4D Simulation Engine (M80 / M89)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateParametricMepfMesh,
  compute4DSimulationState,
  compute3DSectionCut,
  calculateModelBoundingBox,
  filterElementsPropertySet,
  BimElement,
  WbsTaskSnapshot,
} from "@/lib/engineering-bim-viewer";

test("M80/M89: generateParametricMepfMesh sinh lưới hình trụ cho PIPE", () => {
  const mesh = generateParametricMepfMesh("PIPE_STRAIGHT", { diameter: 100, length: 2000 });

  assert.equal(mesh.vertices.length, 16 * 3); // 8-segment cylinder
  assert.equal(mesh.indices.length, 8 * 6); // 8 quads * 2 triangles * 3 indices = 48
  assert.equal(mesh.dimensions.diameter, 100);
});

test("M80/M89: generateParametricMepfMesh sinh lưới hộp cho DUCT", () => {
  const mesh = generateParametricMepfMesh("DUCT_STRAIGHT", {
    width: 600,
    height: 400,
    length: 3000,
  });

  assert.equal(mesh.vertices.length, 8 * 3); // 8 corner vertices * 3 coords = 24
  assert.equal(mesh.indices.length, 12 * 3); // 6 faces * 2 triangles * 3 indices = 36
  assert.equal(mesh.dimensions.width, 600);
  assert.equal(mesh.dimensions.height, 400);
});

test("M80/M89: compute4DSimulationState tính toán chính xác trạng thái 4D WBS", () => {
  const elements: BimElement[] = [
    {
      id: "ELEM-01",
      modelId: "MOD-01",
      projectId: 1,
      guid: "GUID-01",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Supply Duct L1",
      geometryData: { vertices: [], indices: [], dimensions: {} },
      properties: {},
      wbsTaskId: 101,
    },
    {
      id: "ELEM-02",
      modelId: "MOD-01",
      projectId: 1,
      guid: "GUID-02",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_WATER",
      name: "Water Pipe L1",
      geometryData: { vertices: [], indices: [], dimensions: {} },
      properties: {},
      wbsTaskId: 102,
    },
  ];

  const wbsMap = new Map<number, WbsTaskSnapshot>([
    [
      101,
      {
        id: 101,
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        progress: 1.0,
        status: "done",
        approvedDate: "2026-08-11",
      },
    ],
    [
      102,
      {
        id: 102,
        startDate: "2026-08-15",
        endDate: "2026-08-25",
        progress: 0.0,
        status: "todo",
      },
    ],
  ]);

  // Trước ngày bắt đầu -> not_started
  const stateEarly = compute4DSimulationState(elements, "2026-07-25", wbsMap);
  assert.equal(stateEarly.countsByStatus.not_started, 2);
  assert.equal(stateEarly.overallProgressPercent, 0);

  // Giữa chừng -> Task 101 đã approved, Task 102 not_started
  const stateMid = compute4DSimulationState(elements, "2026-08-12", wbsMap);
  assert.equal(stateMid.countsByStatus.approved, 1);
  assert.equal(stateMid.countsByStatus.not_started, 1);
  assert.equal(stateMid.overallProgressPercent, 50);
});

test("M80/M89: compute3DSectionCut và filterElementsPropertySet", () => {
  const elements: BimElement[] = [
    {
      id: "E-LOW",
      modelId: "M1",
      projectId: 1,
      guid: "G1",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_WATER",
      name: "Low Pipe",
      geometryData: { vertices: [0, 0, 1.0, 1, 0, 1.0, 1, 1, 1.0], indices: [], dimensions: {} },
      properties: { pset: { airflow: 500 } },
    },
    {
      id: "E-HIGH",
      modelId: "M1",
      projectId: 1,
      guid: "G2",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "High Duct",
      geometryData: { vertices: [0, 0, 4.0, 1, 0, 4.0, 1, 1, 4.0], indices: [], dimensions: {} },
      properties: { pset: { airflow: 1500 } },
    },
  ];

  const cut = compute3DSectionCut(elements, {
    axis: "z",
    positionMm: 2500, // 2.5m
    direction: "positive",
  });

  assert.equal(cut.visibleElements.length, 1);
  assert.equal(cut.visibleElements[0].id, "E-HIGH");
  assert.equal(cut.clippedCount, 1);

  const filtered = filterElementsPropertySet(elements, {
    systemType: "HVAC_SUPPLY",
    minAirflow: 1000,
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "E-HIGH");
});
