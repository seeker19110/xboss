import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block", timezoneId: "Asia/Ho_Chi_Minh" });
const meeting = {
  id: 966001,
  meetingDate: "2099-10-24",
  kind: "weekly",
  title: "Họp kiểm chứng 686",
  attendees: "Nhóm kiểm chứng",
  content: "Biên bản mẫu",
  createdBy: 1,
  createdByName: "Kiểm chứng",
  actions: [
    {
      id: 966002,
      meetingId: 966001,
      content: "Việc kiểm chứng",
      assignee: 1,
      assigneeName: "Kiểm chứng",
      dueDate: "2099-10-25",
      status: "open",
      taskId: null,
      doneAt: null,
    },
  ],
};
const proposal = {
  id: 966003,
  code: "DX-UI686",
  kind: "advance",
  title: "Đề xuất kiểm chứng 686",
  amount: 123456,
  contractId: 77,
  contractCode: "HD-UI686",
  materialId: null,
  materialName: null,
  reason: "Lý do mẫu",
  status: "submitted",
  submittedAt: "2099-10-24",
  decidedAt: null,
  decidedByName: null,
  rejectReason: null,
  requestedBy: 1,
  requestedByName: "Kiểm chứng",
  createdAt: "2099-10-24",
  documentCount: 0,
};
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
async function fixture(page: Page, role = "admin") {
  const counts = {
    meetings: 0,
    proposals: 0,
    users: 0,
    contracts: 0,
    materials: 0,
    detail: 0,
    docs: 0,
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", (r) =>
    ["GET", "HEAD", "OPTIONS"].includes(r.request().method())
      ? r.continue()
      : r.fulfill({ status: 403, json: { error: "Không ghi ngoài fixture" } }),
  );
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: { user: { id: 1, name: "Kiểm chứng", email: "fixture@example.invalid", role } },
    }),
  );
  for (const [path, field, data] of [
    ["meetings", "meetings", [meeting]],
    ["proposals", "proposals", [proposal]],
    ["users", "users", [{ id: 1, name: "Kiểm chứng" }]],
    ["contracts", "contracts", [{ id: 77, code: "HD-UI686", title: "Hợp đồng mẫu" }]],
    ["materials", "materials", [{ id: 88, name: "Thép mẫu", unit: "kg" }]],
  ] as const) {
    await page.route(`**/api/${path}`, (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      counts[path]++;
      return r.fulfill({ json: { [field]: data } });
    });
  }
  await page.route(`**/api/proposals/${proposal.id}`, (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    counts.detail++;
    return r.fulfill({ json: { proposal, overNorm: null } });
  });
  await page.route(`**/api/proposals/${proposal.id}/documents`, (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    counts.docs++;
    return r.fulfill({ json: { documents: [] } });
  });
  return { counts, errors };
}
async function goto(page: Page, route: "meetings" | "proposals") {
  await page.goto(`/${route}`);
  await expect(
    page.getByRole("tablist", {
      name: route === "meetings" ? "Chuyển giữa họp và việc sau họp" : "Loại đề xuất",
    }),
  ).toBeVisible();
}
async function openForm(page: Page, route: "meetings" | "proposals") {
  await page
    .getByRole("button", {
      name: route === "meetings" ? "Tạo biên bản họp" : "Tạo đề xuất",
      exact: true,
    })
    .click();
  return page.getByRole("dialog");
}

test("họp: danh mục người làm chỉ tải khi mở biên bản, cache khi mở lại", async ({ page }) => {
  const s = await fixture(page);
  await goto(page, "meetings");
  await expect(page.getByText(meeting.title, { exact: true })).toBeVisible();
  expect(s.counts.users).toBe(0);
  if ((page.viewportSize()?.width ?? 1280) <= 430)
    expect(
      (await page.getByText(meeting.title, { exact: true }).boundingBox())!.width,
    ).toBeGreaterThanOrEqual(200);
  await page.getByRole("tab", { name: /Việc sau họp/ }).click();
  expect(s.counts.users).toBe(0);
  await page.getByRole("tab", { name: /Biên bản họp/ }).click();
  const row = page.getByRole("button", { name: new RegExp(meeting.title) });
  await row.click();
  await expect(page.getByLabel("Người làm", { exact: true })).toBeVisible();
  expect(s.counts.users).toBe(1);
  await row.click();
  await row.click();
  await expect(page.getByLabel("Người làm", { exact: true })).toBeVisible();
  expect(s.counts.users).toBe(1);
  expect(s.errors).toEqual([]);
});

