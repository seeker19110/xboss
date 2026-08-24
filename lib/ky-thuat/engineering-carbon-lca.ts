// lib/engineering-carbon-lca.ts — Unified 6D Embodied Carbon LCA & 7D Predictive Asset Lifecycle Engine (M71 / M76 / M92)
import { query, queryOne, run } from "@/lib/db";

export type MaterialCarbonCategory =
  | "galvanized_steel" // Tôn kẽm, máng cáp
  | "black_steel" // Ống thép đúc Sch40, giá đỡ Unistrut
  | "copper" // Ống đồng, cáp điện Cu
  | "ppr_plastic" // Ống PPR cấp nước
  | "upvc_plastic" // Ống uPVC thoát nước
  | "concrete" // Bê tông dầm sàn
  | "insulation_rubber"; // Cao su lưu hóa Aeroflex

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
    factorKgCo2ePerKg: 0.14,
    standardRef: "TCVN / VGBC Carbon Database",
    description: "Bê tông thương phẩm kết cấu dầm, cột, sàn",
  },
  insulation_rubber: {
    factorKgCo2ePerKg: 3.2,
    standardRef: "EPD International",
    description: "Vật liệu cách nhiệt cao su lưu hóa kín cell",
  },
};

export const DEFAULT_EPD_FACTORS: Record<string, number> = {
  steel_pipe: 2.85,
  galvanized_duct: 2.4,
  copper_cable: 5.6,
  plastic_ppr: 1.9,
  cast_iron: 2.1,
};

export interface MaterialLcaItem {
  materialType: "steel_pipe" | "galvanized_duct" | "copper_cable" | "plastic_ppr" | "cast_iron";
  description: string;
  weightKg: number;
  epdCarbonFactorKgCo2ePerKg?: number;
}

export interface CarbonBreakdownEntry {
  materialType: string;
  description: string;
  weightKg: number;
  factorKgCo2ePerKg: number;
  embodiedCarbonKgCo2e: number;
  sharePercent: number;
}

export interface CarbonLcaReportResult {
  reportCode: string;
  totalMaterialWeightKg: number;
  totalEmbodiedCarbonKgCo2e: number;
  totalEmbodiedCarbonTonCo2e: number;
  grossFloorAreaM2: number;
  carbonIntensityKgCo2ePerM2: number;
  leedPointsEstimated: number;
  greenCertificationTier: "LEED Platinum Eligible" | "LEED Gold Eligible" | "Standard Code";
  breakdown: CarbonBreakdownEntry[];
}

export interface CarbonLcaSummary {
  totalWeightKg: number;
  totalEmbodiedCarbonKgCo2e: number;
  totalEmbodiedCarbonTonCo2e: number;
  carbonIntensityPerM2: number;
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
  mtbfHours: number;
  currentOperatingHours: number;
  remainingUsefulLifePercent: number;
  maintenanceCycleDays: number;
  nextMaintenanceDate: string;
  healthScorePercent: number;
  maintenanceLog: Array<{ date: string; action: string; technician: string }>;
}

// ============================================================================
// 1. THUẬT TOÁN ĐỊNH LƯỢNG VẾT CARBON LCA
// ============================================================================

