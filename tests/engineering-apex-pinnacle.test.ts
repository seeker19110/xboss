import test from "node:test";
import assert from "node:assert/strict";
import "@/tests/setup";
import { computeApexScore } from "@/lib/ky-thuat/engineering-pinnacle-synergy";

test("Apex Synergy: computeApexScore tính đúng trọng số 5 trục và phân hạng statusTier", () => {
  // Trạng thái OPTIMAL
  const optimal = computeApexScore({
    spatial: 98,
    financial: 95,
    legal: 96,
    site: 97,
    agent: 99,
  });
  assert.ok(optimal.apexIndex >= 90);
  assert.equal(optimal.statusTier, "OPTIMAL");

  // Trạng thái CRITICAL khi điểm trung bình < 60
  const critical = computeApexScore({
    spatial: 40,
    financial: 50,
    legal: 45,
    site: 50,
    agent: 40,
  });
  assert.ok(critical.apexIndex < 60);
  assert.equal(critical.statusTier, "CRITICAL");
});
