import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Tài chính – Kế toán (/finance, M27) — dòng tiền, công nợ, hoá đơn & thuế VAT,
// lương công trường. Seed mẫu chưa có dữ liệu nên trang hiện EmptyState ở hầu hết tab —
// vẫn đủ để phủ layout + a11y.

async function gotoFinance(page: Page) {
  await page.goto("/finance");
  await expect(
    page.locator("header").getByText("Tài chính – Kế toán", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Tài chính – Kế toán (sau đăng nhập)", () => {
  test("render KPI strip + 4 tab", async ({ page }) => {
    await gotoFinance(page);
    await expect(page.getByText(/Tồn quỹ ước tính/)).toBeVisible();
    await expect(page.getByText(/Công nợ ròng/)).toBeVisible();
    await expect(page.getByText(/Tạm ứng chưa hoàn/)).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm tài chính" });
    await expect(tablist.getByRole("tab", { name: /Dòng tiền/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Công nợ/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Hoá đơn/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Lương/ })).toBeVisible();
  });

  test("chuyển tab Công nợ — hiện phải thu/phải trả + link chéo", async ({ page }) => {
    await gotoFinance(page);
    await page.getByRole("tab", { name: /Công nợ/ }).click();
    await expect(page.getByText("Phải thu (Chủ đầu tư)", { exact: false })).toBeVisible();
    await expect(page.getByText("Phải trả (NCC/NTP)", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Xem hợp đồng" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Xem đơn đặt hàng" })).toBeVisible();
  });

  test("chuyển tab Hoá đơn & thuế — mở modal thêm hoá đơn", async ({ page }) => {
    await gotoFinance(page);
    await page.getByRole("tab", { name: /Hoá đơn/ }).click();
    await expect(page.getByText(/VAT đầu vào/)).toBeVisible();
    await page.getByRole("button", { name: "Thêm hoá đơn" }).click();
    await expect(page.getByRole("heading", { name: "Thêm hoá đơn" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Lương — hiện EmptyState hoặc gợi ý chấm công", async ({ page }) => {
    await gotoFinance(page);
    await page.getByRole("tab", { name: /Lương/ }).click();
    await expect(
      page.getByText("Chưa có kỳ lương", { exact: false }).or(page.getByText(/Gợi ý từ chấm công/)),
    ).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoFinance(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
