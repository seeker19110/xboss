import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lưới tracking (/tracking/[sheet]) — trang dày dữ liệu nhất (audit a11y §4, ưu tiên cao nhất).
// Seed tạo sẵn 5 sheet + task + dimension nên lưới render đầy đủ. Dùng sheet "ogtd".

async function gotoSheet(page: Page) {
  await page.goto("/tracking/ogtd");
  // Qua PageSkeleton: nút "In PDF" trong header chỉ render khi dữ liệu sheet đã về.
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 15_000 });
  // Lưới đã nạp xong (không còn placeholder "Đang tải lưới…").
  await expect(page.getByText("Đang tải lưới")).toBeHidden();
}

test.describe("Lưới tracking (sau đăng nhập)", () => {
  test("render lưới", async ({ page }) => {
    await gotoSheet(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoSheet(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
