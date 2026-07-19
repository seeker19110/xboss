import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Nhà cung cấp (/materials/suppliers) — danh sách nhà cung cấp vật tư,
// thông tin liên hệ, giá chào, trạng thái.

async function gotoSuppliers(page: Page) {
  await page.goto("/materials/suppliers");
  // Danh sách hoặc empty state render khi API đã về.
  await expect(
    page
      .getByRole("heading", { level: 1 })
      .filter({ hasText: /Nhà cung cấp|Suppliers/ })
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Nhà cung cấp (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoSuppliers(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoSuppliers(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
