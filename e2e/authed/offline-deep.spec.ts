import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { E2E_DB } from "../constants";
import { dangNhapCoLap, dungToChucCoLap, type ToChucCoLap } from "../helpers/co-lap";

// QUALITY-FINAL-1 S16 — A2-AC07 và A2-AC08 lớp B (Chromium thật, IndexedDB/Service Worker/CDP thật).
//   A2-AC07: legacy v1 không chủ / nâng cấp bị chặn (onblocked) / quota → không tự nhận chủ, không
//            xoá, không drop DB, không báo "đã lưu" giả, upgrade chạy lại không nhân bản/mất op.
//   A2-AC08: SW bị dừng/khởi động lại, mất ACK (server đã xử lý nhưng client không thấy response),
//            không có Background Sync (chỉ foreground/online/poll) — gửi lại vẫn đúng context và
//            server chỉ tạo MỘT hiệu ứng nghiệp vụ (receipt dedup).
// Lớp M (Safari/iOS thật, WebKit): NOT_RUN — Playwright CI chỉ có Chromium; KHÔNG giả lập Safari.
// Chromium KHÔNG phải bằng chứng cho Safari (eviction ITP, SW lifecycle, không có Background Sync).
//
// Mỗi ca dựng tổ chức + dự án + cây WBS CÔ LẬP (id do DB cấp) và người dùng riêng: đăng ký thiết bị
// offline bị giới hạn 10 lần/15 phút/người nên không dùng tài khoản demo chung; chạy song song và
// --repeat-each không giẫm lên nhau.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 150_000 });

const OFFLINE_SAVE_ERROR = "Chưa lưu được trên thiết bị. Hãy kết nối mạng rồi thử lại.";
const BADGE = /mở màn thao tác ngoại tuyến/;
const DB_NAME = "xboss-offline";

// ── Dữ liệu cô lập ─────────────────────────────────────────────────────────────────────────

type Luoi = { co: ToChucCoLap; slug: string; nhom: string; userId: number; email: string };

/** Org riêng + 1 sheet/nhóm/3 task, mỗi task 2 ô (dimension) — đủ để tick qua UI. */
async function dungLuoi(): Promise<Luoi> {
  const co = await dungToChucCoLap(["pm"]);
  const h = randomBytes(4).toString("hex");
  const slug = `deep-${h}`;
  const nhom = `Nhóm deep ${h}`;
  if (!E2E_DB) throw new Error("Thiếu E2E_DATABASE_URL");
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  try {
    const tw = await pool.query(
      `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp deep') RETURNING id`,
      [co.projectId],
    );
    const st = await pool.query(
      `INSERT INTO sheet_types (tower_id, code, name, slug, project_id)
       VALUES ($1, $2, 'Sheet deep', $3, $4) RETURNING id`,
      [tw.rows[0].id, `D${h}`, slug, co.projectId],
    );
    const wp = await pool.query(
      `INSERT INTO work_packages (sheet_type_id, code, name, sort_order)
       VALUES ($1, $2, $3, 1) RETURNING id`,
      [st.rows[0].id, `P${h}`, nhom],
    );
    for (let i = 0; i < 3; i++) {
      const t = await pool.query(
        `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
         VALUES ($1, $2, $3, $4, 0, 'chuan_bi') RETURNING id`,
        [wp.rows[0].id, `T${h}-${i}`, `Task deep ${i}`, i + 1],
      );
      for (let d = 0; d < 2; d++)
        await pool.query(
          `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES ($1, $2, $3)`,
          [t.rows[0].id, `DN${100 + d * 50}`, d],
        );
    }
  } finally {
    await pool.end();
  }
  return { co, slug, nhom, userId: co.nguoi.pm.id, email: co.nguoi.pm.email };
}

async function truyVan<T = Record<string, unknown>>(sql: string, args: unknown[]): Promise<T[]> {
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  try {
    return (await pool.query(sql, args)).rows as T[];
  } finally {
    await pool.end();
  }
}

const demBienNhan = async (userId: number, operationId?: string) =>
  Number(
    (
      await truyVan<{ n: string }>(
        `SELECT count(*) AS n FROM audit_operation_receipts
          WHERE user_id = $1 AND ($2::uuid IS NULL OR operation_id = $2::uuid)`,
        [userId, operationId ?? null],
      )
    )[0].n,
  );

