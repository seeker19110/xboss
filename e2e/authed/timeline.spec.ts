import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang "Timeline tầng" (/timeline) — dải thời gian task theo tầng. Render từ /api/timeline (seed).

async function gotoTimeline(page: Page) {
  await page.goto("/timeline");
  // Neo theo nội dung chính (bảng) — tiêu đề header bị truncate ~0 trên mobile hẹp nên không tin được.
  await expect(page.getByRole("region", { name: /Bảng timeline/ }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Timeline (sau đăng nhập)", () => {
  test("render timeline", async ({ page }) => {
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
