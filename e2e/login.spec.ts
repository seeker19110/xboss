import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Smoke + a11y cho trang công khai quan trọng nhất (/login).
// Chạy trên cả desktop lẫn mobile (xem playwright.config.ts), không cần CSDL.
test.describe("Trang đăng nhập", () => {
  test("hiển thị đủ form đăng nhập", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /XBoss/ })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Cổng khởi đầu: chặn mức serious/critical; mức minor để dọn dần.
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