test("đề xuất: chỉ tải đúng danh mục của form, cache qua loại và lần mở", async ({ page }) => {
  const s = await fixture(page);
  await goto(page, "proposals");
  expect(s.counts.contracts).toBe(0);
  expect(s.counts.materials).toBe(0);
  const d = await openForm(page, "proposals");
  await expect(d.getByLabel("Hợp đồng liên quan (tuỳ chọn)")).toBeVisible();
  expect(s.counts.contracts).toBe(1);
  expect(s.counts.materials).toBe(0);
  await d.getByLabel("Loại đề xuất", { exact: true }).selectOption("payment");
  expect(s.counts.contracts).toBe(1);
  await d.getByLabel("Loại đề xuất", { exact: true }).selectOption("allocation");
  await expect(d.getByLabel("Vật tư (tuỳ chọn)")).toBeVisible();
  expect(s.counts.materials).toBe(1);
  await page.keyboard.press("Escape");
  await openForm(page, "proposals");
  await expect(d.getByLabel("Hợp đồng liên quan (tuỳ chọn)")).toBeVisible();
  expect(s.counts.contracts).toBe(1);
  expect(s.counts.materials).toBe(1);
  expect(s.errors).toEqual([]);
});

for (const route of ["meetings", "proposals"] as const) {
  test(`${route}: lỗi danh sách có thử lại và không giả rỗng`, async ({ page }) => {
    const s = await fixture(page);
    let calls = 0;
    await page.route(`**/api/${route}`, (r) =>
      ++calls === 1
        ? r.fulfill({ status: 503, json: { error: "Nguồn đang lỗi kiểm chứng" } })
        : r.fulfill({ json: { [route]: route === "meetings" ? [meeting] : [proposal] } }),
    );
    await goto(page, route);
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("Nguồn đang lỗi kiểm chứng");
    await expect(
      page.getByText(route === "meetings" ? "Chưa có biên bản họp" : "Không có đề xuất chờ duyệt"),
    ).toHaveCount(0);
    await alert.getByRole("button", { name: "Thử lại" }).click();
    await expect(
      page.getByText(route === "meetings" ? meeting.title : proposal.title, { exact: true }),
    ).toBeVisible();
    expect(calls).toBe(2);
    expect(s.errors).toEqual([]);
  });
}

test("đề xuất: mở chi tiết bằng bàn phím, không tải định mức cho tạm ứng", async ({ page }) => {
  const s = await fixture(page);
  await goto(page, "proposals");
  const button = page.getByRole("button", { name: proposal.title, exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: proposal.title }),
  ).toBeVisible();
  await expect(page.getByText("Chưa có file.", { exact: true })).toBeVisible();
  expect(s.counts.detail).toBe(0);
  expect(s.counts.docs).toBe(1);
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  expect(s.errors).toEqual([]);
});

