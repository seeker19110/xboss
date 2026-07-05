import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Thanh toán khối lượng (/payment-certs, M17) — nghiệm thu KL theo đợt (IPC),
// Admin/PM/BCH. Seed mẫu chưa có hợp đồng nào nên trang hiện EmptyState — vẫn đủ
// để phủ layout + a11y (giống contracts.spec.ts/variations.spec.ts).

async function gotoPaymentCerts(page: Page) {
  await page.goto("/payment-certs");
  await expect(page.getByText("Thanh toán khối lượng", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Thanh toán khối lượng / IPC (sau đăng nhập)", () => {
  test("render nội dung chính (EmptyState khi chưa có hợp đồng)", async ({ page }) => {
    await gotoPaymentCerts(page);
    await expect(page.getByText("Chưa có hợp đồng nào", { exact: false })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPaymentCerts(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
