import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đơn đặt hàng / PO (/materials/purchase-orders) — stepper vòng đời PO, đánh giá NCC.

async function gotoPurchaseOrders(page: Page) {
  await page.goto("/materials/purchase-orders");
  await expect(page.getByRole("heading", { name: "Đơn đặt hàng (PO)" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đơn đặt hàng / PO (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoPurchaseOrders(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPurchaseOrders(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
