import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ serviceWorkers: "block" });

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

for (const initialTitle of [undefined, "Cài đặt theo dõi đã tùy chỉnh"]) {
  test(`tiêu đề dialog ${initialTitle ? "tùy chỉnh" : "mặc định"} không gồm control sửa nhãn`, async ({
    page,
  }) => {
    const key = "tracking.settings.title";
    const defaultTitle = "Cài đặt trang tracking";
    const savedTitle = initialTitle ?? defaultTitle;
    const nextTitle = "Cài đặt theo dõi sau khi lưu";
    const loadingTexts = deferred();
    const savingText = deferred();
    let texts: Record<string, string> = initialTitle ? { [key]: initialTitle } : {};
    let patches = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // Chặn mọi mutation, kể cả presence/offline context chạy nền: test không ghi DB.
    await page.route("**/api/**", async (route) => {
      if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.continue();
      return route.fulfill({
        status: 500,
        json: { error: "Không ghi dữ liệu trong ca tên dialog" },
      });
    });
    await page.route("**/api/ui-texts", async (route) => {
      if (route.request().method() === "GET") {
        await loadingTexts.promise;
        return route.fulfill({ json: { texts } });
      }
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ key, value: nextTitle });
      patches++;
      if (patches === 1) {
        await savingText.promise;
        return route.fulfill({ status: 403, json: { error: "Chưa được phép lưu nhãn thử" } });
      }
      texts = { [key]: nextTitle };
      return route.fulfill({ json: { ok: true, texts } });
    });

    try {
      await page.goto("/tracking/ogtd");
      await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
      const trigger = page.getByRole("button", { name: "Đổi tên / đường dẫn trang", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog").filter({ has: page.locator("#sheet-name") });
      const heading = dialog.getByRole("heading", { level: 3 });
      await expect(dialog).toHaveAccessibleName(defaultTitle);
      await expect(heading).toHaveAccessibleName(defaultTitle);

      // Admin và override đến sau khi dialog mở: tên vẫn chỉ gồm tiêu đề đã lưu.
      loadingTexts.release();
      const pencil = heading.getByRole("button", { name: "Sửa text (Admin)", exact: true });
      await expect(pencil).toBeVisible();
      await expect(dialog).toHaveAccessibleName(savedTitle);
      await expect(heading).toHaveAccessibleName(savedTitle);
      await pencil.click();
      const editor = heading.getByRole("textbox", { name: "Nội dung nhãn", exact: true });
      await editor.fill(nextTitle);
      await expect(dialog).toHaveAccessibleName(savedTitle);
      await expect(heading).toHaveAccessibleName(savedTitle);
      const save = heading.getByRole("button", { name: "Lưu", exact: true });
      await save.click();
      await expect.poll(() => patches).toBe(1);
      await expect(save).toBeDisabled();
      await expect(dialog).toHaveAccessibleName(savedTitle);
      await expect(heading).toHaveAccessibleName(savedTitle);

      savingText.release();
      await expect(heading.getByRole("alert")).toHaveText("Chưa được phép lưu nhãn thử");
      await expect(editor).toHaveValue(nextTitle);
      await expect(save).toBeEnabled();
      await expect(save).toHaveCSS("opacity", "1");
      await expect(dialog).toHaveAccessibleName(savedTitle);
      await expect(heading).toHaveAccessibleName(savedTitle);
      const axe = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        axe.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
      ).toEqual([]);

      await save.click();
      await expect(editor).toHaveCount(0);
      await expect(dialog).toHaveAccessibleName(nextTitle);
      await expect(heading).toHaveAccessibleName(nextTitle);
      await expect(pencil).toBeFocused();
      await pencil.click();
      await editor.fill("Bản nhập chưa lưu không đổi tên dialog");
      await editor.press("Escape");
      await expect(pencil).toBeFocused();
      await expect(dialog).toHaveAccessibleName(nextTitle);
      await expect(heading).toHaveAccessibleName(nextTitle);
      await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(patches).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      loadingTexts.release();
      savingText.release();
    }
  });
}
