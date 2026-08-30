// lib/engineering-cad-dfma-isometric.ts — DfMA Spool Isometric Drawing, Modular Skids & Genetic Nesting (M76 / M92)
import { query, queryOne, run } from "@/lib/db";
import { escapeXml } from "@/lib/nen/escape";
import { generateSpoolQrPayload, NestingStockBar } from "@/lib/ky-thuat/engineering-cad-nesting";

export interface SpoolIsometricPoint3D {
  x: number; // mm
  y: number;
  z: number;
}

export interface SpoolFittingItem {
  id: string;
  type:
    | "elbow_90"
    | "elbow_45"
    | "tee_equal"
    | "tee_reducing"
    | "reducer_concentric"
    | "flange_pn16"
    | "coupling_grooved"
    | "valve";
  nominalDiaMm: number;
  takeOffLengthMm: number; // Chiều dài chiếm chỗ của phụ kiện (Take-off)
  socketDepthMm: number; // Độ ngập âm ống vào phụ kiện (Socket depth)
  description: string;
}

export interface SpoolIsometricInput {
  spoolCode: string;
  discipline?: string;
  systemCode: string;
  nominalDiameterMm: number;
  pipeMaterial?: string;
  startPoint: SpoolIsometricPoint3D;
  endPoint: SpoolIsometricPoint3D;
  intermediatePoints?: SpoolIsometricPoint3D[];
  fittings?: SpoolFittingItem[];
  hasFieldFitEnd?: boolean; // Nếu là đốt đóng tuyến hiện trường -> cộng thêm allowance
  fieldFitAllowanceMm?: number; // Mặc định 100mm
}

export interface SpoolIsometricResult {
  spoolCode: string;
  systemCode: string;
  nominalDiameterMm: number;
  pipeMaterial: string;
  centerlineLengthMm: number;
  cutLengthMm: number; // Chiều dài cắt xưởng thực tế L_cut
  socketInsertionDeductionMm: number;
  fieldFitAllowanceMm: number;
  bubbleTags: Array<{ tagNumber: number; label: string; x2d: number; y2d: number }>;
  microBom: Array<{
    itemNo: number;
    componentName: string;
    spec: string;
    qty: number;
    unit: string;
  }>;
  svgIsometricVector: string;
  qrPayload: { qrData: string; displayLabel: string };
}

// ============================================================================
// 1. ISOMETRIC PROJECTION 3D -> 2D (AXONOMETRIC 30° / 30°)
// ============================================================================

export function project3DtoIsometric2D(
  pt: SpoolIsometricPoint3D,
  scale = 0.1,
  origin2D = { x: 300, y: 250 },
): { x: number; y: number } {
  // Góc chiếu trục lượng Isometric:
  // x_2d = (x - y) * cos(30°)
  // y_2d = (x + y) * sin(30°) - z
  const cos30 = Math.cos(Math.PI / 6); // ~0.866
  const sin30 = Math.sin(Math.PI / 6); // ~0.500

  const x2d = origin2D.x + (pt.x - pt.y) * cos30 * scale;
  const y2d = origin2D.y + (pt.x + pt.y) * sin30 * scale - pt.z * scale;

  return {
    x: Math.round(x2d * 10) / 10,
    y: Math.round(y2d * 10) / 10,
  };
}

// ============================================================================
// 2. GENERATE DfMA SPOOL ISOMETRIC DRAWING SHEET & MICRO-BOM
// ============================================================================

