import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Tab "Thay đổi thiết kế" (M32, trong /drawings) — hub 2 tab với "Bản vẽ". Trang không
// đọc query ?tab= nên phải bấm nút tab để chuyển. DB seed mẫu (scripts/seed-sample.ts)
// không có design_changes nào nên tab mặc định hiện EmptyState — mỗi test tự tạo dữ
// liệu cần thiết (mã DC-000N tự sinh không trùng) để không phụ thuộc thứ tự chạy giữa
// project desktop/mobile (cùng chia sẻ 1 DB test, chạy song song).

async function gotoDesignChanges(page: Page) {
  await page.goto("/drawings");
  await expect(page.getByPlaceholder("Tìm mã, tên, hệ, tầng...")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Thay đổi thiết kế" }).click();
  await expect(page.getByRole("button", { name: "Tất cả trạng thái" })).toBeVisible();
}

test.describe("Thay đổi thiết kế (sau đăng nhập)", () => {
  test("chuyển tab, render filter chip theo trạng thái", async ({ page }) => {
    await gotoDesignChanges(page);
    await expect(page.getByRole("button", { name: "Đã trình", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đang đánh giá", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Được duyệt", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Từ chối", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Đã cập nhật bản vẽ", exact: true }),
    ).toBeVisible();
  });

  test("Admin thêm thay đổi thiết kế mới, xuất hiện trong danh sách", async ({ page }) => {
    await gotoDesignChanges(page);

    await page.getByRole("button", { name: "Thêm thay đổi thiết kế" }).click();
    await expect(page.getByRole("heading", { name: "Thêm thay đổi thiết kế" })).toBeVisible();

    const uniqueTitle = `E2E đổi cao độ trần ${Date.now()}-${test.info().parallelIndex}`;
    await page.getByPlaceholder("Đổi cao độ trần kỹ thuật tầng 5").fill(uniqueTitle);
    await page
      .locator("label", { hasText: "Lý do thay đổi" })
      .locator("textarea")
      .fill("Lý do E2E: kiểm tra tạo thay đổi thiết kế qua form");

    const saveButton = page.getByRole("button", { name: "Lưu" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByRole("heading", { name: "Thêm thay đổi thiết kế" })).toBeHidden();
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });

  test("lọc theo trạng thái: mục vừa tạo hiện ở 'Đã trình', ẩn ở 'Từ chối'", async ({ page }) => {
    await gotoDesignChanges(page);

    await page.getByRole("button", { name: "Thêm thay đổi thiết kế" }).click();
    const uniqueTitle = `E2E lọc trạng thái ${Date.now()}-${test.info().parallelIndex}`;
    await page.getByPlaceholder("Đổi cao độ trần kỹ thuật tầng 5").fill(uniqueTitle);
    await page
      .locator("label", { hasText: "Lý do thay đổi" })
      .locator("textarea")
      .fill("Lý do E2E: kiểm tra lọc theo trạng thái");
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });

    // Mục mới tạo mặc định ở trạng thái "Đã trình" — vẫn thấy khi lọc đúng trạng thái này.
    await page.getByRole("button", { name: "Đã trình", exact: true }).click();
    await expect(page.getByText(uniqueTitle)).toBeVisible();

    // Không xuất hiện khi lọc sang trạng thái khác.
    await page.getByRole("button", { name: "Từ chối", exact: true }).click();
    await expect(page.getByText(uniqueTitle)).toBeHidden();
  });

  test("EmptyState hiện đúng khi lọc trạng thái chưa có dữ liệu", async ({ page }) => {
    await gotoDesignChanges(page);

    // "Đã cập nhật bản vẽ" chỉ đạt được qua bước quyết định + đánh dấu thủ công riêng —
    // không test nào trong file này tạo ra trạng thái đó nên luôn rỗng, kể cả khi các
    // test khác đã chạy trước và tạo thêm thay đổi thiết kế ở trạng thái khác.
    await page.getByRole("button", { name: "Đã cập nhật bản vẽ", exact: true }).click();
    await expect(page.getByText("Chưa có thay đổi thiết kế nào")).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoDesignChanges(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
