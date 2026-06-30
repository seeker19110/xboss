import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Dashboard ("/") — landing sau đăng nhập, hiển thị global chrome (header/footer).
// Đây là trang sau-auth ĐẦU TIÊN được phủ axe (audit a11y §5). Dùng storageState từ project `setup`.

// Chờ Dashboard render ỔN ĐỊNH trước khi quét axe: các panel nặng (S-curve…) lazy-load
// (dynamic import + fetch) nên axe phải đợi chúng xuất hiện, nếu không kết quả sẽ chập chờn
// (CI render kịp → bắt lỗi; máy nhanh có thể quét trước khi panel load → bỏ sót).
async function gotoDashboard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Tổng quan tiến độ/ })).toBeVisible();
  // S-curve là panel lazy phụ thuộc dữ liệu sâu nhất → xuất hiện = hydrate + chunk + fetch xong.
  await expect(page.getByRole("heading", { name: /S-curve/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("Dashboard (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoDashboard(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoDashboard(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Cùng cổng như /login: chặn serious/critical (gồm color-contrast), minor để dọn dần.
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
