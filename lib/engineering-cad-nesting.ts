// lib/engineering-cad-nesting.ts — 1D/2D Fabrication Nesting & MEPF Hydraulic Engine (M89)
import { query, queryOne, run } from "@/lib/db";

// ============================================================================
// 1. 1D PIPE NESTING ENGINE (FIRST-FIT DECREASING ALGORITHM)
// ============================================================================

export interface PipeSegmentInput {
  spoolCode: string;
  lengthMm: number;
  discipline?: string;
  systemCode?: string;
  diameterMm?: number;
  quantity?: number; // Số lượng đoạn giống nhau (default 1)
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

/**
 * Thuật toán First-Fit Decreasing (FFD) giải bài toán 1D Cutting Stock Problem.
 * Sắp xếp các đoạn ống giảm dần, xếp tham lam vào cây phôi đầu tiên còn đủ chỗ (bù trừ vết cắt kerf).
 */
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

  // 1. Mở rộng các segment có quantity > 1
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

  // 2. Sắp xếp giảm dần theo chiều dài (Decreasing Order)
  expanded.sort((a, b) => b.lengthMm - a.lengthMm);

  const bars: NestingStockBar[] = [];
  const unplaced: PipeSegmentInput[] = [];

  for (const item of expanded) {
    if (item.lengthMm > stockLengthMm) {
      // Đoạn dài hơn chiều dài tiêu chuẩn của cây phôi
      unplaced.push({
        spoolCode: item.spoolCode,
        lengthMm: item.lengthMm,
        systemCode: item.systemCode,
      });
      continue;
    }

    let placed = false;

    // Tìm bar đầu tiên có thể chứa (First-Fit)
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

    // Nếu không đặt được vào bar nào hiện có -> Mở bar mới
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

  // 3. Tổng hợp chỉ số hiệu quả
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

// ============================================================================
// 2. 2D DUCT SHEET METAL NESTING (GUILLOTINE ALGORITHM)
// ============================================================================

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

/**
 * Thuật toán 2D Guillotine Cắt Tôn Ống Gió tấm tiêu chuẩn (1200x2400mm).
 */
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

  // Sắp xếp diện tích giảm dần
  const sorted = [...rects].sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm);

  const sheets: DuctSheetMetalBar[] = [];
  const singleSheetAreaM2 = (sheetWidthMm * sheetHeightMm) / 1_000_000;

