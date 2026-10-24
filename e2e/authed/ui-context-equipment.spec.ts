import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Buffer } from "node:buffer";

test.use({ serviceWorkers: "block" });

const ID = 930_001;
const CODE = "EQ-R3-001";
const LOGS = `**/api/equipment/${ID}/logs`;
const CERT = `**/api/equipment/${ID}/cert`;
const equipment = {
  id: ID,
  code: CODE,
  name: "Thiết bị kiểm chứng vòng 3",
  kind: "Máy đo",
  serial: "R3-SERIAL",
  condition: "good",
  calibrationDue: "2030-12-31",
  certFileName: null,
  currentLocation: "Kho A",
  currentCrew: "Tổ kiểm chứng",
  note: null,
};
const oldLog = {
  id: 930_002,
  action: "move",
  toLocation: "Kho A",
  toCrew: "Tổ kiểm chứng",
  note: "Lịch sử đã tải trước đó",
  loggerName: "Người kiểm chứng",
  createdAt: "2026-10-24T00:00:00Z",
};

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

async function setup(page: Page, role?: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 403, json: { error: "Không ghi ngoài fixture" } }),
  );
  if (role)
    await page.route("**/api/auth/me", async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, user: { ...body.user, role, name: "Tổ kiểm chứng" } },
      });
    });
  await page.route("**/api/equipment", (route) =>
    route.fulfill({ json: { equipment: [equipment] } }),
  );
  await page.route(LOGS, (route) => route.fulfill({ json: { logs: [oldLog] } }));
  return errors;
}

