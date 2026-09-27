import "./setup";
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/bao-mat/traffic-token";

const TEST_SECRET = "fixture-only-traffic-signing-key";

function env(t: TestContext, values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    const original = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  }
}

test("TRAFFIC_TOKEN_HEADER: đúng tên header thống nhất giữa proxy và endpoint", () => {
  assert.equal(TRAFFIC_TOKEN_HEADER, "x-traffic-token");
});

test("trafficToken: ổn định, đổi theo khóa và không lộ khóa ký phiên", (t) => {
  env(t, { NODE_ENV: "production", XBOSS_SECRET: TEST_SECRET });
  const token = trafficToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, TEST_SECRET);
  assert.equal(trafficToken(), token);
  process.env.XBOSS_SECRET = "fixture-only-other-traffic-key";
  assert.notEqual(trafficToken(), token);
});

for (const secret of [undefined, "", "   "]) {
  test(`trafficToken: production thiếu khóa hợp lệ (${JSON.stringify(secret)}) phải từ chối`, (t) => {
    env(t, { NODE_ENV: "production", XBOSS_SECRET: secret });
    assert.throws(() => trafficToken(), /XBOSS_SECRET/);
  });
}

test("trafficToken: dev/test vẫn dùng được mà không truyền khóa dự phòng thô", (t) => {
  env(t, { NODE_ENV: "test", XBOSS_SECRET: undefined });
  const token = trafficToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, "xboss-dev-secret-change-me");
  Object.assign(process.env, { NODE_ENV: "development" });
  assert.equal(trafficToken(), token);
});

test("ingest: từ chối khóa ký phiên thô; chỉ token nội bộ mới ghi traffic", async (t) => {
  env(t, { NODE_ENV: "production", XBOSS_SECRET: TEST_SECRET });
  const { POST } = await import("@/app/api/admin/traffic/ingest/route");
  const { getRecent, latestId } = await import("@/lib/bao-mat/traffic");
  const before = latestId();
  const request = (token: string) =>
    new NextRequest("http://localhost/api/admin/traffic/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", [TRAFFIC_TOKEN_HEADER]: token },
      body: JSON.stringify({ method: "GET", path: "/api/test-traffic-security" }),
    });

  assert.equal((await POST(request(TEST_SECRET))).status, 401);
  assert.equal((await POST(request(""))).status, 401);
  assert.equal(latestId(), before);
  assert.equal((await POST(request(trafficToken()))).status, 200);
  assert.equal(getRecent(before).length, 1);
  assert.equal(getRecent(before)[0].path, "/api/test-traffic-security");
});
