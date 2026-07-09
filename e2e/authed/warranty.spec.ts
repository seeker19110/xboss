import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Bảo hành – Bảo trì (/warranty, M30) — danh mục hạng mục bảo hành theo hệ, claim
// lỗi sau bàn giao, thư viện tài liệu O&M. Seed mẫu chưa có dữ liệu nên trang hiện
// EmptyState ở mọi tab — vẫn đủ để phủ layout + a11y.

async function gotoWarranty(page: Page) {
  await page.goto("/warranty");
  await expect(page.getByText("Bảo hành – Bảo trì", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Bảo hành – Bảo trì (sau đăng nhập)", () => {
  test("render KPI strip + 3 tab", async ({ page }) => {
    await gotoWarranty(page);
    await expect(page.getByText(/Sắp hết bảo hành/)).toBeVisible();
    await expect(page.getByText(/Claim đang xử lý/)).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm bảo hành & bảo trì" });
    await expect(tablist.getByRole("tab", { name: /Bảo hành/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Claim/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /O&M/ })).toBeVisible();
  });

  test("mở modal thêm hạng mục bảo hành", async ({ page }) => {
    await gotoWarranty(page);
    await page.getByRole("button", { name: "Thêm hạng mục" }).click();
    await expect(page.getByRole("heading", { name: "Thêm hạng mục bảo hành" })).toBeVisible();
    await expect(page.getByLabel("Tên hạng mục")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Claim, mở modal thêm claim", async ({ page }) => {
    await gotoWarranty(page);
    await page.getByRole("tab", { name: /Claim/ }).click();
    await expect(page.getByText("Chưa có claim bảo hành", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Thêm claim" }).click();
    await expect(page.getByRole("heading", { name: "Thêm claim bảo hành" })).toBeVisible();
    await expect(page.getByLabel("Mô tả lỗi")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab O&M — hiện EmptyState, mở modal thêm tài liệu", async ({ page }) => {
    await gotoWarranty(page);
    await page.getByRole("tab", { name: /O&M/ }).click();
    await expect(page.getByText("Chưa có tài liệu O&M", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Thêm tài liệu" }).click();
    await expect(page.getByRole("heading", { name: "Thêm tài liệu O&M" })).toBeVisible();
    await expect(page.getByLabel("Tên tài liệu")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoWarranty(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
