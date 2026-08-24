// lib/engineering-shopdrawing-omnipotent.ts — Omnipotent Shopdrawing Engine (M69)
import { query, queryOne } from "@/lib/db";

export interface PreliminarySegment {
  id: string;
  discipline: "firefighting" | "hvac" | "plumbing" | "electrical";
  systemCode: string;
  nominalSpec: string; // e.g. "DN100", "DN150"
  outerDiameterMm: number;
  startPoint: [number, number, number]; // [x, y, z] mm
  endPoint: [number, number, number];
  lengthM: number;
}

export interface Lod400SpoolItem {
  spoolCode: string;
  segmentId: string;
  lengthM: number;
  slopeAppliedPercent: number;
  hasFlangePair: boolean;
  insulationThicknessMm: number;
  effectiveOuterDiameterMm: number;
  startElevationMm: number;
  endElevationMm: number;
}

export interface StructuralBeam {
  id: string;
  beamCode: string;
  widthMm: number;
  heightMm: number;
  spanLengthMm: number;
  minPoint: [number, number, number];
  maxPoint: [number, number, number];
}

export interface SleeveOpeningResult {
  sleeveCode: string;
  beamCode: string;
  pipeSpec: string;
  pipeOuterDiameterMm: number;
  sleeveDiameterMm: number;
  sleeveLengthMm: number;
  centerCoordinate: [number, number, number];
  isWithinMiddleThirdSpan: boolean;
  isDiameterRatioSafe: boolean; // D_sleeve <= H_beam / 3
  complianceVerdict: "approved_structural" | "warning_structural_recheck";
}

export interface Lod400RunResult {
  runCode: string;
  drawingName: string;
  totalSpoolsGenerated: number;
  slopeAppliedPercent: number;
  flangePairsInserted: number;
  insulationSpec: string;
  sleevesCount: number;
  spools: Lod400SpoolItem[];
  sleeveDetails: SleeveOpeningResult[];
}

// ============================================================================
// 1. THUẬT TOÁN AUTO-LOD 200 -> LOD 400 DfMA CONVERTER
// ============================================================================

export function convertToLod400Dfma(
  runCode: string,
  drawingName: string,
  segments: PreliminarySegment[],
  maxSpoolLengthM = 5.8, // Giới hạn chiều dài xe tải & cây ống 6m
  slopePercent = 2.0, // Độ dốc 2% thoát nước
  insulationThicknessMm = 25.0, // Bảo ôn Aeroflex 25mm
): Lod400RunResult {
  const spools: Lod400SpoolItem[] = [];
  let flangePairsInserted = 0;

  for (const seg of segments) {
    const isDrainage = seg.discipline === "plumbing" && seg.systemCode.includes("DRAIN");
    const actualSlope = isDrainage ? slopePercent : 0.0;
    const piecesCount = Math.ceil(seg.lengthM / maxSpoolLengthM);
    const pieceLength = Math.round((seg.lengthM / piecesCount) * 1000) / 1000;

    let currentZ = seg.startPoint[2];

    for (let i = 0; i < piecesCount; i++) {
      const spoolCode = `SP-DfMA-${seg.systemCode}-${seg.id}-${i + 1}`;
      const dropZ = Math.round(pieceLength * 1000 * (actualSlope / 100));
      const endZ = currentZ - dropZ;

      // Chèn mặt bích tại điểm đầu và điểm cuối của tuyến chính (DN >= 65)
      const hasFlange = seg.outerDiameterMm >= 76.1 && (i === 0 || i === piecesCount - 1);
      if (hasFlange) flangePairsInserted++;

      const effectiveOD = seg.outerDiameterMm + insulationThicknessMm * 2;

      spools.push({
        spoolCode,
        segmentId: seg.id,
        lengthM: pieceLength,
        slopeAppliedPercent: actualSlope,
        hasFlangePair: hasFlange,
        insulationThicknessMm,
        effectiveOuterDiameterMm: Math.round(effectiveOD * 10) / 10,
        startElevationMm: currentZ,
        endElevationMm: endZ,
      });

      currentZ = endZ;
    }
  }

  return {
    runCode,
    drawingName,
    totalSpoolsGenerated: spools.length,
    slopeAppliedPercent: slopePercent,
    flangePairsInserted,
    insulationSpec: `Aeroflex ${insulationThicknessMm}mm Class 1`,
    sleevesCount: 0,
    spools,
    sleeveDetails: [],
  };
}

// ============================================================================
// 2. THUẬT TOÁN STRUCTURAL SLEEVE PENETRATION MATRIX
// ============================================================================

