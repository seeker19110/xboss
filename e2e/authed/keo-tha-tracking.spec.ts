import { test, expect, type Page, type Locator } from "@playwright/test";

// M135 — kéo thả sắp xếp nhóm (tầng) và task trên lưới tracking, qua trình duyệt thật.
// Dựng sheet riêng qua API (không đụng thứ tự sheet seed mà spec khác đang đọc), kéo bằng chuột
// thật trên tay nắm, rồi đối chiếu thứ tự ĐÃ LƯU qua GET /api/tasks.

type Pkg = { id: number; code: string; tasks: { id: number; code: string }[] };

async function api<T>(page: Page, url: string, method = "GET", body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
      return res.json();
    },
    { url, method, body },
  ) as Promise<T>;
}

async function dungSheet(page: Page) {
  const uid = Date.now().toString(36);
  const slug = `keo-tha-${uid}`;
  const { sheet } = await api<{ sheet: { id: number } }>(page, "/api/sheets", "POST", {
    name: `Kéo thả ${uid}`,
    code: `KT${uid}`,
    slug,
  });
  for (const code of ["N1", "N2", "N3"])
    await api(page, "/api/workpackages", "POST", {
      sheetTypeId: sheet.id,
      code,
      name: `Nhóm ${code}`,
    });
  const { packages } = await api<{ packages: Pkg[] }>(page, `/api/tasks?sheet=${slug}`);
  for (const code of ["T1", "T2", "T3"])
    await api(page, `/api/workpackages/${packages[0].id}/tasks`, "POST", {
      code,
      name: `Việc ${code}`,
    });
  // Cần ≥1 cột lưới để bảng task hiện ra (nhóm không có ô nào → "chưa có dữ liệu lưới").
  await api(page, `/api/workpackages/${packages[0].id}/dimensions/column`, "POST", { label: "C1" });
  return { sheetId: sheet.id, slug };
}

async function thuTuDaLuu(page: Page, slug: string) {
  const { packages } = await api<{ packages: Pkg[] }>(page, `/api/tasks?sheet=${slug}`);
  return {
    nhom: packages.map((p) => p.code),
    task: (packages.find((p) => p.code === "N1")?.tasks ?? []).map((t) => t.code),
  };
}

// Kéo bằng chuột qua nhiều bước (PointerSensor cần rê ≥ 5px mới kích hoạt).
// Lưới rộng hơn viewport (cuộn ngang) — cuộn tới tay nắm trước như người dùng thật.
async function keo(page: Page, tu: Locator, toi: Locator) {
  await toi.scrollIntoViewIfNeeded();
  await tu.scrollIntoViewIfNeeded();
  const a = (await tu.boundingBox())!;
  const b = (await toi.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 10, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 4, { steps: 12 });
  await page.mouse.up();
}

test.describe("Kéo thả sắp xếp lưới tracking (M135)", () => {
  test.skip(({ isMobile }) => isMobile, "Kéo bằng chuột — cảm ứng giữ 200ms do dnd-kit đảm nhiệm");

  test("kéo nhóm cuối lên đầu và task cuối lên đầu → thứ tự lưu đúng", async ({ page }) => {
    await page.goto("/");
    const { sheetId, slug } = await dungSheet(page);
    try {
      await page.goto(`/tracking/${slug}`);
      await expect(page.getByText("Nhóm N3")).toBeVisible({ timeout: 15_000 });

      const tayNamNhom = page.getByRole("button", { name: "Kéo để đổi vị trí nhóm" });
      // Chế độ chỉ xem: không có tay nắm (FR1).
      await expect(tayNamNhom).toHaveCount(0);
      await page.getByRole("button", { name: /bấm để mở khoá chỉnh sửa/ }).click();
      await expect(tayNamNhom).toHaveCount(3);

      await keo(page, tayNamNhom.nth(2), tayNamNhom.nth(0));
      await expect
        .poll(async () => (await thuTuDaLuu(page, slug)).nhom)
        .toEqual(["N3", "N1", "N2"]);

      // Task: mở nhóm N1 (giờ ở vị trí 2) rồi kéo T3 lên trên T1.
      await page.getByText("Nhóm N1").click();
      const t3 = page.getByRole("button", { name: "Kéo để đổi vị trí task T3" });
      const t1 = page.getByRole("button", { name: "Kéo để đổi vị trí task T1" });
      await expect(t3).toBeVisible({ timeout: 15_000 });
      await keo(page, t3, t1);
      await expect
        .poll(async () => (await thuTuDaLuu(page, slug)).task)
        .toEqual(["T3", "T1", "T2"]);

      // Đang lọc → tắt kéo nhóm (FR2).
      await page.getByPlaceholder(/Tìm/).first().fill("N1");
      await expect(tayNamNhom).toHaveCount(0);
    } finally {
      await api(page, `/api/sheets/${sheetId}`, "DELETE").catch(() => undefined);
    }
  });
});
