import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang /admin — phân công người phụ trách (theo hệ/nhóm/task) + lịch sử audit + traffic
// (chỉ Admin/PM). Mật độ ứng viên contrast cao thứ 2 theo docs/a11y/contrast-audit.md §4 (23 chỗ).

async function gotoAdmin(page: Page) {
  await page.goto("/admin");
  // Tab "Phân công" (mặc định) chỉ có ý nghĩa render sau khi danh sách sheet/user đã tải xong.
  await expect(page.getByRole("tab", { name: "Lịch sử" })).toBeVisible({ timeout: 15_000 });
}

test.describe("Quản trị (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoAdmin(page);
  });

  test("tab Phân công không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAdmin(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("tab Lịch sử không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAdmin(page);
    await page.getByRole("tab", { name: "Lịch sử" }).click();
    await expect(page.getByRole("tab", { name: "Lịch sử" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  // Khu "Hiển thị AppShell" (M21 PR3) — bật/tắt dashboard trong sidebar cho mọi người dùng.
  // Mặc định mọi mục đều BẬT (kể cả badge "Sắp có") — giữ đúng hành vi "bản đồ lộ trình sống"
  // đã có từ PR1; nav_settings chỉ dùng để admin TẮT bớt, không phải cơ chế bật dần roadmap.
  test("tab Hiển thị AppShell: tắt 1 mục → sidebar ẩn sau khi tải lại, bật lại → hiện lại", async ({
    page,
    isMobile,
  }) => {
    // nav_settings là state DB toàn cục (khác localStorage) — chạy đồng thời trên cả 2 project
    // (desktop+mobile cùng đổi 1 node_key) sẽ đua nhau; chỉ chạy 1 nơi (desktop) là đủ.
    test.skip(
      isMobile,
      "Mutate state DB toàn cục — chỉ cần kiểm 1 project để tránh đua với mobile.",
    );
    // Chọn "Chuyển đổi số & Công nghệ" (M31, đã có trang thật /tech) làm mục toggle —
    // KHÔNG dùng node nào được assert ở spec khác (vd appshell.spec.ts) vì nav_settings là
    // state DB toàn cục: chạy song song sẽ đua với test đọc sidebar ở file khác (đã gặp thật
    // với "Khởi động & Pháp lý" sau khi M23 biến nó thành link, rồi lại với "Bảo hành – Bảo
    // trì" sau khi M30 thêm nó vào checklist "đủ nhóm menu" của appshell.spec.ts mà không
    // biết node này đã bị admin.spec.ts dùng làm mục toggle — CI main #219 fail vì race y hệt
    // cảnh báo ở đây. "Chuyển đổi số & Công nghệ" không xuất hiện ở appshell.spec.ts lẫn
    // tech.spec.ts (tech.spec.ts chỉ đọc heading trên trang /tech, không đọc sidebar).
    await gotoAdmin(page);
    const sidebar = page.locator("#app-sidebar");
    await expect(sidebar.getByText("Chuyển đổi số & Công nghệ", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("tab", { name: "Hiển thị AppShell" }).click();
    const row = page.getByRole("switch", { name: /Chuyển đổi số & Công nghệ/ });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("aria-checked", "true");

    // Chờ đúng response PATCH ghi DB xong (aria-checked đổi ngay do cập nhật optimistic,
    // nhưng KHÔNG đảm bảo request đã tới server — reload quá sớm sẽ đọc lại giá trị cũ).
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/nav-settings") && r.request().method() === "PATCH",
      ),
      row.click(),
    ]);
    await expect(row).toHaveAttribute("aria-checked", "false");

    // AppHeader chỉ tải nav-settings 1 lần lúc mount (không live-sync trong cùng trang) —
    // tải lại trang để xác nhận đã ghi DB thật, không phải chỉ optimistic UI.
    await page.reload();
    await expect(sidebar.getByText("Chuyển đổi số & Công nghệ", { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Hiển thị AppShell" }).click();
    await expect(row).toHaveAttribute("aria-checked", "false");

    // Trả lại mặc định bật để không ảnh hưởng test khác dùng chung storageState.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/nav-settings") && r.request().method() === "PATCH",
      ),
      row.click(),
    ]);
    await expect(row).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(sidebar.getByText("Chuyển đổi số & Công nghệ", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("tab Hiển thị AppShell không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoAdmin(page);
    await page.getByRole("tab", { name: "Hiển thị AppShell" }).click();
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  // M48 PR1 — trang khung tích hợp. PR1 chưa đăng ký adapter thật nào → danh sách rỗng
  // (EmptyState). Không kiểm bật/tắt/đồng bộ vì không có adapter thật để tạo dữ liệu qua UI.
  test("trang /admin/integrations render EmptyState + không vi phạm a11y (axe)", async ({
    page,
  }) => {
    await page.goto("/admin/integrations");
    // AppHeader render title trong <span>, không phải heading — và nhãn trùng với
    // mục sidebar cùng tên, nên scope vào header để tránh strict-mode match nhầm
    // (bài học PR2.4, xem PROGRESS.md).
    await expect(
      page.locator("header").getByText("Tích hợp hệ ngoài", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    // Registry rỗng ở PR1 → hiện thông điệp EmptyState (trạng thái bình thường).
    await expect(page.getByText("Chưa có tích hợp nào", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
