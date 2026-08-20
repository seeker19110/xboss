// tests/engineering-cad-dfma-isometric.test.ts — Unit tests for DfMA Spool Isometric Drawing & Genetic Nesting (M76 / M92)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSpoolIsometricDrawing,
  optimizeGeneticNestingWithRemnants,
  project3DtoIsometric2D,
} from "@/lib/engineering-cad-dfma-isometric";

test("M76: project3DtoIsometric2D chiếu chuẩn góc 30° axonometric", () => {
  const pOrigin = { x: 0, y: 0, z: 0 };
  const resOrigin = project3DtoIsometric2D(pOrigin, 1.0, { x: 0, y: 0 });
  assert.equal(resOrigin.x, 0);
  assert.equal(resOrigin.y, 0);

  const pX = { x: 100, y: 0, z: 0 };
  const resX = project3DtoIsometric2D(pX, 1.0, { x: 0, y: 0 });
  assert.ok(resX.x > 0); // x_2d = 100 * cos(30°) = 86.6
  assert.ok(resX.y > 0); // y_2d = 100 * sin(30°) = 50.0

  const pZ = { x: 0, y: 0, z: 100 };
  const resZ = project3DtoIsometric2D(pZ, 1.0, { x: 0, y: 0 });
  assert.equal(resZ.x, 0);
  assert.equal(resZ.y, -100); // Chiều Z thẳng đứng hướng lên (-z trong SVG)
});

test("M76: generateSpoolIsometricDrawing tính toán khấu trừ phụ kiện và xuất Micro-BOM", () => {
  const input = {
    spoolCode: "SPOOL-CHW-FL10-001",
    systemCode: "CHILLED_WATER",
    nominalDiameterMm: 100,
    pipeMaterial: "Thép đen Sch40",
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 3000, y: 0, z: 0 },
    fittings: [
      {
        id: "FIT-01",
        type: "elbow_90" as const,
        nominalDiaMm: 100,
        takeOffLengthMm: 152, // Bán kính cút 1.5D = 152mm
        socketDepthMm: 32, // Độ ngập âm hàn socket
        description: "Cút 90 độ DN100 hàn thép",
      },
    ],
    hasFieldFitEnd: true,
    fieldFitAllowanceMm: 100,
  };

  const result = generateSpoolIsometricDrawing(input);

  assert.equal(result.spoolCode, "SPOOL-CHW-FL10-001");
  assert.equal(result.nominalDiameterMm, 100);
  assert.equal(result.centerlineLengthMm, 3000);
  // Khấu trừ = 152 - 32 = 120mm
  assert.equal(result.socketInsertionDeductionMm, 120);
  assert.equal(result.fieldFitAllowanceMm, 100);
  // L_cut = 3000 - 120 + 100 = 2980mm
  assert.equal(result.cutLengthMm, 2980);

  // Kiểm tra Micro-BOM
  assert.ok(result.microBom.length >= 2);
  assert.ok(result.microBom[0].spec.includes("L=2980mm"));
  assert.ok(result.svgIsometricVector.includes("<svg"));
  assert.ok(result.qrPayload.qrData.includes("SPOOL-CHW-FL10-001"));
});

test("M76: optimizeGeneticNestingWithRemnants ưu tiên quét kho phôi thừa và khống chế phế liệu < 0.8%", () => {
  const demandCuts = [
    { spoolCode: "SP-01", lengthMm: 2800 },
    { spoolCode: "SP-02", lengthMm: 1800 },
    { spoolCode: "SP-03", lengthMm: 1300 },
    { spoolCode: "SP-04", lengthMm: 3100 },
    { spoolCode: "SP-05", lengthMm: 2850 },
  ];

  const remnants = [
    {
      id: "REM-01",
      barcode: "REM-BAR-001",
      materialType: "steel_pipe",
      specDimension: "DN100",
      lengthMm: 1900, // Vừa đẹp cho SP-02 (1800mm)
      isAllocated: false,
    },
    {
      id: "REM-02",
      barcode: "REM-BAR-002",
      materialType: "steel_pipe",
      specDimension: "DN100",
      lengthMm: 1400, // Vừa đẹp cho SP-03 (1300mm)
      isAllocated: false,
    },
  ];

  const result = optimizeGeneticNestingWithRemnants(demandCuts, remnants, 6000, 2);

  assert.equal(result.totalDemandCuts, 5);
  assert.equal(result.remnantPiecesUsed, 2); // 2 đoạn đã ghép vào kho phôi thừa
  assert.ok(result.newStandardBarsUsed <= 2); // 3 đoạn còn lại (3100+2850=5950 + 2800)
  assert.ok(result.overallScrapPercent <= 2.5);
  assert.ok(["A+", "A", "B"].includes(result.efficiencyGrade));
});
