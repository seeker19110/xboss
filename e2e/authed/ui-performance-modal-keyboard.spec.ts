import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

type Sheet = { id: number; slug: string };

async function api<T>(request: APIRequestContext, url: string, method: string, data?: unknown) {
  const response = await request.fetch(url, { method, data });
  expect(response.ok(), `${method} ${url}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

const test = base.extend<{ modalSheet: Sheet }>({
  modalSheet: async ({ request }, suDungSheet) => {
    const slug = `modal-${crypto.randomUUID().slice(0, 8)}`;
    const { sheet } = await api<{ sheet: { id: number } }>(request, "/api/sheets", "POST", {
      code: slug,
      name: `Trang ${slug}`,
      slug,
    });
    try {
      await suDungSheet({ id: sheet.id, slug });
    } finally {
      await api(request, `/api/sheets/${sheet.id}`, "DELETE");
    }
  },
});

test.use({ serviceWorkers: "block" });

async function moCaiDat(page: Page, sheet: Sheet) {
  await page.goto(`/tracking/${sheet.slug}`);
  await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
  const overflowTruoc = await page.locator("body").evaluate((body) => body.style.overflow);
  const trigger = page.getByRole("button", { name: "Đổi tên / đường dẫn trang" });
  await trigger.click();
  const form = page.getByRole("dialog", { name: "Cài đặt trang tracking", exact: true });
  await expect(form).toBeVisible();
  const ten = form.getByRole("textbox", { name: "Tên trang", exact: true });
  const banNhap = `Bản nhập chưa lưu ${sheet.slug}`;
  await ten.fill(banNhap);
  return {
    form,
    ten,
    banNhap,
    trigger,
    overflowTruoc,
    nutXoa: form.getByRole("button", { name: "Xoá trang", exact: true }),
  };
}

async function moXacNhan(page: Page, nutXoa: Locator) {
  await nutXoa.click();
  const confirm = page.getByRole("dialog", { name: /^Xoá trang / });
  await expect(confirm).toBeVisible();
  return confirm;
}

async function kiemOverflow(page: Page, expected: string) {
  await expect
    .poll(() => page.locator("body").evaluate((body) => body.style.overflow))
    .toBe(expected);
}

test("M137: Escape chỉ hủy xác nhận trên cùng, giữ form và bản nhập, không gửi DELETE", async ({
  page,
  modalSheet,
}) => {
  let soDelete = 0;
  let soPatch = 0;
  await page.route(`**/api/sheets/${modalSheet.id}`, async (route) => {
    const method = route.request().method();
    if (method !== "DELETE" && method !== "PATCH") return route.continue();
    if (method === "DELETE") soDelete++;
    else soPatch++;
    return route.fulfill({ status: 500, json: { error: "Không ghi dữ liệu trong ca hủy" } });
  });
  const { form, ten, banNhap, trigger, overflowTruoc, nutXoa } = await moCaiDat(page, modalSheet);
  const confirm = await moXacNhan(page, nutXoa);
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(ten).toHaveValue(banNhap);
  await expect(nutXoa).toBeFocused();
  await kiemOverflow(page, "hidden");
  expect(soDelete).toBe(0);
  expect(soPatch).toBe(0);

  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await kiemOverflow(page, overflowTruoc);
  expect(soDelete).toBe(0);
  expect(soPatch).toBe(0);
});

test("M137: Tab và Shift+Tab chỉ luân chuyển trong confirm, bỏ control bị ẩn", async ({
  page,
  modalSheet,
}) => {
  const { form, ten, banNhap, nutXoa, overflowTruoc } = await moCaiDat(page, modalSheet);
  const confirm = await moXacNhan(page, nutXoa);
  // Chỉ đổi trạng thái hiển thị control có sẵn, không dựng modal/harness giả.
  await confirm.getByRole("button", { name: "Xoá trang", exact: true }).evaluate((button) => {
    if (button instanceof HTMLElement) button.hidden = true;
  });
  const dong = confirm.getByRole("button", { name: "Đóng", exact: true });
  const huy = confirm.getByRole("button", { name: "Huỷ", exact: true });
  await huy.focus();
  await page.keyboard.press("Tab");
  await expect(dong).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(huy).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dong).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(huy).toBeFocused();

  await huy.click();
  await expect(confirm).toHaveCount(0);
  await expect(nutXoa).toBeFocused();
  await expect(ten).toHaveValue(banNhap);
  await form.getByRole("button", { name: "Huỷ", exact: true }).click();
  await kiemOverflow(page, overflowTruoc);
});

test("M137: fieldset đang lưu không làm Tab thoát modal, focus panel khi mọi control disabled", async ({
  page,
  modalSheet,
}) => {
  let thaRequest = () => {};
  const cho = new Promise<void>((resolve) => (thaRequest = resolve));
  let soPatch = 0;
  await page.route(`**/api/sheets/${modalSheet.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    soPatch++;
    await cho;
    await route
      .fulfill({ status: 403, json: { error: "Chưa được phép lưu trong ca kiểm pending" } })
      .catch(() => {});
  });
  const { form, ten, banNhap, trigger, overflowTruoc } = await moCaiDat(page, modalSheet);
  try {
    await form.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(form.locator("fieldset")).toHaveJSProperty("disabled", true);
    await expect(ten).toBeDisabled();
    await expect(form.getByRole("button", { name: "Đang lưu...", exact: true })).toBeDisabled();
    await expect.poll(() => soPatch).toBe(1);
    await page.keyboard.press("Tab");
    await expect(form).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(form).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(form).toBeVisible();
    await kiemOverflow(page, "hidden");
    thaRequest();
    await expect(form.getByRole("alert")).toHaveText("Chưa được phép lưu trong ca kiểm pending");
    await expect(ten).toHaveValue(banNhap);
    await form.getByRole("button", { name: "Huỷ", exact: true }).click();
    await expect(trigger).toBeFocused();
    await kiemOverflow(page, overflowTruoc);
  } finally {
    thaRequest();
  }
});

test("M137: confirm không còn control nhìn thấy dùng panel dự phòng cho Tab hai chiều", async ({
  page,
  modalSheet,
}) => {
  const { form, ten, banNhap, nutXoa } = await moCaiDat(page, modalSheet);
  const confirm = await moXacNhan(page, nutXoa);
  await confirm.locator("button").evaluateAll((buttons) => {
    for (const button of buttons) {
      if (button instanceof HTMLElement) button.hidden = true;
    }
  });
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(ten).toHaveValue(banNhap);
  await expect(nutXoa).toBeFocused();
});

test("M137: unmount cha trước confirm giữ khóa scroll, đóng hết trả focus về trigger còn tồn tại", async ({
  page,
  modalSheet,
}) => {
  const { form, trigger, nutXoa, overflowTruoc } = await moCaiDat(page, modalSheet);
  const confirm = await moXacNhan(page, nutXoa);
  // Gọi handler của nút có sẵn để kiểm lifecycle cha unmount khi con còn mở;
  // không gọi React internals, không xóa DOM hoặc thêm route test vào ứng dụng.
  await form.getByRole("button", { name: "Huỷ", exact: true }).dispatchEvent("click");
  await expect(form).toHaveCount(0);
  await expect(confirm).toBeVisible();
  await kiemOverflow(page, "hidden");
  await expect
    .poll(() => confirm.evaluate((panel) => panel.contains(document.activeElement)))
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await kiemOverflow(page, overflowTruoc);
});
