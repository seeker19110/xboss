import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Môi trường & Giấy phép (/environment, M25) — hồ sơ MT/ĐTM/xả thải + quan trắc
// định kỳ (biểu đồ đường + ngưỡng) + chất thải (Admin/PM/kỹ sư). Seed mẫu chưa có dữ
// liệu nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoEnvironment(page: Page) {
  await page.goto("/environment");
  await expect(
    page.locator("header").getByText("Môi trường & Giấy phép", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Môi trường & Giấy phép (sau đăng nhập)", () => {
  test("render KPI strip + 4 tab", async ({ page }) => {
    await gotoEnvironment(page);
    await expect(page.getByText("Giấy phép sắp/đã hết hạn", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Chỉ tiêu vượt ngưỡng (kỳ gần nhất)", { exact: false }),
    ).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Nhóm môi trường & giấy phép" });
    await expect(tablist.getByRole("tab", { name: /Giấy phép/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Quan trắc/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Chất thải/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Báo cáo/ })).toBeVisible();
  });

  test("mở modal thêm hồ sơ môi trường", async ({ page }) => {
    await gotoEnvironment(page);
    await page.getByRole("button", { name: "Thêm hồ sơ" }).click();
    await expect(page.getByText("Thêm hồ sơ môi trường", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Loại")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Quan trắc, thấy khu vực biểu đồ + mở modal thêm kỳ quan trắc", async ({
    page,
  }) => {
    await gotoEnvironment(page);
    await page.getByRole("tab", { name: /Quan trắc/ }).click();
    await expect(page.getByText("Biểu đồ theo thời gian", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Thêm kỳ quan trắc" }).click();
    await expect(page.getByRole("heading", { name: "Thêm kỳ quan trắc" })).toBeVisible();
    // exact: true — tránh khớp nhầm select lọc biểu đồ "Lọc biểu đồ theo chỉ tiêu"
    // (getByLabel mặc định so khớp theo chuỗi con, không phân biệt hoa/thường).
    await expect(page.getByLabel("Chỉ tiêu", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Chất thải, mở modal ghi nhận chất thải", async ({ page }) => {
    await gotoEnvironment(page);
    await page.getByRole("tab", { name: /Chất thải/ }).click();
    await page.getByRole("button", { name: "Ghi nhận chất thải" }).click();
    await expect(page.getByRole("heading", { name: "Ghi nhận chất thải" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("tab Báo cáo hiển thị tổng hợp", async ({ page }) => {
    await gotoEnvironment(page);
    await page.getByRole("tab", { name: /Báo cáo/ }).click();
    await expect(page.getByText("Tổng hợp giấy phép", { exact: false })).toBeVisible();
    await expect(page.getByText("Tổng hợp chất thải theo loại", { exact: false })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoEnvironment(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
