import { test, expect, type Page } from "@playwright/test";

// Chỉ kiểm UI serialization; mọi PUT/lock/vault đều mock trong context, không ghi DB/queue.
test.use({ serviceWorkers: "block" });

const DATE = `${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7)}-11`;
const DETAIL = `**/api/diaries/${DATE}`;
const LOCK = `**/api/diaries/${DATE}/lock`;
const ETAG = '"diary-ui-v1"';
const NEW_ETAG = '"diary-ui-v2"';

function diary(status: "draft" | "locked" = "draft") {
  return {
    id: 920_201,
    status,
    weatherAm: "Nắng",
    weatherPm: null,
    workDone: "Bản đã lưu",
    obstacles: null,
    safetyNote: null,
    lockedByName: status === "locked" ? "Người duyệt" : null,
    lockedAt: status === "locked" ? "2026-10-24T00:00:00Z" : null,
  };
}

function body(status: "draft" | "locked" = "draft", etag = ETAG) {
  return {
    diary: diary(status),
    etag,
    manpower: [],
    photoIds: [],
    prefill: { workDone: "Từ hệ thống", updatedBy: [], photos: [] },
  };
}

function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

async function mockPage(page: Page) {
  await page.route("**/api/diaries?*", (route) =>
    route.fulfill({ json: { days: [{ date: DATE, status: "draft" }], manpower: [] } }),
  );
  await page.route("**/api/offline/vault/**", (route) =>
    route.fulfill({ status: 503, json: { error: "Kho ngoại tuyến không mở trong ca UI pending" } }),
  );
}

async function openDiary(page: Page) {
  await page.goto("/diary");
  await page.getByRole("button", { name: "11", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: /^Nhật ký ngày / });
  await expect(dialog.locator("textarea").first()).toBeVisible();
  return dialog;
}

test("lưu pending khóa fields/đóng/khoá sổ, chỉ sau success mới cho khoá sổ", async ({ page }) => {
  await mockPage(page);
  const gate = barrier();
  let puts = 0;
  let locks = 0;
  let status: "draft" | "locked" = "draft";
  await page.route(DETAIL, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: body(status) });
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["if-match"]).toBe(ETAG);
    expect(route.request().headers()["if-none-match"]).toBeUndefined();
    expect(route.request().postDataJSON()).toEqual({
      weatherAm: "Nắng",
      weatherPm: null,
      workDone: "Bản nhập đang lưu",
      obstacles: null,
      safetyNote: null,
      manpower: [],
      photoIds: [],
    });
    puts++;
    await gate.promise;
    await route
      .fulfill({
        json: { id: 920_201, diary: { ...diary(), workDone: "Bản nhập đang lưu" }, etag: NEW_ETAG },
      })
      .catch(() => {});
  });
  await page.route(LOCK, async (route) => {
    expect(route.request().method()).toBe("POST");
    locks++;
    status = "locked";
    await route.fulfill({ json: { ok: true, status } });
  });
  try {
    const dialog = await openDiary(page);
    const work = dialog.locator("textarea").first();
    await work.fill("Bản nhập đang lưu");
    await dialog.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect.poll(() => puts).toBe(1);
    await expect(work).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Khoá sổ", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(locks).toBe(0);
    gate.release();
    await expect(dialog.getByRole("button", { name: "Lưu nháp", exact: true })).toBeEnabled();
    await expect(work).toHaveValue("Bản nhập đang lưu");
    await dialog.getByRole("button", { name: "Khoá sổ", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: /^Khoá sổ nhật ký ngày này/ });
    await confirm.getByRole("button", { name: "Đồng ý", exact: true }).click();
    await expect(dialog.getByText(/Đã khoá bởi/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mở khoá", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Lưu nháp", exact: true })).toHaveCount(0);
    expect(puts).toBe(1);
    expect(locks).toBe(1);
  } finally {
    gate.release();
  }
});

for (const action of ["lock", "unlock"] as const) {
  test(`${action} pending giữ modal; HTTP/mạng lỗi tại chỗ và retry đúng method`, async ({
    page,
  }) => {
    await mockPage(page);
    const gate = barrier();
    let calls = 0;
    let status: "draft" | "locked" = action === "lock" ? "draft" : "locked";
    const method = action === "lock" ? "POST" : "DELETE";
    const label = action === "lock" ? "Khoá sổ" : "Mở khoá";
    const error = "Tạm từ chối thao tác khoá kiểm chứng";
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.route(DETAIL, (route) =>
      route.fulfill({ json: body(status, calls > 2 ? NEW_ETAG : ETAG) }),
    );
    await page.route(LOCK, async (route) => {
      expect(route.request().method()).toBe(method);
      calls++;
      if (calls === 1) {
        await gate.promise;
        return route.fulfill({ status: 403, json: { error } }).catch(() => {});
      }
      if (calls === 2) return route.abort("failed");
      status = action === "lock" ? "locked" : "draft";
      await route.fulfill({ json: { ok: true, status } });
    });
    try {
      const dialog = await openDiary(page);
      const trigger = dialog.getByRole("button", { name: label, exact: true });
      const confirmAndSend = async () => {
        await trigger.click();
        const confirm = page.getByRole("dialog", {
          name: action === "lock" ? /^Khoá sổ nhật ký ngày này/ : /^Mở khoá nhật ký ngày này/,
        });
        await confirm.getByRole("button", { name: "Đồng ý", exact: true }).click();
      };
      await confirmAndSend();
      await expect.poll(() => calls).toBe(1);
      await expect(trigger).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      gate.release();
      await expect(dialog.getByRole("alert")).toContainText(error);
      await expect(trigger).toBeEnabled();
      await confirmAndSend();
      await expect(dialog.getByRole("alert")).toContainText(/Mất kết nối|Lỗi mạng/);
      await expect(trigger).toBeEnabled();
      await confirmAndSend();
      await expect(
        dialog.getByRole("button", {
          name: action === "lock" ? "Mở khoá" : "Khoá sổ",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      expect(calls).toBe(3);
      expect(pageErrors).toEqual([]);
    } finally {
      gate.release();
    }
  });
}

test("tạo nhật ký vẫn gửi If-None-Match; 422 giữ bản nhập và 412 giữ form để so sánh", async ({
  page,
}) => {
  await mockPage(page);
  let puts = 0;
  await page.route(DETAIL, async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { ...body(), diary: null, etag: null } });
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["if-none-match"]).toBe("*");
    expect(route.request().headers()["if-match"]).toBeUndefined();
    puts++;
    await route.fulfill(
      puts === 1
        ? { status: 422, json: { error: "Nội dung cần sửa kiểm chứng" } }
        : { status: 412, json: { error: "Bản máy chủ đã đổi" } },
    );
  });
  const dialog = await openDiary(page);
  const work = dialog.locator("textarea").first();
  await work.fill("Bản nhập không được xoá");
  await dialog.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Nội dung cần sửa kiểm chứng");
  await expect(work).toHaveValue("Bản nhập không được xoá");
  await dialog.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Nhật ký vừa được người khác cập nhật");
  await expect(work).toHaveValue("Bản nhập không được xoá");
  await expect(
    dialog.getByRole("button", { name: "Tải bản mới để so sánh", exact: true }),
  ).toBeEnabled();
  expect(puts).toBe(2);
});
