import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Tab "Sơ Đồ Nguyên Lý" (M117 PR3, SchematicGraphPanel) trên /engineering/chuan-hoa-ban-ve — AI
// đọc DXF schematic thành đồ thị kết nối, kỹ sư duyệt/sửa rồi "Chốt Graph". Môi trường e2e không
// có sẵn tệp DXF/graph mẫu để nạp thật (ngoài phạm vi spec này) — chỉ kiểm phần luôn render được:
// khối nạp tệp + a11y của toàn trang khi mở khối này.

async function gotoChuanHoa(page: Page) {
  await page.goto("/engineering/chuan-hoa-ban-ve");
  await expect(page.getByText("CHUẨN HÓA BẢN VẼ CAD 2D (ISO 19650)")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Sơ đồ nguyên lý — nạp DXF schematic (sau đăng nhập)", () => {
  test("hiện khối Sơ Đồ Nguyên Lý + mở form nạp tệp", async ({ page }) => {
    await gotoChuanHoa(page);

    await expect(page.getByText("Sơ Đồ Nguyên Lý (AI Đọc Schematic)")).toBeVisible();

    await page.getByRole("button", { name: "Nạp Sơ Đồ Nguyên Lý" }).click();
    await expect(page.getByText("Kéo-thả tệp .dxf sơ đồ nguyên lý vào đây")).toBeVisible();
    await expect(page.getByLabel("Hệ của sơ đồ nguyên lý (bắt buộc)")).toBeVisible();

    // Chưa chọn tệp/hệ → nút nạp phải disable, không cho gửi thiếu dữ liệu bắt buộc. Sau khi mở
    // form, nút trong thanh actions đổi thành "Đóng" nên chỉ còn đúng nút nạp trong form khớp tên.
    await expect(page.getByRole("button", { name: "Nạp Sơ Đồ Nguyên Lý" })).toBeDisabled();
  });

  test("tra graph theo mã hiện thông báo lỗi khi mã không tồn tại", async ({ page }) => {
    await gotoChuanHoa(page);

    await page.getByRole("button", { name: "Nạp Sơ Đồ Nguyên Lý" }).click();
    await page.getByLabel(/tra một sơ đồ đã nạp/i).fill("999999999");
    await page.getByRole("button", { name: "Xem", exact: true }).click();

    // Route thật trả 404 "Không tìm thấy sơ đồ nguyên lý" (hoặc lỗi dự án) — dù nội dung cụ thể
    // phụ thuộc seed, khối lỗi màu đỏ phải xuất hiện thay vì im lặng.
    await expect(page.locator("text=/Không tìm thấy|dự án/i").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("không có vi phạm a11y nghiêm trọng khi mở khối Sơ Đồ Nguyên Lý (axe)", async ({ page }) => {
    await gotoChuanHoa(page);
    await page.getByRole("button", { name: "Nạp Sơ Đồ Nguyên Lý" }).click();
    await expect(page.getByText("Kéo-thả tệp .dxf sơ đồ nguyên lý vào đây")).toBeVisible();

    // Tạm loại `color-contrast` — nợ kỹ thuật CHUNG toàn app ở chế độ sáng, không phải lỗi riêng
    // của khối này (xem ghi chú tại e2e/authed/chuan-hoa-ban-ve.spec.ts).
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
