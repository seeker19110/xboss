import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đường găng & Chậm tiến độ (/schedule-control) — task trễ hạn,
// nguyên nhân trễ (Pareto), kế hoạch ngắn hạn (lookahead).

async function gotoScheduleControl(page: Page) {
  await page.goto("/schedule-control");
  // Tiêu đề trang (AppHeader) dùng <span>, không phải h1. Chờ h2 "Nguyên nhân trễ (Pareto)"
  // hoặc ScheduleControlPanel render.
  await expect(
    page.getByRole("heading", { level: 2 }).filter({ hasText: "Nguyên nhân trễ" }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đường găng & Chậm tiến độ (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoScheduleControl(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoScheduleControl(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
