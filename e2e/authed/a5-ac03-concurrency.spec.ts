import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { dangNhapCoLap, goiApi } from "../helpers/co-lap";
import {
  docTrangThaiA5,
  dongThoiDuoiKhoa,
  dungFixtureA5,
  type FixtureA5,
  type KetQuaHttpA5,
  type TaskA5,
  type TrangThaiA5,
} from "../helpers/a5-approval-fixtures";

// A5-AC03 lớp B: cookie thật, production HTTP/PostgreSQL thật, không route mocks.
// Dữ liệu thuộc org mới mỗi ca; không xóa audit/seed dùng chung để dọn fixture.
type PhienA5 = { f: FixtureA5; pages: [Page, Page] };

function optionsPhienThuHai(info: TestInfo): BrowserContextOptions {
  const use = info.project.use;
  const options: BrowserContextOptions = { ...use.contextOptions };
  // Giữ thiết bị/viewport/context options của project; không spread các tuỳ chọn test runner.
  for (const key of [
    "acceptDownloads",
    "baseURL",
    "colorScheme",
    "deviceScaleFactor",
    "forcedColors",
    "hasTouch",
    "httpCredentials",
    "ignoreHTTPSErrors",
    "isMobile",
    "javaScriptEnabled",
    "locale",
    "offline",
    "permissions",
    "proxy",
    "reducedMotion",
    "serviceWorkers",
    "timezoneId",
    "userAgent",
    "viewport",
  ] as const) {
    if (use[key] !== undefined) Object.assign(options, { [key]: use[key] });
  }
  return { ...options, storageState: { cookies: [], origins: [] } };
}

const test = base.extend<{ phien: PhienA5 }>({
  phien: async ({ browser, context, page }, runTest, info) => {
    const f = await dungFixtureA5();
    let other: BrowserContext | undefined;
    try {
      other = await browser.newContext(optionsPhienThuHai(info));
      const second = await other.newPage();
      const pages: [Page, Page] = [page, second];
      await Promise.all(pages.map((p, i) => dangNhapCoLap(p, f.pm[i].email)));
      for (let i = 0; i < pages.length; i++) {
        const me = await goiApi(pages[i], "GET", "/api/auth/me");
        expect(me.status).toBe(200);
        expect(me.body?.user).toMatchObject({ id: f.pm[i].id, orgId: f.orgId, role: "pm" });
      }
      expect(f.pm[0].id).not.toBe(f.pm[1].id);
      expect(second.viewportSize()).toEqual(page.viewportSize());
      await runTest({ f, pages });
    } finally {
      try {
        await other?.close();
      } finally {
        try {
          await context.close();
        } finally {
          await f.pool.end();
        }
      }
    }
  },
});

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

const taskRow = (page: Page, task: TaskA5) => page.getByRole("row").filter({ hasText: task.name });
const history = (state: TrangThaiA5, task: TaskA5) =>
  state.history.filter((row) => row.taskId === task.id);

async function moLuoi(page: Page, f: FixtureA5) {
  await page.goto(`/tracking/${f.slug}`);
  await expect(page.getByRole("button", { name: /In PDF/ })).toBeVisible();
  await page.getByText(f.groupName, { exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Công việc", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Chỉ xem — bấm để mở khoá chỉnh sửa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đang sửa — bấm để khoá lại", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}

async function tickHet(page: Page, f: FixtureA5) {
  const ids = f.tasks.flatMap((task) => task.dimIds);
  const r = await goiApi(page, "PATCH", "/api/dimensions/batch", { ids, installed: true });
  expect(r).toEqual({ status: 200, body: { ok: true, updated: ids.length, installed: true } });
}

async function moXacNhanTang(page: Page) {
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: /Chờ nghiệm thu/ })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt nghiệm thu", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Duyệt nghiệm thu tầng");
  return dialog.getByRole("button", { name: "Duyệt nghiệm thu", exact: true });
}

