import ExcelJS from "exceljs";
import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { dangNhapCoLap, goiApi } from "../helpers/co-lap";
import {
  docNghiepVuA1,
  docNguoiA1,
  dungFixtureA1,
  type DuAnA1,
  type FixtureA1,
  type NguoiA1,
  type ToChucA1,
} from "../helpers/a1-org-boundary-fixtures";

// A1-AC01 lớp B: bốn luồng hai chiều, browser/cookie/HTTP/PostgreSQL/download thật.
type PhienA1 = { f: FixtureA1; pages: [Page, Page] };

function optionsPhienThuHai(info: TestInfo): BrowserContextOptions {
  const use = info.project.use;
  const options: BrowserContextOptions = { ...use.contextOptions };
  for (const key of [
    "acceptDownloads",
    "baseURL",
    "colorScheme",
    "deviceScaleFactor",
    "forcedColors",
    "hasTouch",
    "httpCredentials",
    "ignoreHTTPSErrors",
    "isMobile",
    "javaScriptEnabled",
    "locale",
    "offline",
    "permissions",
    "proxy",
    "reducedMotion",
    "serviceWorkers",
    "timezoneId",
    "userAgent",
    "viewport",
  ] as const) {
    if (use[key] !== undefined) Object.assign(options, { [key]: use[key] });
  }
  return { ...options, storageState: { cookies: [], origins: [] } };
}

const test = base.extend<{ phien: PhienA1 }>({
  phien: async ({ browser, context, page }, runTest, info) => {
    const f = await dungFixtureA1();
    let other: BrowserContext | undefined;
    try {
      other = await browser.newContext(optionsPhienThuHai(info));
      const second = await other.newPage();
      const pages: [Page, Page] = [page, second];
      await Promise.all(pages.map((p, i) => dangNhapCoLap(p, f.orgs[i].nguoi.admin.email)));
      expect(f.orgs[0].id).not.toBe(f.orgs[1].id);
      expect(f.orgs[0].nguoi.admin.id).not.toBe(f.orgs[1].nguoi.admin.id);
      expect(second.viewportSize()).toEqual(page.viewportSize());
      for (const [i, p] of pages.entries()) {
        const me = await goiApi(p, "GET", "/api/auth/me");
        expect(me.status).toBe(200);
        expect(me.body?.user).toMatchObject({
          id: f.orgs[i].nguoi.admin.id,
          orgId: f.orgs[i].id,
          role: "admin",
        });
      }
      await runTest({ f, pages });
    } finally {
      try {
        await other?.close();
      } finally {
        try {
          await context.close();
        } finally {
          await f.pool.end();
        }
      }
    }
  },
});

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 60_000 });

const userRow = (page: Page, user: NguoiA1) =>
  page.getByRole("row").filter({ hasText: user.email });

async function bamVaDoc(
  page: Page,
  method: string,
  path: string,
  action: () => Promise<unknown>,
  expectedBody?: unknown,
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === path && r.request().method() === method,
    ),
    action(),
  ]);
  if (expectedBody !== undefined) expect(response.request().postDataJSON()).toEqual(expectedBody);
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function moBoChon(page: Page, isMobile: boolean, project: DuAnA1) {
  if (isMobile) await page.getByRole("button", { name: "Mở menu", exact: true }).click();
  const sidebar = page.locator(isMobile ? "#app-sidebar-mobile" : "#app-sidebar");
  const trigger = sidebar.getByRole("button", { name: project.name, exact: true });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const listbox = sidebar.getByRole("listbox", { name: "Chọn dự án", exact: true });
  await expect(listbox).toBeVisible();
  return { trigger, listbox };
}

async function cookieDuAn(page: Page) {
  const cookies = await page.context().cookies(page.url());
  return cookies.find((c) => c.name === "xboss_project")?.value;
}

type LuaChonQuanSatA1 = {
  status: number;
  body: unknown;
  postData: unknown;
  observerError: string | null;
};
let soObserver = 0;

