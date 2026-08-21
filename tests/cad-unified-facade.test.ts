// tests/cad-unified-facade.test.ts — Verification for Unified CAD Facade (@/lib/cad)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  // 1. Skills: Diff, Lisp, Font, Layer
  computeCadVectorDiff,
  generateAutoLispDetailScript,
  convertTcvn3ToUnicode,
  normalizeCadLayers,
  type CadEntity,

  // 2. QTO Tracking & Weights
  SPOOL_MILESTONE_WEIGHTS,
  SPOOL_STATUS_COLORS,

  // 3. Nesting & Hydraulics
  nestPipeSegments1D,
  nestDuctSheets2D,
  calcHazenWilliams,
  calcDarcyWeisbach,
  validateVelocityLimit,

  // 4. Corridor & Trapeze
  planMultiTierCorridor,
  calculateTrapezeHangerStructure,

  // 5. Isometric & DfMA
  project3DtoIsometric2D,
  generateSpoolIsometricDrawing,

  // 6. Hydraulic Network
  autoSizePipeDiameter,

  // 7. Carbon LCA
  calculate6dCarbonLca,
  evaluateAssetHealthAndRul,
  exportDigitalTwinPassport,
} from "@/lib/cad";

test("CAD Unified Facade: 1. Vector Diffing & AutoLISP & Font Doctor", () => {
  // Vector Diffing
  const base: CadEntity[] = [
    {
      id: "e1",
      type: "line",
      layer: "M-DUCT",
      coordinates: { start: [0, 0, 0], end: [1000, 0, 0] },
    },
  ];
  const compare: CadEntity[] = [
    {
      id: "e1",
      type: "line",
      layer: "M-DUCT",
      coordinates: { start: [0, 0, 0], end: [1200, 0, 0] },
    },
    {
      id: "e2",
      type: "circle",
      layer: "P-PIPE",
      coordinates: { center: [500, 500, 0], radius: 50 },
    },
  ];
  const diff = computeCadVectorDiff(base, compare);
  assert.equal(diff.totalBase, 1);
  assert.equal(diff.totalCompare, 2);
  assert.ok(diff.differences.length > 0);

  // AutoLISP Generation
  const lisp = generateAutoLispDetailScript("hanger", { widthMm: 600, heightMm: 400 });
  assert.ok(lisp.includes("DRAW_TRAPEZE_HANGER"));

  // Font Repair
  const converted = convertTcvn3ToUnicode("XBoss §ång c¬");
  assert.ok(converted.includes("Đ"));

  // Layer Normalization
  const mapped = normalizeCadLayers(["M_DUCT_SUPPLY", "P_WATER_PIPE"]);
  assert.equal(mapped["M_DUCT_SUPPLY"], "M-DUCT-SUPP");
  assert.equal(mapped["P_WATER_PIPE"], "P-PIPE-SANR");
});

test("CAD Unified Facade: 2. QTO Milestone Weights", () => {
  assert.equal(SPOOL_MILESTONE_WEIGHTS.fabricated, 0.2);
  assert.equal(SPOOL_MILESTONE_WEIGHTS.delivered, 0.4);
  assert.equal(SPOOL_MILESTONE_WEIGHTS.installed, 0.75);
  assert.equal(SPOOL_MILESTONE_WEIGHTS.qc_passed, 0.9);
  assert.equal(SPOOL_MILESTONE_WEIGHTS.bbnt_approved, 1.0);
  assert.ok(SPOOL_STATUS_COLORS.bbnt_approved);
});

test("CAD Unified Facade: 3. 1D/2D Nesting & Hydraulic Calculations", () => {
  // 1D Nesting
  const pipeSegments = [
    { spoolCode: "SP-01", lengthMm: 3800 },
    { spoolCode: "SP-02", lengthMm: 2100 },
  ];
  const nesting1d = nestPipeSegments1D(pipeSegments, 6000, 2);
  assert.equal(nesting1d.totalBarsUsed, 1);
  assert.equal(nesting1d.totalSegments, 2);

  // 2D Nesting
  const ductSheets = [
    { spoolCode: "RECT-01", widthMm: 600, heightMm: 800 },
    { spoolCode: "RECT-02", widthMm: 500, heightMm: 800 },
  ];
  const nesting2d = nestDuctSheets2D(ductSheets, 1200, 2400, 10);
  assert.equal(nesting2d.totalPlacedRects, 2);
  assert.ok(nesting2d.totalSheets >= 1);

  // Hydraulic Hazen-Williams
  const hw = calcHazenWilliams(10.0, 100, 50);
  assert.ok(hw.velocityMs > 0);
  assert.ok(hw.pressureDropBar > 0);

  // Hydraulic Darcy-Weisbach
  const dw = calcDarcyWeisbach(10.0, 100, 0.046, 50);
  assert.ok(dw.velocityMs > 0);
  assert.ok(dw.frictionFactor > 0);

  // Velocity Limits
  const velCheck = validateVelocityLimit(1.8, "chilled_water");
  assert.equal(velCheck.ok, true);
  assert.equal(velCheck.status, "pass");
});

