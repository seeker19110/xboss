// lib/engineering-scan-to-bim.ts — AI Reality Scan-to-BIM & Deviation Mesh Engine (M70 / M89)
// M89: Fix B1 (SQL placeholder $→?), B5 (nearest-neighbor thật), thêm closedLoopSync
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "crypto";

export interface ScannedPoint3D {
  pointId: string;
  x: number;
  y: number;
  z: number;
  intensity?: number;
}

export interface BimSpoolModel {
  spoolCode: string;
  discipline: string;
  systemCode: string;
  nominalSpec: string;
  designStartPoint: [number, number, number];
  designEndPoint: [number, number, number];
  lengthM: number;
}

export interface DeviationItem {
  spoolCode: string;
  discipline: string;
  designCoordinate: [number, number, number];
  actualScannedCoordinate: [number, number, number];
  deltaXMm: number;
  deltaYMm: number;
  deltaZMm: number;
  euclideanDeviationMm: number;
  toleranceThresholdMm: number;
  status: "within_tolerance" | "moderate_slope_warning" | "critical_clash_defect";
  remediationRecommendation: string;
}

export interface ScanToBimResult {
  scanCode: string;
  pointCloudSource: string;
  totalPointsScanned: number;
  spoolsAnalyzedCount: number;
  passRatePercent: number;
  maxDeviationMm: number;
  defectsCount: number;
  deviations: DeviationItem[];
}

// ============================================================================
// 1. NEAREST-NEIGHBOR MATCHING (Linear scan O(n))
// ============================================================================

export function findNearestScannedPoint(
  target: [number, number, number],
  points: ScannedPoint3D[],
): ScannedPoint3D | null {
  if (points.length === 0) return null;

  let nearest = points[0];
  let minDist = Math.sqrt(
    (points[0].x - target[0]) ** 2 +
      (points[0].y - target[1]) ** 2 +
      (points[0].z - target[2]) ** 2,
  );

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const dist = Math.sqrt(
      (pt.x - target[0]) ** 2 + (pt.y - target[1]) ** 2 + (pt.z - target[2]) ** 2,
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = pt;
    }
  }

  return nearest;
}

// ============================================================================
// 2. THUẬT TOÁN PHÂN TÍCH SAI LỆCH SCAN-VS-BIM & REMEDIATION ENGINE
// ============================================================================

export function analyzeScanVsBimDeviations(
  scanCode: string,
  pointCloudSource: string,
  spoolModels: BimSpoolModel[],
  scannedPoints: ScannedPoint3D[],
  toleranceThresholdMm = 15.0,
): ScanToBimResult {
  const deviations: DeviationItem[] = [];
  let maxDev = 0;
  let defects = 0;

  const availablePoints = [...scannedPoints];

  for (let i = 0; i < spoolModels.length; i++) {
    const spool = spoolModels[i];
    const target = spool.designStartPoint;

    const nearestPt = findNearestScannedPoint(target, availablePoints);

    const scanPt = nearestPt ?? {
      pointId: `PT-DESIGN-${i + 1}`,
      x: target[0],
      y: target[1],
      z: target[2],
    };

    if (nearestPt) {
      const idx = availablePoints.findIndex((p) => p.pointId === nearestPt.pointId);
      if (idx !== -1) availablePoints.splice(idx, 1);
    }

    const deltaX = Math.round((scanPt.x - target[0]) * 10) / 10;
    const deltaY = Math.round((scanPt.y - target[1]) * 10) / 10;
    const deltaZ = Math.round((scanPt.z - target[2]) * 10) / 10;

    const euclideanDev =
      Math.round(Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) * 10) / 10;

    if (euclideanDev > maxDev) maxDev = euclideanDev;

    let status: DeviationItem["status"] = "within_tolerance";
    let remediationRecommendation = "Thi công đạt chuẩn hình học thiết kế.";

    if (euclideanDev > 35.0) {
      status = "critical_clash_defect";
      defects++;
      remediationRecommendation = `LỆCH LỚN (${euclideanDev}mm): Nguy cơ va chạm kết cấu/trần thạch cao. Yêu cầu tháo dỡ nắn lại tuyến và điều chỉnh ty treo.`;
    } else if (euclideanDev > toleranceThresholdMm) {
      status = "moderate_slope_warning";
      defects++;
      remediationRecommendation = `CẢNH BÁO LỆCH (${euclideanDev}mm): Ảnh hưởng độ dốc thoát nước. Yêu cầu siết chỉnh đai ốc ty ren tăng/giảm ${Math.abs(deltaZ)}mm.`;
    }

    deviations.push({
      spoolCode: spool.spoolCode,
      discipline: spool.discipline,
      designCoordinate: spool.designStartPoint,
      actualScannedCoordinate: [scanPt.x, scanPt.y, scanPt.z],
      deltaXMm: deltaX,
      deltaYMm: deltaY,
      deltaZMm: deltaZ,
      euclideanDeviationMm: euclideanDev,
      toleranceThresholdMm,
      status,
      remediationRecommendation,
    });
  }

  const passCount = deviations.filter((d) => d.status === "within_tolerance").length;
  const passRatePercent =
    spoolModels.length > 0 ? Math.round((passCount / spoolModels.length) * 1000) / 10 : 100;

  return {
    scanCode,
    pointCloudSource,
    totalPointsScanned: scannedPoints.length,
    spoolsAnalyzedCount: spoolModels.length,
    passRatePercent,
    maxDeviationMm: maxDev,
    defectsCount: defects,
    deviations,
  };
}

