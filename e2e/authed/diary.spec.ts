import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Nhật ký (/diary, M5) — lịch tháng + editor 1 ngày + khoá sổ + tab nhân lực.

async function gotoDiary(page: Page) {
  await page.goto("/diary");
  await expect(page.getByText("Nhật ký thi công", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Nhật ký (sau đăng nhập)", () => {
  test("render lịch tháng + mở editor 1 ngày + lưu nháp", async ({ page }, testInfo) => {
    await gotoDiary(page);
    await expect(page.getByRole("tab", { name: "Lịch" })).toBeVisible();

    // Bấm ô "hôm nay" (viền sky) để mở editor. Dự án mobile chạy SONG SONG với desktop trên cùng
    // DB: lưu nhật ký có precondition (S06 — If-None-Match/If-Match), hai project cùng mở rồi cùng
    // lưu một ngày thì bên sau nhận 412 đúng thiết kế → mobile dùng một ngày khác trong tháng.
    const today = new Date().getDate();
    const ngay = testInfo.project.name.includes("mobile") ? (today === 1 ? 2 : 1) : today;
    const dayCell = page.getByRole("button", { name: String(ngay), exact: true });
    await dayCell.first().click();

    await expect(page.getByRole("heading", { name: /Nhật ký ngày/ })).toBeVisible();
    // Chờ tải xong dữ liệu ngày đó (nút "Thêm dòng" chỉ render sau khi hết trạng thái "Đang tải…").
    const addRowButton = page.getByRole("button", { name: "Thêm dòng" });
    await expect(addRowButton).toBeVisible();

    // Xoá mọi dòng nhân lực có sẵn (chạy lại spec nhiều lần trên cùng DB test không bị trùng
    // tên tổ đội → tránh lỗi 422 "bị lặp lại" của route PUT).
    const deleteButtons = page.getByRole("button", { name: /^Xoá dòng nhân lực/ });
    while ((await deleteButtons.count()) > 0) {
      await deleteButtons.first().click();
    }

    await addRowButton.click();
    await page.getByPlaceholder("Tổ đội").last().fill("Tổ điện E2E");
    await page.getByPlaceholder("Số người").last().fill("5");
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByText("Đã lưu nhật ký")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Đóng", exact: true }).click();
  });

  test("tab Nhân lực hiển thị được", async ({ page }) => {
    await gotoDiary(page);
    await page.getByRole("tab", { name: "Nhân lực" }).click();
    await expect(page.getByRole("tab", { name: "Nhân lực", selected: true })).toBeVisible();
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoDiary(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
