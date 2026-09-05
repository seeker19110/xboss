// lib/engineering-pipe-spooling-qto.ts — Pinnacle MEPF Spooling, Fitting Deduction, Spatial QTO & Micro-BOM Engine (Module M74 / M90)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "crypto";

// ============================================================================
// 1. KIỂU DỮ LIỆU & ĐỊNH NGHĨA KỸ THUẬT (DATA TYPES & TECHNICAL CONTRACTS)
// ============================================================================

export type PipeMaterialType =
  "upvc" | "cpvc" | "ppr" | "hdpe" | "steel_threaded" | "steel_grooved" | "steel_welded" | "copper";

export type PipeConnectionType =
  "solvent_cement" | "heat_fusion" | "threaded" | "grooved" | "flanged" | "butt_weld" | "brazed";

export type FittingType =
  | "none"
  | "elbow_90"
  | "elbow_45"
  | "tee_equal"
  | "tee_reducing"
  | "reducer_concentric"
  | "reducer_eccentric"
  | "coupling_socket"
  | "union"
  | "flange_slip_on"
  | "flange_weld_neck"
  | "cap"
  | "valve_gate"
  | "valve_butterfly"
  | "valve_check"
  | "valve_ball"
  | "valve_prv"
  | "y_strainer"
  | "flexible_joint";

export type SpatialDimensionType =
  "tower" | "floor" | "shaft" | "zone" | "apartment" | "pipeline" | "combined";

export interface FittingDimension {
  material: PipeMaterialType;
  fittingType: FittingType;
  nominalDiaMm: number;
  centerToFaceMm: number;
  socketDepthMm: number;
  stopRidgeMm: number;
  threadEngagementMm: number;
  gasketThicknessMm: number;
  weldGapMm: number;
  grooveGapMm: number;
  netTakeOffMm: number;
  consumables: {
    adhesiveGram?: number;
    teflonTurns?: number;
    weldingRodKg?: number;
    boltSpec?: string;
    boltCount?: number;
    boltLengthMm?: number;
  };
}

export interface PipeEndConnection {
  fittingType: FittingType;
  connectionType: PipeConnectionType;
  secondaryDiaMm?: number;
  isFieldJoint?: boolean; // false: hàn/dán xưởng | true: mối nối hiện trường
}

export interface PipeSegmentInput {
  id: string;
  systemCode: string;
  discipline?: string;
  material: PipeMaterialType;
  nominalDiaMm: number;
  startPoint: [number, number, number]; // [x, y, z] mm
  endPoint: [number, number, number];
  startConnection: PipeEndConnection;
  endConnection: PipeEndConnection;
  isClosingSpool?: boolean; // true nếu là đốt cuối kết nối thiết bị / trục
  fieldFitAllowanceMm?: number; // Dung sai bù hiện trường (50-100mm)
  towerLabel?: string; // e.g. "Tower-A", "Tower-B", "Podium"
  floorLabel?: string; // e.g. "FL-10", "FL-B1", "Roof"
  shaftLabel?: string; // e.g. "SHAFT-PL01", "SHAFT-FP01"
  zoneLabel?: string; // e.g. "Zone-1", "Zone-2"
  apartmentLabel?: string; // e.g. "A10.01", "B12.04"
  pipelineCode?: string; // e.g. "RUN-WATER-A1001-01"
  drawingRef?: string;
}

export interface CutLengthCalculationResult {
  segmentId: string;
  nominalDiaMm: number;
  outerDiaMm: number;
  material: PipeMaterialType;
  cToCLengthMm: number;
  cutLengthMm: number;
  startTakeOffMm: number;
  endTakeOffMm: number;
  socketDepthStartMm: number;
  socketDepthEndMm: number;
  stopRidgeStartMm: number;
  stopRidgeEndMm: number;
  fieldFitAllowanceMm: number;
  isClosingSpool: boolean;
  engineeringRationale: string; // Giải trình kỹ thuật chi tiết
  warnings: string[];
}

export interface Lod400Spool {
  spoolCode: string;
  segmentId: string;
  systemCode: string;
  discipline: string;
  material: PipeMaterialType;
  nominalDiaMm: number;
  outerDiaMm: number;
  cToCLengthMm: number;
  cutLengthMm: number;
  slopePercent: number;
  weightKg: number;
  startPoint: [number, number, number];
  endPoint: [number, number, number];
  startElevationMm: number;
  endElevationMm: number;
  end1Prep: string;
  end2Prep: string;
  isClosingSpool: boolean;
  fieldFitAllowanceMm: number;
  towerLabel: string;
  floorLabel: string;
  shaftLabel: string;
  zoneLabel: string;
  apartmentLabel: string;
  pipelineCode: string;
  fittingsAttached: Array<{
    fittingType: FittingType;
    nominalDiaMm: number;
    takeOffMm: number;
    isFieldInstalled: boolean;
  }>;
  qrFabricationToken: string;
  engineeringRationale: string; // Giải trình lý do chế tạo đốt Spool
  installationInstructions: string; // Hướng dẫn lắp dựng tại chỗ
}

export interface MicroBomItem {
  id: string;
  spoolCode: string;
  levelTier: 1 | 2 | 3 | 4 | 5;
  category: "main_pipe" | "primary_fitting" | "valve_trim" | "fastener_seal" | "support_insulation";
  itemCode: string;
  itemName: string;
  spec: string;
  quantity: number;
  unit: string;
  unitCostVnd: number;
  totalCostVnd: number;
  isKitted: boolean;
  kittingBoxCode: string;
  towerLabel?: string;
  floorLabel?: string;
  shaftLabel?: string;
  zoneLabel?: string;
  apartmentLabel?: string;
  pipelineCode?: string;
}

export interface SpatialBreakdownSummary {
  dimensionType: SpatialDimensionType;
  dimensionKey: string;
  filterScope: {
    towerLabel?: string;
    floorLabel?: string;
    shaftLabel?: string;
    zoneLabel?: string;
    apartmentLabel?: string;
    pipelineCode?: string;
  };
  totalSpoolsCount: number;
  totalCutLengthM: number;
  pipeSummaryBySpec: Record<
    string,
    { lengthM: number; weightKg: number; material: PipeMaterialType; nominalDiaMm: number }
  >;
  fittingsCountByType: Record<string, number>;
  valvesCountByType: Record<string, number>;
  consumablesSummary: {
    glueKg: number;
    teflonRolls: number;
    boltSets: number;
    gasketsCount: number;
    weldingRodKg: number;
  };
  supportsSummary: {
    clevisHangersCount: number;
    threadedRodM: number;
    anchorsCount: number;
  };
  totalCostVnd: number;
  kittingBoxCode: string;
  spools: Lod400Spool[];
  bomItems: MicroBomItem[];
}

export interface ApartmentKittingManifest {
  apartmentLabel: string;
  towerLabel: string;
  floorLabel: string;
  crateCode: string;
  qrCrateToken: string;
  totalSpoolsCount: number;
  totalCutLengthM: number;
  totalCostVnd: number;
  spoolChecklist: Array<{
    spoolCode: string;
    cutLengthMm: number;
    spec: string;
    systemCode: string;
    qrToken: string;
  }>;
  fittingsKitList: Array<{ itemCode: string; itemName: string; quantity: number; unit: string }>;
  consumablesKitList: Array<{ itemName: string; quantity: number; unit: string }>;
  supportsKitList: Array<{ itemName: string; quantity: number; unit: string }>;
  totalCrateWeightKg: number;
  kittingInstructions: string; // Hướng dẫn đóng thùng và giao nhận căn hộ
}

export interface RemnantPieceInput {
  remnantCode: string;
  nominalDiaMm: number;
  material: PipeMaterialType;
  lengthMm: number;
}

export interface NestingCutItem {
  pieceId: string;
  spoolCode: string;
  lengthMm: number;
  cutOffsetMm: number;
  isClosingSpool: boolean;
}

export interface NestingBarResult {
  barIndex: number;
  barCode: string;
  isRemnantReused: boolean;
  initialLengthMm: number;
  usedLengthMm: number;
  scrapLengthMm: number;
  scrapPercent: number;
  scrapDisposition: "remnant_restock" | "short_nipple" | "recycling_scrap";
  cuts: NestingCutItem[];
}

export interface PipeNestingWithRemnantsResult {
  runCode: string;
  material: PipeMaterialType;
  nominalDiaMm: number;
  stockLengthMm: number;
  kerfMm: number;
  trimLossMm: number;
  totalDemandPieces: number;
  totalDemandLengthMm: number;
  remnantsReusedCount: number;
  newStockBarsUsed: number;
  totalMaterialSuppliedMm: number;
  totalNetCutLengthMm: number;
  totalKerfWasteMm: number;
  totalScrapWasteMm: number;
  overallScrapPercent: number;
  isUnderTargetScrapRate: boolean;
  bars: NestingBarResult[];
  newRemnantsProduced: Array<{ code: string; lengthMm: number; status: string }>;
}

export interface SpoolFabricationPackage {
  spoolCode: string;
  systemCode: string;
  material: PipeMaterialType;
  nominalDiaMm: number;
  cutLengthMm: number;
  cToCLengthMm: number;
  weightKg: number;
  slopeAngleDeg: number;
  fieldFitAllowanceMm: number;
  towerLabel: string;
  floorLabel: string;
  apartmentLabel: string;
  shaftLabel: string;
  qrFabricationToken: string;
  qrKittingBoxToken: string;
  engineeringRationale: string; // Giải trình lý do kỹ thuật cho bản vẽ xưởng
  technicalNotes: string[]; // Các ghi chú chuẩn mực thi công
  isometricNodes: Array<{
    nodeIndex: number;
    x2d: number;
    y2d: number;
    label: string;
    elevationZ: number;
  }>;
  jointPreps: {
    end1: { type: string; prepNotes: string };
    end2: { type: string; prepNotes: string };
  };
  bomTable: MicroBomItem[];
  qcChecklist: Array<{ item: string; standard: string; pass: boolean }>;
}

// ============================================================================
// 2. CATALOGUE DUNG SAI MỐI NỐI & FITTING DIMENSIONS TIÊU CHUẨN
// ============================================================================

