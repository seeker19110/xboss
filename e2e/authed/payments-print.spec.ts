import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang In hóa đơn thanh toán (/payments/print) — bản in-friendly các chứng chỉ
// thanh toán (PPC), kiến trúc bảng & định dạng chuyên cho window.print() → PDF.

async function gotoPaymentsPrint(page: Page) {
  await page.goto("/payments/print");
  // Bảng hóa đơn hoặc empty state render khi API đã về.
  // Kiểu bên trong thường ẩn nav/sidebar ở layout in, nhưng nội dung chính vẫn visible.
  await expect(page.getByRole("main")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("In hóa đơn thanh toán (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoPaymentsPrint(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPaymentsPrint(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
