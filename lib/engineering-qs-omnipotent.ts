// lib/engineering-qs-omnipotent.ts — Omnipotent 5D QS & Cost Engineering Engine (M69)
import { createHash } from "node:crypto";
import { query, queryOne } from "@/lib/db";

export interface RateBreakdownResult {
  itemCode: string;
  itemDescription: string;
  unit: string;
  contractRateVnd: number;
  breakdown: {
    materialMainVnd: number;
    materialMainPercent: number;
    materialAuxVnd: number;
    materialAuxPercent: number;
    laborDirectVnd: number;
    laborDirectPercent: number;
    machineryToolsVnd: number;
    machineryToolsPercent: number;
    subconMarginVnd: number;
    subconMarginPercent: number;
  };
  breakEvenCostVnd: number;
  targetSubconRateVnd: number; // Mức giá khoán mục tiêu để Tổng thầu có lãi
}

export interface BomLevelItem {
  level: 1 | 2 | 3 | 4;
  category: "main_material" | "fitting_fastener" | "hanger_support" | "consumable_aux";
  itemName: string;
  spec: string;
  quantityPerUnit: number;
  unit: string;
  unitCostVnd: number;
  totalCostVnd: number;
}

export interface MultiLevelBomResult {
  rootItemCode: string;
  rootItemName: string;
  rootUnit: string;
  totalCalculatedCostVnd: number;
  level1Count: number;
  level2Count: number;
  level3Count: number;
  level4Count: number;
  items: BomLevelItem[];
}

export interface FidicClaimDocument {
  claimNumber: string;
  contractClauseRef: string; // e.g. "FIDIC Red Book 1999 - Clause 13.3 (Variation Procedure)"
  claimTitle: string;
  eventDescription: string;
  impactAnalysis: {
    directCostIncreaseVnd: number;
    overheadCostIncreaseVnd: number;
    totalClaimAmountVnd: number;
    extensionOfTimeDays: number;
  };
  evidenceSummary: string[];
  provenanceHash: string;
  legalNoticeContent: string;
}

// ============================================================================
// 1. THUẬT TOÁN REVERSE UNIT-RATE BREAKDOWN (GIẢI MÃ ĐƠN GIÁ THẦU)
// ============================================================================

export function reverseBreakdownUnitRate(
  itemCode: string,
  itemDescription: string,
  unit: string,
  contractRateVnd: number,
  category: "pipe_steel" | "duct_galvanized" | "cable_power" = "pipe_steel",
): RateBreakdownResult {
  let matMainPct = 0.58;
  let matAuxPct = 0.12;
  let laborPct = 0.18;
  let machPct = 0.05;
  let marginPct = 0.07;

  if (category === "duct_galvanized") {
    matMainPct = 0.52;
    matAuxPct = 0.15; // Bích TDC, nẹp C, ke góc, keo silicon
    laborPct = 0.22;
    machPct = 0.04;
    marginPct = 0.07;
  } else if (category === "cable_power") {
    matMainPct = 0.72; // Cáp đồng tỷ trọng vật tư rất cao
    matAuxPct = 0.06;
    laborPct = 0.14;
    machPct = 0.02;
    marginPct = 0.06;
  }

  const materialMainVnd = Math.round(contractRateVnd * matMainPct);
  const materialAuxVnd = Math.round(contractRateVnd * matAuxPct);
  const laborDirectVnd = Math.round(contractRateVnd * laborPct);
  const machineryToolsVnd = Math.round(contractRateVnd * machPct);
  const subconMarginVnd = Math.round(contractRateVnd * marginPct);

  // Điểm hòa vốn = Chi phí trực tiếp không gồm lợi nhuận
  const breakEvenCostVnd = materialMainVnd + materialAuxVnd + laborDirectVnd + machineryToolsVnd;

  // Mức giá khoán mục tiêu = Điểm hòa vốn + 50% biên lợi nhuận
  const targetSubconRateVnd = Math.round(breakEvenCostVnd + subconMarginVnd * 0.5);

  return {
    itemCode,
    itemDescription,
    unit,
    contractRateVnd,
    breakdown: {
      materialMainVnd,
      materialMainPercent: Math.round(matMainPct * 100),
      materialAuxVnd,
      materialAuxPercent: Math.round(matAuxPct * 100),
      laborDirectVnd,
      laborDirectPercent: Math.round(laborPct * 100),
      machineryToolsVnd,
      machineryToolsPercent: Math.round(machPct * 100),
      subconMarginVnd,
      subconMarginPercent: Math.round(marginPct * 100),
    },
    breakEvenCostVnd,
    targetSubconRateVnd,
  };
}

// ============================================================================
// 2. THUẬT TOÁN MULTI-LEVEL BOM EXPLOSION (NỔ TUNG BOM 4 TẦNG)
// ============================================================================

