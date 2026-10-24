import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });
const person = {
  id: 960001,
  code: "NS-R4",
  fullName: "Nhân sự kiểm chứng vòng bốn",
  roleTitle: "Kỹ sư",
  supplierId: 77,
  supplierName: "NTP kiểm chứng",
  phone: null,
  idNumber: null,
  status: "active",
  crewNames: "Tổ A",
};
const crews = [
  { id: 31, name: "Tổ A" },
  { id: 32, name: "Tổ B" },
];
const suppliers = [{ id: 77, name: "NTP kiểm chứng" }];
const systems = [{ id: 91, code: "SYS", name: "Hệ kiểm chứng" }];
async function fixture(page: Page, role?: string) {
  const counts = { crews: 0, suppliers: 0, systems: 0, personnel: 0 };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", (r) =>
    ["GET", "HEAD", "OPTIONS"].includes(r.request().method())
      ? r.continue()
      : r.fulfill({ status: 403, json: { error: "Không ghi ngoài fixture" } }),
  );
  if (role)
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: { user: { id: 1, name: "Kiểm chứng", email: "fixture@example.invalid", role } },
      }),
    );
  await page.route(/\/api\/personnel(?:\?.*)?$/, (r) => {
    counts.personnel++;
    return r.fulfill({ json: { personnel: [person] } });
  });
  await page.route("**/api/crews", (r) => {
    counts.crews++;
    return r.fulfill({ json: { crews } });
  });
  await page.route("**/api/suppliers", (r) => {
    counts.suppliers++;
    return r.fulfill({ json: { suppliers } });
  });
  await page.route("**/api/systems", (r) => {
    counts.systems++;
    return r.fulfill({ json: { systems } });
  });
  await page.route("**/api/contracts", (r) => r.fulfill({ json: { contracts: [] } }));
  await page.route("**/api/certifications?personnelId=960001", (r) =>
    r.fulfill({ json: { certifications: [] } }),
  );
  return { counts, errors };
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}

test("nhân sự: primary không chờ danh mục phụ đang giữ", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  await page.route("**/api/suppliers", async (r) => {
    await hold.promise;
    await r.fulfill({ json: { suppliers } });
  });
  try {
    await page.goto("/personnel");
    await expect(page.getByText(person.fullName, { exact: true })).toBeVisible({ timeout: 2500 });
  } finally {
    hold.release();
  }
  expect(s.errors).toEqual([]);
});

test("nhân sự: đổi filter không áp response cũ, không tải lại nguồn phụ", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  const seen = latch();
  const finished = latch();
  const finishOld = (request: Request) => {
    if (
      new URL(request.url()).pathname === "/api/personnel" &&
      new URL(request.url()).searchParams.get("crewId") === "31"
    )
      finished.release();
  };
  page.on("requestfinished", finishOld);
  page.on("requestfailed", finishOld);
  await page.goto("/personnel");
  await expect(page.getByText(person.fullName, { exact: true })).toBeVisible();
  await page.route("**/api/personnel?crewId=31", async (r) => {
    seen.release();
    await hold.promise;
    await r
      .fulfill({ json: { personnel: [{ ...person, fullName: "Kết quả cũ tổ A" }] } })
      .catch(() => {});
  });
  await page.route("**/api/personnel?crewId=32", (r) =>
    r.fulfill({ json: { personnel: [{ ...person, fullName: "Kết quả mới tổ B" }] } }),
  );
  try {
    await page.getByLabel("Lọc theo tổ đội").selectOption("31");
    await seen.promise;
    await page.getByLabel("Lọc theo tổ đội").selectOption("32");
    await expect(page.getByText("Kết quả mới tổ B", { exact: true })).toBeVisible();
    hold.release();
    await finished.promise;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText("Kết quả mới tổ B", { exact: true })).toBeVisible();
    await expect(page.getByText("Kết quả cũ tổ A", { exact: true })).toHaveCount(0);
    expect(s.counts.crews).toBe(1);
    expect(s.counts.suppliers).toBe(1);
    expect(s.errors).toEqual([]);
  } finally {
    hold.release();
  }
});

