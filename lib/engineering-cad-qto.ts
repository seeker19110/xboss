// lib/engineering-cad-qto.ts — Closed-Loop CAD-QTO-Tracking Engine (M66 / M89)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "crypto";

export type SpoolStatus = "fabricated" | "delivered" | "installed" | "qc_passed" | "bbnt_approved";

export const SPOOL_MILESTONE_WEIGHTS: Record<SpoolStatus, number> = {
  fabricated: 0.2,
  delivered: 0.4,
  installed: 0.75,
  qc_passed: 0.9,
  bbnt_approved: 1.0,
};

export const SPOOL_STATUS_COLORS: Record<SpoolStatus, string> = {
  fabricated: "#a1a1aa", // zinc-400
  delivered: "#38bdf8", // sky-400
  installed: "#fbbf24", // amber-400
  qc_passed: "#818cf8", // indigo-400
  bbnt_approved: "#34d399", // emerald-400
};

export interface CadSpoolRecord {
  id: string;
  project_id: number;
  drawing_id: number | null;
  spool_code: string;
  discipline: string;
  system_code: string;
  floor_label: string;
  zone_label: string;
  dimension_spec: string;
  length_m: number;
  calculated_qty: number;
  unit: string;
  boq_item_id: number | null;
  task_id: number | null;
  status: SpoolStatus;
  inspection_request_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface QtoVarianceSummary {
  boqItemId: number;
  boqCode: string;
  boqName: string;
  unit: string;
  qtyContract: number;
  qtyShopCad: number;
  qtyInstalled: number;
  qtyApprovedBbnt: number;
  deltaVoQty: number;
  estimatedVoVnd: number;
  unitRateVnd: number;
  status: "normal" | "vo_risk" | "over_norm" | "critical_variance";
  riskMessage: string;
}

// ============================================================================
// 1. THUẬT TOÁN ĐO BÓC HÌNH HỌC 5D AUTO-QTO
// ============================================================================

export function calculateDuctQtoM2(
  widthMm: number,
  heightMm: number,
  lengthM: number,
  flangeBufferPercent = 0.05,
): number {
  if (widthMm <= 0 || heightMm <= 0 || lengthM <= 0) return 0;
  const perimeterM = (2 * (widthMm + heightMm)) / 1000;
  const rawArea = perimeterM * lengthM;
  const totalArea = rawArea * (1 + flangeBufferPercent);
  return Math.round(totalArea * 1000) / 1000;
}

export function calculatePipeQtoM(lengthM: number): number {
  return Math.max(0, Math.round(lengthM * 1000) / 1000);
}

// ============================================================================
// 2. TÍNH TOÁN EARNED VALUE KHỐI LƯỢNG THỰC TẾ (PHYSICAL EV QTO)
// ============================================================================

export function calculatePhysicalEarnedValue(
  spools: Array<{ calculated_qty: number | string; status: SpoolStatus }>,
): {
  earnedQty: number;
  totalPlannedQty: number;
  percentComplete: number;
} {
  let earned = 0;
  let total = 0;

  for (const s of spools) {
    const qty = Number(s.calculated_qty) || 0;
    const weight = SPOOL_MILESTONE_WEIGHTS[s.status] || 0;
    total += qty;
    earned += qty * weight;
  }

  const pct = total > 0 ? (earned / total) * 100 : 0;

  return {
    earnedQty: Math.round(earned * 1000) / 1000,
    totalPlannedQty: Math.round(total * 1000) / 1000,
    percentComplete: Math.round(pct * 10) / 10,
  };
}

// ============================================================================
// 3. MA TRẬN ĐỐI SOÁT KHỐI LƯỢNG 3 CHIỀU & DỰ BÁO PHÁT SINH (3-WAY VARIANCE)
// ============================================================================

export function compute3WayVariance(
  contractQty: number,
  shopQty: number,
  installedQty: number,
  approvedQty: number,
  unitRateVnd = 500000,
): {
  deltaVoQty: number;
  estimatedVoVnd: number;
  status: "normal" | "vo_risk" | "over_norm" | "critical_variance";
  riskMessage: string;
} {
  const deltaVo = shopQty - contractQty;
  const estimatedVo = Math.max(0, deltaVo * unitRateVnd);

  let status: "normal" | "vo_risk" | "over_norm" | "critical_variance" = "normal";
  let riskMessage = "Khối lượng thi công khớp đúng theo hợp đồng và bản vẽ.";

  if (deltaVo > 0) {
    if (deltaVo / Math.max(1, contractQty) > 0.15) {
      status = "critical_variance";
      riskMessage = `Bản vẽ Shopdrawing vượt >15% khối lượng hợp đồng BOQ (Phát sinh +${deltaVo.toFixed(2)} đơn vị). Cần lập hồ sơ VO khẩn cấp.`;
    } else {
      status = "vo_risk";
      riskMessage = `Bản vẽ Shopdrawing phát sinh +${deltaVo.toFixed(2)} đơn vị so với BOQ. Dự kiến phát sinh ${estimatedVo.toLocaleString("vi-VN")} đ.`;
    }
  } else if (installedQty > shopQty * 1.05) {
    status = "over_norm";
    riskMessage = `Khối lượng lắp đặt hiện trường vượt quá bản vẽ Shop (>5% hao hụt). Cảnh báo thất thoát vật tư.`;
  }

  return {
    deltaVoQty: Math.round(deltaVo * 1000) / 1000,
    estimatedVoVnd: Math.round(estimatedVo),
    status,
    riskMessage,
  };
}

// ============================================================================
// 4. DATABASE QUERIES & CRUD
// ============================================================================

export async function listCadSpools(
  projectId: number,
  filters?: { floor?: string; discipline?: string; status?: string },
): Promise<CadSpoolRecord[]> {
  let sql = `SELECT * FROM engineering_cad_spools WHERE project_id = ?`;
  const params: unknown[] = [projectId];

  if (filters?.floor) {
    sql += ` AND floor_label = ?`;
    params.push(filters.floor);
  }
  if (filters?.discipline) {
    sql += ` AND discipline = ?`;
    params.push(filters.discipline);
  }
  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }

  sql += ` ORDER BY spool_code ASC`;
  return await query<CadSpoolRecord>(sql, params);
}

export async function updateSpoolProgressStage(
  projectId: number,
  spoolId: string,
  newStatus: SpoolStatus,
): Promise<CadSpoolRecord | null> {
  await run(
    `UPDATE engineering_cad_spools 
     SET status = ?, updated_at = NOW() 
     WHERE id = ? AND project_id = ?`,
    [newStatus, spoolId, projectId],
  );

  const spool = await queryOne<CadSpoolRecord>(
    `SELECT * FROM engineering_cad_spools WHERE id = ? AND project_id = ?`,
    [spoolId, projectId],
  );

  return spool || null;
}

export async function upsertQtoVariance(
  projectId: number,
  boqItemId: number,
  qtyContract: number,
  qtyShopCad: number,
  qtyInstalled: number,
  qtyApprovedBbnt: number,
  estimatedVoVnd: number,
  status: "normal" | "vo_risk" | "over_norm" | "critical_variance",
): Promise<void> {
  await run(
    `INSERT INTO engineering_cad_qto_variances (
      project_id, boq_item_id, qty_contract, qty_shop_cad, qty_installed,
      qty_approved_bbnt, estimated_vo_vnd, status
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )
    ON CONFLICT (project_id, boq_item_id) DO UPDATE SET
      qty_contract = EXCLUDED.qty_contract,
      qty_shop_cad = EXCLUDED.qty_shop_cad,
      qty_installed = EXCLUDED.qty_installed,
      qty_approved_bbnt = EXCLUDED.qty_approved_bbnt,
      estimated_vo_vnd = EXCLUDED.estimated_vo_vnd,
      status = EXCLUDED.status`,
    [
      projectId,
      boqItemId,
      qtyContract,
      qtyShopCad,
      qtyInstalled,
      qtyApprovedBbnt,
      estimatedVoVnd,
      status,
    ],
  );
}

export async function generateInspectionRequestForSpools(
  projectId: number,
  spoolIds: string[],
  userId: number,
  note?: string,
): Promise<{ inspectionRequestId: number; code: string; totalQty: number; spoolCount: number }> {
  if (spoolIds.length === 0) {
    throw new Error("Cần chọn ít nhất 1 Spool để lập yêu cầu nghiệm thu.");
  }

  // 1. Tạo mã YCNT mới
  const code = `YCNT-CAD-${Date.now().toString().slice(-6)}`;
  const scheduledAt = new Date().toISOString();

  const insertRow = await queryOne<{ id: number }>(
    `INSERT INTO inspection_requests (code, scheduled_at, status, note, created_by)
     VALUES (?, ?, 'sent', ?, ?)
     RETURNING id`,
    [code, scheduledAt, note || "Nghiệm thu khối lượng phân đoạn CAD Spools", userId],
  );

  const insId = Number(insertRow?.id || 0);

  // 2. Gán inspection_request_id cho các spools và chuyển trạng thái sang qc_passed
  for (const sId of spoolIds) {
    await run(
      `UPDATE engineering_cad_spools 
       SET inspection_request_id = ?, status = 'qc_passed', updated_at = NOW() 
       WHERE id = ? AND project_id = ?`,
      [insId, sId, projectId],
    );
  }

  const sumRes = await queryOne<{ total: string | number }>(
    `SELECT COALESCE(SUM(calculated_qty), 0) as total FROM engineering_cad_spools WHERE inspection_request_id = ?`,
    [insId],
  );

  return {
    inspectionRequestId: insId,
    code,
    totalQty: Number(sumRes?.total || 0),
    spoolCount: spoolIds.length,
  };
}