async function quanSatLuaChon(page: Page) {
  const bindingName = `a1ProjectSelect${++soObserver}`;
  const restoreName = `${bindingName}Restore`;
  let ghiNhan!: (snapshot: LuaChonQuanSatA1) => void;
  const snapshot = new Promise<LuaChonQuanSatA1>((resolve) => {
    ghiNhan = resolve;
  });
  // Callback chỉ ACK snapshot; assertion ở Node bên ngoài binding không thể làm app fetch reject.
  const binding = await page.exposeBinding(bindingName, (_source, value: LuaChonQuanSatA1) => {
    ghiNhan(value);
  });
  const dispose = async () => {
    try {
      if (!page.isClosed()) {
        await page
          .evaluate((name) => {
            const hooks = window as unknown as Record<string, unknown>;
            const restore = hooks[name];
            if (typeof restore === "function") restore();
          }, restoreName)
          .catch(() => {}); // Document có thể đã reload/đóng; wrapper không sống qua navigation.
      }
    } finally {
      await binding.dispose();
    }
  };
  try {
    await page.evaluate(
      ({ bindingName, restoreName }) => {
        const hooks = window as unknown as Record<string, unknown>;
        const originalFetch = window.fetch;
        const wrapped: typeof fetch = async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          const method = init?.method ?? (input instanceof Request ? input.method : "GET");
          if (
            url.origin !== location.origin ||
            url.pathname !== "/api/project/select" ||
            method.toUpperCase() !== "POST"
          )
            return originalFetch.call(window, input, init);

          let postData: unknown = null;
          let requestClone: Request | undefined;
          let observerError: string | null = null;
          try {
            if (typeof init?.body === "string") postData = JSON.parse(init.body);
            else if (input instanceof Request && init?.body === undefined)
              requestClone = input.clone();
            else throw new Error("Project select phải gửi JSON body đọc được");
          } catch (error) {
            observerError = String(error);
          }
          const response = await originalFetch.call(window, input, init);
          let body: unknown = null;
          try {
            if (requestClone) postData = await requestClone.json();
            body = await response.clone().json();
          } catch (error) {
            observerError = String(error);
          }
          try {
            const ack = hooks[bindingName] as (value: LuaChonQuanSatA1) => Promise<void>;
            await ack({ status: response.status, body, postData, observerError });
          } catch {
            // Binding lỗi → test thiếu snapshot/đỏ; app vẫn nhận chính response thật.
          }
          return response;
        };
        // Fetch thật, cùng arguments và original Response. Clone + ACK trì hoãn response tới app:
        // observer này kiểm functional contract, không cung cấp bằng chứng timing của app.
        window.fetch = wrapped;
        hooks[restoreName] = () => {
          if (window.fetch === wrapped) window.fetch = originalFetch;
          delete hooks[restoreName];
        };
      },
      { bindingName, restoreName },
    );
    return { snapshot, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** Chọn khác dự án thật và chứng minh reload cùng URL, sau đó mở lại listbox để kiểm scope. */
async function chonDuAnThuHai(page: Page, isMobile: boolean, org: ToChucA1) {
  await page.goto("/");
  const url = page.url();
  const oldDocument = await page.evaluate(() => performance.timeOrigin);
  const { listbox } = await moBoChon(page, isMobile, org.projects[0]);
  const next = listbox.getByRole("option").filter({ hasText: org.projects[1].name });
  await expect(next).toBeVisible();
  await expect(next).toHaveAttribute("aria-selected", "false");
  const observer = await quanSatLuaChon(page);
  try {
    await Promise.all([
      observer.snapshot.then((value) => {
        expect(value.observerError).toBeNull();
        expect(value.status).toBe(200);
        expect(value.body).toEqual({ ok: true });
        expect(value.postData).toEqual({ projectId: org.projects[1].id });
      }),
      page
        .waitForResponse(
          (r) =>
            new URL(r.url()).pathname === "/api/project/select" && r.request().method() === "POST",
        )
        .then((response) => {
          expect(response.status()).toBe(200);
          expect(response.request().postDataJSON()).toEqual({ projectId: org.projects[1].id });
        }),
      page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
      next.click(),
    ]);
    await page.waitForFunction((previous) => performance.timeOrigin !== previous, oldDocument, {
      timeout: 15_000,
    });
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(url);
    expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(oldDocument);
    expect(await cookieDuAn(page)).toBe(String(org.projects[1].id));
    const reopened = await moBoChon(page, isMobile, org.projects[1]);
    await expect(
      reopened.listbox.getByRole("option").filter({ hasText: org.projects[1].name }),
    ).toHaveAttribute("aria-selected", "true");
    return reopened;
  } finally {
    await observer.dispose();
  }
}

function entete(ws: ExcelJS.Worksheet, headers: string[]) {
  expect(headers.map((_, i) => ws.getRow(1).getCell(i + 1).value)).toEqual(headers);
}

test("A1-AC01: hai admin đọc portfolio/users đúng org ở cả hai chiều", async ({
  phien: { f, pages },
}) => {
  for (const [i, page] of pages.entries()) {
    const own = f.orgs[i];
    const foreign = f.orgs[1 - i];
    await page.goto("/portfolio");
    const cards = page.locator("main").getByRole("heading", { level: 3 });
    await expect(cards).toHaveText(own.projects.map((p) => p.name));
    for (const project of foreign.projects)
      await expect(page.getByRole("heading", { name: project.name, exact: true })).toHaveCount(0);
    const projects = await goiApi(page, "GET", "/api/projects");
    expect(projects.status).toBe(200);
    const rows = projects.body?.projects as {
      id: number;
      name: string;
      code: string;
      orgId: number;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map(({ id, name, code, orgId }) => ({ id, name, code, orgId }))).toEqual(
      own.projects.map(({ id, name, code }) => ({ id, name, code, orgId: own.id })),
    );
    expect(projects.body?.orgs).toEqual([{ id: own.id, name: own.name }]);
    for (const project of foreign.projects) expect(rows.map((p) => p.id)).not.toContain(project.id);

    await page.goto("/users");
    await expect(userRow(page, own.nguoi.admin)).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(own.users.length + 1);
    for (const user of own.users) await expect(userRow(page, user)).toContainText(user.name);
    for (const user of foreign.users) await expect(userRow(page, user)).toHaveCount(0);
    const users = await goiApi(page, "GET", "/api/users");
    expect(users.status).toBe(200);
    const people = users.body?.users as NguoiA1[];
    expect(Array.isArray(people)).toBe(true);
    expect(people.map(({ id, name, email, role }) => ({ id, name, email, role }))).toEqual(
      own.users,
    );
    for (const user of foreign.users) {
      expect(people.map((p) => p.id)).not.toContain(user.id);
      expect(JSON.stringify(users.body)).not.toContain(user.email);
      expect(JSON.stringify(users.body)).not.toContain(user.name);
    }
  }
});

test("A1-AC01: foreign PATCH/DELETE 404 giữ DB, own UI đổi vai trò/xoá 200 hai chiều", async ({
  phien: { f, pages },
}) => {
  for (const [i, page] of pages.entries()) {
    const target = f.orgs[1 - i].nguoi.subcon;
    const before = await docNguoiA1(f, target.id);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ id: target.id, role: "subcon", orgId: f.orgs[1 - i].id });
    expect(await goiApi(page, "PATCH", `/api/users/${target.id}`, { role: "viewer" })).toEqual({
      status: 404,
      body: { error: "Không tìm thấy người dùng" },
    });
    expect(await docNguoiA1(f, target.id)).toEqual(before);
    expect(await goiApi(page, "DELETE", `/api/users/${target.id}`)).toEqual({
      status: 404,
      body: { error: "Không tìm thấy người dùng" },
    });
    expect(await docNguoiA1(f, target.id)).toEqual(before);
  }
  for (const [i, page] of pages.entries()) {
    const own = f.orgs[i];
    const edited = own.nguoi.engineer;
    const removed = own.nguoi.cdt;
    await page.goto("/users");
    const select = userRow(page, edited).getByRole("combobox", {
      name: `Vai trò của ${edited.name}`,
      exact: true,
    });
    await expect(select).toHaveValue("engineer");
    const patch = await bamVaDoc(
      page,
      "PATCH",
      `/api/users/${edited.id}`,
      () => select.selectOption("viewer"),
      { role: "viewer" },
    );
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({
      user: { id: edited.id, email: edited.email, role: "viewer" },
    });
    // Thông báo có hạn 3s: kiểm ngay sau response, trước observer DB hoặc tải lại trang.
    await expect(
      page.getByText(`Đã đổi vai trò ${edited.email} → Viewer`, { exact: true }),
    ).toBeVisible();
    expect(await docNguoiA1(f, edited.id)).toEqual([
      expect.objectContaining({ id: edited.id, role: "viewer", orgId: own.id }),
    ]);
    await userRow(page, removed).getByTitle("Xoá người dùng", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Xoá người dùng ${removed.email}?`);
    const deleted = await bamVaDoc(page, "DELETE", `/api/users/${removed.id}`, () =>
      dialog.getByRole("button", { name: "Xoá", exact: true }).click(),
    );
    expect(deleted).toEqual({ status: 200, body: { ok: true } });
    await expect(page.getByText(`Đã xoá ${removed.email}`, { exact: true })).toBeVisible();
    expect(await docNguoiA1(f, removed.id)).toEqual([]);
    await page.reload();
    await expect(userRow(page, own.nguoi.admin)).toBeVisible();
    await expect(
      userRow(page, edited).getByRole("combobox", {
        name: `Vai trò của ${edited.name}`,
        exact: true,
      }),
    ).toHaveValue("viewer");
    await expect(userRow(page, removed)).toHaveCount(0);
    await expect(page.getByRole("row")).toHaveCount(7);
  }
});

test("A1-AC01: UI chọn own project2 rồi foreign select 403 giữ cookie/menu hai chiều", async ({
  phien: { f, pages },
  isMobile,
}) => {
  for (const [i, page] of pages.entries()) {
    const own = f.orgs[i];
    const foreign = f.orgs[1 - i];
    const { trigger, listbox } = await chonDuAnThuHai(page, isMobile, own);
    const cookie = await cookieDuAn(page);
    await expect(listbox.getByRole("option")).toHaveCount(2);
    await expect(
      listbox.getByRole("option").filter({ hasText: own.projects[0].name }),
    ).toBeVisible();
    for (const project of foreign.projects)
      await expect(listbox.getByRole("option").filter({ hasText: project.name })).toHaveCount(0);
    expect(
      await goiApi(page, "POST", "/api/project/select", { projectId: foreign.projects[1].id }),
    ).toEqual({ status: 403, body: { error: "Bạn không có quyền xem dự án này" } });
    expect(await cookieDuAn(page)).toBe(cookie);
    await expect(trigger).toHaveText(own.projects[1].name);
    await expect(listbox).toBeVisible();
    await expect(
      listbox.getByRole("option").filter({ hasText: own.projects[1].name }),
    ).toHaveAttribute("aria-selected", "true");
    for (const project of foreign.projects)
      await expect(listbox.getByRole("option").filter({ hasText: project.name })).toHaveCount(0);
  }
});

test("A1-AC01: UI download Excel project đang chọn, foreign sheet 404 giữ business DB hai chiều", async ({
  phien: { f, pages },
  isMobile,
}, info) => {
  for (const [i, page] of pages.entries()) {
    const own = f.orgs[i];
    const selected = own.projects[1];
    await chonDuAnThuHai(page, isMobile, own);
    await page.goto("/");
    const link = page.getByRole("link", { name: isMobile ? "Xuất Excel" : "Excel", exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/api/export/excel");
    const [download, response] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/export/excel" && r.request().method() === "GET",
      ),
      link.click(),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^XBoss-${selected.code}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`),
    );
    expect(await download.failure()).toBeNull();
    const file = info.outputPath(`a1-org-${i}-selected-project.xlsx`);
    await download.saveAs(file);
    await info.attach(`A1-AC01 org ${i} Excel`, {
      path: file,
      contentType: response.headers()["content-type"],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "KPI",
      "Công việc trễ",
      selected.sheetCode,
    ]);
    const kpi = wb.getWorksheet("KPI")!;
    entete(kpi, ["Sheet", "Tổng task", "Tiến độ TB", "Số trễ"]);
    expect(kpi.rowCount).toBe(2);
    expect([1, 2, 3, 4].map((c) => kpi.getRow(2).getCell(c).value)).toEqual([
      selected.sheetCode,
      1,
      0,
      0,
    ]);
    const tracking = wb.getWorksheet(selected.sheetCode)!;
    entete(tracking, [
      "BOQCODE",
      "Mã",
      "Chi tiết công việc",
      "Tầng",
      "Người phụ trách",
      "Bắt đầu",
      "Kết thúc",
      "% Tiến độ",
      "Trạng thái",
      "D1",
      "D2",
    ]);
    expect(tracking.rowCount).toBe(3);
    expect(tracking.getRow(3).getCell(2).value).toBe(selected.taskCode);
    expect(tracking.getRow(3).getCell(3).value).toBe(selected.taskName);
    expect(tracking.getRow(3).getCell(8).value).toBe(0);
    expect(tracking.getRow(3).getCell(9).value).toBe("Chuẩn bị");
    expect([10, 11].map((c) => tracking.getRow(3).getCell(c).value)).toEqual(["○", "○"]);
    const text = JSON.stringify(wb.worksheets.map((ws) => ws.getSheetValues()));
    expect(text).toContain(selected.taskName);
    for (const project of f.orgs.flatMap((org) => org.projects)) {
      if (project.id === selected.id) continue;
      expect(text).not.toContain(project.taskName);
      expect(text).not.toContain(project.taskCode);
      expect(text).not.toContain(project.groupName);
    }
  }
  const before = await Promise.all(f.orgs.map((org) => docNghiepVuA1(f, org)));
  for (const [i, page] of pages.entries()) {
    const foreign = f.orgs[1 - i];
    expect(before[1 - i].tasks).toHaveLength(2);
    expect(
      await goiApi(page, "GET", `/api/export/excel?sheet=${foreign.projects[1].slug}`),
    ).toEqual({
      status: 404,
      body: { error: `Không tìm thấy sheet: ${foreign.projects[1].slug}` },
    });
    expect(await docNghiepVuA1(f, foreign)).toEqual(before[1 - i]);
    expect(await cookieDuAn(page)).toBe(String(f.orgs[i].projects[1].id));
  }
});
