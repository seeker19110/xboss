import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Hợp đồng (/contracts, M16) — sổ hợp đồng nhận thầu/giao thầu/NCC (Admin/PM/BCH).
// Seed mẫu chưa có hợp đồng nào nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoContracts(page: Page) {
  await page.goto("/contracts");
  await expect(page.locator("header").getByText("Hợp đồng", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Hợp đồng (sau đăng nhập)", () => {
  test("render nội dung chính + 3 thẻ tổng theo loại", async ({ page }) => {
    await gotoContracts(page);
    await expect(page.getByText("Nhận thầu", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Giao thầu", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Nhà cung cấp", { exact: false }).first()).toBeVisible();
  });

  test("mở modal thêm hợp đồng, chuyển loại đổi form đối tác", async ({ page }) => {
    await gotoContracts(page);
    await page.getByRole("button", { name: "Thêm hợp đồng" }).click();
    await expect(page.getByText("Đối tác (NCC/thầu phụ)", { exact: false })).toBeVisible();
    await page.getByLabel("Loại").selectOption("nhan_thau");
    await expect(page.getByText("Tên CĐT / tổng thầu", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoContracts(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
