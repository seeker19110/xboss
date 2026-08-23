// lib/engineering-cad-corridor.ts — Generative Multi-Tier Corridor & Trapeze Engineering (M76 / M92)
import { query, queryOne, run } from "@/lib/db";

export type MepfSystemTier = "tier_1_top" | "tier_2_mid" | "tier_3_bot" | "sprinkler_ceiling";

export interface CorridorSystemAssignment {
  systemCode: string; // HVAC_SUPPLY | HVAC_RETURN | ELEC_POWER | ELEC_ELV | DOMESTIC_WATER | DRAINAGE | FIRE_SPRINKLER
  discipline: "hvac" | "electrical" | "plumbing" | "firefighting";
  tier: MepfSystemTier;
  widthMm: number;
  heightOrDiaMm: number;
  weightKgPerM: number; // Tải trọng bản thân + chất lỏng/cáp + bảo ôn
  insulationThicknessMm?: number;
  allocatedElevationMm: number; // Cao độ đáy (BOP) hoặc tim
  lateralPositionMm: number; // Vị trí ngang tính từ mép trái hành lang
}

export interface CorridorLayoutInput {
  corridorCode: string;
  title: string;
  towerLabel?: string;
  floorLabel?: string;
  zoneLabel?: string;
  corridorWidthMm?: number;
  corridorClearHeightMm?: number; // Yêu cầu kiến trúc thông thủy tối thiểu (vd 2600mm)
  slabBottomElevationMm?: number; // Cao độ đáy sàn (vd 3500mm)
  beamBottomElevationMm?: number; // Cao độ đáy dầm (vd 3100mm)
  ceilingElevationMm?: number; // Cao độ trần hoàn thiện (vd 2600mm)
  systems: Array<{
    systemCode: string;
    discipline: "hvac" | "electrical" | "plumbing" | "firefighting";
    widthMm: number;
    heightOrDiaMm: number;
    weightKgPerM: number;
    insulationThicknessMm?: number;
  }>;
}

export interface CorridorLayoutResult {
  corridorCode: string;
  corridorWidthMm: number;
  corridorClearHeightMm: number;
  availableServiceDepthMm: number;
  tierAllocations: {
    tier1TopDuctElevationMm: number;
    tier2MidTrayElevationMm: number;
    tier3BotPipesElevationMm: number;
    sprinklerElevationMm: number;
  };
  assignedSystems: CorridorSystemAssignment[];
  isCompliant: boolean;
  isolationWarnings: string[];
  recommendedTrapezeSpanMm: number;
}

// ============================================================================
// 1. GENERATIVE MULTI-TIER CORRIDOR PLANNING ENGINE
// ============================================================================

/**
 * Quy hoạch ma trận cao độ hành lang kỹ thuật theo quy chuẩn phân tầng Invariant:
 * - Tier 1 (Top, sát đáy dầm): Ống gió HVAC chữ nhật dẹt
 * - Tier 2 (Mid): Máng cáp điện & ELV (Cách nhiệt > 150mm so với ống nóng/chiller)
 * - Tier 3 (Bot): Ống Chiller, Cấp nước và Thoát nước dốc 1-2%
 * - Sprinkler: Cách trần 75 - 150mm
 */