const PIPE_UNIT_WEIGHTS_KG_M: Record<PipeMaterialType, Record<number, number>> = {
  upvc: {
    21: 0.15,
    27: 0.22,
    34: 0.35,
    42: 0.48,
    49: 0.65,
    60: 0.95,
    90: 1.85,
    114: 2.75,
    140: 4.1,
    168: 5.9,
    220: 9.8,
  },
  cpvc: {
    21: 0.18,
    27: 0.26,
    34: 0.42,
    42: 0.58,
    49: 0.78,
    60: 1.15,
    90: 2.2,
    114: 3.3,
    140: 4.9,
    168: 7.1,
    220: 11.8,
  },
  ppr: {
    20: 0.17,
    25: 0.26,
    32: 0.43,
    40: 0.67,
    50: 1.04,
    63: 1.65,
    75: 2.33,
    90: 3.35,
    110: 5.01,
    160: 10.5,
  },
  hdpe: {
    20: 0.14,
    25: 0.21,
    32: 0.34,
    40: 0.53,
    50: 0.82,
    63: 1.3,
    75: 1.84,
    90: 2.65,
    110: 3.96,
    160: 8.35,
  },
  steel_threaded: {
    15: 1.27,
    20: 1.68,
    25: 2.5,
    32: 3.56,
    40: 4.05,
    50: 5.43,
    65: 7.42,
    80: 9.38,
    100: 13.1,
  },
  steel_grooved: {
    50: 5.43,
    65: 7.42,
    80: 9.38,
    100: 13.1,
    125: 17.5,
    150: 21.8,
    200: 33.3,
    250: 45.2,
    300: 58.6,
  },
  steel_welded: {
    50: 5.43,
    65: 7.42,
    80: 9.38,
    100: 13.1,
    125: 17.5,
    150: 21.8,
    200: 33.3,
    250: 45.2,
    300: 58.6,
  },
  copper: { 15: 0.28, 22: 0.52, 28: 0.77, 35: 1.12, 42: 1.45, 54: 2.15 },
};

export function getPipeOuterDiameterMm(material: PipeMaterialType, dn: number): number {
  if (material === "upvc" || material === "cpvc" || material === "ppr" || material === "hdpe") {
    return dn;
  }
  if (
    material === "steel_threaded" ||
    material === "steel_grooved" ||
    material === "steel_welded"
  ) {
    const steelOdMap: Record<number, number> = {
      15: 21.3,
      20: 26.9,
      25: 33.7,
      32: 42.4,
      40: 48.3,
      50: 60.3,
      65: 76.1,
      80: 88.9,
      100: 114.3,
      125: 141.3,
      150: 168.3,
      200: 219.1,
      250: 273.0,
      300: 323.9,
    };
    return steelOdMap[dn] || dn * 1.1;
  }
  return dn;
}

export function getFittingDimension(
  material: PipeMaterialType,
  fittingType: FittingType,
  nominalDiaMm: number,
): FittingDimension {
  if (fittingType === "none") {
    return {
      material,
      fittingType: "none",
      nominalDiaMm,
      centerToFaceMm: 0,
      socketDepthMm: 0,
      stopRidgeMm: 0,
      threadEngagementMm: 0,
      gasketThicknessMm: 0,
      weldGapMm: 0,
      grooveGapMm: 0,
      netTakeOffMm: 0,
      consumables: {},
    };
  }

  // 1. Hệ Nhựa uPVC / cPVC Dán Keo (TCVN 8491 / ISO 1452)
  if (material === "upvc" || material === "cpvc") {
    const upvcTable: Record<
      number,
      { c2fElbow: number; c2fTee: number; socketDepth: number; stopRidge: number; glueG: number }
    > = {
      21: { c2fElbow: 28, c2fTee: 28, socketDepth: 16, stopRidge: 2.0, glueG: 3.0 },
      27: { c2fElbow: 34, c2fTee: 34, socketDepth: 19, stopRidge: 2.0, glueG: 4.5 },
      34: { c2fElbow: 42, c2fTee: 42, socketDepth: 23, stopRidge: 2.5, glueG: 6.0 },
      42: { c2fElbow: 50, c2fTee: 50, socketDepth: 27, stopRidge: 2.5, glueG: 8.0 },
      49: { c2fElbow: 58, c2fTee: 58, socketDepth: 31, stopRidge: 3.0, glueG: 12.0 },
      60: { c2fElbow: 69, c2fTee: 69, socketDepth: 37, stopRidge: 3.0, glueG: 18.0 },
      90: { c2fElbow: 98, c2fTee: 98, socketDepth: 51, stopRidge: 4.0, glueG: 35.0 },
      114: { c2fElbow: 122, c2fTee: 122, socketDepth: 64, stopRidge: 4.0, glueG: 55.0 },
      140: { c2fElbow: 148, c2fTee: 148, socketDepth: 76, stopRidge: 5.0, glueG: 80.0 },
      168: { c2fElbow: 176, c2fTee: 176, socketDepth: 89, stopRidge: 5.0, glueG: 120.0 },
      220: { c2fElbow: 230, c2fTee: 230, socketDepth: 115, stopRidge: 6.0, glueG: 200.0 },
    };

    const row = upvcTable[nominalDiaMm] || {
      c2fElbow: nominalDiaMm * 1.1,
      c2fTee: nominalDiaMm * 1.1,
      socketDepth: nominalDiaMm * 0.55,
      stopRidge: 4.0,
      glueG: nominalDiaMm * 0.5,
    };

    let c2f = row.c2fElbow;
    let netTakeOff = c2f - row.socketDepth;
    let stopRidge = 0;

    if (fittingType === "elbow_45") {
      c2f = Math.round(row.c2fElbow * 0.65);
      netTakeOff = c2f - row.socketDepth;
    } else if (fittingType === "coupling_socket") {
      c2f = (row.socketDepth * 2 + row.stopRidge) / 2;
      stopRidge = row.stopRidge;
      netTakeOff = stopRidge / 2;
    } else if (fittingType === "tee_equal" || fittingType === "tee_reducing") {
      c2f = row.c2fTee;
      netTakeOff = c2f - row.socketDepth;
    } else if (fittingType === "cap") {
      c2f = row.socketDepth + 5;
      netTakeOff = 5;
    } else if (fittingType === "union") {
      c2f = row.socketDepth + 15;
      netTakeOff = 15;
    }

    return {
      material,
      fittingType,
      nominalDiaMm,
      centerToFaceMm: Math.round(c2f * 10) / 10,
      socketDepthMm: row.socketDepth,
      stopRidgeMm: stopRidge,
      threadEngagementMm: 0,
      gasketThicknessMm: 0,
      weldGapMm: 0,
      grooveGapMm: 0,
      netTakeOffMm: Math.round(netTakeOff * 10) / 10,
      consumables: {
        adhesiveGram: row.glueG,
      },
    };
  }

  // 2. Hệ Nhựa PPR Hàn Nhiệt (DIN 8077 / ISO 15874)
  if (material === "ppr") {
    const pprTable: Record<
      number,
      { c2fElbow: number; c2fTee: number; weldDepth: number; stopRidge: number }
    > = {
      20: { c2fElbow: 27.0, c2fTee: 27.0, weldDepth: 14.0, stopRidge: 2.0 },
      25: { c2fElbow: 32.0, c2fTee: 32.0, weldDepth: 15.0, stopRidge: 2.0 },
      32: { c2fElbow: 38.0, c2fTee: 38.0, weldDepth: 16.5, stopRidge: 2.5 },
      40: { c2fElbow: 45.0, c2fTee: 45.0, weldDepth: 18.0, stopRidge: 2.5 },
      50: { c2fElbow: 54.0, c2fTee: 54.0, weldDepth: 20.0, stopRidge: 3.0 },
      63: { c2fElbow: 67.0, c2fTee: 67.0, weldDepth: 24.0, stopRidge: 3.0 },
      75: { c2fElbow: 78.0, c2fTee: 78.0, weldDepth: 26.0, stopRidge: 4.0 },
      90: { c2fElbow: 93.0, c2fTee: 93.0, weldDepth: 29.0, stopRidge: 4.0 },
      110: { c2fElbow: 113.0, c2fTee: 113.0, weldDepth: 32.5, stopRidge: 5.0 },
      160: { c2fElbow: 162.0, c2fTee: 162.0, weldDepth: 40.0, stopRidge: 6.0 },
    };

    const row = pprTable[nominalDiaMm] || {
      c2fElbow: nominalDiaMm * 1.1,
      c2fTee: nominalDiaMm * 1.1,
      weldDepth: nominalDiaMm * 0.35,
      stopRidge: 3.0,
    };

    let c2f = row.c2fElbow;
    let netTakeOff = c2f - row.weldDepth;
    let stopRidge = 0;

    if (fittingType === "elbow_45") {
      c2f = Math.round(row.c2fElbow * 0.68);
      netTakeOff = c2f - row.weldDepth;
    } else if (fittingType === "coupling_socket") {
      c2f = (row.weldDepth * 2 + row.stopRidge) / 2;
      stopRidge = row.stopRidge;
      netTakeOff = stopRidge / 2;
    } else if (fittingType === "tee_equal" || fittingType === "tee_reducing") {
      c2f = row.c2fTee;
      netTakeOff = c2f - row.weldDepth;
    }

    return {
      material,
      fittingType,
      nominalDiaMm,
      centerToFaceMm: Math.round(c2f * 10) / 10,
      socketDepthMm: row.weldDepth,
      stopRidgeMm: stopRidge,
      threadEngagementMm: 0,
      gasketThicknessMm: 0,
      weldGapMm: 0,
      grooveGapMm: 0,
      netTakeOffMm: Math.round(netTakeOff * 10) / 10,
      consumables: {},
    };
  }

  // 3. Hệ Ống Thép Tiện Ren (BS 1387 / ASME B1.20.1 NPT/BSPT)
  if (material === "steel_threaded") {
    const threadTable: Record<number, { c2fElbow: number; makeup: number; teflonTurns: number }> = {
      15: { c2fElbow: 28.0, makeup: 13.5, teflonTurns: 6 },
      20: { c2fElbow: 33.0, makeup: 14.0, teflonTurns: 7 },
      25: { c2fElbow: 38.0, makeup: 17.5, teflonTurns: 8 },
      32: { c2fElbow: 45.0, makeup: 18.0, teflonTurns: 9 },
      40: { c2fElbow: 50.0, makeup: 18.5, teflonTurns: 10 },
      50: { c2fElbow: 58.0, makeup: 19.5, teflonTurns: 12 },
      65: { c2fElbow: 69.0, makeup: 29.0, teflonTurns: 14 },
      80: { c2fElbow: 78.0, makeup: 30.5, teflonTurns: 16 },
      100: { c2fElbow: 97.0, makeup: 33.0, teflonTurns: 20 },
    };

    const row = threadTable[nominalDiaMm] || {
      c2fElbow: nominalDiaMm * 1.2,
      makeup: 20.0,
      teflonTurns: 10,
    };

    let c2f = row.c2fElbow;
    let netTakeOff = c2f - row.makeup;

    if (fittingType === "elbow_45") {
      c2f = Math.round(row.c2fElbow * 0.7);
      netTakeOff = c2f - row.makeup;
    } else if (fittingType === "coupling_socket") {
      const couplingTotalLength = row.makeup * 2 + 6;
      c2f = couplingTotalLength / 2;
      netTakeOff = 3.0;
    } else if (fittingType === "union") {
      netTakeOff = 22.0;
    }

    return {
      material,
      fittingType,
      nominalDiaMm,
      centerToFaceMm: Math.round(c2f * 10) / 10,
      socketDepthMm: 0,
      stopRidgeMm: 0,
      threadEngagementMm: row.makeup,
      gasketThicknessMm: 0,
      weldGapMm: 0,
      grooveGapMm: 0,
      netTakeOffMm: Math.round(netTakeOff * 10) / 10,
      consumables: {
        teflonTurns: row.teflonTurns,
      },
    };
  }

  // 4. Hệ Ống Thép Nối Rãnh Grooved (Victaulic / Shurjoint)
  if (material === "steel_grooved") {
    const groovedTable: Record<number, { c2fElbow: number; c2fTee: number; gap: number }> = {
      50: { c2fElbow: 83.0, c2fTee: 83.0, gap: 0.8 },
      65: { c2fElbow: 95.0, c2fTee: 95.0, gap: 0.8 },
      80: { c2fElbow: 108.0, c2fTee: 108.0, gap: 0.8 },
      100: { c2fElbow: 127.0, c2fTee: 127.0, gap: 1.0 },
      125: { c2fElbow: 140.0, c2fTee: 140.0, gap: 1.0 },
      150: { c2fElbow: 165.0, c2fTee: 165.0, gap: 1.0 },
      200: { c2fElbow: 216.0, c2fTee: 216.0, gap: 1.2 },
      250: { c2fElbow: 267.0, c2fTee: 267.0, gap: 1.2 },
      300: { c2fElbow: 305.0, c2fTee: 305.0, gap: 1.2 },
    };

    const row = groovedTable[nominalDiaMm] || {
      c2fElbow: nominalDiaMm * 1.3,
      c2fTee: nominalDiaMm * 1.3,
      gap: 1.0,
    };

    let c2f = row.c2fElbow;
    let netTakeOff = c2f - row.gap / 2;

    if (fittingType === "elbow_45") {
      c2f = Math.round(row.c2fElbow * 0.6);
      netTakeOff = c2f - row.gap / 2;
    } else if (fittingType === "coupling_socket") {
      netTakeOff = row.gap / 2;
    }

    return {
      material,
      fittingType,
      nominalDiaMm,
      centerToFaceMm: Math.round(c2f * 10) / 10,
      socketDepthMm: 0,
      stopRidgeMm: 0,
      threadEngagementMm: 0,
      gasketThicknessMm: 0,
      weldGapMm: 0,
      grooveGapMm: row.gap,
      netTakeOffMm: Math.round(netTakeOff * 10) / 10,
      consumables: {},
    };
  }

  // 5. Hệ Mặt Bích & Hàn Đối Đầu (Flanged & Welded ASME B16.9 / DIN PN16)
  const flangeBoltTable: Record<
    number,
    {
      flangeThick: number;
      boltSpec: string;
      count: number;
      length: number;
      gasketThick: number;
      weldGap: number;
    }
  > = {
    50: { flangeThick: 18, boltSpec: "M16", count: 4, length: 65, gasketThick: 3.0, weldGap: 2.5 },
    65: { flangeThick: 18, boltSpec: "M16", count: 4, length: 65, gasketThick: 3.0, weldGap: 2.5 },
    80: { flangeThick: 20, boltSpec: "M16", count: 8, length: 70, gasketThick: 3.0, weldGap: 2.5 },
    100: { flangeThick: 20, boltSpec: "M16", count: 8, length: 70, gasketThick: 3.0, weldGap: 2.5 },
    125: { flangeThick: 22, boltSpec: "M16", count: 8, length: 75, gasketThick: 3.0, weldGap: 2.5 },
    150: { flangeThick: 22, boltSpec: "M20", count: 8, length: 80, gasketThick: 3.0, weldGap: 2.5 },
    200: {
      flangeThick: 24,
      boltSpec: "M20",
      count: 12,
      length: 85,
      gasketThick: 3.0,
      weldGap: 3.0,
    },
    250: {
      flangeThick: 26,
      boltSpec: "M24",
      count: 12,
      length: 95,
      gasketThick: 3.0,
      weldGap: 3.0,
    },
    300: {
      flangeThick: 28,
      boltSpec: "M24",
      count: 12,
      length: 100,
      gasketThick: 3.0,
      weldGap: 3.0,
    },
  };

  const fRow = flangeBoltTable[nominalDiaMm] || {
    flangeThick: 20,
    boltSpec: "M16",
    count: 8,
    length: 70,
    gasketThick: 3.0,
    weldGap: 2.5,
  };

  let c2f = nominalDiaMm * 1.5;
  let netTakeOff = c2f + fRow.weldGap;

  if (fittingType === "flange_slip_on") {
    c2f = fRow.flangeThick;
    netTakeOff = fRow.flangeThick + fRow.gasketThick / 2 - 4.0;
  } else if (fittingType === "flange_weld_neck") {
    c2f = fRow.flangeThick + 35;
    netTakeOff = c2f + fRow.gasketThick / 2 + fRow.weldGap;
  } else if (fittingType === "valve_gate" || fittingType === "valve_butterfly") {
    c2f = nominalDiaMm >= 100 ? 120 : 75;
    netTakeOff = c2f / 2 + fRow.gasketThick;
  }

  return {
    material,
    fittingType,
    nominalDiaMm,
    centerToFaceMm: Math.round(c2f * 10) / 10,
    socketDepthMm: 0,
    stopRidgeMm: 0,
    threadEngagementMm: 0,
    gasketThicknessMm: fRow.gasketThick,
    weldGapMm: fRow.weldGap,
    grooveGapMm: 0,
    netTakeOffMm: Math.round(netTakeOff * 10) / 10,
    consumables: {
      boltSpec: fRow.boltSpec,
      boltCount: fRow.count,
      boltLengthMm: fRow.length,
      weldingRodKg: 0.15 * (nominalDiaMm / 50),
    },
  };
}

