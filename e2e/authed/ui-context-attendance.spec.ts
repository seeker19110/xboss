import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Tất cả API ghi chấm công đều mock; chỉ dùng cookie fixture cho GET xác minh phiên thật.
test.use({ serviceWorkers: "block" });

const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const MONTH = TODAY.slice(0, 7);
const DAY_B = `${MONTH}-${TODAY.endsWith("-11") ? "12" : "11"}`;
const DAY_C = `${MONTH}-${TODAY.endsWith("-13") ? "14" : "13"}`;
const [YEAR, MONTH_NUMBER] = MONTH.split("-").map(Number);
const NEXT_MONTH = new Date(Date.UTC(YEAR, MONTH_NUMBER, 1)).toISOString().slice(0, 10);
const CREW = { id: 930_101, name: "Tổ điện kiểm chứng" };
const PERSON = { id: 930_102, fullName: "Nhân sự kiểm chứng", crewNames: CREW.name };
const INITIAL_ID = 930_103;
const NEXT_ID = 930_104;
const API = "**/api/attendance**";

function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

function item(date = TODAY, headcount = 1, id = INITIAL_ID) {
  return {
    id,
    workDate: date,
    crewId: CREW.id,
    crewName: CREW.name,
    personnelId: null,
    personnelName: null,
    headcount,
    present: null,
    hours: null,
    note: null,
  };
}

async function mockSources(page: Page) {
  await page.route("**/api/crews", (route) => route.fulfill({ json: { crews: [CREW] } }));
  await page.route("**/api/personnel", (route) => route.fulfill({ json: { personnel: [PERSON] } }));
}

function minus(page: Page) {
  return page.getByRole("button", { name: `Giảm số người tổ ${CREW.name}`, exact: true });
}
function plus(page: Page) {
  return page.getByRole("button", { name: `Tăng số người tổ ${CREW.name}`, exact: true });
}
function count(page: Page) {
  return plus(page).locator("..").locator("span");
}
function form(page: Page) {
  return page.getByRole("group", { name: "Chấm công theo người", exact: true });
}

async function open(page: Page) {
  await page.goto("/attendance");
  await expect(plus(page)).toBeVisible();
}

async function fulfillRead(route: Route, count = 1) {
  const url = new URL(route.request().url());
  await route.fulfill({
    json:
      url.searchParams.get("view") === "byDate"
        ? { byDate: [] }
        : { items: [item(url.searchParams.get("from") ?? TODAY, count)] },
  });
}

async function checkAccessibility(page: Page) {
  if ((page.viewportSize()?.width ?? 0) < 600)
    await page.setViewportSize({ width: 360, height: 780 });
  for (const theme of ["darkblue", "light"]) {
    await page.evaluate((value) => {
      document.documentElement.classList.remove("light", "darkblue");
      document.documentElement.classList.add(value);
    }, theme);
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) =>
            Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const result = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = result.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify({ theme, serious }, null, 2)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth + 1),
    );
  }
}

test("đổi ngày đang tải không được PATCH/DELETE bản ghi của ngày cũ", async ({ page }) => {
  await mockSources(page);
  const gate = barrier();
  const writes: string[] = [];
  let dayBStarted = false;
  await page.route(API, async (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().url());
      return route.fulfill({ status: 403, json: { error: "Ghi bị chặn trong ca snapshot" } });
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get("view") === "list" && url.searchParams.get("from") === DAY_B) {
      dayBStarted = true;
      await gate.promise;
      return route.fulfill({ json: { items: [item(DAY_B, 4, NEXT_ID)] } }).catch(() => {});
    }
    await fulfillRead(route);
  });
  try {
    await open(page);
    await expect(count(page)).toHaveText("1");
    await page.getByLabel("Chọn ngày chấm công").fill(DAY_B);
    await expect.poll(() => dayBStarted).toBe(true);
    await expect(minus(page)).toBeDisabled();
    await expect(plus(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Chấm công", exact: true })).toBeDisabled();
    await minus(page).evaluate((button: HTMLButtonElement) => {
      button.click();
    });
    expect(writes).toEqual([]);
    gate.release();
    await expect(count(page)).toHaveText("4");
    await expect(plus(page)).toBeEnabled();
  } finally {
    gate.release();
  }
});

