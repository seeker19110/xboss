// tests/engineering-pipe-spooling-qto.test.ts — Test Suite cho Siêu Động Cơ Bóc Tách Khối Lượng Lắp Đặt, Chia Đốt Spool & Phân Rã Không Gian Đa Chiều (M74/M90)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getFittingDimension,
  getPipeOuterDiameterMm,
  calculatePipeCutLength,
  segmentPipelineIntoSpools,
  explode5TierMicroBom,
  optimizePipeNestingWithRemnants,
  generateSpoolFabricationPackage,
  aggregateQtoBySpatialHierarchy,
  generateApartmentKittingManifest,
  PipeSegmentInput,
} from "@/lib/engineering-pipe-spooling-qto";

describe("M74 / M90: Siêu Động Cơ Bóc Tách Khối Lượng Lắp Đặt & Chia Đốt Spool", () => {
  // ==========================================================================
  // 1. KIỂM THỬ BÙ TRỪ DUNG SAI MỐI NỐI & FITTING DEDUCTION ENGINE
  // ==========================================================================
  it("M90-FITTING: Tính toán chính xác độ ngập âm socket và lượng trừ cút 90° uPVC DN114", () => {
    const dim = getFittingDimension("upvc", "elbow_90", 114);
    assert.equal(dim.nominalDiaMm, 114);
    assert.equal(dim.centerToFaceMm, 122);
    assert.equal(dim.socketDepthMm, 64);
    assert.equal(dim.netTakeOffMm, 58); // 122 - 64 = 58mm
    assert.ok(dim.consumables.adhesiveGram! > 0, "Có định mức keo dán PVC");
  });

  it("M90-COUPLING: Đặc trị bẫy măng xông nối ống — Chỉ trừ gờ chặn t_stop, không cắt hụt ống", () => {
    const dim = getFittingDimension("upvc", "coupling_socket", 114);
    assert.equal(dim.socketDepthMm, 64);
    assert.equal(dim.stopRidgeMm, 4.0);
    // Lượng trừ cho mỗi đầu ống nối vào măng xông chỉ bằng stopRidge / 2 = 2.0mm
    assert.equal(dim.netTakeOffMm, 2.0);
  });

  it("M90-PPR: Tính toán chính xác độ sâu gia nhiệt hàn nung PPR DN25 & DN50", () => {
    const dim25 = getFittingDimension("ppr", "elbow_90", 25);
    assert.equal(dim25.centerToFaceMm, 32.0);
    assert.equal(dim25.socketDepthMm, 15.0);
    assert.equal(dim25.netTakeOffMm, 17.0);

    const dim50 = getFittingDimension("ppr", "elbow_90", 50);
    assert.equal(dim50.centerToFaceMm, 54.0);
    assert.equal(dim50.socketDepthMm, 20.0);
    assert.equal(dim50.netTakeOffMm, 34.0);
  });

  it("M90-STEEL-THREADED: Tra cứu chiều dài ren ăn khớp ASME B1.20.1 NPT", () => {
    const dim50 = getFittingDimension("steel_threaded", "elbow_90", 50);
    assert.equal(dim50.centerToFaceMm, 58.0);
    assert.equal(dim50.threadEngagementMm, 19.5);
    assert.equal(dim50.netTakeOffMm, 38.5); // 58.0 - 19.5 = 38.5mm
    assert.equal(dim50.consumables.teflonTurns, 12);
  });

  it("M90-GROOVED: Tính toán cút 90° rãnh Victaulic DN100 kèm khe hở cùm cứng", () => {
    const dim100 = getFittingDimension("steel_grooved", "elbow_90", 100);
    assert.equal(dim100.centerToFaceMm, 127.0);
    assert.equal(dim100.grooveGapMm, 1.0);
    assert.equal(dim100.netTakeOffMm, 126.5); // 127 - 0.5 = 126.5mm
  });

  // ==========================================================================
  // 2. KIỂM THỬ TÍNH TOÁN CHIỀU DÀI CẮT THỰC TẾ (CUT-LENGTH ENGINE)
  // ==========================================================================
  it("M90-CUT: Tính chiều dài cắt L_cut ống uPVC DN114 nối 2 cút 90° với L_c-to-c = 3000mm", () => {
    const seg: PipeSegmentInput = {
      id: "SEG-001",
      systemCode: "DRAIN_SEWER",
      discipline: "drainage",
      material: "upvc",
      nominalDiaMm: 114,
      startPoint: [0, 0, 3000],
      endPoint: [3000, 0, 3000],
      startConnection: { fittingType: "elbow_90", connectionType: "solvent_cement" },
      endConnection: { fittingType: "elbow_90", connectionType: "solvent_cement" },
    };

    const res = calculatePipeCutLength(seg);
    assert.equal(res.cToCLengthMm, 3000.0);
    assert.equal(res.startTakeOffMm, 58.0);
    assert.equal(res.endTakeOffMm, 58.0);
    // L_cut = 3000 - 58 - 58 = 2884.0mm
    assert.equal(res.cutLengthMm, 2884.0);
    assert.equal(res.warnings.length, 0);
  });

  it("M90-CUT: Đốt đóng tuyến (Closing Spool) tự động cộng Field Fit Allowance +50mm", () => {
    const seg: PipeSegmentInput = {
      id: "SEG-CLOSE-01",
      systemCode: "WATER_SUPPLY",
      material: "ppr",
      nominalDiaMm: 50,
      startPoint: [0, 0, 2500],
      endPoint: [2000, 0, 2500],
      startConnection: { fittingType: "elbow_90", connectionType: "heat_fusion" },
      endConnection: { fittingType: "flange_slip_on", connectionType: "flanged" },
      isClosingSpool: true,
      fieldFitAllowanceMm: 50.0,
    };

    const res = calculatePipeCutLength(seg);
    assert.equal(res.cToCLengthMm, 2000.0);
    assert.equal(res.startTakeOffMm, 34.0);
    assert.equal(res.fieldFitAllowanceMm, 50.0);
    assert.ok(res.cutLengthMm > 2000 - 34 - 50, "Được bù thêm 50mm dung sai hiện trường");
  });

  // ==========================================================================
  // 3. KIỂM THỬ CHIA ĐỐT SPOOL TIỀN CHẾ DfMA LOD 400
  // ==========================================================================
  it("M90-SPOOLING: Tuyến ống dài 14.5m tự động bẻ thành các Spool <= 5.8m kèm độ dốc 2%", () => {
    const seg: PipeSegmentInput = {
      id: "MAIN-RUN-01",
      systemCode: "DRAIN_STORM",
      discipline: "drainage",
      material: "upvc",
      nominalDiaMm: 114,
      startPoint: [0, 0, 3500],
      endPoint: [14500, 0, 3500],
      startConnection: { fittingType: "elbow_90", connectionType: "solvent_cement" },
      endConnection: { fittingType: "elbow_90", connectionType: "solvent_cement" },
    };

    const spools = segmentPipelineIntoSpools([seg], {
      maxSpoolLengthMm: 5800,
      gravitySlopePercent: 2.0,
    });

    assert.equal(spools.length, 3, "Tuyến 14.5m chia làm 3 Spool");
    for (const sp of spools) {
      assert.ok(sp.cutLengthMm <= 5800, `Spool ${sp.spoolCode} dài ${sp.cutLengthMm}mm <= 5800mm`);
      assert.equal(sp.slopePercent, 2.0);
      assert.ok(sp.weightKg < 50.0, "Cân nặng phù hợp bê tay");
    }

    assert.ok(
      spools[0].startElevationMm > spools[2].endElevationMm,
      "Cao độ cuối dốc thấp hơn đầu dốc",
    );
    assert.equal(spools[2].isClosingSpool, true);
    assert.equal(spools[2].fieldFitAllowanceMm, 50.0);
  });

  // ==========================================================================
  // 4. KIỂM THỬ BÓC TÁCH MICRO-BOM 5 CẤP ĐỘ
  // ==========================================================================
  it("M90-BOM: Bung chi tiết 5 cấp độ gồm bu lông, gioăng, keo dán, ty ren và tem mã QR", () => {
    const seg: PipeSegmentInput = {
      id: "SEG-CHILLER-01",
      systemCode: "CHILLED_WATER",
      discipline: "hvac",
      material: "steel_grooved",
      nominalDiaMm: 100,
      startPoint: [0, 0, 3000],
      endPoint: [4000, 0, 3000],
      startConnection: { fittingType: "elbow_90", connectionType: "grooved" },
      endConnection: { fittingType: "flange_slip_on", connectionType: "flanged" },
    };

    const spools = segmentPipelineIntoSpools([seg]);
    const bom = explode5TierMicroBom(spools);

    assert.ok(bom.length >= 5, "BOM có đầy đủ các cấp độ");

    const level1 = bom.filter((b) => b.levelTier === 1);
    const level2 = bom.filter((b) => b.levelTier === 2);
    const level4 = bom.filter((b) => b.levelTier === 4);
    const level5 = bom.filter((b) => b.levelTier === 5);

    assert.ok(level1.length > 0, "Có Level 1 thân ống cắt mét");
    assert.ok(level2.length > 0, "Có Level 2 phụ kiện cút/bích");
    assert.ok(
      level4.some((b) => b.itemCode.includes("BOLT")),
      "Có Level 4 bu lông M16",
    );
    assert.ok(
      level4.some((b) => b.itemCode.includes("GASKET")),
      "Có Level 4 gioăng EPDM",
    );
    assert.ok(
      level5.some((b) => b.itemCode.includes("CLEVIS")),
      "Có Level 5 cùm Clevis & ty ren",
    );
    assert.ok(
      level5.some((b) => b.itemCode.includes("TAG-QR")),
      "Có Level 5 tem nhôm khắc Laser QR",
    );

    const totalCost = bom.reduce((sum, b) => sum + b.totalCostVnd, 0);
    assert.ok(totalCost > 0, "Tổng giá trị bóc tách hợp lệ");
  });

  // ==========================================================================
  // 5. KIỂM THỬ BÓC TÁCH KHỐI LƯỢNG KHÔNG GIAN ĐA CHIỀU (SPATIAL HIERARCHY QTO)
  // ==========================================================================
  it("M90-SPATIAL: Phân rã khối lượng chính xác theo từng Căn hộ (Apartment A10.01 vs A10.02)", () => {
    const segs: PipeSegmentInput[] = [
      {
        id: "SEG-APT-1001-01",
        systemCode: "PLUMBING_WATER",
        material: "ppr",
        nominalDiaMm: 25,
        startPoint: [0, 0, 3000],
        endPoint: [2500, 0, 3000],
        startConnection: { fittingType: "elbow_90", connectionType: "heat_fusion" },
        endConnection: { fittingType: "coupling_socket", connectionType: "heat_fusion" },
        towerLabel: "Tower-A",
        floorLabel: "FL-10",
        zoneLabel: "Zone-East",
        apartmentLabel: "A10.01",
        pipelineCode: "RUN-W-A1001",
      },
      {
        id: "SEG-APT-1001-02",
        systemCode: "DRAIN_SEWER",
        material: "upvc",
        nominalDiaMm: 114,
        startPoint: [0, 0, 3000],
        endPoint: [3500, 0, 3000],
        startConnection: { fittingType: "elbow_90", connectionType: "solvent_cement" },
        endConnection: { fittingType: "elbow_45", connectionType: "solvent_cement" },
        towerLabel: "Tower-A",
        floorLabel: "FL-10",
        zoneLabel: "Zone-East",
        apartmentLabel: "A10.01",
        pipelineCode: "RUN-D-A1001",
      },
      {
        id: "SEG-APT-1002-01",
        systemCode: "PLUMBING_WATER",
        material: "ppr",
        nominalDiaMm: 32,
        startPoint: [0, 0, 3000],
        endPoint: [4000, 0, 3000],
        startConnection: { fittingType: "elbow_90", connectionType: "heat_fusion" },
        endConnection: { fittingType: "elbow_90", connectionType: "heat_fusion" },
        towerLabel: "Tower-A",
        floorLabel: "FL-10",
        zoneLabel: "Zone-West",
        apartmentLabel: "A10.02",
        pipelineCode: "RUN-W-A1002",
      },
    ];

    const spools = segmentPipelineIntoSpools(segs);
    const bom = explode5TierMicroBom(spools);

    const summariesByApt = aggregateQtoBySpatialHierarchy(spools, bom, "apartment");

    assert.equal(summariesByApt.length, 2, "Tách thành 2 căn hộ riêng biệt");
    const apt1001 = summariesByApt.find((s) => s.dimensionKey === "A10.01");
    const apt1002 = summariesByApt.find((s) => s.dimensionKey === "A10.02");

    assert.ok(apt1001, "Tìm thấy Căn A10.01");
    assert.ok(apt1002, "Tìm thấy Căn A10.02");

    assert.equal(apt1001.totalSpoolsCount, 2, "A10.01 có 2 spools (1 cấp, 1 thoát)");
    assert.equal(apt1002.totalSpoolsCount, 1, "A10.02 có 1 spool cấp");

    assert.ok(apt1001.pipeSummaryBySpec["PPR_DN25"], "A10.01 có PPR DN25");
    assert.ok(apt1001.pipeSummaryBySpec["UPVC_DN114"], "A10.01 có uPVC DN114");
    assert.ok(apt1002.pipeSummaryBySpec["PPR_DN32"], "A10.02 có PPR DN32");

    assert.ok(apt1001.kittingBoxCode.includes("A10.01"), "Mã thùng kitting gán cho A10.01");
  });

  it("M90-SPATIAL: Phân rã khối lượng theo Trục kỹ thuật (Shaft PL-01 vs Shaft FP-01)", () => {
    const segs: PipeSegmentInput[] = [
      {
        id: "SEG-SHAFT-PL01",
        systemCode: "PLUMBING_WATER",
        material: "steel_threaded",
        nominalDiaMm: 65,
        startPoint: [0, 0, 0],
        endPoint: [0, 0, 6000],
        startConnection: { fittingType: "coupling_socket", connectionType: "threaded" },
        endConnection: { fittingType: "coupling_socket", connectionType: "threaded" },
        towerLabel: "Tower-A",
        floorLabel: "FL-01_TO_FL-03",
        shaftLabel: "SHAFT-PL01",
        pipelineCode: "RISER-PLUMBING-01",
      },
      {
        id: "SEG-SHAFT-FP01",
        systemCode: "FIRE_SPRINKLER",
        material: "steel_grooved",
        nominalDiaMm: 100,
        startPoint: [1000, 0, 0],
        endPoint: [1000, 0, 6000],
        startConnection: { fittingType: "coupling_socket", connectionType: "grooved" },
        endConnection: { fittingType: "coupling_socket", connectionType: "grooved" },
        towerLabel: "Tower-A",
        floorLabel: "FL-01_TO_FL-03",
        shaftLabel: "SHAFT-FP01",
        pipelineCode: "RISER-FIRE-01",
      },
    ];

    const spools = segmentPipelineIntoSpools(segs);
    const bom = explode5TierMicroBom(spools);

    const summariesByShaft = aggregateQtoBySpatialHierarchy(spools, bom, "shaft");
    assert.equal(summariesByShaft.length, 2);

    const plShaft = summariesByShaft.find((s) => s.dimensionKey === "SHAFT-PL01");
    const fpShaft = summariesByShaft.find((s) => s.dimensionKey === "SHAFT-FP01");

    assert.ok(plShaft && fpShaft);
    assert.ok(plShaft.pipeSummaryBySpec["STEEL_THREADED_DN65"]);
    assert.ok(fpShaft.pipeSummaryBySpec["STEEL_GROOVED_DN100"]);
  });

  it("M90-MANIFEST: Sinh phiếu đóng thùng Apartment Kitting Manifest cho Căn hộ", () => {
    const segs: PipeSegmentInput[] = [
      {
        id: "SEG-APT-A1201-01",
        systemCode: "PLUMBING_WATER",
        material: "ppr",
        nominalDiaMm: 25,
        startPoint: [0, 0, 3000],
        endPoint: [2800, 0, 3000],
        startConnection: { fittingType: "elbow_90", connectionType: "heat_fusion" },
        endConnection: { fittingType: "elbow_90", connectionType: "heat_fusion" },
        towerLabel: "Tower-B",
        floorLabel: "FL-12",
        apartmentLabel: "A12.01",
      },
    ];

    const spools = segmentPipelineIntoSpools(segs);
    const bom = explode5TierMicroBom(spools);

    const manifest = generateApartmentKittingManifest("A12.01", spools, bom);

    assert.equal(manifest.apartmentLabel, "A12.01");
    assert.equal(manifest.towerLabel, "Tower-B");
    assert.equal(manifest.floorLabel, "FL-12");
    assert.equal(manifest.crateCode, "CRATE-Tower-B-FL-12-A12.01");
    assert.ok(manifest.qrCrateToken.includes("QR-CRATE"));
    assert.equal(manifest.spoolChecklist.length, 1);
    assert.ok(manifest.fittingsKitList.length > 0, "Có danh sách phụ kiện kitting");
    assert.ok(manifest.totalCrateWeightKg > 0, "Tính đúng khối lượng thùng hàng");
  });

  // ==========================================================================
  // 6. KIỂM THỬ TỐI ƯU CẮT PHÔI 1D NESTING KÈM KHO PHÔI THỪA
  // ==========================================================================
  it("M90-NESTING: Ưu tiên kho phôi thừa (Remnant Pool) và giảm phế liệu < 1.2%", () => {
    const spools: any[] = [
      {
        spoolCode: "SP-01",
        cutLengthMm: 1450,
        isClosingSpool: false,
        material: "upvc",
        nominalDiaMm: 114,
      },
      {
        spoolCode: "SP-02",
        cutLengthMm: 2100,
        isClosingSpool: false,
        material: "upvc",
        nominalDiaMm: 114,
      },
      {
        spoolCode: "SP-03",
        cutLengthMm: 950,
        isClosingSpool: false,
        material: "upvc",
        nominalDiaMm: 114,
      },
      {
        spoolCode: "SP-04",
        cutLengthMm: 3800,
        isClosingSpool: false,
        material: "upvc",
        nominalDiaMm: 114,
      },
      {
        spoolCode: "SP-05",
        cutLengthMm: 1850,
        isClosingSpool: false,
        material: "upvc",
        nominalDiaMm: 114,
      },
    ];

    const remnantStock = [
      { remnantCode: "REM-001", nominalDiaMm: 114, material: "upvc" as const, lengthMm: 1500 },
      { remnantCode: "REM-002", nominalDiaMm: 114, material: "upvc" as const, lengthMm: 2200 },
    ];

    const res = optimizePipeNestingWithRemnants(spools, 6000, remnantStock, 3.0, 20.0);

    assert.equal(res.totalDemandPieces, 5);
    assert.ok(res.remnantsReusedCount >= 1, "Đã tái sử dụng thành công phôi thừa từ kho");
    assert.ok(res.bars.length > 0);
    assert.ok(res.isUnderTargetScrapRate, `Tỷ lệ phế liệu ${res.overallScrapPercent}% <= 1.2%`);
  });

  // ==========================================================================
  // 7. KIỂM THỬ XUẤT BẢN VẼ CHẾ TẠO TRỤC ĐO & TEM NHÃN QR KITTING
  // ==========================================================================
  it("M90-FAB-PACKAGE: Sinh bản vẽ Isometric 30°, checklist QC xưởng và QR Token", () => {
    const spool: any = {
      spoolCode: "SP-WATER-001",
      systemCode: "PLUMBING_WATER",
      material: "ppr",
      nominalDiaMm: 50,
      outerDiaMm: 50,
      cutLengthMm: 2350,
      cToCLengthMm: 2450,
      weightKg: 2.4,
      slopePercent: 0,
      startElevationMm: 3200,
      endElevationMm: 3200,
      end1Prep: "heat_fusion_clean",
      end2Prep: "coupling_fusion",
      isClosingSpool: false,
      fieldFitAllowanceMm: 0,
      towerLabel: "Tower-A",
      floorLabel: "FL-05",
      apartmentLabel: "A05.01",
      shaftLabel: "SHAFT-01",
      fittingsAttached: [],
      qrFabricationToken: "QR-SPOOL-TEST-001",
    };

    const pkg = generateSpoolFabricationPackage(spool, []);

    assert.equal(pkg.spoolCode, "SP-WATER-001");
    assert.equal(pkg.isometricNodes.length, 3);
    assert.ok(pkg.qrFabricationToken.includes("QR-SPOOL"));
    assert.ok(pkg.qrKittingBoxToken.includes("QR-KIT"));
    assert.equal(pkg.qcChecklist.length, 4);
    assert.ok(pkg.qcChecklist.every((q) => q.pass));
  });
});
