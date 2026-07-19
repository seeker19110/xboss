import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Báo cáo (/reports) — danh sách báo cáo đã lưu, tạo mới, chạy truy vấn,
// xuất Excel. Khác với /report (báo cáo in-friendly).

async function gotoReports(page: Page) {
  await page.goto("/reports");
  // Tiêu đề trang và danh sách báo cáo hoặc empty state render khi API đã về.
  await expect(
    page
      .getByRole("heading", { level: 1 })
      .filter({ hasText: /Báo cáo|Truy vấn/ })
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Báo cáo (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoReports(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoReports(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
