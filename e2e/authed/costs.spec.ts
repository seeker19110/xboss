import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Chi phí (/costs, M2) — bảng ngân sách/cam kết/thực chi theo hệ/tầng (Admin/PM/BCH).
// Seed mẫu không có boq_items/PO/payment_bills nên mọi ô hiển thị "—" — vẫn đủ để phủ layout + a11y.

async function gotoCosts(page: Page) {
  await page.goto("/costs");
  await expect(page.locator("header").getByText("Ngân sách", { exact: false }).first()).toBeVisible(
    {
      timeout: 15_000,
    },
  );
}

test.describe("Chi phí (sau đăng nhập)", () => {
  test("render nội dung chính + toggle hệ/tầng", async ({ page }) => {
    await gotoCosts(page);
    await expect(page.getByRole("button", { name: "Theo tầng" })).toBeVisible();
    await page.getByRole("button", { name: "Theo tầng" }).click();
    await expect(page.getByText("BOQ chưa có chiều tầng", { exact: false })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoCosts(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