test("CAD Unified Facade: 4. Generative Corridor & Trapeze Engineering", () => {
  const corridor = planMultiTierCorridor({
    corridorCode: "CORR-01",
    title: "Main Corridor",
    corridorWidthMm: 2000,
    systems: [
      {
        systemCode: "DUCT_1",
        discipline: "hvac",
        widthMm: 600,
        heightOrDiaMm: 300,
        weightKgPerM: 20,
      },
      {
        systemCode: "TRAY_1",
        discipline: "electrical",
        widthMm: 300,
        heightOrDiaMm: 100,
        weightKgPerM: 15,
      },
    ],
  });
  assert.equal(corridor.corridorCode, "CORR-01");
  assert.equal(corridor.assignedSystems.length, 2);

  const trapeze = calculateTrapezeHangerStructure({
    hangerCode: "TRAP-01",
    spanWidthMm: 1200,
    dropLengthMm: 800,
    hangerSpacingM: 1.5,
    systemsOnHanger: [
      { weightKgPerM: 30.0, systemCode: "DUCT" },
      { weightKgPerM: 20.0, systemCode: "PIPE" },
    ],
  });
  assert.equal(trapeze.safetyStatus, "pass");
  assert.ok(trapeze.autoLispScript.includes("c:DRAW_TRAP_01"));
});

test("CAD Unified Facade: 5. DfMA Spool Isometric Drawing", () => {
  const iso = generateSpoolIsometricDrawing({
    spoolCode: "SP-001",
    systemCode: "CHILLED_WATER",
    nominalDiameterMm: 100,
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 3000, y: 0, z: 0 },
  });
  assert.equal(iso.spoolCode, "SP-001");
  assert.ok(iso.svgIsometricVector.includes("<svg"));
  assert.ok(iso.microBom.length > 0);

  const proj = project3DtoIsometric2D({ x: 1000, y: 500, z: 200 });
  assert.ok(typeof proj.x === "number" && typeof proj.y === "number");
});

test("CAD Unified Facade: 6. Hydraulic Pipe Auto-sizing", () => {
  const sized = autoSizePipeDiameter(5.0, 2.0);
  assert.ok(sized.diameterMm > 0);
  assert.ok(sized.standardDn);
  assert.ok(sized.actualVelocityMs <= 2.0);
});

test("CAD Unified Facade: 7. Carbon LCA & Digital Twin Passport", () => {
  const lca = calculate6dCarbonLca(
    [
      { category: "galvanized_steel", weightKg: 1000 },
      { category: "black_steel", weightKg: 1500 },
    ],
    2000,
  );
  assert.ok(lca.totalEmbodiedCarbonKgCo2e > 0);

  const health = evaluateAssetHealthAndRul({
    installedDateISO: "2024-01-01T00:00:00.000Z",
    expectedLifespanYears: 15,
    mtbfHours: 20000,
    currentOperatingHours: 10000,
    incidentCount: 1,
  });
  assert.ok(health.healthScorePercent > 0);
  assert.equal(health.riskStatus, "healthy");

  const passport = exportDigitalTwinPassport(
    "PRJ-LANDMARK",
    [
      {
        recordCode: "REC-PUMP-01",
        assetGuid: "GUID-PUMP-001",
        equipmentName: "Bơm ly tâm Chiller",
        systemCode: "HVAC_CHILLER",
        serialNumber: "SN-2026-X889",
        installedDate: "2026-06-01",
        expectedLifespanYears: 15,
        mtbfHours: 25000,
        currentOperatingHours: 5000,
        remainingUsefulLifePercent: 80,
        maintenanceCycleDays: 90,
        nextMaintenanceDate: "2026-09-01",
        healthScorePercent: 92,
        maintenanceLog: [],
      },
    ],
    25.5,
  );
  assert.equal(passport.lodStandard, "LOD 500 - As-Built Operational Twin");
  assert.ok(passport.merkleProofRoot);
});
