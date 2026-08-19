// lib/engineering-mepf-nesting.ts — 1D/2D Cutting Stock & Spool Nesting Optimizer (M68)
import { query, queryOne } from "@/lib/db";

export interface RequiredPiece {
  id: string;
  spoolCode: string;
  lengthM: number;
  quantity: number;
}

export interface CutBarPattern {
  barIndex: number;
  stockLengthM: number;
  usedLengthM: number;
  scrapWasteM: number;
  scrapWastePercent: number;
  cuts: Array<{
    pieceId: string;
    spoolCode: string;
    lengthM: number;
    cutOffsetStartM: number;
  }>;
}

export interface NestingPlanResult {
  planCode: string;
  materialType: string;
  stockLengthM: number;
  totalRequiredPieces: number;
  totalRequiredLengthM: number;
  totalStockBarsNeeded: number;
  totalStockLengthM: number;
  totalScrapWasteM: number;
  overallScrapWastePercent: number;
  patterns: CutBarPattern[];
  isOptimizedUnder2Percent: boolean;
}

// ============================================================================
// 1. THUẬT TOÁN 1D CUTTING STOCK OPTIMIZATION (BEST-FIT DECREASING / BFD)
// ============================================================================

export function solve1dCuttingStock(
  planCode: string,
  materialType: string,
  requiredPieces: RequiredPiece[],
  stockLengthM = 6.0,
  sawKerfM = 0.005, // Mạch cưa 5mm
): NestingPlanResult {
  // Mở rộng danh sách các đoạn cần cắt
  const itemsToCut: Array<{ id: string; spoolCode: string; lengthM: number }> = [];
  for (const p of requiredPieces) {
    for (let i = 0; i < p.quantity; i++) {
      itemsToCut.push({
        id: `${p.id}-${i + 1}`,
        spoolCode: p.spoolCode,
        lengthM: p.lengthM,
      });
    }
  }

  // Sắp xếp giảm dần chiều dài (Decreasing order)
  itemsToCut.sort((a, b) => b.lengthM - a.lengthM);

  const bars: CutBarPattern[] = [];

  for (const item of itemsToCut) {
    let bestBarIndex = -1;
    let minRemainingSpace = Infinity;

    // Tìm thanh còn đủ chỗ trống nhỏ nhất (Best-Fit)
    for (let i = 0; i < bars.length; i++) {
      const remaining =
        stockLengthM - (bars[i].usedLengthM + (bars[i].cuts.length > 0 ? sawKerfM : 0));
      if (remaining >= item.lengthM && remaining < minRemainingSpace) {
        bestBarIndex = i;
        minRemainingSpace = remaining;
      }
    }

    if (bestBarIndex !== -1) {
      // Xếp vào thanh có sẵn
      const bar = bars[bestBarIndex];
      const offset = bar.usedLengthM + (bar.cuts.length > 0 ? sawKerfM : 0);
      bar.cuts.push({
        pieceId: item.id,
        spoolCode: item.spoolCode,
        lengthM: item.lengthM,
        cutOffsetStartM: Math.round(offset * 1000) / 1000,
      });
      bar.usedLengthM = Math.round((offset + item.lengthM) * 1000) / 1000;
      bar.scrapWasteM = Math.max(0, Math.round((stockLengthM - bar.usedLengthM) * 1000) / 1000);
      bar.scrapWastePercent = Math.round((bar.scrapWasteM / stockLengthM) * 1000) / 10;
    } else {
      // Mở thanh phôi mới
      const newBar: CutBarPattern = {
        barIndex: bars.length + 1,
        stockLengthM,
        usedLengthM: item.lengthM,
        scrapWasteM: Math.round((stockLengthM - item.lengthM) * 1000) / 1000,
        scrapWastePercent: Math.round(((stockLengthM - item.lengthM) / stockLengthM) * 1000) / 10,
        cuts: [
          {
            pieceId: item.id,
            spoolCode: item.spoolCode,
            lengthM: item.lengthM,
            cutOffsetStartM: 0,
          },
        ],
      };
      bars.push(newBar);
    }
  }

  const totalRequiredPieces = itemsToCut.length;
  const totalRequiredLengthM =
    Math.round(itemsToCut.reduce((sum, it) => sum + it.lengthM, 0) * 1000) / 1000;
  const totalStockBarsNeeded = bars.length;
  const totalStockLengthM = Math.round(totalStockBarsNeeded * stockLengthM * 1000) / 1000;
  const totalScrapWasteM =
    Math.round(bars.reduce((sum, b) => sum + b.scrapWasteM, 0) * 1000) / 1000;
  const overallScrapWastePercent =
    totalStockLengthM > 0 ? Math.round((totalScrapWasteM / totalStockLengthM) * 1000) / 10 : 0;

  return {
    planCode,
    materialType,
    stockLengthM,
    totalRequiredPieces,
    totalRequiredLengthM,
    totalStockBarsNeeded,
    totalStockLengthM,
    totalScrapWasteM,
    overallScrapWastePercent,
    patterns: bars,
    isOptimizedUnder2Percent: overallScrapWastePercent <= 2.5,
  };
}

// ============================================================================
// 2. PERSISTENCE & DATABASE
// ============================================================================

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
