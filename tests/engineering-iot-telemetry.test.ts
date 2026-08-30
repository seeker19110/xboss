import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateTelemetryStatus,
  computeEnergySummary,
} from "@/lib/ky-thuat/engineering-iot-telemetry";

test("M83: evaluateTelemetryStatus đánh giá đúng chuẩn QCVN cho Bụi PM2.5", () => {
  // Bình thường (< 50)
  const normalRes = evaluateTelemetryStatus("AIR_QUALITY", 35);
  assert.equal(normalRes.status, "NORMAL");

  // Cảnh báo (50 - 99.9)
  const warningRes = evaluateTelemetryStatus("AIR_QUALITY", 65);
  assert.equal(warningRes.status, "WARNING");
  assert.ok(warningRes.alertTitle?.includes("PM2.5"));

  // Nguy hại (>= 100)
  const criticalRes = evaluateTelemetryStatus("AIR_QUALITY", 120);
  assert.equal(criticalRes.status, "CRITICAL");
  assert.ok(criticalRes.alertMessage?.includes("phun sương"));
});

test("M83: evaluateTelemetryStatus đánh giá đúng chuẩn Khí độc CO tầng hầm", () => {
  // Bình thường
  const normalRes = evaluateTelemetryStatus("GAS_LEAK", 10);
  assert.equal(normalRes.status, "NORMAL");

  // Nguy hại CO (>= 50 ppm)
  const criticalRes = evaluateTelemetryStatus("GAS_LEAK", 55);
  assert.equal(criticalRes.status, "CRITICAL");
  assert.ok(criticalRes.alertTitle?.includes("rò rỉ khí độc CO"));
});

test("M83: evaluateTelemetryStatus tôn trọng threshold tùy chỉnh của thiết bị", () => {
  // Cảm biến đặt ngưỡng riêng là 200 kW
  const normalRes = evaluateTelemetryStatus("ENERGY_METER", 180, 200);
  assert.equal(normalRes.status, "NORMAL");

  const warnRes = evaluateTelemetryStatus("ENERGY_METER", 210, 200);
  assert.equal(warnRes.status, "WARNING");

  const critRes = evaluateTelemetryStatus("ENERGY_METER", 260, 200);
  assert.equal(critRes.status, "CRITICAL");
});

test("M83: computeEnergySummary tính toán chính xác tổng hợp điện năng", () => {
  const readings = [
    { metricValue: 120.5, measuredAt: "2026-08-20T00:00:00Z" },
    { metricValue: 180.2, measuredAt: "2026-08-20T00:15:00Z" },
    { metricValue: 150.0, measuredAt: "2026-08-20T00:30:00Z" },
  ];

  const summary = computeEnergySummary(readings);

  assert.equal(summary.currentPowerKw, 150.0);
  assert.equal(summary.peakPowerKw, 180.2);
  assert.equal(summary.totalEnergyKwh, 450.7);
});
