// lib/engineering-carbon-lca.ts — Embodied Carbon & Lifecycle Assessment (LCA) Engine (M71)
import { query, queryOne } from "@/lib/db";

export interface MaterialLcaItem {
  materialType: "steel_pipe" | "galvanized_duct" | "copper_cable" | "plastic_ppr" | "cast_iron";
  description: string;
  weightKg: number;
  epdCarbonFactorKgCo2ePerKg?: number; // Hệ số EPD tùy chỉnh
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
  leedPointsEstimated: number; // 1-5 điểm LEED MR Credit Building Life-Cycle Impact Reduction
  greenCertificationTier: "LEED Platinum Eligible" | "LEED Gold Eligible" | "Standard Code";
  breakdown: CarbonBreakdownEntry[];
}

const DEFAULT_EPD_FACTORS: Record<string, number> = {
  steel_pipe: 2.85, // 2.85 kg CO2e / kg ống thép SCH40
  galvanized_duct: 2.4, // 2.40 kg CO2e / kg tôn kẽm
  copper_cable: 5.6, // 5.60 kg CO2e / kg cáp đồng (rất cao do khai khoáng & tinh luyện)
  plastic_ppr: 1.9, // 1.90 kg CO2e / kg nhựa PPR/HDPE
  cast_iron: 2.1, // 2.10 kg CO2e / kg gang cầu
};

// ============================================================================
// 1. THUẬT TOÁN ĐỊNH LƯỢNG VẾT CARBON & ĐÁNH GIÁ VÒNG ĐỜI VẬT TƯ (LCA)
// ============================================================================

export function calculateEmbodiedCarbonLCA(
  reportCode: string,
  materials: MaterialLcaItem[],
  grossFloorAreaM2 = 25000.0, // Diện tích sàn GFA mẫu 25,000 m2
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

  // Đánh giá điểm LEED v4.1 (Cường độ carbon < 45 kgCO2e/m2 -> 5 điểm Platinum)
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

// ============================================================================
// 2. PERSISTENCE & DATABASE
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
    [
      projectId,
      res.reportCode,
      res.totalEmbodiedCarbonKgCo2e,
      res.carbonIntensityKgCo2ePerM2,
      res.leedPointsEstimated,
      JSON.stringify(res.breakdown),
    ],
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
