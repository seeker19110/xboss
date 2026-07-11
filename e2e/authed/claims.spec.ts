import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Trang Claim chi phí & EOT (/claims, M34) — Admin/PM/Kỹ sư/BCH (nhạy cảm thương mại).
// Seed mẫu chưa có claim nào nên trang hiện EmptyState — vẫn đủ để phủ layout + a11y.

async function gotoClaims(page: Page) {
  await page.goto("/claims");
  await expect(
    page.locator("header").getByText("Claim chi phí & EOT", { exact: false }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Claim chi phí & EOT (sau đăng nhập)", () => {
  test("render nội dung chính + 2 thẻ KPI theo loại", async ({ page }) => {
    await gotoClaims(page);
    await expect(page.getByText("Claim chi phí đang mở", { exact: false })).toBeVisible();
    await expect(page.getByText("Claim EOT đang mở", { exact: false })).toBeVisible();
  });

  test("toggle lọc theo loại claim (Tất cả/Chi phí/EOT)", async ({ page }) => {
    await gotoClaims(page);
    const group = page.getByRole("group", { name: "Lọc theo loại claim" });
    await expect(group.getByRole("button", { name: "Tất cả" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await group.getByRole("button", { name: "Chi phí" }).click();
    await expect(group.getByRole("button", { name: "Chi phí" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await group.getByRole("button", { name: "EOT" }).click();
    await expect(group.getByRole("button", { name: "EOT" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("mở modal thêm claim, chuyển loại cost/eot", async ({ page }) => {
    await gotoClaims(page);
    await page.getByRole("button", { name: "Thêm claim" }).click();
    await expect(page.getByRole("heading", { name: "Thêm claim" })).toBeVisible();
    const kindGroup = page.getByRole("group", { name: "Chọn loại claim" });
    await kindGroup.getByRole("button", { name: "Gia hạn (EOT)" }).click();
    await expect(page.getByText("Số ngày đề xuất", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("không có vi phạm a11y nghiêm trọng (axe)", async ({ page }) => {
    await gotoClaims(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
