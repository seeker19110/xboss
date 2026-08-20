// lib/engineering-cad-carbon-lifecycle.ts — Facade for Unified Carbon LCA & 7D Lifecycle Engine (M76 / M92)
import { query, queryOne } from "@/lib/db";
import { createHash } from "crypto";

export {
  type MaterialCarbonCategory,
  type CarbonLcaSummary,
  type Asset7DLifeCycleRecord,
  EMBODIED_CARBON_FACTORS,
  calculate6dCarbonLca,
} from "./engineering-carbon-lca";

import {
  type MaterialCarbonCategory,
  type Asset7DLifeCycleRecord,
  EMBODIED_CARBON_FACTORS,
  evaluateAssetHealthAndRul as evaluateAssetHealthAndRulBase,
} from "./engineering-carbon-lca";

export function evaluateAssetHealthAndRul(asset: {
  installedDateISO: string;
  expectedLifespanYears: number;
  mtbfHours: number;
  operatingHours?: number;
  currentOperatingHours?: number;
  breakdownCount?: number;
  incidentCount?: number;
  maintenanceCycleDays?: number;
}) {
  const opHours = asset.operatingHours ?? asset.currentOperatingHours ?? 0;
  const base = evaluateAssetHealthAndRulBase({
    installedDateISO: asset.installedDateISO,
    expectedLifespanYears: asset.expectedLifespanYears,
    mtbfHours: asset.mtbfHours,
    operatingHours: opHours,
    breakdownCount: asset.breakdownCount,
    incidentCount: asset.incidentCount,
  });

  const totalExpectedHours = asset.expectedLifespanYears * 365 * 24;
  const remainingHours = Math.max(0, totalExpectedHours - opHours);
  const daysToNext = Math.max(1, Math.round((asset.mtbfHours - (opHours % asset.mtbfHours)) / 24));

  let riskStatus: "healthy" | "due_for_maintenance" | "due_for_overhaul" | "critical_eol" =
    "healthy";
  if (base.rulPercent < 15) {
    riskStatus = "critical_eol";
  } else if (base.healthScorePercent < 50 || daysToNext < 30) {
    riskStatus = "due_for_overhaul";
  } else if (base.healthScorePercent < 75) {
    riskStatus = "due_for_maintenance";
  }

  return {
    remainingUsefulLifePercent: base.rulPercent,
    healthScorePercent: base.healthScorePercent,
    daysToNextFailurePredicted: daysToNext,
    riskStatus,
  };
}

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
