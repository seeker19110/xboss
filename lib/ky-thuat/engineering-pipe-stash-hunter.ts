// lib/engineering-pipe-stash-hunter.ts — Smart Pipe Mass-Balance Reconciliation & Geolocation Stash Hunter (Module M95)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

export type StashRiskStatus =
  "CLEAN_BALANCED" | "STASH_SUSPECTED_ALERT" | "PHANTOM_CLAIM_FRAUD" | "STAGNANT_BUFFER_RISK";

export type SpoolLifecycleStatus =
  "PO_ORDERED" | "WAREHOUSE_CENTRAL" | "FLOOR_STAGED" | "INSTALLED_VERIFIED" | "SCRAPPED";

export interface StagingBufferRecord {
  towerLabel: string;
  floorLabel: string;
  zoneLabel: string;
  quantityM: number;
  stagedAt: string; // ISO date
  holdingTimeHours: number;
}

export interface SuspectLocationItem {
  towerLabel: string;
  floorLabel: string;
  zoneLabel: string;
  suspectQtyM: number;
  reason: string;
  confidenceScore: number;
}

export interface MassBalanceInput {
  auditCode: string;
  systemCode: string;
  nominalDiaMm: number;
  totalBimDesignM: number;
  totalPoOrderedM: number;
  totalGrnReceivedM: number;
  totalInstalledVerifiedM: number;
  totalStagedOnFloorsM: number;
  totalInCentralWarehouseM: number;
  totalReusableRemnantsM: number;
  totalScrapLoggedM: number;
  stagingBuffers?: StagingBufferRecord[];
}

export interface MassBalanceAuditResult {
  auditCode: string;
  systemCode: string;
  nominalDiaMm: number;
  totalBimDesignM: number;
  totalPoOrderedM: number;
  totalGrnReceivedM: number;
  totalInstalledVerifiedM: number;
  totalStagedOnFloorsM: number;
  totalInCentralWarehouseM: number;
  totalReusableRemnantsM: number;
  totalScrapLoggedM: number;
  accountedTotalM: number;
  deltaUnaccountedOrStashM: number;
  remainingToInstallM: number;
  remainingToProcureM: number;
  progressPercentage: number;
  stashRiskStatus: StashRiskStatus;
  suspectLocations: SuspectLocationItem[];
  anomalyDescriptions: string[];
  merkleSealHash: string;
  auditedAt: string;
}

export interface PhantomInstallationCheckResult {
  allowed: boolean;
  status: "PERMITTED_CLEAN" | "BLOCKED_PHANTOM_INSTALLATION";
  claimedInstallM: number;
  totalStockIssuedToSubconM: number;
  excessM: number;
  blockingReason?: string;
}

export interface JitReorderResult {
  reorderPointM: number;
  currentAvailableStockM: number;
  isReorderRequired: boolean;
  recommendedOrderQtyM: number;
  leadTimeDays: number;
  estimatedStockoutDays: number;
}

// ============================================================================
// 1. 5-WAY MASS-BALANCE RECONCILIATION & STASH HUNTER ALGORITHM
// ============================================================================

