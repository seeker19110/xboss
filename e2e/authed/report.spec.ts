import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Báo cáo in-friendly (/report) — window.print() → PDF, chỉ đọc.

async function gotoReport(page: Page) {
  await page.goto("/report");
  await expect(page.getByText("BÁO CÁO TIẾN ĐỘ THI CÔNG ACMV")).toBeVisible({ timeout: 15_000 });
}

test.describe("Báo cáo in-friendly (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoReport(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoReport(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