export function planMultiTierCorridor(input: CorridorLayoutInput): CorridorLayoutResult {
  const width = input.corridorWidthMm || 2400;
  const slabBottom = input.slabBottomElevationMm || 3500;
  const beamBottom = input.beamBottomElevationMm || 3100;
  const ceiling = input.ceilingElevationMm || 2600;
  const clearReq = input.corridorClearHeightMm || 2600;

  const serviceDepth = beamBottom - ceiling; // Không gian khả dụng giữa đáy dầm và trần
  const isolationWarnings: string[] = [];

  // 1. Phân bổ cao độ từng tầng kỹ thuật
  // Tier 1: Ống gió HVAC
  const tier1Elev = beamBottom - 30;
  // Tier 2: Máng cáp điện & ELV
  const tier2Elev = beamBottom - 140;
  // Tier 3: Ống nước cấp/thoát/chiller
  const tier3Elev = beamBottom - 240;
  // Sprinkler: Sát trần
  const sprinklerElev = ceiling + 80;

  let isCompliant = true;
  if (serviceDepth < 300) {
    isCompliant = false;
    isolationWarnings.push(
      `Không gian kỹ thuật hẹp (${serviceDepth}mm < 300mm). Nguy cơ không đủ khoảng hở lắp đặt đa tầng.`,
    );
  }

  const assigned: CorridorSystemAssignment[] = [];
  let lateralOffsetTier1 = 100;
  let lateralOffsetTier2 = 100;
  let lateralOffsetTier3 = 100;

  for (const sys of input.systems) {
    let tier: MepfSystemTier = "tier_2_mid";
    let elev = tier2Elev;
    let lateral = 100;

    if (sys.discipline === "hvac") {
      tier = "tier_1_top";
      elev = tier1Elev - sys.heightOrDiaMm;
      lateral = lateralOffsetTier1;
      lateralOffsetTier1 += sys.widthMm + 100; // Khoảng hở 100mm
    } else if (sys.discipline === "electrical") {
      tier = "tier_2_mid";
      elev = tier2Elev - sys.heightOrDiaMm;
      lateral = lateralOffsetTier2;
      lateralOffsetTier2 += sys.widthMm + 150; // Cách ly 150mm
    } else if (sys.discipline === "plumbing") {
      tier = "tier_3_bot";
      elev = tier3Elev - sys.heightOrDiaMm;
      lateral = lateralOffsetTier3;
      lateralOffsetTier3 += sys.widthMm + 100;
    } else if (sys.discipline === "firefighting") {
      tier = "sprinkler_ceiling";
      elev = sprinklerElev;
      lateral = width / 2; // Giữa hành lang
    }

    // Kiểm tra thông thủy đáy thấp nhất với trần hoàn thiện
    if (elev < ceiling) {
      isCompliant = false;
      isolationWarnings.push(
        `Hệ thống ${sys.systemCode} vi phạm cao độ trần (BOP=${elev}mm < Trần=${ceiling}mm). Cần chuyển sang tiết diện dẹt hoặc chia nhánh.`,
      );
    }

    assigned.push({
      systemCode: sys.systemCode,
      discipline: sys.discipline,
      tier,
      widthMm: sys.widthMm,
      heightOrDiaMm: sys.heightOrDiaMm,
      weightKgPerM: sys.weightKgPerM,
      insulationThicknessMm: sys.insulationThicknessMm || 0,
      allocatedElevationMm: Math.round(elev),
      lateralPositionMm: Math.round(lateral),
    });
  }

  // Kiểm tra Invariant cách ly điện - nhiệt: Máng cáp và ống dẫn nhiệt/chiller
  const hasElec = assigned.some((a) => a.discipline === "electrical");
  const hasPlumbOrHvac = assigned.some(
    (a) => a.discipline === "plumbing" || a.discipline === "hvac",
  );
  if (hasElec && hasPlumbOrHvac) {
    // Đảm bảo không đặt máng cáp trực tiếp dưới đáy ống nước
    const lowestElec = Math.min(
      ...assigned.filter((a) => a.discipline === "electrical").map((a) => a.allocatedElevationMm),
    );
    const highestPlumb = Math.max(
      ...assigned.filter((a) => a.discipline === "plumbing").map((a) => a.allocatedElevationMm),
    );
    if (lowestElec < highestPlumb && lowestElec < ceiling + 200) {
      isolationWarnings.push(
        "CẢNH BÁO AN TOÀN ĐIỆN: Máng cáp nằm dưới cao độ ống nước. Yêu cầu lắp đặt tấm che rò rỉ (Drip Tray) hoặc đảo tầng máng cáp lên trên.",
      );
    }
  }

  return {
    corridorCode: input.corridorCode,
    corridorWidthMm: width,
    corridorClearHeightMm: clearReq,
    availableServiceDepthMm: serviceDepth,
    tierAllocations: {
      tier1TopDuctElevationMm: tier1Elev,
      tier2MidTrayElevationMm: tier2Elev,
      tier3BotPipesElevationMm: tier3Elev,
      sprinklerElevationMm: sprinklerElev,
    },
    assignedSystems: assigned,
    isCompliant,
    isolationWarnings,
    recommendedTrapezeSpanMm: Math.min(width - 200, 1500),
  };
}

