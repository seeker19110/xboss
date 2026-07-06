import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Sổ rủi ro (/risks, M13) — heatmap 5×5 + bảng + form 1–5.
// DB seed mẫu không có rủi ro nào nên bảng render EmptyState; heatmap luôn hiện đủ 25 ô.

async function gotoRisks(page: Page) {
  await page.goto("/risks");
  await expect(page.getByRole("tablist", { name: "Lọc trạng thái rủi ro" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Sổ rủi ro (sau đăng nhập)", () => {
  test("render heatmap 5×5 + filter trạng thái + trạng thái rỗng", async ({ page }) => {
    await gotoRisks(page);
    await expect(page.getByText(/Ma trận rủi ro/)).toBeVisible();
    // Ô heatmap có aria-label "Xác suất P × ảnh hưởng I: n rủi ro" — đủ 25 ô.
    await expect(page.getByRole("button", { name: /Xác suất \d × ảnh hưởng \d/ })).toHaveCount(25);
    await expect(page.getByText("Chưa có rủi ro")).toBeVisible();
  });

  // Không bấm submit (không ghi dữ liệu thật) — DB test dùng chung giữa các project.
  test("Admin mở được modal rủi ro mới, chọn 1–5 hiện score", async ({ page }) => {
    await gotoRisks(page);
    await page.getByRole("button", { name: "Ghi nhận rủi ro" }).click();
    await expect(page.getByRole("heading", { name: "Rủi ro mới" })).toBeVisible();
    // Chọn xác suất 5 × ảnh hưởng 5 → score 25 hiển thị to.
    await page
      .getByRole("radiogroup", { name: "Xác suất xảy ra (1–5)" })
      .getByRole("radio", { name: "5" })
      .click();
    await page
      .getByRole("radiogroup", { name: "Mức ảnh hưởng (1–5)" })
      .getByRole("radio", { name: "5" })
      .click();
    await expect(page.getByText("Score = 5 × 5")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoRisks(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
