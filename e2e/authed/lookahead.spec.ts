import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang "Kế hoạch ngắn hạn" (/lookahead) — bản IN nền sáng (bg-white), render từ task theo ngày.
// Quy tắc contrast tối không áp dụng (chữ tối trên nền trắng) — axe vẫn là trọng tài.

async function gotoLookahead(page: Page) {
  await page.goto("/lookahead");
  await expect(page.getByRole("button", { name: /In \/ Lưu PDF/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Lookahead (sau đăng nhập)", () => {
  test("render trang kế hoạch", async ({ page }) => {
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