/** Số dòng task_history của task có ô `dimId` + % hiện tại (hiệu ứng nghiệp vụ của tick). */
async function hieuUngTick(dimId: number) {
  const r = await truyVan<{ n: string; pct: number; installed: number }>(
    `SELECT (SELECT count(*) FROM task_history h WHERE h.task_id = t.id) AS n,
            t.progress_percent AS pct, pd.installed
       FROM progress_dimensions pd JOIN tasks t ON t.id = pd.task_id WHERE pd.id = $1`,
    [dimId],
  );
  return { lichSu: Number(r[0].n), phanTram: r[0].pct, daTick: r[0].installed };
}

// ── Trang / IDB ────────────────────────────────────────────────────────────────────────────

const laPost = (duong: string) => (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === duong && r.request().method() === "POST";

/** Trang tĩnh cùng origin, KHÔNG chạy app: dùng dựng IDB trước khi app mở nó. */
const TRANG_TINH = "/manifest.webmanifest";

/** Đếm lần gọi deleteDatabase (lưu localStorage để sống qua điều hướng/reload). */
async function theoDoiXoaDb(page: Page) {
  await page.addInitScript(() => {
    const goc = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase = function (this: IDBFactory, ...a: [string]) {
      localStorage.setItem("__epXoaDb", String(Number(localStorage.getItem("__epXoaDb") ?? 0) + 1));
      return goc.apply(this, a);
    };
  });
}
const soLanXoaDb = (page: Page) =>
  page.evaluate(() => Number(localStorage.getItem("__epXoaDb") ?? 0));

type BanGhiV1 = { id: number; kind: string; payload: unknown };
const BAN_GHI_V1: BanGhiV1[] = [
  { id: 1, kind: "tick", payload: { dimId: 111, installed: true } },
  { id: 2, kind: "tick", payload: { dimId: 222, installed: false } },
];

/**
 * Dựng CSDL `xboss-offline` version 1 (queue cũ: store `ops`, không chủ) với các bản ghi cho
 * trước. `giuMo` = giữ connection mở và KHÔNG xử lý versionchange (mô phỏng tab cũ chặn nâng cấp).
 */
function dungDbV1(page: Page, giuMo: boolean) {
  return page.evaluate(
    ({ ban, giu, ten }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(ten, 1);
        req.onupgradeneeded = () => {
          const s = req.result.createObjectStore("ops", { keyPath: "id" });
          for (const b of ban) s.put(b);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          if (giu) (window as unknown as { __v1Giu?: IDBDatabase }).__v1Giu = req.result;
          else req.result.close();
          resolve();
        };
      }),
    { ban: BAN_GHI_V1, giu: giuMo, ten: DB_NAME },
  );
}

type TrangThaiIdb = {
  version: number;
  stores: string[];
  ops: BanGhiV1[];
  ops2: { operationId: string; state: string; tries: number; sendingToken?: number }[];
  meta: { k: string; token?: number; holder?: string; expiresAt?: number }[];
};

/** Đọc nguyên trạng IDB bằng connection ngắn (ciphertext không giải mã; chỉ trường rõ của envelope). */
function docIdb(page: Page): Promise<TrangThaiIdb> {
  return page.evaluate(
    (ten) =>
      new Promise<TrangThaiIdb>((resolve, reject) => {
        const req = indexedDB.open(ten);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const stores = Array.from(db.objectStoreNames);
          const tatCa = (s: string) =>
            new Promise<unknown[]>((ok, ko) => {
              if (!stores.includes(s)) return ok([]);
              const r = db.transaction(s, "readonly").objectStore(s).getAll();
              r.onsuccess = () => ok(r.result);
              r.onerror = () => ko(r.error);
            });
          Promise.all([tatCa("ops"), tatCa("ops2"), tatCa("meta")]).then(
            ([ops, ops2, meta]) => {
              const version = db.version;
              db.close();
              resolve({
                version,
                stores,
                ops: ops as BanGhiV1[],
                ops2: (ops2 as Record<string, unknown>[]).map((o) => ({
                  operationId: o.operationId as string,
                  state: o.state as string,
                  tries: o.tries as number,
                  sendingToken: o.sendingToken as number | undefined,
                })),
                meta: meta as TrangThaiIdb["meta"],
              });
            },
            (e) => {
              db.close();
              reject(e);
            },
          );
        };
      }),
    DB_NAME,
  );
}

