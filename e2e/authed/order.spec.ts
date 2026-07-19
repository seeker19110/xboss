import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đặt hàng (/order) — quản lý đơn đặt hàng vật tư (tạo/sửa/xem chi tiết).

async function gotoOrder(page: Page) {
  await page.goto("/order");
  // Tiêu đề trang và bảng danh sách đơn hàng render khi API đã về.
  // Nếu empty state thì hiện EmptyState.
  await expect(
    page
      .getByRole("heading", { level: 1 })
      .filter({ hasText: /Đơn đặt hàng|Yêu cầu mua sắm/ })
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đơn đặt hàng (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoOrder(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoOrder(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
