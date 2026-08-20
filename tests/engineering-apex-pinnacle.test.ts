import test from "node:test";
import assert from "node:assert/strict";
import "@/tests/setup";
import { computeApexScore } from "@/lib/engineering-pinnacle-synergy";
import { detectClashesWithSpatialGrid, findRoutePath3D } from "@/lib/engineering-bim-routing";
import type { BimElementRecord } from "@/lib/engineering-bim-cad";
import { DASHBOARD_TREE, findActiveNav } from "@/app/lib/dashboardTree";

test("Apex Synergy: computeApexScore tính đúng trọng số 5 trục và phân hạng statusTier", () => {
  // Trạng thái OPTIMAL
  const optimal = computeApexScore({
    spatial: 98,
    financial: 95,
    legal: 96,
    site: 97,
    agent: 99,
  });
  assert.ok(optimal.apexIndex >= 90);
  assert.equal(optimal.statusTier, "OPTIMAL");

  // Trạng thái CRITICAL khi điểm trung bình < 60
  const critical = computeApexScore({
    spatial: 40,
    financial: 50,
    legal: 45,
    site: 50,
    agent: 40,
  });
  assert.ok(critical.apexIndex < 60);
  assert.equal(critical.statusTier, "CRITICAL");
});

test("Spatial Grid Clash: phát hiện va chạm cứng (Hard Clash) và khoảng hở mềm (Soft Clearance)", () => {
  const elements: BimElementRecord[] = [
    {
      id: "elem-01",
      project_id: 1,
      ifc_guid: "GUID-DUCT-01",
      element_type: "Duct",
      discipline: "hvac",
      system_name: "HVAC",
      storey_level: "FL08",
      zone_name: "Zone A",
      spatial_bounding_box: {
        min: [0, 0, 0],
        max: [1000, 1000, 1000],
      },
      properties: {},
      task_id: null,
      boq_code: "BOQ-DUCT-01",
      actual_status: "in_progress",
      created_at: new Date().toISOString(),
    },
    {
      id: "elem-02",
      project_id: 1,
      ifc_guid: "GUID-BEAM-01",
      element_type: "Beam",
      discipline: "structure",
      system_name: "STRUCTURE",
      storey_level: "FL08",
      zone_name: "Zone A",
      spatial_bounding_box: {
        min: [500, 500, 500],
        max: [1500, 1500, 1500],
      },
      properties: {},
      task_id: null,
      boq_code: "BOQ-BEAM-01",
      actual_status: "completed",
      created_at: new Date().toISOString(),
    },
    {
      id: "elem-03",
      project_id: 1,
      ifc_guid: "GUID-PIPE-01",
      element_type: "Pipe",
      discipline: "plumbing",
      system_name: "PLUMBING",
      storey_level: "FL08",
      zone_name: "Zone A",
      spatial_bounding_box: {
        min: [1020, 0, 0],
        max: [1200, 500, 500],
      },
      properties: {},
      task_id: null,
      boq_code: "BOQ-PIPE-01",
      actual_status: "not_started",
      created_at: new Date().toISOString(),
    },
  ];

  const clashes = detectClashesWithSpatialGrid(elements, 50);
  assert.ok(clashes.length >= 1);

  const hardClash = clashes.find((c) => c.clash_type === "hard_clash");
  assert.ok(hardClash);
  assert.equal(hardClash?.element_a_id, "elem-01");
  assert.equal(hardClash?.element_b_id, "elem-02");
});

test("3D Auto-Routing: nắn tuyến trực giao A* và tính toán chiều dài tuyến tối ưu", () => {
  const start = { x: 0, y: 0, z: 3000 };
  const end = { x: 4000, y: 2000, z: 2920 };
  const obstacles = [
    {
      min: [1500, -500, 2500] as [number, number, number],
      max: [2500, 1500, 3500] as [number, number, number],
    },
  ];

  const result = findRoutePath3D(start, end, obstacles);
  assert.ok(result.pathPoints.length >= 2);
  assert.ok(result.totalLengthM > 0);
  assert.equal(result.routingStatus, "success");
});

test("DASHBOARD_TREE: Cụm Kỹ thuật Không gian & AI chứa đầy đủ các phân hệ và định tuyến chuẩn xác", () => {
  const engCluster = DASHBOARD_TREE.find(
    (c) => c.label === "Kỹ thuật Không gian & AI (Engineering OS)",
  );
  assert.ok(engCluster, "Phải có cụm Kỹ thuật Không gian & AI trên Sidebar");
  assert.ok(engCluster!.dashboards.length >= 12, "Phải chứa ít nhất 12 phân hệ kỹ thuật cốt lõi");

  // Kiểm tra tìm active nav
  const activeCockpit = findActiveNav("/engineering");
  assert.ok(activeCockpit);
  assert.equal(activeCockpit?.dashboard.label, "Apex Cockpit (M88)");

  const activeBim = findActiveNav("/engineering/bim-viewer");
  assert.ok(activeBim);
  assert.equal(activeBim?.dashboard.label, "3D BIM & 4D Sim (M80)");
});
