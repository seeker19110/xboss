import type { MetadataRoute } from "next";

// App quản trị nội bộ sau đăng nhập — chỉ cho phép index 2 trang công khai không cần
// đăng nhập (/ và /login, trang / tự redirect về /login nếu chưa đăng nhập), chặn crawl
// toàn bộ trang nghiệp vụ còn lại. Dùng robots.txt (Disallow) thay vì <meta name="robots">
// toàn cục trong layout.tsx — thẻ meta áp cho MỌI trang (kể cả /login) từng làm Lighthouse
// CI fail category SEO (audit is-crawlable coi noindex là lỗi bất kể chủ đích), còn
// robots.txt chỉ ảnh hưởng các trang bị chặn, không đụng /login mà CI đang đo.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/$", "/login$"],
        disallow: "/",
      },
    ],
  };
}