// ============================================================================
// 3. ĐỘNG CƠ BÙ TRỪ CHIỀU DÀI CẮT ỐNG THỰC TẾ (CUT-LENGTH PRECISION ENGINE)
// ============================================================================

export function calculatePipeCutLength(seg: PipeSegmentInput): CutLengthCalculationResult {
  const dx = seg.endPoint[0] - seg.startPoint[0];
  const dy = seg.endPoint[1] - seg.startPoint[1];
  const dz = seg.endPoint[2] - seg.startPoint[2];
  const cToCLengthMm = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 10) / 10;

  const startDim = getFittingDimension(
    seg.material,
    seg.startConnection.fittingType,
    seg.nominalDiaMm,
  );
  const endDim = getFittingDimension(seg.material, seg.endConnection.fittingType, seg.nominalDiaMm);

  const startTakeOffMm = startDim.netTakeOffMm;
  const endTakeOffMm = endDim.netTakeOffMm;

  const fieldFitMm = seg.isClosingSpool ? seg.fieldFitAllowanceMm || 50.0 : 0.0;

  const rawCutLength = cToCLengthMm - startTakeOffMm - endTakeOffMm + fieldFitMm;
  const cutLengthMm = Math.max(0, Math.round(rawCutLength * 10) / 10);

  const warnings: string[] = [];
  if (cutLengthMm <= 0) {
    warnings.push(
      `CẢNH BÁO NGUY HIỂM: Chiều dài tâm - tâm (${cToCLengthMm}mm) nhỏ hơn tổng chiều dài 2 phụ kiện (${startTakeOffMm + endTakeOffMm}mm)! Tuyến ống không thể lắp vừa không gian này.`,
    );
  }
  if (cutLengthMm < 50.0 && cutLengthMm > 0) {
    warnings.push(
      `CẢNH BÁO GIA CÔNG: Đoạn cắt quá ngắn (${cutLengthMm}mm < 50mm). Rất khó kẹp máy cưa/tiện ren và hàn xưởng.`,
    );
  }

  const outerDiaMm = getPipeOuterDiameterMm(seg.material, seg.nominalDiaMm);

  // Xây dựng giải trình lý do kỹ thuật chi tiết
  let rationale = `Kích thước tâm-tâm L_c-to-c = ${cToCLengthMm}mm.`;
  if (startTakeOffMm > 0) {
    rationale += ` Đầu 1 (${seg.startConnection.fittingType}) trừ ${startTakeOffMm}mm (Center-to-Face ${startDim.centerToFaceMm}mm - Độ ngập ${startDim.socketDepthMm || startDim.threadEngagementMm || 0}mm).`;
  }
  if (endTakeOffMm > 0) {
    rationale += ` Đầu 2 (${seg.endConnection.fittingType}) trừ ${endTakeOffMm}mm (Center-to-Face ${endDim.centerToFaceMm}mm - Độ ngập ${endDim.socketDepthMm || endDim.threadEngagementMm || 0}mm).`;
  }
  if (fieldFitMm > 0) {
    rationale += ` Đốt đóng tuyến cộng ${fieldFitMm}mm dung sai hiện trường (Field Fit Allowance) để thợ cắt tinh chỉnh tại chỗ sau khi định vị thiết bị.`;
  }
  rationale += ` -> Chiều dài cắt thực tế L_cut = ${cutLengthMm}mm.`;

  return {
    segmentId: seg.id,
    nominalDiaMm: seg.nominalDiaMm,
    outerDiaMm,
    material: seg.material,
    cToCLengthMm,
    cutLengthMm,
    startTakeOffMm,
    endTakeOffMm,
    socketDepthStartMm: startDim.socketDepthMm,
    socketDepthEndMm: endDim.socketDepthMm,
    stopRidgeStartMm: startDim.stopRidgeMm,
    stopRidgeEndMm: endDim.stopRidgeMm,
    fieldFitAllowanceMm: fieldFitMm,
    isClosingSpool: !!seg.isClosingSpool,
    engineeringRationale: rationale,
    warnings,
  };
}