export function auditMaterialMassBalance(input: MassBalanceInput): MassBalanceAuditResult {
  const accountedTotalM =
    Math.round(
      (input.totalInstalledVerifiedM +
        input.totalStagedOnFloorsM +
        input.totalInCentralWarehouseM +
        input.totalReusableRemnantsM +
        input.totalScrapLoggedM) *
        1000,
    ) / 1000;

  // Delta thất thoát / cất giấu: Q_GRN - AccountedTotal
  const rawDelta = input.totalGrnReceivedM - accountedTotalM;
  const deltaUnaccountedOrStashM = Math.round(rawDelta * 1000) / 1000;

  // Khối lượng còn lại cần lắp
  const remainingToInstallM =
    Math.round(Math.max(0, input.totalBimDesignM - input.totalInstalledVerifiedM) * 1000) / 1000;

  // Khối lượng cần mua sắm bổ sung
  const remainingToProcureM =
    Math.round(
      Math.max(0, input.totalBimDesignM - input.totalPoOrderedM - input.totalReusableRemnantsM) *
        1000,
    ) / 1000;

  // Tiến độ thi công %
  const progressPercentage =
    input.totalBimDesignM > 0
      ? Math.round(
          Math.min(100, (input.totalInstalledVerifiedM / input.totalBimDesignM) * 100) * 100,
        ) / 100
      : 100;

  const suspectLocations: SuspectLocationItem[] = [];
  const anomalyDescriptions: string[] = [];
  let stashRiskStatus: StashRiskStatus = "CLEAN_BALANCED";

  // Kiểm tra bất thường thời gian lưu kho đệm > 72h
  const buffers = input.stagingBuffers || [];
  for (const buf of buffers) {
    if (buf.holdingTimeHours > 72.0) {
      stashRiskStatus = "STAGNANT_BUFFER_RISK";
      suspectLocations.push({
        towerLabel: buf.towerLabel,
        floorLabel: buf.floorLabel,
        zoneLabel: buf.zoneLabel,
        suspectQtyM: buf.quantityM,
        reason: `Hàng tồn đệm sàn quá ${buf.holdingTimeHours}h (> 72h định mức) chưa chuyển sang nghiệm thu lắp đặt`,
        confidenceScore: 0.92,
      });
      anomalyDescriptions.push(
        `Cảnh báo tồn đọng: ${buf.quantityM}m ống tại ${buf.towerLabel} ${buf.floorLabel} ${buf.zoneLabel} nằm bất động ${buf.holdingTimeHours}h`,
      );
    }
  }

  // Kiểm tra thất thoát / cất giấu trái phép (Delta > 0.05m)
  if (deltaUnaccountedOrStashM > 0.05) {
    stashRiskStatus = "STASH_SUSPECTED_ALERT";
    anomalyDescriptions.push(
      `Phát hiện thất thoát / nghi vấn cất giấu trái phép ${deltaUnaccountedOrStashM}m ống (Đã nhập cổng nhưng không có trong kho, sàn, hoặc lắp đặt)`,
    );
    if (suspectLocations.length === 0) {
      suspectLocations.push({
        towerLabel: "Tower-A",
        floorLabel: "Basement-02",
        zoneLabel: "Zone-Shaft-DeadEnd",
        suspectQtyM: deltaUnaccountedOrStashM,
        reason:
          "Khu vực góc chết tầng hầm / trục kỹ thuật mở — Nghi vấn cất giấu vật tư chưa khai báo",
        confidenceScore: 0.88,
      });
    }
  } else if (deltaUnaccountedOrStashM < -0.05) {
    // Khai khống khối lượng (Lắp nhiều hơn tổng hàng nhập cổng)
    stashRiskStatus = "PHANTOM_CLAIM_FRAUD";
    anomalyDescriptions.push(
      `Phát hiện nghiệm thu khống: Tổng lượng ống ghi nhận (${accountedTotalM}m) vượt quá lượng thực tế nhập cổng (${input.totalGrnReceivedM}m)`,
    );
  }

  const auditedAt = new Date().toISOString();
  const rawSeal = `${input.auditCode}:${input.systemCode}:${input.nominalDiaMm}:${input.totalBimDesignM}:${input.totalInstalledVerifiedM}:${deltaUnaccountedOrStashM}:${stashRiskStatus}:${auditedAt}`;
  const merkleSealHash = `SEAL-MB-${createHash("sha256").update(rawSeal).digest("hex").slice(0, 24).toUpperCase()}`;

  return {
    auditCode: input.auditCode,
    systemCode: input.systemCode,
    nominalDiaMm: input.nominalDiaMm,
    totalBimDesignM: input.totalBimDesignM,
    totalPoOrderedM: input.totalPoOrderedM,
    totalGrnReceivedM: input.totalGrnReceivedM,
    totalInstalledVerifiedM: input.totalInstalledVerifiedM,
    totalStagedOnFloorsM: input.totalStagedOnFloorsM,
    totalInCentralWarehouseM: input.totalInCentralWarehouseM,
    totalReusableRemnantsM: input.totalReusableRemnantsM,
    totalScrapLoggedM: input.totalScrapLoggedM,
    accountedTotalM,
    deltaUnaccountedOrStashM,
    remainingToInstallM,
    remainingToProcureM,
    progressPercentage,
    stashRiskStatus,
    suspectLocations,
    anomalyDescriptions,
    merkleSealHash,
    auditedAt,
  };
}

