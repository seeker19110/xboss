import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Nhà cung cấp (/materials/suppliers) — danh sách nhà cung cấp vật tư,
// thông tin liên hệ, giá chào, trạng thái.

async function gotoSuppliers(page: Page) {
  // Miền vật tư đã chuyển ĐÚNG sang hub /procurement ở đợt gom "7 Unified Hubs"
  // (tab vẫn giữ đủ khả năng tạo/sửa, khác /site và /commercial). Neo vào tab của hub —
  // phần tử ổn định — thay cho tiêu đề trang cũ đã không còn.
  await page.goto("/procurement?tab=suppliers");
  // Danh sách hoặc empty state render khi API đã về.
  await expect(page.getByRole("tab", { name: /Nhà Cung Cấp/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Nhà cung cấp (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoSuppliers(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoSuppliers(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
