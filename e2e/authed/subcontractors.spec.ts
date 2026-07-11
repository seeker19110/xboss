import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Nhà thầu phụ (/subcontractors, M33) — hồ sơ năng lực + đánh giá định kỳ + công
// nợ. DB seed mẫu (scripts/seed-sample.ts) không gán system_contractors nên danh
// sách rỗng — trang phải render EmptyState rõ ràng thay vì lỗi.

async function gotoSubcontractors(page: Page) {
  await page.goto("/subcontractors");
  await expect(page.getByText("Tổng công nợ còn lại")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Nhà thầu phụ (sau đăng nhập)", () => {
  test("vào được từ sidebar (không còn coming-soon) + KPI strip + trạng thái rỗng", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByRole("button", { name: "Mở menu" }).click();
    }
    // M37 PR 2.4: sidebar desktop (#app-sidebar) và drawer mobile (#app-sidebar-mobile,
    // mount có điều kiện khi mở) là 2 phần tử DOM khác nhau.
    const sidebar = page.locator(isMobile ? "#app-sidebar-mobile" : "#app-sidebar");
    const link = sidebar.getByRole("link", { name: "Nhà thầu phụ", exact: true });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();

    await expect(page).toHaveURL(/\/subcontractors$/);
    await expect(page.getByText("Tổng công nợ còn lại")).toBeVisible();
    await expect(page.getByText("Chưa có nhà thầu phụ")).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoSubcontractors(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
