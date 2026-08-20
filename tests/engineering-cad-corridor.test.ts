// tests/engineering-cad-corridor.test.ts — Unit tests for Corridor Planning & Trapeze Hanger Engineering (M76 / M92)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planMultiTierCorridor,
  calculateTrapezeHangerStructure,
  UNISTRUT_CATALOG,
  THREADED_ROD_CAPACITY,
} from "@/lib/engineering-cad-corridor";

test("M76: planMultiTierCorridor quy hoạch ma trận cao độ 3 tầng chuẩn Invariant", () => {
  const input = {
    corridorCode: "CORR-FL10-EAST",
    title: "Hành lang tầng 10 cánh Đông",
    corridorWidthMm: 2400,
    corridorClearHeightMm: 2600,
    slabBottomElevationMm: 3500,
    beamBottomElevationMm: 3100,
    ceilingElevationMm: 2600,
    systems: [
      {
        systemCode: "HVAC_SUPPLY_DUCT",
        discipline: "hvac" as const,
        widthMm: 800,
        heightOrDiaMm: 300,
        weightKgPerM: 25.0,
      },
      {
        systemCode: "ELEC_POWER_TRAY",
        discipline: "electrical" as const,
        widthMm: 400,
        heightOrDiaMm: 100,
        weightKgPerM: 35.0,
      },
      {
        systemCode: "CHILLED_WATER_PIPE",
        discipline: "plumbing" as const,
        widthMm: 150,
        heightOrDiaMm: 150,
        weightKgPerM: 28.0,
      },
      {
        systemCode: "FIRE_SPRINKLER",
        discipline: "firefighting" as const,
        widthMm: 50,
        heightOrDiaMm: 50,
        weightKgPerM: 10.0,
      },
    ],
  };

  const result = planMultiTierCorridor(input);

  assert.equal(result.corridorCode, "CORR-FL10-EAST");
  assert.equal(result.isCompliant, true);
  assert.equal(result.assignedSystems.length, 4);

  // Kiểm tra phân tầng đúng chuẩn:
  // HVAC ở Tier 1 (Top)
  const hvac = result.assignedSystems.find((s) => s.discipline === "hvac");
  assert.equal(hvac?.tier, "tier_1_top");

  // Electrical ở Tier 2 (Mid)
  const elec = result.assignedSystems.find((s) => s.discipline === "electrical");
  assert.equal(elec?.tier, "tier_2_mid");

  // Plumbing ở Tier 3 (Bot)
  const plumb = result.assignedSystems.find((s) => s.discipline === "plumbing");
  assert.equal(plumb?.tier, "tier_3_bot");

  // Cao độ phân tầng chuẩn: Tier 1 (Top) > Tier 2 (Mid) > Tier 3 (Bot)
  assert.ok(
    result.tierAllocations.tier1TopDuctElevationMm > result.tierAllocations.tier2MidTrayElevationMm,
  );
  assert.ok(
    result.tierAllocations.tier2MidTrayElevationMm >
      result.tierAllocations.tier3BotPipesElevationMm,
  );
  // Mọi hệ thống đều nằm trên cao độ trần hoàn thiện (+2600mm)
  for (const s of result.assignedSystems) {
    assert.ok(s.allocatedElevationMm >= input.ceilingElevationMm);
  }
});

test("M76: planMultiTierCorridor cảnh báo khi chiều sâu kỹ thuật bị kích hẹp", () => {
  const input = {
    corridorCode: "CORR-FL02-NARROW",
    title: "Hành lang dầm thấp",
    corridorWidthMm: 1800,
    corridorClearHeightMm: 2600,
    slabBottomElevationMm: 3100,
    beamBottomElevationMm: 2800, // Chỉ còn 200mm tới trần 2600
    ceilingElevationMm: 2600,
    systems: [
      {
        systemCode: "HVAC_DUCT_BIG",
        discipline: "hvac" as const,
        widthMm: 1000,
        heightOrDiaMm: 500, // Quá lớn so với 200mm
        weightKgPerM: 40.0,
      },
    ],
  };

  const result = planMultiTierCorridor(input);
  assert.equal(result.isCompliant, false);
  assert.ok(result.isolationWarnings.length > 0);
});

test("M76: calculateTrapezeHangerStructure tính toán tải trọng, ứng suất uốn và độ võng", () => {
  const hangerInput = {
    hangerCode: "TRAP-01",
    spanWidthMm: 1200,
    dropLengthMm: 800,
    hangerSpacingM: 1.5,
    systemsOnHanger: [
      { weightKgPerM: 30.0, systemCode: "DUCT" },
      { weightKgPerM: 40.0, systemCode: "TRAY" },
      { weightKgPerM: 20.0, systemCode: "PIPE" },
    ],
    preferredUnistrutCode: "P1000" as const,
  };

  const result = calculateTrapezeHangerStructure(hangerInput);

  assert.equal(result.hangerCode, "TRAP-01");
  assert.ok(result.totalServiceLoadKg > 130); // (30+40+20)*1.5 + strut
  assert.ok(result.factoredLoadN > 1800); // factored = total * 9.81 * 1.4
  assert.ok(result.actualBendingStressMpa <= result.allowableBendingStressMpa);
  assert.ok(result.maxDeflectionMm <= result.allowableDeflectionMm);
  assert.equal(result.safetyStatus, "pass");
  assert.ok(result.selectedRodDiameterMm >= 10);
  assert.ok(result.autoLispScript.includes("c:DRAW_TRAP_01"));
});

test("M76: calculateTrapezeHangerStructure tự động nâng cấp lên Unistrut đôi P1001 khi nhịp lớn tải nặng", () => {
  const heavyInput = {
    hangerCode: "TRAP-HEAVY",
    spanWidthMm: 2200, // Nhịp dài 2.2m
    dropLengthMm: 1000,
    hangerSpacingM: 2.0,
    systemsOnHanger: [
      { weightKgPerM: 80.0, systemCode: "CHILLER_PIPE_D200" },
      { weightKgPerM: 70.0, systemCode: "CABLE_BUSWAY" },
    ],
    preferredUnistrutCode: "P1000" as const,
  };

  const result = calculateTrapezeHangerStructure(heavyInput);
  // Tự động nâng cấp sang Unistrut P1001 đôi
  assert.equal(result.selectedUnistrut.code, "P1001");
  assert.ok(result.selectedRodDiameterMm >= 12);
});