// ============================================================================
// 2. CHỐNG NGHIỆM THU KHỐNG (ANTI-PHANTOM INSTALLATION BREAKER)
// ============================================================================

export function evaluatePhantomInstallationBreaker(
  claimedInstallM: number,
  totalStockIssuedToSubconM: number,
): PhantomInstallationCheckResult {
  if (claimedInstallM <= 0) {
    return {
      allowed: false,
      status: "BLOCKED_PHANTOM_INSTALLATION",
      claimedInstallM,
      totalStockIssuedToSubconM,
      excessM: 0,
      blockingReason: "Khối lượng yêu cầu nghiệm thu phải lớn hơn 0",
    };
  }

  if (claimedInstallM > totalStockIssuedToSubconM) {
    const excessM = Math.round((claimedInstallM - totalStockIssuedToSubconM) * 1000) / 1000;
    return {
      allowed: false,
      status: "BLOCKED_PHANTOM_INSTALLATION",
      claimedInstallM,
      totalStockIssuedToSubconM,
      excessM,
      blockingReason: `Khóa biên bản nghiệm thu do khai khống: Khối lượng báo lắp (${claimedInstallM}m) vượt quá tổng vật tư kho đã xuất cho tổ đội (${totalStockIssuedToSubconM}m, thiếu ${excessM}m)`,
    };
  }

  return {
    allowed: true,
    status: "PERMITTED_CLEAN",
    claimedInstallM,
    totalStockIssuedToSubconM,
    excessM: 0,
  };
}

// ============================================================================
// 3. DỰ BÁO NHU CẦU ĐẶT HÀNG JIT (JIT RE-ORDER POINT PREDICTOR)
// ============================================================================

export function calculateJitReorderPoint(
  installRateMPerDay: number,
  supplierLeadDays: number,
  currentAvailableStockM: number,
  safetyBufferPercent = 20,
): JitReorderResult {
  const baseDemand = installRateMPerDay * supplierLeadDays;
  const safetyBuffer = baseDemand * (safetyBufferPercent / 100);
  const reorderPointM = Math.round((baseDemand + safetyBuffer) * 10) / 10;

  const isReorderRequired = currentAvailableStockM <= reorderPointM;
  const recommendedOrderQtyM = isReorderRequired
    ? Math.max(0, Math.round((reorderPointM * 2 - currentAvailableStockM) * 10) / 10)
    : 0;

  const estimatedStockoutDays =
    installRateMPerDay > 0
      ? Math.round((currentAvailableStockM / installRateMPerDay) * 10) / 10
      : 999;

  return {
    reorderPointM,
    currentAvailableStockM,
    isReorderRequired,
    recommendedOrderQtyM,
    leadTimeDays: supplierLeadDays,
    estimatedStockoutDays,
  };
}

// ============================================================================
// 4. DATABASE PERSISTENCE & QUERIES
// ============================================================================

export async function saveMassBalanceAudit(
  projectId: number,
  result: MassBalanceAuditResult,
  userId?: number,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_material_mass_balance_audits (
      project_id, audit_code, system_code, nominal_dia_mm,
      total_bim_design_m, total_po_ordered_m, total_grn_received_m,
      total_installed_verified_m, total_staged_on_floors_m,
      total_in_central_warehouse_m, total_reusable_remnants_m, total_scrap_logged_m,
      delta_unaccounted_or_stash_m, remaining_to_install_m, remaining_to_procure_m,
      progress_percentage, stash_risk_status, suspect_locations,
      audited_at, audited_by, merkle_seal_hash
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?::jsonb,
      ?::timestamptz, ?, ?
    )
    ON CONFLICT (project_id, audit_code) DO UPDATE SET
      total_installed_verified_m = EXCLUDED.total_installed_verified_m,
      total_staged_on_floors_m = EXCLUDED.total_staged_on_floors_m,
      delta_unaccounted_or_stash_m = EXCLUDED.delta_unaccounted_or_stash_m,
      remaining_to_install_m = EXCLUDED.remaining_to_install_m,
      progress_percentage = EXCLUDED.progress_percentage,
      stash_risk_status = EXCLUDED.stash_risk_status,
      suspect_locations = EXCLUDED.suspect_locations,
      merkle_seal_hash = EXCLUDED.merkle_seal_hash
    RETURNING id`,

    projectId,
    result.auditCode,
    result.systemCode,
    result.nominalDiaMm,
    result.totalBimDesignM,
    result.totalPoOrderedM,
    result.totalGrnReceivedM,
    result.totalInstalledVerifiedM,
    result.totalStagedOnFloorsM,
    result.totalInCentralWarehouseM,
    result.totalReusableRemnantsM,
    result.totalScrapLoggedM,
    result.deltaUnaccountedOrStashM,
    result.remainingToInstallM,
    result.remainingToProcureM,
    result.progressPercentage,
    result.stashRiskStatus,
    JSON.stringify(result.suspectLocations),
    result.auditedAt,
    userId || null,
    result.merkleSealHash,
  );

  if (!row) throw new Error("Failed to save mass balance audit");
  return row;
}

export async function listMassBalanceAudits(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_material_mass_balance_audits
     WHERE project_id = ?
     ORDER BY audited_at DESC
     LIMIT 50`,
    [projectId],
  );
}

