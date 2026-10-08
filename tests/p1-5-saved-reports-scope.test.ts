import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// P1-5 (A1-AC01/AC02): GET /api/saved-reports/:id/data không được chạy báo cáo toàn hệ.
// Không có dự án khả kiến → rỗng đúng shape; dự án A không lẫn B; báo cáo gắn B khi ở A → 404.

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
  rOrg: number; // báo cáo cấp org (project_id NULL)
  rB: number; // báo cáo gắn dự án B
};
const tenTask = (tag: string) => `P15-TASK-${RUN}-${tag}`;
const maSheet = (tag: string) => `P15${RUN}${tag}`;

async function taoUser(role: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-p15', ?, 1)`,
    `P1-5 ${RUN}`,
    `p15-${RUN}-${++seq}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-p15" };
}

// Seed WBS đủ để mọi khối có số liệu: 1 task trễ (có ngày BĐ/KT) + lịch sử %.
async function taoWbs(projectId: number, tag: string): Promise<string> {
  const { insertId, run, daysFromTodayISO } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp P1-5 ${tag}`,
  );
  const slug = `p15-${RUN}-${tag}`.toLowerCase();
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
    towerId,
    maSheet(tag),
    `Sheet ${tag}`,
    slug,
  );
  const pkg = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, ?, 'Nhóm P1-5', 'T1', ?, ?)`,
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
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `P1-5 A ${RUN}`);
  ctx.pB = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `P1-5 B ${RUN}`);
  ctx.userA = await taoUser("pm");
  ctx.userNone = await taoUser("pm");
  // Gán userA vào A ⇒ user_projects khác rỗng ⇒ userNone (không gán) không thấy dự án nào.
  await dangNhapDuAn(ctx.userA, ctx.pA);
  ctx.slugA = await taoWbs(ctx.pA, "A");
  ctx.slugB = await taoWbs(ctx.pB, "B");
  const taoBaoCao = (projectId: number | null) =>
    insertId(
      `INSERT INTO saved_reports (project_id, owner_id, name, source, config, shared, org_id)
       VALUES (?, ?, ?, 'late_tasks', '{}', true, 1)`,
      projectId,
      ctx.userA.id,
      `BC P1-5 ${RUN}`,
    );
  ctx.rOrg = await taoBaoCao(null);
  ctx.rB = await taoBaoCao(ctx.pB);
});

const goi = async (id: number) => {
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  return GET(req(`/api/saved-reports/${id}/data`), { params: Promise.resolve({ id: String(id) }) });
};

test("saved-reports data: không dự án → rỗng đúng shape, không lộ dữ liệu", S, async () => {
  await asNone();
  const res = await goi(ctx.rOrg);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.source, "late_tasks");
  assert.ok(Array.isArray(j.columns) && j.columns.length > 0, "giữ cột của nguồn");
  assert.deepEqual(j.rows, []);
  const s = JSON.stringify(j);
  for (const tag of ["A", "B"])
    assert.ok(!s.includes(tenTask(tag)) && !s.includes(maSheet(tag)), `không lộ dữ liệu ${tag}`);
});

test("saved-reports data: dự án A chạy báo cáo cấp org → chỉ A, không B", S, async () => {
  await asA();
  const res = await goi(ctx.rOrg);
  assert.equal(res.status, 200);
  const s = JSON.stringify(await res.json());
  assert.ok(s.includes(tenTask("A")) && s.includes(maSheet("A")), "thấy dữ liệu A");
  assert.ok(!s.includes(tenTask("B")) && !s.includes(maSheet("B")), "không lẫn B");
});

test("saved-reports data: báo cáo gắn dự án B khi đang ở A → 404", S, async () => {
  await asA();
  const res = await goi(ctx.rB);
  assert.equal(res.status, 404);
  assert.ok(!JSON.stringify(await res.json()).includes(RUN));
});