// ============================================================================
// 2. TRAPEZE HANGER STRUCTURAL ENGINEERING ENGINE
// ============================================================================

export interface UnistrutSectionSpec {
  code: string;
  name: string;
  dimensionsMm: [number, number]; // [width, height] vd [41, 41]
  thicknessMm: number;
  weightKgPerM: number;
  momentOfInertiaIxCm4: number; // Ix (cm4)
  sectionModulusWxCm3: number; // Wx (cm3)
  allowableBendingStressMpa: number; // 160 MPa
  steelElasticModulusGpa: number; // 210 GPa
}

export const UNISTRUT_CATALOG: Record<string, UnistrutSectionSpec> = {
  P1000: {
    code: "P1000",
    name: "Unistrut P1000 Đơn 41x41x2.5mm",
    dimensionsMm: [41, 41],
    thicknessMm: 2.5,
    weightKgPerM: 2.7,
    momentOfInertiaIxCm4: 7.69,
    sectionModulusWxCm3: 3.32,
    allowableBendingStressMpa: 160.0,
    steelElasticModulusGpa: 210.0,
  },
  P1001: {
    code: "P1001",
    name: "Unistrut P1001 Đôi Lưng-Đối-Lưng 41x82x2.5mm",
    dimensionsMm: [41, 82],
    thicknessMm: 2.5,
    weightKgPerM: 5.4,
    momentOfInertiaIxCm4: 39.5,
    sectionModulusWxCm3: 9.63,
    allowableBendingStressMpa: 160.0,
    steelElasticModulusGpa: 210.0,
  },
  P3300: {
    code: "P3300",
    name: "Unistrut P3300 Nông 41x21x2.5mm",
    dimensionsMm: [41, 21],
    thicknessMm: 2.5,
    weightKgPerM: 1.8,
    momentOfInertiaIxCm4: 1.52,
    sectionModulusWxCm3: 1.25,
    allowableBendingStressMpa: 160.0,
    steelElasticModulusGpa: 210.0,
  },
};

export const THREADED_ROD_CAPACITY: Record<
  string,
  { diameterMm: number; rootAreaMm2: number; maxTensionLoadN: number }
> = {
  M8: { diameterMm: 8, rootAreaMm2: 36.6, maxTensionLoadN: 3660 },
  M10: { diameterMm: 10, rootAreaMm2: 58.0, maxTensionLoadN: 5800 },
  M12: { diameterMm: 12, rootAreaMm2: 84.3, maxTensionLoadN: 8430 },
  M16: { diameterMm: 16, rootAreaMm2: 157.0, maxTensionLoadN: 15700 },
};

export interface TrapezeHangerCalcResult {
  hangerCode: string;
  spanWidthMm: number;
  dropLengthMm: number;
  totalServiceLoadKg: number;
  factoredLoadN: number;
  selectedUnistrut: UnistrutSectionSpec;
  actualBendingStressMpa: number;
  allowableBendingStressMpa: number;
  maxDeflectionMm: number;
  allowableDeflectionMm: number;
  selectedRodDiameterMm: number;
  rodTensileLoadPerRodN: number;
  rodTensileStressMpa: number;
  safetyStatus: "pass" | "warning" | "fail_overstress" | "fail_deflection";
  autoLispScript: string;
}

