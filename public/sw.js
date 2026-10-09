// QUALITY-FINAL-1 / S04: chỉ cache shell công khai và asset tĩnh.
// HTML cá nhân hóa, RSC và export luôn qua mạng. S08: API mặc định network-only; chỉ ALLOWLIST
// tường minh các GET đọc lưới tracking được dùng lại khi MẤT MẠNG, gắn nhãn phiên vault + hạn
// lease của đúng tab (xem AUDIT-S08-OFFLINE-RECOVERY.md).
const CACHE = "xboss-public-v21";
const API_CACHE = "xboss-api-v21";
const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];
let generation = 0;
let cacheWrites = Promise.resolve();

// Chỉ quản lý namespace của SW XBoss, không xóa cache ứng dụng khác cùng origin.
const isOwnedCache = (name) => /^xboss-(?:public-|api-)?v\d+$/.test(name);

// ── Cache đọc API khi mất mạng (S08, A2-FR01/FR02/AC09) ────────────────────────────────────
// Chỉ đúng các GET lưới tracking cần để mở nhóm/tải lại lưới khi mất mạng. Không có nhật ký
// (server trả private, no-store), không users/thông báo/tài chính. Query phải khớp ĐÚNG khoá.
const API_OFFLINE = [
  { path: /^\/api\/tasks$/, query: { sheet: /^[a-z0-9][a-z0-9-]{0,49}$/ } },
  { path: /^\/api\/workpackages\/[1-9]\d{0,11}\/dimensions$/, query: {} },
];
// Luôn network-only, kiểm TRƯỚC allowlist (kể cả khi allowlist bị nới nhầm): mọi đoạn đường dẫn
// thuộc miền tài chính/mua sắm/hợp đồng, xác thực, vault offline, SSE.
const KHONG_BAO_GIO_CACHE =
  /^\/api\/(?:auth|offline|events)(?:\/|$)|\/(?:contracts?|contract-documents|payment-certs|payments?|payroll|costs?|finance|invoices?|cash-transactions|advances|purchase-orders|purchase-requests|procurement|po|claims?|claim-documents|variations|vo|vo-documents|proposals|tenders?|suppliers|insurance-bonds|ipc|bills?|budgets?|boq|boq-norms|export)(?:\/|$)/;
const NHAN_RE = /^[A-Za-z0-9-]{8,64}$/;
/** Trần lease dài nhất server cấp (field-personal 8 giờ) + dung sai — chặn hạn giả quá xa. */
const LEASE_TOI_DA_MS = 8 * 60 * 60 * 1000 + 60 * 1000;
const META_HEADER = "X-XBoss-Offline-Meta";
// Ngữ cảnh theo TAB (clientId) do trang báo khi vault ACTIVE; mất khi SW khởi động lại → không
// phục vụ cache (fail-closed) cho tới khi trang xác minh lại online.
const nguCanhTab = new Map();

function laTaiChinhHoacNhayCam(pathname) {
  return KHONG_BAO_GIO_CACHE.test(pathname);
}

/** Request API thuộc allowlist offline? Không khớp tuyệt đối (path + đúng khoá query) → null. */
function apiOffline(url, request) {
  if (request.headers.has("authorization")) return null;
  if (laTaiChinhHoacNhayCam(url.pathname)) return null;
  for (const rule of API_OFFLINE) {
    if (!rule.path.test(url.pathname)) continue;
    const keys = [...url.searchParams.keys()];
    const allowed = Object.keys(rule.query);
    if (keys.length !== allowed.length || new Set(keys).size !== keys.length) return null;
    for (const k of allowed) {
      const v = url.searchParams.get(k);
      if (v == null || !rule.query[k].test(v)) return null;
    }
    return rule;
  }
  return null;
}

function nguCanhCon(clientId, now) {
  const c = clientId ? nguCanhTab.get(clientId) : undefined;
  if (!c) return null;
  if (now >= c.expiresAt || now < c.setAt - 5000) {
    nguCanhTab.delete(clientId);
    return null;
  }
  return c;
}

function apiLuuDuoc(request, response) {
  if (response.status !== 200 || response.redirected || response.type === "opaque") return false;
  if (/\bno-store\b/i.test(response.headers.get("cache-control") ?? "")) return false;
  if (response.url && response.url !== request.url) return false;
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  return mime === "application/json";
}

