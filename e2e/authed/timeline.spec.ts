import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Bản đồ tiến độ theo tầng (ProgressMap), chỉ đọc. Đã GỘP vào khối "Bản Đồ Tiến Độ Theo
// Tầng & Hệ" trong tab "Lưới WBS & Kiểm Soát Trễ" của hub /schedule; route /timeline cũ
// chỉ còn chuyển hướng sang đây (audit 2026-08-25 §3.4).

async function gotoTimeline(page: Page) {
  await page.goto("/schedule?tab=wbs");
  await expect(page.getByText("Bản Đồ Tiến Độ Theo Tầng & Hệ")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Timeline tầng (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoTimeline(page);
  });

  test("route /timeline cũ chuyển hướng sang tab WBS của /schedule", async ({ page }) => {
    await page.goto("/timeline");
    await expect(page).toHaveURL(/\/schedule\?tab=wbs/, { timeout: 15_000 });
    await expect(page.getByText("Bản Đồ Tiến Độ Theo Tầng & Hệ")).toBeVisible({
      timeout: 15_000,
    });
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
