import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });

const SOURCES = [
  { key: "notifications", label: "thông báo" },
  { key: "sheets", label: "danh sách trang" },
  { key: "project", label: "tên dự án" },
] as const;
type Source = (typeof SOURCES)[number]["key"];

const AUX_DATA = {
  notifications: {
    notifications: [
      {
        id: 900001,
        taskId: null,
        message: "Thông báo hiện trường M137",
        isRead: 0,
        sheetSlug: null,
        floorLabel: null,
        projectId: null,
      },
    ],
    unread: 7,
  },
  sheets: { sheets: [{ id: 900001, code: "M137", name: "Trang M137", slug: "m137-field" }] },
  project: { name: "Tên dự án M137" },
};
const TASK_DATA = {
  tasks: [
    {
      id: 900001,
      code: "M137",
      name: "Việc chính vẫn dùng được",
      status: "dang_lam",
      endDate: "2020-01-01",
      progressPercent: 0.5,
      floorLabel: "T1",
      sheetType: "OGTD",
      sheetSlug: "ogtd",
    },
  ],
  summary: { total: 1, delayed: 1, done: 0, dueSoon: 0, dueSoonDays: 3 },
};

function matchesSource(url: URL, source: Source): boolean {
  return source === "notifications"
    ? url.pathname === "/api/notifications" && url.searchParams.get("limit") === "20"
    : url.pathname === `/api/${source}`;
}

function barrier() {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

async function checkAxe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

async function login(page: Page, baseURL: string | undefined, role = "engineer") {
  if (!baseURL) throw new Error("Cần baseURL của server E2E disposable");
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: new URL(baseURL).origin },
    data: {
      email: `${role}@xboss.vn`,
      password: role === "engineer" ? "eng123" : "sub123",
    },
  });
  expect(response.status()).toBe(200);
}

for (const source of SOURCES) {
  test(`hiện trường không chờ nguồn phụ ${source.label} để hiện việc chính`, async ({
    page,
    baseURL,
  }) => {
    await login(page, baseURL);
    const gate = barrier();
    let requested = false;
    await page.route(
      (url) => matchesSource(url, source.key),
      async (route) => {
        requested = true;
        await gate.pending;
        await route.continue().catch(() => {});
      },
    );
    try {
      const primary = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/my-tasks",
      );
      await page.goto("/");
      expect((await primary).status()).toBe(200);
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByText("Việc hôm nay", { exact: true })).toBeVisible({ timeout: 2500 });
      if (source.key === "notifications") await checkAxe(page);
    } finally {
      gate.release();
    }
  });
}

test("hiện trường báo lỗi chính ngay khi cả ba nguồn phụ chưa phản hồi", async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL);
  const gate = barrier();
  for (const source of SOURCES) {
    await page.route(
      (url) => matchesSource(url, source.key),
      async (route) => {
        await gate.pending;
        await route.continue().catch(() => {});
      },
    );
  }
  await page.route("**/api/my-tasks", (route) =>
    route.fulfill({ status: 500, json: { error: "Không tải được việc hiện trường M137" } }),
  );
  try {
    await page.goto("/");
    await expect(
      page.getByText("Không tải được việc hiện trường M137", { exact: true }),
    ).toBeVisible({ timeout: 2500 });
    await expect(page.getByRole("button", { name: "Thử lại", exact: true })).toBeVisible();
  } finally {
    gate.release();
  }
});

for (const source of SOURCES) {
  test(`lỗi ${source.label} có thử lại riêng và không tải lại việc chính`, async ({
    page,
    baseURL,
  }) => {
    await login(page, baseURL);
    const gate = barrier();
    const other = SOURCES.find((item) => item.key !== source.key)!;
    const calls = { notifications: 0, sheets: 0, project: 0 };
    let primaryCalls = 0;
    await page.route("**/api/my-tasks", (route) => {
      primaryCalls += 1;
      return route.fulfill({ json: TASK_DATA });
    });
    for (const item of SOURCES) {
      await page.route(
        (url) => matchesSource(url, item.key),
        async (route) => {
          calls[item.key] += 1;
          if (item.key === other.key) await gate.pending;
          if (item.key === source.key && calls[item.key] === 1) {
            await route.fulfill({ status: 500, json: { error: `${source.label} tạm lỗi M137` } });
          } else {
            await route.fulfill({ json: AUX_DATA[item.key] }).catch(() => {});
          }
        },
      );
    }
    try {
      await page.goto("/");
      await expect(page.getByText("Việc hôm nay", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("alert").filter({ hasText: `${source.label} tạm lỗi M137` }),
      ).toBeVisible();
      if (source.key === "notifications") {
        await expect(page.getByText("Không có thông báo chưa đọc.", { exact: true })).toHaveCount(
          0,
        );
        await checkAxe(page);
      }
      if (source.key === "sheets")
        await expect(page.getByText(/Chưa có trang tracking/)).toHaveCount(0);
      if (source.key === "project")
        await expect(page.getByText(/Chưa đặt tên dự án/)).toHaveCount(0);

      await page.getByRole("button", { name: `Thử lại ${source.label}`, exact: true }).click();
      await expect.poll(() => calls[source.key]).toBe(2);
      await expect(
        page.getByRole("alert").filter({ hasText: `${source.label} tạm lỗi M137` }),
      ).toHaveCount(0);
      if (source.key === "notifications")
        await expect(
          page.getByRole("link", { name: "Thông báo — 7 chưa đọc", exact: true }).first(),
        ).toBeVisible();
      if (source.key === "sheets")
        await expect(page.locator('a[href="/tracking/m137-field"]').first()).toBeVisible();
      if (source.key === "project") await expect(page.getByText(/Tên dự án M137/)).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: other.label })).toBeVisible();
      expect(primaryCalls).toBe(1);
      for (const item of SOURCES) expect(calls[item.key]).toBe(item.key === source.key ? 2 : 1);
    } finally {
      gate.release();
    }
  });
}

