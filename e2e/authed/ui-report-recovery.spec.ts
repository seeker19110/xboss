import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

function report(name: string) {
  return {
    delayedTasks: [],
    totalDelayed: 0,
    groupProgress: {},
    kpi: [{ sheetType: name, total: 1, avgProgress: 0.5, delayed: 0 }],
  };
}

function lookahead(days = 14) {
  return {
    days,
    from: "2026-10-24",
    until: "2026-11-07",
    starting: [],
    due: [],
  };
}

async function fixtures(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/project", (route) => route.fulfill({ json: { name: "Dự án thử" } }));
  await page.route("**/api/systems", (route) =>
    route.fulfill({
      json: {
        systems: [
          { code: "acmv", name: "ACMV" },
          { code: "water", name: "Nước" },
        ],
      },
    }),
  );
  await page.route("**/api/dashboard/forecast", (route) =>
    route.fulfill({ json: { forecast: [] } }),
  );
  return errors;
}

test("lookahead: link 7 ngày giữ lựa chọn khi lọc hệ và đổi số ngày", async ({ page }) => {
  const errors = await fixtures(page);
  const queries: string[] = [];
  await page.route("**/api/lookahead?**", (route) => {
    const url = new URL(route.request().url());
    queries.push(url.search);
    return route.fulfill({ json: lookahead(Number(url.searchParams.get("days"))) });
  });
  await page.goto("/lookahead?days=7&system=acmv");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("KẾ HOẠCH 7 NGÀY TỚI");
  await page.getByRole("combobox", { name: "Số ngày xem trước" }).selectOption("21");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("KẾ HOẠCH 21 NGÀY TỚI");
  const url = new URL(page.url());
  expect(url.searchParams.get("system")).toBe("acmv");
  expect(url.searchParams.get("days")).toBe("21");
  expect(queries).toEqual(["?days=7&system=acmv", "?days=21&system=acmv"]);
  expect(errors).toEqual([]);
});

for (const failure of ["http", "network"] as const) {
  test(`lookahead: ${failure} có retry và không in báo cáo chưa tải`, async ({ page }) => {
    const errors = await fixtures(page);
    let gets = 0;
    const gate = deferred();
    await page.route("**/api/lookahead?**", async (route) => {
      gets++;
      if (gets === 1) {
        await gate.promise;
        return failure === "http"
          ? route.fulfill({ status: 500, json: { error: "Kế hoạch thử chưa tải được" } })
          : route.abort("connectionreset");
      }
      expect(new URL(route.request().url()).searchParams.get("system")).toBe("acmv");
      return route.fulfill({ json: lookahead() });
    });
    try {
      await page.goto("/lookahead?system=acmv");
      await expect.poll(() => gets).toBe(1);
      const print = page.getByRole("button", { name: "In / Lưu PDF", exact: true });
      await expect(print).toBeDisabled();
      await expect(page.getByRole("status")).toContainText(/Đang tải kế hoạch/);
      await expect(page.getByText(/Không có công việc nào bắt đầu/)).toHaveCount(0);
      gate.release();
      const alert = page.getByRole("alert");
      await expect(alert).toContainText(
        failure === "http" ? "Kế hoạch thử chưa tải được" : /kết nối/,
      );
      await alert.getByRole("button", { name: "Thử lại", exact: true }).click();
      await expect(page.getByText(/Không có công việc nào bắt đầu/)).toBeVisible();
      await expect(print).toBeEnabled();
      expect(gets).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      gate.release();
    }
  });
}

test("lookahead: phản hồi 14 ngày đến muộn không ghi đè lựa chọn 7 ngày", async ({ page }) => {
  const errors = await fixtures(page);
  const gate = deferred();
  let oldFinished = false;
  await page.route("**/api/lookahead?**", async (route) => {
    const days = Number(new URL(route.request().url()).searchParams.get("days"));
    if (days === 14) await gate.promise;
    await route.fulfill({ json: lookahead(days) }).catch(() => {});
    if (days === 14) oldFinished = true;
  });
  try {
    await page.goto("/lookahead");
    await page.getByRole("combobox", { name: "Số ngày xem trước" }).selectOption("7");
    await expect(page.getByText(/Không có công việc nào bắt đầu/)).toBeVisible();
    gate.release();
    await expect.poll(() => oldFinished).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("KẾ HOẠCH 7 NGÀY TỚI");
    expect(errors).toEqual([]);
  } finally {
    gate.release();
  }
});

