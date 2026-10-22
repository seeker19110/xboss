import { Pool } from "pg";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_DB } from "../constants";
import { dangNhapCoLap, dungToChucCoLap, type ToChucCoLap } from "../helpers/co-lap";

// QUALITY-FINAL-1 — A2-AC10 lớp B (Chromium thật, IndexedDB/Service Worker/HTTP/DB thật, không mock
// auth/API/DB): nhật ký soạn offline với precondition cố định lúc xếp hàng không được ghi đè bản
// người khác vừa lưu, và gửi lại sau mất ACK không thành 412 giả.
//   1. If-Match cũ: PM soạn offline trên bản v1, kỹ sư lưu v2 → gửi lại nhận 412, op `conflict`,
//      máy chủ giữ v2; người dùng XEM bản máy chủ rồi chọn giữ bản thiết bị → op mới If-Match v2.
//   2. Tạo-nếu-chưa-có: PM soạn offline khi ngày chưa có nhật ký (If-None-Match: *), kỹ sư tạo trước
//      → 412 không đè; chọn "Dùng bản máy chủ" bỏ bản thiết bị, máy chủ nguyên vẹn.
//   3. Mất ACK: lần gửi đầu đã COMMIT nhưng response bị cắt; gửi lại cùng Idempotency-Key với
//      If-Match nay đã cũ → server trả receipt (200), không 412, không ghi lần hai.
// Phần ảnh mồ côi/đối soát của A2-AC10 có P/H riêng (S06), không thuộc lát này. M (Safari/iOS thật)
// vẫn NOT_RUN — Chromium không phải bằng chứng cho Safari.
//
// Mỗi ca dựng tổ chức + dự án cô lập (PM = thiết bị soạn offline, kỹ sư = người khác lưu online)
// nên desktop/mobile chạy song song không giẫm ngày nhật ký của nhau.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 150_000 });

const DB_NAME = "xboss-offline";
const BADGE = /mở màn thao tác ngoại tuyến/;
const NGAY_TRONG_THANG = 10;

type NhatKyDb = { id: number; work_done: string | null; version: number; created_by: number };

async function truyVan<T = Record<string, unknown>>(sql: string, args: unknown[]): Promise<T[]> {
  if (!E2E_DB) throw new Error("Thiếu E2E_DATABASE_URL");
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  try {
    return (await pool.query(sql, args)).rows as T[];
  } finally {
    await pool.end();
  }
}

async function nhatKyDb(co: ToChucCoLap, ngay: string): Promise<NhatKyDb | null> {
  const r = await truyVan<NhatKyDb>(
    `SELECT id, work_done, version, created_by FROM site_diaries
      WHERE project_id = $1 AND diary_date = $2`,
    [co.projectId, ngay],
  );
  return r[0] ?? null;
}

const demBienNhan = async (userId: number) =>
  Number(
    (
      await truyVan<{ n: string }>(
        `SELECT count(*) AS n FROM audit_operation_receipts WHERE user_id = $1`,
        [userId],
      )
    )[0].n,
  );

type OpIdb = { operationId: string; state: string; tries: number };

/** Trạng thái rõ của envelope trong IDB (không giải mã payload). */
function docOps(page: Page): Promise<OpIdb[]> {
  return page.evaluate(
    (ten) =>
      new Promise<OpIdb[]>((resolve, reject) => {
        const req = indexedDB.open(ten);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("ops2")) {
            db.close();
            return resolve([]);
          }
          const r = db.transaction("ops2", "readonly").objectStore("ops2").getAll();
          r.onsuccess = () => {
            db.close();
            resolve(
              (r.result as Record<string, unknown>[]).map((o) => ({
                operationId: o.operationId as string,
                state: o.state as string,
                tries: o.tries as number,
              })),
            );
          };
          r.onerror = () => {
            db.close();
            reject(r.error);
          };
        };
      }),
    DB_NAME,
  );
}

