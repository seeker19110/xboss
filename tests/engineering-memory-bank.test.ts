import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePatternFingerprint,
  computePatternSimilarity,
  KnowledgePatternRecord,
} from "@/lib/ky-thuat/engineering-memory-bank";

test("PIN-4: generatePatternFingerprint sinh mã băm SHA-256 bất biến không phụ thuộc thứ tự key", () => {
  const hash1 = generatePatternFingerprint("material_waste_rate", "HVAC Ductwork", {
    waste_percent: 8.5,
    fitting_ratio: 0.3,
  });

  const hash2 = generatePatternFingerprint("material_waste_rate", "HVAC Ductwork", {
    fitting_ratio: 0.3,
    waste_percent: 8.5,
  });

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 32);
});

test("PIN-4: computePatternSimilarity tính toán chính xác điểm tương đồng chuyển giao tri thức", () => {
  const pattern: KnowledgePatternRecord = {
    id: "pat-test",
    pattern_type: "material_waste_rate",
    category: "HVAC Ống Gió & Phụ Kiện",
    fingerprint_hash: "hash123",
    pattern_metrics: {},
    confidence_score: 0.9,
    sample_size_projects: 5,
    sample_size_observations: 1000,
    lesson_learned: "Tăng dự phòng hao hụt phụ kiện",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const highMatch = computePatternSimilarity({ category: "HVAC" }, pattern);
  assert.ok(highMatch >= 0.8);

  const lowMatch = computePatternSimilarity({ category: "Concrete Piling" }, pattern);
  assert.ok(lowMatch < 0.4);
});
