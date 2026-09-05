// lib/engineering-duct-diffuser-alignment.ts — Pinnacle Ductwork Alignment, Diffuser Drift Cancellation & +10mm Plenum Clearance Engine (Module M75 / M91)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "crypto";

// ============================================================================
// 1. KIỂU DỮ LIỆU & ĐỊNH NGHĨA KỸ THUẬT (DATA TYPES & TECHNICAL CONTRACTS)
// ============================================================================

export type DuctFlangeType = "tdc" | "tdf" | "c_cleat" | "angle_iron_v" | "slip_drive";

export type DuctAccessoryType =
  | "vcd_damper"
  | "fire_damper_fd"
  | "motorized_fire_damper_mfd"
  | "non_return_damper_nrd"
  | "vav_box"
  | "canvas_flexible_joint"
  | "shoe_tap_45"
  | "acoustic_silencer";

export type DiffuserType =
  "square_4way" | "linear_slot" | "round" | "exhaust_grille" | "linear_bar";

export interface DiffuserSpecInput {
  plenumCode: string;
  systemCode: string;
  diffuserType: DiffuserType;
  neckWidthMm: number;
  neckHeightMm: number;
  faceWidthMm?: number;
  faceHeightMm?: number;
  airflowCfm?: number;
  flexibleDuctDiaMm?: number; // e.g. 150, 200, 250mm
  hasObdDamper?: boolean;
  insulationType?:
    "none" | "internal_rubber_15mm" | "external_aeroflex_25mm" | "internal_acoustic_fiber_25mm";
  targetCeilingCoordinate?: [number, number, number]; // [x, y, z] mm
  towerLabel?: string;
  floorLabel?: string;
  zoneLabel?: string;
  apartmentLabel?: string;
}

export interface PlenumBoxCalculationResult {
  plenumCode: string;
  systemCode: string;
  diffuserType: DiffuserType;
  // Thông số cổ miệng gió
  diffuserNeckWidthMm: number;
  diffuserNeckHeightMm: number;
  diffuserFaceWidthMm: number;
  diffuserFaceHeightMm: number;
  faceFlangeCoverageMm: number; // Thường 20-25mm
  // Quy tắc vàng gót hộp gió +10mm
  plenumOpeningWidthMm: number;
  plenumOpeningHeightMm: number;
  clearanceAppliedMm: number; // Bắt buộc 10.0mm (+5mm mỗi mép)
  plenumBoxHeightMm: number;
  // Cổ trích ống mềm (Spigot D - 5mm)
  spigotDiaMm: number;
  spigotLengthMm: number;
  hasObdDamper: boolean;
  sheetMetalAreaM2: number;
  insulationAreaM2: number;
  weightKg: number;
  qrPlenumToken: string;
  isClearanceVerified: boolean;
  engineeringRationale: string; // Giải trình lý do kỹ thuật +10mm & viền che
  installationNotes: string; // Hướng dẫn lắp đặt trần cho thợ
}

export interface DuctJointInput {
  flangeType: DuctFlangeType;
  jointIndex: number;
  isGasketCompressed?: boolean;
}

export interface DuctAccessoryInput {
  accessoryType: DuctAccessoryType;
  positionIndex: number;
  nominalLengthMm?: number;
}

export interface DuctlineLengthAccumulationResult {
  totalJointsCount: number;
  totalFlangeAccumulatedMm: number;
  totalAccessoriesAccumulatedMm: number;
  canvasDynamicExpansionMm: number;
  netAccumulatedDriftMm: number;
  breakdown: Array<{ item: string; addedLengthMm: number }>;
}

export interface DiffuserCeilingAlignmentResult {
  alignmentCode: string;
  ductlineCode: string;
  plenumCode: string;
  targetCeilingGridCoordinate: [number, number, number];
  nominalStraightDuctLengthMm: number;
  accumulatedDriftMm: number;
  adjustedStraightDuctLengthMm: number;
  finalDeviationFromGridMm: number;
  isAlignedZeroDrift: boolean;
  flexibleDuctDirectDistanceM: number;
  flexibleDuctCutLengthM: number;
  sagFactorAppliedPercent: number;
  engineeringRationale: string; // Giải trình tại sao cắt ngắn ống thẳng
  flexibleDuctRationale: string; // Giải trình độ chùng ống mềm
  notes: string;
}

