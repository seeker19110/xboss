import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeApexScore,
  calculatePinnacleApexMetrics,
  recordApexSystemPulse,
  getLatestApexSystemPulse,
  dispatchApexCommandAction,
} from "@/lib/engineering-pinnacle-synergy";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M88: computeApexScore composite scoring and tiering", () => {
  // 1. Tối ưu hoàn hảo 100/100 -> OPTIMAL
  const perfect = computeApexScore({
    spatial: 100,
    financial: 100,
    legal: 100,
    site: 100,
    agent: 100,
  });
  assert.equal(perfect.apexIndex, 100);
  assert.equal(perfect.statusTier, "OPTIMAL");

  // 2. Điểm trung bình 85 -> RESILIENT
  const resilient = computeApexScore({
    spatial: 85,
    financial: 85,
    legal: 85,
    site: 85,
    agent: 85,
  });
  assert.equal(resilient.apexIndex, 85);
  assert.equal(resilient.statusTier, "RESILIENT");

  // 3. Điểm 70 -> ATTENTION
  const attention = computeApexScore({
    spatial: 70,
    financial: 70,
    legal: 70,
    site: 70,
    agent: 70,
  });
  assert.equal(attention.apexIndex, 70);
  assert.equal(attention.statusTier, "ATTENTION");

  // 4. Điểm thấp 50 -> CRITICAL
  const critical = computeApexScore({
    spatial: 50,
    financial: 50,
    legal: 50,
    site: 50,
    agent: 50,
  });
  assert.equal(critical.apexIndex, 50);
  assert.equal(critical.statusTier, "CRITICAL");
});

test("M88: Apex Pulse DB lifecycle & command actions", { skip: !HAS_DB }, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Pinnacle Synergy Proj')`);

  // 1. Ghi nhận snapshot Apex Pulse
  const pulse = await recordApexSystemPulse(projectId, {
    spatialScore: 98,
    financialScore: 95,
    legalScore: 100,
    siteScore: 96,
    agentScore: 99,
  });

  assert.ok(pulse.id);
  assert.equal(pulse.projectId, projectId);
  assert.ok(pulse.apexIndex >= 95);
  assert.equal(pulse.statusTier, "OPTIMAL");

  // 2. Lấy snapshot mới nhất
  const latest = await getLatestApexSystemPulse(projectId);
  assert.ok(latest);
  assert.equal(latest.id, pulse.id);

  // 3. Dispatch command action
  const action = await dispatchApexCommandAction(projectId, "CROSS_SYSTEM_SCAN", {
    trigger: "automated_test",
  });

  assert.ok(action.id);
  assert.equal(action.actionType, "CROSS_SYSTEM_SCAN");
  assert.equal(action.resultStatus, "COMPLETED");
});
