import { test, expect, type Page } from "@playwright/test";

// Khung layout dùng chung (AppHeader/HubShell/Modal/globals.css) — hồi quy cho đợt audit
// layout & UI/UX 2026-10-01. Mỗi ca dưới đây là lỗi THẬT đã đo trên bản production:
//  - Trang cuộn ngang cả trang trên điện thoại (topbar bị nút của trang đẩy tràn, ô chọn
//    "Hệ" không co, bảng báo cáo tràn khỏi tờ giấy) — 13 trang, rộng tới 842px trên màn 393px.
//  - Thanh hành động cố định dưới đáy che hàng/nút cuối + footer ở ~30 trang bottomActions.
//  - Viền focus bàn phím emerald-400 chỉ 1,8:1 trên nền theme sáng (mặc định).
//  - Modal đóng xong focus rơi về <body>.
//  - Tiêu đề hub bị xén cụt giữa chữ trên màn 360px, không có dấu "…".
//  - Không tôn trọng prefers-reduced-motion.

// Chờ nội dung chính render thật — cùng tiêu chí với luoi-quet-axe.spec.ts.
async function choNoiDung(page: Page) {
  await page.waitForFunction(
    () => {
      if (document.querySelector('[aria-label="Đang tải"]')) return false;
      const root = document.querySelector("main") ?? document.body;
      return (root?.textContent?.trim().length ?? 0) > 40;
    },
    { timeout: 20_000 },
  );
}

// Màn Android hẹp phổ biến — chật hơn Pixel 5 (393px) của project authed-mobile.
const HEP = { width: 360, height: 740 };

const TRANG_TUNG_TRAN_NGANG = [
  "/",
  "/admin",
  "/gantt",
  "/lookahead",
  "/materials/import",
  "/payments",
  "/procurement",
  "/report",
  "/schedule",
  "/schedule-control",
  "/scurve",
  "/timeline",
  "/vehicles",
];

test.describe("Khung layout — điện thoại", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "Chỉ áp cho viewport điện thoại");
  });

  for (const duongDan of TRANG_TUNG_TRAN_NGANG) {
    test(`${duongDan}: không cuộn ngang toàn trang ở 360px, chuông thông báo nằm trong màn hình`, async ({
      page,
    }) => {
      await page.setViewportSize(HEP);
      await page.goto(duongDan);
      await choNoiDung(page);

      const doDac = await page.evaluate(() => {
        const chuong = document.querySelector('button[aria-label="Thông báo"]');
        return {
          rongNoiDung: document.documentElement.scrollWidth,
          mepPhaiChuong: chuong ? chuong.getBoundingClientRect().right : null,
        };
      });
      expect(
        doDac.rongNoiDung,
        "Trang rộng hơn màn hình → cuộn ngang cả trang",
      ).toBeLessThanOrEqual(HEP.width + 1);
      if (doDac.mepPhaiChuong !== null) {
        expect(doDac.mepPhaiChuong).toBeLessThanOrEqual(HEP.width);
      }
    });
  }

  test("tiêu đề hub dài co lại kèm dấu … thay vì bị xén cụt", async ({ page }) => {
    await page.setViewportSize(HEP);
    await page.goto("/site");
    const tieuDe = page.locator("header h1 span.truncate").first();
    await expect(tieuDe).toBeVisible({ timeout: 15_000 });
    const kq = await tieuDe.evaluate((el) => ({
      tran: el.scrollWidth > el.clientWidth,
      textOverflow: getComputedStyle(el).textOverflow,
      rong: el.clientWidth,
    }));
    expect(kq.rong).toBeGreaterThan(40);
    if (kq.tran) expect(kq.textOverflow).toBe("ellipsis");
  });
});

test.describe("Khung layout — mọi viewport", () => {
  test("thanh hành động cố định dưới đáy không che nội dung cuối trang", async ({ page }) => {
    await page.goto("/boq");
    await choNoiDung(page);
    const thanh = page.locator(".app-bottombar");
    await expect(thanh).toBeVisible();

    const kq = await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 150));
      const bar = document.querySelector(".app-bottombar")!.getBoundingClientRect();
      const footer = document.querySelector("footer")!.getBoundingClientRect();
      return { dinhThanh: bar.top, dayFooter: footer.bottom };
    });
    expect(
      kq.dayFooter,
      "Cuộn hết trang mà footer vẫn nằm dưới thanh cố định → nội dung cuối bị che",
    ).toBeLessThanOrEqual(kq.dinhThanh + 1);
  });

  test("viền focus bàn phím ở theme sáng đủ tương phản (emerald-700, không phải -400)", async ({
    page,
  }) => {
    await page.goto("/boq");
    await choNoiDung(page);
    // Một lần Tab để trình duyệt coi phiên là "điều hướng bàn phím" (:focus-visible), rồi
    // đặt focus vào nút chuông — nút không tự ghi đè outline nên mang đúng viền toàn cục.
    await page.keyboard.press("Tab");
    const chuong = page.locator('button[aria-label="Thông báo"]');
    await chuong.focus();
    // poll: lớp `transition` của Tailwind v4 có animate cả outline-color (~150ms) — đọc ngay
    // sau khi focus sẽ ra màu giữa chừng chuyển tiếp.
    await expect
      .poll(() => chuong.evaluate((el) => getComputedStyle(el).outlineColor))
      .toBe("rgb(4, 120, 87)");
  });

  test("đóng modal (Escape) trả focus về nút đã mở nó", async ({ page }) => {
    await page.goto("/boq");
    const nutMo = page.getByRole("button", { name: "Thêm dòng BOQ" });
    await expect(nutMo).toBeVisible({ timeout: 15_000 });
    await nutMo.click();
    await expect(page.getByRole("heading", { name: "Thêm dòng BOQ" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Thêm dòng BOQ" })).not.toBeVisible();
    await expect(nutMo).toBeFocused();
  });

  test("hàng tab của hub đổi được bằng phím mũi tên (WAI-ARIA tabs)", async ({ page }) => {
    await page.goto("/site");
    const tabs = page.getByRole("tablist", { name: "Các phân hệ nghiệp vụ" }).getByRole("tab");
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });
    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toBeFocused();
  });

  test("tôn trọng prefers-reduced-motion: animation/transition gần như tắt", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/boq");
    await choNoiDung(page);
    const thoiLuong = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "animate-pulse transition";
      document.body.appendChild(el);
      const cs = getComputedStyle(el);
      const kq = { animation: cs.animationDuration, transition: cs.transitionDuration };
      el.remove();
      return kq;
    });
    expect(parseFloat(thoiLuong.animation)).toBeLessThan(0.001);
    expect(parseFloat(thoiLuong.transition)).toBeLessThan(0.001);
  });
});
