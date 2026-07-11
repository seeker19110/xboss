import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Nhân sự (/personnel, M24) — danh sách nhân sự công trường + lọc tổ/nhà thầu +
// modal chi tiết/chứng chỉ. Seed mẫu chưa có nhân sự nào nên trang hiện EmptyState —
// vẫn đủ để phủ layout + a11y.

async function gotoPersonnel(page: Page) {
  await page.goto("/personnel");
  await expect(page.locator("header").getByText("Nhân sự", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Nhân sự (sau đăng nhập)", () => {
  test("render bộ lọc tổ đội/nhà thầu phụ + EmptyState chưa có nhân sự", async ({ page }) => {
    await gotoPersonnel(page);
    await expect(page.getByLabel("Lọc theo tổ đội")).toBeVisible();
    await expect(page.getByLabel("Lọc theo nhà thầu phụ")).toBeVisible();
    await expect(page.getByText("Chưa có nhân sự", { exact: false })).toBeVisible();
  });

  test("mở modal thêm nhân sự", async ({ page }) => {
    await gotoPersonnel(page);
    await page.getByRole("button", { name: "Thêm nhân sự" }).click();
    await expect(page.getByRole("heading", { name: "Thêm nhân sự" })).toBeVisible();
    await expect(page.getByLabel("Họ tên")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPersonnel(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
