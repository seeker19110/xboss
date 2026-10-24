import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Chỉ dùng fixture qua route: mọi mutation nền bị chặn, không ghi DB hoặc storage.
test.use({ serviceWorkers: "block" });

const FLOOR = "T1";
const PATH = `/work-fronts/${FLOOR}`;
const PRIMARY = "**/api/floor-stage-fronts?floor=T1";
const FIRST = 920_101;
const SECOND = 920_102;
const DOCS = `**/api/floor-stage-fronts/${FIRST}/documents`;

function fixture() {
  return {
    stages: [
      { id: 920_001, name: "Công tác đầu kiểm chứng", sortOrder: 1, active: true, durationDays: 3 },
      { id: 920_002, name: "Công tác sau kiểm chứng", sortOrder: 2, active: true, durationDays: 4 },
    ],
    fronts: [FIRST, SECOND].map((id, index) => ({
      id,
      floorLabel: FLOOR,
      stageId: 920_001 + index,
      receivedAt: "2026-10-24",
      handedOverAt: null,
      plannedReceivedAt: "2026-10-23",
      plannedHandedOverAt: "2026-10-27",
      note: index === 0 ? "Ghi chú đã lưu" : "Ghi chú công tác sau",
      outgoingSupplierId: 77,
      incomingSupplierId: 88,
      transitionStageId: 920_002,
      outgoingRepName: "Đại diện A",
      incomingRepName: "Đại diện B",
      updatedAt: "2026-10-24T00:00:00Z",
    })),
  };
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

function card(page: Page, index = 0) {
  const name = `${index + 1}. ${index ? "Công tác sau kiểm chứng" : "Công tác đầu kiểm chứng"}`;
  return page.getByRole("heading", { level: 2, name, exact: true }).locator("..");
}

async function setup(page: Page, role = "admin") {
  const state = { data: fixture(), primaryGets: 0, supplierGets: 0, errors: [] as string[] };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", (route) => {
    if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.continue();
    return route.fulfill({ status: 403, json: { error: "Mutation ngoài fixture bị chặn" } });
  });
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, user: { ...body.user, role } } });
  });
  await page.route(PRIMARY, (route) => {
    state.primaryGets++;
    return route.fulfill({ json: state.data });
  });
  await page.route("**/api/suppliers", (route) => {
    state.supplierGets++;
    return route.fulfill({
      json: {
        suppliers: [
          { id: 77, name: "Nhà thầu A" },
          { id: 88, name: "Nhà thầu B" },
        ],
      },
    });
  });
  await page.route(/\/api\/floor-stage-fronts\/\d+\/documents$/, (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  return state;
}

test("công tác sẵn sàng ngay sau primary dù nhà thầu chưa phản hồi", async ({ page }) => {
  const state = await setup(page);
  const pending = deferred();
  await page.route("**/api/suppliers", async (route) => {
    state.supplierGets++;
    await pending.promise;
    await route.fulfill({ json: { suppliers: [] } }).catch(() => {});
  });
  try {
    const primary = page.waitForResponse((response) =>
      response.url().includes("floor-stage-fronts?floor=T1"),
    );
    await page.goto(PATH);
    expect((await primary).status()).toBe(200);
    await expect(card(page)).toBeVisible({ timeout: 2500 });
    await expect(
      card(page).getByRole("combobox", { name: "Nhà thầu bàn giao", exact: true }),
    ).toBeDisabled();
    expect(state.primaryGets).toBe(1);
    expect(state.errors).toEqual([]);
  } finally {
    pending.release();
  }
});

test("primary lỗi không đợi nhà thầu và retry không giả thành empty", async ({ page }) => {
  const state = await setup(page);
  const pending = deferred();
  let primaryGets = 0;
  await page.route("**/api/suppliers", async (route) => {
    await pending.promise;
    await route.fulfill({ json: { suppliers: [] } }).catch(() => {});
  });
  await page.route(PRIMARY, (route) =>
    ++primaryGets === 1
      ? route.fulfill({ status: 500, json: { error: "Không đọc được tầng kiểm chứng" } })
      : route.fulfill({ json: state.data }),
  );
  try {
    await page.goto(PATH);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Không đọc được tầng kiểm chứng",
      { timeout: 2500 },
    );
    await expect(page.getByText("Chưa có công tác nào.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(card(page)).toBeVisible();
    expect(primaryGets).toBe(2);
    expect(state.errors).toEqual([]);
  } finally {
    pending.release();
  }
});

for (const failure of ["http", "both-network"] as const) {
  test(`tài khoản lỗi ${failure} được phục hồi bằng một lần retry`, async ({ page }) => {
    const state = await setup(page);
    let authGets = 0;
    let primaryGets = 0;
    await page.route("**/api/auth/me", async (route) => {
      if (++authGets === 1)
        return failure === "http"
          ? route.fulfill({ status: 500, json: { error: "Tài khoản tạm lỗi" } })
          : route.abort("failed");
      return route.fallback();
    });
    await page.route(PRIMARY, (route) => {
      if (++primaryGets === 1 && failure === "both-network") return route.abort("failed");
      return route.fulfill({ json: state.data });
    });
    await page.goto(PATH);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Không tải được chi tiết mặt bằng",
    );
    await expect(page.getByText("Chưa có công tác nào.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(card(page)).toBeVisible();
    expect(authGets).toBe(2);
    expect(primaryGets).toBe(2);
    expect(state.errors).toEqual([]);
  });
}

test("nhà thầu lỗi retry riêng; lưu ghi chú vẫn giữ nguyên ID và toàn bộ payload", async ({
  page,
}) => {
  const state = await setup(page);
  let supplierGets = 0;
  await page.route("**/api/suppliers", (route) =>
    ++supplierGets === 1
      ? route.fulfill({ status: 500, json: { error: "Danh mục nhà thầu tạm lỗi" } })
      : route.fallback(),
  );
  const payloads: unknown[] = [];
  await page.route("**/api/floor-stage-fronts", (route) => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: FIRST } });
  });
  await page.goto(PATH);
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Không tải được nhà thầu");
  const outgoing = card(page).getByRole("combobox", { name: "Nhà thầu bàn giao", exact: true });
  await expect(outgoing).toBeDisabled();
  await expect(outgoing).toHaveValue("77");
  await card(page).getByRole("textbox", { name: "Ghi chú", exact: true }).fill("Ghi chú mới");
  await card(page).getByRole("button", { name: "Lưu", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0]).toEqual({
    floorLabel: FLOOR,
    stageId: 920_001,
    receivedAt: "2026-10-24",
    handedOverAt: null,
    plannedReceivedAt: "2026-10-23",
    note: "Ghi chú mới",
    outgoingSupplierId: "77",
    incomingSupplierId: "88",
    transitionStageId: "920002",
    outgoingRepName: "Đại diện A",
    incomingRepName: "Đại diện B",
  });
  await expect(card(page).getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
  const beforeRetry = state.primaryGets;
  await page.getByRole("button", { name: "Thử lại nhà thầu", exact: true }).click();
  await expect(outgoing).toBeEnabled();
  await expect(outgoing).toHaveValue("77");
  expect(state.primaryGets).toBe(beforeRetry);
  expect(supplierGets).toBe(2);
});