async function open(page: Page) {
  await page.goto("/equipment");
  await page.getByText(CODE, { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CODE, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function checkThemes(page: Page, include: string) {
  for (const light of [false, true]) {
    await page.evaluate(async (isLight) => {
      document.documentElement.classList.remove("light", "darkblue");
      document.documentElement.classList.add(isLight ? "light" : "darkblue");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((a) => a.finished.catch(() => {})),
      );
    }, light);
    const result = await new AxeBuilder({ page })
      .include(include)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
  }
}

test("GET danh sách thiết bị lỗi không thành empty; retry chỉ đọc lại để phục hồi", async ({
  page,
}) => {
  const errors = await setup(page);
  let gets = 0;
  await page.route("**/api/equipment", (route) =>
    ++gets === 1
      ? route.fulfill({ status: 500, json: { error: "Danh sách thiết bị tạm lỗi" } })
      : route.fulfill({ json: { equipment: [equipment] } }),
  );
  await page.goto("/equipment");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Danh sách thiết bị tạm lỗi",
  );
  await expect(page.getByText("Chưa có thiết bị nào", { exact: true })).toHaveCount(0);
  await checkThemes(page, "main");
  await page.getByRole("button", { name: "Thử lại danh sách", exact: true }).click();
  await expect(page.getByText(CODE, { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(gets).toBe(2);
  expect(errors).toEqual([]);
});

test("POST accepted và GET danh sách lỗi giữ modal/notice; retry danh sách không ghi lại", async ({
  page,
}) => {
  const errors = await setup(page);
  let gets = 0;
  let posts = 0;
  await page.route("**/api/equipment", (route) =>
    ++gets === 2
      ? route.fulfill({
          status: 500,
          json: { error: "Danh sách chưa cập nhật sau thao tác đã nhận" },
        })
      : route.fulfill({ json: { equipment: [equipment] } }),
  );
  await page.route(LOGS, (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ status: 201, json: { id: 930_003 } });
    }
    return route.fulfill({ json: { logs: [oldLog] } });
  });
  const dialog = await open(page);
  await dialog
    .getByRole("textbox", { name: "Ghi chú", exact: true })
    .fill("Thao tác chỉ gửi một lần");
  const failedRefresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/equipment" && response.status() === 500,
  );
  await dialog.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await (await failedRefresh).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "Danh sách chưa cập nhật sau thao tác đã nhận",
  );
  await expect(dialog.getByText("Đã ghi nhận thao tác vừa gửi.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeEnabled();
  await checkThemes(page, '[role="dialog"]');
  await dialog.getByRole("button", { name: "Thử lại danh sách", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(gets).toBe(3);
  expect(posts).toBe(1);
  expect(errors).toEqual([]);
});

test("lịch sử chờ/lỗi có retry, chỉ GET 200 rỗng mới hiện empty", async ({ page }) => {
  const errors = await setup(page);
  const waiting = deferred();
  let gets = 0;
  await page.route(LOGS, async (route) => {
    if (++gets === 1) {
      await waiting.promise;
      return route
        .fulfill({ status: 500, json: { error: "Lịch sử tạm chưa đọc được" } })
        .catch(() => {});
    }
    return route.fulfill({ json: { logs: [] } });
  });
  try {
    const dialog = await open(page);
    await expect(dialog.getByRole("status")).toContainText("Đang tải lịch sử");
    await expect(dialog.getByText("Chưa có lịch sử thao tác.", { exact: true })).toHaveCount(0);
    waiting.release();
    await expect(dialog.getByRole("alert")).toContainText("Lịch sử tạm chưa đọc được");
    await expect(dialog.getByText("Chưa có lịch sử thao tác.", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Thử lại lịch sử", exact: true }).click();
    await expect(dialog.getByText("Chưa có lịch sử thao tác.", { exact: true })).toBeVisible();
    expect(gets).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    waiting.release();
  }
});

for (const failure of ["network", "http"] as const) {
  test(`ghi log lỗi ${failure} giữ draft và hết pending để thử lại`, async ({ page }) => {
    const errors = await setup(page);
    const payloads: unknown[] = [];
    await page.route(LOGS, (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { logs: [oldLog] } });
      payloads.push(route.request().postDataJSON());
      if (payloads.length === 1)
        return failure === "network"
          ? route.abort("failed")
          : route.fulfill({ status: 422, json: { error: "Thông tin cần được kiểm tra lại" } });
      return route.fulfill({ status: 201, json: { id: 930_003 } });
    });
    const dialog = await open(page);
    await dialog.getByRole("combobox", { name: "Hành động", exact: true }).selectOption("move");
    await dialog.getByRole("textbox", { name: "Vị trí", exact: true }).fill("  Tầng 3  ");
    await dialog.getByRole("textbox", { name: "Tổ đội nhận", exact: true }).fill("  Đội B  ");
    await dialog.getByRole("textbox", { name: "Ghi chú", exact: true }).fill("  Draft phải giữ  ");
    await dialog.getByRole("button", { name: "Ghi nhận", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Ghi chú", exact: true })).toHaveValue(
      "  Draft phải giữ  ",
    );
    await expect(dialog.getByRole("textbox", { name: "Vị trí", exact: true })).toHaveValue(
      "  Tầng 3  ",
    );
    await expect(dialog.getByRole("textbox", { name: "Tổ đội nhận", exact: true })).toHaveValue(
      "  Đội B  ",
    );
    await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Ghi nhận", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "Ghi chú", exact: true })).toHaveValue("");
    await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeEnabled();
    expect(payloads).toEqual(
      Array(2).fill({
        action: "move",
        toLocation: "Tầng 3",
        toCrew: "Đội B",
        note: "Draft phải giữ",
      }),
    );
    expect(errors).toEqual([]);
  });
}

test("POST/refresh pending chặn gửi lặp, sửa, đóng và tương tác giấy kiểm định", async ({
  page,
}) => {
  const errors = await setup(page);
  const write = deferred();
  const refresh = deferred();
  let posts = 0;
  let gets = 0;
  await page.route(LOGS, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      await write.promise;
      return route.fulfill({ status: 201, json: { id: 930_003 } }).catch(() => {});
    }
    if (++gets > 1) await refresh.promise;
    return route.fulfill({ json: { logs: [oldLog] } }).catch(() => {});
  });
  try {
    const dialog = await open(page);
    await expect(dialog.getByText(oldLog.note)).toBeVisible();
    await dialog.getByRole("textbox", { name: "Ghi chú", exact: true }).fill("Ghi đúng một lần");
    await dialog.getByRole("button", { name: "Ghi nhận", exact: true }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("Không có nút ghi nhận");
      button.click();
      button.click();
    });
    await expect.poll(() => posts).toBe(1);
    await expect(dialog.getByRole("combobox", { name: "Hành động", exact: true })).toBeDisabled();
    const note = dialog.getByRole("textbox", { name: "Ghi chú", exact: true });
    expect((await note.isDisabled()) || (await note.getAttribute("readonly")) !== null).toBe(true);
    await expect(dialog.locator('input[type="file"]')).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    write.release();
    await expect.poll(() => gets).toBe(2);
    await expect(dialog.getByRole("button", { name: /Đang ghi/ })).toBeDisabled();
    refresh.release();
    await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeEnabled();
    expect(posts).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    write.release();
    refresh.release();
  }
});

test("POST được nhận nhưng GET lỗi giữ lịch sử; retry chỉ GET không ghi lại", async ({ page }) => {
  const errors = await setup(page);
  let gets = 0;
  let posts = 0;
  await page.route(LOGS, (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ status: 201, json: { id: 930_003 } });
    }
    if (++gets === 2)
      return route.fulfill({ status: 500, json: { error: "Chưa đọc lại được lịch sử sau ghi" } });
    return route.fulfill({ json: { logs: [oldLog] } });
  });
  const dialog = await open(page);
  await expect(dialog.getByText(oldLog.note)).toBeVisible();
  await dialog.getByRole("textbox", { name: "Ghi chú", exact: true }).fill("Nội dung đã được nhận");
  await dialog.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Chưa đọc lại được lịch sử sau ghi");
  await expect(dialog.getByText(oldLog.note)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Thử lại lịch sử", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(posts).toBe(1);
  expect(gets).toBe(3);
  expect(errors).toEqual([]);
});

