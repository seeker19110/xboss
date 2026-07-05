import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// AppShell (M0) — sidebar trái thu gọn được + title/breadcrumb trên topbar.
// Xem docs/nang-cap/M00-khung-ui-sidebar.md.

test.describe("AppShell — sidebar & topbar (sau đăng nhập)", () => {
  test("sidebar render đủ nhóm menu theo vai trò Admin", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("#app-sidebar");
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible({
      timeout: 15_000,
    });
    for (const label of [
      "Báo cáo",
      "Timeline",
      "Gantt",
      "Lookahead",
      "Việc của tôi",
      "Nghiệm thu",
      "BOQ",
      "Chất lượng",
      "Vật tư",
      "Đơn đặt hàng",
      "Thanh toán",
      "Chi phí",
      "Tài khoản",
      "Phân công",
      "Import Excel",
    ]) {
      await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("title topbar đổi theo trang đang xem", async ({ page, isMobile }) => {
    await page.goto("/");
    const topbar = page.locator("header");
    await expect(topbar.getByText("Dashboard", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.goto("/materials");
    await expect(topbar.getByText("Vật tư", { exact: true })).toBeVisible({ timeout: 15_000 });
    // Breadcrumb nhóm chỉ hiện từ sm trở lên (ẩn trên mobile để nhường chỗ cho hamburger).
    if (!isMobile) {
      await expect(topbar.getByText("Vật tư & mua sắm")).toBeVisible();
    }
  });

  test("thu gọn sidebar giữ trạng thái sau khi tải lại trang", async ({ page, isMobile }) => {
    test.skip(isMobile, "Nút thu gọn chỉ có ở desktop (≥1024px) — mobile dùng drawer riêng.");
    await page.goto("/");
    const sidebar = page.locator("#app-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await expect(sidebar).toHaveCSS("width", "240px");

    await page.getByRole("button", { name: "Thu gọn menu" }).click();
    await expect(sidebar).toHaveCSS("width", "56px");

    await page.reload();
    await expect(sidebar).toHaveCSS("width", "56px");

    // Trả lại trạng thái mặc định để không ảnh hưởng test khác dùng chung storageState.
    await page.getByRole("button", { name: "Mở rộng menu" }).click();
    await expect(sidebar).toHaveCSS("width", "240px");
  });

  test("không có vi phạm a11y nghiêm trọng (axe) — desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("drawer mobile mở/đóng và điều hướng được", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Mở menu" })).toBeVisible({ timeout: 15_000 });

    // Sidebar tồn tại trong DOM (off-canvas) nhưng chưa hiện tới khi chưa mở drawer.
    await expect(page.locator("#app-sidebar")).not.toBeInViewport();

    await page.getByRole("button", { name: "Mở menu" }).click();
    await expect(page.locator("#app-sidebar")).toBeInViewport();
    await expect(page.getByRole("link", { name: "Vật tư" })).toBeVisible();

    await page.getByRole("button", { name: "Đóng menu" }).click();
    await expect(page.locator("#app-sidebar")).not.toBeInViewport();
  });
});
