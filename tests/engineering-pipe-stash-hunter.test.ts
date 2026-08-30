// test/engineering-pipe-stash-hunter.test.ts — Unit & Integration Tests for Module M95
import test from "node:test";
import assert from "node:assert/strict";

import {
  auditMaterialMassBalance,
  evaluatePhantomInstallationBreaker,
  calculateJitReorderPoint,
  MassBalanceInput,
} from "@/lib/ky-thuat/engineering-pipe-stash-hunter";

test("1. 5-Way Mass-Balance — Clean balanced state (Δ = 0)", () => {
  const input: MassBalanceInput = {
    auditCode: "MBA-TEST-CLEAN",
    systemCode: "PLUMBING_DRAINAGE",
    nominalDiaMm: 110.0,
    totalBimDesignM: 1000.0,
    totalPoOrderedM: 1000.0,
    totalGrnReceivedM: 800.0,
    totalInstalledVerifiedM: 500.0,
    totalStagedOnFloorsM: 100.0,
    totalInCentralWarehouseM: 180.0,
    totalReusableRemnantsM: 15.0,
    totalScrapLoggedM: 5.0,
  };

  const result = auditMaterialMassBalance(input);

  assert.equal(result.accountedTotalM, 800.0);
  assert.equal(result.deltaUnaccountedOrStashM, 0.0);
  assert.equal(result.remainingToInstallM, 500.0);
  assert.equal(result.remainingToProcureM, 0.0);
  assert.equal(result.progressPercentage, 50.0);
  assert.equal(result.stashRiskStatus, "CLEAN_BALANCED");
  assert.ok(result.merkleSealHash.startsWith("SEAL-MB-"));
});

test("2. 5-Way Mass-Balance — Stash suspected alert when material is unaccounted (Δ > 0)", () => {
  const input: MassBalanceInput = {
    auditCode: "MBA-TEST-STASH",
    systemCode: "HVAC_CHILLER",
    nominalDiaMm: 150.0,
    totalBimDesignM: 2000.0,
    totalPoOrderedM: 2000.0,
    totalGrnReceivedM: 1500.0,
    totalInstalledVerifiedM: 900.0,
    totalStagedOnFloorsM: 200.0,
    totalInCentralWarehouseM: 300.0,
    totalReusableRemnantsM: 30.0,
    totalScrapLoggedM: 20.0, // Accounted = 1450m -> Missing 50m!
  };

  const result = auditMaterialMassBalance(input);

  assert.equal(result.accountedTotalM, 1450.0);
  assert.equal(result.deltaUnaccountedOrStashM, 50.0);
  assert.equal(result.stashRiskStatus, "STASH_SUSPECTED_ALERT");
  assert.ok(result.suspectLocations.length > 0);
  assert.ok(result.anomalyDescriptions[0].includes("nghi vấn cất giấu trái phép 50m"));
});

test("3. 5-Way Mass-Balance — Phantom claim fraud when claimed install > total GRN (Δ < 0)", () => {
  const input: MassBalanceInput = {
    auditCode: "MBA-TEST-PHANTOM",
    systemCode: "FIRE_SPRINKLER",
    nominalDiaMm: 100.0,
    totalBimDesignM: 1000.0,
    totalPoOrderedM: 1000.0,
    totalGrnReceivedM: 600.0,
    totalInstalledVerifiedM: 500.0,
    totalStagedOnFloorsM: 150.0,
    totalInCentralWarehouseM: 100.0,
    totalReusableRemnantsM: 0.0,
    totalScrapLoggedM: 0.0, // Accounted = 750m > 600m received!
  };

  const result = auditMaterialMassBalance(input);

  assert.equal(result.accountedTotalM, 750.0);
  assert.equal(result.deltaUnaccountedOrStashM, -150.0);
  assert.equal(result.stashRiskStatus, "PHANTOM_CLAIM_FRAUD");
  assert.ok(result.anomalyDescriptions[0].includes("nghiệm thu khống"));
});

test("4. 5-Way Mass-Balance — Holding time anomaly (> 72h) triggers stagnant buffer alert", () => {
  const input: MassBalanceInput = {
    auditCode: "MBA-TEST-HOLDING",
    systemCode: "PLUMBING_WATER",
    nominalDiaMm: 63.0,
    totalBimDesignM: 500.0,
    totalPoOrderedM: 500.0,
    totalGrnReceivedM: 400.0,
    totalInstalledVerifiedM: 200.0,
    totalStagedOnFloorsM: 100.0,
    totalInCentralWarehouseM: 100.0,
    totalReusableRemnantsM: 0.0,
    totalScrapLoggedM: 0.0,
    stagingBuffers: [
      {
        towerLabel: "Tower-B",
        floorLabel: "FL-08",
        zoneLabel: "Zone-03",
        quantityM: 100.0,
        stagedAt: "2026-08-15T08:00:00Z",
        holdingTimeHours: 96.0, // > 72h
      },
    ],
  };

  const result = auditMaterialMassBalance(input);

  assert.equal(result.stashRiskStatus, "STAGNANT_BUFFER_RISK");
  assert.equal(result.suspectLocations[0].towerLabel, "Tower-B");
  assert.equal(result.suspectLocations[0].floorLabel, "FL-08");
  assert.ok(result.suspectLocations[0].reason.includes("quá 96h"));
});

test("5. Anti-Phantom Installation Breaker — Blocks fraudulent claims exceeding issued stock", () => {
  // Case A: Claimed 150m, Issued 200m -> Pass
  const passRes = evaluatePhantomInstallationBreaker(150, 200);
  assert.equal(passRes.allowed, true);
  assert.equal(passRes.status, "PERMITTED_CLEAN");

  // Case B: Claimed 250m, Issued 180m -> Block
  const failRes = evaluatePhantomInstallationBreaker(250, 180);
  assert.equal(failRes.allowed, false);
  assert.equal(failRes.status, "BLOCKED_PHANTOM_INSTALLATION");
  assert.equal(failRes.excessM, 70.0);
  assert.ok(failRes.blockingReason?.includes("vượt quá tổng vật tư kho"));
});

test("6. JIT Re-order Point (ROP) Predictor — Correct calculation and trigger", () => {
  // Rate: 20m/day, Lead: 10 days -> Base: 200m, Buffer 20%: 40m -> ROP: 240m
  const jitA = calculateJitReorderPoint(20, 10, 150, 20);
  assert.equal(jitA.reorderPointM, 240.0);
  assert.equal(jitA.isReorderRequired, true); // 150 <= 240
  assert.ok(jitA.recommendedOrderQtyM > 0);

  // Available stock: 300m > 240m -> Safe
  const jitB = calculateJitReorderPoint(20, 10, 300, 20);
  assert.equal(jitB.isReorderRequired, false);
  assert.equal(jitB.recommendedOrderQtyM, 0);
});
