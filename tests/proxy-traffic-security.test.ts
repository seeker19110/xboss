import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/bao-mat/traffic-token";

const TEST_SECRET = "fixture-only-proxy-signing-key";

function setup(t: TestContext, values: Record<string, string | undefined> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 200 });
  });
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
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "fixture-request-id");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://trusted.example/api/admin/traffic/ingest");
  assert.equal(calls[0].init?.method, "POST");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.path, "/api/tasks");
  assert.equal(body.method, "GET");
  assert.equal(body.ip, "192.0.2.8");
  assert.equal(body.ua, "traffic-test");
});

test("proxy: không gửi khóa ký phiên và không chuyển tiếp token qua redirect", (t) => {
  const calls = setup(t);
  proxy(request());
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
    assert.equal(calls[0].url, `http://127.0.0.1:${expected}/api/admin/traffic/ingest`);
  });
}

for (const appUrl of [
  "not-a-url",
  "ftp://trusted.example",
  "https://user:pass@trusted.example",
  "https://user@trusted.example",
]) {
  test(`proxy: APP_URL không hợp lệ bị chặn trước fetch (${appUrl})`, (t) => {
    const calls = setup(t, { APP_URL: appUrl });
    assert.throws(() => proxy(request()), /APP_URL/);
    assert.equal(calls.length, 0);
  });
}

for (const port of ["0", "65536", "3000@untrusted.example", "3e3"]) {
  test(`proxy: cổng loopback không hợp lệ bị chặn trước fetch (${port})`, (t) => {
    const calls = setup(t, { APP_URL: undefined, PORT: port });
    assert.throws(() => proxy(request()), /PORT/);
    assert.equal(calls.length, 0);
  });
}

test("proxy: thiếu khóa production phải từ chối trước khi gửi traffic", (t) => {
  const calls = setup(t, { XBOSS_SECRET: undefined });
  assert.throws(() => proxy(request()), /XBOSS_SECRET/);
  assert.equal(calls.length, 0);
});

test("proxy: ingest không tự sinh thêm request traffic", (t) => {
  const calls = setup(t);
  assert.equal(proxy(request("/api/admin/traffic/ingest")).status, 200);
  assert.equal(calls.length, 0);
});

test("proxy: lỗi ghi traffic không làm hỏng request gốc", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fixture-only-network-error");
  });
  assert.equal(proxy(request()).status, 200);
  await new Promise((resolve) => setImmediate(resolve));
});
