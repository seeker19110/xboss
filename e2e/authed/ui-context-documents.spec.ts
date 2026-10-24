import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });
const DOCS = "**/api/documents-hub";
const SYSTEMS = "**/api/systems";
const NAME = "Biên bản công tác tầng T1";
const documents = [
  {
    id: 950001,
    source: "project",
    title: NAME,
    category: "Biểu mẫu",
    systemCode: "SYS_A",
    systemName: "Hệ kiểm chứng",
    systemColor: "emerald",
    floorLabel: "T1",
    mimeType: "application/pdf",
    sizeBytes: 100,
    createdAt: "2026-10-24T00:00:00Z",
    uploaderName: "Người kiểm chứng",
    viewUrl: "/api/project-documents/950001",
  },
];
const systems = [{ id: 950002, code: "SYS_A", name: "Hệ kiểm chứng", color: "emerald" }];
const file = { name: "ho-so.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-test") };
function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function setup(page: Page) {
  const state = { gets: 0, errors: [] as string[] };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 403, json: { error: "Mutation ngoài fixture bị chặn" } }),
  );
  await page.route(DOCS, (route) => {
    state.gets++;
    return route.fulfill({ json: { documents } });
  });
  await page.route(SYSTEMS, (route) => route.fulfill({ json: { systems } }));
  return state;
}
async function openUpload(page: Page) {
  await page.getByRole("button", { name: "Tải lên hồ sơ dự án", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tải lên hồ sơ dự án", exact: true });
  await dialog.getByLabel("Tiêu đề", { exact: true }).fill("Hồ sơ mới phải giữ");
  await dialog.locator('input[type="file"]').setInputFiles(file);
  return dialog;
}

test("hồ sơ sẵn sàng khi danh mục hệ còn chờ", async ({ page }) => {
  const state = await setup(page);
  const pending = barrier();
  await page.route(SYSTEMS, async (route) => {
    await pending.promise;
    await route.fulfill({ json: { systems } }).catch(() => {});
  });
  try {
    await page.goto("/documents");
    await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible({
      timeout: 2500,
    });
    await expect(page.getByText("Chưa có hồ sơ nào", { exact: true })).toHaveCount(0);
    pending.release();
    await expect(page.getByRole("button", { name: "Hệ kiểm chứng", exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
  } finally {
    pending.release();
  }
});

for (const failure of ["http", "network"] as const) {
  test(`GET hồ sơ ${failure} có lỗi và retry, không thành dữ liệu rỗng`, async ({ page }) => {
    const state = await setup(page);
    let requests = 0;
    await page.route(DOCS, (route) =>
      ++requests === 1
        ? failure === "http"
          ? route.fulfill({ status: 500, json: { error: "Không đọc được hồ sơ kiểm chứng" } })
          : route.abort("failed")
        : route.fulfill({ json: { documents } }),
    );
    await page.goto("/documents");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/hồ sơ|kết nối/);
    await expect(page.getByText("Chưa có hồ sơ nào", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại hồ sơ", exact: true }).click();
    await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
    expect(requests).toBe(2);
    expect(state.errors).toEqual([]);
  });
}

test("lỗi danh mục hệ giữ hồ sơ và retry chỉ nguồn phụ", async ({ page }) => {
  const state = await setup(page);
  let gets = 0;
  await page.route(SYSTEMS, (route) =>
    ++gets === 1
      ? route.fulfill({ status: 500, json: { error: "Không đọc được danh mục hệ" } })
      : route.fulfill({ json: { systems } }),
  );
  await page.goto("/documents");
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Thử lại danh mục hệ", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hệ kiểm chứng", exact: true })).toBeVisible();
  expect(gets).toBe(2);
  expect(state.gets).toBe(1);
  expect(state.errors).toEqual([]);
});

test("auth lỗi giữ hồ sơ và retry xác minh lại quyền upload", async ({ page }) => {
  const state = await setup(page);
  const auth = await (await page.request.get("/api/auth/me")).json();
  let gets = 0;
  await page.route("**/api/auth/me", (route) =>
    ++gets === 1
      ? route.fulfill({ status: 500, json: { error: "Auth kiểm chứng chưa sẵn sàng" } })
      : route.fulfill({ json: auth }),
  );
  await page.goto("/documents");
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tải lên hồ sơ dự án", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Thử lại phiên", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tải lên hồ sơ dự án", exact: true }),
  ).toBeVisible();
  expect(gets).toBe(2);
  expect(state.gets).toBe(1);
  expect(state.errors).toEqual([]);
});

test("viewer giữ quyền chỉ đọc, primary 401 dùng flow hết phiên hiện hữu", async ({ page }) => {
  await setup(page);
  const auth = await (await page.request.get("/api/auth/me")).json();
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { ...auth, user: { ...auth.user, role: "viewer" } } }),
  );
  await page.goto("/documents");
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await expect
    .poll(() => page.getByRole("button", { name: "Tải lên hồ sơ dự án", exact: true }).count())
    .toBe(0);
  await page.route(DOCS, (route) =>
    route.fulfill({ status: 401, json: { error: "Chưa đăng nhập" } }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test("upload đang chờ khóa draft và đóng, không gửi hai lần", async ({ page }) => {
  const state = await setup(page);
  const pending = barrier();
  let posts = 0;
  await page.route("**/api/project-documents", async (route) => {
    posts++;
    await pending.promise;
    await route.fulfill({ status: 500, json: { error: "Chưa nhận hồ sơ kiểm chứng" } });
  });
  try {
    await page.goto("/documents");
    const dialog = await openUpload(page);
    await dialog.getByRole("button", { name: "Tải lên", exact: true }).click();
    await expect.poll(() => posts).toBe(1);
    await expect(dialog.getByLabel("Tiêu đề", { exact: true })).toBeDisabled();
    await expect(dialog.locator('input[type="file"]')).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: /Đang tải lên/ })
      .evaluate((button) => button.closest("form")?.requestSubmit());
    pending.release();
    await expect(dialog.getByRole("alert")).toContainText("Chưa nhận hồ sơ kiểm chứng");
    await expect(dialog.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Hồ sơ mới phải giữ");
    expect(
      await dialog
        .locator('input[type="file"]')
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe(file.name);
    await expect(dialog.getByRole("button", { name: "Tải lên", exact: true })).toBeEnabled();
    expect(posts).toBe(1);
    expect(state.errors).toEqual([]);
  } finally {
    pending.release();
  }
});

test("POST upload được nhận rồi refresh lỗi giữ danh sách, retry chỉ GET", async ({ page }) => {
  const state = await setup(page);
  let gets = 0;
  let posts = 0;
  await page.route(DOCS, (route) =>
    ++gets === 2
      ? route.fulfill({ status: 500, json: { error: "Không đọc lại được hồ sơ sau upload" } })
      : route.fulfill({ json: { documents } }),
  );
  await page.route("**/api/project-documents", (route) => {
    posts++;
    return route.fulfill({ status: 201, json: { id: 950003 } });
  });
  await page.goto("/documents");
  await page.getByRole("textbox", { name: "Tìm kiếm hồ sơ", exact: true }).fill("Biên bản");
  const dialog = await openUpload(page);
  await dialog.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Không đọc lại được hồ sơ sau upload",
  );
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Thử lại hồ sơ", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Tìm kiếm hồ sơ", exact: true })).toHaveValue(
    "Biên bản",
  );
  expect(gets).toBe(3);
  expect(posts).toBe(1);
  expect(state.errors).toEqual([]);
});

