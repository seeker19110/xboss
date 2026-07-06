import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang HSE/An toàn (/hse, M11) — kiểm tra định kỳ/toolbox/sự cố/cận nguy/giấy phép.
// DB seed mẫu không có ghi nhận HSE nào nên trang render EmptyState — vẫn đủ để phủ
// layout, tạo mới, mở modal và a11y.

async function gotoHse(page: Page) {
  await page.goto("/hse");
  await expect(page.getByRole("tablist", { name: "Loại ghi nhận HSE" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("HSE / An toàn (sau đăng nhập)", () => {
  test("render thẻ thống kê + tab loại ghi nhận + trạng thái rỗng", async ({ page }) => {
    await gotoHse(page);
    await expect(page.getByText("Ngày không sự cố")).toBeVisible();
    await expect(page.getByText("Action đang mở")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Sự cố/ })).toBeVisible();
    await expect(page.getByText("Chưa có ghi nhận")).toBeVisible();
  });

  // Không bấm "Ghi nhận" (không ghi dữ liệu thật) — trang chia sẻ 1 DB test giữa các
  // project desktop/mobile chạy song song (cùng convention drawings.spec.ts).
  test("Admin mở được modal ghi nhận HSE", async ({ page }) => {
    await gotoHse(page);
    await page.getByRole("button", { name: "Ghi nhận HSE" }).click();
    await expect(page.getByRole("heading", { name: "Ghi nhận HSE" })).toBeVisible();
    await page.locator("label", { hasText: "Mô tả" }).locator("textarea").fill("Sự cố test E2E");
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoHse(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