for (const failure of ["network", "http"] as const) {
  test(`PUT lỗi ${failure} giữ draft, hết pending và thử lại thành công`, async ({ page }) => {
    const state = await setup(page);
    let puts = 0;
    await page.route("**/api/floor-stage-fronts", (route) => {
      const payload = route.request().postDataJSON();
      if (++puts === 1)
        return failure === "network"
          ? route.abort("failed")
          : route.fulfill({ status: 403, json: { error: "Quyền lưu tạm bị từ chối" } });
      state.data.fronts[0].note = payload.note;
      return route.fulfill({ json: { id: FIRST } });
    });
    await page.goto(PATH);
    const note = card(page).getByRole("textbox", { name: "Ghi chú", exact: true });
    await note.fill("Bản nhập cần giữ");
    await card(page).getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(card(page).getByRole("alert")).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
    await expect(note).toHaveValue("Bản nhập cần giữ");
    await card(page).getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(card(page).getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
    await expect(card(page).getByRole("alert")).toHaveCount(0);
    await expect(note).toHaveValue("Bản nhập cần giữ");
    expect(puts).toBe(2);
    expect(state.errors).toEqual([]);
  });
}

test("pending bao gồm refresh; lưu công tác đầu không xóa draft công tác khác", async ({
  page,
}) => {
  const state = await setup(page);
  const refresh = deferred();
  let gets = 0;
  let puts = 0;
  await page.route(PRIMARY, async (route) => {
    if (++gets > 1) await refresh.promise;
    await route.fulfill({ json: state.data }).catch(() => {});
  });
  await page.route("**/api/floor-stage-fronts", (route) => {
    puts++;
    state.data.fronts[0].note = route.request().postDataJSON().note;
    // Cascade kế hoạch có thể thay đổi props công tác khác dù người dùng chưa lưu nó.
    state.data.fronts[1].plannedReceivedAt = "2026-11-01";
    return route.fulfill({ json: { id: FIRST } });
  });
  try {
    await page.goto(PATH);
    const otherNote = card(page, 1).getByRole("textbox", { name: "Ghi chú", exact: true });
    await otherNote.fill("Draft công tác sau chưa lưu");
    await card(page)
      .getByRole("textbox", { name: "Ghi chú", exact: true })
      .fill("Đã gửi công tác đầu");
    await card(page).getByRole("button", { name: "Lưu", exact: true }).click();
    await expect.poll(() => gets).toBe(2);
    await expect(card(page).getByRole("button", { name: /Đang lưu/ })).toBeDisabled();
    const note = card(page).getByRole("textbox", { name: "Ghi chú", exact: true });
    expect((await note.isDisabled()) || (await note.getAttribute("readonly")) !== null).toBe(true);
    refresh.release();
    await expect(card(page).getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
    await expect(otherNote).toHaveValue("Draft công tác sau chưa lưu");
    expect(puts).toBe(1);
    expect(state.errors).toEqual([]);
  } finally {
    refresh.release();
  }
});

test("refresh sau PUT lỗi giữ công tác và mọi draft, retry GET không gửi lại PUT", async ({
  page,
}) => {
  const state = await setup(page);
  let gets = 0;
  let puts = 0;
  await page.route(PRIMARY, (route) =>
    ++gets === 2
      ? route.fulfill({ status: 500, json: { error: "Không đọc lại được tầng sau lưu" } })
      : route.fulfill({ json: state.data }),
  );
  await page.route("**/api/floor-stage-fronts", (route) => {
    puts++;
    return route.fulfill({ json: { id: FIRST } });
  });
  await page.goto(PATH);
  await card(page, 1)
    .getByRole("textbox", { name: "Ghi chú", exact: true })
    .fill("Draft khác phải còn");
  await card(page).getByRole("textbox", { name: "Ghi chú", exact: true }).fill("Draft vừa gửi");
  await card(page).getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Không đọc lại được tầng sau lưu",
  );
  await expect(card(page)).toBeVisible();
  await expect(card(page, 1).getByRole("textbox", { name: "Ghi chú", exact: true })).toHaveValue(
    "Draft khác phải còn",
  );
  await expect(card(page).getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(puts).toBe(1);
  expect(gets).toBe(3);
});

test("tài liệu đang tải hoặc lỗi không giả thành chưa có file; retry riêng mới xác nhận empty", async ({
  page,
}) => {
  const state = await setup(page);
  const pending = deferred();
  let gets = 0;
  await page.route(DOCS, async (route) => {
    if (++gets === 1) {
      await pending.promise;
      return route
        .fulfill({ status: 500, json: { error: "Không đọc được tài liệu kiểm chứng" } })
        .catch(() => {});
    }
    return route.fulfill({ json: { documents: [] } });
  });
  try {
    await page.goto(PATH);
    await expect(card(page).getByRole("status")).toContainText("Đang tải tài liệu");
    await expect(card(page).getByText("Chưa có file.", { exact: true })).toHaveCount(0);
    pending.release();
    await expect(card(page).getByRole("alert")).toContainText("Không đọc được tài liệu kiểm chứng");
    await expect(card(page).getByText("Chưa có file.", { exact: true })).toHaveCount(0);
    const beforeRetry = state.primaryGets;
    await card(page).getByRole("button", { name: "Thử lại tài liệu", exact: true }).click();
    await expect(card(page).getByText("Chưa có file.", { exact: true })).toHaveCount(3);
    expect(state.primaryGets).toBe(beforeRetry);
    expect(gets).toBe(2);
    expect(state.errors).toEqual([]);
  } finally {
    pending.release();
  }
});

test("upload thành công nhưng GET tài liệu lỗi vẫn giữ danh sách cũ và retry không upload lại", async ({
  page,
}) => {
  const state = await setup(page);
  let gets = 0;
  let uploads = 0;
  await page.route(DOCS, (route: Route) => {
    if (route.request().method() === "POST") {
      uploads++;
      expect(route.request().postDataBuffer()?.toString()).toContain('name="kind"');
      return route.fulfill({ status: 201, json: { id: 920_200 } });
    }
    if (++gets === 2)
      return route.fulfill({ status: 500, json: { error: "Tài liệu đã tải cần được giữ" } });
    return route.fulfill({
      json: {
        documents: [
          {
            id: 920_201,
            fileName: "bien-ban.pdf",
            mime: "application/pdf",
            docKind: "handover",
            createdAt: "2026-10-24",
            uploaderName: "Người kiểm chứng",
          },
        ],
      },
    });
  });
  await page.goto(PATH);
  const link = card(page).locator('a[href="/api/floor-stage-front-documents/920201"]');
  await expect(link).toBeVisible();
  await card(page)
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "bien-ban-moi.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fixture"),
    });
  await expect(card(page).getByRole("alert")).toContainText("Tài liệu đã tải cần được giữ");
  await expect(link).toBeVisible();
  await card(page).getByRole("button", { name: "Thử lại tài liệu", exact: true }).click();
  await expect(card(page).getByRole("alert")).toHaveCount(0);
  expect(uploads).toBe(1);
  expect(state.errors).toEqual([]);
});

