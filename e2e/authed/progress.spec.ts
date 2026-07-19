import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Tiến độ hệ (/progress/[system]) — trang tích hợp 7 khối tiến độ
// cho 1 hệ (S-curve, tiến độ bản đồ, KPI, dự báo, bảng task trễ, lookahead, timeline).
// Dữ liệu seed mẫu có hệ ACMV (code 'acmv').

async function gotoProgressSystem(page: Page, system: string = "acmv") {
  await page.goto(`/progress/${system}`);
  // Tiêu đề hệ (AppHeader) dùng <span>, không phải h1. Chờ h2 "Tổng quan tiến độ"
  // khi API summary đã về.
  await expect(
    page.getByRole("heading", { level: 2 }).filter({ hasText: "Tổng quan tiến độ" }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Tiến độ hệ (sau đăng nhập)", () => {
  test("render nội dung chính (hệ ACMV)", async ({ page }) => {
    await gotoProgressSystem(page, "acmv");
  });

  test("không có vi phạm a11y nghiêm trọng (axe) — hệ ACMV", async ({ page }) => {
    await gotoProgressSystem(page, "acmv");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
