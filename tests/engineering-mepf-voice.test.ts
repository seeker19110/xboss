import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVoiceInspectionText, calculateProductivityIndex } from "@/lib/engineering-mepf-voice";

test("M68: parseVoiceInspectionText bóc tách chính xác vị trí, Spool ID và trạng thái tiến độ", () => {
  const text = "Tại Tầng 5 Zone A Căn 5.02, đoạn ống SP-FP-001 đã gác xong lên ty treo";
  const res = parseVoiceInspectionText(text);

  assert.ok(res.extractedLocation.includes("Tầng 5"));
  assert.ok(res.extractedLocation.includes("Zone A"));
  assert.equal(res.extractedSpoolCode, "SP-FP-001");
  assert.equal(res.detectedStatus, "installed");
  assert.equal(res.hasDefect, false);
});

test("M68: parseVoiceInspectionText phát hiện lỗi hiện trường và phân loại mức độ nghiêm trọng", () => {
  const text = "Tầng 4 phát hiện ống thoát nước bị rò rỉ tại mối nối bích";
  const res = parseVoiceInspectionText(text);

  assert.ok(res.extractedLocation.includes("Tầng 4"));
  assert.equal(res.hasDefect, true);
  assert.equal(res.defectSeverity, "critical");
  assert.ok(res.defectDescription?.includes("rò rỉ"));
});

test("M68: calculateProductivityIndex tính toán đúng chỉ số năng suất lao động thực tế", () => {
  // 4 thợ làm 8 giờ = 32 man-hours. Định mức 2.5m/giờ -> Kế hoạch = 80m.
  // Thực tế làm được 96m -> 96 / 80 = 120% -> Excellent!
  const res = calculateProductivityIndex(96, 4, 8, 2.5);

  assert.equal(res.actualRatePerHour, 3.0);
  assert.equal(res.expectedTotalQty, 80.0);
  assert.equal(res.productivityPercent, 120.0);
  assert.equal(res.rating, "excellent");
});