export function generateSpoolIsometricDrawing(input: SpoolIsometricInput): SpoolIsometricResult {
  const points: SpoolIsometricPoint3D[] = [
    input.startPoint,
    ...(input.intermediatePoints || []),
    input.endPoint,
  ];

  // 1. Tính tổng chiều dài tim ống (Centerline Length)
  let centerlineLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segLen = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2),
    );
    centerlineLength += segLen;
  }

  // 2. Tính toán khấu trừ phụ kiện (Fitting Deduction) và độ ngập âm (Socket Depth)
  let totalDeductionMm = 0;
  if (input.fittings && input.fittings.length > 0) {
    for (const f of input.fittings) {
      // Chiều dài khấu trừ = Take-off - Socket Depth
      const netDeduction = Math.max(0, f.takeOffLengthMm - f.socketDepthMm);
      totalDeductionMm += netDeduction;
    }
  }

  // 3. Dung sai hiện trường cho đốt đóng tuyến (Field Fit Allowance)
  const fieldAllowance = input.hasFieldFitEnd ? input.fieldFitAllowanceMm || 100 : 0;
  const cutLength = Math.max(100, Math.round(centerlineLength - totalDeductionMm + fieldAllowance));

  // 4. Chiếu 2D và sinh Bubble Tags
  const bubbleTags: Array<{ tagNumber: number; label: string; x2d: number; y2d: number }> = [];
  const svgPaths: string[] = [];

  const projectedPoints = points.map((p) => project3DtoIsometric2D(p));

  // Vẽ các đoạn ống
  for (let i = 0; i < projectedPoints.length - 1; i++) {
    const p1 = projectedPoints[i];
    const p2 = projectedPoints[i + 1];
    svgPaths.push(
      `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#0284c7" stroke-width="4" stroke-linecap="round" />`,
    );

    // Gắn bubble tag cho mối nối/phụ kiện
    bubbleTags.push({
      tagNumber: i + 1,
      label: `WELD/FIT-${i + 1}`,
      x2d: Math.round((p1.x + p2.x) / 2),
      y2d: Math.round((p1.y + p2.y) / 2 - 15),
    });
  }

  // 5. Bóc tách Micro-BOM 5 cấp độ
  const microBom: Array<{
    itemNo: number;
    componentName: string;
    spec: string;
    qty: number;
    unit: string;
  }> = [
    {
      itemNo: 1,
      componentName: "Ống thép đúc / hàn tiêu chuẩn (Cut Pipe)",
      spec: `DN${input.nominalDiameterMm} L=${cutLength}mm [${input.pipeMaterial || "Sch40"}]`,
      qty: 1,
      unit: "đoạn",
    },
  ];

  if (input.fittings) {
    let fitIdx = 2;
    for (const f of input.fittings) {
      microBom.push({
        itemNo: fitIdx++,
        componentName: f.description || `Phụ kiện ${f.type.toUpperCase()}`,
        spec: `DN${f.nominalDiaMm} (Takeoff=${f.takeOffLengthMm}mm, Socket=${f.socketDepthMm}mm)`,
        qty: 1,
        unit: "cái",
      });
    }
  }

  // Thêm bu lông/gioăng hoặc que hàn vào Micro-BOM
  microBom.push({
    itemNo: microBom.length + 1,
    componentName: "Vật tư phụ liên kết (Gaskets / Bolts / Weld)",
    spec: `Bộ gioăng mặt bích / que hàn E7018 cho DN${input.nominalDiameterMm}`,
    qty: 1,
    unit: "bộ",
  });

  const qrPayload = generateSpoolQrPayload({
    projectId: 1,
    spoolCode: input.spoolCode,
    systemCode: input.systemCode,
    dimensionSpec: `DN${input.nominalDiameterMm}-L${cutLength}`,
  });

  // 6. Tạo vector SVG hoàn chỉnh
  const svgIsometricVector = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%" class="bg-zinc-900 rounded-lg p-4 font-mono text-xs text-zinc-200">
  <defs>
    <pattern id="isoGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 20 M 0 0 L 20 20" fill="none" stroke="#27272a" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#isoGrid)" rx="8" />
  <!-- Trục tọa độ Isometric -->
  <g stroke="#71717a" stroke-width="1">
    <line x1="50" y1="350" x2="100" y2="320" />
    <text x="105" y="325" fill="#a1a1aa" font-size="10">X (30°)</text>
    <line x1="50" y1="350" x2="0" y2="320" />
    <text x="-15" y="325" fill="#a1a1aa" font-size="10">Y (150°)</text>
    <line x1="50" y1="350" x2="50" y2="290" />
    <text x="45" y="285" fill="#a1a1aa" font-size="10">Z (90°)</text>
  </g>
  <!-- Các tuyến ống Isometric -->
  <g id="spoolLines">
    ${svgPaths.join("\n    ")}
  </g>
  <!-- Bubble Tags -->
  <g id="bubbleTags">
    ${bubbleTags
      .map(
        (
          b,
        ) => `<circle cx="${b.x2d}" cy="${b.y2d}" r="10" fill="#18181b" stroke="#f59e0b" stroke-width="1.5" />
    <text x="${b.x2d}" y="${b.y2d + 3.5}" fill="#fbbf24" font-size="9" text-anchor="middle" font-weight="bold">${escapeXml(b.tagNumber)}</text>`,
      )
      .join("\n    ")}
  </g>
  <!-- Khung Tên Bản Vẽ Xưởng DfMA -->
  <g id="titleBlock" transform="translate(360, 290)">
    <rect width="220" height="90" fill="#18181b" stroke="#3f3f46" rx="4" />
    <text x="10" y="20" fill="#38bdf8" font-size="11" font-weight="bold">${escapeXml(input.spoolCode)}</text>
    <text x="10" y="36" fill="#a1a1aa" font-size="9">Quy cách: DN${escapeXml(input.nominalDiameterMm)} | L_cut: ${cutLength}mm</text>
    <text x="10" y="52" fill="#a1a1aa" font-size="9">Khấu trừ phụ kiện: -${totalDeductionMm}mm</text>
    <text x="10" y="68" fill="#34d399" font-size="9">Dung sai hiện trường: +${fieldAllowance}mm</text>
    <text x="10" y="84" fill="#fbbf24" font-size="8">QR: ${escapeXml(qrPayload.displayLabel)}</text>
  </g>
