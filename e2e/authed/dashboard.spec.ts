import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Dashboard ("/") — landing sau đăng nhập, hiển thị global chrome (header/footer).
// Đây là trang sau-auth ĐẦU TIÊN được phủ axe (audit a11y §5). Dùng storageState từ project `setup`.
test.describe("Dashboard (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Tổng quan tiến độ/ })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Tổng quan tiến độ/ })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Cùng cổng như /login: chặn serious/critical (gồm color-contrast), minor để dọn dần.
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
