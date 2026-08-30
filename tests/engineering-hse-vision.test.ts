import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateHseSafetyScore,
  analyzeSiteSafetyImageEngine,
  runAndSaveHseVisionScan,
  listHseVisionScans,
} from "@/lib/ky-thuat/engineering-hse-vision";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M87: HSE Vision Safety Scoring & Risk Tiering", () => {
  // Không có lỗi -> 100 điểm SAFE
  const safeEval = calculateHseSafetyScore([]);
  assert.equal(safeEval.score, 100);
  assert.equal(safeEval.riskTier, "SAFE");

  // Lỗi Critical -> Phạt 35 điểm
  const dangerEval = calculateHseSafetyScore([
    {
      hazardType: "UNGUARDED_EDGE",
      severity: "CRITICAL",
      confidence: 95,
      boundingBox: [0, 0, 100, 100],
      description: "Mép sàn hở",
      standardViolation: "QCVN 18:2021",
      fineAmountVnd: 2000000,
    },
  ]);
  assert.equal(dangerEval.score, 65);
  assert.equal(dangerEval.riskTier, "DANGER");

  const cleanResult = analyzeSiteSafetyImageEngine({
    scanName: "Ảnh Hiện Trường Chuẩn An Toàn",
    imageUrl: "https://example.com/clean-site.jpg",
  });
  assert.equal(cleanResult.hazards.length, 0);
  assert.equal(cleanResult.siteSafetyScore, 100);
  assert.equal(cleanResult.riskTier, "SAFE");

  const hazardResult = analyzeSiteSafetyImageEngine({
    scanName: "Ảnh Có Vi Phạm",
    imageUrl: "https://example.com/hazard-site.jpg",
    detectedHazards: [
      {
        hazardType: "NO_HELMET",
        severity: "HIGH",
        confidence: 96.5,
        boundingBox: [120, 80, 60, 60],
        description: "Không đội mũ bảo hộ",
        standardViolation: "QCVN 18:2021",
        fineAmountVnd: 500000,
      },
    ],
  });
  assert.equal(hazardResult.hazards.length, 1);
  assert.equal(hazardResult.siteSafetyScore, 80);
  assert.equal(hazardResult.riskTier, "WARNING");
});

test("M87: HSE Vision DB Lifecycle & Action Tickets", { skip: !HAS_DB }, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('HSE Vision Proj')`);

  const result = await runAndSaveHseVisionScan({
    projectId,
    scanName: "Quét An Toàn Test DB",
    imageUrl: "https://example.com/test.jpg",
    assignedSubcon: "Thầu Phụ Test",
    customHazards: [
      {
        hazardType: "NO_HELMET",
        severity: "HIGH",
        confidence: 95.0,
        boundingBox: [100, 100, 50, 50],
        description: "Không đội nón bảo hộ",
        standardViolation: "QCVN 18:2021",
        fineAmountVnd: 500000,
      },
    ],
  });

  assert.ok(result.scan.id);
  assert.ok(result.hazards.length > 0);

  const list = await listHseVisionScans(projectId);
  assert.ok(list.length >= 1);
});