for (const role of ["viewer", "engineer", "pm"] as const) {
  test(`giữ quyền giao diện chi tiết tầng cho ${role}`, async ({ page }) => {
    await setup(page, role);
    await page.goto(PATH);
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Lưu", exact: true })).toHaveCount(
      role === "viewer" ? 0 : 1,
    );
    await expect(card(page).locator('input[type="file"]')).toHaveCount(role === "viewer" ? 0 : 3);
  });
}

test("primary 401 dùng flow hết phiên hiện hữu", async ({ page }) => {
  await setup(page);
  await page.route(PRIMARY, (route) =>
    route.fulfill({ status: 401, json: { error: "Phiên đã hết hạn" } }),
  );
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/login$/);
});

test("chỉ primary 200 có stages rỗng mới hiện chưa có công tác", async ({ page }) => {
  await setup(page);
  await page.route(PRIMARY, (route) => route.fulfill({ json: { stages: [], fronts: [] } }));
  await page.goto(PATH);
  await expect(page.getByText("Chưa có công tác nào.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

for (const light of [false, true]) {
  test(`loading/lỗi nguồn phụ và form lỗi không có axe serious/critical ở ${light ? "sáng" : "tối"}`, async ({
    page,
  }) => {
    await setup(page);
    const pending = deferred();
    await page.route(DOCS, async (route) => {
      await pending.promise;
      await route.fulfill({ status: 500, json: { error: "Tài liệu tạm lỗi" } }).catch(() => {});
    });
    await page.route("**/api/suppliers", (route) =>
      route.fulfill({ status: 500, json: { error: "Nhà thầu tạm lỗi" } }),
    );
    await page.route("**/api/floor-stage-fronts", (route) => route.abort("failed"));
    const check = async () => {
      const result = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
      ).toEqual([]);
    };
    try {
      await page.goto(PATH);
      await page.evaluate(
        (isLight) => document.documentElement.classList.toggle("light", isLight),
        light,
      );
      await expect(card(page).getByRole("status")).toContainText("Đang tải tài liệu");
      await check();
      pending.release();
      await expect(card(page).getByRole("alert")).toContainText("Tài liệu tạm lỗi");
      await card(page).getByRole("button", { name: "Lưu", exact: true }).click();
      await expect(card(page).getByRole("alert").filter({ hasText: "Mất kết nối" })).toBeVisible();
      await check();
    } finally {
      pending.release();
    }
  });
}
