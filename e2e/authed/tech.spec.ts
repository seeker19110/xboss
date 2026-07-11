import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Chuyển đổi số & Công nghệ (/tech, M31) — hub tab CDE/BIM/Giám sát/Phần
// mềm/Hệ thống (admin). DB seed mẫu không có tech_links/progress_albums nên các tab
// hiện EmptyState — vẫn đủ để phủ layout + a11y. auth.setup.ts đăng nhập bằng admin
// nên tab "Hệ thống" luôn hiển thị. Không load host ngoài thật qua iframe (chỉ kiểm
// nút "Thêm link"/EmptyState tồn tại — theo note đặc tả M31, tránh phụ thuộc mạng/CSP
// bên thứ 3 trong CI).

async function gotoTech(page: Page) {
  await page.goto("/tech");
  await expect(
    page.locator("header").getByText("Chuyển đổi số & Công nghệ", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Chuyển đổi số & Công nghệ (sau đăng nhập)", () => {
  test("render đủ tab, mặc định ở CDE với 2 link nhanh", async ({ page }) => {
    await gotoTech(page);

    const tablist = page.getByRole("tablist", { name: "Nhóm chuyển đổi số & công nghệ" });
    await expect(tablist.getByRole("tab", { name: /CDE/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /BIM/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Giám sát/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Phần mềm/ })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: /Hệ thống/ })).toBeVisible();

    await expect(page.getByText("Hồ sơ dự án (CDE)")).toBeVisible();
    await expect(page.locator("main").getByText("Đề xuất & duyệt")).toBeVisible();
  });

  test("chuyển tab BIM, mở modal thêm link (không load iframe host ngoài)", async ({ page }) => {
    await gotoTech(page);
    await page.getByRole("tab", { name: "BIM" }).click();
    await expect(page.getByText("Chưa có link BIM viewer", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Thêm link" }).click();
    await expect(page.getByText("Thêm link — BIM", { exact: false })).toBeVisible();
    await expect(page.getByText("URL (https://…)", { exact: false })).toBeVisible();
    await expect(page.getByText("Nhúng iframe", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("chuyển tab Giám sát, mở modal thêm album", async ({ page }) => {
    await gotoTech(page);
    await page.getByRole("tab", { name: "Giám sát" }).click();
    await expect(page.getByText("Album ảnh mốc tiến độ", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Thêm album" }).click();
    await expect(page.getByRole("heading", { name: "Thêm album mốc tiến độ" })).toBeVisible();
    await expect(page.getByText("Tên mốc", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("tab Hệ thống (admin) hiển thị dung lượng lưu trữ", async ({ page }) => {
    await gotoTech(page);
    await page.getByRole("tab", { name: "Hệ thống" }).click();
    await expect(page.getByText("Dung lượng lưu trữ", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Trạng thái ứng dụng", { exact: false })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoTech(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
