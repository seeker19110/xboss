import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Bảo hiểm & Bảo lãnh (/insurance, M28) — sổ theo dõi bảo hiểm (CAR/TNBT/tai nạn
// LĐ) + bảo lãnh (thực hiện/tạm ứng/bảo hành), gắn hợp đồng (nullable). Seed mẫu chưa có
// dữ liệu nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoInsurance(page: Page) {
  await page.goto("/insurance");
  await expect(page.getByText("Bảo hiểm & Bảo lãnh", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Bảo hiểm & Bảo lãnh (sau đăng nhập)", () => {
  test("render KPI strip + bộ lọc loại", async ({ page }) => {
    await gotoInsurance(page);
    await expect(page.getByText("Sắp/đã hết hiệu lực", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Tổng giá trị bảo lãnh đang hiệu lực", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Lọc theo loại")).toBeVisible();
  });

  test("mở modal thêm bảo hiểm/bảo lãnh", async ({ page }) => {
    await gotoInsurance(page);
    await page.getByRole("button", { name: "Thêm bảo hiểm/bảo lãnh" }).click();
    const dialog = page.getByRole("dialog");
    await expect(page.getByRole("heading", { name: "Thêm bảo hiểm/bảo lãnh" })).toBeVisible();
    await expect(dialog.getByLabel("Loại")).toBeVisible();
    await expect(dialog.getByLabel("Hợp đồng gắn")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoInsurance(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
