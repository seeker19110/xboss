import { test, expect } from "@playwright/test";

// Modal nền tảng (app/components/dialogs.tsx) phải có tên truy cập: role="dialog" nằm trên
// panel và có aria-labelledby (tới tiêu đề) hoặc aria-label — trình đọc màn hình đọc đúng tên hộp thoại.
test.describe("Modal có tên truy cập (sau đăng nhập)", () => {
  test("modal thêm bảo hiểm/bảo lãnh: tên lấy từ tiêu đề h2", async ({ page }) => {
    await page.goto("/insurance");
    const nut = page.getByRole("button", { name: "Thêm bảo hiểm/bảo lãnh" });
    await expect(nut).toBeVisible({ timeout: 15_000 });
    await nut.click();
    await expect(page.getByRole("dialog", { name: "Thêm bảo hiểm/bảo lãnh" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("modal tạo biên bản họp: tên lấy từ tiêu đề", async ({ page }) => {
    await page.goto("/meetings");
    const nut = page.getByRole("button", { name: "Tạo biên bản họp" });
    await expect(nut).toBeVisible({ timeout: 15_000 });
    await nut.click();
    await expect(page.getByRole("dialog", { name: /Biên bản họp mới/ })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