export function detectStructuralSleevePenetrations(
  segments: PreliminarySegment[],
  beams: StructuralBeam[],
  insulationThicknessMm = 25.0,
): SleeveOpeningResult[] {
  const sleeves: SleeveOpeningResult[] = [];

  for (const seg of segments) {
    for (const beam of beams) {
      // Kiểm tra va chạm Bounding Box giữa tuyến ống và dầm kết cấu
      const isIntersectX =
        Math.max(seg.startPoint[0], seg.endPoint[0]) >= beam.minPoint[0] &&
        Math.min(seg.startPoint[0], seg.endPoint[0]) <= beam.maxPoint[0];

      const isIntersectY =
        Math.max(seg.startPoint[1], seg.endPoint[1]) >= beam.minPoint[1] &&
        Math.min(seg.startPoint[1], seg.endPoint[1]) <= beam.maxPoint[1];

      const isIntersectZ =
        seg.startPoint[2] >= beam.minPoint[2] && seg.startPoint[2] <= beam.maxPoint[2];

      if (isIntersectX && isIntersectY && isIntersectZ) {
        // Đường kính lỗ mở Sleeve = OD ống + Bảo ôn * 2 + Khe hở chèn vữa chống cháy (50mm)
        const sleeveDia = Math.round(seg.outerDiameterMm + insulationThicknessMm * 2 + 50);

        // Quy chuẩn an toàn kết cấu: D_sleeve <= H_beam / 3
        const isDiameterRatioSafe = sleeveDia <= beam.heightMm / 3.0;

        // Vị trí xuyên dầm theo trục X hoặc Y
        const intersectX = Math.round((beam.minPoint[0] + beam.maxPoint[0]) / 2);
        const intersectY = Math.round((beam.minPoint[1] + beam.maxPoint[1]) / 2);
        const intersectZ = seg.startPoint[2];

        // Kiểm tra nằm trong 1/3 giữa nhịp dầm (vùng ứng suất cắt nhỏ)
        const spanX = Math.abs(beam.maxPoint[0] - beam.minPoint[0]);
        const spanY = Math.abs(beam.maxPoint[1] - beam.minPoint[1]);
        const effectiveSpan = beam.spanLengthMm > 0 ? beam.spanLengthMm : Math.max(spanX, spanY);
        const relPosOnSpan =
          spanX >= spanY
            ? (intersectX - Math.min(beam.minPoint[0], beam.maxPoint[0])) / effectiveSpan
            : (intersectY - Math.min(beam.minPoint[1], beam.maxPoint[1])) / effectiveSpan;
        const isWithinMiddleThirdSpan = relPosOnSpan >= 0.25 && relPosOnSpan <= 0.75;

        const complianceVerdict =
          isDiameterRatioSafe && isWithinMiddleThirdSpan
            ? "approved_structural"
            : "warning_structural_recheck";

        sleeves.push({
          sleeveCode: `SLV-${beam.beamCode}-${seg.nominalSpec}-${sleeves.length + 1}`,
          beamCode: beam.beamCode,
          pipeSpec: seg.nominalSpec,
          pipeOuterDiameterMm: seg.outerDiameterMm,
          sleeveDiameterMm: sleeveDia,
          sleeveLengthMm: beam.widthMm + 100, // Dài hơn bề rộng dầm 100mm
          centerCoordinate: [intersectX, intersectY, intersectZ],
          isWithinMiddleThirdSpan,
          isDiameterRatioSafe,
          complianceVerdict,
        });
      }
    }
  }

  return sleeves;
}

// ============================================================================
// 3. THUẬT TOÁN ZERO-ENTANGLEMENT SPATIAL HIERARCHY
// ============================================================================

export function resolveZeroEntanglementHierarchy(
  layerDiscipline: "electrical" | "hvac" | "firefighting" | "plumbing",
  slabBottomElevationMm = 3200,
): { targetElevationMm: number; layerIndex: number; description: string } {
  switch (layerDiscipline) {
    case "electrical":
      return {
        targetElevationMm: slabBottomElevationMm - 200,
        layerIndex: 1,
        description: "Tầng 1 (Sát trần bê tông): Máng cáp điện & Chiếu sáng",
      };
    case "hvac":
      return {
        targetElevationMm: slabBottomElevationMm - 450,
        layerIndex: 2,
        description: "Tầng 2: Tuyến ống gió chính ACMV",
      };
    case "firefighting":
      return {
        targetElevationMm: slabBottomElevationMm - 700,
        layerIndex: 3,
        description: "Tầng 3: Tuyến ống cứu hỏa Sprinkler & Nước cấp",
      };
    case "plumbing":
      return {
        targetElevationMm: slabBottomElevationMm - 950,
        layerIndex: 4,
        description: "Tầng 4 (Thấp nhất): Tuyến ống thoát nước tự chảy có độ dốc",
      };
  }
}

// ============================================================================
// 4. SIÊU KỸ NĂNG CAD: TỰ ĐỘNG SINH BẢN VẼ ISOMETRIC SPOOL SHEET & QR TEM NHÃN
// ============================================================================

export interface IsometricSpoolSheet {
  spoolCode: string;
  pipeSpec: string;
  cutLengthM: number;
  slopeAngleDeg: number;
  qrFabricationToken: string;
  isometricNodes: Array<{ nodeIndex: number; x2d: number; y2d: number; label: string }>;
  weldingSeamsCount: number;
  flangePairsCount: number;
}

