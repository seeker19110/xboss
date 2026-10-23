import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("dashboard hiện dữ liệu chính khi danh mục phụ chưa phản hồi", async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/code-lists?domain=delay_reason", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  try {
    const primary = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/dashboard",
    );
    await page.goto("/");
    expect((await primary).status()).toBe(200);
    await expect(page.getByText("Tiến độ tổng", { exact: true })).toBeVisible({ timeout: 2500 });
  } finally {
    release();
  }
});

test("dashboard báo lỗi chính mà không đợi danh mục phụ", async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/code-lists?domain=delay_reason", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ status: 500, json: { error: "Không tải được tiến độ, hãy thử lại" } }),
  );
  try {
    await page.goto("/");
    await expect(
      page.getByText("Không tải được tiến độ, hãy thử lại", { exact: true }),
    ).toBeVisible({
      timeout: 2500,
    });
    await expect(page.getByRole("button", { name: "Thử lại", exact: true }).first()).toBeVisible();
  } finally {
    release();
  }
});

test("nguồn phụ hiển thị độc lập và chỉ thử lại nguồn lỗi", async ({ page }) => {
  let release: () => void = () => {};
  let sheetCalls = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/code-lists?domain=delay_reason", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await page.route("**/api/systems", (route) =>
    route.fulfill({
      json: {
        systems: [
          {
            id: 1234567,
            code: "m136",
            name: "Hệ đo độc lập M136",
            sheetCount: 1,
            avgProgress: 0.5,
            delayed: 0,
            color: null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/sheets", (route) => {
    sheetCalls += 1;
    return sheetCalls === 1
      ? route.fulfill({ status: 500, json: { error: "Danh sách trang tạm lỗi" } })
      : route.continue();
  });
  try {
    await page.goto("/");
    await expect(page.getByText("Tiến độ tổng", { exact: true })).toBeVisible();
    await expect(page.getByText("Hệ đo độc lập M136", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Danh sách trang: Danh sách trang tạm lỗi", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Thử lại dữ liệu phụ", exact: true }).click();
    await expect.poll(() => sheetCalls).toBe(2);
    await expect(
      page.getByText("Danh sách trang: Danh sách trang tạm lỗi", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Đang tải dữ liệu phụ: nguyên nhân trễ" }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test("thêm trang chờ danh sách nguồn sao chép tải xong", async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sheets", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/");
    await expect(page.getByText("Tiến độ tổng", { exact: true })).toBeVisible();
    const buttons = page.getByRole("button", { name: "Thêm trang", exact: true });
    for (const button of await buttons.all()) await expect(button).toBeDisabled();
    release();
    await expect(buttons.first()).toBeEnabled();
    await buttons.filter({ visible: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    release();
  }
});
