import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Sơ đồ tổ chức (/org, M24) — cây tổ chức theo tổ đội/hệ thi công + ma trận RACI.
// Seed mẫu chưa có tổ đội/RACI nào nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoOrg(page: Page) {
  await page.goto("/org");
  await expect(page.getByText("Sơ đồ tổ chức", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Sơ đồ tổ chức (sau đăng nhập)", () => {
  test("render EmptyState chưa có tổ đội + mục Ma trận RACI", async ({ page }) => {
    await gotoOrg(page);
    await expect(page.getByText("Chưa có tổ đội nào", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ma trận RACI" })).toBeVisible();
  });

  test("chọn '— Hạng mục mới —' hiện ô nhập tên hạng mục", async ({ page }) => {
    await gotoOrg(page);
    await expect(page.getByLabel("Tên hạng mục/quy trình mới")).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoOrg(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
