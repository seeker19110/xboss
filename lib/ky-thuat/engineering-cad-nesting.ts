// lib/engineering-cad-nesting.ts — Facade for Unified DfMA Spooling & Hydraulic Engine (M89)
import { query, queryOne } from "@/lib/db";

export {
  type PipeSegmentInput,
  type CutItem,
  type NestingStockBar,
  type Nesting1DResult,
  nestPipeSegments1D,
  type DuctSheetRectInput,
  type PlacedSheetRect,
  type DuctSheetMetalBar,
  type Nesting2DResult,
  nestDuctSheets2D,
  generateSpoolQrPayload,
} from "@/lib/ky-thuat/engineering-dfma-spooling";

export function calcHazenWilliams(
  flowRateLps: number,
  pipeDiameterMm: number,
  pipeLengthM = 1.0,
  cFactor = 120,
): {
  velocityMs: number;
  headLossPerMeterPa: number;
  totalHeadLossPa: number;
  pressureDropBar: number;
} {
  const dM = pipeDiameterMm / 1000;
  const qM3s = flowRateLps / 1000;
  const areaM2 = (Math.PI * dM * dM) / 4;
  const velocity = areaM2 > 0 ? qM3s / areaM2 : 0;

  const headLossPerM =
    (10.67 * Math.pow(Math.max(1e-6, qM3s), 1.852)) /
    (Math.pow(cFactor, 1.852) * Math.pow(dM, 4.87));

  const headLossPerMPa = headLossPerM * 9806.65;
  const totalHeadLossPa = headLossPerMPa * pipeLengthM;
  const pressureDropBar = totalHeadLossPa / 100000;

  return {
    velocityMs: Math.round(velocity * 1000) / 1000,
    headLossPerMeterPa: Math.round(headLossPerMPa * 100) / 100,
    totalHeadLossPa: Math.round(totalHeadLossPa * 100) / 100,
    pressureDropBar: Math.round(pressureDropBar * 10000) / 10000,
  };
}

export function calcDarcyWeisbach(
  flowRateLps: number,
  pipeDiameterMm: number,
  roughnessMm = 0.046,
  pipeLengthM = 1.0,
  fluidTempC = 25.0,
): {
  velocityMs: number;
  reynoldsNumber: number;
  frictionFactor: number;
  headLossPerMeterPa: number;
  totalHeadLossPa: number;
  pressureDropBar: number;
} {
  const dM = pipeDiameterMm / 1000;
  const qM3s = flowRateLps / 1000;
  const areaM2 = (Math.PI * dM * dM) / 4;
  const velocity = areaM2 > 0 ? qM3s / areaM2 : 0;

  const nu = 1.79e-6 / (1 + 0.0337 * fluidTempC + 0.00022 * fluidTempC * fluidTempC);
  const reynolds = (velocity * dM) / Math.max(1e-9, nu);

  const eps = roughnessMm / 1000;
  let f = 0.02;
  if (reynolds < 2300) {
    f = reynolds > 0 ? 64 / reynolds : 0.02;
  } else {
    f = 0.25 / Math.pow(Math.log10(eps / (3.7 * dM) + 5.74 / Math.pow(reynolds, 0.9)), 2);
  }

  const rho = 1000;
  const dpPerM = f * (1 / dM) * ((rho * velocity * velocity) / 2);
  const totalDp = dpPerM * pipeLengthM;
  const dpBar = totalDp / 100000;

  return {
    velocityMs: Math.round(velocity * 1000) / 1000,
    reynoldsNumber: Math.round(reynolds),
    frictionFactor: Math.round(f * 10000) / 10000,
    headLossPerMeterPa: Math.round(dpPerM * 100) / 100,
    totalHeadLossPa: Math.round(totalDp * 100) / 100,
    pressureDropBar: Math.round(dpBar * 10000) / 10000,
  };
}

export type SystemVelocityCategory =
  | "domestic_water"
  | "chilled_water"
  | "pump_suction"
  | "duct_branch"
  | "duct_main"
  | "fire_sprinkler";

export const VELOCITY_LIMITS: Record<
  SystemVelocityCategory,
  { minMs: number; maxMs: number; standard: string; reason: string }
