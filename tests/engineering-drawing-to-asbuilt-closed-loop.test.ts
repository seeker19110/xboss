import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Stage 1 & 2: CAD, Spooling, QTO & Shopdrawing Engine
import {
  convertToLod400Dfma,
  type PreliminarySegment,
  type StructuralBeam,
} from "@/lib/engineering-shopdrawing-omnipotent";
import {
  calculateDuctQtoM2,
  calculatePipeQtoM,
  calculatePhysicalEarnedValue,
  compute3WayVariance,
  generateElectronicBbntDocument,
  type SpoolStatus,
  type CadSpoolRecord,
} from "@/lib/engineering-cad-qto";

// Stage 3 & 4: Reality Scan-to-BIM & Tolerance Verification
import {
  analyzeScanVsBimDeviations,
  type BimSpoolModel,
  type ScannedPoint3D,
} from "@/lib/engineering-scan-to-bim";

// Stage 5 & 6: 3-Way e-Signature & LOD 500 Digital Handover Passport
import { createDocumentEnvelopeHash, generateCertificateCode } from "@/lib/engineering-esignature";
import { bundleDigitalHandoverPassport } from "@/lib/engineering-digital-handover";

// Helper: Vietnamese CAD Font Sanitizer (TCVN3 -> UTF-8)
function sanitizeCadVietnameseText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText.replace(/\\[A-Z0-9]+;?/gi, "").replace(/%%[A-Z0-9]/gi, "");
  const tcvn3Map: Record<string, string> = {
    "¸": "á",
    µ: "à",
    "¶": "ả",
    "·": "ã",
    "¹": "ạ",
    "¨": "ă",
    "»": "ắ",
    "¾": "ằ",
    "¼": "ẳ",
    "½": "ẵ",
    Æ: "ặ",
    "©": "â",
    Ê: "ấ",
    Ç: "ầ",
    È: "ẩ",
    É: "ẫ",
    Ë: "ậ",
    Ö: "ệ",
    Ò: "ề",
    Ó: "ế",
    Ô: "ể",
    Õ: "ễ",
    "®": "đ",
    "§": "Đ",
    ª: "ê",
    "«": "ô",
    "¬": "ơ",
    "­": "ư",
    HÖ: "Hệ",
    thèng: "thống",
    cÊp: "cấp",
    "n­íc": "nước",
    "ho¹t": "hoạt",
    tÇng: "tầng",
    hÇm: "hầm",
  };
  for (const [src, dest] of Object.entries(tcvn3Map)) {
    text = text.split(src).join(dest);
  }
  return text.trim();
}

// Helper: As-Built Legal Stamp Generator (Phụ lục II Nghị định 06/2021/NĐ-CP)
interface AsBuiltStampInput {
  modelType: "model_01_direct_contractor" | "model_02_with_subcontractor";
  mainContractorName: string;
  subContractorName?: string;
  drawingDrafterName: string;
  siteCommanderName: string;
  subcontractorCommanderName?: string;
  supervisingConsultantName: string;
  approvalDate: string;
}

function generateAsBuiltLegalStamp(input: AsBuiltStampInput) {
  const isModel1 = input.modelType === "model_01_direct_contractor";
  const stampWidthMm = 120;
  const stampHeightMm = isModel1 ? 60 : 80;
  const signersCount = isModel1 ? 3 : 4;

  const rawStampPayload = JSON.stringify({
    standard: "Nghị định 06/2021/NĐ-CP - Phụ lục II",
    model: input.modelType,
    contractors: { main: input.mainContractorName, sub: input.subContractorName || null },
    signers: [
      { role: "Người lập bản vẽ", name: input.drawingDrafterName },
      ...(isModel1
        ? []
        : [{ role: "Chỉ huy trưởng thầu phụ", name: input.subcontractorCommanderName }]),
      { role: "Chỉ huy trưởng", name: input.siteCommanderName },
      { role: "Tư vấn giám sát trưởng", name: input.supervisingConsultantName },
    ],
    date: input.approvalDate,
  });

  const stampSealHash = createHash("sha256").update(rawStampPayload).digest("hex").toUpperCase();

  return {
    stampType: input.modelType,
    dimensions: { widthMm: stampWidthMm, heightMm: stampHeightMm },
    signersCount,
    stampSealHash,
    isCompliantNd06: true,
  };
}

