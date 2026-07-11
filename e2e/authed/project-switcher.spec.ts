import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ProjectSwitcher (app/components/ProjectSwitcher.tsx, M22 — đa dự án) — trigger đầu
// sidebar mở panel role="listbox" chọn dự án. Seed mẫu (scripts/seed-sample.ts) chỉ
// tạo đúng 1 dự án ("TT AVIO Tháp A", ≤ FILTER_THRESHOLD=7) nên panel KHÔNG hiện ô
// tìm kiếm và KHÔNG nhóm theo Đã ghim/Đang thi công/Đóng (showGroups cần >5 dự án).
// Test này KHÔNG bấm chọn dự án khác (chỉ có 1 dự án nên cũng không có lựa chọn khác)
// để tránh side-effect đổi cookie project rò sang test khác dùng chung storageState.

// M37 PR 2.4: sidebar desktop (#app-sidebar, luôn mount) và drawer mobile
// (#app-sidebar-mobile, mount có điều kiện khi mở) là 2 phần tử DOM khác nhau.
async function openSwitcher(page: Page, isMobile: boolean) {
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Mở menu" }).click();
  }
  const sidebar = page.locator(isMobile ? "#app-sidebar-mobile" : "#app-sidebar");
  await expect(sidebar).toBeVisible({ timeout: 15_000 });

  // exact: true — tránh khớp nhầm nút ghim "Ghim TT AVIO Tháp A" trong panel khi đang mở.
  const trigger = sidebar.getByRole("button", { name: "TT AVIO Tháp A", exact: true });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  return { sidebar, trigger };
}

test.describe("ProjectSwitcher — chọn dự án (sau đăng nhập)", () => {
  test("mở panel, thấy dự án hiện tại được đánh dấu + link Portfolio", async ({
    page,
    isMobile,
  }) => {
    const { sidebar } = await openSwitcher(page, isMobile);

    const listbox = sidebar.getByRole("listbox", { name: "Chọn dự án" });
    await expect(listbox).toBeVisible();

    const currentOption = listbox.getByRole("option", { name: /TT AVIO Tháp A/ });
    await expect(currentOption).toBeVisible();
    await expect(currentOption).toHaveAttribute("aria-selected", "true");
    await expect(currentOption.getByText("✓")).toBeVisible();

    // Link nằm ngoài role="listbox" (listbox chỉ chứa option/group theo ARIA) — tìm
    // trong sidebar thay vì trong listbox.
    await expect(sidebar.getByRole("link", { name: "Xem tất cả dự án (Portfolio)" })).toBeVisible();

    // Chỉ 1 dự án seed (≤ FILTER_THRESHOLD) — không hiện ô tìm kiếm.
    await expect(listbox.getByPlaceholder("Tìm dự án…")).toHaveCount(0);
  });

  test("đóng panel bằng phím Escape", async ({ page, isMobile }) => {
    const { sidebar, trigger } = await openSwitcher(page, isMobile);

    const listbox = sidebar.getByRole("listbox", { name: "Chọn dự án" });
    await expect(listbox).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(listbox).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("không có vi phạm a11y nghiêm trọng khi panel đang mở (axe)", async ({ page, isMobile }) => {
    await openSwitcher(page, isMobile);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