/** Cắt PATCH ô như lỗi mạng khi còn mạng: op nằm lại trên thiết bị. Trả hàm gỡ cắt. */
async function catGuiO(context: BrowserContext) {
  const h = (route: import("@playwright/test").Route) =>
    route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue();
  await context.route("**/api/dimensions/**", h);
  return () => context.unroute("**/api/dimensions/**", h);
}

/**
 * Đăng nhập, mở lưới tracking, chờ vault mở, bung nhóm, bật chế độ sửa. Trả locator các ô tick.
 * (bám moLuoiSanSang của offline-recovery.spec.ts)
 */
async function moLuoi(page: Page, l: Luoi) {
  const unlock = page.waitForResponse(laPost("/api/offline/vault/unlock"), { timeout: 30_000 });
  const khoa = page
    .waitForResponse(laPost("/api/offline/vault/keys"), { timeout: 30_000 })
    .catch(() => null);
  await page.goto(`/tracking/${l.slug}`);
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 20_000 });
  expect((await unlock).status()).toBe(200);
  await Promise.race([khoa, page.waitForTimeout(8_000)]);
  await page.getByText(l.nhom).click();
  await expect(page.getByRole("columnheader", { name: "Công việc" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
  const o = page.locator('td label input[type="checkbox"]');
  await expect(o.first()).toBeVisible();
  return o;
}

/** id ô (progress_dimensions) thứ `i` của lưới (theo thứ tự task, ô). */
async function idO(l: Luoi, i: number): Promise<number> {
  const r = await truyVan<{ id: number }>(
    `SELECT pd.id FROM progress_dimensions pd JOIN tasks t ON t.id = pd.task_id
       JOIN work_packages w ON w.id = t.package_id JOIN sheet_types s ON s.id = w.sheet_type_id
      WHERE s.slug = $1 AND s.project_id = $2 ORDER BY t.sort_order, pd.sort_order`,
    [l.slug, l.co.projectId],
  );
  return r[i].id;
}

const badgeOf = (page: Page) => page.getByRole("button", { name: BADGE });

// ── A2-AC07 ────────────────────────────────────────────────────────────────────────────────

test("A2-AC07: legacy v1 không chủ — giữ nguyên, không gán chủ/gửi/xoá DB; upgrade chạy lại không nhân bản", async ({
  page,
  context,
}) => {
  const l = await dungLuoi();
  await theoDoiXoaDb(page);
  const yeuCauGui: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && /\/api\/(dimensions|diaries|tasks\/\d+\/photos)/.test(r.url()))
      yeuCauGui.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });

  // 1) Dựng v1 TRƯỚC khi app chạm IDB (trang tĩnh không có app).
  await page.goto(TRANG_TINH);
  await dungDbV1(page, false);
  expect((await docIdb(page)).version).toBe(1);

  // 2) Vào app: nâng cấp lên v2, `ops` nguyên 2 bản ghi.
  await dangNhapCoLap(page, l.email);
  const o = await moLuoi(page, l);
  const sau = await docIdb(page);
  expect(sau.version).toBe(2);
  expect(sau.stores).toEqual(expect.arrayContaining(["ops", "ops2", "meta"]));
  expect(sau.ops).toEqual(BAN_GHI_V1);
  expect(sau.ops2).toEqual([]);

  // UI: badge cảnh báo legacy + màn phục hồi mô tả đúng bằng tiếng Việt, không lộ nội dung.
  const badge = badgeOf(page);
  await expect(badge).toHaveAccessibleName(/dữ liệu ngoại tuyến cũ chưa rõ chủ/);
  await badge.click();
  const hop = page.getByRole("dialog", { name: "Thao tác ngoại tuyến" });
  await expect(hop.getByRole("heading", { name: /Dữ liệu cũ chưa rõ chủ/ })).toContainText("(2)");
  await expect(hop).toContainText("không được gửi hay gán cho tài khoản đang đăng nhập");
  await page.keyboard.press("Escape");

  // 3) Có thêm 1 op v2 của người dùng (giữ lại trên thiết bị) rồi reload 2 lần = upgrade chạy lại.
  await catGuiO(context);
  await o.nth(0).click();
  await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toBeVisible({
    timeout: 15_000,
  });
  const truoc = await docIdb(page);
  expect(truoc.ops2).toHaveLength(1);
  const idOp = truoc.ops2[0].operationId;

  for (let lan = 1; lan <= 2; lan++) {
    await page.reload();
    await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 20_000 });
    await expect(badgeOf(page)).toBeVisible();
    const s = await docIdb(page);
    expect(s.version, `reload ${lan}`).toBe(2);
    expect(s.ops, `reload ${lan}: legacy nguyên vẹn`).toEqual(BAN_GHI_V1);
    expect(
      s.ops2.map((x) => x.operationId),
      `reload ${lan}: op v2 không nhân bản/mất`,
    ).toEqual([idOp]);
  }

  // Không gán chủ/gửi/xoá: không có receipt nào cho người dùng, không deleteDatabase, và mọi PATCH
  // ô đều là của op v2 (bị cắt) — không có yêu cầu nào mang dimId của bản ghi legacy.
  expect(await soLanXoaDb(page)).toBe(0);
  expect(await demBienNhan(l.userId)).toBe(0);
  expect(yeuCauGui.every((s) => s.startsWith("PATCH /api/dimensions/"))).toBe(true);
  expect(yeuCauGui.some((s) => /\/(111|222)$/.test(s))).toBe(false);
});

