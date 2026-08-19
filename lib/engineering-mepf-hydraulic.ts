// lib/engineering-mepf-hydraulic.ts — AI Hydraulic & Ductwork Auto-Sizing Engine (M68)
import { query, queryOne } from "@/lib/db";

export type HydraulicSystemType =
  "chilled_water" | "condenser_water" | "domestic_water" | "firefighting_sprinkler" | "air_duct";

export interface PipeStandardSize {
  nominalSpec: string; // e.g. "DN50", "DN100"
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
    standardHangerSpacingM: 2.4,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN40",
    innerDiameterMm: 40.9,
    outerDiameterMm: 48.3,
    weightEmptyKgM: 3.65,
    standardHangerSpacingM: 2.6,
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
    outerDiameterMm: 76.1,
    weightEmptyKgM: 8.63,
    standardHangerSpacingM: 3.0,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN80",
    innerDiameterMm: 77.9,
    outerDiameterMm: 88.9,
    weightEmptyKgM: 11.3,
    standardHangerSpacingM: 3.5,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN100",
    innerDiameterMm: 102.3,
    outerDiameterMm: 114.3,
    weightEmptyKgM: 16.1,
    standardHangerSpacingM: 3.5,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN125",
    innerDiameterMm: 128.2,
    outerDiameterMm: 139.7,
    weightEmptyKgM: 21.8,
    standardHangerSpacingM: 4.0,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN150",
    innerDiameterMm: 154.1,
    outerDiameterMm: 168.3,
    weightEmptyKgM: 28.3,
    standardHangerSpacingM: 4.5,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN200",
    innerDiameterMm: 202.7,
    outerDiameterMm: 219.1,
    weightEmptyKgM: 42.5,
    standardHangerSpacingM: 5.0,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN250",
    innerDiameterMm: 254.5,
    outerDiameterMm: 273.0,
    weightEmptyKgM: 60.0,
    standardHangerSpacingM: 5.5,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN300",
    innerDiameterMm: 304.8,
    outerDiameterMm: 323.9,
    weightEmptyKgM: 76.0,
    standardHangerSpacingM: 6.0,
    recommendedRodSize: "M16",
  },
];

export interface HydraulicAnalysisResult {
  calcCode: string;
  systemType: HydraulicSystemType;
  flowRateM3h: number;
  pipeLengthM: number;
  selectedDiameterSpec: string;
  innerDiameterMm: number;
  fluidVelocityMs: number;
  velocityStatus: "optimal" | "warning_high" | "warning_low";
  headLossM: number;
  headLossBar: number;
  totalWeightFullWaterKg: number;
  recommendedHangerSpacingM: number;
  recommendedRodSize: string;
  totalHangersNeeded: number;
}

// ============================================================================
// 1. THUẬT TOÁN TÍNH TOÁN THỦY LỰC & CHỌN CỠ ỐNG (HAZEN-WILLIAMS AUTO-SIZING)
// ============================================================================

export function autoSizePipeDiameter(
  flowRateM3h: number,
  systemType: HydraulicSystemType,
  maxVelocityMs = 1.5,
): PipeStandardSize {
  if (flowRateM3h <= 0) return STANDARD_STEEL_PIPES[0];

  const flowRateM3s = flowRateM3h / 3600.0;

  for (const pipe of STANDARD_STEEL_PIPES) {
    const areaM2 = Math.PI * Math.pow(pipe.innerDiameterMm / 2000.0, 2);
    const velocity = flowRateM3s / areaM2;
    if (velocity <= maxVelocityMs) {
      return pipe;
    }
  }

  return STANDARD_STEEL_PIPES[STANDARD_STEEL_PIPES.length - 1];
}

export function calculateHydraulicLoss(
  flowRateM3h: number,
  pipeLengthM: number,
  innerDiameterMm: number,
  roughnessC = 120, // C = 120 cho ống thép SCH40, 140 cho PPR/HDPE
): { velocityMs: number; headLossM: number; headLossBar: number } {
  if (flowRateM3h <= 0 || pipeLengthM <= 0 || innerDiameterMm <= 0) {
    return { velocityMs: 0, headLossM: 0, headLossBar: 0 };
  }

  const Q = flowRateM3h / 3600.0; // m3/s
  const D = innerDiameterMm / 1000.0; // m
  const areaM2 = Math.PI * Math.pow(D / 2.0, 2);
  const velocityMs = Math.round((Q / areaM2) * 1000) / 1000;

  // Phương trình Hazen-Williams: hf = 10.67 * L * (Q^1.852) / (C^1.852 * D^4.87)
  const numerator = 10.67 * pipeLengthM * Math.pow(Q, 1.852);
  const denominator = Math.pow(roughnessC, 1.852) * Math.pow(D, 4.87);
  const headLossM = Math.round((numerator / denominator) * 1000) / 1000;

  // 1 m cột nước = 0.0980665 Bar (~0.1 Bar)
  const headLossBar = Math.round(headLossM * 0.0980665 * 10000) / 10000;

  return { velocityMs, headLossM, headLossBar };
}

