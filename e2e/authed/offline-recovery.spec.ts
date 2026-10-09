import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// QUALITY-FINAL-1 S08 — browser acceptance hàng đợi ngoại tuyến (A2 §5, AUDIT-S08):
//  (a) tick khi mất mạng → "lưu trên thiết bị" → có mạng → gửi xong (badge về 0);
//  (b) A đăng xuất, B đăng nhập cùng trình duyệt → B không thấy/không gửi op của A, ciphertext
//      của A vẫn nằm trên thiết bị (D03, A2-AC01);
//  (c) màn phục hồi: focus tiêu đề khi mở, vùng aria-live, Esc trả focus, axe không serious/
//      critical ở cả 2 theme (desktop + mobile qua 2 project authed-*).
// Cần server có XBOSS_OFFLINE_KEK (playwright.config.ts chuyển E2E_OFFLINE_KEK vào webServer).
// Safari/iOS thật: NOT_RUN (Playwright CI chỉ có Chromium) — xem AUDIT-S08 §Bằng chứng.
// Không dùng storageState admin chung: spec tự đăng nhập tài khoản demo (đăng xuất ở đây không
// làm hỏng phiên dùng chung của các spec khác).
test.use({ storageState: { cookies: [], origins: [] } });
// Mỗi test đăng nhập + chờ vault mở (có thể 2 lần) — rộng hơn mặc định 30s.
test.describe.configure({ timeout: 120_000 });

const PM = { email: "pm@xboss.vn", pw: "pm123" };
const KY_SU = { email: "engineer@xboss.vn", pw: "eng123" };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BADGE = /mở màn thao tác ngoại tuyến/;

/** 2 project chạy song song: mỗi project dùng tài khoản + ô riêng để không giẫm lên nhau. */
function phanVai(projectName: string) {
  const mobile = projectName.includes("mobile");
  return { A: mobile ? KY_SU : PM, B: mobile ? PM : KY_SU, lech: mobile ? 1 : 0 };
}

async function dangNhap(page: Page, u: { email: string; pw: string }) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(u.email);
  await page.locator('input[type="password"]').fill(u.pw);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
}

const laPost = (duong: string) => (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === duong && r.request().method() === "POST";

/**
 * Mở lưới tracking, CHỜ vault offline mở xong (unlock + xin khoá manifest khi cần) trong lúc còn
 * mạng, bung nhóm đầu (đăng ký ô → task) và bật chế độ sửa. Trả locator các ô tick.
 */
async function moLuoiSanSang(page: Page) {
  const unlock = page.waitForResponse(laPost("/api/offline/vault/unlock"), { timeout: 30_000 });
  const khoa = page
    .waitForResponse(laPost("/api/offline/vault/keys"), { timeout: 30_000 })
    .catch(() => null);
  await page.goto("/tracking/ogtd");
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 20_000 });
  expect((await unlock).status()).toBe(200);
  // Lần đầu của tài khoản/thiết bị: xin khoá cho manifest task; đã có khoá thì không gọi.
  await Promise.race([khoa, page.waitForTimeout(8_000)]);
  await page.getByText("Ống gió trục đứng tầng 1F").click();
  await expect(page.getByRole("columnheader", { name: "Công việc" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
  return page.locator('td label input[type="checkbox"]');
}

/** Số bản ghi hàng đợi v2 (ciphertext) trên thiết bị — chỉ đếm, không đọc nội dung. */
function demOpThietBi(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("xboss-offline");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("ops2")) {
            db.close();
            resolve(0);
            return;
          }
          const c = db.transaction("ops2", "readonly").objectStore("ops2").count();
          c.onsuccess = () => {
            db.close();
            resolve(c.result);
          };
          c.onerror = () => reject(c.error);
        };
      }),
  );
}

/** Giữ op trên thiết bị khi CÒN mạng: mọi PATCH ô bị cắt như lỗi mạng (op → chờ gửi lại). */
async function catGuiO(context: BrowserContext) {
  await context.route("**/api/dimensions/**", (route) =>
    route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue(),
  );
}

test("(a) tick khi mất mạng → lưu trên thiết bị; có mạng → tự gửi xong, badge về 0", async ({
  page,
  context,
}, info) => {
  const { A, lech } = phanVai(info.project.name);
  await dangNhap(page, A);
  const o = await moLuoiSanSang(page);
  const badge = page.getByRole("button", { name: BADGE });
  await expect(badge).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByText("Thao tác chưa được lưu offline")).toHaveCount(0);
  await o.nth(lech).click();
  await expect(page.getByText(/Mất mạng — thao tác được lưu trên thiết bị/)).toBeVisible();
  await expect(page.getByText(/\(1 chờ gửi\), chưa lên máy chủ/)).toBeVisible();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAccessibleName(/lưu trên thiết bị, chưa lên máy chủ/);
  expect(await demOpThietBi(page)).toBe(1);

  const gui = page.waitForResponse(
    (r) => /\/api\/dimensions\/\d+$/.test(new URL(r.url()).pathname) && r.status() === 200,
    { timeout: 30_000 },
  );
  await context.setOffline(false);
  const res = await gui;
  expect(res.request().headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  await expect(badge).toHaveCount(0, { timeout: 30_000 });
  expect(await demOpThietBi(page)).toBe(0);
});