function luuApi(request, response, ctx, epoch, now) {
  const write = cacheWrites.then(async () => {
    if (epoch !== generation) return;
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    const url = new URL(request.url);
    headers.set(
      META_HEADER,
      JSON.stringify({
        v: 1,
        tag: ctx.tag,
        generation: epoch,
        resourceKey: url.pathname,
        query: url.search,
        fetchedAt: now,
        expiresAt: ctx.expiresAt,
      }),
    );
    const cache = await caches.open(API_CACHE);
    if (epoch !== generation) return;
    await cache.put(request, new Response(body, { status: 200, headers }));
  });
  cacheWrites = write.catch(() => {});
  return write;
}

async function xoaApi(request) {
  const cache = await caches.open(API_CACHE);
  await cache.delete(request);
}

/** Bản cache chỉ hợp lệ cho đúng tab, đúng phiên vault, đúng generation, còn trong lease. */
async function docApi(request, clientId) {
  const now = Date.now();
  const ctx = nguCanhCon(clientId, now);
  if (!ctx) return null;
  const epoch = generation;
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);
  if (!cached || epoch !== generation) return null;
  let meta = null;
  try {
    meta = JSON.parse(cached.headers.get(META_HEADER) ?? "null");
  } catch {
    meta = null;
  }
  const url = new URL(request.url);
  const hopLe =
    meta &&
    meta.v === 1 &&
    meta.tag === ctx.tag &&
    meta.generation === generation &&
    meta.resourceKey === url.pathname &&
    meta.query === url.search &&
    typeof meta.fetchedAt === "number" &&
    now >= meta.fetchedAt - 5000 &&
    now < Math.min(meta.expiresAt, ctx.expiresAt);
  if (!hopLe) {
    await cache.delete(request).catch(() => {});
    return null;
  }
  const headers = new Headers(cached.headers);
  headers.delete(META_HEADER);
  headers.set("X-XBoss-Offline-Cache", "1");
  return new Response(await cached.arrayBuffer(), { status: 200, headers });
}

/**
 * Network-first: có phản hồi mạng là trả NGUYÊN (kể cả 401/403/409/5xx — không bao giờ stale 200);
 * chỉ khi fetch ném lỗi mạng mới thử bản cache của đúng tab/phiên/lease.
 */
async function apiNetworkFirst(request, clientId) {
  const epoch = generation;
  let response;
  try {
    response = await fetch(request, { cache: "no-store" });
  } catch (error) {
    const cached = await docApi(request, clientId).catch(() => null);
    if (cached) return cached;
    throw error;
  }
  const now = Date.now();
  const ctx = nguCanhCon(clientId, now);
  if (ctx && apiLuuDuoc(request, response)) {
    await luuApi(request, response.clone(), ctx, epoch, now).catch(() => {});
  } else if (response.status !== 200 || !apiLuuDuoc(request, response)) {
    // Bị từ chối/không còn/không được lưu: bỏ bản cũ để lần mất mạng sau không lộ dữ liệu cũ.
    await xoaApi(request).catch(() => {});
  }
  return response;
}

function publicResponse(request, response) {
  if (response.status !== 200 || response.redirected || response.type === "opaque") {
    return false;
  }
  if (/\b(no-store|private)\b/i.test(response.headers.get("cache-control") ?? "")) {
    return false;
  }
  if (response.url && response.url !== request.url) return false;
  const path = new URL(request.url).pathname;
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (path === "/offline") return mime === "text/html";
  if (path === "/manifest.webmanifest") {
    return mime === "application/manifest+json" || mime === "application/json";
  }
  if (path.startsWith("/icon")) return mime.startsWith("image/");
  // Không giữ HTML lỗi hoặc trang login trả 200 thay cho chunk JS/CSS.
  return mime !== "" && mime !== "text/html" && mime !== "text/plain";
}

function cachePublic(request, response, epoch) {
  const write = cacheWrites.then(async () => {
    if (epoch !== generation) return;
    const cache = await caches.open(CACHE);
    if (epoch !== generation) return;
    await cache.put(request, response);
  });
  cacheWrites = write.catch(() => {});
  return write;
}

function purgeOwnedCaches(keepCurrent) {
  generation++;
  // Đổi ngữ cảnh/đăng xuất: mọi tab phải xác minh lại online trước khi được dùng cache đọc.
  if (!keepCurrent) nguCanhTab.clear();
  // Chờ put đã bắt đầu; put chưa bắt đầu thuộc generation cũ sẽ bị bỏ.
  const purge = cacheWrites.then(async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => isOwnedCache(key) && (!keepCurrent || key !== CACHE))
        .map((key) => caches.delete(key)),
    );
  });
  cacheWrites = purge.catch(() => {});
  return purge;
}

