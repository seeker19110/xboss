// Service worker XBoss — network-first cho trang + API GET, cache-first cho asset tĩnh.
// Mất mạng (hầm, tầng kỹ thuật) vẫn xem được dữ liệu tracking đã tải lần cuối.
const CACHE = "xboss-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // API GET → network-first, mất mạng thì trả bản cache gần nhất (trừ ảnh — nặng, không cache).
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/photos/")) return;
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? Response.error()))
    );
    return;
  }

  // Asset build của Next (immutable) → cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  // Trang HTML → network-first, offline thì dùng bản cache gần nhất.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