export function explodeMultiLevelBOM(
  itemCode: string,
  itemName: string,
  unit: string,
  quantity = 1.0,
): MultiLevelBomResult {
  const items: BomLevelItem[] = [];

  // LEVEL 1: Cấu kiện chính (Main Material)
  items.push({
    level: 1,
    category: "main_material",
    itemName: "Ống thép tráng kẽm nhúng nóng SCH40",
    spec: "DN100 (OD 114.3mm, dày 6.02mm)",
    quantityPerUnit: 1.0 * quantity,
    unit: "m",
    unitCostVnd: 280000,
    totalCostVnd: 280000 * quantity,
  });

  // LEVEL 2: Phụ kiện & Liên kết (Fittings & Fasteners)
  items.push({
    level: 2,
    category: "fitting_fastener",
    itemName: "Mặt bích thép hàn cổ lồng rèn PN16",
    spec: "DN100 Tiêu chuẩn BS4504",
    quantityPerUnit: 0.35 * quantity,
    unit: "cái",
    unitCostVnd: 165000,
    totalCostVnd: Math.round(0.35 * 165000 * quantity),
  });
  items.push({
    level: 2,
    category: "fitting_fastener",
    itemName: "Bộ Bu lông Đai ốc Long đền mạ kẽm",
    spec: "M16 x 65mm Cấp bền 8.8",
    quantityPerUnit: 2.8 * quantity,
    unit: "bộ",
    unitCostVnd: 12000,
    totalCostVnd: Math.round(2.8 * 12000 * quantity),
  });
  items.push({
    level: 2,
    category: "fitting_fastener",
    itemName: "Gioăng amiang cao su chịu áp",
    spec: "DN100 dày 3.0mm",
    quantityPerUnit: 0.35 * quantity,
    unit: "cái",
    unitCostVnd: 18000,
    totalCostVnd: Math.round(0.35 * 18000 * quantity),
  });

  // LEVEL 3: Giá đỡ ty treo & Phụ kiện đỡ (Hangers & Supports)
  items.push({
    level: 3,
    category: "hanger_support",
    itemName: "Ty ren suốt mạ kẽm điện phân",
    spec: "M12 Cấp bền 4.8",
    quantityPerUnit: 0.6 * quantity,
    unit: "m",
    unitCostVnd: 24000,
    totalCostVnd: Math.round(0.6 * 24000 * quantity),
  });
  items.push({
    level: 3,
    category: "hanger_support",
    itemName: "Tắc kê nở sắt đóng trần bê tông",
    spec: "M12 x 50mm",
    quantityPerUnit: 0.6 * quantity,
    unit: "cái",
    unitCostVnd: 8500,
    totalCostVnd: Math.round(0.6 * 8500 * quantity),
  });
  items.push({
    level: 3,
    category: "hanger_support",
    itemName: "Đai treo quả trám Clevis Hanger",
    spec: "DN100 mạ kẽm",
    quantityPerUnit: 0.3 * quantity,
    unit: "cái",
    unitCostVnd: 35000,
    totalCostVnd: Math.round(0.3 * 35000 * quantity),
  });

  // LEVEL 4: Vật tư tiêu hao & Sơn chống rỉ (Consumables)
  items.push({
    level: 4,
    category: "consumable_aux",
    itemName: "Sơn lót epoxy kẽm giàu chống rỉ mối hàn",
    spec: "Định mức 0.08 kg/m",
    quantityPerUnit: 0.08 * quantity,
    unit: "kg",
    unitCostVnd: 140000,
    totalCostVnd: Math.round(0.08 * 140000 * quantity),
  });
  items.push({
    level: 4,
    category: "consumable_aux",
    itemName: "Que hàn hồ quang điện E4303",
    spec: "Đường kính 3.2mm",
    quantityPerUnit: 0.15 * quantity,
    unit: "kg",
    unitCostVnd: 45000,
    totalCostVnd: Math.round(0.15 * 45000 * quantity),
  });

  const totalCalculatedCostVnd = items.reduce((sum, it) => sum + it.totalCostVnd, 0);

  return {
    rootItemCode: itemCode,
    rootItemName: itemName,
    rootUnit: unit,
    totalCalculatedCostVnd,
    level1Count: items.filter((i) => i.level === 1).length,
    level2Count: items.filter((i) => i.level === 2).length,
    level3Count: items.filter((i) => i.level === 3).length,
    level4Count: items.filter((i) => i.level === 4).length,
    items,
  };
}

// ============================================================================
// 3. THUẬT TOÁN TỰ ĐỘNG SINH HỒ SƠ ĐÒI BỒI THƯỜNG FIDIC / EOT
// ============================================================================

