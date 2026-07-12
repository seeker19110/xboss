import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cho phép deploy.sh build vào thư mục tạm rồi swap atomic vào ".next" thật —
  // tránh app đang chạy (đọc ".next" hiện tại) bị vỡ chunk giữa lúc build ghi đè.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pg", "better-sqlite3"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
  },
  async headers() {
    return [
      // Chunk JS/CSS build Next (tên file hash) — cache vĩnh viễn, immutable
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // Manifest + icons — cache 7 ngày (thay đổi khi deploy mới)
      {
        source: "/:file(manifest\\.webmanifest|icon.*\\.png|icon\\.svg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      // Service worker — không cache dài để SW mới được nhận ngay
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "media-src 'self' blob:",
              // Service worker + push notification
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Sourcemap upload cần SENTRY_AUTH_TOKEN (secret riêng org/project trên Sentry, người vận
// hành tự cấu hình khi cần) — tắt mặc định để `next build` không phụ thuộc secret đó.
// tunnelRoute: proxy request Sentry qua route Next.js cùng origin để trình chặn quảng cáo
// (uBlock/Adblock chặn domain *.sentry.io/*.ingest.*) không nuốt mất báo lỗi phía trình duyệt
// — không cần đổi CSP vì vẫn cùng origin ("connect-src 'self'" đã cho phép sẵn).
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  tunnelRoute: "/monitoring",
});
