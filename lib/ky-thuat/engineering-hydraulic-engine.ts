// lib/engineering-hydraulic-engine.ts — Unified Hydraulic & Ductwork Engineering Engine (M68 / M76 / M92)
import { query, queryOne, run } from "@/lib/db";

// ============================================================================
// 1. TIÊU CHUẨN THÔNG SỐ VẬT LIỆU & ĐƯỜNG ỐNG
// ============================================================================

export type HydraulicSystemType =
  "chilled_water" | "condenser_water" | "domestic_water" | "firefighting_sprinkler" | "air_duct";

export interface PipeStandardSize {
  nominalSpec: string; // e.g. "DN15", "DN50", "DN100"
  innerDiameterMm: number;
  outerDiameterMm: number;
  weightEmptyKgM: number;
  standardHangerSpacingM: number;
  recommendedRodSize: "M8" | "M10" | "M12" | "M16";
}

export const STANDARD_STEEL_PIPES: PipeStandardSize[] = [
  {
    nominalSpec: "DN15",
    innerDiameterMm: 15.8,
    outerDiameterMm: 21.3,
    weightEmptyKgM: 1.28,
    standardHangerSpacingM: 2.0,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN20",
    innerDiameterMm: 21.0,
    outerDiameterMm: 26.9,
    weightEmptyKgM: 1.69,
    standardHangerSpacingM: 2.0,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN25",
    innerDiameterMm: 26.6,
    outerDiameterMm: 33.7,
    weightEmptyKgM: 2.44,
    standardHangerSpacingM: 2.2,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN32",
    innerDiameterMm: 35.1,
    outerDiameterMm: 42.4,
    weightEmptyKgM: 3.14,
    standardHangerSpacingM: 2.5,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN40",
    innerDiameterMm: 40.9,
    outerDiameterMm: 48.3,
    weightEmptyKgM: 3.65,
    standardHangerSpacingM: 2.7,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN50",
    innerDiameterMm: 52.5,
    outerDiameterMm: 60.3,
    weightEmptyKgM: 5.1,
    standardHangerSpacingM: 3.0,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN65",
    innerDiameterMm: 62.7,
    outerDiameterMm: 73.0,
    weightEmptyKgM: 6.51,
    standardHangerSpacingM: 3.0,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN80",
    innerDiameterMm: 77.9,
    outerDiameterMm: 88.9,
    weightEmptyKgM: 8.63,
    standardHangerSpacingM: 3.2,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN100",
    innerDiameterMm: 102.3,
    outerDiameterMm: 114.3,
    weightEmptyKgM: 12.5,
    standardHangerSpacingM: 3.5,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN125",
    innerDiameterMm: 128.2,
    outerDiameterMm: 141.3,
    weightEmptyKgM: 16.2,
    standardHangerSpacingM: 3.8,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN150",
    innerDiameterMm: 154.1,
    outerDiameterMm: 168.3,
    weightEmptyKgM: 21.8,
    standardHangerSpacingM: 4.2,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN200",
    innerDiameterMm: 202.7,
    outerDiameterMm: 219.1,
    weightEmptyKgM: 33.3,
    standardHangerSpacingM: 4.5,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN250",
    innerDiameterMm: 254.5,
    outerDiameterMm: 273.0,
    weightEmptyKgM: 42.6,
    standardHangerSpacingM: 5.0,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN300",
    innerDiameterMm: 304.8,
    outerDiameterMm: 323.9,
    weightEmptyKgM: 54.2,
    standardHangerSpacingM: 5.5,
    recommendedRodSize: "M16",
  },
];

// ============================================================================
// 2. CÔNG THỨC THỦY LỰC CƠ BẢN (DARCY-WEISBACH, HAZEN-WILLIAMS, SWAMEE-JAIN)
// ============================================================================