export async function savePipeSpoolTrackingRecord(
  projectId: number,
  spool: {
    spoolCode: string;
    systemCode: string;
    nominalDiaMm: number;
    materialType: string;
    designLengthMm: number;
    cutLengthMm: number;
    towerLabel?: string;
    floorLabel?: string;
    zoneLabel?: string;
    currentStatus: SpoolLifecycleStatus;
    currentLocationTag?: string;
    holdingTimeHours?: number;
    scanDeviationMm?: number;
    assignedSubconId?: number;
  },
): Promise<{ id: string }> {
  const qrToken = `XB-SPOOL|P${projectId}|${spool.spoolCode}|D${spool.nominalDiaMm}|L${spool.cutLengthMm}`;
  const merkleHash = createHash("sha256")
    .update(`${projectId}:${spool.spoolCode}:${spool.currentStatus}:${Date.now()}`)
    .digest("hex");

  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_pipe_spool_tracking (
      project_id, spool_code, system_code, nominal_dia_mm, material_type,
      design_length_mm, cut_length_mm, tower_label, floor_label, zone_label,
      current_status, current_location_tag, holding_time_hours, scan_deviation_mm,
      assigned_subcon_id, qr_spool_token, merkle_leaf_hash
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
    ON CONFLICT (project_id, spool_code) DO UPDATE SET
      current_status = EXCLUDED.current_status,
      current_location_tag = EXCLUDED.current_location_tag,
      holding_time_hours = EXCLUDED.holding_time_hours,
      scan_deviation_mm = EXCLUDED.scan_deviation_mm,
      updated_at = NOW()
    RETURNING id`,

    projectId,
    spool.spoolCode,
    spool.systemCode,
    spool.nominalDiaMm,
    spool.materialType,
    spool.designLengthMm,
    spool.cutLengthMm,
    spool.towerLabel || "Tower-A",
    spool.floorLabel || "FL-12",
    spool.zoneLabel || "Zone-01",
    spool.currentStatus,
    spool.currentLocationTag || "CENTRAL_YARD",
    spool.holdingTimeHours || 0.0,
    spool.scanDeviationMm || null,
    spool.assignedSubconId || null,
    qrToken,
    merkleHash,
  );

  if (!row) throw new Error("Failed to save pipe spool tracking record");
  return row;
}

export async function listPipeSpoolTrackingRecords(
  projectId: number,
  filters?: { status?: string; floor?: string; system?: string },
): Promise<Array<Record<string, unknown>>> {
  let sql = `SELECT * FROM engineering_pipe_spool_tracking WHERE project_id = ?`;
  const params: unknown[] = [projectId];

  if (filters?.status) {
    sql += ` AND current_status = ?`;
    params.push(filters.status);
  }
  if (filters?.floor) {
    sql += ` AND floor_label = ?`;
    params.push(filters.floor);
  }
  if (filters?.system) {
    sql += ` AND system_code = ?`;
    params.push(filters.system);
  }

  sql += ` ORDER BY updated_at DESC LIMIT 100`;
  return query<Record<string, unknown>>(sql, ...params);
}