test("nguồn phụ rỗng thật có trạng thái rõ và link kế hoạch hợp lệ", async ({ page, baseURL }) => {
  await login(page, baseURL);
  const empty = {
    notifications: { notifications: [], unread: 0 },
    sheets: { sheets: [] },
    project: { name: null },
  };
  for (const source of SOURCES)
    await page.route(
      (url) => matchesSource(url, source.key),
      (route) => route.fulfill({ json: empty[source.key] }),
    );
  await page.goto("/");
  await expect(page.getByText("Không có thông báo chưa đọc.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Chưa có trang tracking/)).toBeVisible();
  await expect(page.getByText(/Chưa đặt tên dự án/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Lưới tracking", exact: true }).first(),
  ).toHaveAttribute("href", "/schedule");
});

test("tải lại chính hủy lượt phụ cũ và không ghi đè kết quả mới", async ({ page, baseURL }) => {
  await login(page, baseURL);
  const gate = barrier();
  const started = barrier();
  let primaryCalls = 0;
  let notificationCalls = 0;
  await page.route("**/api/my-tasks", (route) => {
    primaryCalls += 1;
    return primaryCalls === 1
      ? route.fulfill({ status: 500, json: { error: "Lượt đầu tải việc bị lỗi M137" } })
      : route.fulfill({ json: TASK_DATA });
  });
  await page.route(
    (url) => matchesSource(url, "notifications"),
    async (route) => {
      notificationCalls += 1;
      if (notificationCalls === 1) {
        started.release();
        await gate.pending;
        await route.fulfill({ json: { notifications: [], unread: 99 } }).catch(() => {});
      } else {
        await route.fulfill({ json: AUX_DATA.notifications });
      }
    },
  );
  try {
    await page.goto("/");
    await started.pending;
    await expect(page.getByText("Lượt đầu tải việc bị lỗi M137", { exact: true })).toBeVisible();
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (request) => matchesSource(new URL(request.url()), "notifications"),
    });
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    expect((await aborted).failure()?.errorText).toContain("ABORTED");
    await expect(page.getByText("Việc hôm nay", { exact: true })).toBeVisible();
    const links = page.getByRole("link", { name: "Thông báo — 7 chưa đọc", exact: true });
    await expect(links.first()).toBeVisible();
    gate.release();
    await expect(
      page.getByRole("link", { name: "Thông báo — 99 chưa đọc", exact: true }),
    ).toHaveCount(0);
    await expect(links.first()).toBeVisible();
    expect(primaryCalls).toBe(2);
    expect(notificationCalls).toBe(2);
  } finally {
    gate.release();
  }
});

test("rời chế độ hiện trường hủy nguồn phụ còn đang chờ", async ({ page, baseURL }) => {
  await login(page, baseURL);
  const gate = barrier();
  const started = barrier();
  await page.route(
    (url) => matchesSource(url, "notifications"),
    async (route) => {
      started.release();
      await gate.pending;
      await route.continue().catch(() => {});
    },
  );
  try {
    await page.goto("/");
    await started.pending;
    await expect(page.getByText("Việc hôm nay", { exact: true })).toBeVisible();
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (request) => matchesSource(new URL(request.url()), "notifications"),
    });
    await page.getByRole("button", { name: "Xem tổng quan", exact: true }).click();
    expect((await aborted).failure()?.errorText).toContain("ABORTED");
    gate.release();
    await expect(page.getByText("Tiến độ tổng", { exact: true })).toBeVisible();
    await expect(page.getByText("Việc hôm nay", { exact: true })).toHaveCount(0);
  } finally {
    gate.release();
  }
});