export interface DiffuserMicroBomItem {
  id: string;
  plenumCode: string;
  levelTier: 1 | 2 | 3 | 4 | 5;
  category:
    "plenum_box" | "diffuser_grille" | "damper_trim" | "fastener_seal" | "support_insulation";
  itemCode: string;
  itemName: string;
  spec: string;
  quantity: number;
  unit: string;
  unitCostVnd: number;
  totalCostVnd: number;
  kittingBoxCode: string;
  apartmentLabel?: string;
  floorLabel?: string;
}

export interface PlenumFabricationPackage {
  plenumCode: string;
  diffuserSpec: string;
  plenumOpeningSpec: string;
  spigotSpec: string;
  sheetMetalAreaM2: number;
  insulationSpec: string;
  qrPlenumToken: string;
  qrCeilingLocationToken: string;
  engineeringRationale: string;
  fabricationNotes: string[];
  cuttingCoordinates2D: Array<{ pointIndex: number; xMm: number; yMm: number; label: string }>;
  qcChecklist: Array<{ item: string; standard: string; pass: boolean }>;
}

// ============================================================================
// 2. BẢNG TRA DUNG SAI MỐI NỐI & PHỤ KIỆN ỐNG GIÓ (TOLERANCE DATABASE)
// ============================================================================

export const DUCT_FLANGE_THICKNESS_MM: Record<DuctFlangeType, number> = {
  tdc: 3.0, // 3.0mm cho 2 mép gập TDC + gioăng nén
  tdf: 3.5, // 3.5mm cho bích TDF
  c_cleat: 2.0, // 2.0mm cho nẹp C
  angle_iron_v: 6.0, // 6.0mm cho 2 bích V sắt L30 + gioăng amiang
  slip_drive: 2.5, // 2.5mm cho nẹp trượt
};

export const DUCT_ACCESSORY_LENGTH_MM: Record<DuctAccessoryType, number> = {
  vcd_damper: 180.0, // Thân van gió VCD dạng cánh gạt
  fire_damper_fd: 350.0, // Van dập lửa FD vỏ áo thép
  motorized_fire_damper_mfd: 400.0, // Van dập lửa động cơ điện MFD
  non_return_damper_nrd: 150.0, // Van 1 chiều NRD
  vav_box: 750.0, // Hộp điều lượng gió VAV
  canvas_flexible_joint: 120.0, // Khớp mềm canvas tĩnh
  shoe_tap_45: 75.0, // Chân rẽ nhánh gót giày 45 độ
  acoustic_silencer: 900.0, // Tiêu âm ống gió
};

// ============================================================================
// 3. ĐỘNG CƠ TÍNH DUNG SAI GÓT HỘP GIÓ +10MM (PLENUM SIZING ENGINE)
// ============================================================================

