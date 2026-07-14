import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /notifications — trung tâm thông báo (feed trễ hạn/đến hạn/bình luận/vật tư vượt định
// mức + cài đặt). Mật độ ứng viên contrast cao nhất theo docs/a11y/contrast-audit.md §4 (23 chỗ).

async function gotoNotifications(page: Page) {
  await page.goto("/notifications");
  // Nút "Làm mới" trên AppHeader chỉ render sau khi feed đã tải xong (qua PageSkeleton).
  await expect(page.getByRole("button", { name: /Làm mới/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("Thông báo (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoNotifications(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoNotifications(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("tab Cài đặt không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoNotifications(page);
    await page.getByRole("button", { name: "Cài đặt" }).click();
    await expect(page.getByText(/Loại thông báo/).first()).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

// Dropdown chuông thông báo (M40 — trung tâm thông báo) — render trong AppHeader ở mọi trang.
test.describe("Chuông thông báo — dropdown (sau đăng nhập)", () => {
  test("mở dropdown, không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/");
    const bell = page.getByRole("button", { name: "Thông báo" });
    await expect(bell).toBeVisible({ timeout: 15_000 });
    await expect(bell).toHaveAttribute("aria-expanded", "false");
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

// Trang /notifications/all (M40 — danh sách đầy đủ thông báo, khác /notifications feed cũ).
test.describe("Tất cả thông báo (sau đăng nhập)", () => {
  test("render nội dung chính, không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await page.goto("/notifications/all");
    await expect(page.getByPlaceholder("Tìm trong nội dung thông báo...")).toBeVisible({
      timeout: 15_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
