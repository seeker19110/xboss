import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Gantt (/gantt) — biểu đồ Gantt chỉ đọc + filter hệ + toggle chế độ sửa phụ thuộc.

async function gotoGantt(page: Page) {
  await page.goto("/gantt");
  await expect(page.getByLabel("Lọc theo hệ")).toBeVisible({ timeout: 15_000 });
}

test.describe("Gantt (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoGantt(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoGantt(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