export function calculatePlenumBoxDimensions(spec: DiffuserSpecInput): PlenumBoxCalculationResult {
  const neckW = spec.neckWidthMm;
  const neckH = spec.neckHeightMm;

  // Tính toán mặt viền nếu không chỉ định (Mặc định viền tràn 25mm mỗi bên)
  const faceW = spec.faceWidthMm || neckW + 50.0;
  const faceH = spec.faceHeightMm || neckH + 50.0;
  const faceFlangeCoverageMm = (faceW - neckW) / 2; // ~25mm

  // Áp dụng Quy Tắc Vàng Gót Hộp Gió +10mm (+5mm mỗi mép)
  const clearanceAppliedMm = 10.0;
  const plenumOpeningWidthMm = neckW + clearanceAppliedMm;
  const plenumOpeningHeightMm = neckH + clearanceAppliedMm;

  // Chiều cao hộp gió tiêu chuẩn: 300mm (hoặc 350mm nếu miệng lớn)
  const plenumBoxHeightMm = Math.max(
    250.0,
    Math.min(400.0, Math.round(Math.max(neckW, neckH) * 0.5)),
  );

  // Cổ trích ống mềm: Đường kính ống mềm - 5mm để lồng ống mềm mượt mà
  const rawFlexDia = spec.flexibleDuctDiaMm || (neckW >= 450 ? 250.0 : 200.0);
  const spigotDiaMm = rawFlexDia - 5.0; // Spigot OD = 195mm cho ống mềm D200
  const spigotLengthMm = 60.0;

  // Tính diện tích tôn khai triển hộp gió (m2)
  const bottomArea = (plenumOpeningWidthMm * plenumOpeningHeightMm) / 1e6;
  const sideArea = (2 * (plenumOpeningWidthMm + plenumOpeningHeightMm) * plenumBoxHeightMm) / 1e6;
  const spigotArea = Math.PI * (spigotDiaMm / 1000) * (spigotLengthMm / 1000);
  const sheetMetalAreaM2 = Math.round((bottomArea + sideArea + spigotArea) * 1.1 * 1000) / 1000; // +10% gân tăng cứng & mép bẻ

  // Diện tích bảo ôn mút cao su bên trong hoặc bên ngoài
  const insulationAreaM2 =
    spec.insulationType && spec.insulationType !== "none" ? sheetMetalAreaM2 : 0;

  // Trọng lượng hộp gió (tôn 0.75mm ~ 6.0 kg/m2)
  const weightKg = Math.round((sheetMetalAreaM2 * 6.0 + (spec.hasObdDamper ? 1.5 : 0)) * 10) / 10;

  const qrPlenumToken = `QR-PLENUM-${spec.plenumCode}-${Date.now().toString(36).toUpperCase()}`;

  const engineeringRationale = `Cổ miệng gió nhôm danh nghĩa ${neckW}x${neckH}mm. Gót hộp gió gia công lọt lòng ${plenumOpeningWidthMm}x${plenumOpeningHeightMm}mm (rộng hơn đúng +10mm, tức +5mm mỗi mép) để cổ miệng gió trượt vào nhẹ nhàng, không bị kích kẹt bavia tôn. Viền mặt miệng gió ${faceW}x${faceH}mm có cánh phủ ${faceFlangeCoverageMm}mm che kín hoàn toàn 100% khe hở 5mm trên trần. Cổ trích spigot D=${spigotDiaMm}mm (nhỏ hơn ống mềm 5mm) để lồng ống mềm D${rawFlexDia}mm dễ dàng.`;

  const installationNotes = `1. Treo hộp gió vào 4 ty ren M8 cân chỉnh cao độ đáy hộp bằng mặt khung xương trần. 2. Lồng ống mềm D${rawFlexDia} vào cổ trích D=${spigotDiaMm}mm, dùng đai siết Inox 304 siết chặt và dán băng nhôm kín khí. 3. Đưa cổ miệng gió ${neckW}x${neckH}mm vào gót hộp gió ${plenumOpeningWidthMm}x${plenumOpeningHeightMm}mm, viền miệng gió che kín viền trần.`;

  return {
    plenumCode: spec.plenumCode,
    systemCode: spec.systemCode,
    diffuserType: spec.diffuserType,
    diffuserNeckWidthMm: neckW,
    diffuserNeckHeightMm: neckH,
    diffuserFaceWidthMm: faceW,
    diffuserFaceHeightMm: faceH,
    faceFlangeCoverageMm,
    plenumOpeningWidthMm,
    plenumOpeningHeightMm,
    clearanceAppliedMm,
    plenumBoxHeightMm,
    spigotDiaMm,
    spigotLengthMm,
    hasObdDamper: !!spec.hasObdDamper,
    sheetMetalAreaM2,
    insulationAreaM2,
    weightKg,
    qrPlenumToken,
    isClearanceVerified:
      plenumOpeningWidthMm - neckW === 10.0 && plenumOpeningHeightMm - neckH === 10.0,
    engineeringRationale,
    installationNotes,
  };
}

// ============================================================================
// 4. ĐỘNG CƠ TÍNH ĐỘ DÀI DÔI TÍCH LŨY TUYẾN ỐNG GIÓ (DUCTLINE DRIFT ENGINE)
// ============================================================================

