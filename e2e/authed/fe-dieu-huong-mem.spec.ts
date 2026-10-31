import { test, expect, type Page } from "@playwright/test";

// FE-1 + P7 (đợt tối ưu 3): link sidebar nội bộ đi qua router của Next (không tải lại cả trang),
// cấu hình nav/cờ module dùng cache module 60s thay vì gọi lại mỗi lần chuyển trang. Các trường hợp
// vẫn tải lại cứng (URL hiện tại có query) giữ đúng hành vi thẻ <a> cũ — xem app/lib/dieuHuong.ts.

async function moSidebar(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Mở menu" }).click();
    return page.locator("#app-sidebar-mobile");
  }
  return page.locator("#app-sidebar");
}

/** Đánh dấu cửa sổ hiện tại — mất dấu nghĩa là trang đã tải lại toàn bộ. */
const danhDau = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __g5: number }).__g5 = 1));
const conDau = (page: Page) =>
  page.evaluate(() => (window as unknown as { __g5?: number }).__g5 === 1);

test("sidebar điều hướng client-side, không gọi lại nav-settings/feature-flags trong TTL", async ({
  page,
  isMobile,
}) => {
  const goi: string[] = [];
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p === "/api/nav-settings" || p === "/api/feature-flags") goi.push(p);
  });
  await page.goto("/diary");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => goi.length).toBe(2);
  await danhDau(page);

  const sidebar = await moSidebar(page, isMobile);
  await sidebar.getByRole("link", { name: "Việc của tôi" }).first().click();
  await expect(page).toHaveURL(/\/my-tasks$/);
  await expect(page.getByRole("heading", { level: 1, name: "Việc của tôi" })).toBeVisible({
    timeout: 15_000,
  });
  expect(await conDau(page)).toBe(true);
  // AppHeader của trang mới mount lại nhưng đọc cấu hình từ cache module (P7).
  await page.waitForTimeout(500);
  expect(goi).toHaveLength(2);
});

test("URL hiện tại có query → link sidebar tải lại cứng như thẻ <a> cũ", async ({
  page,
  isMobile,
}) => {
  await page.goto("/diary?g5=1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  await danhDau(page);
  const sidebar = await moSidebar(page, isMobile);
  await sidebar.getByRole("link", { name: "Việc của tôi" }).first().click();
  await expect(page).toHaveURL(/\/my-tasks$/);
  await expect(page.getByRole("heading", { level: 1, name: "Việc của tôi" })).toBeVisible({
    timeout: 15_000,
  });
  expect(await conDau(page)).toBe(false);
});
