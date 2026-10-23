import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// M136 FR1–3: lỗi mạng/HTTP trong trình duyệt thật, không chỉ kiểm chuỗi source.
// Mỗi ca tạo sheet riêng; request lỗi được chặn trước khi tới DB test.
test.use({ serviceWorkers: "block" });

async function api<T>(request: APIRequestContext, url: string, method = "GET", data?: unknown) {
  const res = await request.fetch(url, { method, data });
  expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function taoSheet(request: APIRequestContext) {
  const ma = `field-${crypto.randomUUID().slice(0, 8)}`;
  const { sheet } = await api<{ sheet: { id: number } }>(request, "/api/sheets", "POST", {
    code: ma,
    name: `Trang ${ma}`,
    slug: ma,
  });
  await api(request, "/api/workpackages", "POST", {
    sheetTypeId: sheet.id,
    code: "N1",
    name: `Nhóm ${ma}`,
  });
  const { packages } = await api<{ packages: { id: number }[] }>(request, `/api/tasks?sheet=${ma}`);
  return { id: sheet.id, slug: ma, tenNhom: `Nhóm ${ma}`, nhomId: packages[0].id };
}

async function moTrangSua(page: Page, slug: string) {
  await page.goto(`/tracking/${slug}`);
  await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
  await expect(page.getByRole("button", { name: "Thêm hạng mục", exact: true })).toBeVisible();
}

// Giữ request đầu đủ lâu để kiểm pending/chặn gửi lặp; sau đó mô phỏng mất kết nối.
function matMangCoCho() {
  let tiepTuc!: () => void;
  const cho = new Promise<void>((resolve) => (tiepTuc = resolve));
  return {
    tiepTuc: () => tiepTuc(),
    xuLy: async (route: Route) => {
      await cho;
      await route.abort("connectionreset");
    },
  };
}

async function kiemModalA11y(page: Page) {
  // Button chuyển opacity 0.4 → 1 khi hết pending; axe cần màu render đã ổn định.
  const submit = page.getByRole("dialog").getByRole("button", { name: /^(Tạo hạng mục|Lưu)$/ });
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("opacity", "1");
  const kq = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  const loi = kq.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(loi, JSON.stringify(loi, null, 2)).toEqual([]);
}

for (const saoChep of [false, true]) {
  test(`thêm nhóm ${saoChep ? "sao chép" : "trống"}: mất mạng/500 giữ input và thử lại`, async ({
    page,
    request,
  }) => {
    const sheet = await taoSheet(request);
    const matMang = matMangCoCho();
    let soLan = 0;
    try {
      await moTrangSua(page, sheet.slug);
      await page.getByRole("button", { name: "Thêm hạng mục", exact: true }).click();
      const modal = page.getByRole("dialog");
      const inputs = modal.locator("input");
      await inputs.nth(0).fill("N2");
      await inputs.nth(1).fill("Hạng mục giữ nguyên khi lỗi");
      if (saoChep) await modal.locator("select").selectOption(String(sheet.nhomId));
      const url = saoChep ? `**/api/workpackages/${sheet.nhomId}/copy` : "**/api/workpackages";
      await page.route(url, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        soLan++;
        if (soLan === 1) return matMang.xuLy(route);
        if (soLan === 2)
          return route.fulfill({ status: 500, json: { error: "Không tạo được — thử lại" } });
        return route.continue();
      });

      await modal.getByRole("button", { name: "Tạo hạng mục" }).click();
      const dangLuu = modal.getByRole("button", { name: "Đang lưu...", exact: true });
      await expect(dangLuu).toBeDisabled();
      await dangLuu.evaluate((el: HTMLButtonElement) => el.click());
      expect(soLan).toBe(1);
      matMang.tiepTuc();
      await expect(modal.getByRole("alert")).toContainText(/kết nối|mạng/i);
      await expect(inputs.nth(0)).toHaveValue("N2");
      await expect(inputs.nth(1)).toHaveValue("Hạng mục giữ nguyên khi lỗi");
      await kiemModalA11y(page);
      const tao = modal.getByRole("button", { name: "Tạo hạng mục" });
      await expect(tao).toBeEnabled();
      await tao.click();
      await expect(modal.getByRole("alert")).toHaveText("Không tạo được — thử lại");
      await expect(inputs.nth(1)).toHaveValue("Hạng mục giữ nguyên khi lỗi");
      await tao.click();
      await expect(modal).toBeHidden();
      await expect(page.getByText("Hạng mục giữ nguyên khi lỗi", { exact: true })).toBeVisible();
      const daLuu = await api<{ packages: { code: string }[] }>(
        request,
        `/api/tasks?sheet=${sheet.slug}`,
      );
      expect(daLuu.packages.filter((p) => p.code === "N2")).toHaveLength(1);
      expect(soLan).toBe(3);
    } finally {
      matMang.tiepTuc();
      await api(request, `/api/sheets/${sheet.id}`, "DELETE");
    }
  });
}

