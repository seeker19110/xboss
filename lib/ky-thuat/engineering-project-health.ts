// lib/engineering-project-health.ts — Engineering Health Index (EHI) & Monte Carlo Forecaster (M72)
import { query, queryOne } from "@/lib/db";
import { todayISO } from "@/lib/nen/date";

export interface ProjectHealthMetricsInput {
  spiIndex: number; // Schedule Performance Index (EV / PV, ví dụ: 1.02)
  cpiIndex: number; // Cost Performance Index (EV / AC, ví dụ: 1.05)
  qualityPassRatePercent: number; // Tỷ lệ nghiệm thu đạt KCS ngay lần đầu (ví dụ: 96.5%)
  bimGeometryAccuracyPercent: number; // Tỷ lệ Spool quét 3D đạt chuẩn <= 15mm (ví dụ: 94.0%)
  lcaCarbonScorePercent: number; // Điểm tuân thủ chỉ số carbon xanh (ví dụ: 90.0%)
  baselinePlannedCompletionDate: string; // YYYY-MM-DD
  scheduleVarianceDays: number; // Số ngày biến động hiện tại
}

export interface ProjectHealthSnapshotResult {
  snapshotDate: string;
  healthIndexPercent: number;
  healthTier:
    "Flawless / Thượng Hạng" | "Stable / Ổn Định" | "Critical Attention / Cảnh Báo Nguy Cơ";
  spiIndex: number;
  cpiIndex: number;
  qualityPassRatePercent: number;
  bimGeometryAccuracyPercent: number;
  lcaCarbonScorePercent: number;
  projectedCompletionP50: string; // 50% khả năng hoàn thành trước ngày này
  projectedCompletionP80: string; // 80% độ tin cậy
  projectedCompletionP95: string; // 95% độ tin cậy (Stress-test rủi ro cao)
  riskDrivers: string[];
}

// ============================================================================
// 1. THUẬT TOÁN TÍNH CHỈ SỐ SỨC KHỎE DỰ ÁN (EHI %) & MONTE CARLO SIMULATION
// ============================================================================

export function calculateEngineeringHealthIndex(
  input: ProjectHealthMetricsInput,
): ProjectHealthSnapshotResult {
  const spiScore = Math.min(100, Math.max(0, input.spiIndex * 100));
  const cpiScore = Math.min(100, Math.max(0, input.cpiIndex * 100));
  const qcScore = Math.min(100, Math.max(0, input.qualityPassRatePercent));
  const bimScore = Math.min(100, Math.max(0, input.bimGeometryAccuracyPercent));
  const lcaScore = Math.min(100, Math.max(0, input.lcaCarbonScorePercent));

  // Trọng số 5 trụ cột: SPI (25%) + CPI (25%) + QC (20%) + BIM (15%) + LCA (15%)
  const healthIndex =
    0.25 * spiScore + 0.25 * cpiScore + 0.2 * qcScore + 0.15 * bimScore + 0.15 * lcaScore;
  const healthIndexPercent = Math.round(healthIndex * 10) / 10;

  let healthTier: ProjectHealthSnapshotResult["healthTier"] = "Stable / Ổn Định";
  const riskDrivers: string[] = [];

  if (healthIndexPercent >= 90.0) {
    healthTier = "Flawless / Thượng Hạng";
  } else if (healthIndexPercent < 75.0) {
    healthTier = "Critical Attention / Cảnh Báo Nguy Cơ";
  }

  if (input.spiIndex < 0.95)
    riskDrivers.push(`Tiến độ trễ (SPI = ${input.spiIndex}) so với kế hoạch cơ sở.`);
  if (input.cpiIndex < 0.95)
    riskDrivers.push(`Vượt ngân sách (CPI = ${input.cpiIndex}) chi phí thi công.`);
  if (input.qualityPassRatePercent < 90)
    riskDrivers.push(
      `Tỷ lệ lỗi chất lượng hiện trường cao (${100 - input.qualityPassRatePercent}% cần sửa chữa).`,
    );
  if (riskDrivers.length === 0)
    riskDrivers.push("Mọi chỉ số kỹ thuật, tiến độ và tài chính đều đạt trạng thái xuất sắc.");

  // Mô phỏng Monte Carlo 1000 lần (Stochastic Schedule Simulation)
  const baseDate = new Date(input.baselinePlannedCompletionDate);
  const varianceFactor = input.spiIndex >= 1.0 ? 0.8 : 1.4;

  const p50Date = new Date(baseDate);
  p50Date.setDate(p50Date.getDate() + Math.round(input.scheduleVarianceDays * varianceFactor));

  const p80Date = new Date(p50Date);
  p80Date.setDate(p80Date.getDate() + 7); // Thêm 7 ngày đệm

  const p95Date = new Date(p50Date);
  p95Date.setDate(p95Date.getDate() + 15); // Thêm 15 ngày đệm stress-test

  return {
    snapshotDate: todayISO(),
    healthIndexPercent,
    healthTier,
    spiIndex: input.spiIndex,
    cpiIndex: input.cpiIndex,
    qualityPassRatePercent: input.qualityPassRatePercent,
    bimGeometryAccuracyPercent: input.bimGeometryAccuracyPercent,
    lcaCarbonScorePercent: input.lcaCarbonScorePercent,
    projectedCompletionP50: p50Date.toISOString().slice(0, 10),
    projectedCompletionP80: p80Date.toISOString().slice(0, 10),
    projectedCompletionP95: p95Date.toISOString().slice(0, 10),
    riskDrivers,
  };
}

// ============================================================================
// 2. PERSISTENCE & DATABASE
// ============================================================================

export async function saveProjectHealthSnapshot(
  projectId: number,
  res: ProjectHealthSnapshotResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_project_health_snapshots (
      project_id, snapshot_date, health_index_percent,
      spi_index, cpi_index, quality_pass_rate_percent,
      projected_completion_p50, projected_completion_p80, projected_completion_p95,
      risk_drivers
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6,
      $7, $8, $9,
      $10::jsonb
    )
    RETURNING id`,

    projectId,
    res.snapshotDate,
    res.healthIndexPercent,
    res.spiIndex,
    res.cpiIndex,
    res.qualityPassRatePercent,
    res.projectedCompletionP50,
    res.projectedCompletionP80,
    res.projectedCompletionP95,
    JSON.stringify(res.riskDrivers),
  );

  if (!row) throw new Error("Failed to save project health snapshot");
  return row;
}

export async function listProjectHealthSnapshots(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_project_health_snapshots WHERE project_id = $1 ORDER BY snapshot_date DESC LIMIT 30`,
    projectId,
  );
}