test("A2-AC07: nâng cấp bị chặn (tab cũ giữ connection) — không treo, không báo đã lưu giả, không mất op; hết chặn thì lưu được", async ({
  page,
  context,
}) => {
  const l = await dungLuoi();
  await theoDoiXoaDb(page);

  // Tab 2 giữ connection v1 và KHÔNG đóng khi versionchange → open(v2) của app bị onblocked.
  const tab2 = await context.newPage();
  await tab2.goto(TRANG_TINH);
  await dungDbV1(tab2, true);

  await dangNhapCoLap(page, l.email);
  const o = await moLuoi(page, l);
  await catGuiO(context);

  // Tab 2 vẫn thấy DB version 1 và 2 bản ghi legacy nguyên vẹn (nâng cấp chưa/không được ép).
  const duoiChan = await tab2.evaluate(
    () =>
      new Promise<{ version: number; n: number }>((resolve) => {
        const db = (window as unknown as { __v1Giu: IDBDatabase }).__v1Giu;
        const c = db.transaction("ops", "readonly").objectStore("ops").count();
        c.onsuccess = () => resolve({ version: db.version, n: c.result });
      }),
  );
  expect(duoiChan).toEqual({ version: 1, n: 2 });

  // Tick trong lúc bị chặn: phải báo lỗi rõ, KHÔNG nói đã lưu, ô trả về cũ.
  const truoc = await o.nth(0).isChecked();
  await o.nth(0).click();
  await expect(page.getByText(OFFLINE_SAVE_ERROR)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/thao tác được lưu trên thiết bị/)).toHaveCount(0);
  await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toHaveCount(0);
  await expect(o.nth(0)).toBeChecked({ checked: truoc });

  // Tab 2 đóng connection → nâng cấp hoàn tất; legacy còn nguyên, không deleteDatabase.
  await tab2.evaluate(() => (window as unknown as { __v1Giu: IDBDatabase }).__v1Giu.close());
  await expect.poll(async () => (await docIdb(tab2)).version, { timeout: 15_000 }).toBe(2);
  const sau = await docIdb(tab2);
  expect(sau.ops).toEqual(BAN_GHI_V1);
  expect(sau.ops2).toEqual([]);
  expect(await soLanXoaDb(page)).toBe(0);

  // Hết chặn: cùng thao tác lưu được trên thiết bị.
  await o.nth(0).click();
  await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toBeVisible({
    timeout: 15_000,
  });
  expect((await docIdb(page)).ops2).toHaveLength(1);
  await tab2.close();
});