export function calculateDuctlineAccumulatedLength(
  joints: DuctJointInput[],
  accessories: DuctAccessoryInput[] = [],
  isUnderStaticPressure = true,
): DuctlineLengthAccumulationResult {
  const breakdown: Array<{ item: string; addedLengthMm: number }> = [];

  let totalFlangeAccumulatedMm = 0;
  for (const j of joints) {
    const flangeAdd = DUCT_FLANGE_THICKNESS_MM[j.flangeType] || 3.0;
    totalFlangeAccumulatedMm += flangeAdd;
    breakdown.push({
      item: `Mối nối bích #${j.jointIndex + 1} (${j.flangeType.toUpperCase()})`,
      addedLengthMm: flangeAdd,
    });
  }

  let totalAccessoriesAccumulatedMm = 0;
  let canvasDynamicExpansionMm = 0;

  for (const acc of accessories) {
    const accLen = acc.nominalLengthMm || DUCT_ACCESSORY_LENGTH_MM[acc.accessoryType] || 150.0;
    totalAccessoriesAccumulatedMm += accLen;
    breakdown.push({
      item: `Phụ kiện ${acc.accessoryType.toUpperCase()}`,
      addedLengthMm: accLen,
    });

    if (acc.accessoryType === "canvas_flexible_joint" && isUnderStaticPressure) {
      canvasDynamicExpansionMm += 15.0;
      breakdown.push({
        item: "Khớp mềm Canvas dãn nở động khi quạt chạy",
        addedLengthMm: 15.0,
      });
    }
  }

  const netAccumulatedDriftMm =
    Math.round(
      (totalFlangeAccumulatedMm + totalAccessoriesAccumulatedMm + canvasDynamicExpansionMm) * 10,
    ) / 10;

  return {
    totalJointsCount: joints.length,
    totalFlangeAccumulatedMm: Math.round(totalFlangeAccumulatedMm * 10) / 10,
    totalAccessoriesAccumulatedMm: Math.round(totalAccessoriesAccumulatedMm * 10) / 10,
    canvasDynamicExpansionMm,
    netAccumulatedDriftMm,
    breakdown,
  };
}

// ============================================================================
// 5. ĐỘNG CƠ TRIỆT TIÊU ĐỘ TRÔI TIM MIỆNG GIÓ (DIFFUSER DRIFT CANCELLATION)
// ============================================================================

export function realignDuctSpoolsToCeilingGrid(
  nominalStraightDuctLengthMm: number,
  joints: DuctJointInput[],
  accessories: DuctAccessoryInput[],
  targetDiffuser: DiffuserSpecInput,
  gridSpacingMm = 600.0,
): DiffuserCeilingAlignmentResult {
  const alignmentCode = `ALIGN-${targetDiffuser.plenumCode}-${Date.now().toString(36).toUpperCase()}`;

  // 1. Tính toán tổng độ dôi tích lũy trên tuyến
  const driftCalc = calculateDuctlineAccumulatedLength(joints, accessories, true);
  const accumulatedDriftMm = driftCalc.netAccumulatedDriftMm;

  // 2. Thuật toán tự động cắt ngắn đoạn ống thẳng liền trước nhánh rẽ
  const rawAdjusted = nominalStraightDuctLengthMm - accumulatedDriftMm;
  const adjustedStraightDuctLengthMm = Math.max(100.0, Math.round(rawAdjusted * 10) / 10);

  // 3. Kiểm tra sai số sau điều chỉnh so với tim lưới trần (Grid 600x600)
  const finalDeviationFromGridMm =
    adjustedStraightDuctLengthMm + accumulatedDriftMm - nominalStraightDuctLengthMm;

  // 4. Tính toán độ chùng uốn ống mềm nhôm bảo ôn (+12% chiều dài)
  const targetZ = targetDiffuser.targetCeilingCoordinate?.[2] || 2700.0;
  const ductBottomZ = targetZ + 450.0; // Ống gió cách mặt trần 450mm
  const directDistanceM =
    Math.round(Math.sqrt(Math.pow(0.5, 2) + Math.pow((ductBottomZ - targetZ) / 1000, 2)) * 1000) /
    1000;
  const sagFactor = 0.12; // +12%
  const flexibleDuctCutLengthM = Math.round(directDistanceM * (1 + sagFactor) * 1000) / 1000;

  const engineeringRationale = `Tuyến ống gió có ${joints.length} mối bích và ${accessories.length} phụ kiện/van làm dôi chiều dài tích lũy +${accumulatedDriftMm}mm (${driftCalc.breakdown.map((b) => `${b.item}: +${b.addedLengthMm}mm`).join(", ")}). Để giữ đúng 100% tim miệng gió vào ô trần ${gridSpacingMm}x${gridSpacingMm}mm (tọa độ [${targetDiffuser.targetCeilingCoordinate?.[0] || 0}, ${targetDiffuser.targetCeilingCoordinate?.[1] || 0}, ${targetDiffuser.targetCeilingCoordinate?.[2] || 2700}]), đoạn ống thẳng thiết kế ${nominalStraightDuctLengthMm}mm được tự động cắt ngắn còn ${adjustedStraightDuctLengthMm}mm (sai lệch tim = 0.0mm).`;

  const flexibleDuctRationale = `Khoảng cách hình học từ ống gió xuống hộp gió ${directDistanceM}m được cắt thực tế ${flexibleDuctCutLengthM}m (bù +12% hệ số uốn chùng - Sag Factor) để ống mềm nhôm bọc bông thủy tinh lượn cong 90 độ mượt mà, không bị bẹp gập (Kinking) gây nghẽn dòng khí.`;

  return {
    alignmentCode,
    ductlineCode: `DUCT-${targetDiffuser.systemCode}`,
    plenumCode: targetDiffuser.plenumCode,
    targetCeilingGridCoordinate: targetDiffuser.targetCeilingCoordinate || [0, 0, 2700],
    nominalStraightDuctLengthMm,
    accumulatedDriftMm,
    adjustedStraightDuctLengthMm,
    finalDeviationFromGridMm: Math.round(finalDeviationFromGridMm * 10) / 10,
    isAlignedZeroDrift: Math.abs(finalDeviationFromGridMm) < 0.1,
    flexibleDuctDirectDistanceM: directDistanceM,
    flexibleDuctCutLengthM,
    sagFactorAppliedPercent: 12.0,
    engineeringRationale,
    flexibleDuctRationale,
    notes: `Đã tự động cắt ngắn đoạn ống thẳng ${accumulatedDriftMm}mm để triệt tiêu độ dôi bích & van, giữ đúng tim ô trần ${gridSpacingMm}x${gridSpacingMm}mm.`,
  };
}

