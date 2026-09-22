import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang chủ "/" — chế độ Hiện trường cho thầu phụ/kỹ sư (M127, xem
// docs/nang-cap/M127-trang-chu-theo-vai-tro.md §8 AC1/AC2). Các project `authed-*` khác
// dùng chung `storageState` admin (project `setup`) — spec này cần đăng nhập bằng tài
// khoản demo `subcon`/`engineer` nên KHÔNG dùng storageState chung, tự đăng nhập qua form
// `/login` như `e2e/auth.setup.ts`. Hai tài khoản demo do `ensureDefaultUsers()`
// (lib/bao-mat/auth.ts) tự tạo khi gọi `/api/auth/login` lần đầu — không cần seed riêng.
test.use({ storageState: { cookies: [], origins: [] } });

const SUBCON = { email: "subcon@xboss.vn", pw: "sub123" };
const ENGINEER = { email: "engineer@xboss.vn", pw: "eng123" };

async function dangNhap(page: Page, email: string, pw: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(pw);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
}

function quetAxe(page: Page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
}

function kiemAxe(results: Awaited<ReturnType<typeof quetAxe>>) {
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("Trang chủ — chế độ Hiện trường (sau đăng nhập)", () => {
  test("thầu phụ: chỉ thấy Hiện trường, không gọi /api/dashboard, không axe nghiêm trọng", async ({
    page,
  }) => {
    // Viewport điện thoại: đây là bối cảnh chính của thầu phụ ngoài công trường (NFR2).
    await page.setViewportSize({ width: 390, height: 844 });

    await dangNhap(page, SUBCON.email, SUBCON.pw);

    // Gắn listener TRƯỚC khi mở lại "/" để bắt đúng các request khi trang Hiện trường
    // mount (fetch trong useEffect) — thầu phụ không có quyền `viewDashboard` nên không
    // được gọi /api/dashboard (AC1).
    const duongDanDaGoi: string[] = [];
    page.on("request", (req) => duongDanDaGoi.push(new URL(req.url()).pathname));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible({
      timeout: 15_000,
    });
    // Trang Hiện trường fetch xong (my-tasks/notifications/sheets/project) trước khi kiểm —
    // chờ Section "Việc hôm nay" (render sau khi loading=false) là đủ ổn định.
    await expect(page.getByText("Việc hôm nay", { exact: false })).toBeVisible();

    expect(duongDanDaGoi.some((p) => p.startsWith("/api/dashboard"))).toBe(false);

    // Thầu phụ không được chuyển chế độ → không có nút "Xem tổng quan".
    await expect(page.getByRole("button", { name: "Xem tổng quan" })).toHaveCount(0);

    kiemAxe(await quetAxe(page));
  });

  test("kỹ sư: chuyển Hiện trường ↔ Điều hành, giữ lựa chọn sau reload, axe cả 2 chế độ", async ({
    page,
  }) => {
    await dangNhap(page, ENGINEER.email, ENGINEER.pw);

    // Mặc định của kỹ sư (chưa từng chọn) là chế độ Hiện trường (FR1).
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Việc hôm nay", { exact: false })).toBeVisible();
    kiemAxe(await quetAxe(page));

    // Bấm "Xem tổng quan" → chuyển sang chế độ Điều hành.
    await page.getByRole("button", { name: "Xem tổng quan" }).click();
    await expect(page.getByRole("heading", { name: /Tổng quan dự án/ })).toBeVisible({
      timeout: 15_000,
    });
    // S-curve là panel lazy phụ thuộc dữ liệu sâu nhất (tab mặc định, mẫu dashboard.spec.ts)
    // → xuất hiện = hydrate + chunk + fetch xong, quét axe lúc này mới ổn định.
    await expect(page.getByRole("heading", { name: /S-curve/ })).toBeVisible({ timeout: 15_000 });

    // Reload vẫn giữ chế độ Điều hành (lựa chọn lưu localStorage — AC2).
    await page.reload();
    await expect(page.getByRole("heading", { name: /Tổng quan dự án/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: /S-curve/ })).toBeVisible({ timeout: 15_000 });
    kiemAxe(await quetAxe(page));

    // Bấm "Việc của tôi" → quay lại chế độ Hiện trường.
    await page.getByRole("button", { name: "Việc của tôi" }).click();
    await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible({
      timeout: 15_000,
    });
  });
});
