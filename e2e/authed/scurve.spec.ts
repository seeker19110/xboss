import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Đường cong S — biểu đồ tiến độ thực tế vs kế hoạch, so sánh theo baseline.
// Đã GỘP vào tab "Đường Cong S-Curve & EVM" của hub /schedule; route /scurve cũ chỉ còn
// chuyển hướng sang đây (audit 2026-08-25 §3.4).

async function gotoScurve(page: Page) {
  await page.goto("/schedule?tab=scurve");
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

  test("route /scurve cũ chuyển hướng sang tab S-Curve của /schedule", async ({ page }) => {
    await page.goto("/scurve");
    await expect(page).toHaveURL(/\/schedule\?tab=scurve/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 2 }).filter({ hasText: "S-curve" }).first(),
    ).toBeVisible({ timeout: 15_000 });
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
