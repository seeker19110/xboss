import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });

const PKG = 931_000;
const TASK = 931_001;
const OTHER_TASK = 931_002;
const NAME = "Công tác kiểm chứng ảnh";
const PHOTO = {
  id: 931_101,
  originalName: "Ảnh đang có",
  mimeType: "image/png",
  sizeBytes: 68,
  caption: "Ảnh hiện trường đã tải",
  createdAt: "2026-10-24T01:00:00Z",
  uploadedBy: null,
  uploaderName: "Người kiểm chứng",
};
const NEW_PHOTO = { ...PHOTO, id: PHOTO.id + 1, caption: "Ảnh vừa tải lên" };
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=",
  "base64",
);

function barrier() {
  let release = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  return { pending, release };
}

function task(id: number, name: string) {
  return {
    id,
    code: `T${id}`,
    name,
    status: "chuan_bi",
    progressPercent: 0,
    boqCode: null,
    drawingUrl: null,
    photoCount: 1,
    commentCount: 0,
    delayReason: null,
    startDate: null,
    endDate: null,
    custom: {},
    cells: { "Kiểm tra": { id: id + 10, installed: false } },
  };
}

test.beforeEach(async ({ page }) => {
  // Mọi mutation đều bị chặn; từng ca chỉ mở endpoint fixture ảnh cần kiểm.
  await page.route("**/api/**", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 500, json: { error: "Không ghi ngoài fixture ảnh" } }),
  );
  await page.route("**/api/tasks?sheet=ogtd", (route) =>
    route.fulfill({
      json: {
        sheet: { id: 1, code: "OGTĐ", name: "Trang kiểm chứng ảnh", slug: "ogtd" },
        packages: [
          {
            id: PKG,
            code: "PHOTO",
            name: "Nhóm kiểm chứng ảnh",
            floorLabel: "1F",
            status: "chuan_bi",
            progress: 0,
            boqCode: null,
            drawingUrl: null,
            bbntUrl: null,
            startDate: null,
            endDate: null,
            custom: {},
            tasks: [task(TASK, NAME), task(OTHER_TASK, "Công tác khác")],
          },
        ],
      },
    }),
  );
  await page.route(`**/api/workpackages/${PKG}/dimensions`, (route) =>
    route.fulfill({
      json: { columns: ["Kiểm tra"], tasks: [task(TASK, NAME), task(OTHER_TASK, "Công tác khác")] },
    }),
  );
  await page.route("**/api/photos/*", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ contentType: "image/png", body: PNG })
      : route.fulfill({ status: 500, json: { error: "Không xoá ảnh trong fixture" } }),
  );
});

async function openPhotos(page: Page, index = 0) {
  await page.goto("/tracking/ogtd?floor=1F");
  const trigger = page.locator('button[title="Ảnh hiện trường"]').nth(index);
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: `Ảnh hiện trường — ${index ? "Công tác khác" : NAME}`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

async function checkA11y(page: Page, dialog: Locator) {
  for (const theme of ["light", "darkblue"]) {
    await page.evaluate((value) => {
      document.documentElement.classList.remove("light", "darkblue");
      document.documentElement.classList.add(value);
    }, theme);
    await dialog.evaluate(async (element) => {
      element.getBoundingClientRect();
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
      JSON.stringify({ theme, violations: axe.violations }, null, 2),
    ).toEqual([]);
    const bounds = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.page).toBeLessThanOrEqual(bounds.viewport + 1);
  }
}

for (const failure of ["http", "network"] as const) {
  test(`ảnh tracking ${failure}: lỗi không thành rỗng, retry GET phục hồi đúng công tác`, async ({
    page,
  }) => {
    let gets = 0;
    const gate = barrier();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`**/api/tasks/${TASK}/photos`, async (route) => {
      expect(route.request().method()).toBe("GET");
      gets++;
      if (gets === 1)
        return failure === "http"
          ? route.fulfill({ status: 500, json: { error: "Tạm lỗi ảnh kiểm chứng" } })
          : route.abort("connectionreset");
      await gate.pending;
      await route.fulfill({ json: { photos: [PHOTO] } }).catch(() => {});
    });
    try {
      const { dialog } = await openPhotos(page);
      await expect.poll(() => gets).toBe(1);
      await expect(dialog.getByRole("alert")).toContainText(
        failure === "http" ? "Tạm lỗi ảnh kiểm chứng" : /kết nối|mạng/i,
      );
      await expect(dialog.getByText(/Chưa có ảnh nào/)).toHaveCount(0);
      await expect(dialog.getByRole("status")).toHaveCount(0);
      if (failure === "http") await checkA11y(page, dialog);
      await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
      await expect.poll(() => gets).toBe(2);
      await expect(dialog.getByRole("status")).toContainText("Đang tải");
      gate.release();
      await expect(dialog.getByRole("img", { name: PHOTO.caption, exact: true })).toBeVisible();
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      expect(gets).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      gate.release();
    }
  });
}

