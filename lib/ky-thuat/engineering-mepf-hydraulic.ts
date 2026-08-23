// lib/engineering-mepf-hydraulic.ts — Facade for Unified Hydraulic Engineering Engine (M68)
import { query, queryOne } from "@/lib/db";

export {
  type HydraulicSystemType,
  type PipeStandardSize,
  STANDARD_STEEL_PIPES,
  autoSizePipeDiameter,
  calculateHydraulicLoss,
  calculateHangerLoadAndSpacing,
  runMepfHydraulicAnalysis,
} from "@/lib/ky-thuat/engineering-hydraulic-engine";

export interface HydraulicAnalysisResult {
  calcCode: string;
  systemType: string;
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

export async function saveHydraulicCalculation(
  projectId: number,
  res: any,
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
      res.pipeLengthM ?? res.totalLengthM,
      res.selectedDiameterSpec,
      res.fluidVelocityMs,
      res.headLossBar ?? res.totalPressureLossBar,
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