test("báo cáo: phản hồi kỳ cũ không ghi đè kỳ mới, forecast không tải lại theo bộ lọc", async ({
  page,
}) => {
  const errors = await fixtures(page);
  const gate = deferred();
  let gets = 0;
  let forecasts = 0;
  let oldFinished = false;
  await page.route("**/api/dashboard/forecast", (route) => {
    forecasts++;
    return route.fulfill({ json: { forecast: [] } });
  });
  await page.route(/\/api\/dashboard(?:\?.*)?$/, async (route) => {
    gets++;
    const range = new URL(route.request().url()).searchParams.get("range");
    if (!range) await gate.promise;
    await route
      .fulfill({ json: report(range === "week" ? "KPI kỳ mới" : "KPI kỳ cũ") })
      .catch(() => {});
    if (!range) oldFinished = true;
  });
  try {
    await page.goto("/report");
    await expect.poll(() => gets).toBe(1);
    await expect(page.getByRole("button", { name: "In", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "Chọn kỳ báo cáo" }).selectOption("week");
    await expect(page.locator("main")).toContainText("KPI kỳ mới");
    gate.release();
    await expect.poll(() => oldFinished).toBe(true);
    await expect(page.locator("main")).not.toContainText("KPI kỳ cũ");
    await page.getByRole("combobox", { name: "Lọc theo hệ" }).selectOption("water");
    await expect.poll(() => gets).toBe(3);
    await expect(page.getByRole("button", { name: "In", exact: true })).toBeEnabled();
    expect(forecasts).toBe(1);
    await expect(page).toHaveURL(/range=week.*system=water/);
    await expect(page.getByRole("link", { name: "Tải PDF", exact: true })).toHaveAttribute(
      "href",
      "/api/export/pdf",
    );
    expect(errors).toEqual([]);
  } finally {
    gate.release();
  }
});

test("báo cáo: lỗi cũ không che dữ liệu mới; forecast lỗi có retry riêng", async ({ page }) => {
  const errors = await fixtures(page);
  const gate = deferred();
  let forecasts = 0;
  let oldFinished = false;
  await page.route("**/api/dashboard/forecast", (route) => {
    forecasts++;
    return forecasts === 1
      ? route.fulfill({ status: 500, json: { error: "Forecast thử lỗi" } })
      : route.fulfill({ json: { forecast: [] } });
  });
  await page.route(/\/api\/dashboard(?:\?.*)?$/, async (route) => {
    if (!new URL(route.request().url()).searchParams.has("range")) {
      await gate.promise;
      await route.fulfill({ status: 500, json: { error: "Lỗi từ kỳ cũ" } }).catch(() => {});
      oldFinished = true;
      return;
    }
    return route.fulfill({ json: report("KPI tháng hiện tại") });
  });
  try {
    await page.goto("/report");
    await page.getByRole("combobox", { name: "Chọn kỳ báo cáo" }).selectOption("month");
    await expect(page.locator("main")).toContainText("KPI tháng hiện tại");
    gate.release();
    await expect.poll(() => oldFinished).toBe(true);
    await expect(page.locator("main")).not.toContainText("Lỗi từ kỳ cũ");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText(/dự báo/);
    await alert.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(alert).toHaveCount(0);
    expect(forecasts).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    gate.release();
  }
});

test("báo cáo: retry lỗi mạng giữ URL, controls mobile và a11y hai theme", async ({ page }) => {
  const errors = await fixtures(page);
  let gets = 0;
  await page.route(/\/api\/dashboard(?:\?.*)?$/, (route) => {
    gets++;
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("system")).toBe("acmv");
    expect(query.get("range")).toBe("week");
    return gets === 1
      ? route.abort("connectionreset")
      : route.fulfill({ json: report("KPI kiểm chứng") });
  });
  await page.goto("/report?system=acmv&range=week");
  await expect(page.getByRole("alert")).toContainText(/kết nối/);
  await page.getByRole("alert").getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator("main")).toContainText("KPI kiểm chứng");
  expect(gets).toBe(2);
  for (const light of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("light", value),
      light,
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
