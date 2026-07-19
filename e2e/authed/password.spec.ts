import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đổi mật khẩu (/password) — form nhập mật khẩu cũ + mới (xác nhận).

async function gotoPassword(page: Page) {
  await page.goto("/password");
  // Form đổi mật khẩu render với nút Lưu và Reset.
  await expect(page.getByRole("button", { name: /Lưu|Cập nhật/ }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đổi mật khẩu (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoPassword(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPassword(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
