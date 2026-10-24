import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });

async function api<T>(request: APIRequestContext, url: string, method = "GET", data?: unknown) {
  const response = await request.fetch(url, { method, data });
  expect(response.ok(), `${method} ${url}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

function barrier() {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

async function moTaoHangMuc(page: Page) {
  await page.goto("/progress/acmv");
  const trigger = page.getByRole("button", { name: "Thêm hạng mục", exact: true });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Thêm hạng mục cho hệ ACMV", exact: true });
  await expect(modal).toBeVisible();
  return { modal, trigger };
}

async function moCaiDat(page: Page) {
  await page.goto("/tracking/ogtd");
  await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
  await page.getByRole("button", { name: "Đổi tên / đường dẫn trang" }).click();
  const modal = page.getByRole("dialog").filter({ has: page.locator("#sheet-name") });
  await expect(modal).toBeVisible();
  return { modal, heading: modal.getByRole("heading", { level: 3 }) };
}

test("hạng mục: Enter khi POST chậm chỉ gửi một lần; abort/403/500 giữ tên và retry API thật", async ({
  page,
  request,
}) => {
  const name = `reliable-${crypto.randomUUID().slice(0, 8)}`;
  const { system } = await api<{ system: { id: number } }>(request, "/api/systems/acmv/summary");
  let createdId: number | undefined;
  const gate = barrier();
  let posts = 0;
  const payloads: unknown[] = [];
  try {
    const { modal } = await moTaoHangMuc(page);
    const input = modal.getByPlaceholder("VD: ACMV Zone 3");
    await input.fill(name);
    await page.route("**/api/sheets", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      payloads.push(route.request().postDataJSON());
      if (posts === 1) {
        await gate.pending;
        return route.abort("connectionreset");
      }
      if (posts === 2)
        return route.fulfill({ status: 403, json: { error: "Không có quyền tạo hạng mục thử" } });
      if (posts === 3)
        return route.fulfill({ status: 500, json: { error: "Chưa tạo được hạng mục thử" } });
      const response = await route.fetch();
      if (response.ok()) createdId = (await response.json()).sheet.id;
      return route.fulfill({ response });
    });
    await input.press("Enter");
    await expect.poll(() => posts).toBe(1);
    await expect(modal.getByRole("button", { name: "Đang tạo…", exact: true })).toBeDisabled();
    await input.press("Enter");
    await input.press("Enter");
    await expect
      .poll(() => posts, { message: "Số POST sau hai Enter khi yêu cầu đầu còn chờ" })
      .toBe(1);
    await expect(modal.getByRole("button", { name: "Đang tạo…", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    gate.release();
    await expect(modal.getByRole("alert")).toContainText(/kết nối|mạng/i);
    const submit = modal.getByRole("button", { name: "Tạo hạng mục", exact: true });
    for (const message of ["Không có quyền tạo hạng mục thử", "Chưa tạo được hạng mục thử"]) {
      await expect(input).toHaveValue(name);
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect(modal.getByRole("alert")).toHaveText(message);
    }
    await expect(input).toHaveValue(name);
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/tracking/${name}$`));
    expect(posts).toBe(4);
    expect(payloads).toEqual(Array.from({ length: 4 }, () => ({ name, systemId: system.id })));
    const list = await api<{ sheets: { id: number; systemId: number }[] }>(request, "/api/sheets");
    expect(list.sheets.find((sheet) => sheet.id === createdId)?.systemId).toBe(system.id);
  } finally {
    gate.release();
    if (createdId) await api(request, `/api/sheets/${createdId}`, "DELETE");
  }
});

