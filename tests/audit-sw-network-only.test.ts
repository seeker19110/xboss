// Kiểm handler SW thật trong VM; mô phỏng Cache Storage/fetch có trì hoãn, không thay browser E2E.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const ORIGIN = "https://xboss.test";
const PUBLIC_CACHE = "xboss-public-v20";
const source = readFileSync("public/sw.js", "utf8");
const key = (request: Request | string) =>
  typeof request === "string" ? new URL(request, ORIGIN).href : request.url;

function fixture() {
  const data = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const calls: { request: Request; init: RequestInit }[] = [];
  let writes = 0;
  let network = async (_request: Request, _init: RequestInit): Promise<Response> =>
    new Response("mạng", { headers: { "Content-Type": "application/javascript" } });
  let putBarrier: (() => Promise<void>) | undefined;
  const caches = {
    keys: async () => [...data.keys()],
    delete: async (name: string) => data.delete(name),
    open: async (name: string) => {
      if (!data.has(name)) data.set(name, new Map());
      const entries = data.get(name)!;
      return {
        match: async (request: Request | string) => entries.get(key(request))?.clone(),
        put: async (request: Request, response: Response) => {
          if (putBarrier) await putBarrier();
          writes++;
          entries.set(key(request), response);
        },
      };
    },
  };
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => {
        handlers.set(name, handler);
      },
      skipWaiting: () => {},
      clients: { claim: async () => {}, matchAll: async () => [] },
    },
    location: { origin: ORIGIN },
    URL,
    Request,
    Response,
    caches,
    fetch: (request: Request, init: RequestInit) => {
      calls.push({ request, init });
      return network(request, init);
    },
  });
  const fire = (name: string, event: Record<string, unknown>) => {
    let response: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.get(name)?.({
      ...event,
      respondWith: (value: Promise<Response>) => {
        response = Promise.resolve(value);
      },
      waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)),
    });
    return { response, done: () => Promise.all(waits) };
  };
  const get = (path: string, mode = "cors", headers?: HeadersInit) => {
    const request = new Request(new URL(path, ORIGIN), { headers });
    Object.defineProperty(request, "mode", { value: mode });
    return fire("fetch", { request }).response!;
  };
  return {
    data,
    calls,
    writes: () => writes,
    fire,
    get,
    setNetwork: (fn: typeof network) => {
      network = fn;
    },
    setPutBarrier: (fn: () => Promise<void>) => {
      putBarrier = fn;
    },
  };
}

const privatePaths = ["/api/auth/me", "/api/costs", "/api/tasks", "/api/future/private", "/api"];
for (const path of privatePaths) {
  test(`SW: ${path} không đọc bản riêng tư cũ trong bất kỳ cache nào`, async () => {
    const f = fixture();
    f.data.set("xboss-v19", new Map([[key(path), new Response("bí mật người A")]]));
    f.data.set(PUBLIC_CACHE, new Map([[key(path), new Response("dữ liệu bị đầu độc")]]));
    f.setNetwork(async () => new Response("người B", { status: 200 }));
    assert.equal(await (await f.get(path)).text(), "người B");
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].init.cache, "no-store");
    assert.equal(f.writes(), 0);
    f.setNetwork(async () => {
      throw new Error("offline");
    });
    await assert.rejects(f.get(path), /offline/);
  });
}

for (const status of [401, 403, 409, 500, 503]) {
  test(`SW: giữ nguyên HTTP ${status}, không stale fallback`, async () => {
    const f = fixture();
    f.data.set(PUBLIC_CACHE, new Map([[key("/offline"), new Response("shell")]]));
    f.setNetwork(async () => new Response("từ chối", { status }));
    assert.equal((await f.get("/api/costs")).status, status);
    assert.equal((await f.get("/costs", "navigate")).status, status);
    assert.equal(f.writes(), 0);
  });
}

