import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// M131 §3 — trang Admin /admin/thiet-bi-offline (thiết bị offline + yêu cầu khôi phục vault).
// Đăng nhập admin qua storageState chung; chạy ở cả authed-desktop lẫn authed-mobile. Đăng ký
// trình duyệt hiện tại làm thiết bị offline (POST /api/offline/devices, cần XBOSS_OFFLINE_KEK của
// webServer e2e) để bảng có ít nhất 1 dòng, rồi quét axe cả 2 tab ở theme tối + sáng. Không duyệt/
// thu hồi gì (tài khoản admin demo chưa bật 2FA → server trả 403, không đổi dữ liệu dùng chung).

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function axeKhongNghiemTrong(page: Page, nhan: string) {
  const kq = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const nghiemTrong = kq.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(nghiemTrong, `${nhan}: ${JSON.stringify(nghiemTrong, null, 2)}`).toEqual([]);
}

test.describe("Trang Thiết bị offline (Admin)", () => {
  test("2 tab hiển thị đúng, nút ≥40px, axe sạch ở theme tối + sáng", async ({ page }) => {
    await page.goto("/admin/thiet-bi-offline");
    await expect(page.locator("header").getByText("Thiết bị offline", { exact: true })).toBeVisible(
      { timeout: 15_000 },
    );
    // Đăng ký trình duyệt này (fetch cùng origin trong trang — cookie phiên + Origin tự đính kèm)
    // để bảng có dòng. Best-effort: admin demo có thể đã chạm trần thiết bị/rate limit do spec khác
    // mở vault trên tracking (409/429) — khi đó bảng vẫn có thiết bị cũ hoặc hiện trạng thái rỗng.
    const dk = await page.evaluate(async () => {
      const r = await fetch("/api/offline/devices", { method: "POST" });
      return r.status;
    });
    await page.reload();

    const tabThietBi = page.getByRole("tab", { name: /^Thiết bị/ });
    const tabKhoiPhuc = page.getByRole("tab", { name: /^Yêu cầu khôi phục/ });
    await expect(tabThietBi).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    const bang = page.getByRole("table", { name: /thiết bị offline/i });
    const rong = page.getByText("Chưa có thiết bị offline", { exact: true });
    await expect(bang.or(rong)).toBeVisible();
    if (dk === 200 || dk === 201) {
      await expect(bang).toBeVisible();
      await expect(page.getByText("· trình duyệt này", { exact: false }).first()).toBeVisible();
    }

    // Vùng chạm tối thiểu 40px (mobile công trường) cho tab + nút thao tác (nếu có).
    const nutThuHoi = page.getByRole("button", { name: /^Thu hồi thiết bị của/ });
    const nuts = [tabThietBi, tabKhoiPhuc];
    if ((await nutThuHoi.count()) > 0) nuts.push(nutThuHoi.first());
    for (const nut of nuts) {
      const hop = await nut.boundingBox();
      expect(hop?.height ?? 0).toBeGreaterThanOrEqual(40);
    }

    for (const theme of ["dark", "light"]) {
      await page.evaluate((t) => {
        document.documentElement.classList.remove("light", "darkblue");
        if (t === "light") document.documentElement.classList.add("light");
      }, theme);
      await tabThietBi.click();
      await expect(bang.or(rong)).toBeVisible();
      await axeKhongNghiemTrong(page, `${theme} — tab Thiết bị`);

      await tabKhoiPhuc.click();
      await expect(tabKhoiPhuc).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await axeKhongNghiemTrong(page, `${theme} — tab Yêu cầu khôi phục`);
    }
  });

  test("link từ thông báo ?tab=khoi-phuc mở thẳng tab Yêu cầu khôi phục", async ({ page }) => {
    await page.goto("/admin/thiet-bi-offline?tab=khoi-phuc");
    await expect(page.getByRole("tab", { name: /Yêu cầu khôi phục/ })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 15_000 },
    );
  });
});