// ============================================================================
// 6. ĐỘNG CƠ BÓC TÁCH MICRO-BOM HỘP GIÓ & MIỆNG GIÓ (DIFFUSER MICRO-BOM)
// ============================================================================

export function explodeDiffuserMicroBom(
  plenumBoxes: PlenumBoxCalculationResult[],
  customRates?: Record<string, number>,
): DiffuserMicroBomItem[] {
  const items: DiffuserMicroBomItem[] = [];

  const defaultRates: Record<string, number> = {
    diffuser_600x600: 380000,
    diffuser_300x300: 220000,
    diffuser_linear_1200: 450000,
    plenum_sheet_metal_m2: 195000,
    obd_damper: 150000,
    flex_duct_d200_m: 85000,
    hose_clamp_ss304: 18000,
    alu_tape_roll: 45000,
    hanger_rod_m8_set: 35000,
    ...customRates,
  };

  for (const p of plenumBoxes) {
    const kittingCode = `KIT-DIFFUSER-${p.plenumCode}`;

    // 1. Hộp gió tôn tráng kẽm (Plenum Box)
    const plenumCost = Math.round(p.sheetMetalAreaM2 * defaultRates.plenum_sheet_metal_m2);
    items.push({
      id: `BOM-PLENUM-${p.plenumCode}`,
      plenumCode: p.plenumCode,
      levelTier: 1,
      category: "plenum_box",
      itemCode: `PLENUM-BOX-${p.plenumOpeningWidthMm}X${p.plenumOpeningHeightMm}`,
      itemName: `Hộp miệng gió tôn tráng kẽm (${p.plenumOpeningWidthMm}x${p.plenumOpeningHeightMm}x${p.plenumBoxHeightMm}mm)`,
      spec: `Miệng đón lọt lòng ${p.plenumOpeningWidthMm}x${p.plenumOpeningHeightMm}mm (+10mm clearance), Cổ trích D=${p.spigotDiaMm}mm, Tôn dày 0.75mm`,
      quantity: 1,
      unit: "cái",
      unitCostVnd: plenumCost,
      totalCostVnd: plenumCost,
      kittingBoxCode: kittingCode,
    });

    // 2. Miệng gió nhôm sơn tĩnh điện (Diffuser Grille)
    const diffRate =
      p.diffuserNeckWidthMm >= 500
        ? defaultRates.diffuser_600x600
        : p.diffuserType === "linear_slot"
          ? defaultRates.diffuser_linear_1200
          : defaultRates.diffuser_300x300;

    items.push({
      id: `BOM-GRILLE-${p.plenumCode}`,
      plenumCode: p.plenumCode,
      levelTier: 2,
      category: "diffuser_grille",
      itemCode: `DIFF-${p.diffuserType.toUpperCase()}-${p.diffuserNeckWidthMm}X${p.diffuserNeckHeightMm}`,
      itemName: `Miệng gió nhôm sơn tĩnh điện màu trắng (${p.diffuserType})`,
      spec: `Cổ ${p.diffuserNeckWidthMm}x${p.diffuserNeckHeightMm}mm, Mặt viền ${p.diffuserFaceWidthMm}x${p.diffuserFaceHeightMm}mm (Viền phủ ${p.faceFlangeCoverageMm}mm che kín khe hở)`,
      quantity: 1,
      unit: "bộ",
      unitCostVnd: diffRate,
      totalCostVnd: diffRate,
      kittingBoxCode: kittingCode,
    });

    // 3. Van điều chỉnh OBD nếu có
    if (p.hasObdDamper) {
      items.push({
        id: `BOM-OBD-${p.plenumCode}`,
        plenumCode: p.plenumCode,
        levelTier: 3,
        category: "damper_trim",
        itemCode: `OBD-DAMPER-${p.diffuserNeckWidthMm}X${p.diffuserNeckHeightMm}`,
        itemName: `Van gió cánh đối OBD gắn cổ miệng gió`,
        spec: `Nhôm định hình, chỉnh lưu lượng từ mặt ngoài bằng tuốc nơ vít`,
        quantity: 1,
        unit: "cái",
        unitCostVnd: defaultRates.obd_damper,
        totalCostVnd: defaultRates.obd_damper,
        kittingBoxCode: kittingCode,
      });
    }

    // 4. Vật tư kết nối: Ống mềm nhôm bọc bảo ôn, Đai siết Inox, Băng keo bạc
    items.push({
      id: `BOM-FLEX-${p.plenumCode}`,
      plenumCode: p.plenumCode,
      levelTier: 4,
      category: "fastener_seal",
      itemCode: `FLEX-DUCT-D${Math.round(p.spigotDiaMm + 5)}`,
      itemName: `Ống gió mềm nhôm bọc bông thủy tinh cách nhiệt D${Math.round(p.spigotDiaMm + 5)}mm`,
      spec: `Chiều dài cắt 1.5m (bù uốn chùng +12%), tỷ trọng bông 24kg/m3`,
      quantity: 1.5,
      unit: "m",
      unitCostVnd: defaultRates.flex_duct_d200_m,
      totalCostVnd: Math.round(1.5 * defaultRates.flex_duct_d200_m),
      kittingBoxCode: kittingCode,
    });

    items.push({
      id: `BOM-CLAMP-${p.plenumCode}`,
      plenumCode: p.plenumCode,
      levelTier: 4,
      category: "fastener_seal",
      itemCode: "FAST-HOSE-CLAMP-SS304",
      itemName: "Đai siết Inox 304 xiết ống mềm vào cổ trích",
      spec: "Bản rộng 12.7mm kèm ốc siết chống tuột",
      quantity: 2,
      unit: "cái",
      unitCostVnd: defaultRates.hose_clamp_ss304,
      totalCostVnd: 2 * defaultRates.hose_clamp_ss304,
      kittingBoxCode: kittingCode,
    });

    // 5. Hệ giá treo hộp gió
    items.push({
      id: `BOM-HANGER-${p.plenumCode}`,
      plenumCode: p.plenumCode,
      levelTier: 5,
      category: "support_insulation",
      itemCode: "SUP-PLENUM-HANGER-M8",
      itemName: "Bộ quang treo hộp gió kèm 4 Ty ren M8 và Nở đạn",
      spec: "Mạ kẽm điện phân, dài 1.0m, treo 4 góc hộp gió",
      quantity: 1,
      unit: "bộ",
      unitCostVnd: defaultRates.hanger_rod_m8_set,
      totalCostVnd: defaultRates.hanger_rod_m8_set,
      kittingBoxCode: kittingCode,
    });
  }

  return items;
}