async function publicFetch(request, epoch) {
  const response = await fetch(request, {
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  if (publicResponse(request, response)) {
    // Cache lỗi/quota không được làm hỏng response mạng hợp lệ.
    await cachePublic(request, response.clone(), epoch).catch(() => {});
  }
  return response;
}

async function publicCacheFirst(request) {
  const epoch = generation;
  try {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (epoch === generation && cached && publicResponse(request, cached)) return cached;
  } catch {
    /* Cache Storage bị chặn: vẫn thử mạng */
  }
  return publicFetch(request, epoch);
}

async function offlineShell() {
  try {
    const cache = await caches.open(CACHE);
    const request = new Request(new URL("/offline", location.origin));
    const cached = await cache.match(request);
    if (cached && publicResponse(request, cached)) return cached;
  } catch {
    /* không có shell công khai: trả lỗi mạng, không dùng HTML riêng tư cũ */
  }
  return Response.error();
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  const epoch = generation;
  e.waitUntil(
    Promise.all(
      SHELL_URLS.map((url) => {
        return publicFetch(new Request(new URL(url, location.origin)), epoch).catch(() => {});
      }),
    ),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(purgeOwnedCaches(true).then(() => self.clients.claim()));
});

// Web Push và tín hiệu flush giữ nguyên; SW không tự gửi hàng đợi offline.
self.addEventListener("push", (e) => {
  let data = { title: "XBoss", body: "", url: "/" };
  try {
    data = { ...data, ...e.data.json() };
  } catch {
    /* payload không phải JSON — dùng mặc định */
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list)
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "OFFLINE_CONTEXT") {
    // Trang báo vault ACTIVE (nhãn phiên ngẫu nhiên + hạn lease) hoặc đã khoá (tag null).
    // Không mang PII/khoá/contextId; sai hình dạng → bỏ ngữ cảnh của tab (fail-closed).
    const id = e.source?.id;
    if (typeof id !== "string" || !id) return;
    const { tag, expiresAt } = e.data;
    const now = Date.now();
    if (
      typeof tag === "string" &&
      NHAN_RE.test(tag) &&
      typeof expiresAt === "number" &&
      Number.isFinite(expiresAt) &&
      expiresAt > now &&
      expiresAt <= now + LEASE_TOI_DA_MS
    ) {
      nguCanhTab.set(id, { tag, expiresAt, setAt: now });
    } else {
      nguCanhTab.delete(id);
    }
    return;
  }
  if (e.data?.type !== "CLEAR_CACHE") return;
  e.waitUntil(
    purgeOwnedCaches(false).then(
      () => {
        e.ports?.[0]?.postMessage({ type: "CACHE_CLEARED", requestId: e.data.requestId });
      },
      () => {
        e.ports?.[0]?.postMessage({ type: "CACHE_CLEAR_FAILED", requestId: e.data.requestId });
      },
    ),
  );
});

self.addEventListener("sync", (e) => {
  if (e.tag === "xboss-flush") {
    e.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ type: "FLUSH_QUEUE" }))),
    );
  }
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Bao phủ cả API tương lai: mặc định network-only, chỉ allowlist tường minh mới network-first.
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    e.request.headers.has("authorization")
  ) {
    if (apiOffline(url, e.request)) {
      e.respondWith(apiNetworkFirst(e.request, e.clientId));
      return;
    }
    e.respondWith(fetch(e.request, { cache: "no-store" }));
    return;
  }

  const isShell = SHELL_URLS.includes(url.pathname);
  const isStatic = url.pathname.startsWith("/_next/static/");
  const publicAsset = !url.search && (isShell || isStatic);
  if (publicAsset) {
    e.respondWith(publicCacheFirst(e.request));
    return;
  }

  // Không cache HTML/RSC, ảnh tối ưu động hoặc URL ký. Chỉ navigation lỗi mạng mới dùng
  // shell vô danh; 401/403/5xx từ server được trả nguyên trạng, không thay bằng cache 200.
  const network = fetch(e.request, { cache: "no-store" });
  e.respondWith(e.request.mode === "navigate" ? network.catch(offlineShell) : network);
});