test("sửa sheet: pending chặn gửi lặp, lỗi mạng/403 giữ input, lần thử lại lưu được", async ({
  page,
  request,
  isMobile,
}) => {
  const sheet = await taoSheet(request);
  const matMang = matMangCoCho();
  let soLan = 0;
  try {
    await moTrangSua(page, sheet.slug);
    const caiDatTrang = page.getByRole("button", { name: "Đổi tên / đường dẫn trang" });
    await expect(caiDatTrang).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => (await caiDatTrang.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(44);
    await expect
      .poll(async () => (await caiDatTrang.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    if (isMobile)
      await expect(page.locator("body")).toHaveJSProperty(
        "scrollWidth",
        page.viewportSize()!.width,
      );
    // Giới hạn action để lỗi bị che/không chạm được hiện đúng tại đây, trước thời hạn teardown.
    await caiDatTrang.click({ timeout: 5000 });
    const modal = page.getByRole("dialog");
    const ten = modal.locator("input").first();
    await ten.fill("Tên sheet sau khi thử lại");
    await page.route(`**/api/sheets/${sheet.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      soLan++;
      if (soLan === 1) return matMang.xuLy(route);
      if (soLan === 2)
        return route.fulfill({ status: 403, json: { error: "Chưa được phép lưu thay đổi" } });
      return route.continue();
    });
    await modal.getByRole("button", { name: "Lưu", exact: true }).click();
    const dangLuu = modal.getByRole("button", { name: "Đang lưu...", exact: true });
    await expect(dangLuu).toBeDisabled();
    await dangLuu.evaluate((el: HTMLButtonElement) => el.click());
    expect(soLan).toBe(1);
    matMang.tiepTuc();
    await expect(modal.getByRole("alert")).toContainText(/kết nối|mạng/i);
    await expect(ten).toHaveValue("Tên sheet sau khi thử lại");
    await kiemModalA11y(page);
    await modal.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(modal.getByRole("alert")).toHaveText("Chưa được phép lưu thay đổi");
    await expect(ten).toHaveValue("Tên sheet sau khi thử lại");
    await modal.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator("header")).toContainText("Tên sheet sau khi thử lại");
    expect(soLan).toBe(3);
  } finally {
    matMang.tiepTuc();
    await api(request, `/api/sheets/${sheet.id}`, "DELETE");
  }
});

test("nhóm tracking mở bằng Enter, thu bằng Space và giữ tay nắm kéo M135", async ({
  page,
  request,
}) => {
  const sheet = await taoSheet(request);
  try {
    await api(request, `/api/workpackages/${sheet.nhomId}/tasks`, "POST", {
      code: "T1",
      name: "Việc bàn phím",
    });
    await api(request, `/api/workpackages/${sheet.nhomId}/dimensions/column`, "POST", {
      label: "C1",
    });
    await moTrangSua(page, sheet.slug);
    const moNhom = page.getByRole("button", { name: `Mở nhóm ${sheet.tenNhom}`, exact: true });
    await expect(moNhom).toHaveAttribute("aria-expanded", "false");
    await moNhom.focus();
    await page.keyboard.press("Enter");
    const thuNhom = page.getByRole("button", { name: `Thu nhóm ${sheet.tenNhom}`, exact: true });
    await expect(thuNhom).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("checkbox", { name: /C1.*Việc bàn phím/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kéo để đổi vị trí nhóm" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Kéo để đổi vị trí task T1" })).toHaveCount(1);
    await thuNhom.focus();
    await page.keyboard.press("Space");
    await expect(moNhom).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("checkbox", { name: /C1.*Việc bàn phím/ })).toHaveCount(0);
    await expect(moNhom).toBeFocused();
  } finally {
    await api(request, `/api/sheets/${sheet.id}`, "DELETE");
  }
});

test("thanh lọc tracking và tab phân hệ bám ngay dưới header sau khi cuộn", async ({
  page,
  isMobile,
}) => {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 480 });
  for (const route of ["/tracking/ogtd", "/site"]) {
    await test.step(route, async () => {
      await page.goto(route);
      const header = page.getByRole("banner");
      await expect(header).toBeVisible();
      let toolbar: Locator;
      if (route.startsWith("/tracking/")) {
        const search = page.getByRole("textbox", { name: "Tìm kiếm trong bảng tracking" });
        await expect(search).toBeVisible();
        toolbar = search.locator("xpath=../..");
        await page
          .getByRole("button", { name: /^Mở nhóm / })
          .first()
          .click();
        await expect(
          page.getByRole("columnheader", { name: "Công việc", exact: true }),
        ).toBeVisible();
      } else {
        const tabs = page.getByRole("tablist", { name: "Các phân hệ nghiệp vụ" });
        await expect(tabs).toBeVisible();
        toolbar = tabs.locator("xpath=..");
      }
      // Bên trong header có chiều cao từ CSS variable; border và safe-area ở lớp ngoài.
      await expect(header.locator(":scope > div")).toHaveCSS("height", isMobile ? "96px" : "48px");
      await expect
        .poll(() =>
          page.evaluate(() => {
            window.scrollTo(0, 600);
            return window.scrollY;
          }),
        )
        .toBeGreaterThan(100);
      await expect
        .poll(async () => {
          const head = await header.boundingBox();
          const bar = await toolbar.boundingBox();
          const cssTop = await toolbar.evaluate((element) =>
            parseFloat(getComputedStyle(element).top),
          );
          return (
            !!head &&
            !!bar &&
            Math.abs(bar.y - (head.y + head.height)) <= 1 &&
            Math.abs(bar.y - cssTop) <= 1
          );
        })
        .toBe(true);
    });
  }
});

test("dashboard: đổi lý do trễ báo pending/lỗi, giữ giá trị cũ và cho thử lại", async ({
  page,
  request,
}) => {
  const dash = await api<Record<string, unknown>>(request, "/api/dashboard");
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      json: {
        ...dash,
        delayedTasks: [
          {
            id: 900001,
            name: "Công việc thử lý do trễ",
            status: "tre",
            endDate: "2020-01-01",
            progressPercent: 0,
            floorLabel: "1F",
            sheetType: "OGTĐ",
            sheetSlug: "ogtd",
            delayReason: null,
          },
        ],
      },
    }),
  );
  const matMang = matMangCoCho();
  let soLan = 0;
  await page.route("**/api/tasks/900001/delay-reason", async (route) => {
    soLan++;
    if (soLan === 1) return matMang.xuLy(route);
    if (soLan === 2) return route.fulfill({ status: 500, json: { error: "Chưa lưu được lý do" } });
    return route.fulfill({ json: { ok: true } });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Xem công tác trễ" }).click();
    const lyDo = page.getByRole("combobox", { name: "Nguyên nhân trễ", exact: true });
    const moi = await lyDo.locator('option:not([value=""])').first().getAttribute("value");
    expect(moi).toBeTruthy();
    await lyDo.selectOption(moi!);
    await expect(lyDo).toBeDisabled();
    const noiDung = page.getByRole("main");
    await expect(
      noiDung.getByRole("status").filter({ hasText: "Đang lưu lý do trễ" }),
    ).toBeVisible();
    matMang.tiepTuc();
    await expect(noiDung.getByRole("alert")).toContainText(/kết nối|mạng/i);
    await expect(lyDo).toBeEnabled();
    await expect(lyDo).toHaveValue("");
    await lyDo.selectOption(moi!);
    await expect(noiDung.getByRole("alert")).toContainText("Chưa lưu được lý do");
    await expect(lyDo).toHaveValue("");
    await lyDo.selectOption(moi!);
    await expect(lyDo).toHaveValue(moi!);
    await expect(noiDung.getByRole("status").filter({ hasText: "Đã lưu lý do trễ" })).toBeVisible();
    expect(soLan).toBe(3);
  } finally {
    matMang.tiepTuc();
  }
});

test("dashboard: đổi thứ tự thất bại rollback, thử kéo lại nhận xác nhận", async ({
  page,
  request,
}) => {
  const dash = await api<{ kpi: { sheetId: number }[] }>(request, "/api/dashboard");
  expect(dash.kpi.length).toBeGreaterThan(1);
  const matMang = matMangCoCho();
  let soLan = 0;
  let idsDaGui: number[] = [];
  await page.route("**/api/sheets", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    soLan++;
    idsDaGui = route.request().postDataJSON().ids;
    if (soLan === 1) return matMang.xuLy(route);
    return route.fulfill({ json: { ok: true } });
  });
  try {
    await page.goto("/?tab=sheets");
    const noiDung = page.getByRole("main");
    const ds = page.getByRole("tabpanel");
    const hang = ds.locator("[draggable]");
    await expect(hang).toHaveCount(dash.kpi.length);
    const cu = await hang.allTextContents();
    const keo = async () => {
      await hang.nth(0).dispatchEvent("dragstart");
      await hang.nth(1).dispatchEvent("dragover");
      await hang.nth(1).dispatchEvent("drop");
    };
    await keo();
    await expect(noiDung.getByRole("status").filter({ hasText: "Đang lưu thứ tự" })).toBeVisible();
    await expect(hang.nth(0)).toHaveText(cu[1]);
    const ids = dash.kpi.map((k) => k.sheetId);
    [ids[0], ids[1]] = [ids[1], ids[0]];
    expect(idsDaGui).toEqual(ids);
    matMang.tiepTuc();
    await expect(noiDung.getByRole("alert")).toContainText(/kết nối|mạng/i);
    await expect.poll(() => hang.allTextContents()).toEqual(cu);
    await keo();
    await expect(noiDung.getByRole("status").filter({ hasText: "Đã lưu thứ tự" })).toBeVisible();
    await expect(hang.nth(0)).toHaveText(cu[1]);
    expect(soLan).toBe(2);
  } finally {
    matMang.tiepTuc();
  }
});