/**
 * Tính toán kết cấu giá đỡ Trapeze chịu tải phân bố của nhiều hệ thống MEPF:
 * - Q_factored = (Sum(Kg/m) * Hanger_Spacing_m + G_strut) * 9.81 * 1.4
 * - M_max = Q * L / 8
 * - Stress sigma = M / W_x <= 160 MPa
 * - Deflection f_max = (5 * Q * L^3) / (384 * E * I_x) <= L / 360
 */
export function calculateTrapezeHangerStructure(input: {
  hangerCode: string;
  spanWidthMm: number;
  dropLengthMm: number;
  hangerSpacingM?: number;
  systemsOnHanger: Array<{ weightKgPerM: number; systemCode?: string }>;
  preferredUnistrutCode?: "P1000" | "P1001" | "P3300";
}): TrapezeHangerCalcResult {
  const spanMm = input.spanWidthMm;
  const spanM = spanMm / 1000;
  const spacingM = input.hangerSpacingM || 1.5;
  const dropMm = input.dropLengthMm;

  // 1. Tổng tải trọng phục vụ (Service Load) trên 1 giá đỡ
  const sumKgPerM = input.systemsOnHanger.reduce((sum, s) => sum + s.weightKgPerM, 0);
  let strutSpec =
    UNISTRUT_CATALOG[input.preferredUnistrutCode || "P1000"] || UNISTRUT_CATALOG.P1000;

  const totalServiceKg = sumKgPerM * spacingM + strutSpec.weightKgPerM * spanM;
  // Hệ số an toàn tải trọng gamma = 1.4 (TCVN 2737 / SMACNA)
  const factoredLoadN = totalServiceKg * 9.81 * 1.4;

  // 2. Tính mô-men uốn lớn nhất M_max (N.mm)
  const mMaxNmm = (factoredLoadN * spanMm) / 8;

  // 3. Tính ứng suất uốn sigma = M_max / W_x
  let wxMm3 = strutSpec.sectionModulusWxCm3 * 1000;
  let stressMpa = mMaxNmm / wxMm3;

  // 4. Tính độ võng lớn nhất f_max (mm)
  const serviceLoadN = totalServiceKg * 9.81;
  const eMpa = strutSpec.steelElasticModulusGpa * 1000; // 210000 MPa
  let ixMm4 = strutSpec.momentOfInertiaIxCm4 * 10000; // cm4 -> mm4

  let fMaxMm = (5 * serviceLoadN * Math.pow(spanMm, 3)) / (384 * eMpa * ixMm4);
  const allowDeflectMm = spanMm / 360;

  // Tự động nâng cấp lên Unistrut đôi P1001 nếu P1000 bị quá tải hoặc nhịp >= 2.0m tải nặng
  if (
    (stressMpa > strutSpec.allowableBendingStressMpa ||
      fMaxMm > allowDeflectMm ||
      (spanMm >= 2000 && totalServiceKg > 200)) &&
    strutSpec.code === "P1000"
  ) {
    strutSpec = UNISTRUT_CATALOG.P1001;
    wxMm3 = strutSpec.sectionModulusWxCm3 * 1000;
    stressMpa = mMaxNmm / wxMm3;
    ixMm4 = strutSpec.momentOfInertiaIxCm4 * 10000;
    fMaxMm = (5 * serviceLoadN * Math.pow(spanMm, 3)) / (384 * eMpa * ixMm4);
  }

  // 5. Chọn đường kính ty ren theo tiêu chuẩn SMACNA / MSS-SP-58:
  // - Tiêu chuẩn tối thiểu cho giá đỡ đa tầng MEPF là M10 (đảm bảo độ cứng vững chống rung lắc)
  // - Khi tổng tải trọng phục vụ > 250kg hoặc nhịp >= 2.0m: Tự động dùng M12
  // - Khi tổng tải trọng phục vụ > 600kg: Tự động dùng M16
  const loadPerRodN = factoredLoadN / 2;
  let selectedRod = THREADED_ROD_CAPACITY.M10;
  if (totalServiceKg > 600) {
    selectedRod = THREADED_ROD_CAPACITY.M16;
  } else if (totalServiceKg > 250 || spanMm >= 2000) {
    selectedRod = THREADED_ROD_CAPACITY.M12;
  } else {
    selectedRod = THREADED_ROD_CAPACITY.M10;
  }

  const rodStressMpa = loadPerRodN / selectedRod.rootAreaMm2;

  let status: TrapezeHangerCalcResult["safetyStatus"] = "pass";
  if (stressMpa > strutSpec.allowableBendingStressMpa) {
    status = "fail_overstress";
  } else if (fMaxMm > allowDeflectMm) {
    status = "fail_deflection";
  } else if (stressMpa > strutSpec.allowableBendingStressMpa * 0.85) {
    status = "warning";
  }

  // 6. Sinh mã AutoLISP chuẩn
  const autoLispScript = `;; =========================================================================
;; XBOSS AUTONOMOUS DRAFTING — TRAPEZE HANGER ${input.hangerCode}
;; Khẩu độ: ${spanMm}mm | Hạ trần: ${dropMm}mm | Unistrut: ${strutSpec.name} | Ty: M${selectedRod.diameterMm}
;; =========================================================================
(defun c:DRAW_${input.hangerCode.replace(/[^a-zA-Z0-9_]/g, "_")} ( / p1 p2 p3 p4 ptIns oldOsm oldLayer)
  (setq oldOsm (getvar "OSMODE"))
  (setq oldLayer (getvar "CLAYER"))
  (setvar "CMDECHO" 0) (setvar "OSMODE" 0)
  (if (not (tblsearch "LAYER" "M-HVAC-SUPP")) (command "-LAYER" "M" "M-HVAC-SUPP" "C" "4" "" ""))
  (setvar "CLAYER" "M-HVAC-SUPP")
  (setq ptIns (getpoint "\\nChon toa do tim tran treo: "))
  (if ptIns
    (progn
      (setq p1 (list (- (car ptIns) ${spanMm / 2.0}) (cadr ptIns) 0.0))
      (setq p2 (list (- (car ptIns) ${spanMm / 2.0}) (- (cadr ptIns) ${dropMm}) 0.0))
      (setq p3 (list (+ (car ptIns) ${spanMm / 2.0}) (- (cadr ptIns) ${dropMm}) 0.0))
      (setq p4 (list (+ (car ptIns) ${spanMm / 2.0}) (cadr ptIns) 0.0))
      (command "._LINE" p1 p2 "")
      (command "._LINE" p4 p3 "")
      (command "._RECTANG" (list (- (car p2) 30) (cadr p2) 0.0) (list (+ (car p3) 30) (- (cadr p3) ${strutSpec.dimensionsMm[1]}) 0.0))
      (command "._TEXT" "_J" "_MC" (list (car ptIns) (- (cadr ptIns) ${dropMm + 60}) 0.0) 35 0 "${input.hangerCode}: UNISTRUT ${strutSpec.dimensionsMm[0]}x${strutSpec.dimensionsMm[1]} - TY M${selectedRod.diameterMm}")
      (princ "\\n[XBoss CAD] Ve thanh cong gia do Trapeze.")
    )
  )
  (setvar "CLAYER" oldLayer) (setvar "OSMODE" oldOsm) (princ)
)`;

  return {
    hangerCode: input.hangerCode,
    spanWidthMm: spanMm,
    dropLengthMm: dropMm,
    totalServiceLoadKg: Math.round(totalServiceKg * 100) / 100,
    factoredLoadN: Math.round(factoredLoadN * 10) / 10,
    selectedUnistrut: strutSpec,
    actualBendingStressMpa: Math.round(stressMpa * 100) / 100,
    allowableBendingStressMpa: strutSpec.allowableBendingStressMpa,
    maxDeflectionMm: Math.round(fMaxMm * 100) / 100,
    allowableDeflectionMm: Math.round(allowDeflectMm * 100) / 100,
    selectedRodDiameterMm: selectedRod.diameterMm,
    rodTensileLoadPerRodN: Math.round(loadPerRodN * 10) / 10,
    rodTensileStressMpa: Math.round(rodStressMpa * 100) / 100,
    safetyStatus: status,
    autoLispScript,
  };
}

