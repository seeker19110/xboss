import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Xe ra vào (/vehicles, M4) — đăng ký/duyệt/vào/ra xe NCC theo ngày.

async function gotoVehicles(page: Page) {
  await page.goto("/vehicles");
  await expect(page.getByText("Xe ra vào công trường", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Xe ra vào (sau đăng nhập)", () => {
  test("render nội dung chính + đăng ký xe mới", async ({ page }) => {
    await gotoVehicles(page);
    await expect(page.getByRole("button", { name: "Đăng ký xe" })).toBeVisible();
    await page.getByRole("button", { name: "Đăng ký xe" }).click();
    await expect(page.getByRole("heading", { name: "Đăng ký xe" })).toBeVisible();
    await page.getByRole("button", { name: "Đóng", exact: true }).click();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoVehicles(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
