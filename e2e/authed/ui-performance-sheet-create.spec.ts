import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// M137 A: chặn lỗi trước khi POST tới DB test; lần thử lại thành công đi qua API thật.
test.use({ serviceWorkers: "block" });

async function api<T>(request: APIRequestContext, url: string, method = "GET", data?: unknown) {
  const response = await request.fetch(url, { method, data });
  expect(response.ok(), `${method} ${url}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function moForm(page: Page) {
  await page.goto("/");
  const mo = page
    .getByRole("button", { name: "Thêm trang", exact: true })
    .filter({ visible: true })
    .first();
  await expect(mo).toBeEnabled();
  await mo.click();
  const modal = page.getByRole("dialog", { name: "Thêm trang tracking", exact: true });
  await expect(modal).toBeVisible();
  return modal;
}

test("tạo trang: POST chậm không gửi lặp; abort/403/500 giữ bốn trường và retry lưu đúng", async ({
  page,
  request,
}) => {
  const ma = `m137-${crypto.randomUUID().slice(0, 8)}`;
  const { sheet: source } = await api<{ sheet: { id: number } }>(request, "/api/sheets", "POST", {
    name: `Nguồn ${ma}`,
    code: `src-${ma}`,
    slug: `src-${ma}`,
  });
  let createdId: number | undefined;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  const payloads: unknown[] = [];
  try {
    await api(request, "/api/workpackages", "POST", {
      sheetTypeId: source.id,
      code: "N1",
      name: `Nhóm nguồn ${ma}`,
    });
    const modal = await moForm(page);
    // Placeholder có ở baseline: ca RED phải đi tới hành vi gửi, không dừng vì thiếu label.
    const name = modal.getByPlaceholder("VD: Ống nước cấp Zone 3", { exact: true });
    const code = modal.getByPlaceholder("VD: ONC Z3", { exact: true });
    const slug = modal.getByPlaceholder("ong-nuoc-cap-zone-3", { exact: true });
    const copy = modal.locator("select");
    const values = {
      name: `Trang giữ input ${ma}`,
      code: `NEW-${ma}`,
      slug: ma,
      copyFromId: source.id,
    };
    await name.fill(values.name);
    await code.fill(values.code);
    await slug.fill(values.slug);
    await copy.selectOption(String(source.id));
    await page.route("**/api/sheets", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      payloads.push(route.request().postDataJSON());
      if (posts === 1) {
        await pending;
        return route.abort("connectionreset");
      }
      if (posts === 2)
        return route.fulfill({ status: 403, json: { error: "Không được phép tạo trang thử này" } });
      if (posts === 3)
        return route.fulfill({ status: 500, json: { error: "Chưa tạo được trang — hãy thử lại" } });
      const response = await route.fetch();
      if (response.ok()) createdId = (await response.json()).sheet.id;
      return route.fulfill({ response });
    });

    await modal.getByRole("button", { name: "Tạo trang", exact: true }).click();
    const submitting = modal.getByRole("button", { name: "Đang tạo...", exact: true });
    await expect(submitting).toBeDisabled();
    await expect(modal.getByRole("status")).toContainText("Vui lòng chờ trước khi đóng");
    await expect(modal.getByRole("button", { name: "Huỷ", exact: true })).toBeDisabled();
    await expect(name).toHaveAttribute("readonly", "");
    await expect(code).toHaveAttribute("readonly", "");
    await expect(slug).toHaveAttribute("readonly", "");
    await expect(copy).toBeDisabled();
    await expect.poll(() => posts).toBe(1);
    await name.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(slug).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(name).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    // Hai submit đã xếp hàng vẫn phải bị guard chặn, kể cả không đi qua nút disabled.
    await modal.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(posts).toBe(1);
    release();
    await expect(modal.getByRole("alert")).toContainText(/kết nối|mạng/i);
    const submit = modal.getByRole("button", { name: "Tạo trang", exact: true });
    for (const message of [
      undefined,
      "Không được phép tạo trang thử này",
      "Chưa tạo được trang — hãy thử lại",
    ]) {
      if (message) {
        await submit.click();
        await expect(modal.getByRole("alert")).toHaveText(message);
      }
      await expect(submit).toBeEnabled();
      await expect(name).toHaveValue(values.name);
      await expect(code).toHaveValue(values.code);
      await expect(slug).toHaveValue(values.slug);
      await expect(copy).toHaveValue(String(values.copyFromId));
    }
    expect(posts).toBe(3);
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/tracking/${ma}$`));
    await expect(page.getByText(`Nhóm nguồn ${ma}`, { exact: true })).toBeVisible();
    expect(posts).toBe(4);
    expect(payloads).toEqual(Array.from({ length: 4 }, () => values));
    const persisted = await api<{ packages: { name: string }[] }>(
      request,
      `/api/tasks?sheet=${ma}`,
    );
    expect(persisted.packages.map((group) => group.name)).toEqual([`Nhóm nguồn ${ma}`]);
    const list = await api<{ sheets: { slug: string }[] }>(request, "/api/sheets");
    expect(list.sheets.filter((sheet) => sheet.slug === ma)).toHaveLength(1);
  } finally {
    release();
    if (createdId) await api(request, `/api/sheets/${createdId}`, "DELETE");
    await api(request, `/api/sheets/${source.id}`, "DELETE");
  }
});

