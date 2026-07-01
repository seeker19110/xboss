import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Quản trị (/admin) — audit a11y §4 (P3, Admin-only). Ba tab: Phân công / Lịch sử / Traffic.
// Seed tạo 5 sheet + nhóm + task nên tab Phân công render đủ; Lịch sử/Traffic hiện trạng thái rỗng
// (vẫn có header bảng để quét). Quét axe cả 3 tab (Phân công mở rộng để lộ nhóm + task).

async function gotoAdmin(page: Page) {
  await page.goto("/admin");
  // Tab "Phân công" mặc định: đoạn hướng dẫn render khi trang đã dựng (qua auth admin).
  await expect(page.getByText(/Gán người quản lý cho/)).toBeVisible({ timeout: 15_000 });
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.describe("Quản trị (sau đăng nhập)", () => {
  test("render nội dung chính", async ({ page }) => {
    await gotoAdmin(page);
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }, testInfo) => {
    await gotoAdmin(page);

    // Tab "Phân công": mở rộng tất cả → lộ hàng nhóm + task (badge kế thừa/thủ công, select gán).
    // Nút "Mở rộng tất cả" nằm trong <main> → reachable ở cả desktop lẫn mobile.
    await page.getByRole("button", { name: "Mở rộng tất cả" }).click();
    const violations = await seriousViolations(page);

    // Tab "Lịch sử"/"Traffic" nằm trong AppHeader — trên mobile header tràn ngang (1 hàng flex)
    // nên tab bị đẩy ngoài viewport, không click được. Nội dung 2 tab này (bảng, class cố định)
    // độc lập viewport → chỉ cần phủ axe trên desktop; assign-tab đã phủ cả 2 kích thước.
    if (!testInfo.project.name.includes("mobile")) {
      await page.getByRole("button", { name: "Lịch sử" }).click();
      await expect(page.getByText(/bản ghi/)).toBeVisible({ timeout: 10_000 });
      violations.push(...(await seriousViolations(page)));

      await page.getByRole("button", { name: "Traffic" }).click();
      await expect(page.getByText(/request gần nhất/)).toBeVisible({ timeout: 10_000 });
      violations.push(...(await seriousViolations(page)));
    }

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
