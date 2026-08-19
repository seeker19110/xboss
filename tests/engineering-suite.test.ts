import { test } from "node:test";
import assert from "node:assert/strict";
import {
  // M65
  computeCadVectorDiff,
  // M66
  calculatePipeQtoM,
  // M67
  inferFittingsFromSegments,
  // M68
  autoSizePipeDiameter,
  solve1dCuttingStock,
  parseVoiceInspectionText,
  // M69
  convertToLod400Dfma,
  reverseBreakdownUnitRate,
  // M70
  analyzeScanVsBimDeviations,
  syncSpoolToWbsAndPayment,
  // M71
  calculateAssetReliabilityAndRul,
  calculateEmbodiedCarbonLCA,
  bundleDigitalHandoverPassport,
  // M72
  conductMultiAgentDebate,
  calculateEngineeringHealthIndex,
} from "@/lib/engineering-suite";

test("Engineering Suite Barrel Index: Tất cả 15 phân hệ từ M65 đến M72 đều được export đầy đủ và đồng bộ", () => {
  assert.equal(typeof computeCadVectorDiff, "function");
  assert.equal(typeof calculatePipeQtoM, "function");
  assert.equal(typeof inferFittingsFromSegments, "function");
  assert.equal(typeof autoSizePipeDiameter, "function");
  assert.equal(typeof solve1dCuttingStock, "function");
  assert.equal(typeof parseVoiceInspectionText, "function");
  assert.equal(typeof convertToLod400Dfma, "function");
  assert.equal(typeof reverseBreakdownUnitRate, "function");
  assert.equal(typeof analyzeScanVsBimDeviations, "function");
  assert.equal(typeof syncSpoolToWbsAndPayment, "function");
  assert.equal(typeof calculateAssetReliabilityAndRul, "function");
  assert.equal(typeof calculateEmbodiedCarbonLCA, "function");
  assert.equal(typeof bundleDigitalHandoverPassport, "function");
  assert.equal(typeof conductMultiAgentDebate, "function");
  assert.equal(typeof calculateEngineeringHealthIndex, "function");
});
