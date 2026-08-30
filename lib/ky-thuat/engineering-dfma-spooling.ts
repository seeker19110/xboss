// lib/engineering-dfma-spooling.ts — Unified DfMA Spooling, 1D/2D Nesting & Remnant Mass-Balance Engine (M68 / M89 / M90 / M91 / M95)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

// ============================================================================
// 1. DATA TYPES & INTERFACES
// ============================================================================

export interface PipeSegmentInput {
  spoolCode: string;
  lengthMm: number;
  discipline?: string;
  systemCode?: string;
  diameterMm?: number;
  quantity?: number;
}

export interface CutItem {
  spoolCode: string;
  lengthMm: number;
  systemCode?: string;
  cutIndex: number;
}

export interface NestingStockBar {
  barIndex: number;
  stockLengthMm: number;
  cuts: CutItem[];
  usedLengthMm: number;
  wasteLengthMm: number;
  utilizationPercent: number;
}

export interface Nesting1DResult {
  runCode: string;
  stockLengthMm: number;
  kerfMm: number;
  totalSegments: number;
  totalBarsUsed: number;
  totalUsedLengthMm: number;
  totalWasteMm: number;
  wastePercent: number;
  utilizationPercent: number;
  efficiencyGrade: "A" | "B" | "C" | "D" | "F";
  bars: NestingStockBar[];
  unplacedSegments: PipeSegmentInput[];
}

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

export interface DuctSheetRectInput {
  spoolCode: string;
  widthMm: number;
  heightMm: number;
  tag?: string;
}