async function uploadPhoto(page: Page, dialog: Locator) {
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "anh.png", mimeType: "image/png", buffer: PNG });
  const prompt = page.getByRole("dialog", { name: "Ghi chú cho ảnh (tuỳ chọn)", exact: true });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("textbox").fill("Ảnh vừa tải lên");
  await prompt.getByRole("button", { name: "OK", exact: true }).click();
}

test("upload đã nhận nhưng GET lỗi: giữ ảnh cũ, retry chỉ GET không gửi ảnh lần hai", async ({
  page,
}) => {
  let gets = 0;
  let posts = 0;
  await page.route(`**/api/tasks/${TASK}/photos`, (route) => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().postData()).toContain('name="caption"');
      return route.fulfill({ status: 201, json: { id: NEW_PHOTO.id } });
    }
    gets++;
    if (gets === 2)
      return route.fulfill({ status: 500, json: { error: "Chưa đọc được ảnh sau upload" } });
    return route.fulfill({ json: { photos: gets > 2 ? [PHOTO, NEW_PHOTO] : [PHOTO] } });
  });
  const { dialog } = await openPhotos(page);
  await expect(dialog.getByRole("img", { name: PHOTO.caption, exact: true })).toBeVisible();
  await uploadPhoto(page, dialog);
  await expect.poll(() => posts).toBe(1);
  await expect(dialog.getByRole("alert")).toContainText("Chưa đọc được ảnh sau upload");
  await expect(dialog.getByRole("img", { name: PHOTO.caption, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(dialog.getByRole("img", { name: NEW_PHOTO.caption, exact: true })).toBeVisible();
  expect(posts).toBe(1);
  expect(gets).toBe(3);
  await checkA11y(page, dialog);
});

test("keyboard chọn file, mở ảnh và Escape chỉ đóng viewer rồi trả focus về ảnh", async ({
  page,
}) => {
  await page.route(`**/api/tasks/${TASK}/photos`, (route) =>
    route.fulfill({ json: { photos: [PHOTO] } }),
  );
  const { dialog, trigger } = await openPhotos(page);
  const input = dialog.getByLabel("Thêm ảnh", { exact: true });
  // Tab từ panel phải tới control chọn file thật, không dùng click vào label bằng chuột.
  await dialog.focus();
  await page.keyboard.press("Tab");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    (async () => {
      await expect(input).toBeFocused();
      await page.keyboard.press("Enter");
    })(),
  ]);
  await chooser.setFiles([]);
  const target = dialog.locator('label:has(input[type="file"])');
  expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(target).not.toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const image = dialog.getByRole("button", { name: `Xem ảnh: ${PHOTO.caption}`, exact: true });
  await expect(image).toBeFocused();
  expect((await image.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(image).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  const viewer = page.getByRole("dialog", { name: `Xem ảnh: ${PHOTO.caption}`, exact: true });
  await expect(viewer).toBeVisible();
  await expect(dialog).toBeVisible();
  await checkA11y(page, viewer);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(image).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("GET mở đầu đến muộn không ghi đè danh sách mới sau upload", async ({ page }) => {
  let gets = 0;
  let posts = 0;
  const gate = barrier();
  await page.route(`**/api/tasks/${TASK}/photos`, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ status: 201, json: { id: NEW_PHOTO.id } });
    }
    gets++;
    if (gets === 1) {
      await gate.pending;
      return route.fulfill({ json: { photos: [PHOTO] } }).catch(() => {});
    }
    return route.fulfill({ json: { photos: [NEW_PHOTO] } });
  });
  const firstRequest = page.waitForRequest(
    (request) => request.url().endsWith(`/api/tasks/${TASK}/photos`) && request.method() === "GET",
  );
  try {
    const { dialog } = await openPhotos(page);
    const first = await firstRequest;
    await expect.poll(() => gets).toBe(1);
    await uploadPhoto(page, dialog);
    await expect(dialog.getByRole("img", { name: NEW_PHOTO.caption, exact: true })).toBeVisible();
    gate.release();
    // Chờ response cũ/abort và hai frame render để assertion không chạy trước stale update.
    await first.response().then((response) => response?.finished());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(dialog.getByRole("img", { name: NEW_PHOTO.caption, exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: PHOTO.caption, exact: true })).toHaveCount(0);
    expect(gets).toBe(2);
    expect(posts).toBe(1);
  } finally {
    gate.release();
  }
});

