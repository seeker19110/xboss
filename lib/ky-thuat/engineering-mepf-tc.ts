// lib/engineering-mepf-tc.ts — Smart MEPF Testing & Commissioning (T&C) Engine (M67)
import { query, queryOne, run } from "@/lib/db";

export type TcTestType =
  | "hydrostatic_pipe"
  | "air_duct_leakage"
  | "air_balance_tab"
  | "fire_interlock"
  | "insulation_resistance";

export type TcStatus = "draft" | "ready" | "testing" | "passed" | "failed" | "approved";

export interface TcMatrixRecord {
  id: string;
  project_id: number;
  matrix_code: string;
  title: string;
  test_type: TcTestType;
  system_code: string;
  floor_label: string;
  zone_label: string;
  test_package_name: string;
  design_pressure_bar: number | null;
  test_pressure_bar: number | null;
  holding_duration_minutes: number;
  allowable_drop_bar: number;
  status: TcStatus;
  interlock_logic: Array<{
    triggerEvent: string;
    expectedAction: string;
    actualStatus: "pending" | "pass" | "fail";
    responseTimeSec: number;
  }>;
  assigned_inspector: number | null;
  created_at: string;
  updated_at: string;
}

export interface TcLogRecord {
  id: string;
  project_id: number;
  matrix_id: string;
  reading_time: string;
  sensor_code: string | null;
  recorded_value: number;
  unit: string;
  ambient_temp_c: number | null;
  notes: string | null;
  is_anomaly: boolean;
}

// ============================================================================
// 1. THUẬT TOÁN ĐÁNH GIÁ THỬ ÁP LỰC ĐƯỜNG ỐNG (HYDROSTATIC PRESSURE HOLD ANALYSIS)
// ============================================================================

export function evaluatePressureHoldTest(
  initialPressureBar: number,
  finalPressureBar: number,
  durationMinutes: number,
  requiredDurationMinutes = 120,
  allowableDropBar = 0.2,
): {
  isPassed: boolean;
  actualDropBar: number;
  dropPercentage: number;
  verdictMessage: string;
} {
  const actualDrop = Math.max(0, Math.round((initialPressureBar - finalPressureBar) * 1000) / 1000);
  const dropPct = initialPressureBar > 0 ? (actualDrop / initialPressureBar) * 100 : 0;

  if (durationMinutes < requiredDurationMinutes) {
    return {
      isPassed: false,
      actualDropBar: actualDrop,
      dropPercentage: Math.round(dropPct * 10) / 10,
      verdictMessage: `Thời gian ngâm áp chưa đạt (${durationMinutes}/${requiredDurationMinutes} phút).`,
    };
  }

  const isPassed = actualDrop <= allowableDropBar;
  return {
    isPassed,
    actualDropBar: actualDrop,
    dropPercentage: Math.round(dropPct * 10) / 10,
    verdictMessage: isPassed
      ? `ĐẠT CHUẨN: Độ sụt áp ${actualDrop} bar nằm trong giới hạn cho phép (< ${allowableDropBar} bar) sau ${durationMinutes} phút.`
      : `KHÔNG ĐẠT: Sụt áp ${actualDrop} bar vượt quá mức cho phép (${allowableDropBar} bar). Nghi ngờ rò rỉ tại mối nối/mặt bích.`,
  };
}

// ============================================================================
// 2. THUẬT TOÁN ĐÁNH GIÁ MA TRẬN LIÊN ĐỘNG PCCC (FIRE INTERLOCK MATRIX)
// ============================================================================

export function evaluateFireInterlockMatrix(
  scenarios: Array<{
    triggerEvent: string;
    expectedAction: string;
    actualStatus: "pending" | "pass" | "fail";
    responseTimeSec: number;
  }>,
): {
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  overallPassed: boolean;
  avgResponseTimeSec: number;
} {
  if (!scenarios || scenarios.length === 0) {
    return {
      totalScenarios: 0,
      passedCount: 0,
      failedCount: 0,
      overallPassed: false,
      avgResponseTimeSec: 0,
    };
  }

  let passed = 0;
  let failed = 0;
  let totalTime = 0;

  for (const s of scenarios) {
    if (s.actualStatus === "pass") passed += 1;
    if (s.actualStatus === "fail") failed += 1;
    totalTime += s.responseTimeSec || 0;
  }

  const overallPassed = passed === scenarios.length && failed === 0;
  return {
    totalScenarios: scenarios.length,
    passedCount: passed,
    failedCount: failed,
    overallPassed,
    avgResponseTimeSec: Math.round((totalTime / scenarios.length) * 10) / 10,
  };
}

// ============================================================================
// 3. PERSISTENCE & DATABASE INGESTION
// ============================================================================

export async function createTcMatrix(
  projectId: number,
  userId: number | null,
  data: {
    matrixCode: string;
    title: string;
    testType: TcTestType;
    systemCode: string;
    floorLabel: string;
    zoneLabel?: string;
    testPackageName: string;
    designPressureBar?: number;
    testPressureBar?: number;
    holdingDurationMinutes?: number;
    allowableDropBar?: number;
    interlockLogic?: Array<Record<string, unknown>>;
  },
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_mepf_tc_matrices (
      project_id, matrix_code, title, test_type, system_code,
      floor_label, zone_label, test_package_name, design_pressure_bar,
      test_pressure_bar, holding_duration_minutes, allowable_drop_bar,
      interlock_logic, assigned_inspector
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12,
      $13::jsonb, $14
    )
    ON CONFLICT (project_id, matrix_code) DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      interlock_logic = EXCLUDED.interlock_logic,
      updated_at = NOW()
    RETURNING id`,

    projectId,
    data.matrixCode,
    data.title,
    data.testType,
    data.systemCode,
    data.floorLabel,
    data.zoneLabel || "Main",
    data.testPackageName,
    data.designPressureBar ?? null,
    data.testPressureBar ?? null,
    data.holdingDurationMinutes ?? 120,
    data.allowableDropBar ?? 0.2,
    JSON.stringify(data.interlockLogic || []),
    userId,
  );

  if (!row) throw new Error("Failed to create MEPF T&C matrix");
  return row;
}

export async function addTcLog(
  projectId: number,
  userId: number | null,
  matrixId: string,
  data: {
    recordedValue: number;
    unit: string;
    sensorCode?: string;
    ambientTempC?: number;
    notes?: string;
    isAnomaly?: boolean;
  },
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_mepf_tc_logs (
      project_id, matrix_id, sensor_code, recorded_value, unit,
      ambient_temp_c, notes, is_anomaly, created_by
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9
    ) RETURNING id`,

    projectId,
    matrixId,
    data.sensorCode || null,
    data.recordedValue,
    data.unit,
    data.ambientTempC ?? null,
    data.notes || null,
    data.isAnomaly ?? false,
    userId,
  );

  if (!row) throw new Error("Failed to insert MEPF T&C log");
  return row;
}

export async function listTcMatrices(projectId: number): Promise<TcMatrixRecord[]> {
  return query<TcMatrixRecord>(
    `SELECT * FROM engineering_mepf_tc_matrices WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    projectId,
  );
}

export async function listTcLogs(projectId: number, matrixId: string): Promise<TcLogRecord[]> {
  return query<TcLogRecord>(
    `SELECT * FROM engineering_mepf_tc_logs WHERE project_id = $1 AND matrix_id = $2 ORDER BY reading_time ASC`,
    projectId,
    matrixId,
  );
}
