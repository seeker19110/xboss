import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Chấm công (/attendance, M24) — chấm công nhanh theo tổ đội (gộp) hoặc theo
// người + biểu đồ tổng công theo tháng. Seed mẫu chưa có tổ đội/chứng chỉ nào nên
// trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoAttendance(page: Page) {
  await page.goto("/attendance");
  // M37 PR2.4: aside desktop (sidebar) luôn mount, chỉ ẩn qua CSS trên mobile — nhãn nav
  // trùng tên trang vẫn khớp getByText() dù đang display:none. Text thật ra chỉ render qua
  // prop title của AppHeader (bên trong <header>), không có trong <main> — scope vào header.
  await expect(page.locator("header").getByText("Chấm công", { exact: false }).first()).toBeVisible(
    {
      timeout: 15_000,
    },
  );
}

test.describe("Chấm công (sau đăng nhập)", () => {
  test("render date picker + tổng nhân công + EmptyState chưa có tổ đội", async ({ page }) => {
    await gotoAttendance(page);
    await expect(page.getByLabel("Chọn ngày chấm công")).toBeVisible();
    await expect(page.getByText("Tổng nhân công ngày này", { exact: false })).toBeVisible();
    await expect(page.getByText("Chưa có tổ đội", { exact: false })).toBeVisible();
  });

  test("render mục tổng công theo tháng (biểu đồ)", async ({ page }) => {
    await gotoAttendance(page);
    await expect(page.getByRole("region", { name: "Tổng công theo tháng" })).toBeVisible();
    await expect(page.getByText("Chưa có dữ liệu chấm công trong tháng này")).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAttendance(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
