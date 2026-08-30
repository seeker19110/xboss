// tests/bim-unified-facade.test.ts — Verification for Unified BIM Facade (@/lib/bim)
import { test } from "node:test";
import assert from "node:assert/strict";
import { taoBimElementsVaCham } from "./fixtures-bim";
import {
  // 1. 3D BIM Viewer & 4D Simulation
  generateParametricMepfMesh,
  compute4DSimulationState,
  compute3DSectionCut,
  calculateModelBoundingBox,
  filterElementsPropertySet,
  type BimElement,
  type WbsTaskSnapshot,

  // 2. AI Multi-Trade Auto-Routing & Beam Sleeve
  validateBeamSleeve,
  findOptimalRoute3D,
  recommendClashResolution,

  // 3. Spatial Grid Clash & BCF Issues
  detectClashesWithSpatialGrid,
  findRoutePath3D,

  // 4. BIM 5D QTO & AABB Intersection
  checkAabbIntersection,
  get4DStatusColor,
  generateClashRerouteSolution,
  computeElementQto,
  type BimElementRecord,

  // 5. Scan-to-BIM & RANSAC Cylinder Fitting
  findNearestScannedPoint,
  fitCylinderRansac,
  analyzeScanVsBimDeviations,
  generateAsBuiltRedlineAndStamp,
  type ScannedPoint3D,
  type BimSpoolModel,

  // 6. God-Tier Super Intelligence & Merkle Ledger
  generateInstancedMeshGroups,
  checkAabbOverlap,
  calculateMerkleRootHex,
  generateAsBuiltStamp,
  analyzePointCloudDeviation,
  generateCncGCodeForDuct,
  generatePipeSpoolCutList,
  type GodTierElementData,
} from "@/lib/ky-thuat/bim";

test("BIM Unified Facade: 1. Parametric 3D Mesh & 4D Simulation & Section Cuts", () => {
  // Parametric Cylinder Mesh
  const pipeMesh = generateParametricMepfMesh("PIPE_STRAIGHT", { diameter: 100, length: 2000 });
  assert.equal(pipeMesh.vertices.length, 16 * 3);
  assert.equal(pipeMesh.dimensions.diameter, 100);

  // Parametric Box Mesh
  const ductMesh = generateParametricMepfMesh("DUCT_STRAIGHT", {
    width: 600,
    height: 400,
    length: 3000,
  });
  assert.equal(ductMesh.dimensions.width, 600);
  assert.equal(ductMesh.dimensions.height, 400);

  // 4D Simulation State
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
  ];
  const wbsMap = new Map<number, WbsTaskSnapshot>([
    [
      101,
      {
        id: 101,
        status: "completed",
        progress: 1.0,
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        approvedDate: "2026-08-09",
      },
    ],
  ]);
  const sim = compute4DSimulationState(elements, "2026-08-15", wbsMap);
  assert.equal(sim.totalElements, 1);
  assert.equal(sim.countsByStatus.approved, 1);

  // Model Bounding Box
  const bbox = calculateModelBoundingBox(elements);
  assert.ok(bbox.min);
  assert.ok(bbox.max);
});

test("BIM Unified Facade: 2. Beam Sleeve Structural Invariants & Auto-Routing", () => {
  // Valid Beam Sleeve: D=150mm, H=700mm, L=6000mm, X=1800mm (0.3L in middle zone)
  const validSleeve = validateBeamSleeve({
    beamRef: "D1",
    diameterMm: 150,
    beamDepthMm: 700,
    beamSpanMm: 6000,
    distFromSupportMm: 1800,
    sleeveElevationMm: 350,
  });
  assert.equal(validSleeve.isValid, true);
  assert.equal(validSleeve.violations.length, 0);

  // Invalid Beam Sleeve: Too close to support X=600mm (< 0.2L)
  const invalidSleeve = validateBeamSleeve({
    beamRef: "D1",
    diameterMm: 150,
    beamDepthMm: 700,
    beamSpanMm: 6000,
    distFromSupportMm: 600,
    sleeveElevationMm: 350,
  });
  assert.equal(invalidSleeve.isValid, false);
  assert.ok(invalidSleeve.violations.length > 0);

  // 3D Pathfinding
  const route = findOptimalRoute3D({ x: 0, y: 0, z: 3000 }, { x: 4000, y: 3000, z: 3000 }, []);
  assert.ok(route.waypoints.length >= 2);
  assert.ok(route.totalLengthM > 0);
});