test("(b) A đăng xuất, B đăng nhập cùng trình duyệt → B không thấy/không gửi op của A (A2-AC01)", async ({
  page,
  context,
}, info) => {
  const { A, B, lech } = phanVai(info.project.name);
  await dangNhap(page, A);
  const o = await moLuoiSanSang(page);
  await catGuiO(context);
  await o.nth(4 + lech).click();
  await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toBeVisible({
    timeout: 15_000,
  });
  expect(await demOpThietBi(page)).toBe(1);

  await page.goto("/account");
  // Lớp khoá "Đã đăng xuất trên thiết bị này" chỉ hiện trong lúc chờ SW ACK dọn cache (thường
  // rất ngắn) — nội dung của nó kiểm ở tests/service-worker-cache-ack.test.ts, ở đây chỉ chờ về
  // /login.
  await page
    .getByRole("button", { name: /Đăng xuất/ })
    .first()
    .click();
  await page.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });

  const guiO: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/dimensions\//.test(r.url()) && r.method() !== "GET") guiO.push(r.url());
  });
  await dangNhap(page, B);
  await moLuoiSanSang(page);
  await expect(page.getByRole("button", { name: BADGE })).toHaveCount(0);
  await expect(page.getByText(/lưu trên thiết bị/)).toHaveCount(0);
  // Ciphertext của A vẫn còn trên thiết bị (chờ chính chủ phục hồi) nhưng B không gửi.
  expect(await demOpThietBi(page)).toBe(1);
  expect(guiO).toEqual([]);
});

test("(c) màn phục hồi: focus tiêu đề, aria-live, Esc trả focus, axe sạch ở 2 theme", async ({
  page,
  context,
}, info) => {
  const { A, lech } = phanVai(info.project.name);
  await dangNhap(page, A);
  const o = await moLuoiSanSang(page);
  await catGuiO(context);
  await o.nth(2 + lech).click();
  const badge = page.getByRole("button", { name: BADGE });
  await expect(badge).toBeVisible({ timeout: 15_000 });

  await badge.click();
  const hop = page.getByRole("dialog", { name: "Thao tác ngoại tuyến" });
  await expect(hop).toBeVisible();
  await expect(hop.getByRole("heading", { name: "Thao tác ngoại tuyến" })).toBeFocused();
  const vung = hop.locator('[role="status"][aria-live="polite"]');
  await expect(vung).toContainText("lưu trên thiết bị, chưa lên máy chủ");
  await expect(hop.getByRole("heading", { name: /Chờ gửi lại|Chờ gửi/ })).toBeVisible();

  // Modal phải thoát khỏi header sticky `backdrop-blur` (portal vào body): overlay phủ cả màn,
  // hộp thoại đủ cao, nằm trọn trong viewport và nút hành động bấm được (không bị bottombar che).
  const vp = page.viewportSize()!;
  const phu = await hop.evaluate((el) => el.parentElement!.getBoundingClientRect().height);
  expect(phu).toBeGreaterThanOrEqual(vp.height - 1);
  const hopBox = (await hop.boundingBox())!;
  // Mobile: hộp thoại kẹt trong header chỉ cao bằng header (~1/10 màn) — phải chiếm hơn nửa màn.
  if (info.project.name.includes("mobile")) expect(hopBox.height).toBeGreaterThan(vp.height * 0.5);
  expect(hopBox.y).toBeGreaterThanOrEqual(0);
  expect(hopBox.y + hopBox.height).toBeLessThanOrEqual(vp.height + 1);
  for (const ten of ["Gửi lại ngay", "Đóng"]) {
    const nut = hop.getByRole("button", { name: ten });
    const trungNut = await nut.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const o = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!o && el.contains(o);
    });
    expect(trungNut, `nút "${ten}" không bị phần tử khác che`).toBe(true);
  }

  for (const theme of ["light", "darkblue"]) {
    await page.evaluate((t) => {
      document.documentElement.classList.remove("light", "darkblue");
      document.documentElement.classList.add(t);
    }, theme);
    const kq = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(AXE_TAGS)
      .analyze();
    const nghiemTrong = kq.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(nghiemTrong, `${theme}: ${JSON.stringify(nghiemTrong, null, 2)}`).toEqual([]);
  }

  await page.keyboard.press("Escape");
  await expect(hop).toHaveCount(0);
  await expect(badge).toBeFocused();
});

test("(d) SW allowlist (A2-AC09): mất mạng chỉ đọc lại lưới tracking của phiên vault; tài chính/khác luôn lỗi mạng", async ({
  page,
  context,
}, info) => {
  const { A } = phanVai(info.project.name);
  await dangNhap(page, A);
  // SW phải điều khiển trang để nhận ngữ cảnh vault (lần đầu: chờ cài + claim).
  await page.goto("/tracking/ogtd");
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {
    timeout: 30_000,
  });
  const luoi = page.waitForResponse(
    (r) => /\/api\/workpackages\/\d+\/dimensions$/.test(new URL(r.url()).pathname),
    { timeout: 30_000 },
  );
  await moLuoiSanSang(page);
  const duongLuoi = new URL((await luoi).url()).pathname;

  // Đọc lại khi CÒN mạng (vault đã ACTIVE, SW có ngữ cảnh của tab) → bản đọc được lưu.
  await page.evaluate(async (u) => {
    await fetch(u);
  }, duongLuoi);

  await context.setOffline(true);
  const doc = (u: string) =>
    page.evaluate(async (url) => {
      try {
        const r = await fetch(url);
        return { status: r.status, cache: r.headers.get("X-XBoss-Offline-Cache") };
      } catch {
        return { status: 0, cache: null };
      }
    }, u);
  expect(await doc(duongLuoi)).toEqual({ status: 200, cache: "1" });
  for (const u of [
    "/api/costs",
    "/api/payment-certs",
    "/api/contracts",
    "/api/auth/me",
    "/api/users",
  ])
    expect(await doc(u), u).toEqual({ status: 0, cache: null });
  await context.setOffline(false);
});
