import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Hub (/hub/[id]) — trang tổng quan khuôn chung, gom nhiều link con
// theo nghiệp vụ (hiện trường, tài chính, kiểm chất lượng, v.v).
// ID hub được xây từ dashboardTree.ts, ví dụ: "dash.hien-truong", "dash.claim".

async function gotoHub(page: Page, hubId: string = "dash.hien-truong") {
  await page.goto(`/hub/${hubId}`);
  // Tiêu đề hub render khi render xong.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Hub tổng quan (sau đăng nhập)", () => {
  test("render nội dung chính (hub hiện trường)", async ({ page }) => {
    await gotoHub(page, "dash.hien-truong");
  });

  test("không có vi phạm a11y nghiêm trọng (axe) — hub hiện trường", async ({ page }) => {
    await gotoHub(page, "dash.hien-truong");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
