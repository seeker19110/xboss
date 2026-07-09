import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Bàn giao & Kết thúc (/handover, M29) — T&C/commissioning, nghiệm thu bàn giao,
// punch list, demob, bài học kinh nghiệm. Seed mẫu chưa có dữ liệu nên trang hiện
// EmptyState ở mọi tab — vẫn đủ để phủ layout + a11y.

async function gotoHandover(page: Page) {
  await page.goto("/handover");
  await expect(page.getByText("Bàn giao & Kết thúc", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Bàn giao & Kết thúc (sau đăng nhập)", () => {
  test("render KPI strip + 5 tab", async ({ page }) => {
    await gotoHandover(page);
    await expect(page.getByText(/Bàn giao \(/)).toBeVisible();
    await expect(page.getByText(/Punch mở/)).toBeVisible();
    await expect(page.getByText(/T&C đạt/)).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm bàn giao & kết thúc" });
    await expect(tablist.getByRole("tab", { name: /T&C/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Nghiệm thu bàn giao/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Punch list/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Demob/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Bài học/ })).toBeVisible();
  });

  test("mở modal thêm hệ thống T&C", async ({ page }) => {
    await gotoHandover(page);
    await page.getByRole("button", { name: "Thêm hệ thống" }).click();
    await expect(page.getByRole("heading", { name: "Thêm hệ thống T&C" })).toBeVisible();
    await expect(page.getByLabel("Tên hệ thống")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Punch list, mở modal thêm tồn tại", async ({ page }) => {
    await gotoHandover(page);
    await page.getByRole("tab", { name: /Punch list/ }).click();
    await page.getByRole("button", { name: "Thêm tồn tại" }).click();
    await expect(page.getByRole("heading", { name: "Thêm tồn tại" })).toBeVisible();
    await expect(page.getByLabel("Mô tả tồn tại")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Demob và Bài học — hiện EmptyState đúng chỗ", async ({ page }) => {
    await gotoHandover(page);
    await page.getByRole("tab", { name: /Demob/ }).click();
    await expect(page.getByText("Chưa có hạng mục giải thể", { exact: false })).toBeVisible();

    await page.getByRole("tab", { name: /Bài học/ }).click();
    await expect(page.getByText("Chưa có bài học kinh nghiệm", { exact: false })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoHandover(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
