import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// App Shell PWA (M0 — public/sw.js): trang /offline + precache lúc cài đặt service worker.
// Chạy trên cả desktop lẫn mobile, KHÔNG cần CSDL (giống login.spec.ts) — chỉ cần server
// production (`npm run start`, webServer của playwright.config.ts) để service worker đăng ký.
test.describe("Trang dự phòng ngoại tuyến (/offline)", () => {
  test("hiển thị đúng nội dung", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "Mất kết nối mạng" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("service worker precache app shell → trang chưa từng ghé vẫn hiện /offline khi mất mạng", async ({
    page,
  }) => {
    // Tải 1 trang bất kỳ để PwaRegister đăng ký service worker (chỉ chạy ở production —
    // webServer chạy `npm run start`, xem playwright.config.ts).
    await page.goto("/login");
    await page.waitForFunction(() => "serviceWorker" in navigator, undefined, { timeout: 15_000 });
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Chờ SW precache xong /offline lúc install (SHELL_URLS trong public/sw.js).
    await page.waitForFunction(() => caches.match("/offline").then((r) => !!r), undefined, {
      timeout: 15_000,
    });

    await page.context().setOffline(true);
    try {
      // Trang chưa từng được tải trong phiên này lẫn chưa có trong cache API/HTML.
      await page.goto("/my-tasks", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Mất kết nối mạng" })).toBeVisible();
    } finally {
      await page.context().setOffline(false);
    }
  });
});