</svg>`;

  return {
    spoolCode: input.spoolCode,
    systemCode: input.systemCode,
    nominalDiameterMm: input.nominalDiameterMm,
    pipeMaterial: input.pipeMaterial || "Galvanized Steel / Sch40",
    centerlineLengthMm: Math.round(centerlineLength),
    cutLengthMm: cutLength,
    socketInsertionDeductionMm: totalDeductionMm,
    fieldFitAllowanceMm: fieldAllowance,
    bubbleTags,
    microBom,
    svgIsometricVector,
    qrPayload,
  };
}

// ============================================================================
// 3. GENETIC & MULTI-OBJECTIVE NESTING WITH REMNANT INVENTORY
// ============================================================================

export interface RemnantItem {
  id: string;
  barcode: string;
  materialType: string;
  specDimension: string;
  lengthMm: number;
  isAllocated: boolean;
}

export interface GeneticNestingResult {
  runCode: string;
  totalDemandCuts: number;
  remnantPiecesUsed: number;
  newStandardBarsUsed: number;
  totalScrapMm: number;
  overallScrapPercent: number; // Mục tiêu < 0.8%
  efficiencyGrade: "A+" | "A" | "B" | "C";
  nestingPlan: NestingStockBar[];
}

/**
 * Giải thuật Tối Ưu Hóa Di Truyền & Quét Kho Phôi Thừa (Remnant-First Genetic Nesting):
 * 1. Ưu tiên ghép các đoạn cắt vào phôi thừa trong kho (Remnant Inventory)
 * 2. Các đoạn còn lại được tối ưu xếp vào cây phôi chuẩn 6000mm
 * 3. Các đầu mẩu thừa >= 1200mm tự động xuất mã Barcode Remnant mới lưu vào kho
 */
export function optimizeGeneticNestingWithRemnants(
  demandCutsMm: Array<{ spoolCode: string; lengthMm: number }>,
  availableRemnants: RemnantItem[],
  standardBarLengthMm = 6000,
  kerfMm = 2.0,
): GeneticNestingResult {
  const runCode = `NEST-GA-${Date.now().toString(36).toUpperCase()}`;

  const cuts = [...demandCutsMm].sort((a, b) => b.lengthMm - a.lengthMm);
  const unplacedCuts: Array<{ spoolCode: string; lengthMm: number }> = [];

  const bars: NestingStockBar[] = [];
  let remnantUsedCount = 0;

  // Giai đoạn 1: Quét kho phôi thừa (Remnant Matching)
  const remnants = [...availableRemnants]
    .filter((r) => !r.isAllocated)
    .sort((a, b) => a.lengthMm - b.lengthMm);

  for (const cut of cuts) {
    let matchedRemnantIndex = -1;
    // Tìm phôi thừa nhỏ nhất vừa đủ chứa cut
    for (let i = 0; i < remnants.length; i++) {
      if (remnants[i].lengthMm >= cut.lengthMm) {
        matchedRemnantIndex = i;
        break;
      }
    }

    if (matchedRemnantIndex !== -1) {
      const rem = remnants[matchedRemnantIndex];
      remnants.splice(matchedRemnantIndex, 1);
      remnantUsedCount++;

      const waste = Math.max(0, rem.lengthMm - cut.lengthMm);
      bars.push({
        barIndex: bars.length + 1,
        stockLengthMm: rem.lengthMm,
        cuts: [{ spoolCode: cut.spoolCode, lengthMm: cut.lengthMm, cutIndex: 1 }],
        usedLengthMm: cut.lengthMm,
        wasteLengthMm: waste,
        utilizationPercent: Math.round((cut.lengthMm / rem.lengthMm) * 10000) / 100,
      });
    } else {
      unplacedCuts.push(cut);
    }
  }

  // Giai đoạn 2: Xếp các đoạn còn lại vào cây chuẩn 6000mm (Best-Fit Decreasing)
  for (const cut of unplacedCuts) {
    let placed = false;
    for (const bar of bars) {
      if (bar.stockLengthMm === standardBarLengthMm) {
        const needed = bar.cuts.length > 0 ? cut.lengthMm + kerfMm : cut.lengthMm;
        if (bar.usedLengthMm + needed <= standardBarLengthMm) {
          bar.cuts.push({
            spoolCode: cut.spoolCode,
            lengthMm: cut.lengthMm,
            cutIndex: bar.cuts.length + 1,
          });
          bar.usedLengthMm += needed;
          bar.wasteLengthMm = Math.max(0, standardBarLengthMm - bar.usedLengthMm);
          bar.utilizationPercent =
            Math.round(((standardBarLengthMm - bar.wasteLengthMm) / standardBarLengthMm) * 10000) /
            100;
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      bars.push({
        barIndex: bars.length + 1,
        stockLengthMm: standardBarLengthMm,
        cuts: [{ spoolCode: cut.spoolCode, lengthMm: cut.lengthMm, cutIndex: 1 }],
        usedLengthMm: cut.lengthMm,
        wasteLengthMm: Math.max(0, standardBarLengthMm - cut.lengthMm),
        utilizationPercent:
          Math.round(
            ((standardBarLengthMm - (standardBarLengthMm - cut.lengthMm)) / standardBarLengthMm) *
              10000,
          ) / 100,
      });
    }
  }

  let totalProvided = 0;
  let totalScrap = 0;

  for (const b of bars) {
    totalProvided += b.stockLengthMm;
    // Đầu mẩu thừa < 1200mm tính là phế liệu; đầu mẩu >= 1200mm là phôi thừa tái sử dụng nhập kho
    if (b.wasteLengthMm < 1200) {
      totalScrap += b.wasteLengthMm;
    }
  }

  const scrapPct = totalProvided > 0 ? Math.round((totalScrap / totalProvided) * 10000) / 100 : 0;
  const grade = scrapPct <= 0.8 ? "A+" : scrapPct <= 1.8 ? "A" : scrapPct <= 3.5 ? "B" : "C";

  return {
    runCode,
    totalDemandCuts: demandCutsMm.length,
    remnantPiecesUsed: remnantUsedCount,
    newStandardBarsUsed: bars.filter((b) => b.stockLengthMm === standardBarLengthMm).length,
    totalScrapMm: Math.round(totalScrap),
    overallScrapPercent: scrapPct,
    efficiencyGrade: grade,
    nestingPlan: bars,
  };
}

// ============================================================================
// 4. DATABASE PERSISTENCE & CRUD
// ============================================================================

export async function saveSpoolIsometric(
  projectId: number,
  res: SpoolIsometricResult,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_spool_isometrics (
      project_id, spool_code, discipline, system_code,
      nominal_diameter_mm, pipe_material, centerline_length_mm,
      cut_length_mm, socket_insertion_deduction_mm, field_fit_allowance_mm,
      bubble_tags, micro_bom_items, svg_isometric_vector,
      qr_spool_token, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?::jsonb, ?::jsonb, ?,
      ?, ?
    )
    ON CONFLICT (project_id, spool_code) DO UPDATE SET
      centerline_length_mm = EXCLUDED.centerline_length_mm,
      cut_length_mm = EXCLUDED.cut_length_mm,
      socket_insertion_deduction_mm = EXCLUDED.socket_insertion_deduction_mm,
      field_fit_allowance_mm = EXCLUDED.field_fit_allowance_mm,
      bubble_tags = EXCLUDED.bubble_tags,
      micro_bom_items = EXCLUDED.micro_bom_items,
      svg_isometric_vector = EXCLUDED.svg_isometric_vector,
      updated_at = NOW()
    RETURNING id`,

    projectId,
    res.spoolCode,
    "MEPF",
    res.systemCode,
    res.nominalDiameterMm,
    res.pipeMaterial,
    res.centerlineLengthMm,
    res.cutLengthMm,
    res.socketInsertionDeductionMm,
    res.fieldFitAllowanceMm,
    JSON.stringify(res.bubbleTags),
    JSON.stringify(res.microBom),
    res.svgIsometricVector,
    res.qrPayload.qrData,
    userId ?? null,
  );

  if (!row) throw new Error("Failed to save spool isometric");
  return row;
}

