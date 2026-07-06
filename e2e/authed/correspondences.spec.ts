import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Công văn (/correspondences, M10 PR2) — sổ công văn/RFI + filter + reply + files.
// DB seed mẫu không có công văn nào nên trang render EmptyState — vẫn đủ để phủ layout,
// tạo mới, mở modal và a11y.

async function gotoCorrespondences(page: Page) {
  await page.goto("/correspondences");
  await expect(page.getByPlaceholder("Tìm số VB/trích yếu…")).toBeVisible({ timeout: 15_000 });
}

test.describe("Công văn (sau đăng nhập)", () => {
  test("render trạng thái rỗng + filter chip", async ({ page }) => {
    await gotoCorrespondences(page);
    await expect(page.getByText("Chưa có công văn nào")).toBeVisible();
    await expect(page.getByRole("button", { name: "RFI" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chờ phản hồi" })).toBeVisible();
  });

  // Không bấm "Tạo công văn" (không ghi dữ liệu thật) — trang chia sẻ 1 DB test giữa các
  // project desktop/mobile chạy song song, ghi dữ liệu ở đây sẽ làm vỡ test "trạng thái
  // rỗng" ở trên khi 2 project cùng chạy (cùng convention drawings.spec.ts/contracts.spec.ts).
  test("Admin mở được modal thêm công văn", async ({ page }) => {
    await gotoCorrespondences(page);
    await page.getByRole("button", { name: "Thêm công văn" }).click();
    await expect(page.getByRole("heading", { name: "Thêm công văn" })).toBeVisible();

    await page.locator("label", { hasText: "Số văn bản" }).locator("input").fill("E2E-CV-001");
    await page.locator("label", { hasText: "Đối tác" }).locator("input").fill("TVGS Test");
    await page
      .locator("label", { hasText: "Trích yếu" })
      .locator("input")
      .fill("Công văn test E2E");
    const saveButton = page.getByRole("button", { name: "Tạo công văn" });
    await expect(saveButton).toBeEnabled();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoCorrespondences(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
