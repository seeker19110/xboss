import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Bản vẽ (/drawings, M8 PR2) — register + chi tiết revision + upload + duyệt.
// DB seed mẫu không có bản vẽ nào nên trang render EmptyState — vẫn đủ để phủ layout,
// tạo mới, mở chi tiết và a11y.

async function gotoDrawings(page: Page) {
  await page.goto("/drawings");
  await expect(page.getByPlaceholder("Tìm mã, tên, hệ, tầng...")).toBeVisible({ timeout: 15_000 });
}

test.describe("Bản vẽ (sau đăng nhập)", () => {
  test("render trạng thái rỗng + filter chip", async ({ page }) => {
    await gotoDrawings(page);
    await expect(page.getByText("Chưa có bản vẽ nào")).toBeVisible();
    await expect(page.getByRole("button", { name: "Shop drawing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Biện pháp thi công" })).toBeVisible();
  });

  // Không bấm "Lưu" (không ghi dữ liệu thật) — trang chia sẻ 1 DB test giữa các project
  // desktop/mobile chạy song song, ghi dữ liệu ở đây sẽ làm vỡ test "trạng thái rỗng" ở
  // trên khi 2 project cùng chạy (xem cùng convention ở contracts.spec.ts/quality.spec.ts).
  test("Admin mở được modal thêm bản vẽ", async ({ page }) => {
    await gotoDrawings(page);
    await page.getByRole("button", { name: "Thêm bản vẽ" }).click();
    await expect(page.getByRole("heading", { name: "Thêm bản vẽ" })).toBeVisible();

    await page.getByPlaceholder("ACMV-SD-T05-001").fill("E2E-DRW-001");
    await page.locator("label", { hasText: "Tên bản vẽ" }).locator("input").fill("Bản vẽ test E2E");
    const saveButton = page.getByRole("button", { name: "Lưu" });
    await expect(saveButton).toBeEnabled();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoDrawings(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
