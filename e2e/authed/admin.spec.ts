import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /admin — phân công người phụ trách (theo hệ/nhóm/task) + lịch sử audit + traffic
// (chỉ Admin/PM). Mật độ ứng viên contrast cao thứ 2 theo docs/a11y/contrast-audit.md §4 (23 chỗ).

async function gotoAdmin(page: Page) {
  await page.goto("/admin");
  // Tab "Phân công" (mặc định) chỉ có ý nghĩa render sau khi danh sách sheet/user đã tải xong.
  await expect(page.getByRole("button", { name: "Lịch sử" })).toBeVisible({ timeout: 15_000 });
}

test.describe("Quản trị (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoAdmin(page);
  });

  test("tab Phân công không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAdmin(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("tab Lịch sử không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAdmin(page);
    await page.getByRole("button", { name: "Lịch sử" }).click();
    await expect(page.getByRole("button", { name: "Lịch sử" })).toHaveClass(/bg-zinc-800/);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
