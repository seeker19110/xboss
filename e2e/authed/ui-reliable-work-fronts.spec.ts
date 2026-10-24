import { test, expect, type Page } from "@playwright/test";

// Mọi ghi công tác trong file này đều bị chặn tại context; không đổi công tác dùng chung
// hoặc cần cleanup DB. Tắt SW để lỗi mạng/HTTP thật sự đi qua handler kiểm chứng.
test.use({ serviceWorkers: "block" });

const STAGE_ID = 910_601;
const STAGE_NAME = "Công tác kiểm chứng mặt bằng";
const MATRIX_URL = "**/api/floor-stage-fronts";
const STAGE_URL = `**/api/construction-stages/${STAGE_ID}`;

function matrix(name = STAGE_NAME) {
  return {
    floors: ["T1", "T2"],
    stages: [{ id: STAGE_ID, name, sortOrder: 1, active: true, durationDays: 3 }],
    fronts: [
      {
        id: 910_602,
        floorLabel: "T2",
        stageId: STAGE_ID,
        receivedAt: "2026-10-24",
        handedOverAt: null,
        plannedReceivedAt: null,
        plannedHandedOverAt: "2026-10-27",
        note: null,
        updatedAt: "2026-10-24T00:00:00Z",
      },
    ],
  };
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

function region(page: Page) {
  return page.getByRole("region", { name: "Ma trận mặt bằng thi công" });
}

async function openMatrix(page: Page) {
  await page.goto("/work-fronts");
  await expect(region(page)).toBeVisible();
  await expect(region(page).getByRole("columnheader", { name: STAGE_NAME })).toBeVisible();
}

async function saveExistingStage(page: Page, name: string) {
  await page.getByRole("button", { name: `Sửa công tác ${STAGE_NAME}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa công tác thi công", exact: true });
  // Locator theo type cho phép chạy cùng một thao tác trên baseline chưa nối label.
  await dialog.locator('input:not([type="number"])').fill(name);
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function submitNewStage(page: Page, name: string, days: string) {
  await page.getByRole("button", { name: "Thêm công tác mới", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const legacyPrompt = page.getByRole("dialog", { name: "Tên công tác mới:", exact: true });
  // Baseline dùng hai prompt. Đi đến request thật ở cả hai bản để RED chứng minh
  // mất bản nhập sau lỗi, thay vì chỉ thiếu một selector của form mới.
  if (await legacyPrompt.isVisible()) {
    await legacyPrompt.getByRole("textbox").fill(name);
    await legacyPrompt.getByRole("button", { name: "OK", exact: true }).click();
    const duration = page.getByRole("dialog", {
      name: "Số ngày thi công (số nguyên dương):",
      exact: true,
    });
    await duration.getByRole("textbox").fill(days);
    await duration.getByRole("button", { name: "OK", exact: true }).click();
  } else {
    const form = page.getByRole("dialog", { name: "Thêm công tác thi công", exact: true });
    await form.getByRole("textbox", { name: "Tên công tác", exact: true }).fill(name);
    await form.getByRole("spinbutton", { name: "Số ngày thi công", exact: true }).fill(days);
    await form.getByRole("button", { name: "Thêm công tác", exact: true }).click();
  }
}

test("GET 500 hiện lỗi và retry có loading, không giả thành ma trận rỗng", async ({ page }) => {
  let gets = 0;
  const waiting = deferred();
  await page.route(MATRIX_URL, async (route) => {
    gets++;
    if (gets === 1)
      return route.fulfill({ status: 500, json: { error: "Không đọc được ma trận kiểm chứng" } });
    await waiting.promise;
    await route.fulfill({ json: matrix() }).catch(() => {});
  });
  try {
    await page.goto("/work-fronts");
    const main = page.getByRole("main");
    await expect(main.getByRole("alert")).toContainText("Không đọc được ma trận kiểm chứng");
    await expect(main.getByText("Chưa có dữ liệu tầng.", { exact: true })).toHaveCount(0);
    await main.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect.poll(() => gets).toBe(2);
    await expect(main.getByRole("status")).toContainText("Đang tải");
    await expect(main.getByText("Chưa có dữ liệu tầng.", { exact: true })).toHaveCount(0);
    waiting.release();
    await expect(region(page)).toBeVisible();
    await expect(main.getByRole("alert")).toHaveCount(0);
    expect(gets).toBe(2);
  } finally {
    waiting.release();
  }
});

test("GET bị ngắt có retry; chỉ response thành công rỗng mới hiện empty", async ({ page }) => {
  let gets = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(MATRIX_URL, async (route) => {
    gets++;
    if (gets === 1) return route.abort("failed");
    await route.fulfill({ json: { floors: [], stages: [], fronts: [] } });
  });
  await page.goto("/work-fronts");
  const main = page.getByRole("main");
  await expect(main.getByRole("alert")).toContainText("Không tải được mặt bằng thi công");
  await expect(main.getByText("Chưa có dữ liệu tầng.", { exact: true })).toHaveCount(0);
  await main.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(main.getByText("Chưa có dữ liệu tầng.", { exact: true })).toBeVisible();
  await expect(main.getByRole("alert")).toHaveCount(0);
  expect(gets).toBe(2);
  expect(errors).toEqual([]);
});

for (const failure of ["http", "network"] as const) {
  test(`refresh ${failure} giữ ma trận đã tải, retry nhận dữ liệu mới`, async ({ page }) => {
    let gets = 0;
    let patches = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(MATRIX_URL, async (route) => {
      gets++;
      if (gets === 2) {
        if (failure === "network") return route.abort("failed");
        return route.fulfill({ status: 500, json: { error: "Tạm lỗi khi tải lại mặt bằng" } });
      }
      await route.fulfill({ json: matrix(gets > 2 ? "Công tác sau thử lại" : STAGE_NAME) });
    });
    await page.route(STAGE_URL, async (route) => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ name: "Công tác đã lưu", durationDays: 3 });
      patches++;
      await route.fulfill({ json: { updated: STAGE_ID } });
    });
    await openMatrix(page);
    await saveExistingStage(page, "Công tác đã lưu");
    const main = page.getByRole("main");
    await expect(main.getByRole("alert")).toContainText(
      failure === "http" ? "Tạm lỗi khi tải lại mặt bằng" : "Không tải được mặt bằng thi công",
    );
    await expect(region(page).getByRole("columnheader", { name: STAGE_NAME })).toBeVisible();
    await expect(region(page).getByRole("link", { name: "T2", exact: true })).toBeVisible();
    await expect(region(page).getByText("24/10/2026 ✓", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(
      region(page).getByRole("columnheader", { name: "Công tác sau thử lại" }),
    ).toBeVisible();
    await expect(main.getByRole("alert")).toHaveCount(0);
    expect(gets).toBe(3);
    expect(patches).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("refresh mới hủy request cũ và response cũ không ghi đè ma trận mới", async ({ page }) => {
  let gets = 0;
  let patches = 0;
  const old = deferred();
  const oldFinished = deferred();
  let aborted = false;
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/floor-stage-fronts")) aborted = true;
  });
  await page.route(MATRIX_URL, async (route) => {
    gets++;
    if (gets === 2) {
      await old.promise;
      try {
        await route.fulfill({ json: matrix("Response cũ không được ghi đè") });
      } catch {
        // AbortController đã hủy request cũ trước khi handler trả dữ liệu.
      } finally {
        oldFinished.release();
      }
      return;
    }
    await route.fulfill({ json: matrix(gets > 2 ? "Ma trận mới nhất" : STAGE_NAME) });
  });
  await page.route(STAGE_URL, async (route) => {
    expect(route.request().method()).toBe("PATCH");
    patches++;
    await route.fulfill({ json: { updated: STAGE_ID } });
  });
  try {
    await openMatrix(page);
    await saveExistingStage(page, "Bản lưu thứ nhất");
    await expect.poll(() => gets).toBe(2);
    await saveExistingStage(page, "Bản lưu mới nhất");
    await expect.poll(() => gets).toBe(3);
    await expect(
      region(page).getByRole("columnheader", { name: "Ma trận mới nhất" }),
    ).toBeVisible();
    await expect.poll(() => aborted).toBe(true);
    old.release();
    await oldFinished.promise;
    await expect(
      region(page).getByRole("columnheader", { name: "Ma trận mới nhất" }),
    ).toBeVisible();
    await expect(region(page).getByText("Response cũ không được ghi đè")).toHaveCount(0);
    expect(patches).toBe(2);
  } finally {
    old.release();
  }
});

test("thêm lỗi HTTP hoặc mạng giữ bản nhập, retry một lần và chặn submit trùng khi pending", async ({
  page,
}) => {
  let gets = 0;
  let posts = 0;
  const waiting = deferred();
  const errors: string[] = [];
  const name = "Công tác giữ bản nhập";
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(MATRIX_URL, async (route) => {
    gets++;
    await route.fulfill({ json: matrix(posts >= 3 ? name : STAGE_NAME) });
  });
  await page.route("**/api/construction-stages", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ name, durationDays: 7 });
    posts++;
    if (posts === 1)
      return route.fulfill({
        status: 403,
        json: { error: "Chưa được phép thêm công tác kiểm chứng" },
      });
    if (posts === 2) return route.abort("failed");
    await waiting.promise;
    await route.fulfill({ status: 201, json: { id: STAGE_ID } }).catch(() => {});
  });
  try {
    await openMatrix(page);
    await submitNewStage(page, name, "7");
    await expect.poll(() => posts).toBe(1);
    const dialog = page.getByRole("dialog", { name: "Thêm công tác thi công", exact: true });
    const title = dialog.getByRole("textbox", { name: "Tên công tác", exact: true });
    const days = dialog.getByRole("spinbutton", { name: "Số ngày thi công", exact: true });
    await expect(dialog.getByRole("alert")).toHaveText("Chưa được phép thêm công tác kiểm chứng");
    await expect(title).toHaveValue(name);
    await expect(days).toHaveValue("7");
    await dialog.getByRole("button", { name: "Thêm công tác", exact: true }).click();
    await expect.poll(() => posts).toBe(2);
    await expect(dialog.getByRole("alert")).toContainText("Lỗi mạng");
    await expect(title).toHaveValue(name);
    await expect(days).toHaveValue("7");
    await dialog.getByRole("button", { name: "Thêm công tác", exact: true }).click();
    await expect.poll(() => posts).toBe(3);
    await expect(title).toBeDisabled();
    await expect(days).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Đang lưu...", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Huỷ", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    // Hai submit cùng tick kiểm pending-ref, không chỉ dựa disabled sau React render.
    await dialog.locator("form").evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) throw new Error("Không tìm thấy form công tác");
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(posts).toBe(3);
    waiting.release();
    await expect(dialog).toHaveCount(0);
    await expect(region(page).getByRole("columnheader", { name })).toBeVisible();
    expect(posts).toBe(3);
    expect(gets).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    waiting.release();
  }
});

test("form thêm có label, input 16px, target 44px và giữ số ngày sai để sửa", async ({ page }) => {
  let gets = 0;
  let posts = 0;
  await page.route(MATRIX_URL, async (route) => {
    gets++;
    await route.fulfill({ json: matrix() });
  });
  await page.route("**/api/construction-stages", async (route) => {
    posts++;
    await route.fulfill({ status: 500, json: { error: "Không được ghi ở ca validation" } });
  });
  await openMatrix(page);
  const opener = page.getByRole("button", { name: "Thêm công tác mới", exact: true });
  await expect(opener).toHaveCSS("min-height", "44px");
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Thêm công tác thi công", exact: true });
  const title = dialog.getByRole("textbox", { name: "Tên công tác", exact: true });
  const days = dialog.getByRole("spinbutton", { name: "Số ngày thi công", exact: true });
  await expect(title).toHaveCSS("font-size", "16px");
  await expect(days).toHaveCSS("font-size", "16px");
  await expect(days).toHaveAttribute("min", "1");
  await expect(days).toHaveAttribute("step", "1");
  await title.fill("Bản nhập kiểm tra số ngày");
  for (const invalid of ["0", "-1", "1.5"]) {
    await days.fill(invalid);
    await dialog.getByRole("button", { name: "Thêm công tác", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Số ngày thi công phải là số nguyên dương");
    await expect(days).toHaveValue(invalid);
    await expect(title).toHaveValue("Bản nhập kiểm tra số ngày");
  }
  for (const control of await dialog.locator("input, button").all()) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
  await expect(opener).toBeFocused();
  expect(posts).toBe(0);
  expect(gets).toBe(1);
});

test("hủy xác nhận ẩn giữ bản nhập sửa; xác nhận vẫn gửi PATCH active false", async ({ page }) => {
  let gets = 0;
  const patches: unknown[] = [];
  await page.route(MATRIX_URL, async (route) => {
    gets++;
    await route.fulfill({
      json: patches.length ? { ...matrix(), stages: [], fronts: [] } : matrix(),
    });
  });
  await page.route(STAGE_URL, async (route) => {
    expect(route.request().method()).toBe("PATCH");
    patches.push(route.request().postDataJSON());
    await route.fulfill({ json: { updated: STAGE_ID } });
  });
  await openMatrix(page);
  await page.getByRole("button", { name: `Sửa công tác ${STAGE_NAME}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa công tác thi công", exact: true });
  const title = dialog.locator('input:not([type="number"])');
  await title.fill("Bản nhập sửa chưa lưu");
  await dialog.getByRole("button", { name: "Ẩn công tác", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: /^Ẩn công tác "/ });
  await expect(confirm).toContainText("Dữ liệu mặt trận đã ghi vẫn giữ trong hệ thống.");
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(title).toHaveValue("Bản nhập sửa chưa lưu");
  expect(patches).toEqual([]);
  await dialog.getByRole("button", { name: "Ẩn công tác", exact: true }).click();
  await confirm.getByRole("button", { name: "Ẩn công tác", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(region(page).getByRole("columnheader", { name: STAGE_NAME })).toHaveCount(0);
  expect(patches).toEqual([{ active: false }]);
  expect(gets).toBe(2);
});
