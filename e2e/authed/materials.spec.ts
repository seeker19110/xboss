import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /materials — quản lý vật tư (tab Định Mức BOQ mặc định + thanh công cụ dày nút).
// Seed mẫu không tạo materials nên bảng hiện empty state, nhưng chrome/tabs/toolbar
// (nhiều nút, select, cột) vẫn render — nơi thường có lỗi a11y (nút icon-only, tương phản).

async function gotoMaterials(page: Page) {
  await page.goto("/materials");
  // Tab "Định Mức BOQ" render khi trang đã nạp xong.
  await expect(page.getByRole("button", { name: /Định Mức BOQ/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("Vật tư (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoMaterials(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMaterials(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("tab Yêu cầu mua (đề nghị vật tư) không có vi phạm a11y nghiêm trọng (axe)", async ({
    page,
  }) => {
    await gotoMaterials(page);
    await page.getByRole("button", { name: /Yêu cầu mua/ }).click();
    // Tab đề nghị vật tư active (border emerald) → nội dung tab đã render.
    await expect(page.getByRole("button", { name: /Yêu cầu mua/ })).toHaveClass(
      /border-emerald-500/,
    );

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
