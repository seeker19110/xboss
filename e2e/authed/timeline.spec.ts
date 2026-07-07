import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Timeline tầng (/timeline) — bản đồ tiến độ theo tầng (ProgressMap), chỉ đọc.

async function gotoTimeline(page: Page) {
  await page.goto("/timeline");
  await expect(page.locator("header").getByText("Timeline tầng")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Timeline tầng (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoTimeline(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoTimeline(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