  for (const r of sorted) {
    let placed = false;

    for (const sheet of sheets) {
      // Tìm vị trí trống đơn giản theo lưới hàng (Row shelf packing)
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

// ============================================================================
// 3. QR SPOOL CODE GENERATOR FOR LOGISTICS & FABRICATION
// ============================================================================

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

// ============================================================================
// 4. BỘ TÍNH TOÁN THỦY LỰC & KHÍ ĐỘNG MEPF (HYDRAULIC & DUCT SIZING)
// ============================================================================

export type SystemVelocityCategory =
  | "domestic_water"
  | "chilled_water"
  | "pump_suction"
  | "duct_branch"
  | "duct_main"
  | "fire_sprinkler";

export const VELOCITY_LIMITS: Record<
  SystemVelocityCategory,
  { minMs: number; maxMs: number; standard: string; reason: string }
> = {
  domestic_water: {
    minMs: 0.6,
    maxMs: 2.0,
    standard: "TCVN 4513:1988",
    reason: "Tránh lắng cặn khi v thấp và xói mòn/ồn khi v cao.",
  },
  chilled_water: {
    minMs: 0.9,
    maxMs: 2.5,
    standard: "ASHRAE Fundamentals",
    reason: "Tối ưu hóa truyền nhiệt và tổn thất cột áp bơm.",
  },
  pump_suction: {
    minMs: 0.5,
    maxMs: 1.2,
    standard: "HI 9.6.6 / TCVN",
    reason: "Chống hiện tượng xâm thực khí (Cavitation) phá hỏng cánh bơm.",
  },
  duct_branch: {
    minMs: 3.0,
    maxMs: 6.0,
    standard: "SMACNA / TCVN 5687",
    reason: "Đảm bảo độ ồn tiêu chuẩn NC 30-35 khu vực văn phòng.",
  },
  duct_main: {
    minMs: 6.0,
    maxMs: 10.0,
    standard: "SMACNA / TCVN 5687",
    reason: "Tránh rung lắc đường ống trục đứng và tiếng ồn truyền vào phòng.",
  },
  fire_sprinkler: {
    minMs: 1.0,
    maxMs: 5.0,
    standard: "NFPA 13 / TCVN 7336",
    reason: "Cung cấp lưu lượng chữa cháy tức thời theo thiết kế.",
  },
};

/**
 * Tính toán thủy lực theo công thức Hazen-Williams (Áp dụng cho nước 10°C - 30°C).
 * h_f = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
 */
export function calcHazenWilliams(
  flowRateLps: number,
  pipeDiameterMm: number,
  pipeLengthM = 1.0,
  cFactor = 120, // 120: Ống thép mới, 140: Ống nhựa PPR/HDPE, 100: Thép cũ
): {
  velocityMs: number;
  headLossPerMeterPa: number;
  totalHeadLossPa: number;
  pressureDropBar: number;
} {
  const dM = pipeDiameterMm / 1000;
  const qM3s = flowRateLps / 1000;
  const areaM2 = (Math.PI * dM * dM) / 4;

  const velocity = areaM2 > 0 ? qM3s / areaM2 : 0;

  // Hazen-Williams head loss S (m H2O / m pipe)
  // S = 10.67 * Q^1.852 / (C^1.852 * D^4.87)
  const headLossPerM =
    (10.67 * Math.pow(Math.max(1e-6, qM3s), 1.852)) /
    (Math.pow(cFactor, 1.852) * Math.pow(dM, 4.87));

  // 1 m H2O = 9806.65 Pa
  const headLossPerMPa = headLossPerM * 9806.65;
  const totalHeadLossPa = headLossPerMPa * pipeLengthM;
  const pressureDropBar = totalHeadLossPa / 100000;

  return {
    velocityMs: Math.round(velocity * 1000) / 1000,
    headLossPerMeterPa: Math.round(headLossPerMPa * 100) / 100,
    totalHeadLossPa: Math.round(totalHeadLossPa * 100) / 100,
    pressureDropBar: Math.round(pressureDropBar * 10000) / 10000,
  };
}

/**
 * Tính toán thủy lực chính xác theo công thức Darcy-Weisbach & Colebrook-White.
 */
export function calcDarcyWeisbach(
  flowRateLps: number,
  pipeDiameterMm: number,
  roughnessMm = 0.046, // Thép thương mại: 0.046mm, Nhựa: 0.007mm
  pipeLengthM = 1.0,
  fluidTempC = 25.0,
): {
  velocityMs: number;
  reynoldsNumber: number;
  frictionFactor: number;
  headLossPerMeterPa: number;
  totalHeadLossPa: number;
  pressureDropBar: number;
} {
  const dM = pipeDiameterMm / 1000;
  const qM3s = flowRateLps / 1000;
  const areaM2 = (Math.PI * dM * dM) / 4;
  const velocity = areaM2 > 0 ? qM3s / areaM2 : 0;

  // Độ nhớt động học nước theo nhiệt độ xấp xỉ: nu = 1.79e-6 / (1 + 0.0337*T + 0.00022*T^2)
  const nu = 1.79e-6 / (1 + 0.0337 * fluidTempC + 0.00022 * fluidTempC * fluidTempC);
  const reynolds = (velocity * dM) / Math.max(1e-9, nu);

  // Hệ số ma sát Darcy f (Swamee-Jain approximation)
  const eps = roughnessMm / 1000;
  let f = 0.02;
  if (reynolds < 2300) {
    // Dòng chảy tầng (Laminar)
    f = reynolds > 0 ? 64 / reynolds : 0.02;
  } else {
    // Dòng chảy rối (Turbulent)
    f = 0.25 / Math.pow(Math.log10(eps / (3.7 * dM) + 5.74 / Math.pow(reynolds, 0.9)), 2);
  }

  const rho = 1000; // Khối lượng riêng nước ~ 1000 kg/m3
  // deltaP = f * (L/D) * (rho * v^2 / 2)
  const dpPerM = f * (1 / dM) * ((rho * velocity * velocity) / 2);
  const totalDp = dpPerM * pipeLengthM;
  const dpBar = totalDp / 100000;

  return {
    velocityMs: Math.round(velocity * 1000) / 1000,
    reynoldsNumber: Math.round(reynolds),
    frictionFactor: Math.round(f * 10000) / 10000,
    headLossPerMeterPa: Math.round(dpPerM * 100) / 100,
    totalHeadLossPa: Math.round(totalDp * 100) / 100,
    pressureDropBar: Math.round(dpBar * 10000) / 10000,
  };
}

/**
 * Kiểm tra tính hợp lệ của vận tốc dòng chảy theo quy chuẩn Invariant.
 */
export function validateVelocityLimit(
  velocityMs: number,
  systemType: SystemVelocityCategory,
): {
  ok: boolean;
  limitMs: number;
  status: "pass" | "warning" | "fail";
  message: string;
} {
  const spec = VELOCITY_LIMITS[systemType] || VELOCITY_LIMITS.domestic_water;

  if (velocityMs > spec.maxMs) {
    return {
      ok: false,
      limitMs: spec.maxMs,
      status: "fail",
      message: `VẬN TỐC VƯỢT GIỚI HẠN (${velocityMs.toFixed(2)} m/s > ${spec.maxMs} m/s). ${spec.reason} Căn cứ: ${spec.standard}.`,
    };
  }

  if (velocityMs < spec.minMs) {
    return {
      ok: true,
      limitMs: spec.minMs,
      status: "warning",
      message: `Vận tốc hơi thấp (${velocityMs.toFixed(2)} m/s < ${spec.minMs} m/s). Cảnh báo nguy cơ lắng đọng cặn bẩn. Căn cứ: ${spec.standard}.`,
    };
  }

  return {
    ok: true,
    limitMs: spec.maxMs,
    status: "pass",
    message: `Vận tốc đạt chuẩn kỹ thuật (${velocityMs.toFixed(2)} m/s trong dải ${spec.minMs}-${spec.maxMs} m/s).`,
  };
}

/**
 * Tính toán kích thước ống gió dựa trên lưu lượng (CFM) và vận tốc khống chế (Velocity Method).
 */
export function sizeDuctByVelocity(
  airflowCfm: number,
  targetVelocityMs = 6.0,
  aspectRatio = 1.5, // Tỷ lệ W/H chuẩn
): {
  widthMm: number;
  heightMm: number;
  actualVelocityMs: number;
  equivalentDiameterMm: number;
} {
  // 1 CFM = 0.000471947 m3/s
  const qM3s = airflowCfm * 0.000471947;
  const reqAreaM2 = qM3s / Math.max(0.1, targetVelocityMs);

  // Area = W * H = (r * H) * H = r * H^2  => H = sqrt(Area / r)
  const hM = Math.sqrt(reqAreaM2 / aspectRatio);
  const wM = hM * aspectRatio;

  // Làm tròn theo nấc 50mm chuẩn gia công ống gió
  const hMm = Math.max(100, Math.round((hM * 1000) / 50) * 50);
  const wMm = Math.max(100, Math.round((wM * 1000) / 50) * 50);

  const actAreaM2 = (wMm * hMm) / 1_000_000;
  const actVelocity = actAreaM2 > 0 ? qM3s / actAreaM2 : 0;

  // Đường kính tương đương Huebscher: De = 1.30 * (W*H)^0.625 / (W + H)^0.25
  const eqD = (1.3 * Math.pow(wMm * hMm, 0.625)) / Math.pow(Math.max(1, wMm + hMm), 0.25);

  return {
    widthMm: wMm,
    heightMm: hMm,
    actualVelocityMs: Math.round(actVelocity * 100) / 100,
    equivalentDiameterMm: Math.round(eqD),
  };
}

// ============================================================================
// 5. DATABASE PERSISTENCE & CRUD
// ============================================================================

export interface NestingRunRecord {
  id: string;
  project_id: number;
  run_code: string;
  discipline: string;
  stock_length_mm: number;
  kerf_mm: number;
  total_segments: number;
  total_bars_used: number;
  total_used_length_mm: number;
  total_waste_mm: number;
  waste_percent: number;
  efficiency_grade: string;
  nesting_plan: NestingStockBar[];
  created_at: string;
}

export interface HydraulicCheckRecord {
  id: string;
  project_id: number;
  check_code: string;
  system_type: string;
  formula_used: string;
  flow_rate_lps: number | null;
  pipe_diameter_mm: number | null;
  pipe_length_m: number | null;
  velocity_ms: number | null;
  reynolds_number: number | null;
  head_loss_per_m_pa: number | null;
  total_head_loss_pa: number | null;
  pressure_drop_bar: number | null;
  airflow_cfm: number | null;
  duct_width_mm: number | null;
  duct_height_mm: number | null;
  velocity_limit_ms: number | null;
  velocity_ok: boolean;
  warnings: string[];
  status: string;
  created_at: string;
}

export async function saveNestingRun(
  projectId: number,
  discipline: string,
  result: Nesting1DResult,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_pipe_nesting_runs (
      project_id, run_code, discipline, stock_length_mm, kerf_mm,
      total_segments, total_bars_used, total_used_length_mm, total_waste_mm,
      waste_percent, efficiency_grade, nesting_plan, created_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?::jsonb, ?
    )
    ON CONFLICT (project_id, run_code) DO UPDATE SET
      total_bars_used = EXCLUDED.total_bars_used,
      waste_percent = EXCLUDED.waste_percent,
      nesting_plan = EXCLUDED.nesting_plan
    RETURNING id`,
    [
      projectId,
      result.runCode,
      discipline,
      result.stockLengthMm,
      result.kerfMm,
      result.totalSegments,
      result.totalBarsUsed,
      result.totalUsedLengthMm,
      result.totalWasteMm,
      result.wastePercent,
      result.efficiencyGrade,
      JSON.stringify(result.bars),
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save pipe nesting run");
  return row;
}

export async function listNestingRuns(projectId: number): Promise<NestingRunRecord[]> {
  return await query<NestingRunRecord>(
    `SELECT * FROM engineering_pipe_nesting_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}

export async function saveHydraulicCheck(
  projectId: number,
  input: {
    systemType: string;
    formulaUsed: string;
    flowRateLps?: number;
    pipeDiameterMm?: number;
    pipeLengthM?: number;
    roughnessMm?: number;
    fluidTempC?: number;
    airflowCfm?: number;
    ductWidthMm?: number;
    ductHeightMm?: number;
    linkedSpoolCode?: string;
  },
  result: {
    velocityMs?: number;
    reynoldsNumber?: number;
    frictionFactor?: number;
    headLossPerMPa?: number;
    totalHeadLossPa?: number;
    pressureDropBar?: number;
    velocityLimitMs?: number;
    velocityOk?: boolean;
    warnings?: string[];
    status?: string;
  },
  userId?: number | null,
): Promise<{ id: string }> {
  const checkCode = `HYD-${Date.now().toString(36).toUpperCase()}`;

  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_hydraulic_checks (
      project_id, check_code, system_type, formula_used,
      flow_rate_lps, pipe_diameter_mm, pipe_length_m, roughness_mm, fluid_temp_c,
      velocity_ms, reynolds_number, friction_factor, head_loss_per_m_pa, total_head_loss_pa,
      pressure_drop_bar, airflow_cfm, duct_width_mm, duct_height_mm,
      velocity_limit_ms, velocity_ok, warnings, status, linked_spool_code, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?::jsonb, ?, ?, ?
    ) RETURNING id`,
    [
      projectId,
      checkCode,
      input.systemType,
      input.formulaUsed,
      input.flowRateLps ?? null,
      input.pipeDiameterMm ?? null,
      input.pipeLengthM ?? null,
      input.roughnessMm ?? null,
      input.fluidTempC ?? 25.0,
      result.velocityMs ?? null,
      result.reynoldsNumber ?? null,
      result.frictionFactor ?? null,
      result.headLossPerMPa ?? null,
      result.totalHeadLossPa ?? null,
      result.pressureDropBar ?? null,
      input.airflowCfm ?? null,
      input.ductWidthMm ?? null,
      input.ductHeightMm ?? null,
      result.velocityLimitMs ?? null,
      result.velocityOk ?? true,
      JSON.stringify(result.warnings || []),
      result.status || "pass",
      input.linkedSpoolCode ?? null,
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save hydraulic check");
  return row;
}

export async function listHydraulicChecks(projectId: number): Promise<HydraulicCheckRecord[]> {
  return await query<HydraulicCheckRecord>(
    `SELECT * FROM engineering_hydraulic_checks WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