test("nhân sự: lỗi refresh giữ danh sách, retry chỉ GET nhân sự", async ({ page }) => {
  const s = await fixture(page);
  await page.goto("/personnel");
  await expect(page.getByText(person.fullName, { exact: true })).toBeVisible();
  let fail = true;
  let gets = 0;
  await page.route("**/api/personnel?crewId=31", (r) => {
    gets++;
    return r.fulfill(
      fail
        ? { status: 500, json: { error: "Chưa tải được nhân sự kiểm chứng" } }
        : { json: { personnel: [person] } },
    );
  });
  await page.getByLabel("Lọc theo tổ đội").selectOption("31");
  await expect(
    page.getByRole("alert").filter({ hasText: "Chưa tải được nhân sự kiểm chứng" }),
  ).toBeVisible();
  await expect(page.getByText(person.fullName, { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: /Thử lại/ }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Chưa tải được nhân sự kiểm chứng" }),
  ).toHaveCount(0);
  expect(gets).toBe(2);
  expect(s.counts.crews).toBe(1);
  expect(s.counts.suppliers).toBe(1);
  expect(s.errors).toEqual([]);
});

test("nhân sự: lỗi danh mục có retry riêng và không cản primary", async ({ page }) => {
  const s = await fixture(page);
  let fail = true;
  await page.route("**/api/crews", (r) => {
    s.counts.crews++;
    return fail ? r.abort("failed") : r.fulfill({ json: { crews } });
  });
  await page.goto("/personnel");
  await expect(page.getByText(person.fullName, { exact: true })).toBeVisible();
  const alert = page.getByRole("alert").filter({ hasText: /tổ đội/i });
  await expect(alert).toBeVisible();
  fail = false;
  await alert.getByRole("button", { name: /Thử lại/ }).click();
  await expect(
    page.getByLabel("Lọc theo tổ đội").getByRole("option", { name: "Tổ A" }),
  ).toHaveCount(1);
  expect(s.counts.personnel).toBe(1);
  expect(s.counts.suppliers).toBe(1);
  expect(s.errors).toEqual([]);
});

test("nhân sự: viewer mở chi tiết bằng bàn phím, không hiện thao tác quản lý", async ({ page }) => {
  await fixture(page, "viewer");
  await page.goto("/personnel");
  const name = page.getByRole("button", { name: person.fullName, exact: true });
  await name.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: person.fullName, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm chứng chỉ", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(name).toBeFocused();
  await expect(page.getByRole("button", { name: "Thêm nhân sự", exact: true })).toHaveCount(0);
});

test("nhân sự: primary 401 về đăng nhập", async ({ page }) => {
  await fixture(page);
  await page.route(/\/api\/personnel(?:\?.*)?$/, (r) =>
    r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.goto("/personnel");
  await expect(page).toHaveURL(/\/login/);
});

test("hợp đồng: chỉ đọc không tải option form; mở lại dùng cache", async ({ page }) => {
  const s = await fixture(page);
  await page.goto("/contracts");
  await expect(page.getByRole("button", { name: "Thêm hợp đồng", exact: true })).toBeVisible();
  expect(s.counts.suppliers).toBe(0);
  expect(s.counts.systems).toBe(0);
  await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
  await expect(
    page.getByLabel("Đối tác (NCC/thầu phụ)").getByRole("option", { name: suppliers[0].name }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("combobox", { name: "Hệ", exact: true })
      .getByRole("option", { name: /Hệ kiểm chứng/ }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
  await expect(page.getByLabel("Số hợp đồng")).toBeVisible();
  expect(s.counts.suppliers).toBe(1);
  expect(s.counts.systems).toBe(1);
  expect(s.errors).toEqual([]);
  await test.info().attach("options-request-counts", {
    body: JSON.stringify(s.counts),
    contentType: "application/json",
  });
});

test("hợp đồng: lỗi option không mở form thiếu; retry nguồn lỗi, đóng được", async ({ page }) => {
  const s = await fixture(page);
  let fail = true;
  await page.route("**/api/systems", (r) => {
    s.counts.systems++;
    return r.fulfill(
      fail
        ? { status: 500, json: { error: "Chưa tải được hệ kiểm chứng" } }
        : { json: { systems } },
    );
  });
  await page.goto("/contracts");
  await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Chưa tải được hệ kiểm chứng" });
  await expect(alert).toContainText("Chưa tải được hệ kiểm chứng");
  await expect(page.getByLabel("Số hợp đồng")).toHaveCount(0);
  fail = false;
  await alert.getByRole("button", { name: /Thử lại/ }).click();
  await expect(page.getByLabel("Số hợp đồng")).toBeVisible();
  expect(s.counts.suppliers).toBe(1);
  expect(s.counts.systems).toBe(2);
  expect(s.errors).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thêm hợp đồng", exact: true })).toBeFocused();
});

test("hợp đồng: giữ header và payload form hiện hữu", async ({ page }) => {
  const s = await fixture(page);
  let payload: unknown;
  let header: string | undefined;
  await page.route("**/api/contracts", (r) => {
    if (r.request().method() === "POST") {
      payload = r.request().postDataJSON();
      return r.fulfill({ status: 422, json: { error: "Không ghi hợp đồng fixture" } });
    }
    header = r.request().headers()["x-xboss-money-format"];
    return r.fulfill({ json: { contracts: [] } });
  });
  await page.goto("/contracts");
  await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
  await page.getByLabel("Số hợp đồng").fill("HD-R4");
  await page.getByLabel("Tên hợp đồng").fill("Hợp đồng kiểm chứng");
  await page.getByLabel("Đối tác (NCC/thầu phụ)").selectOption("77");
  await page.getByRole("combobox", { name: "Hệ", exact: true }).selectOption("91");
  await page.getByRole("button", { name: /Tạo hợp đồng/ }).click();
  await expect
    .poll(() => payload)
    .toEqual({
      code: "HD-R4",
      kind: "ncc",
      title: "Hợp đồng kiểm chứng",
      partySupplierId: 77,
      partyName: null,
      systemId: 91,
      value: 0,
      advancePct: 0,
      retentionPct: 0,
      validFrom: null,
      validTo: null,
      status: "active",
    });
  expect(header).toBe("decimal-string-v1");
  expect(s.errors).toEqual([]);
});

for (const theme of ["light", "darkblue"])
  test(`nhân sự: axe và bố cục 360px ${theme}`, async ({ page }) => {
    const s = await fixture(page);
    await page.addInitScript((t) => localStorage.setItem("xboss_theme", t), theme);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/personnel");
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(page.getByRole("button", { name: person.fullName, exact: true })).toBeVisible();
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(violations, JSON.stringify(violations)).toEqual([]);
    expect(await page.locator("body").evaluate((e) => e.scrollWidth)).toBe(360);
    await expect(page.getByLabel("Lọc theo tổ đội")).toHaveCSS("font-size", "16px");
    expect(s.errors).toEqual([]);
  });

test("nhân sự: loading không thành empty, empty đúng ngữ cảnh lọc", async ({ page }) => {
  await fixture(page, "viewer");
  const hold = latch();
  await page.route(/\/api\/personnel(?:\?.*)?$/, async (r) => {
    await hold.promise;
    await r.fulfill({ json: { personnel: [] } });
  });
  try {
    await page.goto("/personnel");
    await expect(
      page.getByRole("status").filter({ hasText: "Đang tải danh sách nhân sự" }),
    ).toBeVisible();
    await expect(page.getByText("Chưa có nhân sự", { exact: true })).toHaveCount(0);
    hold.release();
    await expect(
      page.getByText("Chưa có nhân sự được ghi nhận trong dự án.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Lọc theo tổ đội").selectOption("31");
    await expect(page.getByText("Không có nhân sự phù hợp", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bấm “Thêm nhân sự”/)).toHaveCount(0);
  } finally {
    hold.release();
  }
});

test("nhân sự: snapshot cũ chỉ xem khi filter đang tải", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  await page.goto("/personnel");
  await expect(page.getByRole("button", { name: person.fullName, exact: true })).toBeVisible();
  await page.route("**/api/personnel?crewId=31", async (r) => {
    await hold.promise;
    await r.fulfill({ json: { personnel: [person] } });
  });
  try {
    await page.getByLabel("Lọc theo tổ đội").selectOption("31");
    await expect(page.getByRole("button", { name: person.fullName, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sửa nhân sự", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Xoá nhân sự", exact: true })).toBeDisabled();
    hold.release();
    await expect(page.getByRole("button", { name: person.fullName, exact: true })).toBeEnabled();
    expect(s.errors).toEqual([]);
  } finally {
    hold.release();
  }
});

test("hợp đồng: đóng khi option pending, mở lại an toàn", async ({ page }) => {
  const s = await fixture(page);
  const hold = latch();
  await page.route("**/api/systems", async (r) => {
    s.counts.systems++;
    await hold.promise;
    await r.fulfill({ json: { systems } }).catch(() => {});
  });
  try {
    await page.goto("/contracts");
    await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đang tải danh mục tạo hợp đồng" }),
    ).toBeVisible();
    await expect(page.getByLabel("Số hợp đồng")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Thêm hợp đồng", exact: true })).toBeFocused();
    hold.release();
    await expect(page.getByLabel("Số hợp đồng")).toHaveCount(0);
    await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
    await expect(
      page
        .getByRole("combobox", { name: "Hệ", exact: true })
        .getByRole("option", { name: "Hệ kiểm chứng", exact: true }),
    ).toHaveCount(1);
    expect(s.errors).toEqual([]);
  } finally {
    hold.release();
  }
});

test("hợp đồng: viewer không tải option quản lý", async ({ page }) => {
  const s = await fixture(page, "viewer");
  await page.goto("/contracts");
  await expect(page.getByText("Chưa có hợp đồng nào", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm hợp đồng", exact: true })).toHaveCount(0);
  expect(s.counts.suppliers).toBe(0);
  expect(s.counts.systems).toBe(0);
  expect(s.errors).toEqual([]);
});

for (const theme of ["light", "darkblue"])
  test(`hợp đồng: option lỗi axe360 ${theme}`, async ({ page }) => {
    await fixture(page);
    await page.addInitScript((t) => localStorage.setItem("xboss_theme", t), theme);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.route("**/api/systems", (r) =>
      r.fulfill({ status: 500, json: { error: "Chưa tải được hệ kiểm chứng" } }),
    );
    await page.goto("/contracts");
    await page.getByRole("button", { name: "Thêm hợp đồng", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Chưa tải được hệ kiểm chứng" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    const serious = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, JSON.stringify(serious)).toEqual([]);
    expect(await page.locator("body").evaluate((e) => e.scrollWidth)).toBe(360);
    await page.screenshot({
      path: `.autopilot/round4-contract-${test.info().project.name}-${theme}.png`,
    });
  });

test("nhân sự: họ tên dài nằm trong nút, không đè cột bên cạnh", async ({ page }) => {
  await fixture(page);
  const name = "Nhân sự kiểm chứng có họ tên dài cần xem đầy đủ";
  await page.route(/\/api\/personnel(?:\?.*)?$/, (r) =>
    r.fulfill({ json: { personnel: [{ ...person, fullName: name }] } }),
  );
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/personnel");
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  const bounds = await button.evaluate((e) => ({
    button: e.getBoundingClientRect().toJSON(),
    text: e.querySelector("span")!.getBoundingClientRect().toJSON(),
  }));
  expect(bounds.text.right).toBeLessThanOrEqual(bounds.button.right + 1);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});
