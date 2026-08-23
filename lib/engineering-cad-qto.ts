// lib/engineering-cad-qto.ts — Closed-Loop CAD-QTO-Tracking Engine (M66 / M89)
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { nextSeqCode, withUniqueRetry } from "@/lib/seqcode";
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
  return await query<CadSpoolRecord>(sql, ...params);
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
    newStatus,
    spoolId,
    projectId,
  );

  const spool = await queryOne<CadSpoolRecord>(
    `SELECT * FROM engineering_cad_spools WHERE id = ? AND project_id = ?`,
    spoolId,
    projectId,
  );

  return spool || null;
}

export type SpoolDiscipline =
  | "hvac"
  | "plumbing"
  | "electrical"
  | "firefighting"
  | "structure"
  | "architecture";

// Đầu vào tạo Spool sau khi kỹ sư đã soát & gán mã BOQCODE thủ công cho từng tuyến
// bóc được từ bản vẽ (spatialRoutes của parseDxf) — xem app/engineering/cad-tracking.
export interface CadSpoolCreateInput {
  routeId?: string;
  discipline: SpoolDiscipline;
  systemCode: string;
  zoneLabel?: string;
  dimensionSpec: string;
  widthMm?: number;
  heightMm?: number;
  lengthM: number;
  kind: "duct" | "linear"; // duct -> diện tích tôn m2, linear -> mét dài ống/máng/cáp
  boqCode: string;
}

export interface CadSpoolCreateSkip {
  item: CadSpoolCreateInput;
  reason: string;
}

export interface CadSpoolCreateResult {
  created: CadSpoolRecord[];
  skipped: CadSpoolCreateSkip[];
}

// Sinh mã Spool duy nhất trong dự án theo mẫu "SP-{HỆ}-{TẦNG}-{STT}" (vd SP-DUCT-L4-001).
async function nextSpoolCode(projectId: number, systemCode: string, floorLabel: string) {
  const prefix = `SP-${systemCode.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${floorLabel
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")}`;
  const countRow = await queryOne<{ n: string | number }>(
    `SELECT COUNT(*) AS n FROM engineering_cad_spools WHERE project_id = ? AND spool_code LIKE ?`,
    projectId,
    `${prefix}-%`,
  );
  const seq = Number(countRow?.n || 0) + 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

// Tạo hàng loạt Spool từ kết quả bóc tách CAD (Auto-QTO) đã được kỹ sư xác nhận mapping
// BOQCODE — mỗi item bắt buộc gắn với 1 dòng boq_items có sẵn trong dự án (không tự tạo
// boq_items mới ở đây). Bỏ qua (skip, không throw) các item thiếu mã hoặc không tìm thấy
// dòng BOQ tương ứng để không chặn cả lô vì 1 dòng lỗi.
export async function createCadSpoolsBatch(
  projectId: number,
  drawingId: number | null,
  floorLabel: string,
  items: CadSpoolCreateInput[],
): Promise<CadSpoolCreateResult> {
  const created: CadSpoolRecord[] = [];
  const skipped: CadSpoolCreateSkip[] = [];

  for (const item of items) {
    const boqCode = item.boqCode?.trim();
    if (!boqCode) {
      skipped.push({ item, reason: "Thiếu mã BOQCODE để gán khối lượng" });
      continue;
    }

    const boqRow = await queryOne<{ id: number }>(
      `SELECT id FROM boq_items WHERE project_id = ? AND lower(code) = lower(?)`,
      projectId,
      boqCode,
    );
    if (!boqRow) {
      skipped.push({ item, reason: `Không tìm thấy dòng BOQ có mã "${boqCode}" trong dự án` });
      continue;
    }

    const lengthM = Math.max(0, Number(item.lengthM) || 0);
    const calculatedQty =
      item.kind === "duct"
        ? calculateDuctQtoM2(Number(item.widthMm) || 0, Number(item.heightMm) || 0, lengthM)
        : calculatePipeQtoM(lengthM);
    const unit = item.kind === "duct" ? "m2" : "m";

    if (calculatedQty <= 0) {
      skipped.push({
        item,
        reason: "Kích thước/chiều dài không hợp lệ, khối lượng tính được bằng 0",
      });
      continue;
    }

    let row: CadSpoolRecord | undefined;
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      const spoolCode = await nextSpoolCode(projectId, item.systemCode, floorLabel);
      try {
        row = await queryOne<CadSpoolRecord>(
          `INSERT INTO engineering_cad_spools (
            project_id, drawing_id, spool_code, discipline, system_code, floor_label,
            zone_label, dimension_spec, length_m, calculated_qty, unit, boq_item_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`,
          projectId,
          drawingId,
          spoolCode,
          item.discipline,
          item.systemCode,
          floorLabel,
          item.zoneLabel || "Main",
          item.dimensionSpec,
          lengthM,
          calculatedQty,
          unit,
          boqRow.id,
        );
      } catch (err) {
        if ((err as { code?: string }).code !== "23505") throw err;
        // Đụng độ mã Spool hiếm gặp (chạy song song) — thử lại với STT kế tiếp.
      }
    }

    if (row) created.push(row);
    else skipped.push({ item, reason: "Không sinh được mã Spool duy nhất, thử lại sau" });
  }

  return { created, skipped };
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
    projectId,
    boqItemId,
    qtyContract,
    qtyShopCad,
    qtyInstalled,
    qtyApprovedBbnt,
    estimatedVoVnd,
    status,
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

  // 1. Tạo mã YCNT mới — dùng chung bộ đếm tuần tự nextSeqCode() với
  // app/api/inspection-requests/route.ts (KHÔNG tự chế định dạng riêng: một mã không khớp
  // /^YCNT-\d+$/ trong bảng inspection_requests sẽ làm hỏng parseInt() của nextSeqCode() cho
  // MỌI phiếu YCNT tạo sau đó, kể cả phiếu không liên quan CAD).
  const scheduledAt = new Date().toISOString();
  const { insId, code } = await withUniqueRetry(() =>
    withTransaction(async () => {
      const code = await nextSeqCode("inspection_requests", "code", "YCNT-", 4);
      const insertRow = await queryOne<{ id: number }>(
        `INSERT INTO inspection_requests (code, scheduled_at, status, note, created_by)
         VALUES (?, ?, 'sent', ?, ?)
         RETURNING id`,
        code,
        scheduledAt,
        note || "Nghiệm thu khối lượng phân đoạn CAD Spools",
        userId,
      );
      return { insId: Number(insertRow?.id || 0), code };
    }),
  );

  // 2. Gán inspection_request_id cho các spools và chuyển trạng thái sang qc_passed
  for (const sId of spoolIds) {
    await run(
      `UPDATE engineering_cad_spools
       SET inspection_request_id = ?, status = 'qc_passed', updated_at = NOW()
       WHERE id = ? AND project_id = ?`,
      insId,
      sId,
      projectId,
    );
  }

  const sumRes = await queryOne<{ total: string | number }>(
    `SELECT COALESCE(SUM(calculated_qty), 0) as total FROM engineering_cad_spools WHERE inspection_request_id = ?`,
    insId,
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
