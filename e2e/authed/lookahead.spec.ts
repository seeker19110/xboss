import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Lookahead (/lookahead) — kế hoạch in 7/14/21 ngày tới, chỉ đọc.

async function gotoLookahead(page: Page) {
  await page.goto("/lookahead");
  await expect(page.getByText("NGÀY TỚI", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Lookahead (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoLookahead(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoLookahead(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
