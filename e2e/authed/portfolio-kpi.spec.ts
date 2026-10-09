import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dangNhapCoLap, dungTaskTienDo, dungToChucCoLap } from "../helpers/co-lap";

// QUALITY-FINAL-1 S15 — A4-AC05 lớp B: KPI "Tiến độ theo công việc" trên /portfolio hiển thị đúng
// khi số liệu là của MỘT tổ chức riêng (không lẫn dự án seed/spec khác). Mỗi test tạo tổ chức +
// người dùng riêng thẳng vào DB test (e2e/helpers/co-lap.ts) rồi đăng nhập bằng UI, nên KPI (cộng
// gộp theo tổ chức của người đăng nhập) là số tuyệt đối đoán trước được.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 90_000 });

test.describe("Portfolio KPI tiến độ theo công việc (A4-AC05, cô lập tổ chức)", () => {
  test("A4-AC05: 1 task 100% + 9 task 0% hiện 10% (không phải 50%); thêm dự án rỗng không đổi", async ({
    page,
  }) => {
    const co = await dungToChucCoLap(["admin"], 2);
    // Dự án 1: 1 task xong + 9 task chưa làm; dự án 2 rỗng (không task) — không được kéo
    // mẫu số/ trung bình theo dự án (TB 2 dự án sẽ ra 50%).
    await dungTaskTienDo(co.duAn[0], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await dangNhapCoLap(page, co.nguoi.admin.email);

    await page.goto("/portfolio");
    const main = page.locator("main");
    await expect(main.getByText("Tiến độ theo công việc", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(main.getByText("Số dự án", { exact: true })).toBeVisible();

    // KPI tile: đúng "10%" + chú thích 10 việc; KHÔNG có "50%" ở bất kỳ đâu.
    await expect(main.getByText("10%", { exact: true })).toBeVisible();
    await expect(main.getByText("10 việc", { exact: true })).toBeVisible();
    await expect(main.getByText("50%")).toHaveCount(0);
    // Số dự án = 2 (cả dự án rỗng), nhưng tiến độ vẫn 10%.
    await expect(main.locator("p").filter({ hasText: /^2$/ }).first()).toBeVisible();
    // Thẻ dự án 1: 10% tiến độ; không có NaN ở đâu.
    await expect(main.getByText("10% tiến độ")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");
  });

  test("A4-AC05: tổ chức chỉ có dự án rỗng → 'Chưa có dữ liệu', không NaN/100%", async ({
    page,
  }) => {
    const co = await dungToChucCoLap(["admin"], 1);
    await dangNhapCoLap(page, co.nguoi.admin.email);

    await page.goto("/portfolio");
    const main = page.locator("main");
    await expect(main.getByText("Tiến độ theo công việc", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(main.getByText("Chưa có dữ liệu", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("NaN");
    await expect(main.getByText("100%")).toHaveCount(0);
    // Không có chú thích "N việc" (không có mẫu số).
    await expect(main.getByText(/^\d+ việc/)).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