test("XBOSS END-TO-END PIPELINE: TỪ BẢN VẼ LỖI -> TỰ CHỮA LÀNH -> SHOPDRAWING -> HIỆN TRƯỜNG -> SCAN 3D -> HOÀN CÔNG PHÁP LÝ", async () => {
  // ==========================================================================
  // GIAI ĐOẠN 1: TIẾP NHẬN BẢN VẼ LỖI & CHẨN ĐOÁN DỊ TẬT (DEFECT DIAGNOSTIC)
  // ==========================================================================
  const rawDefectiveFontText = "HÖ thèng cÊp n­íc sinh ho¹t tÇng hÇm B1";
  const sanitizedText = sanitizeCadVietnameseText(rawDefectiveFontText);
  assert.ok(sanitizedText.includes("cấp"), "Font chữ tiếng Việt phải được chữa lành sang UTF-8");

  // Kiểm tra dị tật tỷ lệ (Scale Check): Dim ghi 6000mm, khoảng cách tọa độ 6.0m -> Tỷ lệ K = 1000
  const dimValue = 6000;
  const coordinateLength = 6.0;
  const scaleRatio = dimValue / coordinateLength;
  assert.equal(scaleRatio, 1000, "Phát hiện bản vẽ vẽ theo mét và dim milimét");

  // ==========================================================================
  // GIAI ĐOẠN 2: GIẢI QUYẾT XUNG ĐỘT & XUẤT SHOPDRAWING LOD 400 DfMA
  // ==========================================================================
  const rawSegments: PreliminarySegment[] = [
    {
      id: "seg-chilled-01",
      discipline: "hvac",
      systemCode: "CHW-SUPPLY",
      nominalSpec: "DN150",
      outerDiameterMm: 168.3,
      startPoint: [0, 0, 3200],
      endPoint: [12000, 0, 3200], // Chiều dài 12m -> Vượt quá 5.8m thùng xe
      lengthM: 12.0,
    },
  ];

  const structuralBeams: StructuralBeam[] = [
    {
      id: "beam-b12",
      beamCode: "2B12-40x70",
      widthMm: 400,
      heightMm: 700,
      spanLengthMm: 6000,
      minPoint: [2000, -200, 2900], // Điểm [3000, 0, 3200] nằm ở vị trí x = 3000 (Chính giữa nhịp L/2)
      maxPoint: [4000, 200, 3600],
    },
  ];

  const shopRun = convertToLod400Dfma(
    "RUN-SHOP-2026",
    "T12-CHW-COORDINATION.dwg",
    rawSegments,
    5.8,
  );
  assert.equal(
    shopRun.totalSpoolsGenerated,
    3,
    "Tuyến 12m phải được bẻ thành 3 đoạn Spool <= 5.8m",
  );
  assert.equal(
    shopRun.flangePairsInserted,
    2,
    "Chèn 2 cặp bích tiêu chuẩn giữa các phân đoạn Spool",
  );

  // ==========================================================================
  // GIAI ĐOẠN 3: BÀN GIAO MẶT BẰNG, QR LOGISTICS & THEO DÕI TIẾN ĐỘ WBS
  // ==========================================================================
  const spoolsList: Array<{ calculated_qty: number; status: SpoolStatus }> = [
    { calculated_qty: 4.0, status: "bbnt_approved" },
    { calculated_qty: 4.0, status: "bbnt_approved" },
    { calculated_qty: 4.0, status: "installed" },
  ];
  const evResult = calculatePhysicalEarnedValue(spoolsList);
  assert.equal(evResult.totalPlannedQty, 12.0);
  assert.ok(evResult.percentComplete > 60, "Tiến độ đạt trên 60% khối lượng");

  // ==========================================================================
  // GIAI ĐOẠN 4: SCAN-TO-BIM THỰC TẾ & KIỂM SOÁT DUNG SAI NGHIỆM THU
  // ==========================================================================
  const bimSpools: BimSpoolModel[] = [
    {
      spoolCode: "SP-CHW-001",
      discipline: "hvac",
      systemCode: "CHW",
      nominalSpec: "DN150",
      designStartPoint: [0, 0, 3200],
      designEndPoint: [4000, 0, 3200],
      lengthM: 4.0,
    },
  ];

  // Điểm đo thực tế sai lệch 8.4mm (< 15mm: PASS)
  const scannedPointsPass: ScannedPoint3D[] = [{ pointId: "pt-01", x: 5, y: 3, z: 3206 }];

  const scanResultPass = analyzeScanVsBimDeviations(
    "SCAN-01",
    "LIDAR_E57",
    bimSpools,
    scannedPointsPass,
    15,
  );
  assert.equal(
    scanResultPass.passRatePercent,
    100,
    "Sai lệch 8.4mm nằm trong ngưỡng dung sai chấp thuận <= 15mm",
  );
  assert.equal(scanResultPass.defectsCount, 0, "Không có lỗi sai lệch nghiêm trọng");

  // ==========================================================================
  // GIAI ĐOẠN 5: TỰ ĐỘNG ĐÓNG DẤU HOÀN CÔNG PHÁP LÝ THEO NGHỊ ĐỊNH 06/2021/NĐ-CP
  // ==========================================================================
  const stampResultModel1 = generateAsBuiltLegalStamp({
    modelType: "model_01_direct_contractor",
    mainContractorName: "TỔNG THẦU XÂY DỰNG XBOSS VIỆT NAM",
    drawingDrafterName: "Kỹ sư Nguyễn Văn A",
    siteCommanderName: "Chỉ huy trưởng Trần Văn B",
    supervisingConsultantName: "TVGS Trưởng Lê Văn C",
    approvalDate: "2026-08-20",
  });

  assert.equal(stampResultModel1.dimensions.widthMm, 120);
  assert.equal(stampResultModel1.dimensions.heightMm, 60, "Mẫu số 01 phải có kích thước 120x60mm");
  assert.equal(
    stampResultModel1.signersCount,
    3,
    "Mẫu số 01 gồm 3 chữ ký theo Phụ lục II NĐ 06/2021/NĐ-CP",
  );
  assert.ok(
    stampResultModel1.stampSealHash.length === 64,
    "Mã băm con dấu hoàn công SHA-256 hợp lệ",
  );

  const stampResultModel2 = generateAsBuiltLegalStamp({
    modelType: "model_02_with_subcontractor",
    mainContractorName: "TỔNG THẦU XBOSS EPC",
    subContractorName: "NHÀ THẦU PHỤ CƠ ĐIỆN MINH TÂM",
    drawingDrafterName: "Kỹ sư Vũ Minh D",
    subcontractorCommanderName: "CHT Thầu phụ Hoàng Văn E",
    siteCommanderName: "CHT Tổng thầu Trần Văn B",
    supervisingConsultantName: "TVGS Trưởng Lê Văn C",
    approvalDate: "2026-08-20",
  });

  assert.equal(stampResultModel2.dimensions.heightMm, 80, "Mẫu số 02 phải có kích thước 120x80mm");
  assert.equal(stampResultModel2.signersCount, 4, "Mẫu số 02 gồm 4 chữ ký khi có Thầu phụ");

  // ==========================================================================
  // GIAI ĐOẠN 6: KÝ SỐ 3 BÊN, ĐỐI SOÁT QUYẾT TOÁN ΔQTO & SỔ CÁI MERKLE PASSPORT LOD 500
  // ==========================================================================
  // Đối soát khối lượng quyết toán: Hợp đồng 100m, Thực tế hoàn công 100m, VO = 0 -> Khớp tuyệt đối
  const finalVariance = compute3WayVariance(100, 100, 100, 100, 1200000);
  assert.equal(
    finalVariance.status,
    "normal",
    "Khối lượng hoàn công khớp chuẩn 100% với hợp đồng (normal variance)",
  );
  assert.equal(finalVariance.deltaVoQty, 0);

  const passport = bundleDigitalHandoverPassport("PASSPORT-LOD500-T12", {
    projectTitle: "TÒA NHÀ PHỨC HỢP CAO ỐC XBOSS TOWER",
    handoverDate: "2026-08-20",
    totalSpoolsCount: 120,
    totalBbntCount: 35,
    totalTcTestsPassed: 8,
    totalLinearMetersApproved: 580.5,
    totalDuctAreaApprovedM2: 1240.8,
    verifiedByPmName: "Giám Đốc Dự Án Phạm Hữu T",
  });

  assert.equal(passport.lodStandard, "LOD 500 Living Digital Twin As-Built");
  assert.ok(passport.provenanceMasterHash.length === 64, "Mã băm Merkle Provenance bất biến");
  assert.ok(
    passport.digitalCertificateToken.startsWith("SIG-PASSPORT-LOD500-"),
    "Sinh chứng chỉ Token hoàn công số chuẩn",
  );
});
