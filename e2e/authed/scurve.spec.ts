import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đường cong S (/scurve) — biểu đồ tiến độ thực tế vs kế hoạch (S-curve),
// so sánh theo baseline. Chọn baseline từ dropdown.

async function gotoScurve(page: Page) {
  await page.goto("/scurve");
  // Biểu đồ S-curve render sau khi API /api/dashboard/scurve đã về.
  // SCurveChart component có h2 "S-curve: Kế hoạch vs Thực tế".
  await expect(
    page.getByRole("heading", { level: 2 }).filter({ hasText: "S-curve" }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đường cong S (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoScurve(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoScurve(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
