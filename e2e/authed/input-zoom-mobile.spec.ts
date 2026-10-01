import { test, expect } from "@playwright/test";

// Cỡ chữ ô nhập trên MOBILE — iOS Safari tự phóng to trang khi focus vào input có
// font-size < 16px, đẩy layout lệch và người dùng phải tự thu lại. Đây là bối cảnh thật của
// XBoss: đa số người dùng vào bằng điện thoại tại công trường.
//
// Nợ kỹ thuật đợt audit 2026-09-05 ghi "nghi ngờ, cần đo thật trên thiết bị" — spec này
// CHÍNH LÀ phép đo đó, chạy trong project `authed-mobile` (Pixel 5) của playwright.config.
// Đo `font-size` sau khi trình duyệt tính (getComputedStyle), không đọc class Tailwind.
//
// Chỉ đo ô người dùng thật sự GÕ (text/search/number/email/password/tel/date/textarea) và
// ô chọn <select> (iOS cũng phóng to khi chạm vào select dưới 16px); checkbox/radio/nút
// không kích hoạt bàn phím ảo hay bộ chọn nên không liên quan.
//
// Audit layout 2026-10-01 thêm "/", "/gantt", "/schedule", "/ban-ve", "/engineering", "/report",
// "/payments", "/materials/import": component dùng chung ui/Select, GlobalSearch,
// SystemFilter, SCurveChart, ô tìm bản vẽ, ô tìm EngineeringNav và vài ô chọn lẻ từng ở
// 12–14px. "/users" đã có trong danh sách — ô chọn vai trò 12px lộ ra khi đo thêm <select>.

const TRANG = [
  "/boq",
  "/hse",
  "/my-tasks",
  "/materials",
  "/diary",
  "/admin",
  "/contracts",
  "/procurement",
  "/quality",
  "/users",
  "/",
  "/gantt",
  "/schedule",
  "/ban-ve",
  "/engineering",
  "/report",
  "/payments",
  "/materials/import",
  // Trang nhiều form nhất theo quét tĩnh (đợt chuyển sang quy tắc toàn cục globals.css):
  "/handover",
  "/environment",
  "/warranty",
  "/monitoring",
  "/kickoff",
  "/finance",
  "/personnel",
  "/insurance",
  "/correspondences",
];

test.describe("Cỡ chữ ô nhập trên điện thoại (chống iOS auto-zoom)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Chỉ chạy trên project mobile dùng chromium",
  );

  for (const duongDan of TRANG) {
    test(`${duongDan}: mọi ô nhập có font-size ≥ 16px`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "Chỉ áp cho viewport điện thoại");
      await page.goto(duongDan, { waitUntil: "networkidle" });
      // Chờ trang render xong phần khung (skeleton biến mất) rồi mới đo — không chờ
      // <header> vì vài trang bọc khung theo cách khác.
      await expect(page.locator("main, header").first()).toBeVisible({ timeout: 15_000 });

      const nhoHon16 = await page.evaluate(() => {
        const LOAI = [
          "text",
          "search",
          "number",
          "email",
          "password",
          "tel",
          "date",
          "datetime-local",
          "time",
        ];
        const els = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            "input, textarea, select",
          ),
        ).filter((el) => {
          if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
          return LOAI.includes((el as HTMLInputElement).type);
        });
        return els
          .map((el) => ({
            co: parseFloat(getComputedStyle(el).fontSize),
            mo: el.offsetParent !== null,
            nhan:
              el.getAttribute("placeholder") ??
              el.getAttribute("name") ??
              el.className.slice(0, 60),
          }))
          .filter((x) => x.mo && x.co < 16);
      });

      expect(
        nhoHon16,
        `Ô nhập dưới 16px sẽ khiến iOS Safari tự phóng to khi gõ: ${JSON.stringify(nhoHon16, null, 2)}`,
      ).toEqual([]);
    });
  }

  // Ô trong modal không hiện lúc tải trang nên các ca trên không thấy — đây là chỗ phần lớn
  // trong 444 ô < 16px nằm trước khi có quy tắc toàn cục (globals.css, dưới breakpoint sm).
  test("ô trong modal (thêm dòng BOQ) có font-size ≥ 16px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Chỉ áp cho viewport điện thoại");
    await page.goto("/boq");
    await page.getByRole("button", { name: "Thêm dòng BOQ" }).click();
    const hop = page.getByRole("dialog");
    await expect(hop.getByRole("heading", { name: "Thêm dòng BOQ" })).toBeVisible({
      timeout: 15_000,
    });
    const coChu = await hop.evaluate((d) =>
      Array.from(d.querySelectorAll<HTMLElement>("input, select, textarea"))
        .filter(
          (el) => !["checkbox", "radio", "file", "hidden"].includes(el.getAttribute("type") ?? ""),
        )
        .filter((el) => el.offsetParent !== null)
        .map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
    expect(coChu.length).toBeGreaterThan(0);
    expect(coChu.filter((c) => c < 16)).toEqual([]);
  });
});
