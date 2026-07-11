import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Khởi động & Pháp lý (/kickoff, M23) — hồ sơ pháp lý + checklist huy động
// (Admin/PM). Seed mẫu chưa có dữ liệu nên trang hiện EmptyState — vẫn đủ để phủ
// layout + a11y.

async function gotoKickoff(page: Page) {
  await page.goto("/kickoff");
  await expect(
    page.locator("header").getByText("Khởi động & Pháp lý", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Khởi động & Pháp lý (sau đăng nhập)", () => {
  test("render KPI strip + 5 tab", async ({ page }) => {
    await gotoKickoff(page);
    await expect(page.getByText("Sẵn sàng huy động", { exact: false })).toBeVisible();
    await expect(page.getByText("Giấy phép sắp/đã hết hạn", { exact: false })).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm khởi động & pháp lý" });
    await expect(tablist.getByRole("tab", { name: /Pháp lý/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Bàn giao mặt bằng/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Khảo sát/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Trắc đạc/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Huy động/ })).toBeVisible();
  });

  test("mở modal thêm hồ sơ pháp lý", async ({ page }) => {
    await gotoKickoff(page);
    await page.getByRole("button", { name: "Thêm hồ sơ" }).click();
    await expect(page.getByText("Thêm hồ sơ pháp lý", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Loại")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Huy động, mở modal thêm hạng mục", async ({ page }) => {
    await gotoKickoff(page);
    await page.getByRole("tab", { name: /Huy động/ }).click();
    await page.getByRole("button", { name: "Thêm hạng mục" }).click();
    await expect(page.getByRole("heading", { name: "Thêm hạng mục" })).toBeVisible();
    await expect(page.getByLabel("Tên hạng mục")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoKickoff(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