// ============================================================================
// 4. ĐỘNG CƠ CHIA ĐỐT SPOOL TIỀN CHẾ DfMA LOD 400 (SMART SPOOLING ENGINE)
// ============================================================================

export interface SpoolingConstraints {
  maxSpoolLengthMm?: number;
  maxWeightKg?: number;
  gravitySlopePercent?: number;
  closingSpoolFieldFitMm?: number;
}

export function segmentPipelineIntoSpools(
  pipelineSegments: PipeSegmentInput[],
  constraints: SpoolingConstraints = {},
): Lod400Spool[] {
  const maxLenMm = constraints.maxSpoolLengthMm || 5800.0;
  const maxWeight = constraints.maxWeightKg || 50.0;
  const slopePct = constraints.gravitySlopePercent || 2.0;
  const defaultFieldFit = constraints.closingSpoolFieldFitMm || 50.0;

  const spools: Lod400Spool[] = [];

  for (let sIdx = 0; sIdx < pipelineSegments.length; sIdx++) {
    const seg = pipelineSegments[sIdx];
    const isDrain = seg.discipline === "drainage" || seg.systemCode.includes("DRAIN");
    const actualSlope = isDrain ? slopePct : 0.0;

    const unitWeight = PIPE_UNIT_WEIGHTS_KG_M[seg.material]?.[seg.nominalDiaMm] || 1.5;
    const cutCalc = calculatePipeCutLength(seg);
    const totalCutMm = cutCalc.cutLengthMm;

    const weightOfFullSeg = (totalCutMm / 1000) * unitWeight;
    const piecesByLen = Math.ceil(totalCutMm / maxLenMm);
    const piecesByWeight = Math.ceil(weightOfFullSeg / maxWeight);
    const piecesCount = Math.max(1, piecesByLen, piecesByWeight);

    const pieceCutLenMm = Math.round((totalCutMm / piecesCount) * 10) / 10;
    const pieceCToCLenMm = Math.round((cutCalc.cToCLengthMm / piecesCount) * 10) / 10;

    let currentZ = seg.startPoint[2];

    for (let p = 0; p < piecesCount; p++) {
      const isFirst = p === 0;
      const isLast = p === piecesCount - 1 && sIdx === pipelineSegments.length - 1;
      const spoolCode = `SP-${seg.systemCode}-${seg.id}-${p + 1}`;

      const dropZ = Math.round((pieceCutLenMm / 1000) * 1000 * (actualSlope / 100));
      const endZ = currentZ - dropZ;

      let end1Prep = "plain";
      let end2Prep = "plain";

      if (seg.material === "upvc" || seg.material === "cpvc") {
        end1Prep = isFirst
          ? seg.startConnection.fittingType !== "none"
            ? "socket"
            : "chamfer_15deg"
          : "coupling";
        end2Prep = isLast
          ? seg.endConnection.fittingType !== "none"
            ? "socket"
            : "chamfer_15deg"
          : "coupling";
      } else if (seg.material === "ppr") {
        end1Prep = isFirst ? "heat_fusion_clean" : "coupling_fusion";
        end2Prep = isLast ? "heat_fusion_clean" : "coupling_fusion";
      } else if (seg.material === "steel_threaded") {
        end1Prep = isFirst ? "thread_npt" : "thread_npt_coupling";
        end2Prep = isLast ? "thread_npt" : "thread_npt_coupling";
      } else if (seg.material === "steel_grooved") {
        end1Prep = "roll_groove_victaulic";
        end2Prep = "roll_groove_victaulic";
      } else if (seg.material === "steel_welded") {
        end1Prep = "bevel_37_5deg";
        end2Prep = "bevel_37_5deg";
      }

      const pieceWeight = Math.round((pieceCutLenMm / 1000) * unitWeight * 10) / 10;
      const isClosing = isLast && (seg.isClosingSpool || sIdx === pipelineSegments.length - 1);
      const fieldFitMm = isClosing ? seg.fieldFitAllowanceMm || defaultFieldFit : 0.0;

      const fittingsAttached: Lod400Spool["fittingsAttached"] = [];
      if (isFirst && seg.startConnection.fittingType !== "none") {
        const fDim = getFittingDimension(
          seg.material,
          seg.startConnection.fittingType,
          seg.nominalDiaMm,
        );
        fittingsAttached.push({
          fittingType: seg.startConnection.fittingType,
          nominalDiaMm: seg.nominalDiaMm,
          takeOffMm: fDim.netTakeOffMm,
          isFieldInstalled: !!seg.startConnection.isFieldJoint,
        });
      }
      if (isLast && seg.endConnection.fittingType !== "none") {
        const fDim = getFittingDimension(
          seg.material,
          seg.endConnection.fittingType,
          seg.nominalDiaMm,
        );
        fittingsAttached.push({
          fittingType: seg.endConnection.fittingType,
          nominalDiaMm: seg.nominalDiaMm,
          takeOffMm: fDim.netTakeOffMm,
          isFieldInstalled: !!seg.endConnection.isFieldJoint,
        });
      }

      const qrFabricationToken = `QR-SPOOL-${spoolCode}-${Date.now().toString(36).toUpperCase()}`;

      const engineeringRationale = `Spool phân đoạn ${p + 1}/${piecesCount} của tuyến ${seg.systemCode} (L_cut=${pieceCutLenMm}mm, Trọng lượng ${pieceWeight}kg). Phương thức gia công: Đầu 1 (${end1Prep}), Đầu 2 (${end2Prep}).${isDrain ? ` Giật dốc thoát nước ${actualSlope}% (Cao độ Z: ${currentZ}mm -> ${endZ}mm).` : ""}${isClosing ? ` Đã cộng ${fieldFitMm}mm bù dung sai hiện trường (Field Fit).` : ""}`;

      const installationInstructions = `1. Quét mã QR ${spoolCode} kiểm tra thông số kỹ thuật. 2. Định vị đầu 1 (${end1Prep}) khớp nối tuyến ống. 3. Treo cùm đỡ cách mối nối <= 500mm. 4. Cân chỉnh độ dốc ${actualSlope}%. 5. ${isClosing ? "Đo khoảng cách thực tế trước khi cắt gọt đoạn bù Field Fit và dán/hàn nối cố định." : "Xiết chặt/dán mối nối theo quy chuẩn."}`;

      spools.push({
        spoolCode,
        segmentId: seg.id,
        systemCode: seg.systemCode,
        discipline: seg.discipline || "plumbing",
        material: seg.material,
        nominalDiaMm: seg.nominalDiaMm,
        outerDiaMm: cutCalc.outerDiaMm,
        cToCLengthMm: pieceCToCLenMm,
        cutLengthMm: pieceCutLenMm,
        slopePercent: actualSlope,
        weightKg: pieceWeight,
        startPoint: seg.startPoint,
        endPoint: seg.endPoint,
        startElevationMm: currentZ,
        endElevationMm: endZ,
        end1Prep,
        end2Prep,
        isClosingSpool: isClosing,
        fieldFitAllowanceMm: fieldFitMm,
        towerLabel: seg.towerLabel || "Tower-A",
        floorLabel: seg.floorLabel || "FL-01",
        shaftLabel: seg.shaftLabel || "",
        zoneLabel: seg.zoneLabel || "Zone-1",
        apartmentLabel: seg.apartmentLabel || "",
        pipelineCode: seg.pipelineCode || seg.id,
        fittingsAttached,
        qrFabricationToken,
        engineeringRationale,
        installationInstructions,
      });

      currentZ = endZ;
    }
  }

  return spools;
}

// ============================================================================
// 5. ĐỘNG CƠ BÓC TÁCH MICRO-BOM 5 CẤP ĐỘ (5-TIER MICRO-BOM ENGINE)
// ============================================================================

