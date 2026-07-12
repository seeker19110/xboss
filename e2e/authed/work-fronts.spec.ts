import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Mặt bằng thi công (/work-fronts, M46) — lưới tầng × công tác thi công (Trắc đạc →
// MEP layout → Xây thô → MEP âm tường → Tô trám → …), thay cho ma trận tầng × sheet cũ
// (M14). Tầng suy từ work_packages.floor_label có sẵn trong DB seed nên lưới render thật,
// không phải EmptyState; 7 công tác mặc định luôn có sẵn (seed ở migration 0046).

async function gotoWorkFronts(page: Page) {
  await page.goto("/work-fronts");
  await expect(page.getByRole("region", { name: "Ma trận mặt bằng thi công" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Mặt bằng thi công (sau đăng nhập)", () => {
  test("render lưới tầng × công tác thi công", async ({ page }) => {
    await gotoWorkFronts(page);
    await expect(page.getByRole("columnheader", { name: "Trắc đạc" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Xây dựng (Tô Trám)" })).toBeVisible();
  });

  // M14 PR3 — báo cáo PDF mặt bằng/EOT (Admin/PM), giờ đọc từ model công tác mới.
  test("Admin thấy nút xuất báo cáo mặt bằng (EOT)", async ({ page }) => {
    await gotoWorkFronts(page);
    await expect(page.getByRole("link", { name: "Báo cáo mặt bằng (EOT)" })).toHaveAttribute(
      "href",
      "/api/work-fronts/report",
    );
  });

  // Bấm vào 1 tầng mở trang riêng liệt kê đủ công tác theo thứ tự (thay cho modal 1 ô cũ).
  test("bấm vào 1 tầng mở trang chi tiết đủ công tác theo thứ tự", async ({ page }) => {
    await gotoWorkFronts(page);
    const region = page.getByRole("region", { name: "Ma trận mặt bằng thi công" });
    const firstFloorLink = region.locator("tbody tr").first().locator("a").first();
    await firstFloorLink.click();

    await expect(page).toHaveURL(/\/work-fronts\/.+/);
    await expect(page.getByText(/1\.\s*Trắc đạc/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Quay lại danh sách tầng" })).toBeVisible();
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