for (const route of ["meetings", "proposals"] as const) {
  for (const failure of ["network", "json"] as const) {
    test(`${route}: lỗi ${failure} không biến thành rỗng`, async ({ page }) => {
      const s = await fixture(page);
      await page.route(`**/api/${route}`, (r) =>
        failure === "network" ? r.abort("failed") : r.fulfill({ json: { [route]: null } }),
      );
      await goto(page, route);
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(
        page.getByText(
          route === "meetings" ? "Chưa có biên bản họp" : "Không có đề xuất chờ duyệt",
        ),
      ).toHaveCount(0);
      expect(s.errors).toEqual([]);
    });
  }
  test(`${route}: danh sách không chờ quyền; role đến muộn không đổi tab đã chọn`, async ({
    page,
  }) => {
    const s = await fixture(page);
    const hold = latch();
    const seen = latch();
    await page.route("**/api/auth/me", async (r) => {
      seen.release();
      await hold.promise;
      await r
        .fulfill({ json: { user: { id: 1, name: "Kiểm chứng", role: "admin" } } })
        .catch(() => {});
    });
    try {
      await goto(page, route);
      await seen.promise;
      await expect(
        page.getByText(route === "meetings" ? meeting.title : proposal.title, { exact: true }),
      ).toBeVisible();
      const selected = page.getByRole("tab", {
        name: route === "meetings" ? /Việc sau họp/ : /^Khác/,
      });
      await selected.click();
      hold.release();
      await expect(
        page.getByRole("button", {
          name: route === "meetings" ? "Tạo biên bản họp" : "Tạo đề xuất",
          exact: true,
        }),
      ).toBeVisible();
      await expect(selected).toHaveAttribute("aria-selected", "true");
      expect(s.counts.users + s.counts.contracts + s.counts.materials).toBe(0);
    } finally {
      hold.release();
    }
    expect(s.errors).toEqual([]);
  });
  test(`${route}: refresh lỗi giữ snapshot chỉ xem, retry phục hồi`, async ({ page }) => {
    const s = await fixture(page);
    await goto(page, route);
    const title = route === "meetings" ? meeting.title : proposal.title;
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    if (route === "meetings") await page.getByRole("button", { name: new RegExp(title) }).click();
    await page.route(`**/api/${route}`, (r) =>
      r.fulfill({ status: 503, json: { error: "Refresh lỗi mẫu" } }),
    );
    await page.getByRole("button", { name: "Tải lại danh sách", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Refresh lỗi mẫu");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: route === "meetings" ? "Đánh dấu xong" : title,
        exact: true,
      }),
    ).toBeDisabled();
    await page.route(`**/api/${route}`, (r) =>
      r.fulfill({ json: { [route]: route === "meetings" ? [meeting] : [proposal] } }),
    );
    await page
      .getByRole("main")
      .getByRole("alert")
      .getByRole("button", { name: "Thử lại" })
      .click();
    await expect(
      page.getByRole("button", {
        name: route === "meetings" ? "Đánh dấu xong" : title,
        exact: true,
      }),
    ).toBeEnabled();
    expect(s.errors).toEqual([]);
  });
  test(`${route}: gửi một lần, pending giữ modal/draft và payload`, async ({ page }) => {
    const s = await fixture(page);
    const hold = latch();
    const seen = latch();
    const bodies: unknown[] = [];
    await page.route(`**/api/${route}`, async (r) => {
      if (r.request().method() !== "POST") return r.fallback();
      bodies.push(r.request().postDataJSON());
      seen.release();
      await hold.promise;
      await r.fulfill({ status: 503, json: { error: "Không lưu mẫu" } }).catch(() => {});
    });
    await goto(page, route);
    const d = await openForm(page, route);
    await d.getByLabel("Tiêu đề", { exact: true }).fill("  Draft giữ nguyên  ");
    const save = d.getByRole("button", {
      name: route === "meetings" ? "Tạo biên bản họp" : "Tạo đề xuất (nháp)",
      exact: true,
    });
    await expect(save).toBeEnabled();
    try {
      await save.click();
      await seen.promise;
      await page.keyboard.press("Escape");
      await expect(d).toBeVisible();
      await expect(d.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
      await expect(d.getByLabel("Tiêu đề", { exact: true })).toBeDisabled();
      await expect(d.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
      expect(bodies).toHaveLength(1);
      hold.release();
      await expect(d.getByRole("alert")).toContainText("Không lưu mẫu");
      await expect(d.getByLabel("Tiêu đề", { exact: true })).toHaveValue("  Draft giữ nguyên  ");
      expect(bodies[0]).toMatchObject(
        route === "meetings"
          ? { kind: "weekly", title: "Draft giữ nguyên", attendees: null, content: null }
          : {
              kind: "advance",
              title: "Draft giữ nguyên",
              amount: null,
              contractId: null,
              materialId: null,
              reason: null,
            },
      );
    } finally {
      hold.release();
    }
    expect(s.errors).toEqual([]);
  });
  test(`${route}: danh sách 401 về đăng nhập`, async ({ page }) => {
    await fixture(page);
    await page.route(`**/api/${route}`, (r) =>
      r.fulfill({ status: 401, json: { error: "Hết phiên" } }),
    );
    await page.goto(`/${route}`);
    await expect(page).toHaveURL(/\/login/);
  });
}

test("họp: lỗi người làm giữ draft, chỉ retry danh mục rồi gửi đúng DTO", async ({ page }) => {
  const s = await fixture(page);
  let users = 0;
  const payloads: unknown[] = [];
  await page.route("**/api/users", (r) =>
    ++users === 1
      ? r.fulfill({ status: 503, json: { error: "Người làm lỗi mẫu" } })
      : r.fulfill({ json: { users: [{ id: 1, name: "Kiểm chứng" }] } }),
  );
  await page.route(`**/api/meetings/${meeting.id}/actions`, (r) => {
    payloads.push(r.request().postDataJSON());
    return r.fulfill({ json: { id: 966009 } });
  });
  await goto(page, "meetings");
  await page.getByRole("button", { name: new RegExp(meeting.title) }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Người làm lỗi mẫu");
  await page.getByLabel("Việc cần làm").fill("  Giữ draft  ");
  await expect(page.getByRole("button", { name: "Thêm việc", exact: true })).toBeDisabled();
  await page.getByRole("main").getByRole("alert").getByRole("button", { name: "Thử lại" }).click();
  await page.getByLabel("Người làm", { exact: true }).selectOption("1");
  await expect(page.getByLabel("Việc cần làm")).toHaveValue("  Giữ draft  ");
  expect(s.counts.meetings).toBe(1);
  expect(users).toBe(2);
  await page.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0]).toEqual({ content: "Giữ draft", assignee: 1, dueDate: null });
  await expect.poll(() => s.counts.meetings).toBe(2);
  expect(s.errors).toEqual([]);
});

