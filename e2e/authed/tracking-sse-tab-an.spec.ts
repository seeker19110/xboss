import { test, expect } from "@playwright/test";

// Lưới tracking: tab ẩn → đóng SSE /api/events (không giữ stream + truy vấn watermark 3s/lần
// trên server cho tab nền); tab hiện lại → mở lại SSE. Theo dõi EventSource qua init script
// bọc constructor, giả lập ẩn/hiện bằng cách ghi đè document.hidden + bắn visibilitychange.

test("đóng SSE khi tab ẩn, mở lại khi tab hiện", async ({ page }) => {
  await page.addInitScript(() => {
    const Goc = window.EventSource;
    const ds: EventSource[] = [];
    (window as unknown as { __es: EventSource[] }).__es = ds;
    window.EventSource = class extends Goc {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        ds.push(this);
      }
    } as typeof EventSource;
    let an = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => an });
    (window as unknown as { __datAn: (v: boolean) => void }).__datAn = (v: boolean) => {
      an = v;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });

  await page.goto("/tracking/ogtd");
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 15_000 });

  const trangThai = () =>
    page.evaluate(() => {
      const ds = (window as unknown as { __es: EventSource[] }).__es.filter((e) =>
        e.url.includes("/api/events"),
      );
      return { tong: ds.length, mo: ds.filter((e) => e.readyState !== 2).length };
    });

  await expect.poll(trangThai).toEqual({ tong: 1, mo: 1 });

  await page.evaluate(() => (window as unknown as { __datAn: (v: boolean) => void }).__datAn(true));
  await expect.poll(trangThai).toEqual({ tong: 1, mo: 0 });

  await page.evaluate(() =>
    (window as unknown as { __datAn: (v: boolean) => void }).__datAn(false),
  );
  await expect.poll(trangThai).toEqual({ tong: 2, mo: 1 });
});
