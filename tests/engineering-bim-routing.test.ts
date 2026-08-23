// tests/engineering-bim-routing.test.ts — Unit tests for BCF & 3D Auto-Routing (M89)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectClashesWithSpatialGrid,
  findRoutePath3D,
} from "@/lib/ky-thuat/engineering-bim-routing";
import { BimElementRecord } from "@/lib/ky-thuat/engineering-bim-cad";

test("M89: detectClashesWithSpatialGrid phát hiện va chạm cứng O(n log n)", () => {
  const elements: BimElementRecord[] = [
    {
      id: "ELEM-01",
      project_id: 1,
      ifc_guid: "GUID-DUCT-01",
      element_type: "DUCT_STRAIGHT",
      discipline: "hvac",
      system_name: "M-DUCT-SUPP",
      storey_level: "Level 1",
      zone_name: "Zone A",
      properties: {},
      spatial_bounding_box: {
        min: [1000, 2000, 2800],
        max: [5000, 2600, 3200],
      },
      task_id: null,
      boq_code: null,
      actual_status: "installed",
      created_at: new Date().toISOString(),
    },
    {
      id: "ELEM-02",
      project_id: 1,
      ifc_guid: "GUID-PIPE-01",
      element_type: "PIPE_STRAIGHT",
      discipline: "plumbing",
      system_name: "P-PIPE-SANR",
      storey_level: "Level 1",
      zone_name: "Zone A",
      properties: {},
      spatial_bounding_box: {
        min: [2500, 1000, 2900],
        max: [2700, 4000, 3100], // Giao cắt với ELEM-01
      },
      task_id: null,
      boq_code: null,
      actual_status: "installed",
      created_at: new Date().toISOString(),
    },
    {
      id: "ELEM-03-FAR",
      project_id: 1,
      ifc_guid: "GUID-PIPE-FAR",
      element_type: "PIPE_STRAIGHT",
      discipline: "plumbing",
      system_name: "P-PIPE-SANR",
      storey_level: "Level 1",
      zone_name: "Zone B",
      properties: {},
      spatial_bounding_box: {
        min: [10000, 10000, 2900],
        max: [10200, 14000, 3100], // Cách xa, không va chạm
      },
      task_id: null,
      boq_code: null,
      actual_status: "installed",
      created_at: new Date().toISOString(),
    },
  ];

  const clashes = detectClashesWithSpatialGrid(elements, 50, 2000);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].clash_type, "hard_clash");
  assert.equal(clashes[0].severity, "critical");
  assert.ok(["ELEM-01", "ELEM-02"].includes(clashes[0].element_a_id));
  assert.ok(["ELEM-01", "ELEM-02"].includes(clashes[0].element_b_id));
});

test("M89: findRoutePath3D tạo tuyến đi thẳng trực giao khi không có vật cản", () => {
  const start = { x: 1000, y: 1000, z: 3000 };
  const end = { x: 5000, y: 3000, z: 3000 };

  const result = findRoutePath3D(start, end, []);

  assert.equal(result.routingStatus, "success");
  assert.ok(result.pathPoints.length >= 2);
  assert.deepEqual(result.pathPoints[0], start);
  assert.deepEqual(result.pathPoints[result.pathPoints.length - 1], end);
  assert.equal(result.violatesGravitySlope, false);
  assert.ok(Math.abs(result.totalLengthM - 6.0) < 0.2);
});

test("M89: findRoutePath3D tự động uốn né khi gặp chướng ngại vật kết cấu", () => {
  const start = { x: 1000, y: 2000, z: 3200 };
  const end = { x: 8000, y: 2000, z: 3200 };

  // Dầm kết cấu nằm chính giữa
  const obstacle = {
    min: [3500, 1500, 3000] as [number, number, number],
    max: [4500, 2500, 3500] as [number, number, number],
  };

  const result = findRoutePath3D(start, end, [obstacle], { respectGravityPipe: true });

  assert.equal(result.routingStatus, "success");
  assert.ok(result.pathPoints.length > 2); // Đã chèn các điểm né
  assert.ok(result.elbowCount > 0);
  assert.ok(result.totalLengthM > 7.0);
});