// ============================================================================
// 3. DATABASE CRUD & PERSISTENCE
// ============================================================================

export async function saveCorridorLayout(
  projectId: number,
  result: CorridorLayoutResult,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_corridor_layouts (
      project_id, corridor_code, title, corridor_width_mm,
      corridor_clear_height_mm, available_service_depth_mm,
      tier_allocation, assigned_systems, status, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?,
      ?::jsonb, ?::jsonb, ?, ?
    )
    ON CONFLICT (project_id, corridor_code) DO UPDATE SET
      corridor_width_mm = EXCLUDED.corridor_width_mm,
      available_service_depth_mm = EXCLUDED.available_service_depth_mm,
      tier_allocation = EXCLUDED.tier_allocation,
      assigned_systems = EXCLUDED.assigned_systems,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING id`,
    [
      projectId,
      result.corridorCode,
      `Quy hoạch hành lang ${result.corridorCode}`,
      result.corridorWidthMm,
      result.corridorClearHeightMm,
      result.availableServiceDepthMm,
      JSON.stringify(result.tierAllocations),
      JSON.stringify(result.assignedSystems),
      result.isCompliant ? "optimized" : "clashed",
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save corridor layout");
  return row;
}

export async function listCorridorLayouts(projectId: number) {
  return await query(
    `SELECT * FROM engineering_corridor_layouts WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}

