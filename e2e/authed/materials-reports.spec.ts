import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Báo cáo vật tư (/materials/reports) — tổng quan kho, dự báo, tồn lâu, tiêu hao theo tầng.

async function gotoMaterialsReports(page: Page) {
  await page.goto("/materials/reports");
  await expect(page.getByRole("heading", { name: "Báo cáo vật tư" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Báo cáo vật tư (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoMaterialsReports(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMaterialsReports(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