> = {
  domestic_water: {
    minMs: 0.6,
    maxMs: 2.0,
    standard: "TCVN 4513:1988",
    reason: "Tránh lắng cặn khi v thấp và xói mòn/ồn khi v cao.",
  },
  chilled_water: {
    minMs: 0.9,
    maxMs: 2.5,
    standard: "ASHRAE Fundamentals",
    reason: "Tối ưu hóa truyền nhiệt và tổn thất cột áp bơm.",
  },
  pump_suction: {
    minMs: 0.5,
    maxMs: 1.2,
    standard: "HI 9.6.6 / TCVN",
    reason: "Chống hiện tượng xâm thực khí (Cavitation) phá hỏng cánh bơm.",
  },
  duct_branch: {
    minMs: 3.0,
    maxMs: 6.0,
    standard: "SMACNA / TCVN 5687",
    reason: "Đảm bảo độ ồn tiêu chuẩn NC 30-35 khu vực văn phòng.",
  },
  duct_main: {
    minMs: 6.0,
    maxMs: 10.0,
    standard: "SMACNA / TCVN 5687",
    reason: "Tránh rung lắc đường ống trục đứng và tiếng ồn truyền vào phòng.",
  },
  fire_sprinkler: {
    minMs: 1.0,
    maxMs: 5.0,
    standard: "NFPA 13 / TCVN 7336",
    reason: "Cung cấp lưu lượng chữa cháy tức thời theo thiết kế.",
  },
};

export function validateVelocityLimit(
  velocityMs: number,
  systemType: SystemVelocityCategory,
): {
  ok: boolean;
  limitMs: number;
  status: "pass" | "warning" | "fail";
  message: string;
} {
  const spec = VELOCITY_LIMITS[systemType] || VELOCITY_LIMITS.domestic_water;

  if (velocityMs > spec.maxMs) {
    return {
      ok: false,
      limitMs: spec.maxMs,
      status: "fail",
      message: `VẬN TỐC VƯỢT GIỚI HẠN (${velocityMs.toFixed(2)} m/s > ${spec.maxMs} m/s). ${spec.reason} Căn cứ: ${spec.standard}.`,
    };
  }

  if (velocityMs < spec.minMs) {
    return {
      ok: true,
      limitMs: spec.minMs,
      status: "warning",
      message: `Vận tốc hơi thấp (${velocityMs.toFixed(2)} m/s < ${spec.minMs} m/s). Cảnh báo nguy cơ lắng đọng cặn bẩn. Căn cứ: ${spec.standard}.`,
    };
  }

  return {
    ok: true,
    limitMs: spec.maxMs,
    status: "pass",
    message: `Vận tốc đạt chuẩn kỹ thuật (${velocityMs.toFixed(2)} m/s trong dải ${spec.minMs}-${spec.maxMs} m/s).`,
  };
}

export function sizeDuctByVelocity(
  airflowCfm: number,
  targetVelocityMs = 6.0,
  aspectRatio = 1.5,
): {
  widthMm: number;
  heightMm: number;
  actualVelocityMs: number;
  equivalentDiameterMm: number;
} {
  const qM3s = airflowCfm * 0.000471947;
  const reqAreaM2 = qM3s / Math.max(0.1, targetVelocityMs);
  const hM = Math.sqrt(reqAreaM2 / aspectRatio);
  const wM = hM * aspectRatio;
  const hMm = Math.max(100, Math.round((hM * 1000) / 50) * 50);
  const wMm = Math.max(100, Math.round((wM * 1000) / 50) * 50);
  const actAreaM2 = (wMm * hMm) / 1_000_000;
  const actVelocity = actAreaM2 > 0 ? qM3s / actAreaM2 : 0;
  const eqD = (1.3 * Math.pow(wMm * hMm, 0.625)) / Math.pow(Math.max(1, wMm + hMm), 0.25);

  return {
    widthMm: wMm,
    heightMm: hMm,
    actualVelocityMs: Math.round(actVelocity * 100) / 100,
    equivalentDiameterMm: Math.round(eqD),
  };
}

export interface NestingRunRecord {
  id: string;
  project_id: number;
  run_code: string;
  discipline: string;
  stock_length_mm: number;
  kerf_mm: number;
  total_segments: number;
  total_bars_used: number;
  total_used_length_mm: number;
  total_waste_mm: number;
  waste_percent: number;
  efficiency_grade: string;
  nesting_plan: any[];
  created_at: string;
}

