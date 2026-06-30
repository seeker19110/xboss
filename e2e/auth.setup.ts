import { test as setup, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PW, AUTH_FILE } from "./constants";

// Đăng nhập 1 lần bằng tài khoản admin rồi lưu cookie phiên (storageState).
// Mọi spec sau-auth (e2e/authed/**) tái dùng cookie này → không login lại từng test.
setup("đăng nhập admin → lưu storageState", async ({ page }) => {
  await page.goto("/login");

  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PW);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();

  // Đăng nhập thành công → app chuyển hướng về Dashboard "/".
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  // Chắc chắn không còn ở trang login (không còn nút đăng nhập).
  await expect(page.getByRole("button", { name: /Đăng nhập/ })).toHaveCount(0);

  await page.context().storageState({ path: AUTH_FILE });
});
