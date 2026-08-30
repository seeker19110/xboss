import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoSizePipeDiameter,
  calculateHydraulicLoss,
  calculateHangerLoadAndSpacing,
  runMepfHydraulicAnalysis,
} from "@/lib/ky-thuat/engineering-mepf-hydraulic";

test("M68: autoSizePipeDiameter chọn chính xác cỡ ống tối ưu vận tốc", () => {
  // Lưu lượng 25 m3/h -> Chọn DN65 hoặc DN80 để vận tốc <= 1.5 m/s
  const pipe = autoSizePipeDiameter(25.0, "chilled_water", 1.5);
  assert.ok(["DN65", "DN80", "DN100"].includes(pipe.nominalSpec));

  // Lưu lượng lớn 150 m3/h -> Chọn DN150 hoặc DN200
  const largePipe = autoSizePipeDiameter(150.0, "condenser_water", 1.8);
  assert.ok(["DN150", "DN200"].includes(largePipe.nominalSpec));
});

test("M68: calculateHydraulicLoss tính toán tổn thất áp lực theo Hazen-Williams", () => {
  // 30 m3/h, 50m ống DN80 (ID = 77.9mm), C = 120
  const res = calculateHydraulicLoss(30.0, 50.0, 77.9, 120);

  assert.ok(res.velocityMs > 0);
  assert.ok(res.headLossM > 0);
  assert.ok(res.headLossBar > 0);
  assert.equal(res.velocityMs, Math.round(res.velocityMs * 1000) / 1000);
});

test("M68: calculateHangerLoadAndSpacing tính toán tải trọng ống đầy nước và khoảng cách ty treo", () => {
  const pipe = {
    nominalSpec: "DN100",
    innerDiameterMm: 102.3,
    outerDiameterMm: 114.3,
    weightEmptyKgM: 16.1,
    standardHangerSpacingM: 3.5,
    recommendedRodSize: "M12" as const,
  };

  const hanger = calculateHangerLoadAndSpacing(pipe, 35.0);

  assert.ok(hanger.totalWeightKg > 0);
  assert.equal(hanger.spacingM, 3.5);
  assert.equal(hanger.rodSize, "M12");
  assert.equal(hanger.hangersCount, Math.ceil(35.0 / 3.5) + 1); // 11 giá đỡ
});

test("M68: runMepfHydraulicAnalysis tổng hợp toàn bộ quy trình tính toán thủy lực", () => {
  const analysis = runMepfHydraulicAnalysis("CALC-01", "domestic_water", 12.0, 30.0, 1.6);

  assert.equal(analysis.calcCode, "CALC-01");
  assert.ok(analysis.selectedDiameterSpec.startsWith("DN"));
  assert.ok(analysis.fluidVelocityMs <= 1.6);
  assert.equal(analysis.velocityStatus, "optimal");
  assert.ok(analysis.totalHangersNeeded >= 2);
});
