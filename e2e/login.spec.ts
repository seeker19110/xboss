import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Smoke + a11y cho trang công khai quan trọng nhất (/login).
// Chạy trên cả desktop lẫn mobile (xem playwright.config.ts), không cần CSDL.
test.describe("Trang đăng nhập", () => {
  test("trả header bảo mật và tắt XSS Auditor cũ", async ({ request }) => {
    const response = await request.get("/login");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["x-xss-protection"]).toBe("0");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("hiển thị đủ form đăng nhập", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /XBoss/ })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();
    // Bản production không gợi ý tài khoản demo hoặc điền sẵn thông tin sai của người dùng.
    await expect(page.getByLabel("Email đăng nhập", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveValue("");
    await expect(page.getByText("Tài khoản mặc định", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("Email đăng nhập", { exact: true })).toHaveAttribute(
      "autoComplete",
      "username",
    );
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute(
      "autoComplete",
      "current-password",
    );
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Cổng khởi đầu: chặn mức serious/critical; mức minor để dọn dần.
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
