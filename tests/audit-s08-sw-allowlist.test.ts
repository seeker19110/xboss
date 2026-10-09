// QUALITY-FINAL-1 S08 (A2-FR01/FR02, A2-AC09): service worker chỉ cache đọc API theo ALLOWLIST
// tường minh của lưới tracking, network-first, gắn nhãn phiên vault + hạn lease của ĐÚNG tab.
// Chạy handler SW thật trong VM (Cache Storage/fetch giả) — không thay browser E2E.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const ORIGIN = "https://xboss.test";
const API_CACHE = "xboss-api-v21";
const SOURCE = readFileSync("public/sw.js", "utf8");
const TAB_A = "tab-a";
const TAB_B = "tab-b";
const TASKS = "/api/tasks?sheet=ogtd";
const DIMS = "/api/workpackages/12/dimensions";

const key = (request: Request | string) =>
  typeof request === "string" ? new URL(request, ORIGIN).href : request.url;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

function fixture(opts: { source?: string; cacheBiCam?: boolean } = {}) {
  const data = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const calls: Request[] = [];
  let network: (request: Request) => Promise<Response> = async () => json({ v: "mạng" });
  const cacheThat = {
    keys: async () => [...data.keys()],
    delete: async (name: string) => data.delete(name),
    open: async (name: string) => {
      if (!data.has(name)) data.set(name, new Map());
      const entries = data.get(name)!;
      return {
        match: async (request: Request | string) => entries.get(key(request))?.clone(),
        put: async (request: Request, response: Response) => {
          entries.set(key(request), response);
        },
        delete: async (request: Request | string) => entries.delete(key(request)),
      };
    },
  };
  // `cacheBiCam`: ghi lại MỌI truy cập Cache Storage (đường network-only phải bằng 0). Không ném
  // lỗi ở đây: SW nuốt lỗi cache (`.catch`) nên ném sẽ bị che — test đếm rồi assert sau.
  const chamCache: string[] = [];
  const caches = opts.cacheBiCam
    ? new Proxy(cacheThat, {
        get: (t, p) => {
          chamCache.push(String(p));
          return Reflect.get(t, p);
        },
      })
    : cacheThat;
  runInNewContext(opts.source ?? SOURCE, {
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
    Headers,
    caches,
    fetch: (request: Request, init: RequestInit) => {
      calls.push(request);
      assert.equal(init.cache, "no-store");
      return network(request);
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
  return {
    data,
    calls,
    chamCache,
    fire,
    get(path: string, clientId = TAB_A, headers?: HeadersInit) {
      const request = new Request(new URL(path, ORIGIN), { headers });
      const r = fire("fetch", { request, clientId }).response;
      assert.ok(r, `SW phải xử lý ${path}`);
      return r;
    },
    nguCanh(tag: string | null, expiresAt = Date.now() + 15 * 60_000, clientId = TAB_A) {
      fire("message", {
        data: { type: "OFFLINE_CONTEXT", tag, expiresAt },
        source: { id: clientId },
      });
    },
    async clear() {
      const acks: unknown[] = [];
      await fire("message", {
        data: { type: "CLEAR_CACHE", requestId: "r1" },
        ports: [{ postMessage: (v: unknown) => acks.push(v) }],
      }).done();
      return acks;
    },
    setNetwork(fn: (request: Request) => Promise<Response>) {
      network = fn;
    },
    offline() {
      network = async () => {
        throw new Error("offline");
      };
    },
    apiEntries: () => data.get(API_CACHE)?.size ?? 0,
  };
}

const TAG_A = "11111111-1111-4111-8111-111111111111";
const TAG_B = "22222222-2222-4222-8222-222222222222";

test("SW allowlist: lưới tracking network-first; mất mạng → bản cache của đúng tab, đánh dấu offline", async () => {
  const f = fixture();
  f.nguCanh(TAG_A);
  for (const path of [TASKS, DIMS]) {
    f.setNetwork(async () => json({ path, ban: "mạng-1" }));
    assert.equal((await (await f.get(path)).json()).ban, "mạng-1");
  }
  assert.equal(f.apiEntries(), 2);
  // Online: luôn lấy mạng (không trả bản cache cũ khi mạng trả lời).
  f.setNetwork(async () => json({ ban: "mạng-2" }));
  assert.equal((await (await f.get(TASKS)).json()).ban, "mạng-2");
  f.offline();
  const r = await f.get(TASKS);
  assert.equal(r.headers.get("X-XBoss-Offline-Cache"), "1");
  assert.equal(r.headers.get("X-XBoss-Offline-Meta"), null, "metadata nội bộ không lộ ra trang");
  assert.equal((await r.json()).ban, "mạng-2");
  // Tab KHÁC (không có ngữ cảnh vault, hoặc phiên khác) không đọc được bản của tab A.
  await assert.rejects(f.get(TASKS, TAB_B), /offline/);
  f.nguCanh(TAG_B, undefined, TAB_B);
  await assert.rejects(f.get(TASKS, TAB_B), /offline/);
});

test("SW allowlist: không có ngữ cảnh vault ACTIVE → không ghi cache, mất mạng thì lỗi mạng", async () => {
  const f = fixture();
  await f.get(TASKS);
  assert.equal(f.apiEntries(), 0);
  f.nguCanh(TAG_A);
  f.nguCanh(null); // vault khoá (hết lease/đăng xuất) → bỏ ngữ cảnh tab
  await f.get(TASKS);
  assert.equal(f.apiEntries(), 0);
  f.offline();
  await assert.rejects(f.get(TASKS), /offline/);
});

test("SW allowlist: hết lease → không stale 200 (A2-AC09); ngữ cảnh giả quá 8 giờ bị từ chối", async () => {
  const f = fixture();
  f.nguCanh(TAG_A, Date.now() + 60);
  await f.get(DIMS);
  assert.equal(f.apiEntries(), 1);
  await new Promise((r) => setTimeout(r, 90));
  f.offline();
  await assert.rejects(f.get(DIMS), /offline/);

  const g = fixture();
  g.nguCanh(TAG_A, Date.now() + 9 * 60 * 60_000);
  await g.get(DIMS);
  assert.equal(g.apiEntries(), 0, "hạn lease vượt trần server cấp → không có ngữ cảnh");
  g.nguCanh("ngắn", Date.now() + 60_000);
  await g.get(DIMS);
  assert.equal(g.apiEntries(), 0, "nhãn sai hình dạng → không có ngữ cảnh");
});

test("SW allowlist: mạng trả 401/403/404/409/500 → trả NGUYÊN và xoá bản cũ (không lộ khi mất mạng sau)", async () => {
  for (const status of [401, 403, 404, 409, 500]) {
    const f = fixture();
    f.nguCanh(TAG_A);
    await f.get(TASKS);
    assert.equal(f.apiEntries(), 1);
    f.setNetwork(async () => json({ error: "từ chối" }, { status }));
    assert.equal((await f.get(TASKS)).status, status);
    assert.equal(f.apiEntries(), 0, `HTTP ${status} phải xoá bản cache cũ`);
    f.offline();
    await assert.rejects(f.get(TASKS), /offline/);
  }
});

test("SW allowlist: no-store / không phải JSON / redirect → không cache", async () => {
  for (const r of [
    () => json({ a: 1 }, { headers: { "Cache-Control": "private, no-store" } }),
    () => new Response("<html>", { headers: { "Content-Type": "text/html" } }),
  ]) {
    const f = fixture();
    f.nguCanh(TAG_A);
    f.setNetwork(async () => r());
    await f.get(TASKS);
    assert.equal(f.apiEntries(), 0);
  }
});

test("SW allowlist: path/query lệch allowlist → network-only, không chạm Cache Storage", async () => {
  for (const path of [
    "/api/tasks",
    "/api/tasks?sheet=ogtd&x=1",
    "/api/tasks?sheet=ogtd&sheet=oghl",
    "/api/tasks?sheet=../costs",
    "/api/tasks/version?sheet=ogtd",
    "/api/workpackages/12/dimensions?label=a",
    "/api/workpackages/0/dimensions",
    "/api/workpackages/12",
    "/api/diaries/2026-10-08",
    "/api/users",
    "/api/notifications",
  ]) {
    const f = fixture({ cacheBiCam: true });
    f.nguCanh(TAG_A);
    assert.equal((await f.get(path)).status, 200, path);
    f.offline();
    await assert.rejects(f.get(path), /offline/, path);
    assert.deepEqual(f.chamCache, [], `${path} không được chạm Cache Storage`);
  }
  const f = fixture({ cacheBiCam: true });
  f.nguCanh(TAG_A);
  await f.get(TASKS, TAB_A, { Authorization: "Bearer thu" });
  assert.deepEqual(f.chamCache, [], "request có Authorization không được chạm Cache Storage");
});

test("SW: tài chính/xác thực/vault/SSE luôn network-only KỂ CẢ khi allowlist bị nới thành mọi /api", async () => {
  const nhoi = SOURCE.replace(
    /const API_OFFLINE = \[[\s\S]*?\n\];/,
    "const API_OFFLINE = [{ path: /^\\/api\\/.+$/, query: {} }];",
  );
  assert.notEqual(nhoi, SOURCE, "không tìm thấy khai báo API_OFFLINE để nới thử");
  // Đối chứng: allowlist nới thật sự có hiệu lực với đường không nhạy cảm.
  const doiChung = fixture({ source: nhoi });
  doiChung.nguCanh(TAG_A);
  await doiChung.get("/api/risks");
  assert.equal(doiChung.apiEntries(), 1, "allowlist nới phải cache được /api/risks");
  for (const path of [
    "/api/costs",
    "/api/costs/5",
    "/api/payment-certs/1",
    "/api/contracts",
    "/api/finance/summary",
    "/api/invoices",
    "/api/purchase-orders/3",
    "/api/claims",
    "/api/variations",
    "/api/proposals",
    "/api/tenders/2",
    "/api/payroll",
    "/api/workpackages/12/costs",
    "/api/export/excel",
    "/api/auth/me",
    "/api/offline/context",
    "/api/events",
  ]) {
    const f = fixture({ source: nhoi, cacheBiCam: true });
    f.nguCanh(TAG_A);
    assert.equal((await f.get(path)).status, 200, path);
    f.offline();
    await assert.rejects(f.get(path), /offline/, path);
    assert.deepEqual(f.chamCache, [], `${path} phải network-only (không chạm Cache Storage)`);
    assert.equal(f.apiEntries(), 0, path);
  }
});

test("SW: CLEAR_CACHE (đăng xuất/đổi dự án) xoá cache API + ngữ cảnh mọi tab rồi mới ACK", async () => {
  const f = fixture();
  f.nguCanh(TAG_A);
  await f.get(TASKS);
  assert.equal(f.apiEntries(), 1);
  const acks = await f.clear();
  assert.equal((acks[0] as { type: string }).type, "CACHE_CLEARED");
  assert.equal(f.data.has(API_CACHE), false);
  // Ngữ cảnh cũ đã bị bỏ: response mới cũng không được ghi lại cho tới khi tab báo lại.
  await f.get(TASKS);
  assert.equal(f.apiEntries(), 0);
  f.offline();
  await assert.rejects(f.get(TASKS), /offline/);
});

test("SW: response về muộn sau CLEAR_CACHE không ghi lại cache API", async () => {
  const f = fixture();
  f.nguCanh(TAG_A);
  let release!: (r: Response) => void;
  f.setNetwork(() => new Promise((resolve) => (release = resolve)));
  const pending = f.get(DIMS);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await f.clear();
  f.nguCanh(TAG_A); // tab báo lại ngữ cảnh sau khi dọn — response cũ vẫn thuộc generation cũ
  release(json({ cu: true }));
  await pending;
  assert.equal(f.apiEntries(), 0);
});