// ============================================================================
// 2. THUẬT TOÁN TÍNH TẢI TRỌNG TY TREO & BỐ TRÍ GIÁ ĐỠ (HANGER & SEISMIC LOAD)
// ============================================================================

export function calculateHangerLoadAndSpacing(
  pipe: PipeStandardSize,
  pipeLengthM: number,
  safetyFactor = 1.35, // Hệ số an toàn SMACNA / TCVN
): {
  totalWeightKg: number;
  spacingM: number;
  hangersCount: number;
  rodSize: string;
} {
  // Trọng lượng nước trong ống: V = PI * r^2 * L * 1000 kg/m3
  const volumePerMeterM3 = Math.PI * Math.pow(pipe.innerDiameterMm / 2000.0, 2);
  const waterWeightPerMeterKg = volumePerMeterM3 * 1000.0;
  const insulationWeightPerMeterKg = 0.8; // Ước lượng bảo ôn Aeroflex/Armaflex

  const totalUnitWeightKgM =
    (pipe.weightEmptyKgM + waterWeightPerMeterKg + insulationWeightPerMeterKg) * safetyFactor;
  const totalWeightKg = Math.round(totalUnitWeightKgM * pipeLengthM * 100) / 100;

  const spacingM = pipe.standardHangerSpacingM;
  const hangersCount = Math.max(2, Math.ceil(pipeLengthM / spacingM) + 1);

  return {
    totalWeightKg,
    spacingM,
    hangersCount,
    rodSize: pipe.recommendedRodSize,
  };
}

// ============================================================================
// 3. TỔNG HỢP TOÀN BỘ PHÂN TÍCH THỦY LỰC & CHỌN CỠ TỰ ĐỘNG
// ============================================================================

export function runMepfHydraulicAnalysis(
  calcCode: string,
  systemType: HydraulicSystemType,
  flowRateM3h: number,
  pipeLengthM: number,
  maxVelocityMs = 1.6,
  roughnessC = 120,
): HydraulicAnalysisResult {
  const selectedPipe = autoSizePipeDiameter(flowRateM3h, systemType, maxVelocityMs);
  const loss = calculateHydraulicLoss(
    flowRateM3h,
    pipeLengthM,
    selectedPipe.innerDiameterMm,
    roughnessC,
  );
  const hanger = calculateHangerLoadAndSpacing(selectedPipe, pipeLengthM);

  let velocityStatus: HydraulicAnalysisResult["velocityStatus"] = "optimal";
  if (loss.velocityMs > 2.0) velocityStatus = "warning_high";
  else if (loss.velocityMs < 0.5) velocityStatus = "warning_low";

  return {
    calcCode,
    systemType,
    flowRateM3h,
    pipeLengthM,
    selectedDiameterSpec: selectedPipe.nominalSpec,
    innerDiameterMm: selectedPipe.innerDiameterMm,
    fluidVelocityMs: loss.velocityMs,
    velocityStatus,
    headLossM: loss.headLossM,
    headLossBar: loss.headLossBar,
    totalWeightFullWaterKg: hanger.totalWeightKg,
    recommendedHangerSpacingM: hanger.spacingM,
    recommendedRodSize: hanger.rodSize,
    totalHangersNeeded: hanger.hangersCount,
  };
}

// ============================================================================
// 4. PERSISTENCE & DATABASE
// ============================================================================

export async function saveHydraulicCalculation(
  projectId: number,
  res: HydraulicAnalysisResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_mepf_hydraulic_calculations (
      project_id, calc_code, system_type, flow_rate_m3h, pipe_length_m,
      selected_diameter_spec, fluid_velocity_ms, head_loss_bar,
      recommended_hanger_spacing_m, recommended_rod_size
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10
    )
    ON CONFLICT (project_id, calc_code) DO UPDATE SET
      selected_diameter_spec = EXCLUDED.selected_diameter_spec,
      fluid_velocity_ms = EXCLUDED.fluid_velocity_ms,
      head_loss_bar = EXCLUDED.head_loss_bar,
      recommended_hanger_spacing_m = EXCLUDED.recommended_hanger_spacing_m,
      recommended_rod_size = EXCLUDED.recommended_rod_size
    RETURNING id`,
    [
      projectId,
      res.calcCode,
      res.systemType,
      res.flowRateM3h,
      res.pipeLengthM,
      res.selectedDiameterSpec,
      res.fluidVelocityMs,
      res.headLossBar,
      res.recommendedHangerSpacingM,
      res.recommendedRodSize,
    ],
  );

  if (!row) throw new Error("Failed to save hydraulic calculation");
  return row;
}

export async function listHydraulicCalculations(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_mepf_hydraulic_calculations WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