test("họp: kỹ sư tạo việc không tải danh sách người dùng", async ({ page }) => {
  const s = await fixture(page, "engineer");
  const payloads: unknown[] = [];
  await page.route(`**/api/meetings/${meeting.id}/actions`, (r) => {
    payloads.push(r.request().postDataJSON());
    return r.fulfill({ json: { id: 966009 } });
  });
  await goto(page, "meetings");
  await page.getByRole("button", { name: new RegExp(meeting.title) }).click();
  await page.getByLabel("Việc cần làm").fill("Việc kỹ sư");
  await page.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0]).toEqual({ content: "Việc kỹ sư", assignee: null, dueDate: null });
  expect(s.counts.users).toBe(0);
  expect(s.errors).toEqual([]);
});

for (const role of ["engineer", "subcon", "bch", "viewer"]) {
  test(`đề xuất: role ${role} không tải danh mục tiền ngoài quyền`, async ({ page }) => {
    const s = await fixture(page, role);
    await goto(page, "proposals");
    if (role === "engineer" || role === "subcon") {
      const d = await openForm(page, "proposals");
      await d.getByLabel("Tiêu đề", { exact: true }).fill("Theo quyền hiện hữu");
      await expect(d.getByRole("button", { name: "Tạo đề xuất (nháp)" })).toBeEnabled();
      await expect(d.getByLabel("Hợp đồng liên quan (tuỳ chọn)")).toHaveCount(0);
      await d.getByLabel("Loại đề xuất", { exact: true }).selectOption("allocation");
      await expect(d.getByLabel("Vật tư (tuỳ chọn)")).toBeVisible();
      expect(s.counts.materials).toBe(1);
    } else
      await expect(page.getByRole("button", { name: "Tạo đề xuất", exact: true })).toHaveCount(0);
    expect(s.counts.contracts).toBe(0);
    expect(s.errors).toEqual([]);
  });
}

