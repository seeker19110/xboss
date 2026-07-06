import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Hồ sơ dự án (/documents, M20 PR2) — view hợp nhất nghiệm thu/hợp đồng/phát
// sinh/bản vẽ + file tự do cấp dự án. DB seed mẫu không có tài liệu nào ở các nguồn
// nên trang render EmptyState — vẫn đủ để phủ layout, mở modal upload và a11y.

async function gotoDocuments(page: Page) {
  await page.goto("/documents");
  await expect(page.getByPlaceholder("Tìm tên hồ sơ…")).toBeVisible({ timeout: 15_000 });
}

test.describe("Hồ sơ dự án (sau đăng nhập)", () => {
  test("render trạng thái rỗng + filter chip", async ({ page }) => {
    await gotoDocuments(page);
    await expect(page.getByText("Chưa có hồ sơ nào")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mọi hệ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bản vẽ" })).toBeVisible();
  });

  // Không bấm "Tải lên" (không ghi dữ liệu thật) — trang chia sẻ 1 DB test giữa các
  // project desktop/mobile chạy song song, cùng convention correspondences.spec.ts.
  test("Admin mở được modal tải lên hồ sơ dự án", async ({ page }) => {
    await gotoDocuments(page);
    await page.getByRole("button", { name: "Tải lên hồ sơ dự án" }).click();
    await expect(page.getByRole("heading", { name: "Tải lên hồ sơ dự án" })).toBeVisible();

    await page.locator("label", { hasText: "Tiêu đề" }).locator("input").fill("Hồ sơ test E2E");
    const saveButton = page.getByRole("button", { name: "Tải lên", exact: true });
    await expect(saveButton).toBeDisabled(); // chưa chọn file
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoDocuments(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
