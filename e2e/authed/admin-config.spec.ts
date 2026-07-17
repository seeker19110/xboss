import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Nhóm trang cấu hình hệ thống dưới /admin/* (M46-M52) — chỉ Admin/PM tuỳ trang, đăng nhập
// admin qua storageState. Mỗi trang: goto → chờ nội dung chính (AppHeader title) → axe.
// Bổ sung sau đợt audit 2026-07-17 (docs/audit.md §5 coi spec axe cho trang mới là cổng
// merge bắt buộc — các trang dưới đã lọt merge mà chưa có spec riêng).

async function checkAxeNoSerious(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("Trang cấu hình /admin/* (sau đăng nhập)", () => {
  test("/admin/permissions — tab Ma trận quyền không vi phạm a11y nghiêm trọng (axe)", async ({
    page,
  }) => {
    await page.goto("/admin/permissions");
    await expect(page.locator("header").getByText("Phân quyền", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Ma trận quyền" })).toBeVisible();
    await checkAxeNoSerious(page);
  });

  test("/admin/permissions — tab Báo cáo SoD không vi phạm a11y nghiêm trọng (axe)", async ({
    page,
  }) => {
    await page.goto("/admin/permissions");
    const sodTab = page.getByRole("button", { name: "Báo cáo SoD" });
    await expect(sodTab).toBeVisible({ timeout: 15_000 });
    await sodTab.click();
    await checkAxeNoSerious(page);
  });

  test("/admin/features không vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/admin/features");
    await expect(page.locator("header").getByText("Cờ tính năng", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkAxeNoSerious(page);
  });

  test("/admin/code-lists không vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/admin/code-lists");
    await expect(page.locator("header").getByText("Danh mục mềm", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkAxeNoSerious(page);
  });

  test("/admin/alert-rules không vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/admin/alert-rules");
    await expect(page.locator("header").getByText("Ngưỡng cảnh báo", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkAxeNoSerious(page);
  });

  test("/admin/approval-flows không vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/admin/approval-flows");
    await expect(page.locator("header").getByText("Cấu hình duyệt", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkAxeNoSerious(page);
  });

  test("/admin/audit-log không vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/admin/audit-log");
    await expect(page.locator("header").getByText("Audit trail", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkAxeNoSerious(page);
  });

  test("/admin/custom-fields không vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/admin/custom-fields");
    await expect(page.locator("header").getByText("Trường tuỳ biến", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkAxeNoSerious(page);
  });
});