test("response ngày cũ về muộn không thay snapshot mới; chọn trong tháng không tải lại tổng tháng", async ({
  page,
}) => {
  await mockSources(page);
  const gate = barrier();
  let months = 0;
  let dayBStarted = false;
  await page.route(API, async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({ status: 403, json: { error: "Chỉ đọc" } });
    const url = new URL(route.request().url());
    if (url.searchParams.get("view") === "byDate") {
      months++;
      return route.fulfill({ json: { byDate: [] } });
    }
    const date = url.searchParams.get("from") ?? TODAY;
    if (date === DAY_B) {
      dayBStarted = true;
      await gate.promise;
    }
    await route
      .fulfill({ json: { items: [item(date, date === DAY_C ? 8 : date === DAY_B ? 4 : 1)] } })
      .catch(() => {});
  });
  try {
    await open(page);
    await expect(count(page)).toHaveText("1");
    await page.getByLabel("Chọn ngày chấm công").fill(DAY_B);
    await expect.poll(() => dayBStarted).toBe(true);
    const settled = new Promise<void>((resolve) => {
      const done = (request: import("@playwright/test").Request) => {
        const url = new URL(request.url());
        if (
          url.pathname !== "/api/attendance" ||
          url.searchParams.get("view") !== "list" ||
          url.searchParams.get("from") !== DAY_B
        )
          return;
        page.off("requestfinished", done);
        page.off("requestfailed", done);
        resolve();
      };
      page.on("requestfinished", done);
      page.on("requestfailed", done);
    });
    await page.getByLabel("Chọn ngày chấm công").fill(DAY_C);
    await expect(count(page)).toHaveText("8");
    gate.release();
    await settled;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(count(page)).toHaveText("8");
    expect(months).toBe(1);
    await page.getByLabel("Chọn ngày chấm công").fill(NEXT_MONTH);
    await expect(count(page)).toHaveText("1");
    await expect.poll(() => months).toBe(2);
  } finally {
    gate.release();
  }
});

test("ghi pending chặn đồng bộ gửi trùng/đổi ngày; lỗi mạng giữ số và retry dùng đúng payload", async ({
  page,
}) => {
  await mockSources(page);
  const gate = barrier();
  let writes = 0;
  let months = 0;
  let currentCount = 1;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(API, async (route) => {
    if (route.request().method() === "GET") {
      if (new URL(route.request().url()).searchParams.get("view") === "byDate") months++;
      return fulfillRead(route, currentCount);
    }
    expect(route.request().method()).toBe("PATCH");
    expect(new URL(route.request().url()).pathname).toBe(`/api/attendance/${INITIAL_ID}`);
    expect(route.request().postDataJSON()).toEqual({ headcount: 2 });
    writes++;
    if (writes === 1) {
      await gate.promise;
      return route.abort("failed").catch(() => {});
    }
    currentCount = 2;
    await route.fulfill({ json: { updated: INITIAL_ID } });
  });
  try {
    await open(page);
    await expect(count(page)).toHaveText("1");
    await plus(page).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByLabel("Chọn ngày chấm công")).toBeDisabled();
    await expect(minus(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Chấm công", exact: true })).toBeDisabled();
    gate.release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Mất kết nối");
    await expect(plus(page)).toBeEnabled();
    await expect(count(page)).toHaveText("1");
    expect(months).toBe(1);
    expect(errors).toEqual([]);
    await plus(page).click();
    await expect(count(page)).toHaveText("2");
    expect(writes).toBe(2);
    expect(months).toBe(2);
  } finally {
    gate.release();
  }
});

test("GET lỗi có retry; ghi đã nhận nhưng refresh lỗi giữ snapshot và chỉ retry GET", async ({
  page,
}) => {
  await mockSources(page);
  let gets = 0;
  let writes = 0;
  let months = 0;
  await page.route(API, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      writes++;
      expect(request.method()).toBe("PATCH");
      expect(request.postDataJSON()).toEqual({ headcount: 2 });
      return route.fulfill({ json: { updated: INITIAL_ID } });
    }
    if (new URL(request.url()).searchParams.get("view") === "byDate") {
      months++;
      return route.fulfill({ json: { byDate: [] } });
    }
    gets++;
    if (gets === 1 || gets === 3)
      return route.fulfill({ status: 500, json: { error: "Tạm lỗi đọc ngày kiểm chứng" } });
    await fulfillRead(route, gets > 3 ? 2 : 1);
  });
  await open(page);
  const alert = page
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: "Tạm lỗi đọc ngày kiểm chứng" });
  await expect(alert).toBeVisible();
  await expect(plus(page)).toBeDisabled();
  await checkAccessibility(page);
  await alert.getByRole("button", { name: /Thử lại/ }).click();
  await expect(count(page)).toHaveText("1");
  await expect(plus(page)).toBeEnabled();
  await plus(page).click();
  await expect(alert).toBeVisible();
  await expect(count(page)).toHaveText("1");
  await expect(plus(page)).toBeDisabled();
  await alert.getByRole("button", { name: /Thử lại/ }).click();
  await expect(count(page)).toHaveText("2");
  await expect(plus(page)).toBeEnabled();
  expect(writes).toBe(1);
  expect(gets).toBe(4);
  expect(months).toBe(2);
});

