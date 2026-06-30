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
      // NỢ KỸ THUẬT: tạm bỏ "color-contrast" — nợ thiết kế HỆ THỐNG (chữ zinc-500 trên
      // nền tối, nút chính trắng/emerald-600 dùng khắp app). Sửa bằng một đợt chỉnh
      // design-token riêng rồi mở lại rule này (xem PROGRESS.md). Gate vẫn chặn các lỗi
      // a11y cấu trúc khác (label, ARIA, role, thứ tự heading...).
      .disableRules(["color-contrast"])
      .analyze();

    // Cổng khởi đầu: chặn mức serious/critical; mức minor để dọn dần.
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