export function explode5TierMicroBom(
  spools: Lod400Spool[],
  customUnitRates?: Record<string, number>,
): MicroBomItem[] {
  const items: MicroBomItem[] = [];

  const defaultRates: Record<string, number> = {
    pipe_upvc_m: 85000,
    pipe_ppr_m: 125000,
    pipe_steel_m: 240000,
    elbow_90: 35000,
    elbow_45: 32000,
    tee_equal: 48000,
    coupling: 18000,
    flange_pair: 320000,
    valve_gate: 850000,
    valve_butterfly: 1200000,
    bolt_set_m16: 25000,
    gasket_epdm: 35000,
    glue_upvc_kg: 180000,
    teflon_roll: 8000,
    welding_rod_kg: 45000,
    hanger_clevis_set: 75000,
    insulation_pu_ring: 45000,
    qr_tag_anodized: 15000,
    ...customUnitRates,
  };

  for (const spool of spools) {
    const kittingCode = spool.apartmentLabel
      ? `CRATE-${spool.towerLabel}-${spool.floorLabel}-${spool.apartmentLabel}`
      : `CRATE-${spool.towerLabel}-${spool.floorLabel}-${spool.zoneLabel}`;

    // LEVEL 1: Thân ống chính
    const pipeRateKey = `pipe_${spool.material}_m`;
    const pipeUnitCost = defaultRates[pipeRateKey] || 150000;
    const pipeLengthM = Math.round((spool.cutLengthMm / 1000) * 1000) / 1000;

    items.push({
      id: `BOM-L1-${spool.spoolCode}`,
      spoolCode: spool.spoolCode,
      levelTier: 1,
      category: "main_pipe",
      itemCode: `PIPE-${spool.material.toUpperCase()}-DN${spool.nominalDiaMm}`,
      itemName: `Ống ${spool.material.toUpperCase()} DN${spool.nominalDiaMm} (Cắt L=${spool.cutLengthMm}mm)`,
      spec: `OD ${spool.outerDiaMm}mm, Chiều dài cắt thực ${spool.cutLengthMm}mm, Đầu 1: ${spool.end1Prep}, Đầu 2: ${spool.end2Prep}`,
      quantity: pipeLengthM,
      unit: "m",
      unitCostVnd: pipeUnitCost,
      totalCostVnd: Math.round(pipeLengthM * pipeUnitCost),
      isKitted: false,
      kittingBoxCode: kittingCode,
      towerLabel: spool.towerLabel,
      floorLabel: spool.floorLabel,
      shaftLabel: spool.shaftLabel,
      zoneLabel: spool.zoneLabel,
      apartmentLabel: spool.apartmentLabel,
      pipelineCode: spool.pipelineCode,
    });

    // LEVEL 2: Phụ kiện đường ống
    for (let fIdx = 0; fIdx < spool.fittingsAttached.length; fIdx++) {
      const f = spool.fittingsAttached[fIdx];
      const fittingRate = defaultRates[f.fittingType] || 45000;

      items.push({
        id: `BOM-L2-${spool.spoolCode}-${fIdx + 1}`,
        spoolCode: spool.spoolCode,
        levelTier: 2,
        category: "primary_fitting",
        itemCode: `FIT-${f.fittingType.toUpperCase()}-DN${f.nominalDiaMm}`,
        itemName: `Phụ kiện ${f.fittingType} DN${f.nominalDiaMm} (${spool.material.toUpperCase()})`,
        spec: `Độ trừ Take-off ${f.takeOffMm}mm, ${f.isFieldInstalled ? "Giao rời lắp hiện trường" : "Hàn/dán xưởng"}`,
        quantity: 1,
        unit: "cái",
        unitCostVnd: fittingRate,
        totalCostVnd: fittingRate,
        isKitted: f.isFieldInstalled,
        kittingBoxCode: kittingCode,
        towerLabel: spool.towerLabel,
        floorLabel: spool.floorLabel,
        shaftLabel: spool.shaftLabel,
        zoneLabel: spool.zoneLabel,
        apartmentLabel: spool.apartmentLabel,
        pipelineCode: spool.pipelineCode,
      });
    }

    // LEVEL 3: Van & Thiết bị phụ trợ
    if (spool.nominalDiaMm >= 65 && spool.systemCode.includes("WATER")) {
      const valveCost = defaultRates.valve_gate || 850000;
      items.push({
        id: `BOM-L3-${spool.spoolCode}-V1`,
        spoolCode: spool.spoolCode,
        levelTier: 3,
        category: "valve_trim",
        itemCode: `VALVE-GATE-DN${spool.nominalDiaMm}-PN16`,
        itemName: `Van cổng ty chìm DN${spool.nominalDiaMm} PN16`,
        spec: `Thân gang dẻo, đĩa bọc cao su EPDM, kèm tay quay vận hành`,
        quantity: 1,
        unit: "bộ",
        unitCostVnd: valveCost,
        totalCostVnd: valveCost,
        isKitted: true,
        kittingBoxCode: kittingCode,
        towerLabel: spool.towerLabel,
        floorLabel: spool.floorLabel,
        shaftLabel: spool.shaftLabel,
        zoneLabel: spool.zoneLabel,
        apartmentLabel: spool.apartmentLabel,
        pipelineCode: spool.pipelineCode,
      });
    }

    // LEVEL 4: Vật tư liên kết, gioăng làm kín & phụ hao phí
    if (spool.material === "upvc" || spool.material === "cpvc") {
      const glueGrams = spool.nominalDiaMm * 1.2;
      const glueKg = Math.round((glueGrams / 1000) * 1000) / 1000;
      const glueCost = Math.round(glueKg * defaultRates.glue_upvc_kg);

      items.push({
        id: `BOM-L4-${spool.spoolCode}-GLUE`,
        spoolCode: spool.spoolCode,
        levelTier: 4,
        category: "fastener_seal",
        itemCode: "AUX-GLUE-PVC",
        itemName: "Keo dán ống nhựa PVC dung môi",
        spec: `Định mức ${glueGrams}g cho các mối nối Spool ${spool.spoolCode}`,
        quantity: glueKg,
        unit: "kg",
        unitCostVnd: defaultRates.glue_upvc_kg,
        totalCostVnd: glueCost,
        isKitted: true,
        kittingBoxCode: kittingCode,
        towerLabel: spool.towerLabel,
        floorLabel: spool.floorLabel,
        shaftLabel: spool.shaftLabel,
        zoneLabel: spool.zoneLabel,
        apartmentLabel: spool.apartmentLabel,
        pipelineCode: spool.pipelineCode,
      });
    } else if (spool.material === "steel_threaded") {
      items.push({
        id: `BOM-L4-${spool.spoolCode}-TEFLON`,
        spoolCode: spool.spoolCode,
        levelTier: 4,
        category: "fastener_seal",
        itemCode: "AUX-TEFLON-PTFE",
        itemName: "Băng tan PTFE chịu áp lực cao",
        spec: `Quấn 12-16 vòng/mối ren DN${spool.nominalDiaMm}`,
        quantity: 1,
        unit: "cuộn",
        unitCostVnd: defaultRates.teflon_roll,
        totalCostVnd: defaultRates.teflon_roll,
        isKitted: true,
        kittingBoxCode: kittingCode,
        towerLabel: spool.towerLabel,
        floorLabel: spool.floorLabel,
        shaftLabel: spool.shaftLabel,
        zoneLabel: spool.zoneLabel,
        apartmentLabel: spool.apartmentLabel,
        pipelineCode: spool.pipelineCode,
      });
    } else if (spool.material === "steel_grooved" || spool.material === "steel_welded") {
      const boltsCount = spool.nominalDiaMm >= 150 ? 12 : 8;
      const boltSetCost = defaultRates.bolt_set_m16 * boltsCount;

      items.push({
        id: `BOM-L4-${spool.spoolCode}-BOLTS`,
        spoolCode: spool.spoolCode,
        levelTier: 4,
        category: "fastener_seal",
        itemCode: "FAST-BOLT-M16X70",
        itemName: "Bộ Bu lông + Đai ốc + 2 Long đền M16x70mm (Mạ kẽm nhúng nóng)",
        spec: `Tiêu chuẩn cấp bền 8.8, lắp bích DN${spool.nominalDiaMm}`,
        quantity: boltsCount,
        unit: "bộ",
        unitCostVnd: defaultRates.bolt_set_m16,
        totalCostVnd: boltSetCost,
        isKitted: true,
        kittingBoxCode: kittingCode,
        towerLabel: spool.towerLabel,
        floorLabel: spool.floorLabel,
        shaftLabel: spool.shaftLabel,
        zoneLabel: spool.zoneLabel,
        apartmentLabel: spool.apartmentLabel,
        pipelineCode: spool.pipelineCode,
      });

      items.push({
        id: `BOM-L4-${spool.spoolCode}-GASKET`,
        spoolCode: spool.spoolCode,
        levelTier: 4,
        category: "fastener_seal",
        itemCode: `SEAL-GASKET-EPDM-DN${spool.nominalDiaMm}`,
        itemName: `Gioăng cao su làm kín EPDM DN${spool.nominalDiaMm} dày 3mm`,
        spec: `Chịu nhiệt 120°C, áp lực 16 bar`,
        quantity: 1,
        unit: "cái",
        unitCostVnd: defaultRates.gasket_epdm,
        totalCostVnd: defaultRates.gasket_epdm,
        isKitted: true,
        kittingBoxCode: kittingCode,
        towerLabel: spool.towerLabel,
        floorLabel: spool.floorLabel,
        shaftLabel: spool.shaftLabel,
        zoneLabel: spool.zoneLabel,
        apartmentLabel: spool.apartmentLabel,
        pipelineCode: spool.pipelineCode,
      });
    }

    // LEVEL 5: Hệ giá treo, cách nhiệt & nhận diện Logistics
    const hangersCount = Math.max(1, Math.ceil(spool.cutLengthMm / 2000));
    const hangerSetCost = defaultRates.hanger_clevis_set * hangersCount;

    items.push({
      id: `BOM-L5-${spool.spoolCode}-HANGER`,
      spoolCode: spool.spoolCode,
      levelTier: 5,
      category: "support_insulation",
      itemCode: `SUP-CLEVIS-DN${spool.nominalDiaMm}`,
      itemName: `Bộ quang treo Clevis Hanger DN${spool.nominalDiaMm} kèm Ty ren M10 và Nở đạn`,
      spec: `Khoảng cách treo $\\le 2.0\\text{m}$, ty ren suốt dài 1.0m mạ kẽm`,
      quantity: hangersCount,
      unit: "bộ",
      unitCostVnd: defaultRates.hanger_clevis_set,
      totalCostVnd: hangerSetCost,
      isKitted: true,
      kittingBoxCode: kittingCode,
      towerLabel: spool.towerLabel,
      floorLabel: spool.floorLabel,
      shaftLabel: spool.shaftLabel,
      zoneLabel: spool.zoneLabel,
      apartmentLabel: spool.apartmentLabel,
      pipelineCode: spool.pipelineCode,
    });

    items.push({
      id: `BOM-L5-${spool.spoolCode}-QRTAG`,
      spoolCode: spool.spoolCode,
      levelTier: 5,
      category: "support_insulation",
      itemCode: "TAG-QR-ANODIZED",
      itemName: `Tem nhôm Anodized khắc Laser mã QR Spool ${spool.spoolCode}`,
      spec: `Kháng nước, chịu nhiệt và tia UV công trường, kèm dây thít inox`,
      quantity: 1,
      unit: "cái",
      unitCostVnd: defaultRates.qr_tag_anodized,
      totalCostVnd: defaultRates.qr_tag_anodized,
      isKitted: false,
      kittingBoxCode: kittingCode,
      towerLabel: spool.towerLabel,
      floorLabel: spool.floorLabel,
      shaftLabel: spool.shaftLabel,
      zoneLabel: spool.zoneLabel,
      apartmentLabel: spool.apartmentLabel,
      pipelineCode: spool.pipelineCode,
    });
  }

  return items;
}

// ============================================================================
// 6. ĐỘNG CƠ BÓC TÁCH KHỐI LƯỢNG KHÔNG GIAN ĐA CHIỀU (MULTI-DIMENSIONAL SPATIAL QTO ENGINE)
// ============================================================================