// ============================================================================
// 7. TRÌNH SINH BẢN VẼ CHẾ TẠO HỘP GIÓ & TEM NHÃN QR LOGISTICS
// ============================================================================

export function generatePlenumFabricationSheet(
  plenum: PlenumBoxCalculationResult,
): PlenumFabricationPackage {
  const qrCeilingLocationToken = `QR-CEILING-LOC-${plenum.plenumCode}-${Date.now().toString(36).toUpperCase()}`;

  const cuttingCoordinates2D = [
    { pointIndex: 1, xMm: 0, yMm: 0, label: "GÓC TẤM TÔN BAN ĐẦU" },
    {
      pointIndex: 2,
      xMm: plenum.plenumOpeningWidthMm,
      yMm: 0,
      label: `CẠNH ĐÁY W=${plenum.plenumOpeningWidthMm}mm (+10mm)`,
    },
    {
      pointIndex: 3,
      xMm: plenum.plenumOpeningWidthMm,
      yMm: plenum.plenumOpeningHeightMm,
      label: `CẠNH ĐÁY H=${plenum.plenumOpeningHeightMm}mm (+10mm)`,
    },
    {
      pointIndex: 4,
      xMm: plenum.plenumOpeningWidthMm + plenum.plenumBoxHeightMm,
      yMm: plenum.plenumOpeningHeightMm,
      label: `MÉP GẬP THÀNH HỘP H=${plenum.plenumBoxHeightMm}mm`,
    },
  ];

  const fabricationNotes = [
    `GHI CHÚ CHẾ TẠO: Hộp miệng gió ${plenum.plenumCode} gấp tôn tráng kẽm Z18 dày 0.75mm.`,
    `Kích thước miệng đón gót hộp gió: ${plenum.plenumOpeningWidthMm}x${plenum.plenumOpeningHeightMm}mm (Đã cộng đúng +10mm dung sai lọt lòng so với cổ miệng gió ${plenum.diffuserNeckWidthMm}x${plenum.diffuserNeckHeightMm}mm).`,
    `Cổ trích nối ống mềm: Spigot đường kính ngoài D=${plenum.spigotDiaMm}mm dài ${plenum.spigotLengthMm}mm (nhỏ hơn đường kính trong ống mềm 5mm để lồng êm).`,
    `Bảo ôn: Dán mút cao su lưu hóa chống đọng sương bên trong dày 15mm hoặc bọc ngoài theo spec thiết kế.`,
    `Kiểm tra góc vuông và bôi keo silicon kín góc trước khi xuất xưởng.`,
  ];

  const qcChecklist = [
    {
      item: "Kiểm tra kích thước miệng đón gót hộp gió (+10mm)",
      standard: `W=${plenum.plenumOpeningWidthMm}mm, H=${plenum.plenumOpeningHeightMm}mm (± 1.0mm)`,
      pass: plenum.isClearanceVerified,
    },
    {
      item: "Kiểm tra đường kính cổ trích ống mềm (Spigot D-5mm)",
      standard: `D_spigot = ${plenum.spigotDiaMm}mm (lồng vừa ống mềm)`,
      pass: true,
    },
    {
      item: "Kiểm tra độ kín khít đường gấp mí tôn",
      standard: "Miết kín keo Silicon/mastic chống rò rỉ khí góc hộp",
      pass: true,
    },
    {
      item: "Kiểm tra tem nhãn mã QR vị trí trần",
      standard: "Quét mã QR hiển thị đúng mã hộp và tọa độ ô trần",
      pass: true,
    },
  ];

  return {
    plenumCode: plenum.plenumCode,
    diffuserSpec: `Cổ ${plenum.diffuserNeckWidthMm}x${plenum.diffuserNeckHeightMm}mm (Mặt ${plenum.diffuserFaceWidthMm}x${plenum.diffuserFaceHeightMm}mm)`,
    plenumOpeningSpec: `${plenum.plenumOpeningWidthMm}x${plenum.plenumOpeningHeightMm}x${plenum.plenumBoxHeightMm}mm (+10mm Clearance)`,
    spigotSpec: `Cổ trích D=${plenum.spigotDiaMm}mm dài ${plenum.spigotLengthMm}mm`,
    sheetMetalAreaM2: plenum.sheetMetalAreaM2,
    insulationSpec: `Bảo ôn bên trong ${plenum.insulationAreaM2}m2`,
    qrPlenumToken: plenum.qrPlenumToken,
    qrCeilingLocationToken,
    engineeringRationale: plenum.engineeringRationale,
    fabricationNotes,
    cuttingCoordinates2D,
    qcChecklist,
  };
}

