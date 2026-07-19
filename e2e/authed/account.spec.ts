import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Tài khoản (/account) — cài đặt hồ sơ user (tên, email, avatar, ngôn ngữ).

async function gotoAccount(page: Page) {
  await page.goto("/account");
  // Tiêu đề trang hiển thị trong AppHeader dạng <span>, không phải heading —
  // các nút cài đặt chỉ render khi /api/account đã về.
  await expect(page.getByRole("button").filter({ hasText: "Lưu thay đổi" }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Tài khoản (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoAccount(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAccount(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
