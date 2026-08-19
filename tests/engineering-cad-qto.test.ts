import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDuctQtoM2,
  calculatePipeQtoM,
  calculatePhysicalEarnedValue,
  compute3WayVariance,
  SpoolStatus,
} from "@/lib/engineering-cad-qto";

test("M66: calculateDuctQtoM2 tính toán chính xác diện tích tôn ống gió kèm hệ số bù bích", () => {
  // 600x400 mm, dài 4.2m, 5% buffer -> 2*(0.6+0.4)*4.2*1.05 = 8.82 m2
  const area = calculateDuctQtoM2(600, 400, 4.2, 0.05);
  assert.equal(area, 8.82);

  // Kích thước không hợp lệ -> trả về 0
  assert.equal(calculateDuctQtoM2(0, 400, 4.2), 0);
  assert.equal(calculateDuctQtoM2(600, -10, 4.2), 0);
});

test("M66: calculatePipeQtoM làm tròn chính xác độ dài đường ống", () => {
  assert.equal(calculatePipeQtoM(12.3456), 12.346);
  assert.equal(calculatePipeQtoM(-5), 0);
});

test("M66: calculatePhysicalEarnedValue tính toán trọng số tiến độ EV theo 5 mốc thi công", () => {
  const spools: Array<{ calculated_qty: number; status: SpoolStatus }> = [
    { calculated_qty: 10, status: "fabricated" }, // 10 * 0.20 = 2.0
    { calculated_qty: 10, status: "delivered" }, // 10 * 0.40 = 4.0
    { calculated_qty: 10, status: "installed" }, // 10 * 0.75 = 7.5
    { calculated_qty: 10, status: "qc_passed" }, // 10 * 0.90 = 9.0
    { calculated_qty: 10, status: "bbnt_approved" }, // 10 * 1.00 = 10.0
  ];

  const ev = calculatePhysicalEarnedValue(spools);

  assert.equal(ev.totalPlannedQty, 50);
  assert.equal(ev.earnedQty, 32.5); // 2 + 4 + 7.5 + 9 + 10 = 32.5
  assert.equal(ev.percentComplete, 65.0); // 32.5 / 50 = 65%
});

test("M66: compute3WayVariance phân loại chính xác các ngưỡng rủi ro phát sinh VO và vượt định mức", () => {
  // 1. Trường hợp bình thường (khớp hợp đồng)
  const vNormal = compute3WayVariance(100, 100, 80, 50, 500000);
  assert.equal(vNormal.status, "normal");
  assert.equal(vNormal.deltaVoQty, 0);
  assert.equal(vNormal.estimatedVoVnd, 0);

  // 2. Trường hợp phát sinh thiết bị vừa phải (VO risk < 15%)
  const vVo = compute3WayVariance(100, 110, 50, 20, 800000);
  assert.equal(vVo.status, "vo_risk");
  assert.equal(vVo.deltaVoQty, 10);
  assert.equal(vVo.estimatedVoVnd, 8000000); // 10 * 800,000 = 8,000,000

  // 3. Trường hợp phát sinh nghiêm trọng (Critical VO > 15%)
  const vCritical = compute3WayVariance(100, 125, 40, 10, 500000);
  assert.equal(vCritical.status, "critical_variance");
  assert.equal(vCritical.deltaVoQty, 25);
  assert.ok(vCritical.riskMessage.includes("vượt >15%"));

  // 4. Trường hợp thi công vượt định mức Shopdrawing (Over norm loss)
  const vLoss = compute3WayVariance(100, 100, 115, 80, 500000);
  assert.equal(vLoss.status, "over_norm");
  assert.ok(vLoss.riskMessage.includes("hao hụt"));
});
