// Service worker XBoss — network-first cho trang, stale-while-revalidate cho API GET,
// cache-first cho asset tĩnh.
// Mất mạng (hầm, tầng kỹ thuật) vẫn xem được dữ liệu tracking đã tải lần cuối.
// App Shell: precache /offline + asset tĩnh cốt lõi lúc cài đặt (M0) — trang HTML chưa
// từng ghé mà mất mạng hoàn toàn sẽ thấy /offline thay vì lỗi mạng mặc định của trình duyệt.
const CACHE = "xboss-v11";
const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // Từng URL tự bắt lỗi riêng — 1 asset lỗi (vd cài đặt lần đầu cũng đang mất mạng)
  // không được làm hỏng toàn bộ cài đặt SW (khác `cache.addAll` vốn atomic).
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})))),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Web Push: hiện notification hệ thống khi server đẩy (kể cả khi app không mở).
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

// Logout: xóa tất cả cache API để user khác không thấy dữ liệu của phiên cũ (tablet chia sẻ).
self.addEventListener("message", (e) => {
  if (e.data?.type === "CLEAR_CACHE") {
    e.waitUntil(
      caches
        .open(CACHE)
        .then((cache) =>
          cache
            .keys()
            .then((keys) =>
              Promise.all(
                keys
                  .filter((r) => new URL(r.url).pathname.startsWith("/api/"))
                  .map((r) => cache.delete(r)),
              ),
            ),
        ),
    );
  }
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // API GET → stale-while-revalidate: trả cache ngay nếu có, cập nhật ngầm từ mạng.
  // Mất mạng hoàn toàn → trả bản cache gần nhất.
  // Trừ: ảnh/tài liệu (cache riêng bởi browser), SSE /api/events (stream), và /api/health
  // (uptime monitor cần kết quả ping DB thật mỗi lần, không phải bản cache cũ).
  if (url.pathname.startsWith("/api/")) {
    if (
      url.pathname.startsWith("/api/photos/") ||
      url.pathname.startsWith("/api/documents/") ||
      url.pathname.startsWith("/api/events") ||
      url.pathname.startsWith("/api/health")
    )
      return;
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          const networkFetch = fetch(e.request)
            .then((res) => {
              if (res.ok) cache.put(e.request, res.clone());
              return res;
            })
            .catch(() => cached ?? Response.error());
          // Có cache → trả ngay + cập nhật ngầm; không có cache → chờ mạng
          return cached ?? networkFetch;
        }),
      ),
    );
    return;
  }

  // Asset build của Next (immutable) → cache-first.
  // Chỉ dùng/cache response tốt: lúc deploy chunk cũ có thể trả 404/500 (text/plain),
  // nếu cache bản lỗi thì trang hỏng vĩnh viễn (ChunkLoadError) tới khi xoá site data.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit && hit.ok) return hit;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // Trang HTML → network-first, offline thì dùng bản cache gần nhất; chưa từng ghé
  // (không có trong cache) thì rơi về trang App Shell /offline đã precache lúc cài đặt.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match("/offline"))),
  );
});
