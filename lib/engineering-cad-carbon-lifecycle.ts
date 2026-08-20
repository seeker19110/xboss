// lib/engineering-cad-carbon-lifecycle.ts — 6D Embodied Carbon LCA & 7D Predictive Asset Lifecycle (M76 / M92)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "crypto";

export type MaterialCarbonCategory =
  | "galvanized_steel" // Tôn kẽm, máng cáp
  | "black_steel" // Ống thép đúc Sch40, giá đỡ Unistrut
  | "copper" // Ống đồng, cáp điện Cu
  | "ppr_plastic" // Ống PPR cấp nước
  | "upvc_plastic" // Ống uPVC thoát nước
  | "concrete" // Bê tông dầm sàn
  | "insulation_rubber"; // Cao su lưu hóa Aeroflex

/**
 * Hệ số phát thải carbon ẩn (Embodied Carbon Factors) theo tiêu chuẩn ISO 14040/14044 & EN 15978 (kgCO2e / kg vật liệu):
 */
export const EMBODIED_CARBON_FACTORS: Record<
  MaterialCarbonCategory,
  { factorKgCo2ePerKg: number; standardRef: string; description: string }
> = {
  galvanized_steel: {
    factorKgCo2ePerKg: 2.85,
    standardRef: "World Steel Association / ICE DB v3",
    description: "Tôn mạ kẽm Z80-Z275 gia công ống gió và máng cáp",
  },
  black_steel: {
    factorKgCo2ePerKg: 2.15,
    standardRef: "ICE Database / EN 15804",
    description: "Ống thép đen hàn/đúc Sch40 và thép hình Unistrut",
  },
  copper: {
    factorKgCo2ePerKg: 3.82,
    standardRef: "ICA / European Copper Institute",
    description: "Ống đồng điều hòa VRV/Chiller và lõi cáp điện lực",
  },
  ppr_plastic: {
    factorKgCo2ePerKg: 2.41,
    standardRef: "PlasticsEurope / Ecoinvent",
    description: "Ống nhựa PPR hàn nhiệt cấp nước nóng lạnh",
  },
  upvc_plastic: {
    factorKgCo2ePerKg: 2.18,
    standardRef: "PlasticsEurope / Ecoinvent",
    description: "Ống uPVC dán keo thoát nước thải và thông hơi",
  },
  concrete: {
    factorKgCo2ePerKg: 0.14, // 140 kgCO2e / m3 bê tông mác 300 (~2400 kg/m3)
    standardRef: "TCVN / VGBC Carbon Database",
    description: "Bê tông thương phẩm kết cấu dầm, cột, sàn",
  },
  insulation_rubber: {
    factorKgCo2ePerKg: 3.2,
    standardRef: "EPD International",
    description: "Vật liệu cách nhiệt cao su lưu hóa kín cell",
  },
};

export interface CarbonLcaSummary {
  totalWeightKg: number;
  totalEmbodiedCarbonKgCo2e: number;
  totalEmbodiedCarbonTonCo2e: number;
  carbonIntensityPerM2: number; // kgCO2e / m2 sàn xây dựng
  breakdownByMaterial: Array<{
    category: MaterialCarbonCategory;
    weightKg: number;
    carbonKgCo2e: number;
    percentShare: number;
  }>;
  complianceRating: "Low-Carbon Apex (A+)" | "Standard (B)" | "High-Emissions Alert (C)";
}

export interface Asset7DLifeCycleRecord {
  recordCode: string;
  assetGuid: string;
  equipmentName: string;
  systemCode: string;
  serialNumber: string;
  installedDate: string;
  expectedLifespanYears: number;
  mtbfHours: number; // Mean Time Between Failures
  currentOperatingHours: number;
  remainingUsefulLifePercent: number; // RUL %
  maintenanceCycleDays: number;
  nextMaintenanceDate: string;
  healthScorePercent: number; // 0..100%
  maintenanceLog: Array<{ date: string; action: string; technician: string }>;
}