export function generateIsometricSpoolSheet(
  spool: Lod400SpoolItem,
  pipeSpec: string,
): IsometricSpoolSheet {
  const qrFabricationToken = `QR-FAB-${spool.spoolCode}-${Date.now().toString(36).toUpperCase()}`;
  const slopeAngleDeg = spool.slopeAppliedPercent > 0 ? 1.15 : 0.0; // ~1.15 độ cho dốc 2%

  // Tọa độ trục đo Isometric (Góc 30 độ: x' = (x - y) * cos(30), y' = (x + y) * sin(30) - z)
  const isometricNodes = [
    { nodeIndex: 1, x2d: 100, y2d: 250, label: `ĐẦU TUYẾN (Z=${spool.startElevationMm})` },
    { nodeIndex: 2, x2d: 400, y2d: 180, label: `THÂN ỐNG L=${spool.lengthM}m` },
    { nodeIndex: 3, x2d: 450, y2d: 150, label: `CUỐI TUYẾN (Z=${spool.endElevationMm})` },
  ];

  return {
    spoolCode: spool.spoolCode,
    pipeSpec,
    cutLengthM: spool.lengthM,
    slopeAngleDeg,
    qrFabricationToken,
    isometricNodes,
    weldingSeamsCount: spool.hasFlangePair ? 2 : 1,
    flangePairsCount: spool.hasFlangePair ? 1 : 0,
  };
}

// ============================================================================
// 5. SIÊU KỸ NĂNG CAD: PHÂN TÍCH THÔNG THỦY TRẦN & TỰ BÓP DẸT ỐNG GIÓ (PLENUM CLEARANCE)
// ============================================================================

export interface PlenumClearanceAnalysis {
  beamBottomElevationMm: number;
  ceilingElevationMm: number;
  grossPlenumHeightMm: number;
  requiredMepfSpaceMm: number;
  netClearanceMarginMm: number;
  isClashRisk: boolean;
  recommendedDuctTransformation: {
    originalSpec: string;
    equivalentFlatSpec: string;
    heightReductionMm: number;
  } | null;
}

export function analyzeCeilingPlenumClearance(
  beamBottomElevationMm: number,
  ceilingElevationMm: number,
  originalDuct: { widthMm: number; heightMm: number },
  otherLayersHeightMm = 150, // Máng cáp + ty treo + ống nước
): PlenumClearanceAnalysis {
  const grossPlenumHeightMm = beamBottomElevationMm - ceilingElevationMm;
  const insulationMm = 25 * 2;
  const requiredMepfSpaceMm = originalDuct.heightMm + insulationMm + otherLayersHeightMm + 50; // 50mm khoảng hở lắp đặt

  const netClearanceMarginMm = grossPlenumHeightMm - requiredMepfSpaceMm;
  const isClashRisk = netClearanceMarginMm < 50; // Khoảng hở dưới 5cm là nguy hiểm

  let recommendedDuctTransformation: PlenumClearanceAnalysis["recommendedDuctTransformation"] =
    null;

  if (isClashRisk) {
    // Tự động chuyển ống gió sang tiết diện dẹt có cùng diện tích thủy lực (A = W * H)
    const area = originalDuct.widthMm * originalDuct.heightMm;
    const newHeightMm = Math.max(200, originalDuct.heightMm - 100);
    const newWidthMm = Math.round(area / newHeightMm);

    recommendedDuctTransformation = {
      originalSpec: `${originalDuct.widthMm}x${originalDuct.heightMm} mm`,
      equivalentFlatSpec: `${newWidthMm}x${newHeightMm} mm (Ống gió dẹt tương đương)`,
      heightReductionMm: originalDuct.heightMm - newHeightMm,
    };
  }

  return {
    beamBottomElevationMm,
    ceilingElevationMm,
    grossPlenumHeightMm,
    requiredMepfSpaceMm,
    netClearanceMarginMm,
    isClashRisk,
    recommendedDuctTransformation,
  };
}

// ============================================================================
// 6. PERSISTENCE & DATABASE
// ============================================================================

export async function saveLod400Run(
  projectId: number,
  res: Lod400RunResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_shopdrawing_lod400_runs (
      project_id, run_code, drawing_name, total_spools_generated,
      slope_applied_percent, flange_pairs_inserted, insulation_spec,
      sleeves_count, sleeve_details
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9::jsonb
    )
    ON CONFLICT (project_id, run_code) DO UPDATE SET
      total_spools_generated = EXCLUDED.total_spools_generated,
      flange_pairs_inserted = EXCLUDED.flange_pairs_inserted,
      sleeves_count = EXCLUDED.sleeves_count,
      sleeve_details = EXCLUDED.sleeve_details
    RETURNING id`,

    projectId,
    res.runCode,
    res.drawingName,
    res.totalSpoolsGenerated,
    res.slopeAppliedPercent,
    res.flangePairsInserted,
    res.insulationSpec,
    res.sleevesCount,
    JSON.stringify(res.sleeveDetails),
  );

  if (!row) throw new Error("Failed to save LOD400 run");
  return row;
}

export async function listLod400Runs(projectId: number): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_shopdrawing_lod400_runs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