test("đề xuất: lỗi hợp đồng giữ draft, đổi loại không chờ nguồn khác", async ({ page }) => {
  const s = await fixture(page);
  let contracts = 0;
  await page.route("**/api/contracts", (r) =>
    ++contracts === 1
      ? r.fulfill({ status: 503, json: { error: "Hợp đồng lỗi mẫu" } })
      : r.fulfill({ json: { contracts: [{ id: 77, code: "HD-UI686", title: "Hợp đồng mẫu" }] } }),
  );
  await goto(page, "proposals");
  const d = await openForm(page, "proposals");
  await expect(d.getByRole("alert")).toContainText("Hợp đồng lỗi mẫu");
  await d.getByLabel("Tiêu đề", { exact: true }).fill("Draft danh mục");
  await expect(d.getByRole("button", { name: "Tạo đề xuất (nháp)" })).toBeDisabled();
  await d.getByLabel("Loại đề xuất", { exact: true }).selectOption("other");
  await expect(d.getByRole("button", { name: "Tạo đề xuất (nháp)" })).toBeEnabled();
  await d.getByLabel("Loại đề xuất", { exact: true }).selectOption("payment");
  await expect(d.getByLabel("Hợp đồng liên quan (tuỳ chọn)")).toBeVisible();
  await expect(d.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Draft danh mục");
  expect(contracts).toBe(2);
  expect(s.counts.proposals).toBe(1);
  expect(s.counts.materials).toBe(0);
  expect(s.errors).toEqual([]);
});

test("đề xuất: đóng form hủy request, response cũ không ghi đè lần mở mới", async ({ page }) => {
  const s = await fixture(page);
  const seen = latch();
  const hold = latch();
  let calls = 0;
  await page.route("**/api/contracts", async (r) => {
    if (++calls === 1) {
      seen.release();
      await hold.promise;
      return r
        .fulfill({ json: { contracts: [{ id: 99, code: "HD-CU", title: "Cũ" }] } })
        .catch(() => {});
    }
    return r.fulfill({ json: { contracts: [{ id: 77, code: "HD-MOI", title: "Mới" }] } });
  });
  try {
    await goto(page, "proposals");
    await openForm(page, "proposals");
    await seen.promise;
    await page.keyboard.press("Escape");
    const d = await openForm(page, "proposals");
    await expect(d.getByLabel("Hợp đồng liên quan (tuỳ chọn)")).toContainText("HD-MOI");
    hold.release();
    await expect(d.getByLabel("Hợp đồng liên quan (tuỳ chọn)")).not.toContainText("HD-CU");
    expect(calls).toBe(2);
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

test("đề xuất: tài liệu lỗi không giả rỗng, retry riêng; duyệt giữ createBill", async ({
  page,
}) => {
  const s = await fixture(page);
  let docs = 0;
  const decisions: unknown[] = [];
  await page.route(`**/api/proposals/${proposal.id}/documents`, (r) =>
    ++docs === 1
      ? r.fulfill({ status: 503, json: { error: "Tài liệu lỗi mẫu" } })
      : r.fulfill({ json: { documents: [] } }),
  );
  await page.route(`**/api/proposals/${proposal.id}/decide`, (r) => {
    decisions.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await goto(page, "proposals");
  await page.getByRole("button", { name: proposal.title, exact: true }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("alert")).toContainText("Tài liệu lỗi mẫu");
  await expect(d.getByText("Chưa có file.", { exact: true })).toHaveCount(0);
  await d.getByRole("alert").getByRole("button", { name: "Thử lại" }).click();
  await expect(d.getByText("Chưa có file.", { exact: true })).toBeVisible();
  expect(s.counts.proposals).toBe(1);
  await d.getByRole("checkbox").check();
  await page.route("**/api/proposals", (r) =>
    r.fulfill({ status: 503, json: { error: "Refresh sau duyệt lỗi mẫu" } }),
  );
  await d.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("Refresh sau duyệt lỗi mẫu");
  await expect(d.getByRole("button", { name: "Duyệt", exact: true })).toBeDisabled();
  await expect(d.getByRole("button", { name: "Đóng", exact: true })).toBeEnabled();
  expect(decisions).toEqual([{ decision: "approved", createBill: true }]);
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
  expect(s.errors).toEqual([]);
});

test("đề xuất: định mức cấp phát là cảnh báo mềm; lỗi vẫn cho quyết theo quyền", async ({
  page,
}) => {
  const s = await fixture(page);
  let norms = 0;
  await page.route("**/api/proposals", (r) =>
    r.fulfill({
      json: {
        proposals: [{ ...proposal, kind: "allocation", materialId: 88, materialName: "Thép mẫu" }],
      },
    }),
  );
  await page.route(`**/api/proposals/${proposal.id}`, (r) =>
    ++norms === 1
      ? r.fulfill({ status: 503, json: { error: "Lỗi định mức mẫu" } })
      : r.fulfill({
          json: {
            overNorm: {
              boqCode: "BOQ-UI",
              resourceLabel: "Thép mẫu",
              unitLabel: "kg",
              expected: 100,
              actual: 120,
              variancePct: 20,
            },
          },
        }),
  );
  await goto(page, "proposals");
  await page.getByRole("button", { name: proposal.title, exact: true }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("alert")).toContainText("Không tải được thông tin định mức");
  await expect(d.getByRole("button", { name: "Duyệt", exact: true })).toBeEnabled();
  await d.getByRole("alert").getByRole("button", { name: "Thử lại" }).click();
  await expect(d.getByText(/đang vượt định mức/)).toBeVisible();
  await expect(d.getByRole("button", { name: "Duyệt", exact: true })).toBeEnabled();
  await expect(d.getByRole("checkbox")).toHaveCount(0);
  expect(norms).toBe(2);
  expect(s.errors).toEqual([]);
});

for (const theme of ["light", "darkblue"]) {
  for (const route of ["meetings", "proposals"] as const) {
    test(`${route}: 360px, nội dung dài và form đạt axe theme ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.addInitScript((t) => localStorage.setItem("xboss_theme", t), theme);
      const s = await fixture(page);
      const long = "Mãkiểmchứng".repeat(28);
      await page.route(`**/api/${route}`, (r) =>
        r.fulfill({
          json: {
            [route]:
              route === "meetings"
                ? [
                    {
                      ...meeting,
                      title: long,
                      content: long,
                      actions: [{ ...meeting.actions[0], content: long }],
                    },
                  ]
                : [{ ...proposal, title: long }],
          },
        }),
      );
      await goto(page, route);
      if (route === "meetings") {
        await page.getByRole("button", { name: new RegExp(long) }).click();
        await expect(page.getByLabel("Người làm", { exact: true })).toBeVisible();
      } else {
        const open = page.getByRole("button", { name: long, exact: true });
        await open.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByText("Chưa có file.", { exact: true })).toBeVisible();
      }
      const check = async () => {
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          );
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
        ).toEqual([]);
      };
      await check();
      if (route === "proposals") await page.keyboard.press("Escape");
      const d = await openForm(page, route);
      await d.getByLabel("Tiêu đề", { exact: true }).fill("Kiểm chứng trên điện thoại");
      const save = d.getByRole("button", {
        name: route === "meetings" ? "Tạo biên bản họp" : "Tạo đề xuất (nháp)",
        exact: true,
      });
      await expect(save).toBeEnabled();
      const title = d.getByLabel("Tiêu đề", { exact: true });
      await expect(title).toHaveCSS("font-size", "16px");
      if (route === "meetings")
        expect(
          (await d.getByLabel("Ngày họp", { exact: true }).boundingBox())!.width,
        ).toBeGreaterThanOrEqual(200);
      expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(
        (await d.getByRole("button", { name: "Đóng", exact: true }).boundingBox())!.width,
      ).toBeGreaterThanOrEqual(44);
      await check();
      await page.keyboard.press("Escape");
      await expect(d).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: route === "meetings" ? "Tạo biên bản họp" : "Tạo đề xuất",
          exact: true,
        }),
      ).toBeFocused();
      expect(s.errors).toEqual([]);
    });
  }
}

test("đề xuất: hợp đồng rỗng hợp lệ cho gửi; tiền và liên kết giữ DTO", async ({ page }) => {
  const s = await fixture(page);
  const bodies: unknown[] = [];
  await page.route("**/api/contracts", (r) => r.fulfill({ json: { contracts: [] } }));
  await page.route("**/api/proposals", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    bodies.push(r.request().postDataJSON());
    return r.fulfill({ status: 400, json: { error: "Giữ form để kiểm chứng" } });
  });
  await goto(page, "proposals");
  const d = await openForm(page, "proposals");
  await d.getByLabel("Tiêu đề", { exact: true }).fill("  Tạm ứng mẫu  ");
  await d.getByLabel("Giá trị (đ, tuỳ chọn)").fill("1250000");
  await d.getByLabel("Lý do", { exact: true }).fill("  Lý do giữ nguyên  ");
  await d.getByRole("button", { name: "Tạo đề xuất (nháp)" }).click();
  await expect(d.getByRole("alert")).toContainText("Giữ form để kiểm chứng");
  expect(bodies).toEqual([
    {
      kind: "advance",
      title: "Tạm ứng mẫu",
      amount: 1250000,
      contractId: null,
      materialId: null,
      reason: "Lý do giữ nguyên",
    },
  ]);
  expect(s.errors).toEqual([]);
});

test("họp: đổi trạng thái pending một lần và refresh lỗi khoá snapshot", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  const bodies: unknown[] = [];
  await page.route(`**/api/meetings/${meeting.id}/actions/${meeting.actions[0].id}`, async (r) => {
    bodies.push(r.request().postDataJSON());
    seen.release();
    await hold.promise;
    await r.fulfill({ json: { ok: true } }).catch(() => {});
  });
  try {
    await goto(page, "meetings");
    await page.getByRole("tab", { name: /Việc sau họp/ }).click();
    const done = page.getByRole("button", { name: "Đánh dấu xong", exact: true });
    await done.click();
    await seen.promise;
    await expect(done).toBeDisabled();
    await page.route("**/api/meetings", (r) =>
      r.fulfill({ status: 503, json: { error: "Danh sách sau đổi trạng thái lỗi" } }),
    );
    hold.release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Danh sách sau đổi trạng thái lỗi",
    );
    await expect(done).toBeDisabled();
    expect(bodies).toEqual([{ status: "done" }]);
    expect(s.counts.users).toBe(0);
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

for (const source of ["users", "contracts", "documents"] as const) {
  test(`${source}: hết phiên trong nguồn phụ về đăng nhập`, async ({ page }) => {
    await fixture(page);
    const url =
      source === "documents" ? `**/api/proposals/${proposal.id}/documents` : `**/api/${source}`;
    await page.route(url, (r) => r.fulfill({ status: 401, json: { error: "Hết phiên" } }));
    await goto(page, source === "users" ? "meetings" : "proposals");
    if (source === "users")
      await page.getByRole("button", { name: new RegExp(meeting.title) }).click();
    else if (source === "contracts") await openForm(page, "proposals");
    else await page.getByRole("button", { name: proposal.title, exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  });
}

test("đề xuất: huỷ xoá không ghi, xác nhận xoá chỉ refresh danh sách một lần", async ({ page }) => {
  const s = await fixture(page);
  let deletes = 0;
  await page.route(`**/api/proposals/${proposal.id}`, (r) => {
    if (r.request().method() !== "DELETE") return r.fallback();
    deletes++;
    return r.fulfill({ json: { ok: true } });
  });
  await goto(page, "proposals");
  await page.getByRole("button", { name: proposal.title, exact: true }).click();
  const d = page.getByRole("dialog");
  const remove = d.getByRole("button", { name: "Xoá", exact: true });
  await remove.click();
  await page
    .getByRole("dialog", { name: `Xoá đề xuất ${proposal.code}?`, exact: true })
    .getByRole("button", { name: "Huỷ", exact: true })
    .click();
  expect(deletes).toBe(0);
  expect(s.counts.proposals).toBe(1);
  await expect(remove).toBeFocused();
  await remove.click();
  await page
    .getByRole("dialog", { name: `Xoá đề xuất ${proposal.code}?`, exact: true })
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tải lại danh sách", exact: true })).toBeEnabled();
  expect(deletes).toBe(1);
  expect(s.counts.proposals).toBe(2);
  expect(s.errors).toEqual([]);
});
