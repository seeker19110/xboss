import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đặt hàng (/order) — redirect tới /materials/order-form (quản lý đơn đặt hàng vật tư).

async function gotoOrder(page: Page) {
  // Miền vật tư đã chuyển ĐÚNG sang hub /procurement ở đợt gom "7 Unified Hubs"
  // (tab vẫn giữ đủ khả năng tạo/sửa, khác /site và /commercial). Neo vào tab của hub —
  // phần tử ổn định — thay cho tiêu đề trang cũ đã không còn.
  await page.goto("/procurement?tab=orders");
  // /order chuyển hướng sang /materials/order-form. Chờ heading "Đơn đặt hàng"
  // trong OrderContent component.
  await expect(page.getByRole("tab", { name: /Đơn Hàng & PR/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đơn đặt hàng (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoOrder(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoOrder(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