export function calculateEmbodiedCarbonLCA(
  reportCode: string,
  materials: MaterialLcaItem[],
  grossFloorAreaM2 = 25000.0,
): CarbonLcaReportResult {
  let totalWeight = 0;
  let totalCarbon = 0;

  const rawEntries = materials.map((m) => {
    const factor = m.epdCarbonFactorKgCo2ePerKg || DEFAULT_EPD_FACTORS[m.materialType] || 2.5;
    const carbon = Math.round(m.weightKg * factor * 100) / 100;
    totalWeight += m.weightKg;
    totalCarbon += carbon;
    return {
      materialType: m.materialType,
      description: m.description,
      weightKg: m.weightKg,
      factorKgCo2ePerKg: factor,
      embodiedCarbonKgCo2e: carbon,
      sharePercent: 0,
    };
  });

  const breakdown: CarbonBreakdownEntry[] = rawEntries.map((e) => ({
    ...e,
    sharePercent:
      totalCarbon > 0 ? Math.round((e.embodiedCarbonKgCo2e / totalCarbon) * 1000) / 10 : 0,
  }));

  const totalEmbodiedCarbonTonCo2e = Math.round((totalCarbon / 1000.0) * 100) / 100;
  const carbonIntensityKgCo2ePerM2 =
    grossFloorAreaM2 > 0 ? Math.round((totalCarbon / grossFloorAreaM2) * 100) / 100 : 0;

  let leedPoints = 2;
  let tier: CarbonLcaReportResult["greenCertificationTier"] = "Standard Code";

  if (carbonIntensityKgCo2ePerM2 < 35.0) {
    leedPoints = 5;
    tier = "LEED Platinum Eligible";
  } else if (carbonIntensityKgCo2ePerM2 < 55.0) {
    leedPoints = 4;
    tier = "LEED Gold Eligible";
  }

  return {
    reportCode,
    totalMaterialWeightKg: Math.round(totalWeight * 10) / 10,
    totalEmbodiedCarbonKgCo2e: Math.round(totalCarbon * 10) / 10,
    totalEmbodiedCarbonTonCo2e,
    grossFloorAreaM2,
    carbonIntensityKgCo2ePerM2,
    leedPointsEstimated: leedPoints,
    greenCertificationTier: tier,
    breakdown,
  };
}

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
  operatingHours: number;
  breakdownCount?: number;
  incidentCount?: number;
}): {
  healthScorePercent: number;
  rulPercent: number;
  estimatedRemainingYears: number;
  status: "GOOD" | "MAINTENANCE_REQUIRED" | "CRITICAL_REPLACEMENT_DUE";
  recommendation: string;
} {
  const totalExpectedHours = asset.expectedLifespanYears * 365 * 24;
  const remainingHours = Math.max(0, totalExpectedHours - asset.operatingHours);
  const rulPercent = Math.min(
    100,
    Math.max(0, Math.round((remainingHours / totalExpectedHours) * 100)),
  );
  const breakdowns = (asset.breakdownCount || 0) + (asset.incidentCount || 0);

  let healthScore = 100 - (100 - rulPercent) * 0.7 - breakdowns * 8;
  healthScore = Math.max(5, Math.min(100, Math.round(healthScore)));

  let status: "GOOD" | "MAINTENANCE_REQUIRED" | "CRITICAL_REPLACEMENT_DUE" = "GOOD";
  let recommendation = "Thiết bị vận hành ổn định trong vòng đời thiết kế.";

  if (rulPercent < 15 || healthScore < 40) {
    status = "CRITICAL_REPLACEMENT_DUE";
    recommendation =
      "CẢNH BÁO: Thiết bị đã gần hết tuổi thọ hoặc suy giảm sức khỏe trầm trọng. Cần lập kế hoạch thay mới.";
  } else if (rulPercent < 35 || healthScore < 70) {
    status = "MAINTENANCE_REQUIRED";
    recommendation =
      "Cần bảo trì phòng ngừa lớn (Overhaul) và kiểm tra lại thông số rung lắc/nhiệt độ.";
  }

  return {
    healthScorePercent: healthScore,
    rulPercent,
    estimatedRemainingYears: Math.round((remainingHours / (365 * 24)) * 10) / 10,
    status,
    recommendation,
  };
}

// ============================================================================
// 3. PERSISTENCE & DATABASE
// ============================================================================

export async function saveCarbonLcaReport(
  projectId: number,
  res: CarbonLcaReportResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_carbon_lca_reports (
      project_id, report_code, total_embodied_carbon_kgco2e,
      carbon_intensity_kgco2e_per_m2, leed_points_estimated,
      carbon_breakdown
    ) VALUES (
      $1, $2, $3,
      $4, $5,
      $6::jsonb
    )
    ON CONFLICT (project_id, report_code) DO UPDATE SET
      total_embodied_carbon_kgco2e = EXCLUDED.total_embodied_carbon_kgco2e,
      carbon_intensity_kgco2e_per_m2 = EXCLUDED.carbon_intensity_kgco2e_per_m2,
      leed_points_estimated = EXCLUDED.leed_points_estimated,
      carbon_breakdown = EXCLUDED.carbon_breakdown
    RETURNING id`,

    projectId,
    res.reportCode,
    res.totalEmbodiedCarbonKgCo2e,
    res.carbonIntensityKgCo2ePerM2,
    res.leedPointsEstimated,
    JSON.stringify(res.breakdown),
  );

  if (!row) throw new Error("Failed to save Carbon LCA report");
  return row;
}

export async function listCarbonLcaReports(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_carbon_lca_reports WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
