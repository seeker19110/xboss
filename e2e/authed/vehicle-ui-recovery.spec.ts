import { test, expect, type Page, type Route, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block", timezoneId: "Asia/Ho_Chi_Minh" });
const car = {
  id: 965001,
  plate: "51C-UI685",
  driver: "Lái xe kiểm chứng",
  driverPhone: "0900000000",
  cargo: "Vật tư kiểm chứng",
  gate: "A",
  expectedAt: "2099-11-12T08:00:00+07:00",
  enteredAt: null,
  exitedAt: null,
  needsCrane: false,
  status: "registered",
  poId: null,
  poCode: null,
  supplierId: 77,
  supplierName: "Nhà cung cấp kiểm chứng",
};
const suppliers = [{ id: 77, name: "Nhà cung cấp kiểm chứng" }];
const dayA = "2099-11-12";
const dayB = "2099-11-13";
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
async function fixture(page: Page, role?: string) {
  const counts = { suppliers: 0, vehicles: 0, posts: 0, patches: 0 };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", (r) =>
    ["GET", "HEAD", "OPTIONS"].includes(r.request().method())
      ? r.continue()
      : r.fulfill({ status: 403, json: { error: "Không ghi ngoài fixture" } }),
  );
  if (role)
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          user: { id: 1, name: "Kiểm chứng", email: "fixture@example.invalid", role },
        },
      }),
    );
  await page.route(/\/api\/vehicles(?:\?.*)?$/, (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    counts.vehicles++;
    return r.fulfill({ json: { vehicles: [car] } });
  });
  await page.route("**/api/suppliers", (r) => {
    counts.suppliers++;
    return r.fulfill({ json: { suppliers } });
  });
  return { counts, errors };
}
async function goto(page: Page) {
  await page.goto("/vehicles");
  await expect(page.getByText(car.plate, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng ký xe", exact: true })).toBeVisible();
}
async function open(page: Page) {
  await page.getByRole("button", { name: "Đăng ký xe", exact: true }).click();
  return page.getByRole("dialog", { name: "Đăng ký xe", exact: true });
}
async function errorGet(r: Route, status = 503) {
  await r.fulfill({ status, json: { error: "Nguồn xe đang lỗi kiểm chứng" } });
}

test("xe: chỉ xem hoặc đổi ngày không tải nhà cung cấp", async ({ page }) => {
  const s = await fixture(page);
  await goto(page);
  await expect.poll(() => s.counts.vehicles).toBe(1);
  expect(s.counts.suppliers).toBe(0);
  await page.getByLabel("Chọn ngày").fill(dayA);
  await expect.poll(() => s.counts.vehicles).toBe(2);
  expect(s.counts.suppliers).toBe(0);
  expect(s.errors).toEqual([]);
});

test("xe: đổi ngày nhanh không nhận response ngày cũ", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  const finished = latch();
  const done = (r: Request) => {
    if (r.url().endsWith(`date=${dayA}`)) finished.release();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  await goto(page);
  await page.route(`**/api/vehicles?date=${dayA}`, async (r) => {
    seen.release();
    await hold.promise;
    await r.fulfill({ json: { vehicles: [{ ...car, plate: "XE-NGAY-CU" }] } }).catch(() => {});
  });
  await page.route(`**/api/vehicles?date=${dayB}`, (r) =>
    r.fulfill({ json: { vehicles: [{ ...car, plate: "XE-NGAY-MOI" }] } }),
  );
  try {
    await page.getByLabel("Chọn ngày").fill(dayA);
    await seen.promise;
    await page.getByLabel("Chọn ngày").fill(dayB);
    await expect(page.getByText("XE-NGAY-MOI", { exact: true })).toBeVisible();
    hold.release();
    await finished.promise;
    await expect(page.getByText("XE-NGAY-MOI", { exact: true })).toBeVisible();
    await expect(page.getByText("XE-NGAY-CU", { exact: true })).toHaveCount(0);
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

test("xe: đang tải không báo danh sách rỗng", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  await page.route(/\/api\/vehicles\?/, async (r) => {
    seen.release();
    await hold.promise;
    await r.fulfill({ json: { vehicles: [] } }).catch(() => {});
  });
  try {
    await page.goto("/vehicles");
    await seen.promise;
    await expect(page.getByText("Đang tải danh sách xe…", { exact: true })).toBeVisible();
    await expect(page.getByText("Chưa có xe nào đăng ký cho ngày này")).toHaveCount(0);
    hold.release();
    await expect(page.getByText("Chưa có xe nào đăng ký cho ngày này")).toBeVisible();
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

for (const failure of ["http", "network", "json"] as const) {
  test(`xe: lỗi ${failure} có retry, không giả rỗng`, async ({ page }) => {
    const s = await fixture(page);
    let calls = 0;
    await page.route(/\/api\/vehicles\?/, async (r) => {
      calls++;
      if (calls === 1) {
        if (failure === "network") return r.abort("failed");
        if (failure === "json") return r.fulfill({ json: { vehicles: null } });
        return errorGet(r);
      }
      return r.fulfill({ json: { vehicles: [car] } });
    });
    await page.goto("/vehicles");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByText("Chưa có xe nào đăng ký cho ngày này")).toHaveCount(0);
    await page.getByRole("button", { name: "Thử tải lại danh sách xe", exact: true }).click();
    await expect(page.getByText(car.plate, { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(calls).toBe(2);
    expect(s.errors).toEqual([]);
  });
}

test("xe: lỗi ngày mới giữ snapshot chỉ xem và retry đúng ngày", async ({ page }) => {
  const s = await fixture(page);
  await goto(page);
  let calls = 0;
  await page.route(`**/api/vehicles?date=${dayA}`, (r) =>
    ++calls === 1
      ? errorGet(r)
      : r.fulfill({ json: { vehicles: [{ ...car, plate: "XE-DUNG-NGAY" }] } }),
  );
  await page.getByLabel("Chọn ngày").fill(dayA);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Nguồn xe đang lỗi kiểm chứng",
  );
  await expect(page.getByText(car.plate, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đã vào", exact: true })).toBeDisabled();
  await expect(page.getByText(/Dữ liệu đang hiển thị thuộc ngày/)).toBeVisible();
  await page.getByRole("button", { name: "Thử tải lại danh sách xe", exact: true }).click();
  await expect(page.getByText("XE-DUNG-NGAY", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đã vào", exact: true })).toBeEnabled();
  expect(s.errors).toEqual([]);
});

test("xe: nhà cung cấp tải khi mở, cache và trả focus khi đóng", async ({ page }) => {
  const s = await fixture(page);
  await goto(page);
  const trigger = page.getByRole("button", { name: "Đăng ký xe", exact: true });
  expect(s.counts.suppliers).toBe(0);
  for (let i = 0; i < 2; i++) {
    const dialog = await open(page);
    await expect(dialog.getByLabel("Nhà cung cấp", { exact: true })).toContainText(
      suppliers[0].name,
    );
    await dialog.getByLabel("Biển số xe", { exact: false }).fill("51C-DRAFT");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(s.counts.suppliers).toBe(1);
  expect(s.errors).toEqual([]);
});

test("xe: lỗi nhà cung cấp báo inline, giữ draft và retry", async ({ page }) => {
  const s = await fixture(page);
  let calls = 0;
  await page.route("**/api/suppliers", (r) =>
    ++calls === 1
      ? r.fulfill({ status: 503, json: { error: "NCC lỗi kiểm chứng" } })
      : r.fulfill({ json: { suppliers } }),
  );
  await goto(page);
  const dialog = await open(page);
  await dialog.getByLabel("Biển số xe", { exact: false }).fill("51C-DRAFT");
  await expect(dialog.getByRole("alert")).toContainText("NCC lỗi kiểm chứng");
  await expect(dialog.getByRole("button", { name: "Đăng ký", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Thử tải lại nhà cung cấp", exact: true }).click();
  await expect(dialog.getByLabel("Nhà cung cấp", { exact: true })).toContainText(suppliers[0].name);
  await expect(dialog.getByLabel("Biển số xe", { exact: false })).toHaveValue("51C-DRAFT");
  await expect(dialog.getByRole("button", { name: "Đăng ký", exact: true })).toBeEnabled();
  expect(calls).toBe(2);
  expect(s.errors).toEqual([]);
});

test("xe: đóng lúc NCC đang tải rồi mở lại không nhận response cũ", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  let calls = 0;
  await page.route("**/api/suppliers", async (r) => {
    if (++calls === 1) {
      seen.release();
      await hold.promise;
      return r.fulfill({ json: { suppliers: [{ id: 88, name: "NCC CŨ" }] } }).catch(() => {});
    }
    return r.fulfill({ json: { suppliers } });
  });
  try {
    await goto(page);
    let dialog = await open(page);
    await seen.promise;
    await dialog.getByLabel("Biển số xe", { exact: false }).fill("51C-GIU");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    dialog = await open(page);
    await expect(dialog.getByLabel("Nhà cung cấp", { exact: true })).toContainText(
      suppliers[0].name,
    );
    hold.release();
    await expect(dialog.getByLabel("Biển số xe", { exact: false })).toHaveValue("51C-GIU");
    await expect(
      dialog.getByLabel("Nhà cung cấp", { exact: true }).locator("option"),
    ).not.toContainText(["NCC CŨ"]);
  } finally {
    hold.release();
  }
  expect(calls).toBe(2);
  expect(s.errors).toEqual([]);
});

test("xe: POST lỗi giữ draft trong modal, retry giữ payload", async ({ page }) => {
  const s = await fixture(page);
  const payloads: unknown[] = [];
  await page.route("**/api/vehicles", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    payloads.push(r.request().postDataJSON());
    return payloads.length === 1
      ? r.fulfill({ status: 422, json: { error: "Biển số bị từ chối kiểm chứng" } })
      : r.fulfill({ status: 201, json: { id: car.id } });
  });
  await goto(page);
  await page.getByLabel("Chọn ngày").fill(dayA);
  const dialog = await open(page);
  await dialog.getByLabel("Biển số xe", { exact: false }).fill(" 51C-POST ");
  await dialog.getByLabel("Giờ dự kiến", { exact: false }).fill("09:15");
  await dialog.getByLabel("Nhà cung cấp", { exact: true }).selectOption("77");
  await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Biển số bị từ chối kiểm chứng");
  await expect(dialog.getByLabel("Biển số xe", { exact: false })).toHaveValue(" 51C-POST ");
  await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads).toEqual(
    Array(2).fill({
      plate: "51C-POST",
      supplierId: 77,
      expectedAt: "2099-11-12T02:15:00.000Z",
      needsCrane: false,
    }),
  );
  expect(s.errors).toEqual([]);
});

test("xe: POST pending chặn bấm lặp, Escape và đóng form", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  let posts = 0;
  await page.route("**/api/vehicles", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    posts++;
    seen.release();
    await hold.promise;
    await r.fulfill({ status: 201, json: { id: car.id } }).catch(() => {});
  });
  try {
    await goto(page);
    const dialog = await open(page);
    await dialog.getByLabel("Biển số xe", { exact: false }).fill("51C-PENDING");
    const submit = dialog.getByRole("button", { name: "Đăng ký", exact: true });
    await expect(submit).toBeEnabled();
    await submit.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
    await seen.promise;
    await expect(dialog.getByRole("button", { name: "Đang đăng ký…", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
    await expect(dialog.getByLabel("Biển số xe", { exact: false })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(posts).toBe(1);
    hold.release();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Đăng ký xe", exact: true })).toBeFocused();
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

test("xe: PATCH pending chỉ gửi một request, lỗi giữ xe và cho thử lại", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  let patches = 0;
  await page.route(`**/api/vehicles/${car.id}`, async (r) => {
    expect(r.request().postDataJSON()).toEqual({ action: "enter" });
    patches++;
    if (patches === 1) {
      seen.release();
      await hold.promise;
      return r
        .fulfill({ status: 409, json: { error: "Xe vừa đổi trạng thái kiểm chứng" } })
        .catch(() => {});
    }
    return r.fulfill({ json: { ok: true, status: "entered" } });
  });
  try {
    await goto(page);
    const enter = page.getByRole("button", { name: "Đã vào", exact: true });
    await enter.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
    await seen.promise;
    await expect(enter).toBeDisabled();
    await expect(page.getByLabel("Chọn ngày")).toBeDisabled();
    expect(patches).toBe(1);
    hold.release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Xe vừa đổi trạng thái kiểm chứng",
    );
    await expect(enter).toBeEnabled();
    await enter.click();
    await expect.poll(() => patches).toBe(2);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

for (const role of ["viewer", "bch", "cdt"]) {
  test(`xe: ${role} chỉ xem, không request NCC hay nút ghi`, async ({ page }) => {
    const s = await fixture(page, role);
    await page.goto("/vehicles");
    await expect(page.getByText(car.plate, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng ký xe", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Đã vào", exact: true })).toHaveCount(0);
    expect(s.counts.suppliers).toBe(0);
    expect(s.errors).toEqual([]);
  });
}

test("xe: 401 danh sách quay về login theo cơ chế hiện hữu", async ({ page }) => {
  const s = await fixture(page);
  await page.route(/\/api\/vehicles\?/, (r) =>
    r.fulfill({ status: 401, json: { error: "Phiên hết hạn" } }),
  );
  await page.goto("/vehicles");
  await expect(page).toHaveURL(/\/login$/);
  expect(s.errors).toEqual([]);
});

test("xe: modal keyboard, 16px mobile và axe hai theme", async ({ page }, info) => {
  const s = await fixture(page);
  await page.setViewportSize({
    width: info.project.name.includes("mobile") ? 360 : 1280,
    height: 800,
  });
  await goto(page);
  for (const theme of ["light", "darkblue"]) {
    await page.evaluate((t) => localStorage.setItem("xboss_theme", t), theme);
    await goto(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    const dialog = await open(page);
    await expect(dialog.getByLabel("Biển số xe", { exact: false })).toBeVisible();
    const controls = dialog.locator("input:not([type=checkbox]), select");
    if (info.project.name.includes("mobile"))
      for (const c of await controls.all()) await expect(c).toHaveCSS("font-size", "16px");
    for (const c of await controls.all()) {
      const box = await c.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      info.project.name.includes("mobile") ? 360 : 1280,
    );
    await expect(dialog.getByLabel("Nhà cung cấp", { exact: true })).toContainText(
      suppliers[0].name,
    );
    await expect(dialog.getByRole("button", { name: "Đăng ký", exact: true })).toBeEnabled();
    // Đo trạng thái sẵn sàng sau transition tự hoàn tất; giữ motion và ngưỡng axe mặc định.
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
    const cancel = dialog.getByRole("button", { name: "Huỷ", exact: true });
    await cancel.focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Đăng ký xe", exact: true })).toBeFocused();
  }
  expect(s.errors).toEqual([]);
});

test("xe: ngày trống không gọi API vô điều kiện hay ghi lên snapshot cũ", async ({ page }) => {
  const s = await fixture(page);
  await goto(page);
  await page.getByLabel("Chọn ngày").fill("");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chọn ngày hợp lệ");
  await expect(page.getByRole("button", { name: "Đã vào", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Đăng ký xe", exact: true })).toBeDisabled();
  expect(s.counts.vehicles).toBe(1);
  expect(s.errors).toEqual([]);
});

test("xe: NCC rỗng hợp lệ vẫn đăng ký được, giờ trống báo đúng lỗi", async ({ page }) => {
  const s = await fixture(page);
  await page.route("**/api/suppliers", (r) => r.fulfill({ json: { suppliers: [] } }));
  await goto(page);
  const dialog = await open(page);
  await dialog.getByLabel("Biển số xe", { exact: false }).fill("51C-EMPTY-NCC");
  const submit = dialog.getByRole("button", { name: "Đăng ký", exact: true });
  await expect(submit).toBeEnabled();
  await dialog.getByLabel("Giờ dự kiến", { exact: false }).fill("");
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("Chọn giờ dự kiến hợp lệ");
  await expect(dialog.getByLabel("Biển số xe", { exact: false })).toHaveValue("51C-EMPTY-NCC");
  expect(s.errors).toEqual([]);
});

test("xe: PATCH thành công nhưng refresh lỗi giữ snapshot chỉ xem cho tới retry", async ({
  page,
}) => {
  const s = await fixture(page);
  let lists = 0;
  await page.route(/\/api\/vehicles\?/, (r) =>
    ++lists === 2
      ? errorGet(r)
      : r.fulfill({
          json: { vehicles: [{ ...car, status: lists >= 3 ? "entered" : "registered" }] },
        }),
  );
  await page.route(`**/api/vehicles/${car.id}`, (r) =>
    r.fulfill({ json: { ok: true, status: "entered" } }),
  );
  await goto(page);
  await page.getByRole("button", { name: "Đã vào", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Nguồn xe đang lỗi kiểm chứng",
  );
  await expect(page.getByRole("button", { name: "Đã vào", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Thử tải lại danh sách xe", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đã ra", exact: true })).toBeEnabled();
  expect(s.errors).toEqual([]);
});

test("xe: dữ liệu dài vẫn đọc được tại 360px", async ({ page }) => {
  const s = await fixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  const longPlate = "51C-" + "A".repeat(100);
  const longCargo = "https://fixture.invalid/" + "Z".repeat(300);
  await page.route(/\/api\/vehicles\?/, (r) =>
    r.fulfill({
      json: {
        vehicles: [
          { ...car, plate: longPlate, cargo: longCargo, supplierName: "NCC-" + "N".repeat(140) },
        ],
      },
    }),
  );
  await page.goto("/vehicles");
  await expect(page.getByText(longPlate, { exact: true })).toBeVisible();
  await expect(page.getByText(longCargo, { exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
  expect(s.errors).toEqual([]);
});

for (const phase of ["supplier", "patch"] as const) {
  test(`xe: 401 ${phase} đi theo redirect hiện hữu`, async ({ page }) => {
    const s = await fixture(page);
    if (phase === "supplier")
      await page.route("**/api/suppliers", (r) =>
        r.fulfill({ status: 401, json: { error: "Phiên hết hạn" } }),
      );
    else
      await page.route(`**/api/vehicles/${car.id}`, (r) =>
        r.fulfill({ status: 401, json: { error: "Phiên hết hạn" } }),
      );
    await goto(page);
    if (phase === "supplier")
      await page.getByRole("button", { name: "Đăng ký xe", exact: true }).click();
    else await page.getByRole("button", { name: "Đã vào", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(s.errors).toEqual([]);
  });
}

test("xe: huỷ xác nhận không ghi và trả focus, đồng ý chỉ gửi một PATCH", async ({ page }) => {
  const s = await fixture(page);
  let patches = 0;
  await page.route(/\/api\/vehicles\?/, (r) =>
    r.fulfill({ json: { vehicles: [{ ...car, status: patches ? "no_show" : "registered" }] } }),
  );
  await page.route(`**/api/vehicles/${car.id}`, (r) => {
    expect(r.request().postDataJSON()).toEqual({ action: "no_show" });
    patches++;
    return r.fulfill({ json: { ok: true, status: "no_show" } });
  });
  await goto(page);
  const trigger = page.getByRole("button", { name: "Không đến", exact: true });
  await trigger.click();
  let confirm = page.getByRole("dialog", { name: /Đánh dấu xe/ });
  await confirm.getByRole("button", { name: "Huỷ", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(trigger).toBeEnabled();
  await expect(trigger).toBeFocused();
  expect(patches).toBe(0);
  await trigger.click();
  confirm = page.getByRole("dialog", { name: /Đánh dấu xe/ });
  await confirm.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect.poll(() => patches).toBe(1);
  await expect(trigger).toHaveCount(0);
  expect(s.errors).toEqual([]);
});

test("xe: thầu phụ giữ thao tác vào/ra hiện hữu, không có điều phối/NCC", async ({ page }) => {
  const s = await fixture(page, "subcon");
  await page.goto("/vehicles");
  await expect(page.getByText(car.plate, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đã vào", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Duyệt", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Không đến", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đăng ký xe", exact: true })).toHaveCount(0);
  expect(s.counts.suppliers).toBe(0);
  expect(s.errors).toEqual([]);
});

test("xe: POST mất mạng giữ draft và lỗi trong modal, không gửi lại tự động", async ({ page }) => {
  const s = await fixture(page);
  let posts = 0;
  await page.route("**/api/vehicles", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    posts++;
    return r.abort("failed");
  });
  await goto(page);
  const dialog = await open(page);
  await dialog.getByLabel("Biển số xe", { exact: false }).fill("51C-MAT-MANG");
  await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Mất kết nối mạng");
  await expect(dialog.getByLabel("Biển số xe", { exact: false })).toHaveValue("51C-MAT-MANG");
  await expect(dialog.getByRole("button", { name: "Đăng ký", exact: true })).toBeEnabled();
  expect(posts).toBe(1);
  expect(s.errors).toEqual([]);
});

test("xe: thẻ quá giờ vẫn đạt axe ở Sáng và Dark Blue", async ({ page }) => {
  const s = await fixture(page);
  await page.route(/\/api\/vehicles\?/, (r) =>
    r.fulfill({
      json: { vehicles: [{ ...car, expectedAt: "2000-01-01T08:00:00+07:00", needsCrane: true }] },
    }),
  );
  await goto(page);
  for (const theme of ["light", "darkblue"]) {
    await page.evaluate((t) => localStorage.setItem("xboss_theme", t), theme);
    await goto(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(page.getByText("Quá giờ", { exact: true })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
  }
  expect(s.errors).toEqual([]);
});

test("xe: lỗi danh sách, snapshot và NCC đạt axe hai theme", async ({ page }) => {
  const s = await fixture(page);
  let listError = false;
  await page.route(/\/api\/vehicles\?/, (r) =>
    listError ? errorGet(r) : r.fulfill({ json: { vehicles: [car] } }),
  );
  await page.route("**/api/suppliers", (r) =>
    r.fulfill({ status: 503, json: { error: "NCC lỗi kiểm chứng tương phản" } }),
  );
  await goto(page);
  for (const theme of ["light", "darkblue"]) {
    await page.evaluate((t) => localStorage.setItem("xboss_theme", t), theme);
    await goto(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    listError = true;
    await page.getByLabel("Chọn ngày").fill(dayA);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    let result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
    listError = false;
    await page.getByRole("button", { name: "Thử tải lại danh sách xe", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    const dialog = await open(page);
    await expect(dialog.getByRole("alert")).toBeVisible();
    result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  expect(s.errors).toEqual([]);
});

test("xe: nút Đã ra khi hover vẫn đạt axe hai theme", async ({ page }) => {
  const s = await fixture(page);
  await page.route(/\/api\/vehicles\?/, (r) =>
    r.fulfill({
      json: { vehicles: [{ ...car, status: "entered", enteredAt: "2099-11-12T01:00:00Z" }] },
    }),
  );
  await goto(page);
  for (const theme of ["light", "darkblue"]) {
    await page.evaluate((t) => localStorage.setItem("xboss_theme", t), theme);
    await goto(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await page.getByRole("button", { name: "Đã ra", exact: true }).hover();
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
  }
  expect(s.errors).toEqual([]);
});
