import { test, expect, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 500, json: { error: "Không ghi dữ liệu trong ca tải nhãn" } }),
  );
});

for (const failure of ["http", "network", "invalid"] as const) {
  test(`nhãn: GET đầu ${failure} không khóa cache, mở lại phục hồi override mà không PATCH`, async ({
    page,
  }) => {
    const title = "Cài đặt theo dõi đã phục hồi";
    let gets = 0;
    let patches = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/ui-texts", async (route) => {
      if (route.request().method() !== "GET") {
        patches++;
        return route.fulfill({ status: 500, json: { error: "Không ghi nhãn trong ca tải lại" } });
      }
      gets++;
      if (gets === 1) {
        if (failure === "network") return route.abort("connectionreset");
        if (failure === "invalid") return route.fulfill({ json: { texts: [] } });
        return route.fulfill({ status: 500, json: { error: "Tạm lỗi đọc nhãn thử" } });
      }
      return route.fulfill({ json: { texts: { "tracking.settings.title": title } } });
    });
    const predicate = (request: Request) => new URL(request.url()).pathname === "/api/ui-texts";
    const settled =
      failure === "network"
        ? page.waitForEvent("requestfailed", { predicate })
        : page.waitForEvent("requestfinished", { predicate });
    await page.goto("/tracking/ogtd");
    await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
    const trigger = page.getByRole("button", { name: "Đổi tên / đường dẫn trang", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog").filter({ has: page.locator("#sheet-name") });
    await settled;
    await expect(dialog).toHaveAccessibleName("Cài đặt trang tracking");
    // Thao tác người dùng sau response lỗi; lần mount kế tiếp phải thật sự tải lại.
    await dialog
      .getByRole("textbox", { name: "Tên trang", exact: true })
      .fill("Bản nhập kiểm tra không lưu");
    await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect.poll(() => gets, { message: "GET nhãn sau khi đóng rồi mở lại settings" }).toBe(2);
    await expect(dialog).toHaveAccessibleName(title);
    const heading = dialog.getByRole("heading", { level: 3 });
    await expect(heading).toHaveAccessibleName(title);
    const pencil = heading.getByRole("button", { name: "Sửa text (Admin)", exact: true });
    await expect(pencil).toBeVisible();
    await pencil.click();
    const editor = heading.getByRole("textbox", { name: "Nội dung nhãn", exact: true });
    await expect(editor).toHaveValue(title);
    if (page.viewportSize()!.width < 640) await expect(editor).toHaveCSS("font-size", "16px");
    expect((await editor.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(dialog).toHaveAccessibleName(title);
    if (failure === "http") {
      for (const light of [false, true]) {
        await page.evaluate(
          (theme) => {
            document.documentElement.classList.remove("light", "darkblue");
            document.documentElement.classList.add(theme);
          },
          light ? "light" : "darkblue",
        );
        await dialog.evaluate(async (element) => {
          element.getBoundingClientRect();
          await Promise.all(
            element
              .getAnimations({ subtree: true })
              .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        const axe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          axe.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
        ).toEqual([]);
      }
    }
    await editor.press("Escape");
    await expect(pencil).toBeFocused();
    await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
    await trigger.click();
    await expect(dialog).toHaveAccessibleName(title);
    expect(gets).toBe(2);
    expect(patches).toBe(0);
    expect(errors).toEqual([]);
  });
}