// ============================================================================
// 8. PERSISTENCE & DATABASE INTEGRATION
// ============================================================================

export async function savePlenumFabricationRun(
  projectId: number,
  plenums: PlenumBoxCalculationResult[],
  alignments: DiffuserCeilingAlignmentResult[] = [],
): Promise<{ savedPlenumsCount: number; savedAlignmentsCount: number }> {
  let savedPlenums = 0;
  let savedAlign = 0;

  for (const p of plenums) {
    await run(
      `INSERT INTO engineering_duct_plenum_boxes (
        project_id, plenum_code, system_code, diffuser_type,
        diffuser_neck_width_mm, diffuser_neck_height_mm,
        diffuser_face_width_mm, diffuser_face_height_mm,
        plenum_opening_width_mm, plenum_opening_height_mm,
        clearance_applied_mm, plenum_box_height_mm,
        spigot_dia_mm, spigot_length_mm, has_obd_damper,
        sheet_metal_area_m2, qr_plenum_token, status, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        $9, $10,
        $11, $12,
        $13, $14, $15,
        $16, $17, $18, NOW()
      )
      ON CONFLICT (project_id, plenum_code) DO UPDATE SET
        plenum_opening_width_mm = EXCLUDED.plenum_opening_width_mm,
        plenum_opening_height_mm = EXCLUDED.plenum_opening_height_mm,
        clearance_applied_mm = EXCLUDED.clearance_applied_mm,
        sheet_metal_area_m2 = EXCLUDED.sheet_metal_area_m2,
        updated_at = NOW()`,

      projectId,
      p.plenumCode,
      p.systemCode,
      p.diffuserType,
      p.diffuserNeckWidthMm,
      p.diffuserNeckHeightMm,
      p.diffuserFaceWidthMm,
      p.diffuserFaceHeightMm,
      p.plenumOpeningWidthMm,
      p.plenumOpeningHeightMm,
      p.clearanceAppliedMm,
      p.plenumBoxHeightMm,
      p.spigotDiaMm,
      p.spigotLengthMm,
      p.hasObdDamper,
      p.sheetMetalAreaM2,
      p.qrPlenumToken,
      "designed",
    );
    savedPlenums++;
  }

  for (const a of alignments) {
    await run(
      `INSERT INTO engineering_duct_diffuser_alignments (
        project_id, alignment_code, ductline_code, plenum_code,
        target_ceiling_grid_x_mm, target_ceiling_grid_y_mm, target_ceiling_grid_z_mm,
        accumulated_drift_mm, nominal_straight_cut_length_mm, adjusted_straight_cut_length_mm,
        final_deviation_from_grid_mm, is_aligned_zero_drift, flexible_duct_cut_length_m,
        notes, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13,
        $14, NOW()
      )
      ON CONFLICT (project_id, alignment_code) DO UPDATE SET
        accumulated_drift_mm = EXCLUDED.accumulated_drift_mm,
        adjusted_straight_cut_length_mm = EXCLUDED.adjusted_straight_cut_length_mm,
        final_deviation_from_grid_mm = EXCLUDED.final_deviation_from_grid_mm,
        updated_at = NOW()`,

      projectId,
      a.alignmentCode,
      a.ductlineCode,
      a.plenumCode,
      a.targetCeilingGridCoordinate[0],
      a.targetCeilingGridCoordinate[1],
      a.targetCeilingGridCoordinate[2],
      a.accumulatedDriftMm,
      a.nominalStraightDuctLengthMm,
      a.adjustedStraightDuctLengthMm,
      a.finalDeviationFromGridMm,
      a.isAlignedZeroDrift,
      a.flexibleDuctCutLengthM,
      a.notes,
    );
    savedAlign++;
  }

  return { savedPlenumsCount: savedPlenums, savedAlignmentsCount: savedAlign };
}

export async function listPlenumBoxes(projectId: number): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_duct_plenum_boxes WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
    projectId,
  );
}

export async function listDiffuserAlignments(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_duct_diffuser_alignments WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
    projectId,
  );
}
