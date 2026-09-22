import { test } from "node:test";
import assert from "node:assert/strict";
import {
  // M66 (còn lại sau khi gỡ cụm CAD/BIM: công thức đo bóc nằm ở engineering-mepf-takeoff)
  calculatePipeQtoM,
  // M67
  inferFittingsFromSegments,
  // M68 (parseVoiceInspectionText đã bị xoá 2026-09-22 cùng engineering-mepf-voice)
  autoSizePipeDiameter,
  solve1dCuttingStock,
  // (M69 — convertToLod400Dfma/reverseBreakdownUnitRate đã bị xoá 2026-09-22 cùng
  //  engineering-shopdrawing-omnipotent và engineering-qs-omnipotent, xem PROGRESS.md)
  // M70
  syncSpoolToWbsAndPayment,
} from "@/lib/ky-thuat/engineering-suite";

test("Engineering Suite Barrel Index: các phân hệ còn lại từ M66 đến M70 đều được export đầy đủ và đồng bộ", () => {
  assert.equal(typeof calculatePipeQtoM, "function");
  assert.equal(typeof inferFittingsFromSegments, "function");
  assert.equal(typeof autoSizePipeDiameter, "function");
  assert.equal(typeof solve1dCuttingStock, "function");
  assert.equal(typeof syncSpoolToWbsAndPayment, "function");
});