export interface PlacedSheetRect {
  spoolCode: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

export interface DuctSheetMetalBar {
  sheetIndex: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  placedRects: PlacedSheetRect[];
  usedAreaM2: number;
  totalAreaM2: number;
  wastePercent: number;
}

export interface Nesting2DResult {
  runCode: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  totalSheets: number;
  totalPlacedRects: number;
  totalUsedAreaM2: number;
  totalWasteAreaM2: number;
  overallWastePercent: number;
  sheets: DuctSheetMetalBar[];
}

// ============================================================================
// 2. 1D NESTING ALGORITHMS (FFD & BFD WITH KERF)
// ============================================================================

export function nestPipeSegments1D(
  segments: PipeSegmentInput[],
  stockLengthMm = 6000.0,
  kerfMm = 2.0,
): Nesting1DResult {
  const runCode = `NEST-1D-${Date.now().toString(36).toUpperCase()}`;

  if (!segments || segments.length === 0) {
    return {
      runCode,
      stockLengthMm,
      kerfMm,
      totalSegments: 0,
      totalBarsUsed: 0,
      totalUsedLengthMm: 0,
      totalWasteMm: 0,
      wastePercent: 0,
      utilizationPercent: 100,
      efficiencyGrade: "A",
      bars: [],
      unplacedSegments: [],
    };
  }

  const expanded: Array<{ spoolCode: string; lengthMm: number; systemCode?: string }> = [];
  for (const seg of segments) {
    const qty = Math.max(1, seg.quantity || 1);
    for (let q = 0; q < qty; q++) {
      expanded.push({
        spoolCode: qty > 1 ? `${seg.spoolCode}-${q + 1}` : seg.spoolCode,
        lengthMm: Number(seg.lengthMm),
        systemCode: seg.systemCode,
      });
    }
  }

  expanded.sort((a, b) => b.lengthMm - a.lengthMm);

  const bars: NestingStockBar[] = [];
  const unplaced: PipeSegmentInput[] = [];

  for (const item of expanded) {
    if (item.lengthMm > stockLengthMm) {
      unplaced.push({
        spoolCode: item.spoolCode,
        lengthMm: item.lengthMm,
        systemCode: item.systemCode,
      });
      continue;
    }

    let placed = false;
    for (const bar of bars) {
      const neededSpace = bar.cuts.length > 0 ? item.lengthMm + kerfMm : item.lengthMm;
      if (bar.usedLengthMm + neededSpace <= stockLengthMm) {
        bar.cuts.push({
          spoolCode: item.spoolCode,
          lengthMm: item.lengthMm,
          systemCode: item.systemCode,
          cutIndex: bar.cuts.length + 1,
        });
        bar.usedLengthMm += neededSpace;
        bar.wasteLengthMm = Math.max(0, stockLengthMm - bar.usedLengthMm);
        bar.utilizationPercent =
          Math.round(((stockLengthMm - bar.wasteLengthMm) / stockLengthMm) * 10000) / 100;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newBar: NestingStockBar = {
        barIndex: bars.length + 1,
        stockLengthMm,
        cuts: [
          {
            spoolCode: item.spoolCode,
            lengthMm: item.lengthMm,
            systemCode: item.systemCode,
            cutIndex: 1,
          },
        ],
        usedLengthMm: item.lengthMm,
        wasteLengthMm: Math.max(0, stockLengthMm - item.lengthMm),
        utilizationPercent:
          Math.round(((stockLengthMm - (stockLengthMm - item.lengthMm)) / stockLengthMm) * 10000) /
          100,
      };
      bars.push(newBar);
    }
  }

  let totalUsed = 0;
  let totalWaste = 0;
  for (const b of bars) {
    totalUsed += b.usedLengthMm;
    totalWaste += b.wasteLengthMm;
  }

  const totalStockProvided = bars.length * stockLengthMm;
  const wastePct =
    totalStockProvided > 0 ? Math.round((totalWaste / totalStockProvided) * 10000) / 100 : 0;
  const utilPct = totalStockProvided > 0 ? Math.round((100 - wastePct) * 100) / 100 : 100;

  let grade: Nesting1DResult["efficiencyGrade"] = "F";
  if (wastePct <= 1.8) grade = "A";
  else if (wastePct <= 3.5) grade = "B";
  else if (wastePct <= 6.0) grade = "C";
  else if (wastePct <= 10.0) grade = "D";

  return {
    runCode,
    stockLengthMm,
    kerfMm,
    totalSegments: expanded.length - unplaced.length,
    totalBarsUsed: bars.length,
    totalUsedLengthMm: Math.round(totalUsed * 100) / 100,
    totalWasteMm: Math.round(totalWaste * 100) / 100,
    wastePercent: wastePct,
    utilizationPercent: utilPct,
    efficiencyGrade: grade,
    bars,
    unplacedSegments: unplaced,
  };
}

export function solve1dCuttingStock(
  planCode: string,
  materialType: string,
  requiredPieces: RequiredPiece[],
  stockLengthM = 6.0,
  sawKerfM = 0.005,
): NestingPlanResult {
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

  itemsToCut.sort((a, b) => b.lengthM - a.lengthM);
  const bars: CutBarPattern[] = [];

  for (const item of itemsToCut) {
    let bestBarIndex = -1;
    let minRemainingSpace = Infinity;

    for (let i = 0; i < bars.length; i++) {
      const remaining =
        stockLengthM - (bars[i].usedLengthM + (bars[i].cuts.length > 0 ? sawKerfM : 0));
      if (remaining >= item.lengthM && remaining < minRemainingSpace) {
        bestBarIndex = i;
        minRemainingSpace = remaining;
      }
    }

    if (bestBarIndex !== -1) {
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
// 3. 2D DUCT SHEET METAL NESTING (GUILLOTINE ALGORITHM)
// ============================================================================

export function nestDuctSheets2D(
  rects: DuctSheetRectInput[],
  sheetWidthMm = 1200.0,
  sheetHeightMm = 2400.0,
  marginMm = 10.0,
): Nesting2DResult {
  const runCode = `NEST-2D-${Date.now().toString(36).toUpperCase()}`;

  if (!rects || rects.length === 0) {
    return {
      runCode,
      sheetWidthMm,
      sheetHeightMm,
      totalSheets: 0,
      totalPlacedRects: 0,
      totalUsedAreaM2: 0,
      totalWasteAreaM2: 0,
      overallWastePercent: 0,
      sheets: [],
    };
  }

  const sorted = [...rects].sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm);
  const sheets: DuctSheetMetalBar[] = [];
  const singleSheetAreaM2 = (sheetWidthMm * sheetHeightMm) / 1_000_000;

  for (const r of sorted) {
    let placed = false;

    for (const sheet of sheets) {
      let curX = marginMm;
      let curY = marginMm;
      let rowMaxH = 0;

      for (const p of sheet.placedRects) {
        if (p.x + p.widthMm + marginMm > curX) {
          curX = p.x + p.widthMm + marginMm;
        }
        if (p.heightMm > rowMaxH) {
          rowMaxH = p.heightMm;
        }
      }

      const rw = r.widthMm;
      const rh = r.heightMm;

      if (curX + rw + marginMm <= sheetWidthMm && curY + rh + marginMm <= sheetHeightMm) {
        sheet.placedRects.push({
          spoolCode: r.spoolCode,
          x: curX,
          y: curY,
          widthMm: rw,
          heightMm: rh,
          rotated: false,
        });
        sheet.usedAreaM2 += (rw * rh) / 1_000_000;
        sheet.wastePercent =
          Math.round(((singleSheetAreaM2 - sheet.usedAreaM2) / singleSheetAreaM2) * 10000) / 100;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const rw = r.widthMm;
      const rh = r.heightMm;
      const newSheet: DuctSheetMetalBar = {
        sheetIndex: sheets.length + 1,
        sheetWidthMm,
        sheetHeightMm,
        placedRects: [
          {
            spoolCode: r.spoolCode,
            x: marginMm,
            y: marginMm,
            widthMm: rw,
            heightMm: rh,
            rotated: false,
          },
        ],
        usedAreaM2: (rw * rh) / 1_000_000,
        totalAreaM2: singleSheetAreaM2,
        wastePercent:
          Math.round(((singleSheetAreaM2 - (rw * rh) / 1_000_000) / singleSheetAreaM2) * 10000) /
          100,
      };
      sheets.push(newSheet);
    }
  }

  const totalUsedM2 = sheets.reduce((s, sh) => s + sh.usedAreaM2, 0);
  const totalAreaM2 = sheets.length * singleSheetAreaM2;
  const totalWasteM2 = Math.max(0, totalAreaM2 - totalUsedM2);
  const overallWastePct =
    totalAreaM2 > 0 ? Math.round((totalWasteM2 / totalAreaM2) * 10000) / 100 : 0;

  return {
    runCode,
    sheetWidthMm,
    sheetHeightMm,
    totalSheets: sheets.length,
    totalPlacedRects: sorted.length,
    totalUsedAreaM2: Math.round(totalUsedM2 * 1000) / 1000,
    totalWasteAreaM2: Math.round(totalWasteM2 * 1000) / 1000,
    overallWastePercent: overallWastePct,
    sheets,
  };
}

export function generateSpoolQrPayload(spool: {
  projectId: number | string;
  spoolCode: string;
  discipline?: string;
  systemCode?: string;
  dimensionSpec?: string;
  floorLabel?: string;
}): { qrData: string; displayLabel: string } {
  const qrData = `XBOSS|PRJ:${spool.projectId}|SPOOL:${spool.spoolCode}|SPEC:${spool.dimensionSpec || "N/A"}|SYS:${spool.systemCode || "MEPF"}|FL:${spool.floorLabel || "L1"}`;
  const displayLabel = `${spool.spoolCode} [${spool.dimensionSpec || ""}]`;
  return { qrData, displayLabel };
}
