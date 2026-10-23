import { test, expect, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Kiểm dây nối visibility/timer của component bằng clock và feed tổng hợp; không ghi DB.
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("chuông: tab ẩn không poll; request chậm không chồng; hiện lại tải ngay", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
  });
  let calls = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/notifications", async (route) => {
    calls++;
    if (calls === 1) await held;
    await route.fulfill({ json: { notifications: [], unread: 0 } });
  });
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "Thông báo", exact: true })).toBeVisible();
  await page.clock.fastForward(90_000);
  expect(calls).toBe(0);

  await setHidden(page, false);
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(90_000);
  expect(calls).toBe(1);
  const response = page.waitForResponse((item) => item.url().endsWith("/api/notifications"));
  release!();
  // Đợi response đi hết qua fetch/json trước khi chuyển hidden.
  await (await response).finished();
  await page.clock.runFor(1);
  await setHidden(page, true);
  await page.clock.fastForward(90_000);
  expect(calls).toBe(1);
  await setHidden(page, false);
  await expect.poll(() => calls).toBe(2);
});

test("chuông: đánh dấu đọc vẫn gửi đúng thao tác và refresh feed", async ({ page }) => {
  let marked = false;
  let reads = 0;
  await page.route("**/api/notifications", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ markAllRead: true });
      marked = true;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    reads++;
    await route.fulfill({
      json: {
        notifications: [
          {
            id: 87654321,
            taskId: null,
            type: "comment",
            message: "Thông báo kiểm thử M136",
            isRead: marked ? 1 : 0,
            createdAt: new Date().toISOString(),
            sheetSlug: null,
            floorLabel: null,
            projectId: null,
          },
        ],
        unread: marked ? 0 : 1,
      },
    });
  });
  await page.goto("/account");
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đọc tất cả" })).toBeVisible();
  await page.getByRole("button", { name: "Đọc tất cả" }).click();
  await expect(page.getByRole("button", { name: "Đọc tất cả" })).toHaveCount(0);
  expect(marked).toBe(true);
  expect(reads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: /Thông báo kiểm thử M136/ })).toBeVisible();
});
