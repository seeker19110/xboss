import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /approvals — nghiệm thu theo tầng·hệ: bảng Chờ nghiệm thu + Đã nghiệm thu,
// kèm modal upload biên bản. Trang thuộc backlog a11y còn lại (chưa từng phủ axe).

async function gotoApprovals(page: Page) {
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: /Chờ nghiệm thu/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Nghiệm thu (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoApprovals(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoApprovals(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
