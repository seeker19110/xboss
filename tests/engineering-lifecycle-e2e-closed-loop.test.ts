import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";

// Stage 1 & 2: CAD, Spooling, QTO & 3-Way Variance
import {
  calculateDuctQtoM2,
  calculatePipeQtoM,
  calculatePhysicalEarnedValue,
  compute3WayVariance,
  generateElectronicBbntDocument,
  type SpoolStatus,
  type CadSpoolRecord,
} from "@/lib/ky-thuat/engineering-cad-qto";

// Stage 4: 3-Way e-Signature Protocol
import {
  createDocumentEnvelopeHash,
  generateCertificateCode,
} from "@/lib/ky-thuat/engineering-esignature";

// Stage 5: Governance, HSE Vision, FIDIC
import {
  calculateHseSafetyScore,
  type DetectedHazardItem,
} from "@/lib/ky-thuat/engineering-hse-vision";
import {
  mapDelayEventToFidicClause,
  checkNoticeCompliance,
} from "@/lib/ky-thuat/engineering-fidic-claim";

// Stage 6: Scan-to-BIM & LOD 500 Digital Handover Passport
import {
  analyzeScanVsBimDeviations,
  type BimSpoolModel,
  type ScannedPoint3D,
} from "@/lib/ky-thuat/engineering-scan-to-bim";
import { bundleDigitalHandoverPassport } from "@/lib/ky-thuat/engineering-digital-handover";

test("XBOSS E2E LIFECYCLE: Khép kín toàn chuỗi từ CAD Thô -> QTO -> Tracking -> Nghiệm thu -> Kiểm soát -> Hoàn công", () => {
  // GIAI ĐOẠN 1: BẢN CAD THÔ & BÓC TÁCH KHỐI LƯỢNG 5D (AUTO-QTO)
  const ductAreaM2 = calculateDuctQtoM2(600, 400, 4.2, 0.05);
  assert.equal(ductAreaM2, 8.82);

  const pipeLengthM = calculatePipeQtoM(18.4567);
  assert.equal(pipeLengthM, 18.457);

  // GIAI ĐOẠN 2: ĐỐI SOÁT MA TRẬN KHỐI LƯỢNG 3 CHIỀU (3-WAY VARIANCE MATRIX)
  const variance = compute3WayVariance(100, 110, 50, 20, 850000);
  assert.equal(variance.status, "vo_risk");
  assert.equal(variance.deltaVoQty, 10);
  assert.equal(variance.estimatedVoVnd, 8500000);

  // GIAI ĐOẠN 3: TRACKING TIẾN ĐỘ HIỆN TRƯỜNG & PHYSICAL EARNED VALUE (5 MỐC)
  const spoolsList: Array<{ calculated_qty: number; status: SpoolStatus }> = [
    { calculated_qty: 8.82, status: "fabricated" },
    { calculated_qty: 8.82, status: "delivered" },
    { calculated_qty: 8.82, status: "installed" },
    { calculated_qty: 8.82, status: "qc_passed" },
    { calculated_qty: 8.82, status: "bbnt_approved" },
  ];
  const evResult = calculatePhysicalEarnedValue(spoolsList);
  assert.equal(evResult.totalPlannedQty, 44.1);
  assert.equal(Math.round(evResult.percentComplete), 65);

  // GIAI ĐOẠN 4: HOÀN THIỆN NGHIỆM THU & KÝ SỐ PHÁP LÝ 3 BÊN (NĐ 06/2021/NĐ-CP)
  const mockSpools: CadSpoolRecord[] = [
    {
      id: "sp-001",
      project_id: 1,
      drawing_id: 1,
      spool_code: "SP-DUCT-L4-Z1-001",
      discipline: "hvac",
      system_code: "ACMV-SA",
      floor_label: "Tầng 4",
      zone_label: "Zone A",
      dimension_spec: "600x400",
      length_m: 4.2,
      calculated_qty: 8.82,
      unit: "m2",
      boq_item_id: null,
      task_id: null,
      status: "qc_passed",
      inspection_request_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const bbntDoc = generateElectronicBbntDocument("TT AVIO Tháp A", mockSpools, {
    name: "Trần Văn PM",
    role: "pm",
  });
  assert.ok(bbntDoc.bbntNumber.startsWith("BBNT-MEPF-"));
  assert.ok(bbntDoc.provenanceHash.startsWith("SHA256:PROV-"));
  assert.ok(bbntDoc.cryptographicSignatureToken.includes("PM"));
  assert.equal(bbntDoc.totalSpoolCount, 1);

  const docHash = createDocumentEnvelopeHash({ docCode: "BBNT-001", projectId: 1 });
  assert.equal(docHash.length, 64);
  const certCode = generateCertificateCode("BBNT");
  assert.ok(certCode.startsWith("CERT-BBNT-"));

  // GIAI ĐOẠN 5: ĐA TẦNG KIỂM SOÁT (HSE AI VISION & FIDIC 28-DAY NOTICE)
  const hazards: DetectedHazardItem[] = [
    {
      hazardType: "NO_VEST",
      severity: "LOW",
      confidence: 0.92,
      boundingBox: [100, 100, 200, 200],
      description: "Không mặc áo phản quang",
      standardViolation: "QCVN 18:2021/BXD",
      fineAmountVnd: 500000,
    },
  ];
  const hseEvaluation = calculateHseSafetyScore(hazards);
  assert.equal(hseEvaluation.score, 95);
  assert.equal(hseEvaluation.riskTier, "SAFE");

  const fidicClause = mapDelayEventToFidicClause("ACCESS_DELAY", "FIDIC_RED_1999");
  assert.equal(fidicClause.clause, "Sub-Clause 2.1");
  assert.equal(fidicClause.eotEntitlement, true);

  const noticeCheck = checkNoticeCompliance("2026-08-01", "2026-08-15");
  assert.equal(noticeCheck.isCompliant, true);
  assert.equal(noticeCheck.daysDifference, 14);

  // GIAI ĐOẠN 6: HOÀN CÔNG SỐ (SCAN-TO-BIM & LOD 500 DIGITAL PASSPORT)
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
    { pointId: "P1", x: 1005, y: 2005, z: 2805 }, // Lệch ~8.66mm <= 15mm -> within_tolerance
  ];

  const scanDeviation = analyzeScanVsBimDeviations("SCAN-01", "LiDAR", models, points, 15.0);
  assert.equal(scanDeviation.spoolsAnalyzedCount, 1);
  assert.equal(scanDeviation.defectsCount, 0);
  assert.equal(scanDeviation.deviations[0].status, "within_tolerance");

  const passport = bundleDigitalHandoverPassport("PASSPORT-AVIO-A-2026", {
    projectTitle: "TT AVIO Tháp A",
    handoverDate: "2026-08-20",
    totalSpoolsCount: 1420,
    totalBbntCount: 345,
    totalTcTestsPassed: 48,
    totalLinearMetersApproved: 18450.0,
    totalDuctAreaApprovedM2: 12850.5,
    verifiedByPmName: "Trần Văn PM",
  });

  assert.equal(passport.passportCode, "PASSPORT-AVIO-A-2026");
  assert.equal(passport.lodStandard, "LOD 500 Living Digital Twin As-Built");
  assert.equal(passport.bmsIntegrationReady, true);
  assert.ok(passport.provenanceMasterHash.length === 64);
  assert.ok(passport.digitalCertificateToken.startsWith("SIG-PASSPORT-LOD500-"));
});