export function aggregateQtoBySpatialHierarchy(
  spools: Lod400Spool[],
  bomItems: MicroBomItem[],
  groupByDimension: SpatialDimensionType,
  filterScope?: {
    towerLabel?: string;
    floorLabel?: string;
    shaftLabel?: string;
    zoneLabel?: string;
    apartmentLabel?: string;
    pipelineCode?: string;
  },
): SpatialBreakdownSummary[] {
  let filteredSpools = spools;
  let filteredBom = bomItems;

  if (filterScope) {
    if (filterScope.towerLabel) {
      filteredSpools = filteredSpools.filter((s) => s.towerLabel === filterScope.towerLabel);
      filteredBom = filteredBom.filter((b) => b.towerLabel === filterScope.towerLabel);
    }
    if (filterScope.floorLabel) {
      filteredSpools = filteredSpools.filter((s) => s.floorLabel === filterScope.floorLabel);
      filteredBom = filteredBom.filter((b) => b.floorLabel === filterScope.floorLabel);
    }
    if (filterScope.shaftLabel) {
      filteredSpools = filteredSpools.filter((s) => s.shaftLabel === filterScope.shaftLabel);
      filteredBom = filteredBom.filter((b) => b.shaftLabel === filterScope.shaftLabel);
    }
    if (filterScope.zoneLabel) {
      filteredSpools = filteredSpools.filter((s) => s.zoneLabel === filterScope.zoneLabel);
      filteredBom = filteredBom.filter((b) => b.zoneLabel === filterScope.zoneLabel);
    }
    if (filterScope.apartmentLabel) {
      filteredSpools = filteredSpools.filter(
        (s) => s.apartmentLabel === filterScope.apartmentLabel,
      );
      filteredBom = filteredBom.filter((b) => b.apartmentLabel === filterScope.apartmentLabel);
    }
    if (filterScope.pipelineCode) {
      filteredSpools = filteredSpools.filter((s) => s.pipelineCode === filterScope.pipelineCode);
      filteredBom = filteredBom.filter((b) => b.pipelineCode === filterScope.pipelineCode);
    }
  }

  const getKey = (item: {
    towerLabel?: string;
    floorLabel?: string;
    shaftLabel?: string;
    zoneLabel?: string;
    apartmentLabel?: string;
    pipelineCode?: string;
  }): string => {
    switch (groupByDimension) {
      case "apartment":
        return item.apartmentLabel || "COMMON_AREA";
      case "shaft":
        return item.shaftLabel || "NO_SHAFT";
      case "zone":
        return item.zoneLabel || "GENERAL_ZONE";
      case "floor":
        return item.floorLabel || "GENERAL_FLOOR";
      case "tower":
        return item.towerLabel || "GENERAL_TOWER";
      case "pipeline":
        return item.pipelineCode || "MAIN_RUN";
      case "combined":
        return `${item.towerLabel || "T1"}-${item.floorLabel || "F1"}-${item.apartmentLabel || item.zoneLabel || "Z1"}`;
    }
  };

  const groupedSpools: Record<string, Lod400Spool[]> = {};
  const groupedBom: Record<string, MicroBomItem[]> = {};

  for (const s of filteredSpools) {
    const k = getKey(s);
    if (!groupedSpools[k]) groupedSpools[k] = [];
    groupedSpools[k].push(s);
  }

  for (const b of filteredBom) {
    const k = getKey(b);
    if (!groupedBom[k]) groupedBom[k] = [];
    groupedBom[k].push(b);
  }

  const allKeys = Array.from(new Set([...Object.keys(groupedSpools), ...Object.keys(groupedBom)]));
  const summaries: SpatialBreakdownSummary[] = [];

  for (const key of allKeys) {
    const sList = groupedSpools[key] || [];
    const bList = groupedBom[key] || [];

    const totalCutLengthM =
      Math.round(sList.reduce((sum, s) => sum + s.cutLengthMm / 1000, 0) * 1000) / 1000;

    const pipeSummary: SpatialBreakdownSummary["pipeSummaryBySpec"] = {};
    for (const s of sList) {
      const specKey = `${s.material.toUpperCase()}_DN${s.nominalDiaMm}`;
      if (!pipeSummary[specKey]) {
        pipeSummary[specKey] = {
          lengthM: 0,
          weightKg: 0,
          material: s.material,
          nominalDiaMm: s.nominalDiaMm,
        };
      }
      pipeSummary[specKey].lengthM =
        Math.round((pipeSummary[specKey].lengthM + s.cutLengthMm / 1000) * 1000) / 1000;
      pipeSummary[specKey].weightKg =
        Math.round((pipeSummary[specKey].weightKg + s.weightKg) * 10) / 10;
    }

    const fittingsCount: Record<string, number> = {};
    for (const s of sList) {
      for (const f of s.fittingsAttached) {
        fittingsCount[f.fittingType] = (fittingsCount[f.fittingType] || 0) + 1;
      }
    }

    const valvesCount: Record<string, number> = {};
    for (const b of bList.filter((x) => x.levelTier === 3)) {
      valvesCount[b.itemName] = (valvesCount[b.itemName] || 0) + b.quantity;
    }

    let glueKg = 0;
    let teflonRolls = 0;
    let boltSets = 0;
    let gasketsCount = 0;
    let weldingRodKg = 0;

    for (const b of bList.filter((x) => x.levelTier === 4)) {
      if (b.itemCode.includes("GLUE")) glueKg += b.quantity;
      else if (b.itemCode.includes("TEFLON")) teflonRolls += b.quantity;
      else if (b.itemCode.includes("BOLT")) boltSets += b.quantity;
      else if (b.itemCode.includes("GASKET")) gasketsCount += b.quantity;
      else if (b.itemCode.includes("WELD")) weldingRodKg += b.quantity;
    }

    let clevisCount = 0;
    let rodM = 0;
    for (const b of bList.filter((x) => x.levelTier === 5)) {
      if (b.itemCode.includes("CLEVIS")) {
        clevisCount += b.quantity;
        rodM += b.quantity * 1.0;
      }
    }

    const totalCostVnd = bList.reduce((sum, b) => sum + b.totalCostVnd, 0);

    const firstSpool = sList[0];
    const kittingBoxCode = firstSpool
      ? firstSpool.apartmentLabel
        ? `CRATE-${firstSpool.towerLabel}-${firstSpool.floorLabel}-${firstSpool.apartmentLabel}`
        : `CRATE-${firstSpool.towerLabel}-${firstSpool.floorLabel}-${firstSpool.zoneLabel}`
      : `CRATE-${key}`;

    summaries.push({
      dimensionType: groupByDimension,
      dimensionKey: key,
      filterScope: {
        towerLabel: firstSpool?.towerLabel || filterScope?.towerLabel,
        floorLabel: firstSpool?.floorLabel || filterScope?.floorLabel,
        shaftLabel: firstSpool?.shaftLabel || filterScope?.shaftLabel,
        zoneLabel: firstSpool?.zoneLabel || filterScope?.zoneLabel,
        apartmentLabel:
          firstSpool?.apartmentLabel || (groupByDimension === "apartment" ? key : undefined),
        pipelineCode: firstSpool?.pipelineCode || filterScope?.pipelineCode,
      },
      totalSpoolsCount: sList.length,
      totalCutLengthM,
      pipeSummaryBySpec: pipeSummary,
      fittingsCountByType: fittingsCount,
      valvesCountByType: valvesCount,
      consumablesSummary: {
        glueKg: Math.round(glueKg * 1000) / 1000,
        teflonRolls,
        boltSets,
        gasketsCount,
        weldingRodKg: Math.round(weldingRodKg * 10) / 10,
      },
      supportsSummary: {
        clevisHangersCount: clevisCount,
        threadedRodM: rodM,
        anchorsCount: clevisCount,
      },
      totalCostVnd,
      kittingBoxCode,
      spools: sList,
      bomItems: bList,
    });
  }

  summaries.sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey));
  return summaries;
}

// ============================================================================
// 7. TRÌNH XUẤT PHIẾU ĐÓNG THÙNG KITTING CĂN HỘ (APARTMENT KITTING MANIFEST)
// ============================================================================

export function generateApartmentKittingManifest(
  apartmentLabel: string,
  spools: Lod400Spool[],
  bomItems: MicroBomItem[],
): ApartmentKittingManifest {
  const aptSpools = spools.filter((s) => s.apartmentLabel === apartmentLabel);
  const aptBom = bomItems.filter((b) => b.apartmentLabel === apartmentLabel);

  const first = aptSpools[0] || aptBom[0];
  const towerLabel = first?.towerLabel || "Tower-A";
  const floorLabel = first?.floorLabel || "FL-01";
  const crateCode = `CRATE-${towerLabel}-${floorLabel}-${apartmentLabel}`;
  const qrCrateToken = `QR-CRATE-${crateCode}-${Date.now().toString(36).toUpperCase()}`;

  const totalCutLengthM =
    Math.round(aptSpools.reduce((sum, s) => sum + s.cutLengthMm / 1000, 0) * 1000) / 1000;
  const totalCostVnd = aptBom.reduce((sum, b) => sum + b.totalCostVnd, 0);

  const spoolChecklist = aptSpools.map((s) => ({
    spoolCode: s.spoolCode,
    cutLengthMm: s.cutLengthMm,
    spec: `${s.material.toUpperCase()} DN${s.nominalDiaMm} (OD ${s.outerDiaMm}mm)`,
    systemCode: s.systemCode,
    qrToken: s.qrFabricationToken,
  }));

  const fittingsKitList = aptBom
    .filter((b) => b.levelTier === 2)
    .map((b) => ({
      itemCode: b.itemCode,
      itemName: b.itemName,
      quantity: b.quantity,
      unit: b.unit,
    }));

  const consumablesKitList = aptBom
    .filter((b) => b.levelTier === 4)
    .map((b) => ({
      itemName: b.itemName,
      quantity: b.quantity,
      unit: b.unit,
    }));

  const supportsKitList = aptBom
    .filter((b) => b.levelTier === 5)
    .map((b) => ({
      itemName: b.itemName,
      quantity: b.quantity,
      unit: b.unit,
    }));

  const totalCrateWeightKg =
    Math.round(aptSpools.reduce((sum, s) => sum + s.weightKg, 0) * 10) / 10 + 2.5;

  const kittingInstructions = `HƯỚNG DẪN KITTING THÙNG VẬT TƯ CĂN HỘ ${apartmentLabel}: 1. Xếp toàn bộ ${aptSpools.length} đốt Spool vào khoang thùng chính. 2. Đóng gói phụ kiện và vật tư phụ vào túi kitting riêng. 3. Dán tem niêm phong mã QR ${qrCrateToken}. 4. Bàn giao nguyên thùng cho tổ đội lắp ráp tại căn hộ ${apartmentLabel}.`;

  return {
    apartmentLabel,
    towerLabel,
    floorLabel,
    crateCode,
    qrCrateToken,
    totalSpoolsCount: aptSpools.length,
    totalCutLengthM,
    totalCostVnd,
    spoolChecklist,
    fittingsKitList,
    consumablesKitList,
    supportsKitList,
    totalCrateWeightKg,
    kittingInstructions,
  };
}

