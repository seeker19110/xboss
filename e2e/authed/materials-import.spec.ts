import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Import vật tư (/materials/import, Admin/PM) — upload Excel danh mục vật tư.

async function gotoMaterialsImport(page: Page) {
  await page.goto("/materials/import");
  await expect(
    page.locator("header").getByText("Import vật tư", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Import vật tư (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoMaterialsImport(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMaterialsImport(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
