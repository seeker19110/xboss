import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Portfolio (/portfolio, M22 — đa dự án) — tổng quan tất cả dự án người dùng
// được gán. Seed mẫu (scripts/seed-sample.ts, dùng chung cho e2e qua global-setup.ts)
// chỉ tạo đúng 1 dự án ("TT AVIO Tháp A") nên trang luôn render KPI strip + 1
// ProjectCard (KHÔNG rơi vào nhánh EmptyState "Chưa có dự án nào" — nhánh đó chỉ xảy
// ra khi user không được gán dự án nào, không phải trường hợp của admin seed mặc định).

async function gotoPortfolio(page: Page) {
  await page.goto("/portfolio");
  await expect(page.locator("header").getByText("Portfolio", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Portfolio — tổng quan đa dự án (sau đăng nhập)", () => {
  test("hiện KPI strip và card dự án, bấm được", async ({ page }) => {
    await gotoPortfolio(page);

    const main = page.locator("main");
    await expect(main.getByText("Số dự án", { exact: false })).toBeVisible();
    // "Đang thi công" cũng xuất hiện lại ở badge trạng thái trong ProjectCard bên dưới —
    // thu hẹp về đúng KPI tile (thẻ <p>, KPI strip render trước grid card trong DOM).
    await expect(
      main.locator("p").getByText("Đang thi công", { exact: true }).first(),
    ).toBeVisible();
    await expect(main.getByText("Tiến độ TB", { exact: false })).toBeVisible();
    await expect(main.getByText("Tổng việc trễ", { exact: false })).toBeVisible();

    const card = main.getByRole("button", { name: /TT AVIO Tháp A/ });
    await expect(card).toBeVisible();
    await expect(card).toBeEnabled();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoPortfolio(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
