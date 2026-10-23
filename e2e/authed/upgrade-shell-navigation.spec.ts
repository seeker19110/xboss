import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Route mocks phải đi qua handler, không nhận response từ service worker của ứng dụng.
test.use({ serviceWorkers: "block" });

async function openNavigation(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Mở menu", exact: true }).click();
  return page.locator(isMobile ? "#app-sidebar-mobile" : "#app-sidebar");
}

test("M136: tìm kiếm mobile từ trang hồ sơ, một dialog và shortcut trả focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/documents");
  const trigger = page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Tìm kiếm toàn cục", exact: true });
  const input = page.getByRole("combobox", { name: "Công việc, hồ sơ hoặc phân hệ" });
  await expect(dialog).toHaveCount(1);
  await expect(page.locator("#global-search")).toHaveCount(1);
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("font-size", "16px");
  await page.keyboard.press("Control+k");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Meta+k");
  await expect(dialog).toHaveCount(1);
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});

test("M136: trang tài khoản có tìm kiếm gọn dù search=false", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Công việc, hồ sơ hoặc phân hệ" })).toBeFocused();
  await expect(page.locator("#global-search")).toHaveCount(1);
});

test("M136: lỗi tìm kiếm có thử lại, giữ từ khoá và mở kết quả bằng Enter", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/search?*", async (route) => {
    requests++;
    await route.fulfill(
      requests === 1
        ? { status: 503, json: { error: "tạm lỗi" } }
        : {
            json: {
              hits: [
                {
                  kind: "document",
                  id: 136,
                  code: "HS136",
                  title: "Hồ sơ kiểm thử",
                  subtitle: "Tài liệu",
                  url: "/documents?source=upgrade-shell",
                },
              ],
            },
          },
    );
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tìm kiếm toàn cục", exact: true });
  const input = dialog.getByRole("combobox", { name: "Công việc, hồ sơ hoặc phân hệ" });
  await input.fill("HS136");
  await expect(dialog.getByRole("alert")).toContainText("Không tải được kết quả");
  await expect(input).toHaveValue("HS136");
  await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(dialog.getByRole("option", { name: /HS136/ })).toBeVisible();
  expect(requests).toBeGreaterThanOrEqual(2);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/documents\?source=upgrade-shell$/);
});

