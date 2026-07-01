import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /my-tasks — công việc được giao + feed thông báo (audit a11y §4).
// Admin seed không được gán task nên segment "Công việc" hiện empty state, nhưng view
// vẫn render chrome + thẻ thống kê + segment/filter. Quét thêm segment "Thông báo"
// (admin fullAccess → feed toàn dự án, có dữ liệu từ seed) để phủ FeedTaskCard/SheetGroup.

async function gotoMyTasks(page: Page) {
  await page.goto("/my-tasks");
  // Qua PageSkeleton: thẻ thống kê "Đang làm" chỉ render khi /api/my-tasks đã về.
  await expect(page.getByText("Đang làm").first()).toBeVisible({ timeout: 15_000 });
}

async function analyzeSerious(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.describe("Công việc của tôi (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoMyTasks(page);
  });

  test("segment Công việc không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMyTasks(page);
    const serious = await analyzeSerious(page);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("segment Thông báo không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMyTasks(page);
    // Nút segment "Thông báo" (có chữ hiển thị) — phân biệt với chuông thông báo icon-only
    // trên header (cùng accessible name "Thông báo" nhưng không có text node).
    await page.getByRole("button", { name: "Thông báo" }).filter({ hasText: "Thông báo" }).click();
    // Chờ feed nạp xong: dòng tóm tắt "… hoạt động" / "Chưa có hoạt động" của tab mặc định.
    await expect(page.getByText(/hoạt động/).first()).toBeVisible({ timeout: 15_000 });
    const serious = await analyzeSerious(page);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
