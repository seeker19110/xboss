import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Tài khoản (/account) — cài đặt hồ sơ user (avatar, email, liên kết quản trị, 2FA).

async function gotoAccount(page: Page) {
  await page.goto("/account");
  // Trang render TwoFactorSection khi /api/auth/totp đã về — chờ heading "Xác thực 2 lớp".
  await expect(page.getByRole("heading", { name: "Xác thực 2 lớp" })).toBeVisible({
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
