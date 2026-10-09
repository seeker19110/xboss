import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Thanh toán (/payments) — bảng giá trị HĐ + tiến độ theo tầng × hệ, nhóm theo người
// phụ trách (audit a11y §4). Floor rows dựng từ work_packages nên seed mẫu render đủ
// (giá trị HĐ = 0 → "—", không cần floor_contracts/payment_bills).

async function gotoPayments(page: Page) {
  await page.goto("/payments");
  // Qua PageSkeleton: thẻ KPI "Tổng giá trị HĐ" chỉ render khi dữ liệu payments đã về
  // (title trong AppHeader bị ẩn trên mobile nên không dùng làm mốc chung được).
  await expect(page.getByText("Tổng giá trị HĐ").first()).toBeVisible({ timeout: 15_000 });
}

test.describe("Thanh toán (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoPayments(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPayments(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Cùng cổng như Dashboard/tracking: chặn serious/critical (gồm color-contrast).
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("chế độ Người phụ trách: mở chi tiết hệ — nút mở có tên + aria-expanded, axe sạch", async ({
    page,
  }) => {
    await gotoPayments(page);
    const nutCheDo = page.getByRole("button", { name: "Người phụ trách" });
    await nutCheDo.click();
    await expect(nutCheDo).toHaveAttribute("aria-pressed", "true");

    const nutMo = page.getByRole("button", { name: /^Mở chi tiết từng tầng của hệ/ }).first();
    await expect(nutMo).toBeVisible();
    await expect(nutMo).toHaveAttribute("aria-expanded", "false");
    await nutMo.click();
    await expect(
      page.getByRole("button", { name: /^Thu gọn chi tiết từng tầng của hệ/ }).first(),
    ).toHaveAttribute("aria-expanded", "true");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