export interface HydraulicCheckRecord {
  id: string;
  project_id: number;
  check_code: string;
  system_type: string;
  formula_used: string;
  flow_rate_lps: number | null;
  pipe_diameter_mm: number | null;
  pipe_length_m: number | null;
  velocity_ms: number | null;
  reynolds_number: number | null;
  head_loss_per_m_pa: number | null;
  total_head_loss_pa: number | null;
  pressure_drop_bar: number | null;
  airflow_cfm: number | null;
  duct_width_mm: number | null;
  duct_height_mm: number | null;
  velocity_limit_ms: number | null;
  velocity_ok: boolean;
  warnings: string[];
  status: string;
  created_at: string;
}

export async function saveNestingRun(
  projectId: number,
  discipline: string,
  result: any,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_pipe_nesting_runs (
      project_id, run_code, discipline, stock_length_mm, kerf_mm,
      total_segments, total_bars_used, total_used_length_mm, total_waste_mm,
      waste_percent, efficiency_grade, nesting_plan, created_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?::jsonb, ?
    )
    ON CONFLICT (project_id, run_code) DO UPDATE SET
      total_bars_used = EXCLUDED.total_bars_used,
      waste_percent = EXCLUDED.waste_percent,
      nesting_plan = EXCLUDED.nesting_plan
    RETURNING id`,
    [
      projectId,
      result.runCode,
      discipline,
      result.stockLengthMm,
      result.kerfMm,
      result.totalSegments,
      result.totalBarsUsed,
      result.totalUsedLengthMm,
      result.totalWasteMm,
      result.wastePercent,
      result.efficiencyGrade,
      JSON.stringify(result.bars),
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save pipe nesting run");
  return row;
}

export async function listNestingRuns(projectId: number): Promise<NestingRunRecord[]> {
  return await query<NestingRunRecord>(
    `SELECT * FROM engineering_pipe_nesting_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}

export async function saveHydraulicCheck(
  projectId: number,
  input: {
    systemType: string;
    formulaUsed: string;
    flowRateLps?: number;
    pipeDiameterMm?: number;
    pipeLengthM?: number;
    roughnessMm?: number;
    fluidTempC?: number;
    airflowCfm?: number;
    ductWidthMm?: number;
    ductHeightMm?: number;
    linkedSpoolCode?: string;
  },
  result: {
    velocityMs?: number;
    reynoldsNumber?: number;
    frictionFactor?: number;
    headLossPerMPa?: number;
    totalHeadLossPa?: number;
    pressureDropBar?: number;
    velocityLimitMs?: number;
    velocityOk?: boolean;
    warnings?: string[];
    status?: string;
  },
  userId?: number | null,
): Promise<{ id: string }> {
  const checkCode = `HYD-${Date.now().toString(36).toUpperCase()}`;

  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_hydraulic_checks (
      project_id, check_code, system_type, formula_used,
      flow_rate_lps, pipe_diameter_mm, pipe_length_m, roughness_mm, fluid_temp_c,
      velocity_ms, reynolds_number, friction_factor, head_loss_per_m_pa, total_head_loss_pa,
      pressure_drop_bar, airflow_cfm, duct_width_mm, duct_height_mm,
      velocity_limit_ms, velocity_ok, warnings, status, linked_spool_code, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?::jsonb, ?, ?, ?
    ) RETURNING id`,
    [
      projectId,
      checkCode,
      input.systemType,
      input.formulaUsed,
      input.flowRateLps ?? null,
      input.pipeDiameterMm ?? null,
      input.pipeLengthM ?? null,
      input.roughnessMm ?? null,
      input.fluidTempC ?? 25.0,
      result.velocityMs ?? null,
      result.reynoldsNumber ?? null,
      result.frictionFactor ?? null,
      result.headLossPerMPa ?? null,
      result.totalHeadLossPa ?? null,
      result.pressureDropBar ?? null,
      input.airflowCfm ?? null,
      input.ductWidthMm ?? null,
      input.ductHeightMm ?? null,
      result.velocityLimitMs ?? null,
      result.velocityOk ?? true,
      JSON.stringify(result.warnings || []),
      result.status || "pass",
      input.linkedSpoolCode ?? null,
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save hydraulic check");
  return row;
}

export async function listHydraulicChecks(projectId: number): Promise<HydraulicCheckRecord[]> {
  return await query<HydraulicCheckRecord>(
    `SELECT * FROM engineering_hydraulic_checks WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
