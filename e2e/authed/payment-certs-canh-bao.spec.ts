import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  dangNhapCoLap,
  dungToChucCoLap,
  ganBoqVaoHopDong,
  goiApi,
  type ToChucCoLap,
} from "../helpers/co-lap";

// QUALITY-FINAL-1 S15 — lớp B (Chromium) cho IPC /payment-certs:
//  A5-AC04  kỳ làm luỹ kế vượt hợp đồng (HĐ 100, đã duyệt 90, kỳ 20 → 110) hiện cảnh báo dễ thấy;
//           Duyệt phải qua hộp xác nhận (tick + lý do); thiếu xác nhận thì KHÔNG duyệt.
//  A5-AC09  (phần tự động hoá được) 409 không bao giờ hiện như "đã duyệt", thử lại KHÔNG tự gửi
//           acknowledged=true, hộp xác nhận dùng được bằng bàn phím, axe sạch desktop + mobile.
//  A3-AC05  (phần B) màn tiền hiển thị đúng số exact; vai trò bị che không thấy số.
// Mỗi test tạo tổ chức/hợp đồng RIÊNG qua route thật (e2e/helpers/co-lap.ts) nên không phụ thuộc
// thứ tự spec khác và không đụng EmptyState "Chưa có hợp đồng nào" của payment-certs.spec.ts.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

const HEADER_TIEN = { "X-XBoss-Money-Format": "decimal-string-v1" };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Dot = { id: number; boqId: number; contractId: number };

async function ok(
  p: Promise<{ status: number; body: Record<string, unknown> | null }>,
  trang: number | number[],
  mota: string,
) {
  const r = await p;
  const hopLe = Array.isArray(trang) ? trang : [trang];
  expect(hopLe, `${mota}: ${r.status} ${JSON.stringify(r.body)}`).toContain(r.status);
  return r.body!;
}

/** Hợp đồng nhận thầu + 1 dòng BOQ gắn vào hợp đồng (route thật; contract_id gắn bằng SQL). */
async function dungHopDong(
  page: Page,
  v: { value: number; qtyContract: number; unitPrice: number },
) {
  const h = Math.random().toString(36).slice(2, 8);
  const hd = await ok(
    goiApi(page, "POST", "/api/contracts", {
      code: `HD-S15-${h}`,
      kind: "nhan_thau",
      title: "HĐ nhận thầu S15",
      partyName: "CĐT S15",
      status: "active",
      value: v.value,
      advancePct: 0,
      retentionPct: 0,
    }),
    201,
    "tạo hợp đồng",
  );
  const boq = await ok(
    goiApi(page, "POST", "/api/boq", {
      code: `BOQ-S15-${h}`,
      name: "Ống thép S15",
      unit: "m",
      systemId: null,
      qtyContract: v.qtyContract,
      unitPrice: v.unitPrice,
    }),
    201,
    "tạo BOQ",
  );
  await ganBoqVaoHopDong(boq.id as number, hd.id as number);
  return { contractId: hd.id as number, boqId: boq.id as number };
}

async function lapDot(page: Page, contractId: number, boqId: number, qty: number): Promise<Dot> {
  const lap = await ok(goiApi(page, "POST", "/api/payment-certs", { contractId }), 201, "lập đợt");
  const id = lap.id as number;
  await ok(
    goiApi(page, "PATCH", `/api/payment-certs/${id}`, {
      items: [{ boqItemId: boqId, qtyPeriod: qty }],
    }),
    200,
    "nhập KL",
  );
  return { id, boqId, contractId };
}

async function trinh(page: Page, id: number) {
  await ok(goiApi(page, "POST", `/api/payment-certs/${id}/submit`), 200, "trình");
}

/** Kịch bản A5-AC04: HĐ 100, đợt 1 đã duyệt 90, đợt 2 (20) đã trình → luỹ kế 110. */
async function dungDotVuot(page: Page, co: ToChucCoLap): Promise<Dot> {
  await dangNhapCoLap(page, co.nguoi.pm.email);
  const hd = await dungHopDong(page, { value: 100000, qtyContract: 100, unitPrice: 1000 });
  const d1 = await lapDot(page, hd.contractId, hd.boqId, 90);
  await trinh(page, d1.id);
  await ok(
    goiApi(page, "POST", `/api/payment-certs/${d1.id}/decide`, { decision: "approved" }),
    200,
    "duyệt đợt 1",
  );
  const d2 = await lapDot(page, hd.contractId, hd.boqId, 20);
  await trinh(page, d2.id);
  return d2;
}