// ============================================================================
// 3. CLOSED-LOOP SYNC ENGINE (WBS → IPC Payment)
// ============================================================================

export async function closedLoopSyncSpoolToWbs(
  projectId: number,
  spoolId: string,
  wbsTaskId: number,
  syncedQty: number,
  syncedAmountVnd: number,
): Promise<string> {
  const syncCode = `SYNC-${Date.now()}-${spoolId.slice(0, 8).toUpperCase()}`;
  const provenanceToken = createHash("sha256")
    .update(
      JSON.stringify({
        projectId,
        spoolId,
        wbsTaskId,
        syncedQty,
        syncedAmountVnd,
        syncCode,
        ts: new Date().toISOString(),
      }),
    )
    .digest("hex")
    .substring(0, 32)
    .toUpperCase();

  await run(
    `INSERT INTO engineering_closed_loop_sync_logs
      (project_id, sync_code, spool_id, wbs_task_id, synced_qty, synced_amount_vnd, provenance_token)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, sync_code) DO NOTHING`,
    [projectId, syncCode, spoolId, wbsTaskId, syncedQty, syncedAmountVnd, provenanceToken],
  );

  return provenanceToken;
}

// ============================================================================
// 4. PERSISTENCE & DATABASE (B1 Fix: $1,$2 → ?)
// ============================================================================

export async function saveScanToBimRun(
  projectId: number,
  res: ScanToBimResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_scan_to_bim_runs (
      project_id, scan_code, point_cloud_source, total_points_scanned,
      spools_analyzed_count, pass_rate_percent, max_deviation_mm,
      defects_count, deviation_details
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?::jsonb
    )
    ON CONFLICT (project_id, scan_code) DO UPDATE SET
      pass_rate_percent = EXCLUDED.pass_rate_percent,
      max_deviation_mm = EXCLUDED.max_deviation_mm,
      defects_count = EXCLUDED.defects_count,
      deviation_details = EXCLUDED.deviation_details
    RETURNING id`,
    [
      projectId,
      res.scanCode,
      res.pointCloudSource,
      res.totalPointsScanned,
      res.spoolsAnalyzedCount,
      res.passRatePercent,
      res.maxDeviationMm,
      res.defectsCount,
      JSON.stringify(res.deviations),
    ],
  );

  if (!row) throw new Error("Failed to save Scan-to-BIM run");
  return row;
}

export async function listScanToBimRuns(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_scan_to_bim_runs
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [projectId],
  );
}
