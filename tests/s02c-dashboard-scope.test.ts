import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S02c (A1-AC01/AC02): dashboard/export/báo cáo. Gọi route thật.
// Mỗi route: user không có dự án khả kiến → rỗng đúng shape (dashboard) hoặc 404 (export),
// không chứa dữ liệu đã seed; dự án đang chọn không lẫn dữ liệu dự án khác cùng org.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let seq = 0;

type U = { id: number; passwordHash: string };
const ctx = {} as {
  pA: number;
  pB: number;
  userA: U; // pm, gán dự án A
  userNone: U; // pm, không gán dự án nào
  slugA: string;
  slugB: string;
};
const tenTask = (tag: string) => `S02C-TASK-${RUN}-${tag}`;
const maSheet = (tag: string) => `S02C${RUN}${tag}`;

async function taoUser(role: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02c', ?, 1)`,
    `S02c ${RUN}`,
    `s02c-${RUN}-${++seq}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-s02c" };
}

// Seed WBS đủ để mọi khối có số liệu: 1 task trễ (có ngày BĐ/KT) + lịch sử %.
async function taoWbs(projectId: number, tag: string): Promise<string> {
  const { insertId, run, daysFromTodayISO } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp S02c ${tag}`,
  );
  const slug = `s02c-${RUN}-${tag}`.toLowerCase();
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
    towerId,
    maSheet(tag),
    `Sheet ${tag}`,
    slug,
  );
  const pkg = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, ?, 'Nhóm S02c', 'T1', ?, ?)`,
    sheetId,
    `PKG-${RUN}-${tag}`,
    daysFromTodayISO(-20),
    daysFromTodayISO(-2),
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent, status)
     VALUES (?, ?, ?, ?, ?, 0.3, 'tre')`,
    pkg,
    `T-${RUN}-${tag}`,
    tenTask(tag),
    daysFromTodayISO(-20),
    daysFromTodayISO(-2),
  );
  await run(
    `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at)
     VALUES (?, 0, 0.3, NOW() - INTERVAL '3 days')`,
    taskId,
  );
  return slug;
}

const req = (url: string) => new NextRequest(`http://localhost${url}`);
const asNone = () => dangNhapDuAn(ctx.userNone, null);
const asA = () => dangNhapDuAn(ctx.userA, ctx.pA);

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02c A ${RUN}`);
  ctx.pB = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02c B ${RUN}`);
  ctx.userA = await taoUser("pm");
  ctx.userNone = await taoUser("pm");
  // Gán userA vào A ⇒ user_projects khác rỗng ⇒ userNone (không gán) không thấy dự án nào.
  await dangNhapDuAn(ctx.userA, ctx.pA);
  ctx.slugA = await taoWbs(ctx.pA, "A");
  ctx.slugB = await taoWbs(ctx.pB, "B");
});

test("GET /api/dashboard: không dự án → rỗng đúng shape; dự án A không lẫn B", S, async () => {
  const { GET } = await import("@/app/api/dashboard/route");
  await asNone();
  const res = await GET(req("/api/dashboard"));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(j.kpi, []);
  assert.deepEqual(j.delayedTasks, []);
  assert.equal(j.totalDelayed, 0);
  assert.deepEqual(j.bySystem, []);
  assert.equal(j.quality.ncrOpen, 0);
  assert.equal(j.dueSoon.count, 0);
  assert.ok(!JSON.stringify(j).includes(RUN), "không lộ dữ liệu đã seed");

  await asA();
  const s = JSON.stringify(await (await GET(req("/api/dashboard"))).json());
  assert.ok(s.includes(tenTask("A")) && s.includes(maSheet("A")), "đúng dự án → thấy A");
  assert.ok(!s.includes(tenTask("B")) && !s.includes(maSheet("B")), "không lẫn dự án B");
});

const DASH_PHU = [
  ["/api/dashboard/forecast", () => import("@/app/api/dashboard/forecast/route")],
  ["/api/dashboard/spi", () => import("@/app/api/dashboard/spi/route")],
  ["/api/dashboard/scurve", () => import("@/app/api/dashboard/scurve/route")],
] as const;