// calcDarcyWeisbach đã gộp về engineering-cad-nesting.ts (bản M89 có bù nhiệt độ chất lỏng)
// — bản cố định 20°C ở đây không nơi nào import, đã bỏ để tránh hai công thức song song.

export function calcHazenWilliams(
  flowRateM3h: number,
  lengthM: number,
  innerDiameterMm: number,
  cFactor: number = 120,
): { velocityMs: number; headLossM: number; headLossBar: number } {
  const dM = innerDiameterMm / 1000;
  const flowM3s = flowRateM3h / 3600;
  const areaM2 = (Math.PI * Math.pow(dM, 2)) / 4;
  const velocityMs = flowM3s / areaM2;

  const hf =
    (10.67 * Math.pow(flowM3s, 1.852) * lengthM) / (Math.pow(cFactor, 1.852) * Math.pow(dM, 4.87));
  const headLossBar = (hf * 9.81 * 1000) / 100000;

  return {
    velocityMs: Math.round(velocityMs * 1000) / 1000,
    headLossM: Math.round(hf * 1000) / 1000,
    headLossBar: Math.round(headLossBar * 10000) / 10000,
  };
}

// validateVelocityLimit đã gộp về engineering-cad-nesting.ts (bảng VELOCITY_LIMITS có cả
// ngưỡng min/max + trích dẫn tiêu chuẩn) — bản if-chain ở đây không nơi nào import, đã bỏ.

// ============================================================================
// 3. TÍNH TOÁN GIÁ ĐỠ & CHỌN CỠ ỐNG AUTO-SIZING
// ============================================================================

export function autoSizePipeDiameter(
  flowOrRate: number,
  systemOrMaxV: HydraulicSystemType | number = "chilled_water",
  maxVelocityMsInput: number = 1.5,
): any {
  // Overload 1: autoSizePipeDiameter(flowRateLps: number, maxVelocityMs: number)
  if (typeof systemOrMaxV === "number") {
    const flowRateLps = flowOrRate;
    const maxVelocity = systemOrMaxV;
    const flowM3s = flowRateLps / 1000;

    for (const pipe of STANDARD_STEEL_PIPES) {
      const dM = pipe.innerDiameterMm / 1000;
      const area = (Math.PI * Math.pow(dM, 2)) / 4;
      const v = flowM3s / area;
      if (v <= maxVelocity) {
        return {
          standardDn: pipe.nominalSpec,
          nominalDiameterMm: pipe.innerDiameterMm,
          outerDiameterMm: pipe.outerDiameterMm,
          actualVelocityMs: Math.round(v * 1000) / 1000,
          pipeSpec: pipe,
        };
      }
    }
    const largest = STANDARD_STEEL_PIPES[STANDARD_STEEL_PIPES.length - 1];
    return {
      standardDn: largest.nominalSpec,
      nominalDiameterMm: largest.innerDiameterMm,
      outerDiameterMm: largest.outerDiameterMm,
      actualVelocityMs:
        Math.round(
          (flowM3s / ((Math.PI * Math.pow(largest.innerDiameterMm / 1000, 2)) / 4)) * 1000,
        ) / 1000,
      pipeSpec: largest,
    };
  }

  // Overload 2: autoSizePipeDiameter(flowRateM3h: number, systemType: HydraulicSystemType, maxVelocityMs: number)
  const flowRateM3h = flowOrRate;
  const systemType = systemOrMaxV;
  const maxVelocity = maxVelocityMsInput;
  const flowM3s = flowRateM3h / 3600;

  for (const pipe of STANDARD_STEEL_PIPES) {
    const dM = pipe.innerDiameterMm / 1000;
    const area = (Math.PI * Math.pow(dM, 2)) / 4;
    const v = flowM3s / area;
    if (v <= maxVelocity) {
      return pipe;
    }
  }
  return STANDARD_STEEL_PIPES[STANDARD_STEEL_PIPES.length - 1];
}