test("A2-AC07: quota origin cạn lúc TẠO IDB (CDP overrideQuotaForOrigin) — tick KHÔNG báo đã lưu, không drop DB; bỏ override thì lưu được", async ({
  page,
  context,
}) => {
  // Chromium chỉ ép quota khi TẠO cơ sở dữ liệu MỚI: ghi/nâng cấp DB đã tồn tại KHÔNG bị chặn (đã
  // thử trực tiếp bằng CDP: put 2MB vào DB có sẵn dưới quota=1 vẫn complete). Vì vậy ca này hạ
  // quota TRƯỚC khi app tạo `xboss-offline` lần đầu. Hệ quả: "op cũ còn nguyên khi quota cạn giữa
  // chừng" không dựng được ở Chromium thật — phần đó do unit (MemoryTxDb.hongKhiCommit) và
  // offline-idb-abort.spec.ts (A2-AC05, abort giả lập) phủ.
  const l = await dungLuoi();
  await theoDoiXoaDb(page);
  await page.goto(TRANG_TINH);
  const cdp = await context.newCDPSession(page);
  const origin = new URL(page.url()).origin;
  await cdp.send("Storage.overrideQuotaForOrigin", { origin, quotaSize: 1 });
  let daBoOverride = false;
  const boOverride = async () => {
    if (daBoOverride) return;
    daBoOverride = true;
    await cdp.send("Storage.overrideQuotaForOrigin", { origin });
  };
  try {
    await dangNhapCoLap(page, l.email);
    const o = await moLuoi(page, l);
    await catGuiO(context);

    const cu = await o.nth(2).isChecked();
    await o.nth(2).click();
    await expect(page.getByText(OFFLINE_SAVE_ERROR)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/thao tác được lưu trên thiết bị/)).toHaveCount(0);
    await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toHaveCount(0);
    await expect(o.nth(2)).toBeChecked({ checked: cu });
    await boOverride();
    // Không có op v2 nào được báo/ghi, không drop DB.
    expect(await soLanXoaDb(page)).toBe(0);
  } finally {
    await boOverride();
  }

  // Hết quota: cùng thao tác lưu được (app mở lại IDB được, không cần reload).
  const o3 = page.locator('td label input[type="checkbox"]');
  await o3.nth(4).click();
  await expect.poll(async () => (await docIdb(page)).ops2.length, { timeout: 20_000 }).toBe(1);
});

// ── A2-AC08 ────────────────────────────────────────────────────────────────────────────────