test("upload mất mạng giữ draft/file và mở lại nút retry", async ({ page }) => {
  const state = await setup(page);
  await page.route("**/api/project-documents", (route) => route.abort("failed"));
  await page.goto("/documents");
  const dialog = await openUpload(page);
  await dialog.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Mất kết nối");
  await expect(dialog.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Hồ sơ mới phải giữ");
  await expect(dialog.getByRole("button", { name: "Tải lên", exact: true })).toBeEnabled();
  expect(state.errors).toEqual([]);
});

test("chọn file qua bàn phím mở filechooser và giữ accept", async ({ page }) => {
  await setup(page);
  await page.goto("/documents");
  await page.getByRole("button", { name: "Tải lên hồ sơ dự án", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tải lên hồ sơ dự án", exact: true });
  const choose = dialog.getByRole("button", { name: "Chọn file", exact: true });
  await choose.focus();
  await expect(choose).toBeFocused();
  const filechooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await filechooser).setFiles(file);
  await expect(dialog.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    "application/pdf,image/*",
  );
  await expect(dialog.getByText("ho-so.pdf", { exact: true })).toBeVisible();
});

for (const light of [true, false]) {
  test(`hồ sơ và modal lỗi axe/target ở ${light ? "Light" : "Dark Blue"}`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.route("**/api/project-documents", (route) =>
      route.fulfill({ status: 422, json: { error: "Tệp kiểm chứng chưa hợp lệ" } }),
    );
    await page.goto("/documents");
    await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
    await page.evaluate((isLight) => {
      document.documentElement.classList.remove("light", "darkblue");
      document.documentElement.classList.add(isLight ? "light" : "darkblue");
    }, light);
    const dialog = await openUpload(page);
    await dialog.getByRole("button", { name: "Tải lên", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Tệp kiểm chứng chưa hợp lệ");
    // Đợi chuyển màu hữu hạn kết thúc trước đo tương phản; không đổi luật axe.
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", page.viewportSize()!.width);
    expect(
      results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
    for (const name of ["Đóng", "Chọn file", "Tải lên"]) {
      const box = await dialog.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(dialog.getByLabel("Tiêu đề", { exact: true })).toHaveCSS(
      "font-size",
      page.viewportSize()!.width < 640 ? "16px" : "14px",
    );
  });
}
