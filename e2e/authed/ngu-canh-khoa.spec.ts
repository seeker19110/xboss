import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// QUALITY-FINAL-1 S05 (A2-FR03): 2 tab cùng phiên. Tab 2 chọn dự án (POST /api/project/select +
// phát epoch đổi ngữ cảnh) → tab 1 phải khoá ngay dữ liệu ngữ cảnh cũ bằng lớp khoá dạng
// alertdialog: focus vào nút hành động, axe không có lỗi serious/critical, bấm "Tải lại" thì
// trang tải lại theo ngữ cảnh mới và lớp khoá biến mất. Chạy ở authed-desktop + authed-mobile.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const LOP_KHOA = "[data-xboss-ngu-canh-khoa]";

test("đổi dự án ở tab khác → tab này hiện lớp khoá truy cập được, Tải lại hoạt động", async ({
  page,
  context,
}) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /Tài khoản/ }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(LOP_KHOA)).toHaveCount(0);

  const tab2 = await context.newPage();
  await tab2.goto("/portfolio");
  const theDuAn = tab2
    .getByRole("button")
    .filter({ has: tab2.locator("h3") })
    .first();
  await expect(theDuAn).toBeVisible({ timeout: 20_000 });
  await Promise.all([tab2.waitForURL((u) => u.pathname === "/"), theDuAn.click()]);

  const lop = page.locator(LOP_KHOA);
  await expect(lop).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("alertdialog", { name: "Ngữ cảnh đã thay đổi ở tab khác" }),
  ).toBeVisible();
  const nut = page.getByRole("button", { name: "Tải lại theo ngữ cảnh mới" });
  await expect(nut).toBeFocused();

  const ketQua = await new AxeBuilder({ page }).include(LOP_KHOA).withTags(AXE_TAGS).analyze();
  const nghiemTrong = ketQua.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(nghiemTrong, JSON.stringify(nghiemTrong, null, 2)).toEqual([]);

  await Promise.all([page.waitForEvent("load"), nut.click()]);
  await expect(page.locator(LOP_KHOA)).toHaveCount(0);
  await tab2.close();
});