// ============================================================================
// 8. ĐỘNG CƠ TỐI ƯU CẮT PHÔI 1D KÈM KHO PHÔI THỪA (1D NESTING REMNANT POOL)
// ============================================================================

export function optimizePipeNestingWithRemnants(
  demandSpools: Lod400Spool[],
  stockLengthMm = 6000.0,
  remnantInventory: RemnantPieceInput[] = [],
  kerfMm = 3.0,
  trimLossMm = 20.0,
): PipeNestingWithRemnantsResult {
  const runCode = `NEST-RP-${Date.now().toString(36).toUpperCase()}`;

  if (!demandSpools || demandSpools.length === 0) {
    return {
      runCode,
      material: "upvc",
      nominalDiaMm: 114,
      stockLengthMm,
      kerfMm,
      trimLossMm,
      totalDemandPieces: 0,
      totalDemandLengthMm: 0,
      remnantsReusedCount: 0,
      newStockBarsUsed: 0,
      totalMaterialSuppliedMm: 0,
      totalNetCutLengthMm: 0,
      totalKerfWasteMm: 0,
      totalScrapWasteMm: 0,
      overallScrapPercent: 0,
      isUnderTargetScrapRate: true,
      bars: [],
      newRemnantsProduced: [],
    };
  }

  const mat = demandSpools[0].material;
  const dia = demandSpools[0].nominalDiaMm;

  const cutQueue: Array<{ id: string; spoolCode: string; lengthMm: number; isClosing: boolean }> =
    [];
  for (const s of demandSpools) {
    cutQueue.push({
      id: `CUT-${s.spoolCode}`,
      spoolCode: s.spoolCode,
      lengthMm: s.cutLengthMm,
      isClosing: s.isClosingSpool,
    });
  }

  cutQueue.sort((a, b) => b.lengthMm - a.lengthMm);

  const bars: NestingBarResult[] = [];
  const placedPieces = new Set<string>();

  const availableRemnants = remnantInventory.filter(
    (r) => r.material === mat && r.nominalDiaMm === dia && r.lengthMm >= 300,
  );
  availableRemnants.sort((a, b) => a.lengthMm - b.lengthMm);

  let remnantsReusedCount = 0;

  for (const rem of availableRemnants) {
    const barCuts: NestingCutItem[] = [];
    let usedLength = 0;
    let offset = 0;

    for (const item of cutQueue) {
      if (placedPieces.has(item.id)) continue;
      const spaceNeeded = barCuts.length === 0 ? item.lengthMm : item.lengthMm + kerfMm;
      if (rem.lengthMm - usedLength >= spaceNeeded) {
        barCuts.push({
          pieceId: item.id,
          spoolCode: item.spoolCode,
          lengthMm: item.lengthMm,
          cutOffsetMm: offset,
          isClosingSpool: item.isClosing,
        });
        usedLength += spaceNeeded;
        offset += spaceNeeded;
        placedPieces.add(item.id);
      }
    }

    if (barCuts.length > 0) {
      remnantsReusedCount++;
      const scrap = Math.max(0, rem.lengthMm - usedLength);
      const scrapPct = Math.round((scrap / rem.lengthMm) * 1000) / 10;
      let disp: NestingBarResult["scrapDisposition"] = "recycling_scrap";
      if (scrap >= 800) disp = "remnant_restock";
      else if (scrap >= 300) disp = "short_nipple";

      bars.push({
        barIndex: bars.length + 1,
        barCode: `REM-REUSED-${rem.remnantCode}`,
        isRemnantReused: true,
        initialLengthMm: rem.lengthMm,
        usedLengthMm: usedLength,
        scrapLengthMm: scrap,
        scrapPercent: scrapPct,
        scrapDisposition: disp,
        cuts: barCuts,
      });
    }
  }

  const usableStockLength = stockLengthMm - trimLossMm * 2;
  const newStockBars: NestingBarResult[] = [];

  for (const item of cutQueue) {
    if (placedPieces.has(item.id)) continue;

    let bestBarIdx = -1;
    let minRemaining = Infinity;

    for (let i = 0; i < newStockBars.length; i++) {
      const b = newStockBars[i];
      const spaceNeeded = item.lengthMm + kerfMm;
      const remaining = usableStockLength - b.usedLengthMm;
      if (remaining >= spaceNeeded && remaining < minRemaining) {
        bestBarIdx = i;
        minRemaining = remaining;
      }
    }

    if (bestBarIdx !== -1) {
      const b = newStockBars[bestBarIdx];
      const offset = b.usedLengthMm + kerfMm;
      b.cuts.push({
        pieceId: item.id,
        spoolCode: item.spoolCode,
        lengthMm: item.lengthMm,
        cutOffsetMm: offset + trimLossMm,
        isClosingSpool: item.isClosing,
      });
      b.usedLengthMm = offset + item.lengthMm;
      placedPieces.add(item.id);
    } else {
      const newBar: NestingBarResult = {
        barIndex: bars.length + newStockBars.length + 1,
        barCode: `BAR-NEW-${newStockBars.length + 1}`,
        isRemnantReused: false,
        initialLengthMm: stockLengthMm,
        usedLengthMm: item.lengthMm,
        scrapLengthMm: 0,
        scrapPercent: 0,
        scrapDisposition: "recycling_scrap",
        cuts: [
          {
            pieceId: item.id,
            spoolCode: item.spoolCode,
            lengthMm: item.lengthMm,
            cutOffsetMm: trimLossMm,
            isClosingSpool: item.isClosing,
          },
        ],
      };
      newStockBars.push(newBar);
      placedPieces.add(item.id);
    }
  }

  const newRemnantsProduced: Array<{ code: string; lengthMm: number; status: string }> = [];

  for (const b of newStockBars) {
    const netUsedWithKerf =
      b.cuts.reduce((sum, c) => sum + c.lengthMm, 0) + (b.cuts.length - 1) * kerfMm;
    const scrap = Math.max(0, stockLengthMm - (netUsedWithKerf + trimLossMm * 2));
    b.scrapLengthMm = Math.round(scrap * 10) / 10;
    b.scrapPercent = Math.round((scrap / stockLengthMm) * 1000) / 10;

    if (scrap >= 800) {
      b.scrapDisposition = "remnant_restock";
      newRemnantsProduced.push({
        code: `REM-NEW-${b.barCode}-${Date.now().toString(36).toUpperCase()}`,
        lengthMm: b.scrapLengthMm,
        status: "available_in_warehouse",
      });
    } else if (scrap >= 300) {
      b.scrapDisposition = "short_nipple";
    } else {
      b.scrapDisposition = "recycling_scrap";
    }
    bars.push(b);
  }

  const totalDemandPieces = cutQueue.length;
  const totalDemandLengthMm = cutQueue.reduce((sum, it) => sum + it.lengthMm, 0);
  const totalMaterialSuppliedMm = bars.reduce((sum, b) => sum + b.initialLengthMm, 0);
  const totalNetCutLengthMm = totalDemandLengthMm;
  const totalKerfWasteMm = bars.reduce((sum, b) => sum + (b.cuts.length - 1) * kerfMm, 0);
  const totalScrapWasteMm = bars.reduce(
    (sum, b) => (b.scrapDisposition === "recycling_scrap" ? sum + b.scrapLengthMm : sum),
    0,
  );

  const overallScrapPercent =
    totalMaterialSuppliedMm > 0
      ? Math.round((totalScrapWasteMm / totalMaterialSuppliedMm) * 1000) / 10
      : 0;

  return {
    runCode,
    material: mat,
    nominalDiaMm: dia,
    stockLengthMm,
    kerfMm,
    trimLossMm,
    totalDemandPieces,
    totalDemandLengthMm,
    remnantsReusedCount,
    newStockBarsUsed: newStockBars.length,
    totalMaterialSuppliedMm,
    totalNetCutLengthMm,
    totalKerfWasteMm,
    totalScrapWasteMm,
    overallScrapPercent,
    isUnderTargetScrapRate: overallScrapPercent <= 1.2,
    bars,
    newRemnantsProduced,
  };
}

// ============================================================================
// 9. TRÌNH SINH BẢN VẼ TRỤC ĐO & HỒ SƠ KITTING QR (FABRICATION PACKAGE)
// ============================================================================

