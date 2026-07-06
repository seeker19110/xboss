import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Họp (/meetings, M13) — biên bản họp + việc sau họp theo dõi tự động.
// DB seed mẫu không có cuộc họp nào nên trang render EmptyState — vẫn đủ để phủ
// layout, tab, mở modal và a11y (cùng convention hse.spec.ts).

async function gotoMeetings(page: Page) {
  await page.goto("/meetings");
  await expect(page.getByRole("tablist", { name: "Chuyển giữa họp và việc sau họp" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Họp (sau đăng nhập)", () => {
  test("render thẻ thống kê + tab + trạng thái rỗng", async ({ page }) => {
    await gotoMeetings(page);
    await expect(page.getByText("Việc đang mở")).toBeVisible();
    await expect(page.getByText("Việc quá hạn")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Việc sau họp/ })).toBeVisible();
    await expect(page.getByText("Chưa có biên bản họp")).toBeVisible();
  });

  // Không bấm submit (không ghi dữ liệu thật) — trang chia sẻ 1 DB test giữa các
  // project desktop/mobile chạy song song.
  test("Admin mở được modal tạo biên bản họp", async ({ page }) => {
    await gotoMeetings(page);
    await page.getByRole("button", { name: "Tạo biên bản họp" }).click();
    await expect(page.getByRole("heading", { name: "Biên bản họp mới" })).toBeVisible();
    await page.locator("label", { hasText: "Tiêu đề" }).locator("input").fill("Họp test E2E");
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoMeetings(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