async function moDot(page: Page, d: Dot, doiCanhBao = false) {
  await page.goto(`/payment-certs?contractId=${d.contractId}&id=${d.id}`);
  await expect(page.getByText("Luỹ kế tới hết đợt", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // Nhãn tổng hiện ngay, còn chi tiết đợt (cảnh báo vượt HĐ + warningVersion) tải sau: bấm Duyệt
  // trước đó sẽ đi nhánh confirm 1 bấm thay vì hộp xác nhận — chờ cảnh báo hiện rồi mới thao tác.
  if (doiCanhBao)
    await expect(
      page.getByText("1 dòng có khối lượng luỹ kế VƯỢT khối lượng hợp đồng"),
    ).toBeVisible({ timeout: 20_000 });
}

/**
 * Bấm nút bằng bàn phím (focus + Enter) thay cho chuột: nút nằm trên thanh đáy cố định (mobile) —
 * kích hoạt bằng phím ổn định hơn toạ độ chuột và vẫn là thao tác người dùng thật.
 */
async function bam(nut: Locator) {
  await nut.focus();
  await nut.page().keyboard.press("Enter");
}

/** Đặt ô tick bằng bàn phím (focus + Space nếu trạng thái chưa đúng). */
async function datTick(o: Locator, daTick: boolean) {
  if ((await o.isChecked()) === daTick) return;
  await o.focus();
  await o.page().keyboard.press("Space");
  if (daTick) await expect(o).toBeChecked();
  else await expect(o).not.toBeChecked();
}

const doiPhienBan = (v: string) => v.slice(0, -1) + (v.endsWith("0") ? "1" : "0");

const nutDuyet = (page: Page) => page.getByRole("button", { name: "Duyệt", exact: true }).first();
const hop = (page: Page) => page.getByRole("dialog");
const laDecide = (u: string, m: string) =>
  /\/api\/payment-certs\/\d+\/decide$/.test(new URL(u).pathname) && m === "POST";

/** Tiêu đề chứng từ ĐANG MỞ (mã đợt + chip trạng thái) — danh sách bên cạnh cũng có chip riêng. */
const tieuDeDot = (page: Page) => page.locator("h2.font-mono").first().locator("..");

async function chuaDuocDuyet(page: Page) {
  await expect(tieuDeDot(page)).toContainText("Đã trình");
  await expect(tieuDeDot(page)).not.toContainText("Được duyệt");
}

async function daDuocDuyet(page: Page) {
  await expect(tieuDeDot(page)).toContainText("Được duyệt", { timeout: 20_000 });
}

/** Theme tối (darkblue) (theme sáng được kiểm riêng ở test A5-AC04 cuối file). */
async function theme(page: Page, ten: "light" | "darkblue") {
  await page.addInitScript((t) => localStorage.setItem("xboss_theme", t), ten);
}

test.describe("IPC vượt khối lượng hợp đồng — cảnh báo + xác nhận (lớp B)", () => {
  test("A5-AC04: luỹ kế 110 > 100 hiện cảnh báo; duyệt đòi xác nhận + lý do; thiếu thì không duyệt", async ({
    page,
  }) => {
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    const decide: { acknowledged?: boolean; reason?: string; warningVersion?: string }[] = [];
    page.on("request", (r) => {
      if (laDecide(r.url(), r.method())) decide.push(r.postDataJSON());
    });

    // Mức API: duyệt không kèm xác nhận bị từ chối, đợt vẫn "submitted" (kiểm trước khi mở UI).
    const thieu = await goiApi(page, "POST", `/api/payment-certs/${d2.id}/decide`, {
      decision: "approved",
    });
    expect(thieu.status).toBe(409);
    expect(thieu.body?.code).toBe("acknowledgement_required");
    decide.length = 0;

    await moDot(page, d2, true);
    // Cảnh báo dễ thấy ngay trên chứng từ: số dòng + luỹ kế/HĐ 110/100.
    await expect(
      page.getByText("1 dòng có khối lượng luỹ kế VƯỢT khối lượng hợp đồng"),
    ).toBeVisible();
    await expect(page.getByText(/110\/100 m/)).toBeVisible();

    await bam(nutDuyet(page));
    const dlg = hop(page);
    await expect(dlg).toBeVisible();
    await expect(
      dlg.getByRole("heading", { name: /xác nhận cảnh báo vượt khối lượng hợp đồng/ }),
    ).toBeVisible();
    await expect(dlg.getByText(/luỹ kế 110\/100 m/)).toBeVisible();
    const xacNhan = dlg.getByRole("button", { name: "Xác nhận và duyệt" });
    await expect(xacNhan).toBeDisabled();

    // Chỉ tick, chưa có lý do → vẫn không duyệt được.
    await datTick(dlg.getByRole("checkbox"), true);
    await expect(xacNhan).toBeDisabled();
    // Chỉ có lý do, bỏ tick → không duyệt được.
    await datTick(dlg.getByRole("checkbox"), false);
    await dlg.getByLabel(/Lý do duyệt vượt khối lượng/).fill("Phụ lục VO đang chờ ký");
    await expect(xacNhan).toBeDisabled();
    // Chưa gửi bất kỳ request quyết định nào, đợt vẫn "Đã trình".
    expect(decide).toEqual([]);

    // Huỷ hộp → không duyệt.
    await bam(dlg.getByRole("button", { name: "Huỷ" }));
    await expect(dlg).toHaveCount(0);
    expect(decide).toEqual([]);
    await chuaDuocDuyet(page);

    // Mở lại, đủ tick + lý do → duyệt được, body mang acknowledged/reason/warningVersion.
    await bam(nutDuyet(page));
    await expect(dlg).toBeVisible();
    await datTick(dlg.getByRole("checkbox"), true);
    await dlg.getByLabel(/Lý do duyệt vượt khối lượng/).fill("Phụ lục VO đang chờ ký");
    await expect(xacNhan).toBeEnabled();
    await bam(xacNhan);
    await daDuocDuyet(page);
    expect(decide).toHaveLength(1);
    expect(decide[0].acknowledged).toBe(true);
    expect(decide[0].reason).toBe("Phụ lục VO đang chờ ký");
    expect(typeof decide[0].warningVersion).toBe("string");
  });

  test("A5-AC09: 409 warning_changed không hiện như 'đã duyệt', thử lại KHÔNG tự gửi acknowledged=true", async ({
    page,
  }) => {
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    const bodies: { acknowledged?: boolean; warningVersion?: string }[] = [];
    let lan = 0;
    // Lượt 1 bị giả lập 409 warning_changed với phiên bản MỚI; lượt sau cho đi tới server thật.
    await page.route("**/api/payment-certs/*/decide", async (route) => {
      const b = route.request().postDataJSON();
      bodies.push(b);
      lan += 1;
      if (lan === 1) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Cảnh báo đã thay đổi",
            code: "warning_changed",
            // Cùng định dạng (64 hex) nhưng KHÁC bản thật → hộp dựng lại; lượt gửi sau mang bản giả
            // này tới server thật nên nhận 409 warning_changed thật.
            warningVersion: doiPhienBan(b.warningVersion as string),
            vuotHopDong: [
              {
                boqItemId: d2.boqId,
                code: "BOQ-X",
                name: "Ống thép S15",
                unit: "m",
                qtyContract: 100,
                qtyCumulative: 115,
              },
            ],
          }),
        });
        return;
      }
      await route.continue();
    });

    await moDot(page, d2, true);
    await bam(nutDuyet(page));
    const dlg = hop(page);
    await datTick(dlg.getByRole("checkbox"), true);
    await dlg.getByLabel(/Lý do duyệt vượt khối lượng/).fill("Lý do lần 1");
    await bam(dlg.getByRole("button", { name: "Xác nhận và duyệt" }));

    // Hộp mở lại với cảnh báo "đã thay đổi", ô tick + lý do bị xoá, nút vẫn khoá.
    await expect(dlg.getByRole("alert")).toContainText("Cảnh báo đã thay đổi");
    await expect(dlg.getByRole("checkbox")).not.toBeChecked();
    await expect(dlg.getByLabel(/Lý do duyệt vượt khối lượng/)).toHaveValue("");
    await expect(dlg.getByRole("button", { name: "Xác nhận và duyệt" })).toBeDisabled();
    await expect(dlg.getByText(/luỹ kế 115\/100 m/)).toBeVisible();
    // Chờ đủ lâu để một lần tự thử lại (nếu có) kịp phát ra: vẫn đúng 1 request, không toast "đã duyệt".
    await page.waitForTimeout(1_200);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].acknowledged).toBe(true); // lượt 1 do NGƯỜI DÙNG bấm
    await chuaDuocDuyet(page);

    // Người dùng xác nhận lại bản mới → lượt 2 đi server thật (phiên bản giả → 409 thật) → hộp lại mở.
    await datTick(dlg.getByRole("checkbox"), true);
    await dlg.getByLabel(/Lý do duyệt vượt khối lượng/).fill("Lý do lần 2");
    await bam(dlg.getByRole("button", { name: "Xác nhận và duyệt" }));
    await expect.poll(() => bodies.length).toBe(2);
    await expect(dlg.getByRole("alert")).toContainText("Cảnh báo đã thay đổi");
    await expect(dlg.getByRole("checkbox")).not.toBeChecked();
    await page.waitForTimeout(1_000);
    expect(bodies).toHaveLength(2); // không có lượt 3 tự động
    await chuaDuocDuyet(page);

    // Lượt 3 do người dùng: phiên bản thật → duyệt được.
    await datTick(dlg.getByRole("checkbox"), true);
    await dlg.getByLabel(/Lý do duyệt vượt khối lượng/).fill("Lý do lần 3");
    await bam(dlg.getByRole("button", { name: "Xác nhận và duyệt" }));
    await daDuocDuyet(page);
    expect(bodies).toHaveLength(3);
  });

  test("A5-AC09: hộp xác nhận dùng được bằng bàn phím (Tab/Space/Enter/Esc) + axe sạch", async ({
    page,
  }) => {
    await theme(page, "darkblue");
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    let soDecide = 0;
    page.on("request", (r) => {
      if (laDecide(r.url(), r.method())) soDecide += 1;
    });
    await moDot(page, d2, true);

    // Enter trên nút Duyệt mở hộp; Esc đóng, không gửi gì và trả focus về nút Duyệt.
    await nutDuyet(page).focus();
    await page.keyboard.press("Enter");
    const dlg = hop(page);
    await expect(dlg).toBeVisible();
    // Focus đã nằm TRONG hộp (không rơi ra nền).
    await expect.poll(() => dlg.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const nang = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(nang, JSON.stringify(nang, null, 2)).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    expect(soDecide).toBe(0);
    // Đợt vẫn chưa duyệt.
    await moDot(page, d2, true);
    await chuaDuocDuyet(page);
    await nutDuyet(page).focus();

    // Mở lại, đi hết bằng bàn phím tới "Xác nhận và duyệt" rồi Enter.
    await page.keyboard.press("Enter");
    await expect(dlg).toBeVisible();
    const checkbox = dlg.getByRole("checkbox");
    for (
      let i = 0;
      i < 8 && !(await checkbox.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(checkbox).toBeFocused();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(dlg.getByLabel(/Lý do duyệt vượt khối lượng/)).toBeFocused();
    await page.keyboard.type("Duyệt bằng bàn phím");
    await page.keyboard.press("Tab"); // Huỷ
    await expect(dlg.getByRole("button", { name: "Huỷ" })).toBeFocused();
    await page.keyboard.press("Tab"); // Xác nhận và duyệt
    await expect(dlg.getByRole("button", { name: "Xác nhận và duyệt" })).toBeFocused();
    await page.keyboard.press("Enter");
    await daDuocDuyet(page);
    expect(soDecide).toBe(1);
  });

  test("A5-AC04: axe sạch trên chứng từ có cảnh báo vượt HĐ (theme tối)", async ({ page }) => {
    await theme(page, "darkblue");
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    await moDot(page, d2, true);
    await expect(
      page.getByText("1 dòng có khối lượng luỹ kế VƯỢT khối lượng hợp đồng"),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const nang = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(nang, JSON.stringify(nang, null, 2)).toEqual([]);
  });
});

test.describe("Số tiền exact trên màn IPC (A3-AC05, lớp B)", () => {
  test("A3-AC05: API trả chuỗi exact; UI không làm tròn float (1,005 × 100 = 100,5 → 101 đ); số biên 13 chữ số", async ({
    page,
  }) => {
    const co = await dungToChucCoLap(["pm", "engineer"]);
    await dangNhapCoLap(page, co.nguoi.pm.email);

    // Hợp đồng 1: 1,005 × 100,00 = 100,50 — float JS ra 100,49999… (làm tròn xuống 100 đ), exact ra 101 đ.
    const nho = await dungHopDong(page, { value: 1000, qtyContract: 2, unitPrice: 100 });
    const dotNho = await lapDot(page, nho.contractId, nho.boqId, 1.005);
    // Hợp đồng 2: biên cột numeric(15,2): 3 × 3.333.333.333.333,33 = 9.999.999.999.999,99.
    const lon = await dungHopDong(page, {
      value: 9999999999999.99,
      qtyContract: 3,
      unitPrice: 3333333333333.33,
    });
    const dotLon = await lapDot(page, lon.contractId, lon.boqId, 3);

    // API (opt-in decimal-string-v1): tổng là CHUỖI canonical, đúng từng chữ số.
    const tong = async (id: number) =>
      page.evaluate(
        async ({ id, hd }) => {
          const r = await fetch(`/api/payment-certs/${id}`, { headers: hd });
          return { status: r.status, body: await r.json() };
        },
        { id, hd: HEADER_TIEN },
      );
    const apiNho = await tong(dotNho.id);
    expect(apiNho.status).toBe(200);
    expect(apiNho.body.totals.periodValue).toBe("100.50");
    const apiLon = await tong(dotLon.id);
    expect(apiLon.status).toBe(200);
    expect(apiLon.body.totals.periodValue).toBe("9999999999999.99");
    expect(apiLon.body.totals.cumulativeValue).toBe("9999999999999.99");

    // UI: số tiền hiện theo chuỗi exact làm tròn tới đồng bằng bigint.
    await moDot(page, dotNho);
    await expect(page.getByText("101 đ", { exact: true }).first()).toBeVisible();
    await moDot(page, dotLon);
    await expect(page.getByText("10.000.000.000.000 đ", { exact: true }).first()).toBeVisible();

    // Vai trò bị che (kỹ sư không có quyền xem thanh toán): API 403 và UI không lộ số nào.
    await page.context().clearCookies();
    await dangNhapCoLap(page, co.nguoi.engineer.email);
    const che = await goiApi(page, "GET", `/api/payment-certs/${dotLon.id}`);
    expect(che.status).toBe(403);
    expect(JSON.stringify(che.body)).not.toMatch(/9999999999999|3333333333333|10\.000\.000/);
    await page.goto(`/payment-certs?contractId=${lon.contractId}&id=${dotLon.id}`);
    await page.waitForLoadState("networkidle");
    const chu = await page.locator("body").innerText();
    expect(chu).not.toContain("10.000.000.000.000");
    expect(chu).not.toContain("9.999.999.999.999");
    expect(chu).not.toContain("3.333.333.333.333");
  });
});

test.describe("Hồi quy UI đã sửa (tương phản theme sáng, Esc hộp xác nhận, tràn ngang mobile)", () => {
  test("A5-AC09: Esc trên hộp xác nhận chỉ đóng hộp, giữ chứng từ + trả focus về nút Duyệt", async ({
    page,
  }) => {
    await theme(page, "darkblue");
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    await moDot(page, d2, true);
    await bam(nutDuyet(page));
    await expect(hop(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(hop(page)).toHaveCount(0);
    await expect(tieuDeDot(page)).toBeVisible();
    await expect(nutDuyet(page)).toBeFocused();
  });

  test("A5-AC04: cảnh báo vượt HĐ đủ tương phản ở theme sáng (axe)", async ({ page }) => {
    await theme(page, "light");
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    await moDot(page, d2, true);
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const nang = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(nang, JSON.stringify(nang, null, 2)).toEqual([]);
  });

  // Mobile (Pixel 5, 393px): lưới 2 cột của trang thiếu grid-cols-1 + min-w-0 nên cột ngầm `auto`
  // nở theo bảng dòng KL (min-w 720px) → trang rộng 738px, thanh đáy cố định lệch.
  test("A5-AC09: chứng từ IPC không tràn ngang trên mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "chỉ áp dụng cho viewport mobile");
    await theme(page, "darkblue");
    const co = await dungToChucCoLap(["pm"]);
    const d2 = await dungDotVuot(page, co);
    await moDot(page, d2, true);
    const rong = await page.evaluate(() => ({
      cuon: document.documentElement.scrollWidth,
      hienThi: document.documentElement.clientWidth,
    }));
    // Khi vỡ: liệt kê phần tử vượt mép phải để chỉ đúng chỗ tràn.
    const tran = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return Array.from(document.body.querySelectorAll("*"))
        .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest(".app-bottombar"))
        .slice(0, 8)
        .map(
          (el) =>
            `${el.tagName}.${String(el.className).slice(0, 80)} right=${Math.round(el.getBoundingClientRect().right)}`,
        );
    });
    expect(rong.cuon, JSON.stringify(tran, null, 1)).toBeLessThanOrEqual(rong.hienThi + 1);
  });
});