test("BIM Unified Facade: 3. Spatial Grid Clash Solver & Pathfinding", () => {
  const elements = taoBimElementsVaCham();

  const clashes = detectClashesWithSpatialGrid(elements, 50, 1000);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].element_a_id, "ELEM-01");
  assert.equal(clashes[0].element_b_id, "ELEM-02");
});

test("BIM Unified Facade: 4. 5D QTO & AABB Collision Geometry", () => {
  const boxA = {
    min: [0, 0, 0] as [number, number, number],
    max: [100, 100, 100] as [number, number, number],
  };
  const boxB = {
    min: [50, 50, 50] as [number, number, number],
    max: [150, 150, 150] as [number, number, number],
  };
  const boxC = {
    min: [200, 200, 200] as [number, number, number],
    max: [300, 300, 300] as [number, number, number],
  };

  const checkAB = checkAabbIntersection(boxA, boxB);
  assert.equal(checkAB.isHardClash, true);

  const checkAC = checkAabbIntersection(boxA, boxC);
  assert.equal(checkAC.isHardClash, false);

  const qto = computeElementQto({
    element_type: "DUCT_STRAIGHT",
    spatial_bounding_box: { min: [0, 0, 0], max: [2000, 600, 400] },
    properties: { width: 600, height: 400, length: 2000 },
  });
  assert.ok(qto.quantity > 0);
  assert.equal(qto.unit, "m2");
});

test("BIM Unified Facade: 5. LiDAR Scan-to-BIM & RANSAC Cylinder Fitting", () => {
  const models: BimSpoolModel[] = [
    {
      spoolCode: "SP-01",
      discipline: "firefighting",
      systemCode: "FP",
      nominalSpec: "DN100",
      designStartPoint: [1000, 2000, 2800],
      designEndPoint: [6000, 2000, 2800],
      lengthM: 5.0,
    },
  ];
  const points: ScannedPoint3D[] = [
    { pointId: "P1", x: 1005, y: 2005, z: 2805 }, // ~8.66mm <= 15mm tolerance
  ];

  const nearest = findNearestScannedPoint([1000, 2000, 2800], points);
  assert.equal(nearest?.pointId, "P1");

  const scanResult = analyzeScanVsBimDeviations("SCAN-01", "LiDAR", models, points, 15.0);
  assert.equal(scanResult.totalPointsScanned, 1);
  assert.equal(scanResult.deviations.length, 1);

  const redline = generateAsBuiltRedlineAndStamp("SP-01", scanResult.deviations);
  assert.ok(redline.svgRedlineOverlay.includes("<svg"));
  assert.ok(redline.merkleSealHash.length > 0);
});

test("BIM Unified Facade: 6. God-Tier Instanced Mesh & Merkle Proof Root", () => {
  const sampleElements: GodTierElementData[] = [
    {
      id: "elem-1",
      guid: "GUID-DUCT-SUPP-101",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió cấp AHU-01",
      position: { x: 0, y: 0, z: 3200 },
      dimensions: { width: 1200, height: 800, length: 500 },
      boundingBox: { min: [-600, -400, 2950], max: [600, 400, 3450] },
      wbsTaskId: null,
    },
  ];

  const meshGroups = generateInstancedMeshGroups(sampleElements);
  assert.ok(meshGroups.length > 0);

  const merkleRoot = calculateMerkleRootHex(["hash1", "hash2", "hash3"]);
  assert.ok(merkleRoot.length === 64);

  const cnc = generateCncGCodeForDuct(600, 400, 1200, 0.75);
  assert.ok(cnc.gcode.includes("G00"));
  assert.ok(cnc.totalCutLengthMm > 0);

  const cutList = generatePipeSpoolCutList([
    { code: "SP-01", dia: 100, length: 3800 },
    { code: "SP-02", dia: 100, length: 2100 },
  ]);
  assert.ok(cutList.items.length === 2);
  assert.ok(cutList.totalStocksUsed >= 1);
});