test("Enter submit form một lần, giữ payload bỏ trống tuỳ chọn và redirect API thật", async ({
  page,
  request,
}) => {
  const ma = `m137-enter-${crypto.randomUUID().slice(0, 8)}`;
  let createdId: number | undefined;
  let posts = 0;
  let payload: unknown;
  try {
    const modal = await moForm(page);
    await modal.getByPlaceholder("VD: Ống nước cấp Zone 3", { exact: true }).fill(ma);
    await modal.getByPlaceholder("VD: ONC Z3", { exact: true }).fill("");
    await modal.getByPlaceholder("ong-nuoc-cap-zone-3", { exact: true }).fill("");
    await modal.locator("select").selectOption("");
    await page.route("**/api/sheets", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      payload = route.request().postDataJSON();
      const response = await route.fetch();
      if (response.ok()) createdId = (await response.json()).sheet.id;
      return route.fulfill({ response });
    });
    await modal.getByPlaceholder("VD: Ống nước cấp Zone 3", { exact: true }).press("Enter");
    await expect.poll(() => posts).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/tracking/${ma}$`));
    expect(payload).toEqual({ name: ma });
    const persisted = await api<{ packages: unknown[] }>(request, `/api/tasks?sheet=${ma}`);
    expect(persisted.packages).toEqual([]);
  } finally {
    if (createdId) await api(request, `/api/sheets/${createdId}`, "DELETE");
  }
});

for (const viewportWidth of [undefined, 360]) {
  test(`form tạo trang ${viewportWidth ? `${viewportWidth}px` : "viewport dự án"}: nhãn/focus/nguồn mặc định, vùng chạm và axe`, async ({
    page,
  }) => {
    if (viewportWidth) await page.setViewportSize({ width: viewportWidth, height: 844 });
    const width = page.viewportSize()!.width;
    const sheetResponse = page.waitForResponse((response) => {
      return (
        new URL(response.url()).pathname === "/api/sheets" &&
        response.request().method() === "GET" &&
        response.ok()
      );
    });
    const modal = await moForm(page);
    const list = (await (await sheetResponse).json()) as { sheets: { id: number }[] };
    expect(list.sheets.length).toBeGreaterThan(0);
    const name = modal.getByRole("textbox", { name: "Tên trang", exact: true });
    const code = modal.getByRole("textbox", { name: "Mã sheet", exact: true });
    const slug = modal.getByRole("textbox", { name: "Đường dẫn", exact: true });
    const copy = modal.getByRole("combobox", { name: "Sao chép cấu trúc từ", exact: true });
    await expect(name).toBeFocused();
    await expect(copy).toHaveValue(String(list.sheets.at(-1)!.id));
    await expect(slug).toHaveAccessibleDescription(/Chỉ dùng chữ thường/);
    await expect(copy).toHaveAccessibleDescription(/nhóm.*công việc.*reset/);
    for (const control of [name, code, slug, copy]) {
      if (width < 640) await expect(control).toHaveCSS("font-size", "16px");
      await expect
        .poll(async () => (await control.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(44);
    }
    await modal.getByText("Mã sheet", { exact: true }).click();
    await expect(code).toBeFocused();
    await name.fill("Trang kiểm nhãn M137");
    const submit = modal.getByRole("button", { name: "Tạo trang", exact: true });
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveCSS("opacity", "1");
    await expect
      .poll(async () => (await submit.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    const result = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const serious = result.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
