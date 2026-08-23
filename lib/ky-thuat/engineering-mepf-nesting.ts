// lib/engineering-mepf-nesting.ts — Facade for Unified DfMA Spooling & Nesting Engine (M68)
import { query, queryOne } from "@/lib/db";

export {
  type RequiredPiece,
  type CutBarPattern,
  type NestingPlanResult,
  solve1dCuttingStock,
} from "@/lib/ky-thuat/engineering-dfma-spooling";

import { type NestingPlanResult } from "@/lib/ky-thuat/engineering-dfma-spooling";

export async function saveNestingPlan(
  projectId: number,
  res: NestingPlanResult,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_mepf_nesting_plans (
      project_id, plan_code, material_type, stock_length_m,
      total_required_pieces, total_stock_bars_needed,
      scrap_waste_percent, cutting_patterns
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6,
      $7, $8::jsonb
    )
    ON CONFLICT (project_id, plan_code) DO UPDATE SET
      total_stock_bars_needed = EXCLUDED.total_stock_bars_needed,
      scrap_waste_percent = EXCLUDED.scrap_waste_percent,
      cutting_patterns = EXCLUDED.cutting_patterns
    RETURNING id`,
    [
      projectId,
      res.planCode,
      res.materialType,
      res.stockLengthM,
      res.totalRequiredPieces,
      res.totalStockBarsNeeded,
      res.overallScrapWastePercent,
      JSON.stringify(res.patterns),
    ],
  );

  if (!row) throw new Error("Failed to save nesting plan");
  return row;
}

export async function listNestingPlans(projectId: number): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_mepf_nesting_plans WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
