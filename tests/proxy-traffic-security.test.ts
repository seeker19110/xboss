import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/bao-mat/traffic-token";
import { flushTraffic, TRAFFIC_BATCH_MAX } from "@/lib/bao-mat/traffic-batch";

const TEST_SECRET = "fixture-only-proxy-signing-key";

function setup(t: TestContext, values: Record<string, string | undefined> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 200 });
  });
  // Lô của test trước (module-level) không được lọt sang test này.
  flushTraffic();
  calls.length = 0;
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    XBOSS_SECRET: TEST_SECRET,
    APP_URL: "https://trusted.example/",
    PORT: undefined,
    ...values,
  })) {
    const original = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  }
  return calls;
}

function request(path = "/api/tasks") {
  return new NextRequest(`https://untrusted.example${path}`, {
    headers: {
      host: "another-untrusted.example",
      "x-forwarded-host": "forwarded-untrusted.example",
      "x-forwarded-proto": "http",
      "x-forwarded-for": "192.0.2.8",
      "user-agent": "traffic-test",
      "x-request-id": "fixture-request-id",
    },
  });
}

test("proxy: URL request và header host không đổi đích nhận token nội bộ", (t) => {
  const calls = setup(t, { APP_URL: "https://trusted.example/base?ignored=yes#fragment" });
  const response = proxy(request());
  flushTraffic();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "fixture-request-id");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://trusted.example/api/admin/traffic/ingest");
  assert.equal(calls[0].init?.method, "POST");
  const [body] = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.path, "/api/tasks");
  assert.equal(body.method, "GET");
  assert.equal(body.ip, "192.0.2.8");
  assert.equal(body.ua, "traffic-test");
});

test("proxy: không gửi khóa ký phiên và không chuyển tiếp token qua redirect", (t) => {
  const calls = setup(t);
  proxy(request());
  flushTraffic();
  const headers = new Headers(calls[0].init?.headers);
  assert.notEqual(headers.get(TRAFFIC_TOKEN_HEADER), TEST_SECRET);
  assert.equal(headers.get(TRAFFIC_TOKEN_HEADER), trafficToken());
  assert.equal(calls[0].init?.redirect, "error");
});

for (const [port, expected] of [
  [undefined, "3000"],
  ["4318", "4318"],
] as const) {
  test(`proxy: thiếu APP_URL chỉ gọi loopback cổng ${expected}`, (t) => {
    const calls = setup(t, { APP_URL: undefined, PORT: port });
    proxy(request());
    flushTraffic();
    assert.equal(calls[0].url, `http://127.0.0.1:${expected}/api/admin/traffic/ingest`);
  });
}

for (const appUrl of [
  "not-a-url",
  "ftp://trusted.example",
  "https://user:pass@trusted.example",
  "https://user@trusted.example",
]) {
  test(`proxy: APP_URL không hợp lệ → bỏ gửi traffic, request gốc vẫn chạy (${appUrl})`, (t) => {
    const calls = setup(t, { APP_URL: appUrl });
    assert.equal(proxy(request()).status, 200);
    flushTraffic();
    assert.equal(calls.length, 0);
  });
}

for (const port of ["0", "65536", "3000@untrusted.example", "3e3"]) {
  test(`proxy: cổng loopback không hợp lệ → bỏ gửi traffic, request gốc vẫn chạy (${port})`, (t) => {
    const calls = setup(t, { APP_URL: undefined, PORT: port });
    assert.equal(proxy(request()).status, 200);
    flushTraffic();
    assert.equal(calls.length, 0);
  });
}

test("proxy: thiếu khóa production → không gửi traffic, request gốc vẫn chạy", (t) => {
  const calls = setup(t, { XBOSS_SECRET: undefined });
  assert.equal(proxy(request()).status, 200);
  flushTraffic();
  assert.equal(calls.length, 0);
});

test("proxy: ingest không tự sinh thêm request traffic", (t) => {
  const calls = setup(t);
  assert.equal(proxy(request("/api/admin/traffic/ingest")).status, 200);
  flushTraffic();
  assert.equal(calls.length, 0);
});

test("proxy: lỗi ghi traffic không làm hỏng request gốc", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fixture-only-network-error");
  });
  assert.equal(proxy(request()).status, 200);
  flushTraffic();
  await new Promise((resolve) => setImmediate(resolve));
});

test("proxy: gom lô — nhiều request chỉ 1 POST (body là mảng) khi flush", (t) => {
  const calls = setup(t);
  for (let i = 0; i < 5; i++) proxy(request(`/api/x${i}`));
  assert.equal(calls.length, 0, "chưa flush thì chưa gửi");
  flushTraffic();
  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].init?.body));
  assert.ok(Array.isArray(body));
  assert.deepEqual(
    body.map((e: { path: string }) => e.path),
    ["/api/x0", "/api/x1", "/api/x2", "/api/x3", "/api/x4"],
  );
  flushTraffic();
  assert.equal(calls.length, 1, "flush lô rỗng không gửi thêm");
});

test("proxy: đủ TRAFFIC_BATCH_MAX entry thì tự flush", (t) => {
  const calls = setup(t);
  for (let i = 0; i < TRAFFIC_BATCH_MAX; i++) proxy(request(`/api/y${i}`));
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(String(calls[0].init?.body)).length, TRAFFIC_BATCH_MAX);
});
