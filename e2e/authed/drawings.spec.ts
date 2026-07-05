import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Bản vẽ (/drawings, M8 PR 2/3) — register shop/asbuilt/BIM/biện pháp thi công.
// Seed mẫu chưa có bản vẽ nào nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoDrawings(page: Page) {
  await page.goto("/drawings");
  await expect(page.getByText("Bản vẽ", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Bản vẽ (sau đăng nhập)", () => {
  test("render nội dung chính + bộ lọc", async ({ page }) => {
    await gotoDrawings(page);
    await expect(page.getByPlaceholder("Tìm mã / tên bản vẽ…")).toBeVisible();
    await expect(page.getByLabel("Lọc theo loại")).toBeVisible();
    await expect(page.getByLabel("Lọc theo trạng thái")).toBeVisible();
  });

  test("mở modal thêm bản vẽ, nhập thông tin", async ({ page }) => {
    await gotoDrawings(page);
    await page.getByRole("button", { name: "Thêm bản vẽ" }).click();
    await expect(page.getByText("Thêm bản vẽ", { exact: false }).first()).toBeVisible();
    await page.getByLabel("Số bản vẽ").fill("ACMV-SD-T05-001");
    await expect(page.getByRole("button", { name: "Tạo bản vẽ" })).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoDrawings(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
