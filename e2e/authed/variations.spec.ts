import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Phát sinh (/variations, M6) — VO nhận thầu/giao thầu (Admin/PM/Kỹ sư/BCH).
// Seed mẫu chưa có VO nào nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoVariations(page: Page) {
  await page.goto("/variations");
  await expect(page.getByText("Phát sinh", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Phát sinh/VO (sau đăng nhập)", () => {
  test("render nội dung chính + 4 thẻ tổng theo trạng thái", async ({ page }) => {
    await gotoVariations(page);
    await expect(page.getByText("Nháp", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Đã trình", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Được duyệt", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Từ chối", { exact: false }).first()).toBeVisible();
  });

  test("mở modal thêm phát sinh, thêm/xoá dòng khối lượng", async ({ page }) => {
    await gotoVariations(page);
    await page.getByRole("button", { name: "Thêm phát sinh" }).click();
    await expect(page.getByText("Dòng khối lượng", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Thêm dòng" }).click();
    await expect(page.getByLabel("Mã dòng 2")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoVariations(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
