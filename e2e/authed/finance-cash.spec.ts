import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Thu chi & Tạm ứng (/finance/cash, M27) — trang tài chính chưa có spec riêng (AUD-A11Y-001,
// audit 06/11/2026). Seed mẫu chưa có phiếu nên hai tab hiện EmptyState — đủ phủ layout + a11y.

async function gotoCash(page: Page, query = "") {
  await page.goto(`/finance/cash${query}`);
  await expect(page.getByRole("tablist", { name: "Thu chi và tạm ứng" })).toBeVisible({
    timeout: 15_000,
  });
}

async function khongViPhamNghiemTrong(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("Thu chi & Tạm ứng (sau đăng nhập)", () => {
  test("hai tab, nút quay lại Tài chính, admin thấy nút thêm phiếu", async ({ page }) => {
    await gotoCash(page);
    const tablist = page.getByRole("tablist", { name: "Thu chi và tạm ứng" });
    await expect(tablist.getByRole("tab", { name: /Sổ thu chi/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(tablist.getByRole("tab", { name: /Tạm ứng/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tài chính", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Thêm phiếu/ })).toBeVisible();
  });

  test("?tab=advances mở thẳng tab Tạm ứng", async ({ page }) => {
    await gotoCash(page, "?tab=advances");
    await expect(page.getByRole("tab", { name: /Tạm ứng/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("không có vi phạm a11y nghiêm trọng ở cả hai tab (axe)", async ({ page }) => {
    await gotoCash(page);
    await khongViPhamNghiemTrong(page);
    await page.getByRole("tab", { name: /Tạm ứng/ }).click();
    await expect(page).toHaveURL(/tab=advances/);
    await khongViPhamNghiemTrong(page);
  });
});
