import { test, expect, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const ALBUM_ID = 920_101;
const TITLE = "Album kiểm chứng phục hồi";
const PHOTO = {
  id: 920_102,
  originalName: "Ảnh đã tải",
  caption: null,
  createdAt: "2026-10-24T00:00:00Z",
};
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=",
  "base64",
);

function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

async function mockPage(page: Page) {
  await page.route("**/api/tech-links", (route) => route.fulfill({ json: { links: [] } }));
  await page.route("**/api/progress-albums", (route) =>
    route.fulfill({
      json: {
        albums: [
          { id: ALBUM_ID, milestoneLabel: TITLE, capturedDate: null, note: null, photoCount: 1 },
        ],
      },
    }),
  );
  await page.route("**/api/photos/*", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ contentType: "image/png", body: PNG });
  });
}

async function openAlbums(page: Page) {
  await page.goto("/tech");
  await page.getByRole("tab", { name: "Giám sát", exact: true }).click();
}

async function openGallery(page: Page) {
  await openAlbums(page);
  await page.getByRole("button", { name: "Xem ảnh", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: TITLE, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const failure of ["http", "network"] as const) {
  test(`gallery ${failure}: lỗi có retry/loading, không hiện album rỗng giả`, async ({ page }) => {
    await mockPage(page);
    let gets = 0;
    const gate = barrier();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`**/api/progress-albums/${ALBUM_ID}/photos`, async (route) => {
      expect(route.request().method()).toBe("GET");
      gets++;
      if (gets === 1) {
        if (failure === "network") return route.abort("failed");
        return route.fulfill({ status: 500, json: { error: "Tạm lỗi đọc ảnh kiểm chứng" } });
      }
      await gate.promise;
      await route.fulfill({ json: { photos: [PHOTO] } }).catch(() => {});
    });
    try {
      const dialog = await openGallery(page);
      await expect(dialog.getByRole("alert")).toContainText(
        failure === "http" ? "Tạm lỗi đọc ảnh kiểm chứng" : "Không tải được ảnh album",
      );
      await expect(dialog.getByText("Album chưa có ảnh nào.", { exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
      await expect.poll(() => gets).toBe(2);
      await expect(dialog.getByRole("status")).toContainText("Đang tải");
      gate.release();
      await expect(dialog.getByRole("img", { name: PHOTO.originalName })).toBeVisible();
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      expect(gets).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      gate.release();
    }
  });
}

test("danh sách album lỗi có retry, auth tạm lỗi được đọc lại đúng một lần", async ({ page }) => {
  await mockPage(page);
  let authGets = 0;
  let albumGets = 0;
  await page.route("**/api/auth/me", async (route) => {
    authGets++;
    if (authGets === 1) return route.fulfill({ status: 500, json: { error: "Tạm lỗi tài khoản" } });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ response });
  });
  await page.route("**/api/progress-albums", async (route) => {
    albumGets++;
    await route.fulfill(
      albumGets === 1
        ? { status: 500, json: { error: "Tạm lỗi danh sách album" } }
        : {
            json: {
              albums: [
                {
                  id: ALBUM_ID,
                  milestoneLabel: TITLE,
                  capturedDate: null,
                  note: null,
                  photoCount: 1,
                },
              ],
            },
          },
    );
  });
  await page.goto("/tech");
  const main = page.getByRole("main");
  await expect(main.getByRole("alert")).toContainText("Không tải được thông tin tài khoản");
  await main.getByRole("button", { name: "Thử lại", exact: true }).click();
  await page.getByRole("tab", { name: "Giám sát", exact: true }).click();
  await expect(main.getByRole("alert")).toContainText("Tạm lỗi danh sách album");
  await expect(main.getByText("Chưa có album", { exact: true })).toHaveCount(0);
  await main.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(main.getByText(TITLE, { exact: true })).toBeVisible();
  expect(authGets).toBe(2);
  expect(albumGets).toBe(2);
});

test("upload đã nhận: refresh lỗi giữ ảnh cũ, retry chỉ GET và không POST ảnh lần hai", async ({
  page,
}) => {
  await mockPage(page);
  let gets = 0;
  let posts = 0;
  const uploaded = { ...PHOTO, id: PHOTO.id + 1, originalName: "Ảnh đã nhận upload" };
  await page.route(`**/api/progress-albums/${ALBUM_ID}/photos`, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().postData()).toContain('name="file"');
      return route.fulfill({
        status: 201,
        json: { id: uploaded.id, albumId: ALBUM_ID, caption: null, sizeBytes: PNG.length },
      });
    }
    gets++;
    if (gets === 2)
      return route.fulfill({ status: 500, json: { error: "Chưa đọc được ảnh sau upload" } });
    await route.fulfill({ json: { photos: gets > 2 ? [PHOTO, uploaded] : [PHOTO] } });
  });
  const dialog = await openGallery(page);
  await expect(dialog.getByRole("img", { name: PHOTO.originalName })).toBeVisible();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "anh.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByRole("alert")).toContainText("Chưa đọc được ảnh sau upload");
  await expect(dialog.getByRole("img", { name: PHOTO.originalName })).toBeVisible();
  await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(dialog.getByRole("img", { name: uploaded.originalName })).toBeVisible();
  expect(posts).toBe(1);
  expect(gets).toBe(3);
});