async function bamVaDoc(
  page: Page,
  method: string,
  path: string,
  button: Locator,
): Promise<KetQuaHttpA5> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === path && r.request().method() === method,
    ),
    button.click(),
  ]);
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function bangChungKhoa(info: TestInfo, race: Awaited<ReturnType<typeof dongThoiDuoiKhoa>>) {
  expect(new Set(race.barrier.waiters.map((w) => w.pid)).size).toBeGreaterThanOrEqual(2);
  const proof = JSON.stringify(race.barrier);
  const proofPath = info.outputPath("a5-postgres-overlap.json");
  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${proof}\n`, "utf8");
  console.log("[A5-AC03 PG overlap]", proof);
  await info.attach("A5-AC03 PostgreSQL overlap", {
    path: proofPath,
    contentType: "application/json",
  });
}

async function kiemLuoi(page: Page, f: FixtureA5, checked: number[], approved: boolean[]) {
  await moLuoi(page, f);
  for (let i = 0; i < f.tasks.length; i++) {
    const row = taskRow(page, f.tasks[i]);
    const cells = row.getByRole("checkbox");
    await expect(cells).toHaveCount(6);
    await expect(row.locator('input[type="checkbox"]:checked')).toHaveCount(checked[i]);
    await expect(row.getByText(`${checked[i] === 6 ? 100 : 0}%`, { exact: true })).toBeVisible();
    if (approved[i]) await expect(row.getByText("✓ Đã NT", { exact: true })).toBeVisible();
    else await expect(row.getByText("✓ Đã NT", { exact: true })).toHaveCount(0);
  }
}

test("A5-AC03: hai PM duyệt tầng đồng thời — 200+409, một hiệu ứng và UI hội tụ", async ({
  phien: { f, pages },
}, info) => {
  await tickHet(pages[0], f);
  const buttons = await Promise.all(pages.map((page) => moXacNhanTang(page)));
  const race = await dongThoiDuoiKhoa(
    f,
    [
      () => bamVaDoc(pages[0], "POST", "/api/approvals", buttons[0]),
      () => bamVaDoc(pages[1], "POST", "/api/approvals", buttons[1]),
    ],
    f.tasks[0].id,
  );
  await bangChungKhoa(info, race);
  expect(race.responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const loser = race.responses[0].status === 409 ? pages[0] : pages[1];
  await expect(loser.getByRole("dialog")).toContainText(/Tầng này.*nghiệm thu/);
  await loser.getByRole("dialog").getByRole("button", { name: "OK", exact: true }).click();

  const state = await docTrangThaiA5(f);
  const winner = race.responses[0].status === 200 ? f.pm[0] : f.pm[1];
  expect(state.floors).toEqual([{ id: expect.any(Number), approved: true, approvedBy: winner.id }]);
  for (const task of f.tasks) {
    expect(state.tasks.find((t) => t.id === task.id)).toEqual({
      id: task.id,
      progress: 1,
      status: "nghiem_thu",
      source: "floor",
    });
    const inspections = history(state, task).filter((h) => h.status === "nghiem_thu");
    expect(inspections).toHaveLength(1);
    expect(inspections[0]).toMatchObject({
      oldProgress: 1,
      newProgress: 1,
      changedBy: winner.name,
    });
    expect(history(state, task)).toHaveLength(2);
  }
  expect(state.dims.every((d) => d.installed === 1)).toBe(true);
  for (const page of pages) {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Đã nghiệm thu (1 tầng · hệ)", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Huỷ NT", exact: true })).toHaveCount(1);
    const listing = await goiApi(page, "GET", "/api/approvals");
    expect(listing.status).toBe(200);
    expect(listing.body?.pending).toEqual([]);
    expect(listing.body?.approved).toEqual([
      expect.objectContaining({
        sheetTypeId: f.sheetTypeId,
        floorLabel: f.floorLabel,
        approvalId: state.floors[0].id,
      }),
    ]);
  }
});

test("A5-AC03: batch chồng ô không lost update; replay bằng UI không nhân progress/history", async ({
  phien: { f, pages },
}, info) => {
  const task = f.tasks[0];
  await Promise.all(pages.map((page) => moLuoi(page, f)));
  const race = await dongThoiDuoiKhoa(
    f,
    [
      () =>
        goiApi(pages[0], "PATCH", "/api/dimensions/batch", {
          ids: task.dimIds.slice(0, 4),
          installed: true,
        }),
      () =>
        goiApi(pages[1], "PATCH", "/api/dimensions/batch", {
          ids: task.dimIds.slice(2, 6),
          installed: true,
        }),
    ],
    task.id,
  );
  await bangChungKhoa(info, race);
  expect(race.responses).toEqual([
    { status: 200, body: { ok: true, updated: 4, installed: true } },
    { status: 200, body: { ok: true, updated: 4, installed: true } },
  ]);
  const beforeReplay = await docTrangThaiA5(f);
  expect(beforeReplay.tasks).toEqual([
    { id: task.id, progress: 1, status: "hoan_thanh", source: null },
    { id: f.tasks[1].id, progress: 0, status: "chuan_bi", source: null },
  ]);
  expect(beforeReplay.dims.filter((d) => d.taskId === task.id).map((d) => d.installed)).toEqual([
    1, 1, 1, 1, 1, 1,
  ]);
  expect(
    beforeReplay.dims.filter((d) => d.taskId === f.tasks[1].id).every((d) => d.installed === 0),
  ).toBe(true);
  const h = history(beforeReplay, task);
  expect(h.map((row) => [row.oldProgress, row.newProgress, row.status])).toEqual([
    [0, 0.67, "dang_thi_cong"],
    [0.67, 1, "hoan_thanh"],
  ]);
  expect(new Set(h.map((row) => row.changedBy))).toEqual(new Set(f.pm.map((pm) => pm.name)));
  expect(history(beforeReplay, f.tasks[1])).toEqual([]);
  expect(beforeReplay.floors).toEqual([]);

  await kiemLuoi(pages[0], f, [6, 0], [false, false]);
  const replay = await bamVaDoc(
    pages[0],
    "PATCH",
    "/api/dimensions/batch",
    taskRow(pages[0], task).getByRole("button", { name: "Tất cả", exact: true }),
  );
  expect(replay).toEqual({ status: 200, body: { ok: true, updated: 6, installed: true } });
  // M120 cố ý đóng dấu installed_at/by lại khi tick online; oracle chỉ chứa effect AC03.
  expect(await docTrangThaiA5(f)).toEqual(beforeReplay);
  for (const page of pages) await kiemLuoi(page, f, [6, 0], [false, false]);
  const apiHistory = await goiApi(pages[0], "GET", `/api/tasks/${task.id}/history`);
  expect(apiHistory.status).toBe(200);
  const rows = apiHistory.body?.history as { id: number }[];
  // API hiển thị theo changed_at (NOW của transaction), khác thứ tự commit khi có race.
  expect(rows.slice().sort((a, b) => a.id - b.id)).toEqual(
    h.map((row) => ({
      id: row.id,
      oldProgress: row.oldProgress,
      newProgress: row.newProgress,
      status: row.status,
      note: row.note,
      changedBy: row.changedBy,
      changedAt: expect.any(String),
    })),
  );
});

for (const { firstIndex, label, expectedStatuses } of [
  { firstIndex: 0, label: "duyệt chờ trước", expectedStatuses: [200, 409] },
  { firstIndex: 1, label: "bỏ tick chờ trước", expectedStatuses: [422, 200] },
] as const) {
  test(`A5-AC03: ${label} — duyệt tầng cùng bỏ tick batch giữ invariant 100%`, async ({
    phien: { f, pages },
  }, info) => {
    await tickHet(pages[0], f);
    const approve = await moXacNhanTang(pages[0]);
    await moLuoi(pages[1], f);
    const untick = taskRow(pages[1], f.tasks[0]).getByRole("button", { name: "Bỏ", exact: true });
    await expect(untick).toBeVisible();
    const race = await dongThoiDuoiKhoa(
      f,
      [
        () => bamVaDoc(pages[0], "POST", "/api/approvals", approve),
        async () => {
          const response = await bamVaDoc(pages[1], "PATCH", "/api/dimensions/batch", untick);
          if (response.status === 409) {
            await expect(
              pages[1].getByRole("status").filter({ hasText: "Task đã nghiệm thu" }),
            ).toBeVisible();
          }
          return response;
        },
      ],
      f.tasks[0].id,
      firstIndex,
    );
    await bangChungKhoa(info, race);
    expect(race.barrier.firstIndex).toBe(firstIndex);
    expect(race.barrier.firstWaiters).toHaveLength(1);
    expect(race.barrier.lockedTaskId).toBe(f.tasks[0].id);
    expect(race.barrier.orderedChain.length).toBeGreaterThanOrEqual(2);
    expect(race.barrier.orderedChain.at(-1)).toBe(race.barrier.firstWaiters[0].pid);
    expect(race.barrier.orderedChain[0]).not.toBe(race.barrier.firstWaiters[0].pid);
    const statuses = race.responses.map((r) => r.status);
    expect(statuses).toEqual(expectedStatuses);
    expect(statuses.every((status) => status < 500)).toBe(true);
    const state = await docTrangThaiA5(f);
    expect(state.tasks.every((t) => t.status !== "nghiem_thu" || t.progress === 1)).toBe(true);
    if (statuses[0] === 200) {
      expect(state.floors).toEqual([
        { id: expect.any(Number), approved: true, approvedBy: f.pm[0].id },
      ]);
      expect(state.dims.every((d) => d.installed === 1)).toBe(true);
      for (const task of f.tasks) {
        expect(state.tasks.find((t) => t.id === task.id)).toEqual({
          id: task.id,
          progress: 1,
          status: "nghiem_thu",
          source: "floor",
        });
        expect(history(state, task).map((h) => [h.oldProgress, h.newProgress, h.status])).toEqual([
          [0, 1, "hoan_thanh"],
          [1, 1, "nghiem_thu"],
        ]);
      }
      await kiemLuoi(pages[1], f, [6, 6], [true, true]);
    } else {
      await expect(pages[0].getByRole("dialog")).toContainText("chưa đạt 100%");
      await pages[0].getByRole("dialog").getByRole("button", { name: "OK", exact: true }).click();
      expect(state.floors).toEqual([]);
      expect(state.tasks).toEqual([
        { id: f.tasks[0].id, progress: 0, status: "chuan_bi", source: null },
        { id: f.tasks[1].id, progress: 1, status: "hoan_thanh", source: null },
      ]);
      expect(
        state.dims.filter((d) => d.taskId === f.tasks[0].id).every((d) => d.installed === 0),
      ).toBe(true);
      expect(
        state.dims.filter((d) => d.taskId === f.tasks[1].id).every((d) => d.installed === 1),
      ).toBe(true);
      expect(
        history(state, f.tasks[0]).map((h) => [h.oldProgress, h.newProgress, h.status]),
      ).toEqual([
        [0, 1, "hoan_thanh"],
        [1, 0, "chuan_bi"],
      ]);
      expect(
        history(state, f.tasks[1]).map((h) => [h.oldProgress, h.newProgress, h.status]),
      ).toEqual([[0, 1, "hoan_thanh"]]);
      await kiemLuoi(pages[1], f, [0, 6], [false, false]);
    }
    await pages[0].reload();
    await expect(
      pages[0].getByRole("heading", {
        name: `Đã nghiệm thu (${statuses[0] === 200 ? 1 : 0} tầng · hệ)`,
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("A5-AC03: hủy tầng giữ task duyệt riêng, approval_source và lịch sử đúng", async ({
  phien: { f, pages },
}) => {
  await tickHet(pages[0], f);
  const [taskA, taskB] = f.tasks;
  await moLuoi(pages[0], f);
  await taskRow(pages[0], taskA).getByRole("button", { name: "Nghiệm thu", exact: true }).click();
  const individual = await bamVaDoc(
    pages[0],
    "POST",
    `/api/tasks/${taskA.id}/approve`,
    pages[0].getByRole("dialog").getByRole("button", { name: "Duyệt", exact: true }),
  );
  expect(individual).toEqual({ status: 200, body: { id: taskA.id, status: "nghiem_thu" } });
  const afterIndividual = await docTrangThaiA5(f);
  const historyA = history(afterIndividual, taskA);
  expect(historyA).toHaveLength(2);
  expect(afterIndividual.tasks[0]).toEqual({
    id: taskA.id,
    progress: 1,
    status: "nghiem_thu",
    source: "task",
  });

  const floorButton = await moXacNhanTang(pages[1]);
  const floor = await bamVaDoc(pages[1], "POST", "/api/approvals", floorButton);
  expect(floor.status).toBe(200);
  expect(floor.body).toEqual({ approvalId: expect.any(Number), taskCount: 1 });
  const afterFloor = await docTrangThaiA5(f);
  expect(history(afterFloor, taskA)).toEqual(historyA);
  expect(afterFloor.tasks.map((t) => t.source)).toEqual(["task", "floor"]);
  await expect(pages[1].getByRole("button", { name: "Huỷ NT", exact: true })).toBeVisible();
  await pages[1].getByRole("button", { name: "Huỷ NT", exact: true }).click();
  const cancel = await bamVaDoc(
    pages[1],
    "DELETE",
    `/api/floor-approvals/${floor.body?.approvalId}`,
    pages[1].getByRole("dialog").getByRole("button", { name: "Huỷ nghiệm thu", exact: true }),
  );
  expect(cancel).toEqual({ status: 200, body: { deleted: floor.body?.approvalId, taskCount: 1 } });
  const afterCancel = await docTrangThaiA5(f);
  expect(afterCancel.tasks).toEqual([
    { id: taskA.id, progress: 1, status: "nghiem_thu", source: "task" },
    { id: taskB.id, progress: 1, status: "hoan_thanh", source: null },
  ]);
  expect(history(afterCancel, taskA)).toEqual(historyA);
  expect(history(afterCancel, taskB).map((h) => [h.oldProgress, h.newProgress, h.status])).toEqual([
    [0, 1, "hoan_thanh"],
    [1, 1, "nghiem_thu"],
    [1, 1, "hoan_thanh"],
  ]);
  expect(afterCancel.floors).toEqual([
    { id: floor.body?.approvalId, approved: false, approvedBy: null },
  ]);
  expect(afterCancel.dims.every((d) => d.installed === 1)).toBe(true);
  for (const page of pages) {
    await kiemLuoi(page, f, [6, 6], [true, false]);
    await expect(
      taskRow(page, taskB).getByRole("button", { name: "Nghiệm thu", exact: true }),
    ).toBeVisible();
  }
});
