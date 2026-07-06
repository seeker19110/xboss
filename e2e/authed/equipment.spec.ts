import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Thiết bị (/equipment, M12) — sổ thiết bị/máy thi công + log cấp phát/bảo trì/hiệu chuẩn.
// DB seed mẫu không có thiết bị nào nên trang render EmptyState — vẫn đủ để phủ layout,
// tạo mới, mở modal và a11y.

async function gotoEquipment(page: Page) {
  await page.goto("/equipment");
  await expect(page.getByPlaceholder("Tìm mã/tên/serial…")).toBeVisible({ timeout: 15_000 });
}

test.describe("Thiết bị (sau đăng nhập)", () => {
  test("render trạng thái rỗng + filter chip tình trạng", async ({ page }) => {
    await gotoEquipment(page);
    await expect(page.getByText("Chưa có thiết bị nào")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tốt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đang bảo trì" })).toBeVisible();
  });

  // Không bấm "Lưu" (không ghi dữ liệu thật) — trang chia sẻ 1 DB test giữa các project
  // desktop/mobile chạy song song, ghi dữ liệu ở đây sẽ làm vỡ test "trạng thái rỗng" ở
  // trên khi 2 project cùng chạy (cùng convention drawings.spec.ts/correspondences.spec.ts).
  test("Admin mở được modal thêm thiết bị", async ({ page }) => {
    await gotoEquipment(page);
    await page.getByRole("button", { name: "Thêm thiết bị" }).click();
    await expect(page.getByRole("heading", { name: "Thêm thiết bị" })).toBeVisible();

    await page.getByPlaceholder("TB-0001").fill("E2E-TB-001");
    await page.locator("label", { hasText: "Tên thiết bị" }).locator("input").fill("Máy test E2E");
    await page.getByPlaceholder("Máy hàn, giàn giáo…").fill("Máy hàn");
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoEquipment(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