test("tạo album pending chặn đóng/sửa/gửi trùng; lỗi giữ draft rồi retry đúng payload", async ({
  page,
}) => {
  await mockPage(page);
  const gate = barrier();
  let posts = 0;
  const payload = {
    milestoneLabel: "Mốc giữ bản nhập",
    capturedDate: "2026-10-24",
    note: "Ghi chú còn nguyên",
  };
  await page.route("**/api/progress-albums", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { albums: [] } });
    posts++;
    expect(route.request().postDataJSON()).toEqual(payload);
    if (posts === 1) {
      await gate.promise;
      return route
        .fulfill({ status: 403, json: { error: "Chưa được phép tạo album kiểm chứng" } })
        .catch(() => {});
    }
    return route.fulfill({ status: 201, json: { id: ALBUM_ID } });
  });
  try {
    await openAlbums(page);
    await page.getByRole("button", { name: "Thêm album", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Thêm album mốc tiến độ", exact: true });
    const name = dialog.getByRole("textbox", { name: "Tên mốc", exact: true });
    await name.fill(payload.milestoneLabel);
    await dialog.getByLabel("Ngày chụp", { exact: true }).fill(payload.capturedDate);
    await dialog.getByRole("textbox", { name: "Ghi chú", exact: true }).fill(payload.note);
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect.poll(() => posts).toBe(1);
    await expect(name).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog.locator("form").evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) throw new Error("Thiếu form album");
      form.requestSubmit();
      form.requestSubmit();
    });
    gate.release();
    await expect(dialog.getByRole("alert")).toHaveText("Chưa được phép tạo album kiểm chứng");
    await expect(name).toHaveValue(payload.milestoneLabel);
    await expect(dialog.getByLabel("Ngày chụp", { exact: true })).toHaveValue(payload.capturedDate);
    await expect(dialog.getByRole("textbox", { name: "Ghi chú", exact: true })).toHaveValue(
      payload.note,
    );
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(dialog.getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(posts).toBe(2);
  } finally {
    gate.release();
  }
});

test("viewer xem ảnh nhưng không có nút thêm/xoá ảnh hoặc tạo album", async ({ page }) => {
  await mockPage(page);
  let gets = 0;
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, user: { ...body.user, role: "viewer" } } });
  });
  await page.route(`**/api/progress-albums/${ALBUM_ID}/photos`, async (route) => {
    gets++;
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: { photos: [PHOTO] } });
  });
  const dialog = await openGallery(page);
  await expect(dialog.getByRole("img", { name: PHOTO.originalName })).toBeVisible();
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Xoá ảnh", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByRole("button", { name: "Thêm album", exact: true })).toHaveCount(0);
  expect(gets).toBe(1);
});