test("SW: HTML/RSC riêng tư không cache; navigation lỗi mạng dùng shell", async () => {
  const f = fixture();
  f.setNetwork(async () => {
    return new Response("riêng tư", { headers: { "Content-Type": "text/html" } });
  });
  await f.get("/costs", "navigate");
  assert.equal(f.writes(), 0);
  const shell = new Response("shell vô danh", { headers: { "Content-Type": "text/html" } });
  f.data.set(PUBLIC_CACHE, new Map([[key("/offline"), shell]]));
  f.setNetwork(async () => {
    throw new Error("offline");
  });
  assert.equal(await (await f.get("/costs", "navigate")).text(), "shell vô danh");
  await assert.rejects(f.get("/costs?_rsc=abc"), /offline/);
});

test("SW: chunk công khai cache-first, request tải không gửi credentials", async () => {
  const f = fixture();
  assert.equal(await (await f.get("/_next/static/chunks/app.js")).text(), "mạng");
  assert.equal(f.calls[0].init.credentials, "omit");
  assert.equal(f.calls[0].init.redirect, "error");
  await f.get("/_next/static/chunks/app.js");
  assert.equal(f.calls.length, 1);
  assert.equal(f.writes(), 1);
});

for (const [mime, cacheControl] of [
  ["text/html", "public"],
  ["text/plain", "public"],
  ["application/javascript", "private"],
  ["application/javascript", "no-store"],
]) {
  test(`SW: không cache chunk ${mime}/${cacheControl}`, async () => {
    const f = fixture();
    f.setNetwork(async () => {
      return new Response("không cache", {
        headers: { "Content-Type": mime, "Cache-Control": cacheControl },
      });
    });
    await f.get("/_next/static/chunks/app.js");
    assert.equal(f.writes(), 0);
  });
}

test("SW: query URL hoặc Authorization không đi vào cache công khai", async () => {
  const f = fixture();
  await f.get("/_next/static/chunks/app.js?token=private");
  await f.get("/_next/static/chunks/app.js", "cors", { Authorization: "Bearer test-only" });
  assert.equal(f.writes(), 0);
});

test("SW: activate chỉ dọn namespace XBoss cũ, giữ cache ứng dụng khác", async () => {
  const f = fixture();
  for (const name of ["xboss-v19", "xboss-public-v18", PUBLIC_CACHE, "another-app-v1"]) {
    f.data.set(name, new Map());
  }
  await f.fire("activate", {}).done();
  assert.deepEqual([...f.data.keys()].sort(), ["another-app-v1", PUBLIC_CACHE].sort());
});

test("SW: response về muộn sau CLEAR_CACHE không tạo cache trở lại", async () => {
  const f = fixture();
  let release!: (response: Response) => void;
  f.setNetwork(() => new Promise((resolve) => (release = resolve)));
  const pending = f.get("/_next/static/chunks/app.js");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const acknowledgements: unknown[] = [];
  const clear = f.fire("message", {
    data: { type: "CLEAR_CACHE", requestId: "switch-1" },
    ports: [{ postMessage: (value: unknown) => acknowledgements.push(value) }],
  });
  await clear.done();
  release(new Response("chunk", { headers: { "Content-Type": "application/javascript" } }));
  await pending;
  assert.equal(f.writes(), 0);
  assert.equal(f.data.has(PUBLIC_CACHE), false);
  assert.equal((acknowledgements[0] as { type: string }).type, "CACHE_CLEARED");
});

test("SW: ACK chỉ sau put đã bắt đầu hoàn tất rồi cache được xóa", async () => {
  const f = fixture();
  let release!: () => void;
  f.setPutBarrier(() => new Promise<void>((resolve) => (release = resolve)));
  const pending = f.get("/_next/static/chunks/app.js");
  await new Promise<void>((resolve) => setImmediate(resolve));
  let acknowledged = false;
  const clear = f.fire("message", {
    data: { type: "CLEAR_CACHE", requestId: "logout" },
    ports: [{ postMessage: () => (acknowledged = true) }],
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(acknowledged, false);
  release();
  await Promise.all([pending, clear.done()]);
  assert.equal(acknowledged, true);
  assert.equal(f.data.has(PUBLIC_CACHE), false);
});

test("SW: không chặn request khác origin hoặc ghi dữ liệu", () => {
  const f = fixture();
  assert.equal(f.get("https://other.test/file.js"), undefined);
  const request = new Request(`${ORIGIN}/api/tasks`, { method: "POST" });
  assert.equal(f.fire("fetch", { request }).response, undefined);
  assert.equal(f.calls.length, 0);
});