// ============================================================================
// 5. XUẤT BIÊN BẢN NGHIỆM THU ĐIỆN TỬ (ELECTRONIC BBNT NĐ 06/2021/NĐ-CP)
// ============================================================================

export interface ElectronicBbntDocument {
  bbntNumber: string;
  projectName: string;
  inspectionDate: string;
  standardReference: string;
  participants: {
    investorSupervisor: string;
    generalContractorPM: string;
    mepfSubcontractorLeader: string;
  };
  workPackageDescription: string;
  totalSpoolCount: number;
  totalCalculatedQty: number;
  unit: string;
  spoolAppendix: Array<{
    spoolCode: string;
    discipline: string;
    systemCode: string;
    floor: string;
    zone: string;
    dimensionSpec: string;
    qty: number;
    unit: string;
    kcsStatus: string;
  }>;
  complianceVerdict: string;
  provenanceHash: string;
  cryptographicSignatureToken: string;
}

export function generateElectronicBbntDocument(
  projectName: string,
  spools: CadSpoolRecord[],
  signatoryUser: { name: string; role: string },
): ElectronicBbntDocument {
  const bbntNumber = `BBNT-MEPF-${Date.now().toString(36).toUpperCase()}`;
  const totalQty = spools.reduce((sum, s) => sum + Number(s.calculated_qty || 0), 0);
  const primaryUnit = spools[0]?.unit || "m";
  const primaryDiscipline = spools[0]?.discipline || "MEPF";

  const appendix = spools.map((s) => ({
    spoolCode: s.spool_code,
    discipline: s.discipline.toUpperCase(),
    systemCode: s.system_code,
    floor: s.floor_label,
    zone: s.zone_label,
    dimensionSpec: s.dimension_spec,
    qty: Number(s.calculated_qty),
    unit: s.unit,
    kcsStatus: "ĐẠT CHUẨN KCS (QC PASSED)",
  }));

  const payloadString = `${bbntNumber}|${projectName}|${totalQty}|${spools.length}|${signatoryUser.name}|${new Date().toISOString()}`;

  // B7 Fix: Real cryptographic SHA-256 hash
  const rawHash = createHash("sha256").update(payloadString).digest("hex").toUpperCase();
  const provenanceHash = `SHA256:PROV-${rawHash.substring(0, 24)}`;
  const cryptographicSignatureToken = `SIG-A2-${Date.now().toString(36).toUpperCase()}-${signatoryUser.role.toUpperCase()}`;

  return {
    bbntNumber,
    projectName,
    inspectionDate: new Date().toLocaleDateString("vi-VN"),
    standardReference: "Nghị định 06/2021/NĐ-CP & TCVN 5687:2010 / QCVN 06:2022/BXD",
    participants: {
      investorSupervisor: "Đại diện TVGS / Chủ đầu tư",
      generalContractorPM: signatoryUser.name,
      mepfSubcontractorLeader: "Chỉ huy trưởng Thầu phụ MEPF",
    },
    workPackageDescription: `Nghiệm thu lắp đặt hoàn thành phân đoạn tuyến ${primaryDiscipline.toUpperCase()} (${spools.length} spools)`,
    totalSpoolCount: spools.length,
    totalCalculatedQty: Math.round(totalQty * 1000) / 1000,
    unit: primaryUnit,
    spoolAppendix: appendix,
    complianceVerdict:
      "ĐỒNG Ý NGHIỆM THU CHUYỂN BƯỚC THI CÔNG VÀ CHUYỂN DỮ LIỆU SANG HỒ SƠ THANH TOÁN (IPC).",
    provenanceHash,
    cryptographicSignatureToken,
  };
}