export function calculateHydraulicLoss(
  flowRateM3h: number,
  pipeLengthM: number,
  innerDiameterMm: number,
  cFactor: number = 120,
) {
  return calcHazenWilliams(flowRateM3h, pipeLengthM, innerDiameterMm, cFactor);
}

export function calculateHangerLoadAndSpacing(
  pipe: PipeStandardSize,
  totalPipeLengthM: number,
): {
  pipeFilledWeightKgM: number;
  totalWeightKg: number;
  spacingM: number;
  hangersCount: number;
  rodSize: "M8" | "M10" | "M12" | "M16";
} {
  const dM = pipe.innerDiameterMm / 1000;
  const waterWeightKgM = ((Math.PI * Math.pow(dM, 2)) / 4) * 1000;
  const pipeFilledWeightKgM = pipe.weightEmptyKgM + waterWeightKgM;
  const totalWeightKg = Math.round(pipeFilledWeightKgM * totalPipeLengthM * 100) / 100;
  const spacingM = pipe.standardHangerSpacingM;
  const hangersCount = Math.ceil(totalPipeLengthM / spacingM) + 1;

  return {
    pipeFilledWeightKgM: Math.round(pipeFilledWeightKgM * 100) / 100,
    totalWeightKg,
    spacingM,
    hangersCount,
    rodSize: pipe.recommendedRodSize,
  };
}

export function runMepfHydraulicAnalysis(
  calcCode: string,
  systemType: HydraulicSystemType,
  flowRateM3h: number,
  totalLengthM: number,
  maxAllowedVelocityMs: number = 1.5,
) {
  const optimalPipe = autoSizePipeDiameter(
    flowRateM3h,
    systemType,
    maxAllowedVelocityMs,
  ) as PipeStandardSize;
  const hydraulicLoss = calculateHydraulicLoss(
    flowRateM3h,
    totalLengthM,
    optimalPipe.innerDiameterMm,
  );
  const hanger = calculateHangerLoadAndSpacing(optimalPipe, totalLengthM);

  return {
    calcCode,
    systemType,
    flowRateM3h,
    totalLengthM,
    selectedDiameterSpec: optimalPipe.nominalSpec,
    fluidVelocityMs: hydraulicLoss.velocityMs,
    velocityStatus: hydraulicLoss.velocityMs <= maxAllowedVelocityMs ? "optimal" : "exceeded",
    totalPressureLossBar: hydraulicLoss.headLossBar,
    totalHangersNeeded: hanger.hangersCount,
    recommendedHangerSpacingM: hanger.spacingM,
    recommendedRodSize: hanger.rodSize,
  };
}

// ============================================================================
// 4. MẠNG LƯỚI ĐỒ THỊ THỦY LỰC & CÂN BẰNG MẠCH (TOPOLOGICAL GRAPH & BALANCING)
// ============================================================================

export interface NetworkNode {
  id: string;
  name: string;
  type: "source" | "junction_tee" | "cross" | "valve" | "terminal" | "equipment";
  elevationM: number;
  demandFlowLps: number;
  pressureAvailableBar?: number;
}

export interface NetworkEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthM: number;
  nominalDiameterMm: number;
  flowRateLps: number;
  velocityMs: number;
  headLossPa: number;
  pressureDropBar: number;
  fittingLossFactorSum: number;
  isCriticalPath: boolean;
}

export interface BalancingValveScheduleItem {
  valveCode: string;
  edgeId: string;
  locationNode: string;
  designFlowLps: number;
  targetPressureDropBar: number;
  requiredKvCoefficient: number;
  valveSettingPresetPercent: number;
}

// solveHydraulicNetwork đã gộp về engineering-cad-hydraulic-network.ts — đó là bản đang chạy
// thật (route /api/engineering/cad-corridor dùng), có thêm phân loại hệ, kiểm vận tốc và lưu DB.
// Bản rút gọn ở đây không nơi nào import, đã bỏ; các type mạng lưới bên trên vẫn dùng chung.
