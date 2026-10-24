import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 500, json: { error: "Không ghi dữ liệu ngoài ca thông báo" } }),
  );
});

const MESSAGE = "Thông báo kiểm chứng phục hồi";
function feed(read = false) {
  return {
    notifications: [
      {
        id: 916001,
        taskId: null,
        type: "comment",
        message: MESSAGE,
        isRead: read ? 1 : 0,
        createdAt: "2026-10-24T01:00:00Z",
        sheetSlug: null,
        floorLabel: null,
        projectId: null,
      },
    ],
    unread: read ? 0 : 1,
  };
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

async function openBell(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  // Bắt được cả baseline chưa có region để RED đi tới hành vi tải/lỗi thực tế.
  return page.getByRole("link", { name: "Xem tất cả thông báo", exact: true }).locator("../..");
}

async function axeThemes(page: Page, panel: Locator) {
  for (const light of [false, true]) {
    await page.evaluate(
      (theme) => {
        document.documentElement.classList.remove("light", "darkblue");
        document.documentElement.classList.add(theme);
      },
      light ? "light" : "darkblue",
    );
    await panel.evaluate(async (element) => {
      // Đo theme thật sau khi màu transition kết thúc, không đo màu trung gian.
      element.getBoundingClientRect();
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const result = await new AxeBuilder({ page })
      .include('[role="region"][aria-label="Thông báo gần đây"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const timestamps = result.passes
      .find((rule) => rule.id === "color-contrast")
      ?.nodes.filter((node) => node.html.includes("24/10/2026"))
      .map((node) => ({ target: node.target, checks: node.any.map((check) => check.data) }));
    if (timestamps?.length)
      await test.info().attach(`bell-timestamps-${light ? "light" : "darkblue"}`, {
        body: JSON.stringify(timestamps, null, 2),
        contentType: "application/json",
      });
    expect(
      result.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
    ).toEqual([]);
    await expect(panel).toBeVisible();
  }
}

for (const failure of ["http", "network"] as const) {
  test(`chuông: tải đầu ${failure} không giả empty, có trạng thái chờ và retry`, async ({
    page,
  }) => {
    const held = deferred();
    let gets = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/notifications", async (route) => {
      expect(route.request().method()).toBe("GET");
      gets++;
      if (gets === 1) {
        await held.promise;
        return failure === "network"
          ? route.abort("connectionreset")
          : route.fulfill({ status: 500, json: { error: "Tạm lỗi tải thông báo thử" } });
      }
      return route.fulfill({ json: { notifications: [], unread: 0 } });
    });
    try {
      const panel = await openBell(page);
      await expect.poll(() => gets).toBe(1);
      await expect(panel.getByText("Không có thông báo", { exact: true })).toHaveCount(0);
      await expect(panel.getByRole("status")).toContainText(/Đang tải/);
      held.release();
      await expect(panel.getByRole("alert")).toContainText(/Không tải được thông báo/);
      await expect(panel.getByText("Không có thông báo", { exact: true })).toHaveCount(0);
      const retry = panel.getByRole("button", { name: "Thử lại", exact: true });
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (failure === "http") await axeThemes(page, panel);
      await retry.click();
      await expect(panel.getByText("Không có thông báo", { exact: true })).toBeVisible();
      await expect(panel.getByRole("alert")).toHaveCount(0);
      expect(gets).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      held.release();
    }
  });
}

test("chuông: refresh lỗi giữ feed và unread cũ; retry phục hồi qua poll hiện hữu", async ({
  page,
}) => {
  await page.clock.install();
  let gets = 0;
  await page.route("**/api/notifications", async (route) => {
    gets++;
    if (gets === 2) return route.fulfill({ status: 500, json: { error: "Tạm lỗi refresh" } });
    return route.fulfill({ json: feed() });
  });
  const panel = await openBell(page);
  await expect(panel.getByRole("button", { name: new RegExp(MESSAGE) })).toBeVisible();
  await page.clock.fastForward(30_001);
  await expect.poll(() => gets).toBe(2);
  await expect(panel.getByRole("alert")).toContainText(/Không tải được thông báo/);
  await expect(panel.getByText("(1 mới)", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: new RegExp(MESSAGE) })).toBeVisible();
  await panel.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect.poll(() => gets).toBe(3);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: new RegExp(MESSAGE) })).toBeVisible();
});

test("chuông: đọc tất cả chặn gửi lặp, báo abort/403/500 và chỉ refresh sau success", async ({
  page,
}) => {
  const held = deferred();
  let gets = 0;
  let posts = 0;
  let marked = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/notifications", async (route) => {
    if (route.request().method() === "GET") {
      gets++;
      return route.fulfill({ json: feed(marked) });
    }
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ markAllRead: true });
    posts++;
    if (posts === 1) {
      await held.promise;
      return route.abort("connectionreset");
    }
    if (posts === 2)
      return route.fulfill({
        status: 403,
        json: { error: "Chưa có quyền đánh dấu thông báo thử" },
      });
    if (posts === 3)
      return route.fulfill({
        status: 500,
        json: { error: "Máy chủ chưa đánh dấu được thông báo thử" },
      });
    marked = true;
    return route.fulfill({ json: { ok: true } });
  });
  try {
    const panel = await openBell(page);
    await expect(panel.getByRole("button", { name: new RegExp(MESSAGE) })).toBeVisible();
    const mark = panel.getByRole("button", { name: "Đọc tất cả", exact: true });
    // Hai event cùng tick chứng minh guard đồng bộ, không chỉ disabled sau render.
    await mark.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect.poll(() => posts, { message: "POST đọc tất cả khi yêu cầu đầu đang chờ" }).toBe(1);
    await expect(mark).toBeDisabled();
    await expect(mark).toHaveAttribute("aria-busy", "true");
    expect((await mark.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    held.release();
    await expect(panel.getByRole("alert")).toContainText(/kết nối|mạng/);
    for (const message of [
      "Chưa có quyền đánh dấu thông báo thử",
      "Máy chủ chưa đánh dấu được thông báo thử",
    ]) {
      await expect(mark).toBeEnabled();
      await expect(panel.getByText("(1 mới)", { exact: true })).toBeVisible();
      expect(gets).toBe(1);
      await mark.click();
      await expect(panel.getByRole("alert")).toContainText(message);
    }
    await expect(mark).toBeEnabled();
    await expect(mark).toHaveCSS("opacity", "1");
    await axeThemes(page, panel);
    await expect(panel.getByText("(1 mới)", { exact: true })).toBeVisible();
    expect(gets).toBe(1);
    await mark.click();
    await expect(mark).toHaveCount(0);
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: new RegExp(MESSAGE) })).toBeVisible();
    expect(posts).toBe(4);
    expect(gets).toBe(2);
    expect(errors).toEqual([]);
    // Feed đã đọc có màu chữ riêng; vẫn kiểm cả timestamp và nội dung ở hai theme.
    await axeThemes(page, panel);
  } finally {
    held.release();
  }
});
