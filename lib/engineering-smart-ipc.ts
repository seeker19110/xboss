// lib/engineering-smart-ipc.ts — Instant 60s Gated Smart IPC Payment Release Engine (Module M94)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

export interface SmartIpcGatingCriteria {
  scanToBimMaxDevMm: number; // Max deviation <= 15mm
  bbntSigned3Parties: boolean; // True
  iotPressureDropBar: number; // 0.00 bar drop
  iotTestDurationHours: number; // >= 2.0 hours
  claimedQty: number;
  approvedBoqQty: number;
  warehouseUsedQty: number;
}

export interface SmartIpcCalculationInput {
  ipcNumber: string;
  periodMonth: string;
  contractorName: string;
  grossClaimedVnd: number;
  retentionPercent?: number; // default 5.0%
  gating: SmartIpcGatingCriteria;
}

export interface SmartIpcResult {
  ipcNumber: string;
  periodMonth: string;
  contractorName: string;
  grossClaimedVnd: number;
  retentionAmountVnd: number;
  netPayableVnd: number;
  gate1GeometryPassed: boolean;
  gate2BbntSignedPassed: boolean;
  gate3HydroIotPassed: boolean;
  gate4QuadReconcilePassed: boolean;
  allGatesCleared: boolean;
  blockedGateReasons: string[];
  merkleSealHash: string;
  bankingPaymentPayload: Record<string, unknown>;
  paymentStatus: "released" | "held_by_gates";
  releasedAt: string;
}

// ============================================================================
// 1. 4-GATE VERIFICATION & INSTANT SMART IPC RELEASE
// ============================================================================

export function processSmartIpcRelease(input: SmartIpcCalculationInput): SmartIpcResult {
  const g = input.gating;
  const blockedReasons: string[] = [];

  // Gate 1: Hình học Scan-to-BIM sai lệch <= 15mm
  const gate1 = g.scanToBimMaxDevMm <= 15.0;
  if (!gate1) {
    blockedReasons.push(
      `Gate 1 thất bại: Sai lệch hình học Scan-to-BIM (${g.scanToBimMaxDevMm}mm > 15.0mm)`,
    );
  }

  // Gate 2: Pháp lý BBNT ký số 3 bên
  const gate2 = g.bbntSigned3Parties === true;
  if (!gate2) {
    blockedReasons.push("Gate 2 thất bại: Chưa có đủ chữ ký số 3 bên (Nhà thầu - TVGS - CĐT)");
  }

  // Gate 3: Thử nghiệm IoT Thủy tĩnh (giữ áp >= 2h, không sụt áp)
  const gate3 = g.iotPressureDropBar <= 0.01 && g.iotTestDurationHours >= 2.0;
  if (!gate3) {
    blockedReasons.push(
      `Gate 3 thất bại: Thử áp thủy tĩnh IoT không đạt (sụt áp ${g.iotPressureDropBar} bar, thời gian ${g.iotTestDurationHours}h)`,
    );
  }

  // Gate 4: Đối soát định lượng không vượt hạn mức BOQ và vật tư thực tế
  const gate4 = g.claimedQty <= g.approvedBoqQty && g.claimedQty <= g.warehouseUsedQty;
  if (!gate4) {
    blockedReasons.push(
      `Gate 4 thất bại: Khối lượng vượt hạn mức BOQ (${g.claimedQty} > ${g.approvedBoqQty}) hoặc vượt vật tư kho (${g.claimedQty} > ${g.warehouseUsedQty})`,
    );
  }

  const allGatesCleared = gate1 && gate2 && gate3 && gate4;
  const retentionRate = (input.retentionPercent ?? 5.0) / 100;
  const retentionAmountVnd = Math.round(input.grossClaimedVnd * retentionRate);
  const netPayableVnd = allGatesCleared ? input.grossClaimedVnd - retentionAmountVnd : 0;

  const releasedAt = new Date().toISOString();
  const rawSeal = `${input.ipcNumber}:${input.contractorName}:${input.grossClaimedVnd}:${netPayableVnd}:${allGatesCleared}:${releasedAt}`;
  const merkleSealHash = `SEAL-IPC-${createHash("sha256").update(rawSeal).digest("hex").slice(0, 24).toUpperCase()}`;

  const bankingPaymentPayload = allGatesCleared
    ? {
        bankCode: "VCB",
        beneficiaryAccount: "98877665544",
        beneficiaryName: input.contractorName.toUpperCase(),
        amountVnd: netPayableVnd,
        referenceMessage: `THANH TOAN SMART IPC ${input.ipcNumber} THANG ${input.periodMonth}`,
        merkleSeal: merkleSealHash,
        authorizedAt: releasedAt,
      }
    : {};

  return {
    ipcNumber: input.ipcNumber,
    periodMonth: input.periodMonth,
    contractorName: input.contractorName,
    grossClaimedVnd: input.grossClaimedVnd,
    retentionAmountVnd,
    netPayableVnd,
    gate1GeometryPassed: gate1,
    gate2BbntSignedPassed: gate2,
    gate3HydroIotPassed: gate3,
    gate4QuadReconcilePassed: gate4,
    allGatesCleared,
    blockedGateReasons: blockedReasons,
    merkleSealHash,
    bankingPaymentPayload,
    paymentStatus: allGatesCleared ? "released" : "held_by_gates",
    releasedAt,
  };
}

// ============================================================================
// 2. DATABASE PERSISTENCE & QUERIES
// ============================================================================

export async function saveSmartIpcRecord(
  projectId: number,
  result: SmartIpcResult,
  userId?: number,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_smart_ipc_records (
      project_id, ipc_number, period_month, contractor_name,
      gross_claimed_vnd, net_payable_vnd, retention_amount_vnd,
      gate1_geometry_passed, gate2_bbnt_signed_passed, gate3_hydro_iot_passed,
      gate4_quad_reconcile_passed, all_gates_cleared, merkle_seal_hash,
      banking_payment_payload, payment_status, released_at, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?::jsonb, ?, ?::timestamptz, ?
    )
    ON CONFLICT (project_id, ipc_number) DO UPDATE SET
      net_payable_vnd = EXCLUDED.net_payable_vnd,
      all_gates_cleared = EXCLUDED.all_gates_cleared,
      payment_status = EXCLUDED.payment_status,
      merkle_seal_hash = EXCLUDED.merkle_seal_hash
    RETURNING id`,
    [
      projectId,
      result.ipcNumber,
      result.periodMonth,
      result.contractorName,
      result.grossClaimedVnd,
      result.netPayableVnd,
      result.retentionAmountVnd,
      result.gate1GeometryPassed,
      result.gate2BbntSignedPassed,
      result.gate3HydroIotPassed,
      result.gate4QuadReconcilePassed,
      result.allGatesCleared,
      result.merkleSealHash,
      JSON.stringify(result.bankingPaymentPayload),
      result.paymentStatus,
      result.releasedAt,
      userId || null,
    ],
  );

  if (!row) throw new Error("Failed to save smart IPC record");
  return row;
}

export async function listSmartIpcRecords(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_smart_ipc_records
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [projectId],
  );
}
