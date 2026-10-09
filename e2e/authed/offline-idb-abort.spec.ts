import { test, expect, type Page } from "@playwright/test";
import { dangNhapCoLap, dungToChucCoLap } from "../helpers/co-lap";

// QUALITY-FINAL-1 S15 — A2-AC05 (lớp B, IDB THẬT của Chromium): khi giao dịch IndexedDB của hàng
// đợi offline bị HUỶ sau khi request đã "thành công" (mô phỏng quota/lỗi đĩa: onabort), UI KHÔNG
// được báo "đã lưu trên thiết bị", form/ô giữ nguyên và hiện OFFLINE_SAVE_ERROR.
// Các test unit (tests/audit-offline-store-commit.test.ts, offline-queue-vault.test.ts) chỉ dùng
// IDB giả; ở đây chặn `IDBObjectStore.prototype.put` của store `ops2` (bản ghi op hàng đợi) để
// transaction thật abort — không đụng server (PATCH ô bị cắt như mất mạng; nhật ký chỉ lưu
// offline). Có ca đối chứng bỏ cờ abort → cùng thao tác lưu được, chứng minh lỗi chỉ do abort.
// Không dùng storageState admin chung: tự đăng nhập tài khoản demo (bám offline-recovery.spec.ts).
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

const PM = { email: "pm@xboss.vn", pw: "pm123" };
const KY_SU = { email: "engineer@xboss.vn", pw: "eng123" };
// Khớp app/components/offlineQueue/index.ts (OFFLINE_SAVE_ERROR).
const OFFLINE_SAVE_ERROR = "Chưa lưu được trên thiết bị. Hãy kết nối mạng rồi thử lại.";
const BADGE = /mở màn thao tác ngoại tuyến/;

async function dangNhap(page: Page, u: { email: string; pw: string }) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(u.email);
  await page.locator('input[type="password"]').fill(u.pw);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
}

/** Cài trước mọi script trang: `put` vào store `ops2` làm transaction abort khi cờ bật. */
async function caiBayAbort(page: Page) {
  await page.addInitScript(() => {
    const goc = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: [unknown, IDBValidKey?]) {
      const r = goc.apply(this, a);
      if ((window as unknown as { __epHuyOps2?: boolean }).__epHuyOps2 && this.name === "ops2") {
        try {
          this.transaction.abort();
        } catch {
          /* giao dịch đã kết thúc */
        }
      }
      return r;
    };
  });
}

const batAbort = (page: Page, bat: boolean) =>
  page.evaluate((b) => {
    (window as unknown as { __epHuyOps2?: boolean }).__epHuyOps2 = b;
  }, bat);

/** Số bản ghi hàng đợi v2 trên thiết bị (chỉ đếm). */
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

const laPost = (duong: string) => (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === duong && r.request().method() === "POST";

/** Mở lưới tracking, chờ vault mở, bung nhóm đầu, bật chế độ sửa (bám offline-recovery.spec.ts). */
async function moLuoiSanSang(page: Page) {
  const unlock = page.waitForResponse(laPost("/api/offline/vault/unlock"), { timeout: 30_000 });
  const khoa = page
    .waitForResponse(laPost("/api/offline/vault/keys"), { timeout: 30_000 })
    .catch(() => null);
  await page.goto("/tracking/ogtd");
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 20_000 });
  expect((await unlock).status()).toBe(200);
  await Promise.race([khoa, page.waitForTimeout(8_000)]);
  await page.getByText("Ống gió trục đứng tầng 1F").click();
  await expect(page.getByRole("columnheader", { name: "Công việc" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
  return page.locator('td label input[type="checkbox"]');
}

test("A2-AC05: tick — IDB abort (quota) → toast OFFLINE_SAVE_ERROR, ô trả về cũ, hàng đợi 0; bỏ abort → lưu được", async ({
  page,
  context,
}, info) => {
  const mobile = info.project.name.includes("mobile");
  await caiBayAbort(page);
  await dangNhap(page, mobile ? KY_SU : PM);
  const o = await moLuoiSanSang(page);
  // Mọi PATCH ô bị cắt như lỗi mạng → đường lưu offline; còn mạng nên SW/vault vẫn hoạt động.
  await context.route("**/api/dimensions/**", (route) =>
    route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue(),
  );
  const badge = page.getByRole("button", { name: BADGE });
  const o1 = o.nth(mobile ? 9 : 8);
  const truoc = await o1.isChecked();
  expect(await demOpThietBi(page)).toBe(0);

  await batAbort(page, true);
  await o1.click();
  await expect(page.getByText(OFFLINE_SAVE_ERROR)).toBeVisible({ timeout: 15_000 });
  // KHÔNG báo đã lưu: không toast thành công, không huy hiệu hàng đợi, IDB thật không có op nào.
  await expect(page.getByText(/thao tác được lưu trên thiết bị/)).toHaveCount(0);
  await expect(page.getByText(/chờ gửi\), chưa lên máy chủ/)).toHaveCount(0);
  await expect(badge).toHaveCount(0);
  expect(await demOpThietBi(page)).toBe(0);
  // Ô trả về trạng thái cũ (không hiển thị như đã tick).
  await expect(o1).toBeChecked({ checked: truoc });

  // Đối chứng: bỏ abort, cùng thao tác → lưu thật trên thiết bị.
  await batAbort(page, false);
  await o1.click();
  await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(badge).toBeVisible();
  expect(await demOpThietBi(page)).toBe(1);
});

test("A2-AC05: nhật ký — IDB abort → form giữ nội dung, toast OFFLINE_SAVE_ERROR, không báo đã lưu", async ({
  page,
  context,
}) => {
  await caiBayAbort(page);
  // Người dùng cô lập (tổ chức riêng): đăng ký thiết bị offline bị giới hạn 10 lần/15 phút/người,
  // không tiêu hao hạn mức của tài khoản demo mà offline-recovery.spec.ts đang dùng.
  const co = await dungToChucCoLap(["pm"]);
  await dangNhapCoLap(page, co.nguoi.pm.email);
  await page.goto("/diary");
  await expect(page.getByText("Nhật ký thi công", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  const ngay = new Date().getDate();
  await page
    .getByRole("button", { name: String(ngay), exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /Nhật ký ngày/ })).toBeVisible();
  // Editor chờ vault offline mở xong rồi mới nạp form ("Thêm dòng" chỉ render sau đó).
  await expect(page.getByRole("button", { name: "Thêm dòng" })).toBeVisible({ timeout: 30_000 });

  const vuong = page
    .locator("div")
    .filter({ has: page.locator(':scope > label:text-is("Vướng mắc / chỉ đạo")') })
    .locator("textarea")
    .last();
  const noiDung = "Vướng mặt bằng tầng 3 — IDB abort e2e";
  await vuong.fill(noiDung);

  await batAbort(page, true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Lưu nháp" }).click();

  await expect(page.getByText(OFFLINE_SAVE_ERROR)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Đã lưu trên thiết bị/)).toHaveCount(0);
  // Form còn mở, nội dung người dùng nhập còn nguyên, nút lưu dùng lại được.
  await expect(page.getByRole("heading", { name: /Nhật ký ngày/ })).toBeVisible();
  await expect(vuong).toHaveValue(noiDung);
  await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeEnabled();
  await context.setOffline(false);
  expect(await demOpThietBi(page)).toBe(0);
});