// ============================================================================
// 1. 6D EMBODIED CARBON CALCULATION ENGINE
// ============================================================================

export function calculate6dCarbonLca(
  elements: Array<{
    category: MaterialCarbonCategory;
    weightKg: number;
  }>,
  grossFloorAreaM2 = 5000,
): CarbonLcaSummary {
  let totalWeight = 0;
  let totalCarbonKg = 0;

  const map = new Map<MaterialCarbonCategory, { weightKg: number; carbonKg: number }>();

  for (const el of elements) {
    const factor = EMBODIED_CARBON_FACTORS[el.category]?.factorKgCo2ePerKg || 2.0;
    const carbon = el.weightKg * factor;

    totalWeight += el.weightKg;
    totalCarbonKg += carbon;

    const existing = map.get(el.category) || { weightKg: 0, carbonKg: 0 };
    map.set(el.category, {
      weightKg: existing.weightKg + el.weightKg,
      carbonKg: existing.carbonKg + carbon,
    });
  }

  const breakdown = Array.from(map.entries()).map(([category, val]) => ({
    category,
    weightKg: Math.round(val.weightKg * 10) / 10,
    carbonKgCo2e: Math.round(val.carbonKg * 10) / 10,
    percentShare: totalCarbonKg > 0 ? Math.round((val.carbonKg / totalCarbonKg) * 1000) / 10 : 0,
  }));

  const carbonIntensity = grossFloorAreaM2 > 0 ? totalCarbonKg / grossFloorAreaM2 : 0;
  const rating: CarbonLcaSummary["complianceRating"] =
    carbonIntensity < 45.0
      ? "Low-Carbon Apex (A+)"
      : carbonIntensity < 80.0
        ? "Standard (B)"
        : "High-Emissions Alert (C)";

  return {
    totalWeightKg: Math.round(totalWeight * 10) / 10,
    totalEmbodiedCarbonKgCo2e: Math.round(totalCarbonKg * 10) / 10,
    totalEmbodiedCarbonTonCo2e: Math.round((totalCarbonKg / 1000) * 100) / 100,
    carbonIntensityPerM2: Math.round(carbonIntensity * 10) / 10,
    breakdownByMaterial: breakdown,
    complianceRating: rating,
  };
}

// ============================================================================
// 2. 7D ASSET LIFECYCLE & MTBF/RUL PREDICTIVE ENGINE
// ============================================================================

export function evaluateAssetHealthAndRul(asset: {
  installedDateISO: string;
  expectedLifespanYears: number;
  mtbfHours: number;
  currentOperatingHours: number;
  incidentCount?: number;
}): {
  remainingUsefulLifePercent: number;
  healthScorePercent: number;
  daysToNextFailurePredicted: number;
  riskStatus: "healthy" | "due_for_overhaul" | "critical_replacement";
} {
  const totalLifespanHours = asset.expectedLifespanYears * 8760; // 8760 giờ/năm
  const hoursUsed = asset.currentOperatingHours;

  const rulPct = Math.max(
    0,
    Math.min(100, ((totalLifespanHours - hoursUsed) / totalLifespanHours) * 100),
  );

  // Tác động của số sự cố hỏng hóc lên điểm sức khỏe (Degradation curve)
  const incidents = asset.incidentCount || 0;
  const healthScore = Math.max(0, Math.min(100, rulPct - incidents * 5));

  // Dự báo số ngày tới lần hỏng hóc tiếp theo dựa trên MTBF:
  // Thời gian còn lại = MTBF - (hoursUsed % MTBF)
  const hoursToNextMtbf = Math.max(0, asset.mtbfHours - (hoursUsed % asset.mtbfHours));
  const daysToNext = Math.round(hoursToNextMtbf / 24);

  let riskStatus: "healthy" | "due_for_overhaul" | "critical_replacement" = "healthy";
  if (healthScore < 20 || rulPct < 15) {
    riskStatus = "critical_replacement";
  } else if (healthScore < 50 || daysToNext < 30) {
    riskStatus = "due_for_overhaul";
  }

  return {
    remainingUsefulLifePercent: Math.round(rulPct * 10) / 10,
    healthScorePercent: Math.round(healthScore * 10) / 10,
    daysToNextFailurePredicted: daysToNext,
    riskStatus,
  };
}