for (const role of ["engineer", "subcon"]) {
  test(`404 module tắt giữ hành vi vai trò ${role} dù nguồn phụ treo`, async ({
    page,
    baseURL,
  }) => {
    await login(page, baseURL, role);
    const gate = barrier();
    const paths: string[] = [];
    page.on("request", (request) => paths.push(new URL(request.url()).pathname));
    for (const source of SOURCES)
      await page.route(
        (url) => matchesSource(url, source.key),
        async (route) => {
          await gate.pending;
          await route.continue().catch(() => {});
        },
      );
    await page.route("**/api/my-tasks", (route) =>
      route.fulfill({ status: 404, json: { error: "Phân hệ Hiện trường đang tắt" } }),
    );
    try {
      await page.goto("/");
      if (role === "engineer") {
        await expect(page.getByText("Tiến độ tổng", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("xboss_home_mode"))).toBeNull();
      } else {
        await expect(page.getByText("Phân hệ Hiện trường đang tắt", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Xem tổng quan", exact: true })).toHaveCount(
          0,
        );
        expect(paths.some((path) => path.startsWith("/api/dashboard"))).toBe(false);
      }
    } finally {
      gate.release();
    }
  });
}

test("401 chính vẫn chuyển đăng nhập khi nguồn phụ chưa trả lời", async ({ page, baseURL }) => {
  await login(page, baseURL);
  const gate = barrier();
  for (const source of SOURCES)
    await page.route(
      (url) => matchesSource(url, source.key),
      async (route) => {
        await gate.pending;
        await route.continue().catch(() => {});
      },
    );
  await page.route("**/api/my-tasks", (route) =>
    route.fulfill({ status: 401, json: { error: "Phiên đã hết hạn" } }),
  );
  try {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  } finally {
    gate.release();
  }
});

async function glyphVuotKhung(locator: Locator) {
  return locator.evaluate((element) => {
    const frame = element.getBoundingClientRect();
    const errors: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (
          rect.left < frame.left - 1 ||
          rect.right > frame.right + 1 ||
          rect.top < frame.top - 1 ||
          rect.bottom > frame.bottom + 1
        )
          errors.push(`Chữ “${node.textContent.trim()}” vượt khung ${element.tagName}`);
      }
    }
    return errors;
  });
}

for (const width of [360, 393, 1280]) {
  test(`hiện trường ${width}px: nhãn KPI và hành động nhanh không tràn, badge 99+ và chừa thanh đáy`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 851 });
    await login(page, baseURL);
    await page.route("**/api/my-tasks", (route) => route.fulfill({ json: TASK_DATA }));
    for (const source of SOURCES)
      await page.route(
        (url) => matchesSource(url, source.key),
        (route) =>
          route.fulfill({
            json:
              source.key === "notifications"
                ? { ...AUX_DATA.notifications, unread: 123 }
                : AUX_DATA[source.key],
          }),
      );
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByText("Việc hôm nay", { exact: true })).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Thông báo — 123 chưa đọc", exact: true }),
    ).toBeVisible();
    const actions = main.getByRole("link", { name: "Lưới tracking", exact: true }).locator("..");
    const bar = page.locator(".app-bottombar");
    if (width < 768) await expect(bar).toBeVisible();
    else await expect(bar).toHaveCount(0);

    for (const group of width < 768 ? [actions, bar] : [actions]) {
      const links = group.getByRole("link");
      await expect(links).toHaveCount(3);
      const expected = [
        { name: "Lưới tracking", href: "/tracking/m137-field" },
        { name: "Nhật ký hôm nay", href: "/site?tab=tasks-diary" },
        { name: "Thông báo — 123 chưa đọc", href: "/notifications" },
      ];
      for (const [index, action] of expected.entries()) {
        const link = links.nth(index);
        await expect(link).toHaveAccessibleName(action.name);
        await expect(link).toHaveAttribute("href", action.href);
        const box = (await link.boundingBox())!;
        expect.soft(box.height).toBeGreaterThanOrEqual(44);
        expect.soft(await glyphVuotKhung(link)).toEqual([]);
        if (index < 2) {
          const next = (await links.nth(index + 1).boundingBox())!;
          expect.soft(box.x + box.width).toBeLessThanOrEqual(next.x);
        }
        if (width >= 768) await expect(link.locator("svg")).toBeVisible();
      }
      await expect(group.getByText("99+", { exact: true })).toBeVisible();
    }

    const kpis = main.locator(".grid.grid-cols-3").first();
    await expect(kpis.locator(":scope > div")).toHaveCount(3);
    for (const label of ["Đến hạn ≤3 ngày", "Trễ", "Đang làm"]) {
      const text = kpis.getByText(label, { exact: true });
      await expect(text).toBeVisible();
      expect.soft(await glyphVuotKhung(text)).toEqual([]);
    }
    if (width >= 768) await expect(kpis.locator("svg")).toHaveCount(3);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    if (width < 768) {
      const height = (await bar.boundingBox())!.height;
      const reserved = await page
        .locator("body")
        .evaluate((body) => Number.parseFloat(getComputedStyle(body).paddingBottom));
      expect.soft(reserved).toBeGreaterThanOrEqual(height);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect
        .poll(async () => {
          const footer = (await page.locator("footer").boundingBox())!;
          const bottomBar = (await bar.boundingBox())!;
          return footer.y + footer.height <= bottomBar.y + 1;
        })
        .toBe(true);
    }
  });
}
