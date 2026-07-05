import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đấu thầu (/tenders, M7) — gói giao thầu phụ + so sánh báo giá (Admin/PM/Kỹ
// sư/BCH). Seed mẫu chưa có BOQ/gói thầu nào nên trang hiện EmptyState — vẫn đủ để
// phủ layout + a11y (giống contracts.spec.ts/variations.spec.ts/payment-certs.spec.ts).

async function gotoTenders(page: Page) {
  await page.goto("/tenders");
  await expect(page.getByText("Đấu thầu", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đấu thầu (sau đăng nhập)", () => {
  test("render nội dung chính (EmptyState khi chưa có gói thầu)", async ({ page }) => {
    await gotoTenders(page);
    await expect(page.getByText("Chưa có gói thầu nào", { exact: false })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoTenders(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