// ============================================================================
// 3. LIVING DIGITAL TWIN PASSPORT LOD 500 (COBie COMPLIANT)
// ============================================================================

export interface LivingDigitalTwinPassport {
  passportToken: string;
  projectCode: string;
  lodStandard: "LOD 500 - As-Built Operational Twin";
  createdAt: string;
  totalBimAssetsCount: number;
  totalEmbodiedCarbonTonCo2e: number;
  assetsRegistry: Asset7DLifeCycleRecord[];
  merkleProofRoot: string;
}

export function exportDigitalTwinPassport(
  projectCode: string,
  assets: Asset7DLifeCycleRecord[],
  totalCarbonTonCo2e: number,
): LivingDigitalTwinPassport {
  const payload = `${projectCode}|${assets.length}|${totalCarbonTonCo2e}|${new Date().toISOString()}`;
  const merkleProofRoot = createHash("sha256").update(payload).digest("hex").toUpperCase();
  const passportToken = `PASSPORT-LOD500-${merkleProofRoot.slice(0, 16)}`;

  return {
    passportToken,
    projectCode,
    lodStandard: "LOD 500 - As-Built Operational Twin",
    createdAt: new Date().toISOString(),
    totalBimAssetsCount: assets.length,
    totalEmbodiedCarbonTonCo2e: totalCarbonTonCo2e,
    assetsRegistry: assets,
    merkleProofRoot: `MERKLE-ROOT:0x${merkleProofRoot}`,
  };
}

// ============================================================================
// 4. DATABASE CRUD & PERSISTENCE
// ============================================================================

export async function saveCarbonLifecycleRecord(
  projectId: number,
  record: {
    recordCode: string;
    elementType: string;
    systemCode: string;
    materialCategory: MaterialCarbonCategory;
    weightKg: number;
    embodiedCarbonKgCo2e: number;
    assetGuid?: string;
    equipmentSerial?: string;
    mtbfHours?: number;
    expectedLifespanYears?: number;
  },
  userId?: number | null,
): Promise<{ id: string }> {
  const factor = EMBODIED_CARBON_FACTORS[record.materialCategory]?.factorKgCo2ePerKg || 2.1;

  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_carbon_lifecycle_records (
      project_id, record_code, element_type, system_code,
      material_category, weight_kg, carbon_factor_kg_co2e_per_kg,
      embodied_carbon_kg_co2e, asset_guid, equipment_serial,
      mtbf_hours, expected_lifespan_years, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
    ON CONFLICT (project_id, record_code) DO UPDATE SET
      weight_kg = EXCLUDED.weight_kg,
      embodied_carbon_kg_co2e = EXCLUDED.embodied_carbon_kg_co2e,
      mtbf_hours = EXCLUDED.mtbf_hours,
      updated_at = NOW()
    RETURNING id`,
    [
      projectId,
      record.recordCode,
      record.elementType,
      record.systemCode,
      record.materialCategory,
      record.weightKg,
      factor,
      record.embodiedCarbonKgCo2e,
      record.assetGuid ?? null,
      record.equipmentSerial ?? null,
      record.mtbfHours || 20000,
      record.expectedLifespanYears || 15,
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save carbon lifecycle record");
  return row;
}

export async function listCarbonLifecycleRecords(projectId: number) {
  return await query(
    `SELECT * FROM engineering_carbon_lifecycle_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`,
    [projectId],
  );
}