export function generateFidicClaimDefense(
  projectName: string,
  claimCode: string,
  eventDescription: string,
  deltaVoQty: number,
  unitRateVnd: number,
  impactDays: number,
): FidicClaimDocument {
  const directCost = Math.round(deltaVoQty * unitRateVnd);
  const overheadCost = Math.round(directCost * 0.12); // 12% chi phí quản lý gián tiếp
  const totalClaim = directCost + overheadCost;

  const rawPayload = `${projectName}:${claimCode}:${directCost}:${impactDays}`;
  const provenanceHash = createHash("sha256")
    .update(rawPayload)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();

  const legalNoticeContent = `
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
-----------------------------
VĂN BẢN YÊU CẦU BỒI THƯỜNG CHI PHÍ PHÁT SINH & GIA HẠN TIẾN ĐỘ THI CÔNG
Số: ${claimCode}/VO-CLAIM • Dự án: ${projectName}

Kính gửi: BAN QUẢN LÝ DỰ ÁN & ĐƠN VỊ TƯ VẤN GIÁM SÁT

1. CĂN CỨ PHÁP LÝ & HỢP ĐỒNG:
- Căn cứ Hợp đồng thi công số: HDTC-${projectName.replace(/\s+/g, "")}-MEPF.
- Căn cứ Điều 13 [Phát sinh và Điều chỉnh] & Điều 8.4 [Gia hạn Thời gian Hoàn thành] theo Chuẩn Hợp đồng FIDIC 1999 / Nghị định 37/2015/NĐ-CP.

2. SỰ KIỆN PHÁT SINH (EVENT):
${eventDescription}

3. TỔNG HỢP GIÁ TRỊ YÊU CẦU ĐIỀU CHỈNH:
- Khối lượng phát sinh ngoài phạm vi hợp đồng: +${deltaVoQty} đơn vị.
- Chi phí trực tiếp phát sinh: ${directCost.toLocaleString("vi-VN")} VND.
- Chi phí gián tiếp & Quản lý (12%): ${overheadCost.toLocaleString("vi-VN")} VND.
=> TỔNG GIÁ TRỊ ĐỀ NGHỊ BỔ SUNG: ${totalClaim.toLocaleString("vi-VN")} VND.
- Thời gian đề nghị gia hạn tiến độ (EOT): +${impactDays} ngày.

Mã Xác Thực Bất Biến (SHA-256 Provenance): ${provenanceHash}
  `.trim();

  return {
    claimNumber: claimCode,
    contractClauseRef:
      "FIDIC Red Book 1999 - Clause 13.3 (Variation) & Clause 8.4 (Extension of Time)",
    claimTitle: `Hồ Sơ Yêu Cầu Phát Sinh & Gia Hạn Tiến Độ: ${claimCode}`,
    eventDescription,
    impactAnalysis: {
      directCostIncreaseVnd: directCost,
      overheadCostIncreaseVnd: overheadCost,
      totalClaimAmountVnd: totalClaim,
      extensionOfTimeDays: impactDays,
    },
    evidenceSummary: [
      `Mặt bằng CAD Shopdrawing so với Thiết kế cơ sở (+${deltaVoQty} đơn vị)`,
      `Nhật ký công trường điện tử ghi nhận thời gian bàn giao mặt bằng`,
      `Mô hình đường găng tiến độ CPM chứng minh tác động trễ ${impactDays} ngày`,
    ],
    provenanceHash,
    legalNoticeContent,
  };
}

// ============================================================================
// 4. PERSISTENCE & DATABASE
// ============================================================================

export async function saveQsBomExplosion(
  projectId: number,
  res: RateBreakdownResult,
  bom: MultiLevelBomResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_qs_bom_explosions (
      project_id, item_code, item_description, unit,
      contract_rate_vnd, breakdown_material_main_vnd,
      breakdown_material_aux_vnd, breakdown_labor_vnd,
      breakdown_machinery_vnd, breakdown_margin_vnd,
      target_subcon_rate_vnd, bom_level_items
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6,
      $7, $8,
      $9, $10,
      $11, $12::jsonb
    )
    ON CONFLICT (project_id, item_code) DO UPDATE SET
      contract_rate_vnd = EXCLUDED.contract_rate_vnd,
      breakdown_material_main_vnd = EXCLUDED.breakdown_material_main_vnd,
      target_subcon_rate_vnd = EXCLUDED.target_subcon_rate_vnd,
      bom_level_items = EXCLUDED.bom_level_items
    RETURNING id`,
    [
      projectId,
      res.itemCode,
      res.itemDescription,
      res.unit,
      res.contractRateVnd,
      res.breakdown.materialMainVnd,
      res.breakdown.materialAuxVnd,
      res.breakdown.laborDirectVnd,
      res.breakdown.machineryToolsVnd,
      res.breakdown.subconMarginVnd,
      res.targetSubconRateVnd,
      JSON.stringify(bom.items),
    ],
  );

  if (!row) throw new Error("Failed to save QS BOM explosion");
  return row;
}

export async function listQsBomExplosions(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_qs_bom_explosions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
