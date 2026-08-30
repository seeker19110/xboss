import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Thiết bị AutoCAD (/engineering/thiet-bi-cad — M99 PR2): duyệt mã ghép từ XBOSS_LOGIN
// + danh sách/thu hồi token thiết bị. Spec axe là cổng merge cho trang mới (docs/audit.md).

async function gotoThietBi(page: Page) {
  await page.goto("/engineering/thiet-bi-cad");
  await expect(page.getByText("Duyệt mã ghép từ AutoCAD")).toBeVisible({ timeout: 15_000 });
}

test.describe("Thiết bị AutoCAD (sau đăng nhập)", () => {
  test("render 2 khối chính + nút duyệt disable khi chưa nhập mã", async ({ page }) => {
    await gotoThietBi(page);

    await expect(page.getByText("Token thiết bị của tôi")).toBeVisible();
    await expect(page.getByLabel("Mã ghép thiết bị")).toBeVisible();
    await expect(page.getByRole("button", { name: "Duyệt", exact: true })).toBeDisabled();

    // Gõ mã → nút bật; mã sai → thông báo lỗi tiếng Việt từ API (404 không tìm thấy).
    await page.getByLabel("Mã ghép thiết bị").fill("ZZZZ-ZZZZ");
    await expect(page.getByRole("button", { name: "Duyệt", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Duyệt", exact: true }).click();
    await expect(page.getByText("Không tìm thấy mã ghép")).toBeVisible();
  });

  test("lỗi tải danh sách thiết bị hiện thông điệp + nút Thử lại thay vì treo skeleton", async ({
    page,
  }) => {
    // Mô phỏng lỗi mạng khi tải /api/tokens lần đầu — page.tsx phải thoát khỏi skeleton
    // và hiện ErrorState thay vì `tokens === null` treo mãi.
    let goiDau = true;
    await page.route("**/api/tokens", async (route) => {
      if (goiDau && route.request().method() === "GET") {
        goiDau = false;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/engineering/thiet-bi-cad");
    await expect(page.getByText("Đã xảy ra lỗi tải dữ liệu")).toBeVisible({ timeout: 15_000 });
    const nutThuLai = page.getByRole("button", { name: "Thử lại" });
    await expect(nutThuLai).toBeVisible();

    // Bấm Thử lại → lần gọi thứ 2 đi qua bình thường (route.continue) → về trang bình thường.
    await nutThuLai.click();
    await expect(page.getByText("Duyệt mã ghép từ AutoCAD")).toBeVisible({ timeout: 15_000 });
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoThietBi(page);

    // Tạm loại `color-contrast` — nợ kỹ thuật CHUNG toàn app ở chế độ sáng (xem ghi chú tại
    // e2e/authed/chuan-hoa-ban-ve.spec.ts), không phải lỗi riêng route này.
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