test("giấy kiểm định đang upload cũng khóa đóng và ghi log, giữ draft log", async ({ page }) => {
  const errors = await setup(page);
  const pending = deferred();
  let uploads = 0;
  await page.route(CERT, async (route) => {
    uploads++;
    await pending.promise;
    return route.fulfill({ json: { ok: true } }).catch(() => {});
  });
  try {
    const dialog = await open(page);
    await dialog.getByRole("textbox", { name: "Ghi chú", exact: true }).fill("Log chưa gửi");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "kiem-dinh.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fixture"),
    });
    await expect.poll(() => uploads).toBe(1);
    await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    pending.release();
    await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("textbox", { name: "Ghi chú", exact: true })).toHaveValue(
      "Log chưa gửi",
    );
    expect(errors).toEqual([]);
  } finally {
    pending.release();
  }
});

test("đóng rồi mở thiết bị lại không áp lỗi lịch sử cũ đến muộn", async ({ page }) => {
  const errors = await setup(page);
  const old = deferred();
  let gets = 0;
  await page.route(LOGS, async (route) => {
    if (++gets === 1) {
      await old.promise;
      return route.fulfill({ status: 500, json: { error: "Lỗi modal đã đóng" } }).catch(() => {});
    }
    return route.fulfill({ json: { logs: [oldLog] } });
  });
  try {
    const dialog = await open(page);
    await expect.poll(() => gets).toBe(1);
    await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByText(CODE, { exact: true }).click();
    await expect(dialog.getByText(oldLog.note)).toBeVisible();
    old.release();
    await expect(dialog.getByText("Lỗi modal đã đóng", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    old.release();
  }
});

for (const role of ["viewer", "engineer", "subcon"] as const) {
  test(`giữ quyền ghi log hiện có cho ${role}`, async ({ page }) => {
    await setup(page, role);
    const dialog = await open(page);
    await expect(dialog.getByText(oldLog.note)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Ghi nhận", exact: true })).toHaveCount(
      role === "viewer" ? 0 : 1,
    );
    if (role === "subcon")
      await expect(
        dialog.getByRole("combobox", { name: "Hành động", exact: true }).locator("option"),
      ).toHaveText(["Thu hồi"]);
  });
}

for (const light of [false, true]) {
  test(`lịch sử loading/lỗi và form lỗi đủ axe hai theme ${light ? "Light" : "Dark Blue"}`, async ({
    page,
  }) => {
    await setup(page);
    const pending = deferred();
    await page.route(LOGS, async (route) => {
      if (route.request().method() === "POST") return route.abort("failed");
      await pending.promise;
      return route
        .fulfill({ status: 500, json: { error: "Lịch sử kiểm chứng axe" } })
        .catch(() => {});
    });
    const check = async () => {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((a) => a.finished.catch(() => {})),
        );
      });
      const result = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
      ).toEqual([]);
    };
    try {
      const dialog = await open(page);
      await page.evaluate((isLight) => {
        document.documentElement.classList.remove("light", "darkblue");
        document.documentElement.classList.add(isLight ? "light" : "darkblue");
      }, light);
      await expect(dialog.getByRole("status")).toContainText("Đang tải lịch sử");
      await check();
      pending.release();
      await expect(dialog.getByRole("alert")).toContainText("Lịch sử kiểm chứng axe");
      await dialog.getByRole("button", { name: "Ghi nhận", exact: true }).click();
      await expect(dialog.getByRole("alert").filter({ hasText: "Mất kết nối" })).toBeVisible();
      await check();
    } finally {
      pending.release();
    }
  });
}
