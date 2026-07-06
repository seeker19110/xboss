import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lưới tracking (/tracking/[sheet]) — trang dày dữ liệu nhất (audit a11y §4, ưu tiên cao nhất).
// Seed tạo sẵn 5 sheet + task + dimension nên lưới render đầy đủ. Dùng sheet "ogtd".
// Quét axe khi đã MỞ 1 nhóm để lộ header cột lưới + nhãn cột dimension + checkbox — các phần
// này chỉ render khi bung nhóm, nếu chỉ quét view đóng sẽ bỏ sót lỗi (contrast header + checkbox
// thiếu tên).

async function gotoSheet(page: Page) {
  await page.goto("/tracking/ogtd");
  // Qua PageSkeleton: nút "In PDF" trong header chỉ render khi dữ liệu sheet đã về.
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 15_000 });
  // Lưới đã nạp xong (không còn placeholder "Đang tải lưới…").
  await expect(page.getByText("Đang tải lưới")).toBeHidden();
  // Mở nhóm đầu → lộ lưới (fetch async): header cột "Công việc" hiện ra = lưới đã render xong.
  await page.getByText("Ống gió trục đứng tầng 1F").click();
  await expect(page.getByRole("columnheader", { name: "Công việc" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Lưới tracking (sau đăng nhập)", () => {
  test("render lưới", async ({ page }) => {
    await gotoSheet(page);
  });

  // M14 — tầng chưa bàn giao mặt bằng (mọi tầng seed mặc định 'pending', chưa có tầng nào
  // bàn giao) hiện badge khoá cạnh nhãn tầng, không chặn tick (chỉ cảnh báo trực quan).
  test("hiện badge 'Chưa có mặt bằng' cạnh tầng chưa bàn giao", async ({ page }) => {
    await gotoSheet(page);
    await expect(page.locator('svg[aria-label="Chưa có mặt bằng"]').first()).toBeVisible();
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
