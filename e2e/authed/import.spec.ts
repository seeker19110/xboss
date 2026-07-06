import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Import Excel WBS (/import, Admin/PM) — upload file tracking gốc, preview trước khi ghi.

async function gotoImport(page: Page) {
  await page.goto("/import");
  await expect(page.getByRole("heading", { name: "Import Excel" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Import Excel WBS (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoImport(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoImport(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