test("nhãn giao diện: chỉ commit sau success, giữ draft/không đóng khi lỗi và không PATCH lặp", async ({
  page,
}) => {
  const key = "tracking.settings.title";
  const old = "Nhãn đã lưu";
  const draft = "Nhãn kiểm thử mới";
  let texts: Record<string, string> = { [key]: old };
  const gate = barrier();
  let patches = 0;
  const payloads: unknown[] = [];
  await page.route("**/api/ui-texts", async (route) => {
    if (route.request().method() !== "PATCH") return route.fulfill({ json: { texts } });
    patches++;
    const payload = route.request().postDataJSON() as { key: string; value: string };
    payloads.push(payload);
    if (patches === 1) {
      await gate.pending;
      return route.abort("connectionreset");
    }
    if (patches === 2)
      return route.fulfill({ status: 403, json: { error: "Chỉ Admin được lưu nhãn thử" } });
    if (patches === 3)
      return route.fulfill({ status: 500, json: { error: "Chưa lưu được nhãn thử" } });
    texts = payload.value ? { [key]: payload.value } : {};
    return route.fulfill({ json: { ok: true, texts } });
  });
  try {
    const { modal, heading } = await moCaiDat(page);
    await heading.getByRole("button", { name: "Sửa text (Admin)", exact: true }).click();
    const input = heading.getByRole("textbox");
    await input.fill(draft);
    await input.press("Enter");
    await expect.poll(() => patches).toBe(1);
    await expect(input).toBeVisible();
    await expect(heading.getByRole("button", { name: "Lưu", exact: true })).toBeDisabled();
    await expect(heading.getByRole("button", { name: "Huỷ", exact: true })).toBeDisabled();
    expect(texts).toEqual({ [key]: old });
    await input.press("Enter");
    await page.keyboard.press("Escape");
    await expect(input).toBeVisible();
    await expect(modal).toBeVisible();
    expect(patches).toBe(1);
    gate.release();
    await expect(heading.getByRole("alert")).toContainText(/kết nối|mạng/i);
    const kiemStoreVaMoLai = async () => {
      await expect(input).toHaveValue(draft);
      await heading.getByRole("button", { name: "Huỷ", exact: true }).click();
      await expect(heading).toContainText(old);
      await expect(heading).not.toContainText(draft);
      await heading.getByRole("button", { name: "Sửa text (Admin)", exact: true }).click();
      await expect(input).toHaveValue(old);
      await input.fill(draft);
    };
    await kiemStoreVaMoLai();
    for (const message of ["Chỉ Admin được lưu nhãn thử", "Chưa lưu được nhãn thử"]) {
      await expect(input).toHaveValue(draft);
      await heading.getByRole("button", { name: "Lưu", exact: true }).click();
      await expect(heading.getByRole("alert")).toHaveText(message);
      expect(texts).toEqual({ [key]: old });
      await kiemStoreVaMoLai();
    }
    await heading.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(input).toHaveCount(0);
    await expect(heading).toContainText(draft);
    expect(patches).toBe(4);
    expect(payloads).toEqual(Array.from({ length: 4 }, () => ({ key, value: draft })));
    await heading.getByRole("button", { name: "Sửa text (Admin)", exact: true }).click();
    await heading.getByRole("textbox").fill("Bản nhập sẽ huỷ");
    await heading.getByRole("textbox").press("Escape");
    await expect(heading).toContainText(draft);
    await expect(
      heading.getByRole("button", { name: "Sửa text (Admin)", exact: true }),
    ).toBeFocused();
    expect(patches).toBe(4);
    await heading.getByRole("button", { name: "Sửa text (Admin)", exact: true }).click();
    await heading.getByRole("button", { name: "Đặt lại mặc định", exact: true }).click();
    await expect(heading).toContainText("Cài đặt trang tracking");
    expect(payloads.at(-1)).toEqual({ key, value: "" });
    expect(texts).toEqual({});
  } finally {
    gate.release();
  }
});

for (const width of [undefined, 360]) {
  test(`form và editor ${width ?? "viewport dự án"}: nhãn/bàn phím/mobile/axe`, async ({
    page,
  }) => {
    if (width) await page.setViewportSize({ width, height: 844 });
    const mobile = page.viewportSize()!.width < 640;
    const { modal, trigger } = await moTaoHangMuc(page);
    const input = modal.getByRole("textbox", { name: "Tên hạng mục", exact: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveAccessibleDescription(/tracking/);
    await input.fill("Kiểm tra form");
    const submit = modal.getByRole("button", { name: "Tạo hạng mục", exact: true });
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveCSS("opacity", "1");
    for (const control of [input, submit, modal.getByRole("button", { name: "Huỷ", exact: true })])
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (mobile) await expect(input).toHaveCSS("font-size", "16px");
    await input.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(submit).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(input).toBeFocused();
    const axe = async () => {
      const result = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
      ).toEqual([]);
    };
    await axe();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    const { heading } = await moCaiDat(page);
    await heading.getByRole("button", { name: "Sửa text (Admin)", exact: true }).click();
    const editorInput = heading.getByRole("textbox");
    await expect(editorInput).toHaveAccessibleName(/nhãn/i);
    if (mobile) await expect(editorInput).toHaveCSS("font-size", "16px");
    for (const control of [
      editorInput,
      heading.getByRole("button", { name: "Lưu", exact: true }),
      heading.getByRole("button", { name: "Huỷ", exact: true }),
    ])
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", page.viewportSize()!.width);
    await axe();
  });
}

test("PM vẫn tạo được hạng mục nhưng không có quyền sửa nhãn giao diện", async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post("/api/auth/login", {
    headers: { Origin: new URL(baseURL!).origin },
    data: { email: "pm@xboss.vn", password: "pm123" },
  });
  expect(login.status()).toBe(200);
  const { modal } = await moTaoHangMuc(page);
  await expect(modal.getByPlaceholder("VD: ACMV Zone 3")).toBeVisible();
  await page.keyboard.press("Escape");
  const { heading } = await moCaiDat(page);
  await expect(heading.getByRole("button", { name: "Sửa text (Admin)", exact: true })).toHaveCount(
    0,
  );
});
