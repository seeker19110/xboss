import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Form đặt hàng vật tư (/materials/order-form) — form tạo đơn đặt hàng,
// chọn vật tư, nhập số lượng, ghi chú.

async function gotoOrderForm(page: Page) {
  await page.goto("/materials/order-form");
  // OrderContent component render với heading "Đơn đặt hàng" (không phải h1,
  // mà là <span> trong toolbar). Chờ text "Đơn đặt hàng" để xác nhận component đã load.
  await expect(page.getByText("Đơn đặt hàng", { exact: true })).toBeVisible({
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
