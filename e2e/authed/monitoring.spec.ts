import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Quan hệ & Quan trắc (/monitoring, M26) — mốc quan trắc lún/chuyển vị/nghiêng +
// khiếu nại cộng đồng (Admin/PM/kỹ sư). Seed mẫu chưa có dữ liệu nên trang hiện
// EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoMonitoring(page: Page) {
  await page.goto("/monitoring");
  await expect(
    page.locator("header").getByText("Quan hệ & Quan trắc", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Quan hệ & Quan trắc (sau đăng nhập)", () => {
  test("render KPI strip + 2 tab", async ({ page }) => {
    await gotoMonitoring(page);
    await expect(page.getByText("Mốc mức báo động", { exact: false })).toBeVisible();
    await expect(page.getByText("Mốc mức cảnh báo", { exact: false })).toBeVisible();
    await expect(page.getByText("Khiếu nại đang xử lý", { exact: false })).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm quan hệ & quan trắc" });
    await expect(tablist.getByRole("tab", { name: /Quan trắc/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Cộng đồng/ })).toBeVisible();
  });

  test("mở modal thêm mốc quan trắc", async ({ page }) => {
    await gotoMonitoring(page);
    await page.getByRole("button", { name: "Thêm mốc" }).click();
    await expect(page.getByRole("heading", { name: "Thêm mốc quan trắc" })).toBeVisible();
    await expect(page.getByLabel("Mã mốc")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Cộng đồng, mở modal thêm khiếu nại", async ({ page }) => {
    await gotoMonitoring(page);
    await page.getByRole("tab", { name: /Cộng đồng/ }).click();
    await page.getByRole("button", { name: "Thêm khiếu nại" }).click();
    await expect(page.getByRole("heading", { name: "Thêm khiếu nại" })).toBeVisible();
    await expect(page.getByLabel("Tiêu đề")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMonitoring(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