for (const [path, load] of DASH_PHU) {
  test(`GET ${path}: không dự án → rỗng; dự án A không lẫn B`, S, async () => {
    const { GET } = await load();
    await asNone();
    const res = await GET(req(path));
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.ok(!JSON.stringify(j).includes(RUN), "không lộ dữ liệu đã seed");
    if (path.endsWith("forecast")) assert.deepEqual(j.forecast, []);
    if (path.endsWith("spi")) {
      assert.deepEqual(j.spi, []);
      assert.equal(j.overall.taskCount, 0);
    }
    if (path.endsWith("scurve")) {
      assert.deepEqual(j.points, []);
      assert.deepEqual(j.sheets, []);
    }

    await asA();
    const s = JSON.stringify(await (await GET(req(path))).json());
    assert.ok(s.includes(maSheet("A")), "đúng dự án → có sheet A");
    assert.ok(!s.includes(maSheet("B")), "không lẫn sheet dự án B");
  });
}

test(
  "GET /api/export/excel: không dự án → 404; ?sheet dự án khác → 404; đúng dự án → file",
  S,
  async () => {
    const { GET } = await import("@/app/api/export/excel/route");
    await asNone();
    const r0 = await GET(req("/api/export/excel"));
    assert.equal(r0.status, 404);
    assert.match(JSON.stringify(await r0.json()), /Không tìm thấy dự án đang chọn/);

    await asA();
    assert.equal((await GET(req(`/api/export/excel?sheet=${ctx.slugB}`))).status, 404);
    const ok = await GET(req(`/api/export/excel?sheet=${ctx.slugA}`));
    assert.equal(ok.status, 200);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await ok.arrayBuffer());
    const text = wb.worksheets
      .flatMap((ws) => (ws.getSheetValues() as unknown[]).map((r) => JSON.stringify(r ?? null)))
      .join("|");
    assert.ok(text.includes(tenTask("A")), "file có task dự án A");
    assert.ok(!text.includes(tenTask("B")), "file không lẫn task dự án B");
  },
);

test("GET /api/export/pdf: không dự án → 404, không sinh file", S, async () => {
  const { GET } = await import("@/app/api/export/pdf/route");
  await asNone();
  const res = await GET(req("/api/export/pdf"));
  assert.equal(res.status, 404);
  assert.match(JSON.stringify(await res.json()), /Không tìm thấy dự án đang chọn/);
});

test(
  "GET /api/admin/integrations: không dự án → chỉ tích hợp cấp org; A không thấy của B",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const mk = (projectId: number | null) =>
      insertId(
        `INSERT INTO integrations (provider, project_id, org_id) VALUES (?, ?, 1)`,
        `s02c-${RUN}`,
        projectId,
      );
    const iA = await mk(ctx.pA);
    const iB = await mk(ctx.pB);
    const iOrg = await mk(null);
    const { GET } = await import("@/app/api/admin/integrations/route");
    const ids = async () => {
      const res = await GET();
      assert.equal(res.status, 200);
      const j = await res.json();
      const rows = (Array.isArray(j) ? j : (j.items ?? j.integrations)) as { id: number }[];
      return rows.map((r) => r.id);
    };
    await asNone();
    const none = await ids();
    assert.ok(none.includes(iOrg), "tích hợp cấp org vẫn hiện");
    assert.ok(!none.includes(iA) && !none.includes(iB), "không lộ tích hợp theo dự án");
    await asA();
    const a = await ids();
    assert.ok(a.includes(iA) && a.includes(iOrg) && !a.includes(iB));
  },
);

test(
  "GET /api/saved-reports (B): không dự án → chỉ báo cáo cấp org; không lộ báo cáo dự án",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const mk = (projectId: number | null, tag: string) =>
      insertId(
        `INSERT INTO saved_reports (project_id, owner_id, name, source, config, shared, org_id)
       VALUES (?, ?, ?, 'tasks', '{}', TRUE, 1)`,
        projectId,
        ctx.userA.id,
        `S02c BC ${RUN} ${tag}`,
      );
    const rA = await mk(ctx.pA, "A");
    const rB = await mk(ctx.pB, "B");
    const rOrg = await mk(null, "ORG");
    const { GET } = await import("@/app/api/saved-reports/route");
    const ids = async () =>
      ((await (await GET()).json()).reports as { id: number }[]).map((r) => r.id);
    await asNone();
    const none = await ids();
    assert.ok(none.includes(rOrg) && !none.includes(rA) && !none.includes(rB));
    await asA();
    const a = await ids();
    assert.ok(a.includes(rA) && a.includes(rOrg) && !a.includes(rB));
  },
);
