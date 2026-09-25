// QUALITY-FINAL-1 / S04: chỉ cache shell công khai và asset tĩnh.
// API, HTML cá nhân hóa, RSC và export luôn qua mạng; offline vault là slice riêng.
const CACHE = "xboss-public-v20";
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
const isOwnedCache = (name) => /^xboss-(?:public-)?v\d+$/.test(name);

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

  // Bao phủ cả API tương lai: không cần nhớ thêm từng path vào denylist.
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    e.request.headers.has("authorization")
  ) {
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