test("chấm theo người pending giữ draft/ngày và không gửi trùng; 422 cho sửa rồi retry", async ({
  page,
}) => {
  await mockSources(page);
  const gate = barrier();
  let posts = 0;
  await page.route(API, async (route) => {
    if (route.request().method() === "GET") return fulfillRead(route);
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      workDate: TODAY,
      crewId: CREW.id,
      personnelId: PERSON.id,
      present: false,
      hours: 7.5,
    });
    posts++;
    if (posts === 1) {
      await gate.promise;
      return route
        .fulfill({ status: 422, json: { error: "Giờ công cần kiểm tra lại" } })
        .catch(() => {});
    }
    await route.fulfill({ status: 201, json: { id: 930_105 } });
  });
  try {
    await open(page);
    await expect(count(page)).toHaveText("1");
    await page.getByLabel("Tổ đội", { exact: true }).selectOption(String(CREW.id));
    await page.getByLabel("Nhân sự", { exact: true }).selectOption(String(PERSON.id));
    await page.getByLabel("Có mặt", { exact: true }).uncheck();
    await page.getByLabel("Giờ công", { exact: true }).fill("7.5");
    await page.getByRole("button", { name: "Chấm công", exact: true }).click();
    await expect.poll(() => posts).toBe(1);
    await expect(page.getByLabel("Nhân sự", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Giờ công", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Chọn ngày chấm công")).toBeDisabled();
    await expect(plus(page)).toBeDisabled();
    gate.release();
    await expect(form(page).getByRole("alert")).toHaveText("Giờ công cần kiểm tra lại");
    await expect(page.getByLabel("Nhân sự", { exact: true })).toHaveValue(String(PERSON.id));
    await expect(page.getByLabel("Giờ công", { exact: true })).toHaveValue("7.5");
    await expect(page.getByLabel("Giờ công", { exact: true })).toHaveCSS("font-size", "16px");
    await expect(page.getByRole("button", { name: "Chấm công", exact: true })).toBeEnabled();
    await checkAccessibility(page);
    await page.getByRole("button", { name: "Chấm công", exact: true }).click();
    await expect(page.getByLabel("Nhân sự", { exact: true })).toHaveValue("");
    expect(posts).toBe(2);
  } finally {
    gate.release();
  }
});

test("auth tạm lỗi có retry một lần; viewer chỉ xem và ngày 401 trở về đăng nhập", async ({
  page,
}) => {
  await mockSources(page);
  let authGets = 0;
  let expired = false;
  await page.route("**/api/auth/me", async (route) => {
    authGets++;
    if (authGets === 1) return route.fulfill({ status: 500, json: { error: "Tạm lỗi auth" } });
    const response = await route.fetch();
    const body = await response.json();
    expect(response.ok()).toBe(true);
    await route.fulfill({ response, json: { ...body, user: { ...body.user, role: "viewer" } } });
  });
  await page.route(API, (route) => {
    expect(route.request().method()).toBe("GET");
    return expired
      ? route.fulfill({ status: 401, json: { error: "Phiên đã hết" } })
      : fulfillRead(route);
  });
  await page.goto("/attendance");
  const main = page.getByRole("main");
  await expect(main.getByRole("alert")).toContainText("Không tải được");
  await main
    .getByRole("alert")
    .getByRole("button", { name: /Thử lại/ })
    .click();
  await expect(page.getByText(CREW.name, { exact: true })).toBeVisible();
  expect(authGets).toBe(2);
  await expect(plus(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chấm công", exact: true })).toHaveCount(0);
  expired = true;
  await page.getByLabel("Chọn ngày chấm công").fill(DAY_B);
  await expect(page).toHaveURL(/\/login$/);
});