test("M136: Thường dùng và Tất cả phân hệ cùng tuân quyền, nav override và cờ tính năng", async ({
  page,
  isMobile,
}) => {
  // Chỉ giả vai trò ở response hiển thị: quyền API thật vẫn được kiểm bằng session backend.
  const mocked = { auth: 0, nav: 0, flags: 0 };
  await page.route("**/api/auth/me", async (route) => {
    mocked.auth++;
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, user: { ...data.user, role: "subcon" } } });
  });
  await page.route("**/api/nav-settings?*", (route) => {
    mocked.nav++;
    return route.fulfill({ json: { settings: { "dash.bao-cao": false } } });
  });
  await page.route("**/api/feature-flags?*", (route) => {
    mocked.flags++;
    return route.fulfill({ json: { flags: { field: false, tracking: false } } });
  });
  await page.goto("/documents");
  const nav = await openNavigation(page, isMobile);
  const frequent = nav.getByRole("group", { name: "Thường dùng", exact: true });
  await expect(frequent).toBeVisible();
  await expect(frequent.getByRole("link")).toHaveCount(6);
  await expect(nav.getByRole("link", { name: "Tài khoản", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Báo cáo", exact: true })).toHaveCount(0);
  await expect(
    nav.locator('a[href="/my-tasks"], a[href="/approvals"], a[href="/progress/acmv"]'),
  ).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Tất cả phân hệ", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  for (const count of Object.values(mocked)) expect(count).toBeGreaterThan(0);
});

test("M136: giữ gập/mở cụm cũ và lưu lựa chọn Tất cả phân hệ", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("xboss_nav_open"))
      localStorage.setItem(
        "xboss_nav_open",
        JSON.stringify({ "cluster:Thi công hiện trường": false }),
      );
  });
  await page.goto("/documents");
  let nav = await openNavigation(page, isMobile);
  const all = nav.getByRole("button", { name: "Tất cả phân hệ", exact: true });
  await expect(
    nav.getByRole("button", { name: "Thi công hiện trường", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await all.click();
  await expect(all).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  nav = await openNavigation(page, isMobile);
  await expect(nav.getByRole("button", { name: "Tất cả phân hệ", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await nav.getByRole("button", { name: "Tất cả phân hệ", exact: true }).click();
  await expect(
    nav.getByRole("button", { name: "Thi công hiện trường", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Hồ sơ dự án", exact: true })).toBeVisible();
});

test("M136: tìm kiếm có focus-trap và axe sạch ở theme tối/sáng", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/documents");
  await page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true }).click();
  await expect(page.getByRole("combobox")).toBeFocused();
  for (const light of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("light", value),
      light,
    );
    const results = await new AxeBuilder({ page })
      .include("#global-search-dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
    ).toEqual([]);
  }
  for (let index = 0; index < 16; index++) await page.keyboard.press("Tab");
  expect(
    await page
      .locator("#global-search-dialog")
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true);
});

test("M136: phím mũi tên giữ kết quả đang chọn trong vùng cuộn dài", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let searchCalls = 0;
  await page.route("**/api/search?*", (route) => {
    searchCalls++;
    return route.fulfill({
      json: {
        hits: Array.from({ length: 40 }, (_, index) => ({
          kind: "document",
          id: index,
          code: `DS136-${index}`,
          title: `Kết quả dòng ${index + 1}`,
          subtitle: "Tài liệu",
          url: `/documents?row=${index}`,
        })),
      },
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true }).click();
  const input = page.getByRole("combobox", { name: "Công việc, hồ sơ hoặc phân hệ" });
  await input.fill("DS136");
  await expect(page.getByRole("option")).toHaveCount(40);
  for (let index = 0; index < 28; index++) await input.press("ArrowDown");
  const selected = page.getByRole("option", { selected: true });
  await expect(selected).toContainText("DS136-28");
  await expect
    .poll(() =>
      selected.evaluate((element) => {
        const list = document.getElementById("global-search-results")!;
        const itemBox = element.getBoundingClientRect();
        const listBox = list.getBoundingClientRect();
        return (
          list.scrollTop > 0 &&
          itemBox.top >= listBox.top - 1 &&
          itemBox.bottom <= listBox.bottom + 1
        );
      }),
    )
    .toBe(true);
  await expect(input).toBeFocused();
  expect(searchCalls).toBeGreaterThan(0);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/documents\?row=28$/);
});

test("M136: kết quả hồ sơ API lọc capability tắt nhưng giữ nguồn khác", async ({ page }) => {
  const mocked = { flags: 0, search: 0 };
  await page.route("**/api/feature-flags?*", (route) => {
    mocked.flags++;
    return route.fulfill({
      json: { flags: { documents: false, materials: false, tracking: false, field: false } },
    });
  });
  const kinds = [
    "task",
    "package",
    "comment",
    "diary",
    "material",
    "document",
    "contract",
    "correspondence",
    "meeting",
    "ncr",
    "drawing",
  ];
  await page.route("**/api/search?*", (route) => {
    mocked.search++;
    return route.fulfill({
      json: {
        hits: kinds.map((kind, index) => ({
          kind,
          id: index,
          code: `CAP136-${kind}`,
          title: `Hồ sơ ${kind}`,
          name: `Công việc ${kind}`,
          subtitle: "Hồ sơ",
          url: "/documents",
          sheetSlug: "ogtd",
          sheetType: "OGTĐ",
          floorLabel: null,
          progress: 0.5,
        })),
      },
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true }).click();
  await page.getByRole("combobox", { name: "Công việc, hồ sơ hoặc phân hệ" }).fill("CAP136");
  await expect(page.getByRole("option")).toHaveCount(5);
  for (const kind of kinds.slice(0, 6))
    await expect(page.getByRole("option", { name: new RegExp(`CAP136-${kind}`) })).toHaveCount(0);
  for (const kind of kinds.slice(6))
    await expect(page.getByRole("option", { name: new RegExp(`CAP136-${kind}`) })).toBeVisible();
  for (const count of Object.values(mocked)) expect(count).toBeGreaterThan(0);
});

test("M136: ẩn nav hồ sơ vẫn tìm được tài liệu khi module bật", async ({ page, isMobile }) => {
  const mocked = { nav: 0, flags: 0, search: 0 };
  await page.route("**/api/nav-settings?*", (route) => {
    mocked.nav++;
    return route.fulfill({ json: { settings: { "dash.ho-so-du-an": false } } });
  });
  await page.route("**/api/feature-flags?*", (route) => {
    mocked.flags++;
    return route.fulfill({ json: { flags: { documents: true } } });
  });
  await page.route("**/api/search?*", (route) => {
    mocked.search++;
    return route.fulfill({
      json: {
        hits: [
          {
            kind: "document",
            id: 136,
            code: "HSD136",
            title: "Tài liệu vẫn được xem",
            subtitle: "Tài liệu",
            url: "/documents",
          },
        ],
      },
    });
  });
  await page.goto("/documents");
  const nav = await openNavigation(page, isMobile);
  await expect(
    nav.getByRole("group", { name: "Thường dùng", exact: true }).getByRole("link"),
  ).toHaveCount(6);
  await expect(nav.locator('a[href="/documents"]')).toHaveCount(0);
  if (isMobile) await page.getByRole("button", { name: "Đóng menu", exact: true }).click();
  await page.getByRole("button", { name: "Mở tìm kiếm toàn cục", exact: true }).click();
  await page.getByRole("combobox", { name: "Công việc, hồ sơ hoặc phân hệ" }).fill("HSD136");
  await expect(page.getByRole("option", { name: /HSD136/ })).toBeVisible();
  for (const count of Object.values(mocked)) expect(count).toBeGreaterThan(0);
});
