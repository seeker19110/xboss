import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertToLod400Dfma,
  detectStructuralSleevePenetrations,
  resolveZeroEntanglementHierarchy,
  generateIsometricSpoolSheet,
  analyzeCeilingPlenumClearance,
  PreliminarySegment,
  StructuralBeam,
} from "@/lib/ky-thuat/engineering-shopdrawing-omnipotent";

test("M69: convertToLod400Dfma phân đoạn Spool <= 5.8m, áp dụng dốc 2% và chèn mặt bích", () => {
  const segments: PreliminarySegment[] = [
    {
      id: "SEG-01",
      discipline: "plumbing",
      systemCode: "DRAIN",
      nominalSpec: "DN150",
      outerDiameterMm: 168.3,
      startPoint: [0, 0, 3000],
      endPoint: [12000, 0, 3000],
      lengthM: 12.0, // 12m -> Chia làm 3 đoạn 4m <= 5.8m
    },
  ];

  const res = convertToLod400Dfma("RUN-01", "MB-T05.DWG", segments, 5.8, 2.0, 25.0);

  assert.equal(res.totalSpoolsGenerated, 3);
  assert.ok(res.spools.every((s) => s.lengthM <= 5.8));
  assert.equal(res.slopeAppliedPercent, 2.0);
  assert.ok(res.spools[0].endElevationMm < res.spools[0].startElevationMm); // Có dốc hạ cao độ
  assert.ok(res.flangePairsInserted >= 1);
});

test("M69: detectStructuralSleevePenetrations phát hiện lỗ mở dầm và kiểm tra an toàn kết cấu", () => {
  const segments: PreliminarySegment[] = [
    {
      id: "P1",
      discipline: "firefighting",
      systemCode: "FP",
      nominalSpec: "DN100",
      outerDiameterMm: 114.3,
      startPoint: [0, 2000, 2600],
      endPoint: [8000, 2000, 2600],
      lengthM: 8.0,
    },
  ];

  const beams: StructuralBeam[] = [
    {
      id: "B1",
      beamCode: "D400x800",
      widthMm: 400,
      heightMm: 800, // H=800mm -> H/3 = 266.6mm > Sleeve 214.3mm -> Safe!
      spanLengthMm: 8000,
      minPoint: [3800, 0, 2400],
      maxPoint: [4200, 4000, 3200],
    },
  ];

  const sleeves = detectStructuralSleevePenetrations(segments, beams, 25.0);

  assert.equal(sleeves.length, 1);
  assert.equal(sleeves[0].beamCode, "D400x800");
  assert.equal(sleeves[0].pipeSpec, "DN100");
  assert.ok(sleeves[0].sleeveDiameterMm > 114.3);
  assert.equal(sleeves[0].complianceVerdict, "approved_structural");
});

test("M69: resolveZeroEntanglementHierarchy dàn xếp phân tầng 5 lớp không gian", () => {
  const hvac = resolveZeroEntanglementHierarchy("hvac", 3200);
  const elec = resolveZeroEntanglementHierarchy("electrical", 3200);
  const plumb = resolveZeroEntanglementHierarchy("plumbing", 3200);

  assert.ok(elec.targetElevationMm > hvac.targetElevationMm);
  assert.ok(hvac.targetElevationMm > plumb.targetElevationMm);
});

test("M69: generateIsometricSpoolSheet sinh bản vẽ trục đo Isometric và QR tem nhãn", () => {
  const spool = {
    spoolCode: "SP-01",
    segmentId: "SEG-01",
    lengthM: 4.5,
    slopeAppliedPercent: 2.0,
    hasFlangePair: true,
    insulationThicknessMm: 25,
    effectiveOuterDiameterMm: 164.3,
    startElevationMm: 2800,
    endElevationMm: 2710,
  };

  const iso = generateIsometricSpoolSheet(spool, "DN100 SCH40");

  assert.equal(iso.spoolCode, "SP-01");
  assert.ok(iso.qrFabricationToken.startsWith("QR-FAB-"));
  assert.equal(iso.isometricNodes.length, 3);
  assert.equal(iso.flangePairsCount, 1);
});

test("M69: analyzeCeilingPlenumClearance phát hiện xung đột thông thủy trần và tự bóp dẹp ống gió", () => {
  // Trần hẹp: Dầm đáy 2600mm, trần thạch cao 2300mm -> Khoảng hở 300mm
  // Ống gió 600x400 (cao 400mm) -> Chắc chắn bị kẹt!
  const analysis = analyzeCeilingPlenumClearance(2600, 2300, { widthMm: 600, heightMm: 400 });

  assert.equal(analysis.isClashRisk, true);
  assert.ok(analysis.recommendedDuctTransformation !== null);
  assert.ok(analysis.recommendedDuctTransformation?.equivalentFlatSpec.includes("mm"));
});