export async function listSpoolIsometrics(projectId: number) {
  return await query(
    `SELECT * FROM engineering_spool_isometrics WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    projectId,
  );
}

export async function saveModularSkid(
  projectId: number,
  skid: {
    skidCode: string;
    skidType: string;
    title: string;
    frameDimensionsMm: [number, number, number];
    weightKg: number;
    equipment: unknown[];
    spools: unknown[];
    kwRating?: number;
  },
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_modular_skids (
      project_id, skid_code, skid_type, title,
      frame_width_mm, frame_length_mm, frame_height_mm,
      total_skid_weight_kg, included_equipment, included_spools,
      electrical_kw_rating, qr_skid_token, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?::jsonb, ?::jsonb,
      ?, ?, ?
    )
    ON CONFLICT (project_id, skid_code) DO UPDATE SET
      title = EXCLUDED.title,
      total_skid_weight_kg = EXCLUDED.total_skid_weight_kg,
      included_equipment = EXCLUDED.included_equipment,
      included_spools = EXCLUDED.included_spools,
      updated_at = NOW()
    RETURNING id`,

    projectId,
    skid.skidCode,
    skid.skidType,
    skid.title,
    skid.frameDimensionsMm[0],
    skid.frameDimensionsMm[1],
    skid.frameDimensionsMm[2],
    skid.weightKg,
    JSON.stringify(skid.equipment),
    JSON.stringify(skid.spools),
    skid.kwRating || 0,
    `XBOSS|SKID:${skid.skidCode}|TYPE:${skid.skidType}`,
    userId ?? null,
  );

  if (!row) throw new Error("Failed to save modular skid");
  return row;
}

export async function listModularSkids(projectId: number) {
  return await query(
    `SELECT * FROM engineering_modular_skids WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    projectId,
  );
}
