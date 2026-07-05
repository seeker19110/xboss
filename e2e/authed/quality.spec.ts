import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Chất lượng (/quality, M3 lõi) — checklist mẫu / kiểm tra / NCR.
// Seed mẫu chưa có checklist/inspection/NCR nào nên các tab render EmptyState — vẫn đủ
// để phủ layout + a11y + tương tác mở modal tạo mới.

async function gotoQuality(page: Page) {
  await page.goto("/quality");
  await expect(page.getByRole("tab", { name: "Kiểm tra" })).toBeVisible({ timeout: 15_000 });
}

test.describe("Chất lượng (sau đăng nhập)", () => {
  test("render 3 tab + chuyển tab", async ({ page }) => {
    await gotoQuality(page);
    await expect(page.getByText("Chưa có lần kiểm tra nào")).toBeVisible();

    await page.getByRole("tab", { name: "Checklist mẫu" }).click();
    await expect(page.getByText("Chưa có mẫu checklist nào")).toBeVisible();

    await page.getByRole("tab", { name: "NCR" }).click();
    await expect(page.getByText("Chưa có NCR nào")).toBeVisible();
  });

  test("Admin mở được modal thêm checklist", async ({ page }) => {
    await gotoQuality(page);
    await page.getByRole("tab", { name: "Checklist mẫu" }).click();
    await page.getByRole("button", { name: "Thêm checklist" }).click();
    await expect(page.getByText("Thêm hạng mục")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoQuality(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
