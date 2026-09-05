// lib/engineering-mepf-predictive.ts — AI Predictive Maintenance & MTBF/RUL Engine (M71)
import { query, queryOne } from "@/lib/db";
import { daysFromTodayISO } from "@/lib/nen/date";

export interface MepfAssetInput {
  assetCode: string;
  assetName: string;
  systemType:
    "chiller_pump" | "smoke_exhaust_fan" | "msb_switchboard" | "transformer" | "prv_valve";
  installationDate: string; // YYYY-MM-DD
  operatingHoursTotal: number;
  designedMtbfHours?: number; // Giờ thiết kế MTBF chuẩn
}

export interface PredictiveAssetResult {
  assetCode: string;
  assetName: string;
  systemType: string;
  installationDate: string;
  operatingHoursTotal: number;
  mtbfHours: number;
  remainingUsefulLifeDays: number;
  healthScorePercent: number;
  reliabilityScore: number;
  nextMaintenanceDate: string;
  maintenanceActionRecommended: string;
  riskLevel: "low" | "medium" | "critical";
}

const DEFAULT_MTBF_MAP: Record<string, number> = {
  chiller_pump: 25000, // 25,000 giờ (~3 năm chạy liên tục)
  smoke_exhaust_fan: 18000,
  msb_switchboard: 50000,
  transformer: 80000,
  prv_valve: 12000,
};

// ============================================================================
// 1. THUẬT TOÁN ĐỘ TIN CẬY WEIBULL & DỰ BÁO TUỔI THỌ CÒN LẠI (RUL)
// ============================================================================

export function calculateAssetReliabilityAndRul(
  asset: MepfAssetInput,
  weibullBeta = 1.6, // Beta > 1: Giai đoạn hao mòn tự nhiên theo thời gian
): PredictiveAssetResult {
  const mtbf = asset.designedMtbfHours || DEFAULT_MTBF_MAP[asset.systemType] || 20000;
  const t = Math.max(0, asset.operatingHoursTotal);

  // Phân phối Weibull: R(t) = exp( - (t / eta)^beta ) với eta ~ MTBF
  const eta = mtbf;
  const reliability = Math.exp(-Math.pow(t / eta, weibullBeta));
  const healthScorePercent = Math.round(reliability * 1000) / 10;

  // Giả định 1 ngày vận hành 16 giờ
  const remainingHours = Math.max(0, mtbf - t);
  const remainingUsefulLifeDays = Math.round(remainingHours / 16);

  // Ngày bảo dưỡng kế tiếp — theo giờ VN (daysFromTodayISO), không phải UTC của máy chủ:
  // `new Date().toISOString()` lệch 1 ngày trong khung 0h–7h sáng giờ Việt Nam.
  const nextMaintenanceDate = daysFromTodayISO(Math.min(remainingUsefulLifeDays, 90));

  let riskLevel: PredictiveAssetResult["riskLevel"] = "low";
  let action = "Thiết bị hoạt động ổn định. Duy trì bôi trơn định kỳ.";

  if (healthScorePercent < 45 || remainingUsefulLifeDays < 30) {
    riskLevel = "critical";
    action = `CẢNH BÁO NGUY CƠ HỎNG CAO (Sức khỏe ${healthScorePercent}%): Yêu cầu thay phốt cơ khí, bạc đạn hoặc đại tu khẩn cấp trong ${remainingUsefulLifeDays} ngày tới.`;
  } else if (healthScorePercent < 75 || remainingUsefulLifeDays < 90) {
    riskLevel = "medium";
    action = `CẢNH BÁO BẢO DƯỠNG (Sức khỏe ${healthScorePercent}%): Đo độ rung, nhiệt độ cuộn dây và căn chỉnh đồng trục trước ngày ${nextMaintenanceDate}.`;
  }

  return {
    assetCode: asset.assetCode,
    assetName: asset.assetName,
    systemType: asset.systemType,
    installationDate: asset.installationDate,
    operatingHoursTotal: t,
    mtbfHours: mtbf,
    remainingUsefulLifeDays,
    healthScorePercent,
    reliabilityScore: Math.round(reliability * 1000) / 1000,
    nextMaintenanceDate,
    maintenanceActionRecommended: action,
    riskLevel,
  };
}

// ============================================================================
// 2. PERSISTENCE & DATABASE
// ============================================================================

export async function savePredictiveAsset(
  projectId: number,
  res: PredictiveAssetResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_mepf_predictive_assets (
      project_id, asset_code, asset_name, system_type,
      installation_date, operating_hours_total, mtbf_hours,
      remaining_useful_life_days, health_score_percent,
      next_maintenance_date, maintenance_action_recommended
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9,
      $10, $11
    )
    ON CONFLICT (project_id, asset_code) DO UPDATE SET
      operating_hours_total = EXCLUDED.operating_hours_total,
      remaining_useful_life_days = EXCLUDED.remaining_useful_life_days,
      health_score_percent = EXCLUDED.health_score_percent,
      next_maintenance_date = EXCLUDED.next_maintenance_date,
      maintenance_action_recommended = EXCLUDED.maintenance_action_recommended
    RETURNING id`,

    projectId,
    res.assetCode,
    res.assetName,
    res.systemType,
    res.installationDate,
    res.operatingHoursTotal,
    res.mtbfHours,
    res.remainingUsefulLifeDays,
    res.healthScorePercent,
    res.nextMaintenanceDate,
    res.maintenanceActionRecommended,
  );

  if (!row) throw new Error("Failed to save predictive asset");
  return row;
}

export async function listPredictiveAssets(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_mepf_predictive_assets WHERE project_id = $1 ORDER BY health_score_percent ASC LIMIT 50`,
    projectId,
  );
}
