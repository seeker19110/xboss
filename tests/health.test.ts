import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test M44 PR2 — GET /api/health (lib/health.ts::checkHealth). Route public, không gọi
// cookies()/headers() nên gọi được handler trực tiếp ngoài request scope thật của Next.

test("checkHealth: DB lỗi (queryOneFn giả lập) → status degraded, db false, migration null", async () => {
  const { checkHealth } = await import("@/lib/health");
  const result = await checkHealth(async () => {
    throw new Error("giả lập mất kết nối DB");
  });
  assert.equal(result.status, "degraded");
  assert.equal(result.db, false);
  assert.equal(result.migration, null);
  assert.equal(typeof result.uptime_s, "number");
});

test(
  "checkHealth: DB thật (TEST_DATABASE_URL) → status ok, db true, migration là tên file migration",
  { skip: !HAS_TEST_DB },
  async () => {
    const { checkHealth } = await import("@/lib/health");
    const result = await checkHealth();
    assert.equal(result.status, "ok");
    assert.equal(result.db, true);
    assert.equal(typeof result.migration, "string");
    assert.match(result.migration as string, /\.sql$/);
    assert.equal(typeof result.uptime_s, "number");
  },
);

test("GET /api/health (route thật): có DB → 200 đúng shape", { skip: !HAS_TEST_DB }, async () => {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.db, true);
  assert.equal(typeof body.migration, "string");
  assert.equal(typeof body.uptime_s, "number");
});

test(
  "GET /api/health (route thật): không có DB → 503 status degraded",
  { skip: HAS_TEST_DB },
  async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, "degraded");
    assert.equal(body.db, false);
  },
);
