import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Mặt bằng thi công (/work-fronts, M14) — ma trận tầng × hệ, đổi trạng thái bàn giao.
// DB seed mẫu có sẵn work_packages theo tầng nên GET /api/work-fronts (ensureWorkFronts)
// tự sinh đủ dòng work_fronts — ma trận render thật, không phải EmptyState.

async function gotoWorkFronts(page: Page) {
  await page.goto("/work-fronts");
  await expect(page.getByRole("region", { name: "Ma trận mặt bằng" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Mặt bằng thi công (sau đăng nhập)", () => {
  test("render ma trận tầng × hệ + chú giải trạng thái", async ({ page }) => {
    await gotoWorkFronts(page);
    await expect(page.getByText("Chưa bàn giao")).toBeVisible();
    await expect(page.getByText("Đã bàn giao")).toBeVisible();
    await expect(page.getByText("Đang thi công")).toBeVisible();
  });

  // M14 PR3 — báo cáo PDF mặt bằng/EOT (Admin/PM).
  test("Admin thấy nút xuất báo cáo mặt bằng (EOT)", async ({ page }) => {
    await gotoWorkFronts(page);
    await expect(page.getByRole("link", { name: "Báo cáo mặt bằng (EOT)" })).toHaveAttribute(
      "href",
      "/api/work-fronts/report",
    );
  });

  // Không đổi trạng thái thật (không ghi dữ liệu) — trang chia sẻ 1 DB test giữa các
  // project desktop/mobile chạy song song (cùng convention drawings.spec.ts).
  test("Admin mở được modal chi tiết 1 ô mặt bằng", async ({ page }) => {
    await gotoWorkFronts(page);
    const firstCell = page
      .getByRole("region", { name: "Ma trận mặt bằng" })
      .getByRole("button")
      .first();
    await firstCell.click();
    await expect(page.getByRole("button", { name: "Đóng", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoWorkFronts(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