/** PUT nhật ký trực tiếp (online) của "người khác" qua fetch trong trang đã đăng nhập. */
async function putNhatKy(
  page: Page,
  ngay: string,
  workDone: string,
  precondition: { ifMatch: string } | "tao-moi",
): Promise<{ status: number; etag: string | null }> {
  return page.evaluate(
    async ({ ngay, workDone, precondition }) => {
      const res = await fetch(`/api/diaries/${ngay}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(precondition === "tao-moi"
            ? { "If-None-Match": "*" }
            : { "If-Match": precondition.ifMatch }),
        },
        body: JSON.stringify({ workDone, manpower: [], photoIds: [] }),
      });
      const j = (await res.json().catch(() => null)) as { etag?: unknown } | null;
      return { status: res.status, etag: typeof j?.etag === "string" ? j.etag : null };
    },
    { ngay, workDone, precondition },
  );
}

/** Đăng nhập kỹ sư ở context riêng (phiên/cookie riêng) và mở một trang cùng origin. */
async function moNguoiKhac(browser: Browser, baseURL: string | undefined, email: string) {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await dangNhapCoLap(page, email);
  return { ctx, page };
}

/**
 * Mở /diary, bấm ngày cố định trong tháng, chờ form nạp xong (vault đã mở + khoá nhật ký tháng).
 * Trả ngày ISO đọc từ tiêu đề modal (lịch dùng tháng theo giờ trình duyệt).
 */
async function moNhatKy(page: Page): Promise<string> {
  await page.goto("/diary");
  await expect(page.getByRole("tab", { name: "Lịch" })).toBeVisible({ timeout: 20_000 });
  // /diary không có lưới tick: vault chỉ mở (unlock) + xin khoá tháng (keys) khi mở form nhật ký.
  const unlock = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/offline/vault/unlock" && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  const khoaThang = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/offline/vault/keys" && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page
    .getByRole("button", { name: String(NGAY_TRONG_THANG), exact: true })
    .first()
    .click();
  const tieuDe = page.getByRole("heading", { name: /Nhật ký ngày \d{2}\/\d{2}\/\d{4}/ });
  await expect(tieuDe).toBeVisible();
  expect((await unlock).status()).toBe(200);
  // Khoá tháng: 201 khi cấp mới, 200 khi đã có (idempotent theo manifest).
  expect([200, 201]).toContain((await khoaThang).status());
  await expect(page.getByRole("button", { name: "Thêm dòng" })).toBeVisible({ timeout: 20_000 });
  const [, dd, mm, yyyy] = /(\d{2})\/(\d{2})\/(\d{4})/.exec((await tieuDe.textContent()) ?? "")!;
  return `${yyyy}-${mm}-${dd}`;
}

/** Soạn bản nháp khi mất mạng rồi "Lưu nháp" → phải vào hàng đợi (không phải PUT online). */
async function soanOffline(page: Page, context: BrowserContext, noiDung: string) {
  await context.setOffline(true);
  await page.locator("textarea").first().fill(noiDung);
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText(/Đã lưu trên thiết bị \(chưa lên máy chủ\)/)).toBeVisible();
  await expect.poll(async () => (await docOps(page)).length, { timeout: 15_000 }).toBe(1);
  const [op] = await docOps(page);
  expect(op.state).toBe("pending");
  return op.operationId;
}

const laPutNhatKy = (ngay: string) => (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === `/api/diaries/${ngay}` && r.request().method() === "PUT";

/** Mở màn phục hồi → "Xem & giải quyết" xung đột nhật ký ngày `ngay`. */
async function moXungDot(page: Page, ngay: string) {
  await page.getByRole("button", { name: BADGE }).click();
  const hop = page.getByRole("dialog", { name: "Thao tác ngoại tuyến" });
  await expect(hop).toBeVisible();
  const [y, m, d] = ngay.split("-");
  await expect(hop.getByText(`Nhật ký ngày ${d}/${m}/${y}`)).toBeVisible();
  await hop.getByRole("button", { name: "Xem & giải quyết" }).click();
  // Vào màn xung đột, hộp thoại lấy tên theo tiêu đề mới (aria-labelledby).
  const ten = `Xung đột nhật ký ngày ${d}/${m}/${y}`;
  const xungDot = page.getByRole("dialog", { name: ten });
  await expect(xungDot.getByRole("heading", { name: ten })).toBeVisible();
  await expect(xungDot.getByText("Đang tải bản trên máy chủ…")).toHaveCount(0, { timeout: 20_000 });
  return xungDot;
}

test("A2-AC10: If-Match cũ → 412 không đè bản người khác; xem bản máy chủ rồi giữ bản thiết bị → gửi theo phiên bản mới", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const co = await dungToChucCoLap(["pm", "engineer"]);
  const pm = co.nguoi.pm;
  const ks = await moNguoiKhac(browser, baseURL, co.nguoi.engineer.email);
  try {
    await dangNhapCoLap(page, pm.email);
    const ngay = await moNhatKy(page);
    // Kỹ sư tạo v1 TRƯỚC khi PM mở form → form PM dựa trên etag v1.
    const v1 = await putNhatKy(ks.page, ngay, "KS v1", "tao-moi");
    expect(v1.status).toBe(200);
    await page.getByRole("button", { name: "Đóng", exact: true }).click();
    await page
      .getByRole("button", { name: String(NGAY_TRONG_THANG), exact: true })
      .first()
      .click();
    await expect(page.locator("textarea").first()).toHaveValue("KS v1", { timeout: 20_000 });

    const opCu = await soanOffline(page, context, "PM thiết bị");
    const v2 = await putNhatKy(ks.page, ngay, "KS v2", { ifMatch: v1.etag! });
    expect(v2.status).toBe(200);
    const truoc = await nhatKyDb(co, ngay);
    expect(truoc?.work_done).toBe("KS v2");

    const lanGui = page.waitForResponse(laPutNhatKy(ngay), { timeout: 30_000 });
    await context.setOffline(false);
    const r412 = await lanGui;
    expect(r412.status()).toBe(412);
    expect(r412.request().headers()["if-match"]).toBe(v1.etag);
    expect(r412.request().headers()["idempotency-key"]).toBe(opCu);
    await expect
      .poll(async () => (await docOps(page)).map((o) => o.state), { timeout: 15_000 })
      .toEqual(["conflict"]);
    // Máy chủ nguyên bản người khác: không đè, không tăng phiên bản, không receipt của PM.
    expect(await nhatKyDb(co, ngay)).toEqual(truoc);
    expect(await demBienNhan(pm.id)).toBe(0);

    const hop = await moXungDot(page, ngay);
    await expect(hop.getByText("PM thiết bị")).toBeVisible();
    await expect(hop.getByText("KS v2")).toBeVisible();
    const guiMoi = page.waitForResponse(
      (r) => laPutNhatKy(ngay)(r) && r.request().headers()["idempotency-key"] !== opCu,
      { timeout: 30_000 },
    );
    await hop.getByRole("button", { name: "Giữ bản trên thiết bị", exact: true }).click();
    await page
      .getByRole("dialog")
      .filter({ hasText: "THAY bản đang có trên máy chủ" })
      .getByRole("button", { name: "Giữ bản trên thiết bị", exact: true })
      .click();
    const r200 = await guiMoi;
    expect(r200.status()).toBe(200);
    expect(r200.request().headers()["if-match"]).toBe(v2.etag);

    await expect.poll(async () => (await docOps(page)).length, { timeout: 30_000 }).toBe(0);
    await expect(page.getByRole("button", { name: BADGE })).toHaveCount(0, { timeout: 15_000 });
    const sau = await nhatKyDb(co, ngay);
    expect(sau?.work_done).toBe("PM thiết bị");
    expect(sau?.id).toBe(truoc?.id);
    expect(sau!.version).toBeGreaterThan(truoc!.version);
    expect(await demBienNhan(pm.id)).toBe(1);
  } finally {
    await ks.ctx.close();
  }
});

test("A2-AC10: tạo-nếu-chưa-có (If-None-Match: *) khi người khác vừa tạo → 412 không đè; dùng bản máy chủ bỏ bản thiết bị", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const co = await dungToChucCoLap(["pm", "engineer"]);
  const pm = co.nguoi.pm;
  const ks = await moNguoiKhac(browser, baseURL, co.nguoi.engineer.email);
  try {
    await dangNhapCoLap(page, pm.email);
    const ngay = await moNhatKy(page);
    expect(await nhatKyDb(co, ngay)).toBeNull();
    const opCu = await soanOffline(page, context, "PM tạo offline");
    const tao = await putNhatKy(ks.page, ngay, "KS tạo trước", "tao-moi");
    expect(tao.status).toBe(200);
    const truoc = await nhatKyDb(co, ngay);
    expect(truoc).toMatchObject({ work_done: "KS tạo trước", created_by: co.nguoi.engineer.id });

    const lanGui = page.waitForResponse(laPutNhatKy(ngay), { timeout: 30_000 });
    await context.setOffline(false);
    const r412 = await lanGui;
    expect(r412.status()).toBe(412);
    expect(r412.request().headers()["if-none-match"]).toBe("*");
    expect(r412.request().headers()["if-match"]).toBeUndefined();
    expect(r412.request().headers()["idempotency-key"]).toBe(opCu);
    await expect
      .poll(async () => (await docOps(page)).map((o) => o.state), { timeout: 15_000 })
      .toEqual(["conflict"]);
    expect(await nhatKyDb(co, ngay)).toEqual(truoc);

    const hop = await moXungDot(page, ngay);
    await expect(hop.getByText("PM tạo offline")).toBeVisible();
    await expect(hop.getByText("KS tạo trước")).toBeVisible();
    let putSauQuyetDinh = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === `/api/diaries/${ngay}` && r.method() === "PUT")
        putSauQuyetDinh++;
    });
    await hop.getByRole("button", { name: "Dùng bản máy chủ", exact: true }).click();
    await page
      .getByRole("dialog")
      .filter({ hasText: "BỎ bản nhật ký trên thiết bị" })
      .getByRole("button", { name: "Bỏ bản trên thiết bị", exact: true })
      .click();
    await expect(page.getByText("Đã bỏ bản trên thiết bị, giữ bản trên máy chủ.")).toBeVisible();
    await expect.poll(async () => (await docOps(page)).length, { timeout: 15_000 }).toBe(0);
    await expect(page.getByRole("button", { name: BADGE })).toHaveCount(0, { timeout: 15_000 });
    expect(putSauQuyetDinh).toBe(0);
    expect(await nhatKyDb(co, ngay)).toEqual(truoc);
    expect(await demBienNhan(pm.id)).toBe(0);
  } finally {
    await ks.ctx.close();
  }
});

test("A2-AC10: mất ACK sau khi máy chủ đã ghi → gửi lại cùng key trả receipt, không 412 giả, không ghi lần hai", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const co = await dungToChucCoLap(["pm", "engineer"]);
  const pm = co.nguoi.pm;
  const ks = await moNguoiKhac(browser, baseURL, co.nguoi.engineer.email);
  try {
    await dangNhapCoLap(page, pm.email);
    const ngay = await moNhatKy(page);
    const v1 = await putNhatKy(ks.page, ngay, "KS v1", "tao-moi");
    expect(v1.status).toBe(200);
    await page.getByRole("button", { name: "Đóng", exact: true }).click();
    await page
      .getByRole("button", { name: String(NGAY_TRONG_THANG), exact: true })
      .first()
      .click();
    await expect(page.locator("textarea").first()).toHaveValue("KS v1", { timeout: 20_000 });

    const lan: { key: string; ifMatch?: string; status: number | "mat-ack" }[] = [];
    // Lần gửi tự động (nhịp flush nền) trước khi bấm "Gửi lại ngay": cắt TRƯỚC khi tới máy chủ để
    // lần thủ công là lần duy nhất được đi tiếp — không phụ thuộc ai bắn trước. Vẫn ghi key/If-Match.
    const tuDongBiChan: { key: string; ifMatch?: string }[] = [];
    let daBamGuiLai = false;
    let statusLan1: number | undefined;
    await context.route(`**/api/diaries/${ngay}`, async (route) => {
      const key = route.request().headers()["idempotency-key"];
      if (route.request().method() !== "PUT" || !key) return route.continue();
      const ifMatch = route.request().headers()["if-match"];
      // Lần đầu: request tới server, COMMIT xong mới cắt response → client mất ACK.
      if (lan.length === 0) {
        const res = await route.fetch();
        statusLan1 = res.status();
        lan.push({ key, ifMatch, status: "mat-ack" });
        return route.abort("connectionreset");
      }
      if (!daBamGuiLai) {
        tuDongBiChan.push({ key, ifMatch });
        return route.abort("connectionreset");
      }
      const res = await route.fetch();
      lan.push({ key, ifMatch, status: res.status() });
      return route.fulfill({ response: res });
    });

    const opId = await soanOffline(page, context, "PM gửi mất ACK");
    await context.setOffline(false);
    await expect.poll(() => lan.length, { timeout: 30_000 }).toBe(1);
    expect(statusLan1).toBe(200);
    await expect
      .poll(async () => (await docOps(page))[0]?.state, { timeout: 15_000 })
      .toBe("pending");
    // Server đã ghi đúng một lần; precondition v1 nay đã cũ so với phiên bản trên máy chủ.
    const sauLan1 = await nhatKyDb(co, ngay);
    expect(sauLan1?.work_done).toBe("PM gửi mất ACK");
    expect(await demBienNhan(pm.id)).toBe(1);

    await page.getByRole("button", { name: BADGE }).click();
    const hop = page.getByRole("dialog", { name: "Thao tác ngoại tuyến" });
    daBamGuiLai = true;
    await hop.getByRole("button", { name: "Gửi lại ngay" }).click();
    await expect.poll(() => lan.length, { timeout: 30_000 }).toBe(2);
    for (const lanTuDong of tuDongBiChan)
      expect(lanTuDong).toEqual({ key: opId, ifMatch: v1.etag });
    expect(lan).toEqual([
      { key: opId, ifMatch: v1.etag, status: "mat-ack" },
      { key: opId, ifMatch: v1.etag, status: 200 },
    ]);
    await expect.poll(async () => (await docOps(page)).length, { timeout: 30_000 }).toBe(0);
    await expect(page.getByRole("button", { name: BADGE })).toHaveCount(0, { timeout: 15_000 });
    // Replay không ghi lần hai: cùng phiên bản, cùng nội dung, vẫn một receipt.
    expect(await nhatKyDb(co, ngay)).toEqual(sauLan1);
    expect(await demBienNhan(pm.id)).toBe(1);
  } finally {
    await ks.ctx.close();
  }
});
