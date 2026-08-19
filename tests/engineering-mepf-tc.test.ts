import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePressureHoldTest, evaluateFireInterlockMatrix } from "@/lib/engineering-mepf-tc";

test("M67: evaluatePressureHoldTest đánh giá chính xác kết quả thử áp lực đạt chuẩn", () => {
  // Bơm 10.0 bar, ngâm 120 phút, còn 9.85 bar -> Sụt 0.15 bar <= 0.2 bar -> ĐẠT
  const resPass = evaluatePressureHoldTest(10.0, 9.85, 120, 120, 0.2);
  assert.equal(resPass.isPassed, true);
  assert.equal(resPass.actualDropBar, 0.15);
  assert.ok(resPass.verdictMessage.includes("ĐẠT CHUẨN"));

  // Bơm 10.0 bar, ngâm 120 phút, còn 9.70 bar -> Sụt 0.30 bar > 0.2 bar -> KHÔNG ĐẠT
  const resFail = evaluatePressureHoldTest(10.0, 9.7, 120, 120, 0.2);
  assert.equal(resFail.isPassed, false);
  assert.equal(resFail.actualDropBar, 0.3);
  assert.ok(resFail.verdictMessage.includes("KHÔNG ĐẠT"));

  // Chưa đủ thời gian 120 phút -> KHÔNG ĐẠT
  const resIncomplete = evaluatePressureHoldTest(10.0, 10.0, 60, 120, 0.2);
  assert.equal(resIncomplete.isPassed, false);
  assert.ok(resIncomplete.verdictMessage.includes("Thời gian ngâm áp chưa đạt"));
});

test("M67: evaluateFireInterlockMatrix tổng hợp chính xác kịch bản liên động PCCC", () => {
  const scenarios = [
    {
      triggerEvent: "Cảm biến khói Tầng 5 kích hoạt",
      expectedAction: "Bật quạt tạo áp cầu thang N1",
      actualStatus: "pass" as const,
      responseTimeSec: 2.5,
    },
    {
      triggerEvent: "Cảm biến khói Tầng 5 kích hoạt",
      expectedAction: "Hạ thang máy P1 về tầng 1",
      actualStatus: "pass" as const,
      responseTimeSec: 4.1,
    },
    {
      triggerEvent: "Công tắc dòng chảy FP-Zone5 tác động",
      expectedAction: "Kích hoạt chuông đèn báo động",
      actualStatus: "pass" as const,
      responseTimeSec: 1.2,
    },
  ];

  const evalPass = evaluateFireInterlockMatrix(scenarios);
  assert.equal(evalPass.totalScenarios, 3);
  assert.equal(evalPass.passedCount, 3);
  assert.equal(evalPass.failedCount, 0);
  assert.equal(evalPass.overallPassed, true);
  assert.equal(evalPass.avgResponseTimeSec, 2.6); // (2.5 + 4.1 + 1.2)/3 = 2.6s

  // Có 1 kịch bản fail
  const scenariosWithFail = [
    ...scenarios,
    {
      triggerEvent: "Van xả tràn tác động",
      expectedAction: "Kích hoạt bơm cứu hỏa phụ",
      actualStatus: "fail" as const,
      responseTimeSec: 15.0,
    },
  ];
  const evalFail = evaluateFireInterlockMatrix(scenariosWithFail);
  assert.equal(evalFail.overallPassed, false);
  assert.equal(evalFail.failedCount, 1);
});