test("A2-AC08: SW bị dừng giữa lúc xếp hàng → online vẫn gửi đúng context, đúng 1 lần, badge về 0", async ({
  page,
  context,
}) => {
  const l = await dungLuoi();
  await dangNhapCoLap(page, l.email);
  await page.goto(`/tracking/${l.slug}`);
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {
    timeout: 30_000,
  });
  const o = await moLuoi(page, l);
  const dimId = await idO(l, 1);

  await context.setOffline(true);
  await o.nth(1).click();
  await expect(page.getByText(/Mất mạng — thao tác được lưu trên thiết bị/)).toBeVisible();
  const [op] = (await docIdb(page)).ops2;
  expect(op).toBeTruthy();

  // Dừng MỌI worker SW (trình duyệt vẫn tự dựng lại khi có sự kiện) — mất ngữ cảnh trong bộ nhớ SW.
  const cdp = await context.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");

  const gui = page.waitForRequest(
    (r) => r.method() === "PATCH" && new RegExp(`/api/dimensions/${dimId}$`).test(r.url()),
    { timeout: 40_000 },
  );
  const phanHoi = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/api/dimensions/${dimId}`),
    { timeout: 40_000 },
  );
  await context.setOffline(false);
  const req = await gui;
  const h = req.headers();
  expect(h["idempotency-key"]).toBe(op.operationId);
  expect(h["x-xboss-context"]).toBeTruthy();
  expect((await phanHoi).status()).toBe(200);

  await expect(badgeOf(page)).toHaveCount(0, { timeout: 30_000 });
  expect((await docIdb(page)).ops2).toEqual([]);
  // Đúng context/đúng người/đúng 1 lần: 1 receipt của user + dự án này; ô tick đúng 1 lần.
  const bn = await truyVan<{ project_id: number; org_id: number }>(
    `SELECT project_id, org_id FROM audit_operation_receipts WHERE user_id = $1 AND operation_id = $2::uuid`,
    [l.userId, op.operationId],
  );
  expect(bn).toEqual([{ project_id: l.co.projectId, org_id: l.co.orgId }]);
  expect(await demBienNhan(l.userId)).toBe(1);
  expect((await hieuUngTick(dimId)).daTick).toBe(1);
});

test("A2-AC08: mất ACK (server đã xử lý, client không thấy response) → gửi lại cùng key, receipt dedup, không nhân đôi hiệu ứng", async ({
  page,
  context,
}) => {
  const l = await dungLuoi();
  await dangNhapCoLap(page, l.email);
  const o = await moLuoi(page, l);
  const dimId = await idO(l, 0);
  const truocHieuUng = await hieuUngTick(dimId);

  const khoaGui: string[] = [];
  let lan = 0;
  let trongLanHai: TrangThaiIdb | null = null;
  await context.route("**/api/dimensions/**", async (route) => {
    // Chỉ can thiệp request từ HÀNG ĐỢI (có Idempotency-Key); lần thử online trực tiếp của lưới
    // (không key, đi trước khi vào hàng đợi) cho qua nguyên trạng.
    const key = route.request().headers()["idempotency-key"];
    if (route.request().method() !== "PATCH" || !key) return route.continue();
    khoaGui.push(key);
    const n = khoaGui.length;
    if (n === 1) {
      lan = 1;
      // Request tới server và được xử lý đầy đủ (COMMIT) rồi mới cắt response → mất ACK.
      const res = await route.fetch();
      expect(res.status()).toBe(200);
      return route.abort("connectionreset");
    }
    // Lần gửi lại: op phải đang `sending` bằng đúng fencing token của lease hiện hành.
    trongLanHai = await docIdb(page);
    lan = n;
    return route.continue();
  });

  // Xếp hàng khi mất mạng, rồi có mạng: lần gửi đầu từ hàng đợi MANG Idempotency-Key (tick online
  // trực tiếp không có key — không phải đường receipt).
  await context.setOffline(true);
  await o.nth(0).click();
  await expect(page.getByText(/Mất mạng — thao tác được lưu trên thiết bị/)).toBeVisible();
  await context.setOffline(false);
  // Lần 1 xong (server đã ghi) nhưng client không biết: op còn trên thiết bị, về `pending`.
  await expect.poll(() => lan, { timeout: 30_000 }).toBe(1);
  await expect
    .poll(async () => (await docIdb(page)).ops2[0]?.state, { timeout: 15_000 })
    .toBe("pending");
  const sauLan1 = await docIdb(page);
  expect(sauLan1.ops2).toHaveLength(1);
  expect(sauLan1.ops2[0].sendingToken).toBeUndefined();
  expect(sauLan1.ops2[0].tries).toBe(1);
  const idOp = sauLan1.ops2[0].operationId;
  expect(await demBienNhan(l.userId, idOp)).toBe(1);
  const sauServerXuLy = await hieuUngTick(dimId);
  expect(sauServerXuLy.daTick).toBe(1);
  expect(sauServerXuLy.lichSu).toBeGreaterThan(truocHieuUng.lichSu);
  const tokenTruoc = Math.max(
    0,
    ...sauLan1.meta.filter((m) => m.k.startsWith("lease|")).map((m) => m.token ?? 0),
  );

  // Gửi lại ngay từ màn phục hồi (bỏ backoff) → cùng operationId/Idempotency-Key.
  await badgeOf(page).click();
  const hop = page.getByRole("dialog", { name: "Thao tác ngoại tuyến" });
  await hop.getByRole("button", { name: "Gửi lại ngay" }).click();
  await expect.poll(() => lan, { timeout: 30_000 }).toBe(2);
  expect(khoaGui).toEqual([idOp, idOp]);
  const giua = trongLanHai as TrangThaiIdb | null;
  expect(giua?.ops2[0]).toMatchObject({ operationId: idOp, state: "sending", tries: 2 });
  const tokenGui = giua?.ops2[0].sendingToken ?? -1;
  expect(tokenGui).toBeGreaterThanOrEqual(tokenTruoc);
  expect(
    giua?.meta.find((m) => m.k.startsWith("lease|") && m.token === tokenGui),
    "fencing token của op đang gửi khớp lease",
  ).toBeTruthy();

  await expect.poll(async () => (await docIdb(page)).ops2.length, { timeout: 30_000 }).toBe(0);
  await expect(badgeOf(page)).toHaveCount(0, { timeout: 15_000 });
  // Server KHÔNG tạo hiệu ứng trùng: vẫn 1 receipt, task_history/% không đổi sau replay.
  expect(await demBienNhan(l.userId, idOp)).toBe(1);
  expect(await hieuUngTick(dimId)).toEqual(sauServerXuLy);
});

test("A2-AC08: không dựa vào Background Sync/broadcast (sync không khả dụng như Safari) — gửi bằng foreground; tab đóng thì op nằm lại, không giả gửi nền", async ({
  page,
  context,
}) => {
  const l = await dungLuoi();
  // App chỉ ĐĂNG KÝ Background Sync best-effort (requestBackgroundSync, nuốt lỗi); đường gửi chính
  // là online/visibility/poll. Giả lập trình duyệt KHÔNG có Background Sync (như Safari): getter
  // `registration.sync` trả undefined — mọi thứ phải vẫn chạy. Đếm số lần app thử truy cập chỉ
  // để ghi nhận, không phải điều kiện đúng/sai.
  await context.addInitScript(() => {
    const dem = () =>
      localStorage.setItem("__epSync", String(Number(localStorage.getItem("__epSync") ?? 0) + 1));
    const reg = (window as unknown as { ServiceWorkerRegistration?: { prototype: object } })
      .ServiceWorkerRegistration;
    if (reg && "sync" in reg.prototype) {
      Object.defineProperty(reg.prototype, "sync", {
        configurable: true,
        get() {
          dem();
          return undefined;
        },
      });
    }
  });
  const soSync = (p: Page) => p.evaluate(() => Number(localStorage.getItem("__epSync") ?? 0));

  await dangNhapCoLap(page, l.email);
  const o = await moLuoi(page, l);
  const dimId = await idO(l, 2);

  // 1) Gửi bằng foreground (online event), không đăng ký sync nền.
  await context.setOffline(true);
  await o.nth(2).click();
  await expect(page.getByText(/Mất mạng — thao tác được lưu trên thiết bị/)).toBeVisible();
  const gui = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/api/dimensions/${dimId}`),
    { timeout: 30_000 },
  );
  await context.setOffline(false);
  expect((await gui).status()).toBe(200);
  await expect(badgeOf(page)).toHaveCount(0, { timeout: 30_000 });

  // 2) Op thứ hai giữ lại trên thiết bị (PATCH bị cắt), rồi ĐÓNG tab: không có gửi nền.
  const goCat = await catGuiO(context);
  const dim2 = await idO(l, 4);
  await o.nth(4).click();
  await expect(page.getByText(/thay đổi đang\s+lưu trên thiết bị/)).toBeVisible({
    timeout: 15_000,
  });
  // Chờ lần gửi (bị cắt) đầu tiên KẾT THÚC (op về pending, tries ≥ 1) trước khi đóng tab — đóng giữa
  // lúc request đang bay thì request vẫn có thể tới server (không liên quan tới "gửi nền").
  await expect
    .poll(
      async () => {
        const [o2] = (await docIdb(page)).ops2;
        return o2?.state === "pending" && o2.tries >= 1;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const [op2] = (await docIdb(page)).ops2;
  expect(op2).toBeTruthy();
  await page.close();
  expect(await demBienNhan(l.userId, op2.operationId)).toBe(0);
  expect((await hieuUngTick(dim2)).daTick).toBe(0);

  // 3) Mở tab mới: op vẫn còn (badge + IDB), vẫn chưa lên server; chỉ gửi khi tab foreground chạy.
  const tab = await context.newPage();
  await tab.goto(`/tracking/${l.slug}`);
  await expect(tab.getByRole("button", { name: /In PDF/ })).toBeVisible({ timeout: 20_000 });
  await expect(badgeOf(tab)).toBeVisible({ timeout: 20_000 });
  expect((await docIdb(tab)).ops2.map((x) => x.operationId)).toEqual([op2.operationId]);
  expect(await demBienNhan(l.userId, op2.operationId)).toBe(0);
  await goCat();
  await badgeOf(tab).click();
  await tab
    .getByRole("dialog", { name: "Thao tác ngoại tuyến" })
    .getByRole("button", { name: "Gửi lại ngay" })
    .click();
  await expect.poll(() => demBienNhan(l.userId, op2.operationId), { timeout: 40_000 }).toBe(1);
  expect(await soSync(tab)).toBeGreaterThanOrEqual(0); // chỉ ghi nhận, không khẳng định
});