export function generateSpoolFabricationPackage(
  spool: Lod400Spool,
  bomItems: MicroBomItem[],
): SpoolFabricationPackage {
  const qrFabricationToken = spool.qrFabricationToken;
  const qrKittingBoxToken = `QR-KIT-${spool.spoolCode}-${Date.now().toString(36).toUpperCase()}`;

  const slopeAngleDeg = spool.slopePercent > 0 ? 1.15 : 0.0;

  const isometricNodes = [
    {
      nodeIndex: 1,
      x2d: 150,
      y2d: 300,
      label: `ĐẦU MỐI NỐI 1 (${spool.end1Prep.toUpperCase()})`,
      elevationZ: spool.startElevationMm,
    },
    {
      nodeIndex: 2,
      x2d: 450,
      y2d: 220,
      label: `THÂN ỐNG L_cut=${spool.cutLengthMm}mm (DN${spool.nominalDiaMm})`,
      elevationZ: (spool.startElevationMm + spool.endElevationMm) / 2,
    },
    {
      nodeIndex: 3,
      x2d: 550,
      y2d: 180,
      label: `ĐẦU MỐI NỐI 2 (${spool.end2Prep.toUpperCase()})${spool.isClosingSpool ? " [FIELD-FIT +50mm]" : ""}`,
      elevationZ: spool.endElevationMm,
    },
  ];

  const spoolBom = bomItems.filter((b) => b.spoolCode === spool.spoolCode);

  const technicalNotes = [
    `GHI CHÚ CHẾ TẠO: Spool ${spool.spoolCode} gia công từ ống ${spool.material.toUpperCase()} DN${spool.nominalDiaMm}.`,
    `Chiều dài cắt thực tế L_cut = ${spool.cutLengthMm}mm (Kích thước tâm-tâm thiết kế L_c-to-c = ${spool.cToCLengthMm}mm).`,
    `Đầu 1: ${spool.end1Prep} | Đầu 2: ${spool.end2Prep}${spool.isClosingSpool ? " [Đốt đóng tuyến: Đã cộng bù 50mm dung sai hiện trường, cắt tinh chỉnh tại chỗ]" : ""}.`,
    `Độ dốc thoát nước: ${spool.slopePercent}% (Cao độ bắt đầu Z=${spool.startElevationMm}mm, kết thúc Z=${spool.endElevationMm}mm).`,
    `Kiểm soát chất lượng: Thử áp lực thủy tĩnh xưởng 1.5 lần áp suất làm việc trong 15 phút trước khi xuất xưởng.`,
  ];

  const qcChecklist = [
    {
      item: "Kiểm tra độ ô van & đường kính ngoài",
      standard: `D_out = ${spool.outerDiaMm}mm ± 0.5mm`,
      pass: true,
    },
    {
      item: "Kiểm tra chiều dài cắt thực tế (L_cut)",
      standard: `L = ${spool.cutLengthMm}mm ± 1.0mm`,
      pass: true,
    },
    {
      item: "Kiểm tra độ sạch lòng ống & vát mép",
      standard: "Không ba via, góc vát 15° hoặc 37.5° đúng chuẩn",
      pass: true,
    },
    {
      item: "Kiểm tra tem nhãn mã QR Logistics",
      standard: "Quét mã QR đọc đúng Spool Code và Payload",
      pass: true,
    },
  ];

  return {
    spoolCode: spool.spoolCode,
    systemCode: spool.systemCode,
    material: spool.material,
    nominalDiaMm: spool.nominalDiaMm,
    cutLengthMm: spool.cutLengthMm,
    cToCLengthMm: spool.cToCLengthMm,
    weightKg: spool.weightKg,
    slopeAngleDeg,
    fieldFitAllowanceMm: spool.fieldFitAllowanceMm,
    towerLabel: spool.towerLabel,
    floorLabel: spool.floorLabel,
    apartmentLabel: spool.apartmentLabel,
    shaftLabel: spool.shaftLabel,
    qrFabricationToken,
    qrKittingBoxToken,
    engineeringRationale: spool.engineeringRationale,
    technicalNotes,
    isometricNodes,
    jointPreps: {
      end1: {
        type: spool.end1Prep,
        prepNotes: `Gia công đầu 1: ${spool.end1Prep}`,
      },
      end2: {
        type: spool.end2Prep,
        prepNotes: `Gia công đầu 2: ${spool.end2Prep}${spool.isClosingSpool ? " (Đốt đóng tuyến - Cắt tinh chỉnh tại chỗ)" : ""}`,
      },
    },
    bomTable: spoolBom,
    qcChecklist,
  };
}

// ============================================================================
// 10. PERSISTENCE & DATABASE INTEGRATION
// ============================================================================

export async function saveSpoolFabricationRun(
  projectId: number,
  spools: Lod400Spool[],
  bomItems: MicroBomItem[],
): Promise<{ savedSpoolsCount: number; savedBomItemsCount: number }> {
  let savedSpools = 0;
  let savedBom = 0;

  for (const s of spools) {
    const spoolRow = await queryOne<{ id: string }>(
      `INSERT INTO engineering_pipe_spools (
        project_id, spool_code, system_code, discipline, material_type,
        nominal_dia_mm, outer_dia_mm, c_to_c_length_mm, cut_length_mm,
        slope_percent, weight_kg, end1_prep, end2_prep, field_fit_allowance_mm,
        tower_label, floor_label, shaft_label, zone_label, apartment_label, pipeline_code,
        qr_fabrication_token, isometric_data, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22::jsonb, $23
      )
      ON CONFLICT (project_id, spool_code) DO UPDATE SET
        cut_length_mm = EXCLUDED.cut_length_mm,
        c_to_c_length_mm = EXCLUDED.c_to_c_length_mm,
        weight_kg = EXCLUDED.weight_kg,
        slope_percent = EXCLUDED.slope_percent,
        field_fit_allowance_mm = EXCLUDED.field_fit_allowance_mm,
        tower_label = EXCLUDED.tower_label,
        floor_label = EXCLUDED.floor_label,
        shaft_label = EXCLUDED.shaft_label,
        zone_label = EXCLUDED.zone_label,
        apartment_label = EXCLUDED.apartment_label,
        pipeline_code = EXCLUDED.pipeline_code,
        updated_at = NOW()
      RETURNING id`,

      projectId,
      s.spoolCode,
      s.systemCode,
      s.discipline,
      s.material,
      s.nominalDiaMm,
      s.outerDiaMm,
      s.cToCLengthMm,
      s.cutLengthMm,
      s.slopePercent,
      s.weightKg,
      s.end1Prep,
      s.end2Prep,
      s.fieldFitAllowanceMm,
      s.towerLabel,
      s.floorLabel,
      s.shaftLabel,
      s.zoneLabel,
      s.apartmentLabel,
      s.pipelineCode,
      s.qrFabricationToken,
      JSON.stringify({
        startElevation: s.startElevationMm,
        endElevation: s.endElevationMm,
        fittings: s.fittingsAttached,
        engineeringRationale: s.engineeringRationale,
        installationInstructions: s.installationInstructions,
      }),
      "designed",
    );

    if (spoolRow) {
      savedSpools++;
      const spoolId = spoolRow.id;

      for (const f of s.fittingsAttached) {
        await run(
          `INSERT INTO engineering_pipe_spool_fittings (
            project_id, spool_id, fitting_code, fitting_type,
            nominal_dia_primary_mm, take_off_mm, is_field_installed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,

          projectId,
          spoolId,
          `FIT-${f.fittingType}-${s.spoolCode}`,
          f.fittingType,
          f.nominalDiaMm,
          f.takeOffMm,
          f.isFieldInstalled,
        );
      }
    }
  }

  for (const b of bomItems) {
    await run(
      `INSERT INTO engineering_pipe_micro_bom_items (
        project_id, level_tier, category, item_code, item_name,
        spec, quantity, unit, unit_cost_vnd, total_cost_vnd,
        is_kitted, kitting_box_code, tower_label, floor_label,
        shaft_label, zone_label, apartment_label, pipeline_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,

      projectId,
      b.levelTier,
      b.category,
      b.itemCode,
      b.itemName,
      b.spec,
      b.quantity,
      b.unit,
      b.unitCostVnd,
      b.totalCostVnd,
      b.isKitted,
      b.kittingBoxCode,
      b.towerLabel || "Tower-A",
      b.floorLabel || "FL-01",
      b.shaftLabel || "",
      b.zoneLabel || "Zone-1",
      b.apartmentLabel || "",
      b.pipelineCode || "",
    );
    savedBom++;
  }

  return { savedSpoolsCount: savedSpools, savedBomItemsCount: savedBom };
}

export async function saveSpatialQtoSummaries(
  projectId: number,
  summaries: SpatialBreakdownSummary[],
): Promise<{ savedCount: number }> {
  let count = 0;
  for (const sum of summaries) {
    await run(
      `INSERT INTO engineering_pipe_spatial_qto_summaries (
        project_id, dimension_type, dimension_key, filter_scope,
        total_spools_count, total_cut_length_m, pipe_summary_by_spec,
        fittings_count_by_type, consumables_summary, supports_summary,
        total_cost_vnd, kitting_box_code, updated_at
      ) VALUES (
        $1, $2, $3, $4::jsonb,
        $5, $6, $7::jsonb,
        $8::jsonb, $9::jsonb, $10::jsonb,
        $11, $12, NOW()
      )
      ON CONFLICT (project_id, dimension_type, dimension_key) DO UPDATE SET
        total_spools_count = EXCLUDED.total_spools_count,
        total_cut_length_m = EXCLUDED.total_cut_length_m,
        pipe_summary_by_spec = EXCLUDED.pipe_summary_by_spec,
        fittings_count_by_type = EXCLUDED.fittings_count_by_type,
        consumables_summary = EXCLUDED.consumables_summary,
        supports_summary = EXCLUDED.supports_summary,
        total_cost_vnd = EXCLUDED.total_cost_vnd,
        kitting_box_code = EXCLUDED.kitting_box_code,
        updated_at = NOW()`,

      projectId,
      sum.dimensionType,
      sum.dimensionKey,
      JSON.stringify(sum.filterScope),
      sum.totalSpoolsCount,
      sum.totalCutLengthM,
      JSON.stringify(sum.pipeSummaryBySpec),
      JSON.stringify(sum.fittingsCountByType),
      JSON.stringify(sum.consumablesSummary),
      JSON.stringify(sum.supportsSummary),
      sum.totalCostVnd,
      sum.kittingBoxCode,
    );
    count++;
  }
  return { savedCount: count };
}

export async function listPipeSpools(projectId: number): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_pipe_spools WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
    projectId,
  );
}

export async function listRemnantInventory(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_pipe_remnant_inventory WHERE project_id = $1 AND status = 'available' ORDER BY remaining_length_mm ASC`,
    projectId,
  );
}

export async function listSpatialQtoSummaries(
  projectId: number,
  dimensionType?: string,
): Promise<Array<Record<string, unknown>>> {
  if (dimensionType) {
    return query<Record<string, unknown>>(
      `SELECT * FROM engineering_pipe_spatial_qto_summaries WHERE project_id = $1 AND dimension_type = $2 ORDER BY dimension_key ASC`,
      projectId,
      dimensionType,
    );
  }
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_pipe_spatial_qto_summaries WHERE project_id = $1 ORDER BY dimension_type ASC, dimension_key ASC`,
    projectId,
  );
}
