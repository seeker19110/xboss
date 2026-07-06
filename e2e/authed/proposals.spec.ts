import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Đề xuất & phê duyệt (/proposals, M19) — 4 tab loại + hộp thư chờ duyệt (Admin/PM).
// DB seed mẫu không có đề xuất nào; Admin đăng nhập nên tab mặc định là "Chờ duyệt".

async function gotoProposals(page: Page) {
  await page.goto("/proposals");
  await expect(page.getByRole("tablist", { name: "Loại đề xuất" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Đề xuất & phê duyệt (sau đăng nhập)", () => {
  test("render thẻ thống kê + tab loại + hộp thư chờ duyệt rỗng", async ({ page }) => {
    await gotoProposals(page);
    await expect(page.getByText("Được duyệt")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Tạm ứng/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Chờ duyệt/ })).toBeVisible();
    await expect(page.getByText("Không có đề xuất chờ duyệt")).toBeVisible();
  });

  // Không bấm submit (không ghi dữ liệu thật) — DB test dùng chung giữa các project.
  test("Admin mở được modal đề xuất mới", async ({ page }) => {
    await gotoProposals(page);
    await page.getByRole("button", { name: "Tạo đề xuất" }).click();
    await expect(page.getByRole("heading", { name: "Đề xuất mới" })).toBeVisible();
    await page.locator("label", { hasText: "Tiêu đề" }).locator("input").fill("Đề xuất test E2E");
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoProposals(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
