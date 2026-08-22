import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSCurveDistribution,
  computeCashflowSimulationEngine,
  runAndSaveCashflowForecast,
  listCashflowForecasts,
} from "@/lib/engineering-cashflow";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M85: S-Curve Distribution & Cashflow Calculation Engine", () => {
  const duration = 12;
  const weights = calculateSCurveDistribution(duration, "standard");
  assert.equal(weights.length, duration);

  const sumWeights = weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumWeights - 1.0) < 0.0001, "Tổng trọng số S-curve phải bằng 1.0");

  const simulation = computeCashflowSimulationEngine({
    totalContractValue: 10000000000, // 10 tỷ
    advancePercent: 15,
    retentionPercent: 5,
    paymentDelayDays: 30,
    durationPeriods: 12,
  });

  assert.equal(simulation.projections.length, 13, "Kỳ 0 (Tạm ứng) + 12 tháng");
  assert.equal(simulation.projections[0].projectedCashIn, 1500000000, "Tạm ứng 15%");
  assert.ok(simulation.risk.riskLevel);
});

test("M85: Cashflow Forecast DB Lifecycle", { skip: !HAS_DB }, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Cashflow Proj')`);

  const result = await runAndSaveCashflowForecast({
    projectId,
    runName: "Kịch bản Thử Nghiệm DB",
    totalContractValue: 20000000000,
    advancePercent: 15,
    retentionPercent: 5,
    paymentDelayDays: 30,
    durationPeriods: 12,
  });

  assert.ok(result.run.id);
  assert.equal(result.projections.length, 13);
  assert.ok(result.risk.riskLevel);

  const list = await listCashflowForecasts(projectId);
  assert.ok(list.length >= 1);
});
