"use client";

// Đọc màu từ bảng token CSS của theme đang bật (app/globals.css) để dùng ở nơi KHÔNG nhận
// được `var(--…)`: canvas 2D (`ctx.strokeStyle`), thư viện vẽ nhận chuỗi màu thuần…
//
// Vì sao cần (nợ kỹ thuật đợt audit 2026-09-05): các trang engineering hardcode mã hex tối
// (#27272a, #ffffff…) thẳng vào canvas. Ở theme sáng, nét vẽ và nhãn gần như biến mất trên
// nền trắng — mà `npm run check:contrast` không đọc được màu nằm trong lời gọi canvas nên
// CI không bắt được. SVG/recharts thì dùng thẳng `var(--color-…)` như SCurveChart, không cần
// hàm này.

/** Đọc 1 biến CSS trên :root. `duPhong` dùng khi chạy ngoài trình duyệt (SSR/test). */
export function mauToken(ten: string, duPhong = "#71717a"): string {
  if (typeof window === "undefined") return duPhong;
  const v = getComputedStyle(document.documentElement).getPropertyValue(ten).trim();
  return v || duPhong;
}

/** Đọc nhiều token một lượt — gọi 1 lần mỗi lần vẽ, không gọi trong vòng lặp vẽ. */
export function bangMau<K extends string>(ten: Record<K, string>): Record<K, string> {
  const kq = {} as Record<K, string>;
  for (const k of Object.keys(ten) as K[]) kq[k] = mauToken(ten[k]);
  return kq;
}
