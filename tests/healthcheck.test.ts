import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tính năng kiểm tra trạng thái hoạt động (health check) — lib/healthcheck.ts.

test("runHealthChecks: shape đúng — 9 hạng mục, tính đúng failCount/warnCount", async () => {
  const { runHealthChecks } = await import("@/lib/healthcheck");
  const report = await runHealthChecks();
  assert.equal(report.items.length, 9);
  const keys = report.items.map((i) => i.key).sort();
  assert.deepEqual(keys, [
    "cron_secret",
    "database",
    "email",
    "google_sheets",
    "login_rate_limit",
    "session_secret",
    "storage",
    "telegram",
    "web_push",
  ]);
  const expectedFail = report.items.filter((i) => i.status === "fail").length;
  const expectedWarn = report.items.filter((i) => i.status === "warn").length;
  assert.equal(report.failCount, expectedFail);
  assert.equal(report.warnCount, expectedWarn);
  assert.equal(report.hasIssues, expectedFail > 0 || expectedWarn > 0);
  assert.match(report.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test(
  "runHealthChecks: có DB test thật → hạng mục 'database' ok",
  { skip: !HAS_TEST_DB },
  async () => {
    const { runHealthChecks } = await import("@/lib/healthcheck");
    const report = await runHealthChecks();
    const db = report.items.find((i) => i.key === "database");
    assert.equal(db?.status, "ok", db?.detail);
  },
);
