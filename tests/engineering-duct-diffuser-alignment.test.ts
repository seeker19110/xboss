// tests/engineering-duct-diffuser-alignment.test.ts — Test Suite cho Căn Chỉnh Ống Gió, Bù Trừ Tim Miệng Gió & Dung Sai Gót Hộp Gió +10mm (M75/M91)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlenumBoxDimensions,
  calculateDuctlineAccumulatedLength,
  realignDuctSpoolsToCeilingGrid,
  explodeDiffuserMicroBom,
  generatePlenumFabricationSheet,
  DiffuserSpecInput,
  DuctJointInput,
  DuctAccessoryInput,
} from "@/lib/ky-thuat/engineering-duct-diffuser-alignment";

describe("M75 / M91: Căn Chỉnh Độ Dài Ống Gió, Bù Trừ Tim Miệng Gió & Dung Sai Gót Hộp Gió +10mm", () => {
  // ==========================================================================
  // 1. KIỂM THỬ QUY TẮC VÀNG GÓT HỘP GIÓ +10MM (PLENUM CLEARANCE ENGINE)
  // ==========================================================================
  it("M91-PLENUM: Gót hộp gió rộng hơn cổ miệng gió đúng +10mm mỗi chiều và viền phủ kín 100%", () => {
    const spec: DiffuserSpecInput = {
      plenumCode: "PLENUM-FL10-01",
      systemCode: "ACMV_SUPPLY",
      diffuserType: "square_4way",
      neckWidthMm: 450,
      neckHeightMm: 450,
      faceWidthMm: 600,
      faceHeightMm: 600,
      flexibleDuctDiaMm: 200,
      hasObdDamper: true,
      insulationType: "internal_rubber_15mm",
    };

    const res = calculatePlenumBoxDimensions(spec);

    // Kiểm tra quy tắc +10mm
    assert.equal(res.diffuserNeckWidthMm, 450);
    assert.equal(res.plenumOpeningWidthMm, 460, "Miệng đón gót hộp gió = 450 + 10 = 460mm");
    assert.equal(res.plenumOpeningHeightMm, 460, "Miệng đón gót hộp gió = 450 + 10 = 460mm");
    assert.equal(res.clearanceAppliedMm, 10.0);
    assert.equal(res.isClearanceVerified, true);

    // Kiểm tra viền che phủ 75mm đè lên trần che kín hoàn toàn khe hở 5mm mỗi bên
    assert.equal(res.faceFlangeCoverageMm, 75.0);
    assert.ok(res.faceFlangeCoverageMm > 5.0, "Viền miệng gió che kín hoàn toàn khe hở 5mm");

    // Kiểm tra cổ trích spigot D - 5mm
    assert.equal(res.spigotDiaMm, 195.0, "Spigot OD = 200 - 5 = 195mm để lồng ống mềm mượt mà");
    assert.ok(res.sheetMetalAreaM2 > 0, "Tính đúng diện tích tôn");
    assert.ok(res.qrPlenumToken.includes("QR-PLENUM"));

    // Kiểm tra giải trình kỹ thuật và hướng dẫn lắp đặt
    assert.ok(res.engineeringRationale.includes("+10mm"), "Có giải trình lý do +10mm");
    assert.ok(res.installationNotes.includes("ty ren M8"), "Có hướng dẫn lắp đặt trần");
  });

  it("M91-PLENUM: Tính toán hộp miệng gió khe dài Linear Slot Diffuser", () => {
    const spec: DiffuserSpecInput = {
      plenumCode: "PLENUM-SLOT-01",
      systemCode: "ACMV_SUPPLY",
      diffuserType: "linear_slot",
      neckWidthMm: 1200,
      neckHeightMm: 150,
      faceWidthMm: 1250,
      faceHeightMm: 200,
      flexibleDuctDiaMm: 200,
    };

    const res = calculatePlenumBoxDimensions(spec);
    assert.equal(res.plenumOpeningWidthMm, 1210.0, "1200 + 10 = 1210mm");
    assert.equal(res.plenumOpeningHeightMm, 160.0, "150 + 10 = 160mm");
    assert.ok(res.engineeringRationale.length > 50, "Có giải trình kỹ thuật rõ ràng");
  });

  // ==========================================================================
  // 2. KIỂM THỬ TÍNH TOÁN ĐỘ DÀI DÔI TÍCH LŨY TUYẾN ỐNG GIÓ (DUCTLINE DRIFT)
  // ==========================================================================
  it("M91-DRIFT: Tính tổng độ dài dôi từ bích TDC, bích V, van VCD và khớp mềm Canvas", () => {
    const joints: DuctJointInput[] = [
      { flangeType: "tdc", jointIndex: 0 },
      { flangeType: "tdc", jointIndex: 1 },
      { flangeType: "tdc", jointIndex: 2 },
      { flangeType: "angle_iron_v", jointIndex: 3 },
    ];

    const accessories: DuctAccessoryInput[] = [
      { accessoryType: "vcd_damper", positionIndex: 0 },
      { accessoryType: "canvas_flexible_joint", positionIndex: 1 },
    ];

    const res = calculateDuctlineAccumulatedLength(joints, accessories, true);

    // 3 x TDC (3x3 = 9mm) + 1 x Bích V (6mm) = 15mm
    assert.equal(res.totalFlangeAccumulatedMm, 15.0);
    // VCD (180mm) + Canvas (120mm) = 300mm
    assert.equal(res.totalAccessoriesAccumulatedMm, 300.0);
    // Canvas dynamic stretch khi có áp lực = 15mm
    assert.equal(res.canvasDynamicExpansionMm, 15.0);
    // Tổng độ dài dôi = 15 + 300 + 15 = 330mm
    assert.equal(res.netAccumulatedDriftMm, 330.0);
    assert.equal(res.breakdown.length, 7);
  });

  // ==========================================================================
  // 3. KIỂM THỬ TRIỆT TIÊU ĐỘ TRÔI TIM MIỆNG GIÓ & CĂN CHUẨN TIM TRẦN 600X600
  // ==========================================================================
  it("M91-ALIGN: Tự động cắt ngắn đoạn ống thẳng để căn chuẩn 100% tim ô trần kiến trúc", () => {
    const nominalStraightDuctLengthMm = 3000.0;

    const joints: DuctJointInput[] = [
      { flangeType: "tdc", jointIndex: 0 },
      { flangeType: "tdc", jointIndex: 1 },
    ]; // +6mm

    const accessories: DuctAccessoryInput[] = [
      { accessoryType: "vcd_damper", positionIndex: 0 }, // +180mm
    ];

    const targetDiffuser: DiffuserSpecInput = {
      plenumCode: "PL-A1001-01",
      systemCode: "ACMV_SUPPLY",
      diffuserType: "square_4way",
      neckWidthMm: 450,
      neckHeightMm: 450,
      targetCeilingCoordinate: [4200, 3600, 2700],
    };

    const alignRes = realignDuctSpoolsToCeilingGrid(
      nominalStraightDuctLengthMm,
      joints,
      accessories,
      targetDiffuser,
      600.0,
    );

    // Độ dài dôi = 6 + 180 = 186mm
    assert.equal(alignRes.accumulatedDriftMm, 186.0);
    // Chiều dài ống thẳng sau điều chỉnh = 3000 - 186 = 2814.0mm
    assert.equal(alignRes.adjustedStraightDuctLengthMm, 2814.0);
    assert.equal(alignRes.finalDeviationFromGridMm, 0.0);
    assert.equal(alignRes.isAlignedZeroDrift, true);

    // Kiểm tra giải trình kỹ thuật và độ chùng ống mềm
    assert.ok(alignRes.engineeringRationale.includes("2814"), "Có giải trình cắt ngắn ống thẳng");
    assert.ok(
      alignRes.flexibleDuctRationale.includes("Sag Factor"),
      "Có giải trình độ chùng ống mềm",
    );
    assert.equal(alignRes.sagFactorAppliedPercent, 12.0);
  });

  // ==========================================================================
  // 4. KIỂM THỬ BÓC TÁCH MICRO-BOM HỘP GIÓ & MIỆNG GIÓ
  // ==========================================================================
  it("M91-BOM: Bung chi tiết 5 cấp độ gồm hộp tôn +10mm, miệng gió nhôm, van OBD, đai siết và ty treo M8", () => {
    const spec: DiffuserSpecInput = {
      plenumCode: "PLENUM-LIVING-01",
      systemCode: "ACMV_SUPPLY",
      diffuserType: "square_4way",
      neckWidthMm: 450,
      neckHeightMm: 450,
      hasObdDamper: true,
    };

    const plenum = calculatePlenumBoxDimensions(spec);
    const bom = explodeDiffuserMicroBom([plenum]);

    assert.ok(bom.length >= 5, "Có đủ 5 nhóm vật tư");

    const level1 = bom.filter((b) => b.levelTier === 1);
    const level2 = bom.filter((b) => b.levelTier === 2);
    const level3 = bom.filter((b) => b.levelTier === 3);
    const level4 = bom.filter((b) => b.levelTier === 4);
    const level5 = bom.filter((b) => b.levelTier === 5);

    assert.ok(
      level1.some((b) => b.itemName.includes("Hộp miệng gió")),
      "Có hộp gió tôn",
    );
    assert.ok(
      level2.some((b) => b.itemName.includes("Miệng gió nhôm")),
      "Có miệng gió nhôm",
    );
    assert.ok(
      level3.some((b) => b.itemName.includes("Van gió cánh đối OBD")),
      "Có van OBD",
    );
    assert.ok(
      level4.some((b) => b.itemCode.includes("FLEX")),
      "Có ống mềm nhôm bọc bông thủy tinh",
    );
    assert.ok(
      level4.some((b) => b.itemCode.includes("CLAMP")),
      "Có đai siết SS304",
    );
    assert.ok(
      level5.some((b) => b.itemCode.includes("HANGER")),
      "Có quang treo hộp gió ty M8",
    );
  });

  // ==========================================================================
  // 5. KIỂM THỬ XUẤT BẢN VẼ KHAI TRIỂN TÔN & TEM NHÃN QR LOGISTICS
  // ==========================================================================
  it("M91-FAB: Sinh bản vẽ khai triển 2D, checklist QC và QR Token định vị trần", () => {
    const spec: DiffuserSpecInput = {
      plenumCode: "PLENUM-BEDROOM-01",
      systemCode: "ACMV_SUPPLY",
      diffuserType: "square_4way",
      neckWidthMm: 300,
      neckHeightMm: 300,
      flexibleDuctDiaMm: 150,
    };

    const plenum = calculatePlenumBoxDimensions(spec);
    const fabPkg = generatePlenumFabricationSheet(plenum);

    assert.equal(fabPkg.plenumCode, "PLENUM-BEDROOM-01");
    assert.ok(fabPkg.plenumOpeningSpec.includes("310x310"));
    assert.equal(fabPkg.cuttingCoordinates2D.length, 4);
    assert.ok(fabPkg.qrPlenumToken.includes("QR-PLENUM"));
    assert.ok(fabPkg.qrCeilingLocationToken.includes("QR-CEILING"));
    assert.ok(fabPkg.fabricationNotes.length >= 4, "Có đầy đủ ghi chú chế tạo xưởng");
    assert.equal(fabPkg.qcChecklist.length, 4);
    assert.ok(fabPkg.qcChecklist.every((q) => q.pass));
  });
});
