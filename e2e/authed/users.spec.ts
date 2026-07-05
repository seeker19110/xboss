import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /users — quản lý tài khoản (chỉ Admin): form tạo user + bảng danh sách
// (đổi vai trò, reset mật khẩu, xoá). Trang thuộc backlog a11y còn lại.

async function gotoUsers(page: Page) {
  await page.goto("/users");
  // Form tạo tài khoản render khi trang đã nạp xong.
  await expect(page.getByRole("button", { name: /^Tạo/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("Quản lý tài khoản (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoUsers(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoUsers(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