export async function saveTrapezeHanger(
  projectId: number,
  calc: TrapezeHangerCalcResult,
  corridorLayoutId?: string | null,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_trapeze_hangers (
      project_id, hanger_code, corridor_layout_id, span_width_mm, drop_length_mm,
      total_load_kg, factored_load_n, selected_unistrut_spec,
      unistrut_bending_stress_mpa, allowable_bending_stress_mpa,
      max_deflection_mm, allowable_deflection_mm,
      selected_rod_diameter_mm, rod_tensile_stress_mpa,
      safety_check_status, lisp_script, created_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?
    )
    ON CONFLICT (project_id, hanger_code) DO UPDATE SET
      total_load_kg = EXCLUDED.total_load_kg,
      factored_load_n = EXCLUDED.factored_load_n,
      selected_unistrut_spec = EXCLUDED.selected_unistrut_spec,
      unistrut_bending_stress_mpa = EXCLUDED.unistrut_bending_stress_mpa,
      max_deflection_mm = EXCLUDED.max_deflection_mm,
      safety_check_status = EXCLUDED.safety_check_status,
      lisp_script = EXCLUDED.lisp_script,
      updated_at = NOW()
    RETURNING id`,
    [
      projectId,
      calc.hangerCode,
      corridorLayoutId ?? null,
      calc.spanWidthMm,
      calc.dropLengthMm,
      calc.totalServiceLoadKg,
      calc.factoredLoadN,
      calc.selectedUnistrut.name,
      calc.actualBendingStressMpa,
      calc.allowableBendingStressMpa,
      calc.maxDeflectionMm,
      calc.allowableDeflectionMm,
      calc.selectedRodDiameterMm,
      calc.rodTensileStressMpa,
      calc.safetyStatus,
      calc.autoLispScript,
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save trapeze hanger");
  return row;
}

export async function listTrapezeHangers(projectId: number) {
  return await query(
    `SELECT * FROM engineering_trapeze_hangers WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
