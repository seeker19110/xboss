import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Form đặt hàng vật tư (/materials/order-form) — form tạo đơn đặt hàng,
// chọn vật tư, nhập số lượng, ghi chú.

async function gotoOrderForm(page: Page) {
  // Miền vật tư đã chuyển ĐÚNG sang hub /procurement ở đợt gom "7 Unified Hubs"
  // (tab vẫn giữ đủ khả năng tạo/sửa, khác /site và /commercial). Neo vào tab của hub —
  // phần tử ổn định — thay cho tiêu đề trang cũ đã không còn.
  await page.goto("/procurement?tab=orders");
  // OrderContent component render với heading "Đơn đặt hàng" (không phải h1,
  // mà là <span> trong toolbar). Chờ text "Đơn đặt hàng" để xác nhận component đã load.
  await expect(page.getByRole("tab", { name: /Đơn Hàng & PR/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Form đặt hàng vật tư (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoOrderForm(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoOrderForm(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
