import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /boq (M1) — bảng khối lượng nhận thầu/giao thầu/thực hiện. Seed mẫu không tạo
// boq_items nên bảng hiện empty state, nhưng chrome/nút "Thêm dòng BOQ" vẫn render.

async function gotoBoq(page: import("@playwright/test").Page) {
  await page.goto("/boq");
  await expect(page.locator("header").getByText("BOQ", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("BOQ (sau đăng nhập)", () => {
  test("render empty state khi chưa có dòng BOQ", async ({ page }) => {
    await gotoBoq(page);
    await expect(page.getByText("Chưa có dòng BOQ nào")).toBeVisible();
  });

  test("Admin mở được modal thêm dòng BOQ", async ({ page }) => {
    await gotoBoq(page);
    await page.getByRole("button", { name: "Thêm dòng BOQ" }).click();
    await expect(page.getByRole("heading", { name: "Thêm dòng BOQ" })).toBeVisible();
    await page.getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Thêm dòng BOQ" })).not.toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoBoq(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("modal thêm dòng BOQ không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoBoq(page);
    await page.getByRole("button", { name: "Thêm dòng BOQ" }).click();
    await expect(page.getByRole("heading", { name: "Thêm dòng BOQ" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