test("đóng gallery khi GET chậm rồi mở công tác khác không nhận ảnh công tác cũ", async ({
  page,
}) => {
  const gate = barrier();
  const otherPhoto = { ...PHOTO, id: PHOTO.id + 5, caption: "Ảnh thuộc công tác khác" };
  await page.route(`**/api/tasks/${TASK}/photos`, async (route) => {
    await gate.pending;
    await route.fulfill({ json: { photos: [PHOTO] } }).catch(() => {});
  });
  await page.route(`**/api/tasks/${OTHER_TASK}/photos`, (route) =>
    route.fulfill({ json: { photos: [otherPhoto] } }),
  );
  const firstRequest = page.waitForRequest((request) =>
    request.url().endsWith(`/api/tasks/${TASK}/photos`),
  );
  try {
    const { dialog } = await openPhotos(page);
    const first = await firstRequest;
    await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
    await page.locator('button[title="Ảnh hiện trường"]').nth(1).click();
    const nextDialog = page.getByRole("dialog", {
      name: "Ảnh hiện trường — Công tác khác",
      exact: true,
    });
    await expect(
      nextDialog.getByRole("img", { name: otherPhoto.caption, exact: true }),
    ).toBeVisible();
    gate.release();
    await first.response().then((response) => response?.finished());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      nextDialog.getByRole("img", { name: otherPhoto.caption, exact: true }),
    ).toBeVisible();
    await expect(nextDialog.getByRole("img", { name: PHOTO.caption, exact: true })).toHaveCount(0);
  } finally {
    gate.release();
  }
});

test("GET ảnh 401 dùng luồng hết phiên hiện hữu thay vì báo gallery rỗng", async ({ page }) => {
  let gets = 0;
  await page.route(`**/api/tasks/${TASK}/photos`, (route) => {
    gets++;
    return route.fulfill({ status: 401, json: { error: "Phiên đã hết hạn" } });
  });
  await page.goto("/tracking/ogtd?floor=1F");
  await page.locator('button[title="Ảnh hiện trường"]').first().click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  expect(gets).toBe(1);
});

test("360px: lỗi, gallery và viewer đạt axe hai theme, không tràn ngang, target đủ 44px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  let gets = 0;
  await page.route(`**/api/tasks/${TASK}/photos`, (route) => {
    expect(route.request().method()).toBe("GET");
    gets++;
    return gets === 1
      ? route.fulfill({ status: 500, json: { error: "Chưa tải được ảnh trên màn hình hẹp" } })
      : route.fulfill({ json: { photos: [PHOTO] } });
  });

  async function target44(control: Locator, name: string) {
    const box = await control.boundingBox();
    expect(box, `${name}: control có bounds nhìn thấy`).not.toBeNull();
    expect(box!.width, `${name}: chiều rộng target`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${name}: chiều cao target`).toBeGreaterThanOrEqual(44);
  }

  const { dialog } = await openPhotos(page);
  await expect(dialog.getByRole("alert")).toContainText("Chưa tải được ảnh trên màn hình hẹp");
  const retry = dialog.getByRole("button", { name: "Thử lại", exact: true });
  const close = dialog.getByRole("button", { name: "Đóng", exact: true });
  const upload = dialog.locator('label:has(input[type="file"])');
  await target44(retry, "Thử lại");
  await target44(close, "Đóng gallery");
  await target44(upload, "Thêm ảnh");
  await checkA11y(page, dialog);

  await retry.click();
  const image = dialog.getByRole("button", { name: `Xem ảnh: ${PHOTO.caption}`, exact: true });
  await expect(image).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  expect(gets).toBe(2);
  await target44(image, "Mở ảnh");
  await target44(dialog.getByRole("button", { name: "Xoá ảnh", exact: true }), "Xoá ảnh");
  await checkA11y(page, dialog);

  await image.click();
  const viewer = page.getByRole("dialog", { name: `Xem ảnh: ${PHOTO.caption}`, exact: true });
  await expect(viewer).toBeVisible();
  await target44(viewer.getByRole("button", { name: "Đóng ảnh", exact: true }), "Đóng viewer");
  await checkA11y(page, viewer);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(image).toBeFocused();
});
