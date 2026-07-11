import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang hệ /system/[code] (M15) — hub tổng quan theo hệ thi công. Seed mẫu gán cả 5 sheet
// ACMV vào hệ `acmv` (scripts/seed-sample.ts) nên trang này có dữ liệu thật để kiểm.

async function gotoAcmv(page: import("@playwright/test").Page) {
  await page.goto("/system/acmv");
  await expect(page.getByRole("heading", { name: "ACMV" })).toBeVisible({ timeout: 15_000 });
}

test.describe("Trang hệ /system/[code] (sau đăng nhập)", () => {
  test("điều hướng từ Dashboard vào trang hệ", async ({ page }) => {
    // Sidebar không còn mục "Hệ thi công" riêng (đã gộp vào nhóm "Tiến độ" trỏ
    // /progress/[system]) — đường vào /system/[code] còn lại là card "Theo hệ thi công"
    // trên Dashboard (app/page.tsx), DashboardHub và bảng Chi phí.
    await page.goto("/");
    await page.locator('a[href="/system/acmv"]').first().click();
    await expect(page).toHaveURL(/\/system\/acmv$/);
    await expect(page.getByRole("heading", { name: "ACMV" })).toBeVisible({ timeout: 15_000 });
  });

  test("render KPI + danh sách sheet ở tab Tổng quan", async ({ page }) => {
    await gotoAcmv(page);
    // Scope vào KPI strip — sidebar (M21) cũng có dashboard "Tiến độ" trùng chuỗi.
    const kpi = page.getByLabel("Chỉ số KPI của hệ");
    await expect(kpi.getByText("Tiến độ", { exact: true })).toBeVisible();
    await expect(page.getByText("Task trễ")).toBeVisible();
    await expect(page.getByText("Chờ nghiệm thu")).toBeVisible();
    // 5 sheet ACMV gốc từ seed mẫu.
    await expect(page.getByText("Ống gió trục đứng")).toBeVisible();
    await expect(page.getByText("Ống đồng nước ngưng Zone 2")).toBeVisible();
  });

  test("chuyển tab Tracking hiện danh sách sheet dạng hàng", async ({ page }) => {
    await gotoAcmv(page);
    await page.getByRole("tab", { name: "Tracking" }).click();
    await expect(page.getByRole("link", { name: /Ống gió trục đứng/ })).toBeVisible();
  });

  test("hệ không tồn tại → thông báo không tìm thấy", async ({ page }) => {
    await page.goto("/system/khong-ton-tai");
    await expect(page.getByText('Không tìm thấy hệ "khong-ton-tai".')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAcmv(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
