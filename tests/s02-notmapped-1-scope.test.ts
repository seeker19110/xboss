import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S02 NOT_MAPPED đợt 1 (A1-AC01/AC03): các route inventory S00 đánh NOT_MAPPED đã rò thật.
// Gọi route thật với 2 tổ chức (cùng vai trò admin) + user không có dự án khả kiến:
// - DELETE /api/comments/:id — bình luận thuộc task dự án/tổ chức khác → 404, DB không đổi.
// - GET /api/systems — số liệu tổng hợp chỉ tính trên dự án đang chọn; không dự án → rỗng.
// - GET/PATCH /api/ui-texts — đọc/ghi đúng dự án đang chọn, không đụng dự án tổ chức khác.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;

type U = { id: number; passwordHash: string; orgId: number };
const ctx = {} as {
  orgB: number;
  pA: number;
  pB: number;
  adminA: U;
  adminB: U;
  pmNone: U;
  sysCode: string;
  taskA: number;
};

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
const p = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function taoUser(role: string, orgId: number): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02nm1', ?, ?)`,
    `S02nm1 ${RUN}`,
    `s02nm1-${RUN}-${++seq}@test.local`,
    role,
    orgId,
  );
  return { id, passwordHash: "hash-s02nm1", orgId };
}

async function taoBinhLuan(userId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, 'bình luận S02')`,
    ctx.taskA,
    userId,
  );
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  ctx.orgB = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org S02nm1 ${RUN}`);
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02nm1 A ${RUN}`);
  ctx.pB = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `S02nm1 B ${RUN}`,
    ctx.orgB,
  );
  ctx.adminA = await taoUser("admin", 1);
  ctx.adminB = await taoUser("admin", ctx.orgB);
  ctx.pmNone = await taoUser("pm", 1);
  // user_projects có dòng → pmNone (không được gán) không thấy dự án nào.
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    ctx.adminA.id,
    ctx.pA,
  );

  ctx.sysCode = `s02nm1_${RUN}`;
  const sys = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ S02nm1')`,
    ctx.sysCode,
  );
  const tower = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`,
    ctx.pA,
  );
  const sheet = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, 'Sheet A', ?, ?)`,
    tower,
    `S02NM1${RUN}`,
    `s02nm1-${RUN}`,
    sys,
  );
  const pkg = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, floor_label, name) VALUES (?, ?, 'T1', 'Nhóm')`,
    sheet,
    `S02NM1${RUN}`,
  );
  ctx.taskA = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, 'Task', 0.5)`,
    pkg,
    `s02nm1t${RUN}`,
  );
});

async function conBinhLuan(id: number): Promise<boolean> {
  const { queryOne } = await import("@/lib/db");
  return !!(await queryOne(`SELECT id FROM task_comments WHERE id = ?`, id));
}

test("DELETE /api/comments/:id: admin tổ chức khác → 404, bình luận còn nguyên", S, async () => {
  const id = await taoBinhLuan(ctx.adminA.id);
  await dangNhapDuAn(ctx.adminB, ctx.pB);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(req("DELETE"), p(id));
  assert.equal(res.status, 404);
  assert.equal(await conBinhLuan(id), true);
});

test("DELETE /api/comments/:id: tác giả không có dự án khả kiến → 404, còn nguyên", S, async () => {
  const id = await taoBinhLuan(ctx.pmNone.id);
  await dangNhapDuAn(ctx.pmNone, null);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(req("DELETE"), p(id));
  assert.equal(res.status, 404);
  assert.equal(await conBinhLuan(id), true);
});

test("DELETE /api/comments/:id: admin đúng dự án → xoá được", S, async () => {
  const id = await taoBinhLuan(ctx.adminA.id);
  await dangNhapDuAn(ctx.adminA, ctx.pA);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(req("DELETE"), p(id));
  assert.equal(res.status, 200);
  assert.equal(await conBinhLuan(id), false);
});

type Sys = { code: string; sheetCount: number; avgProgress: number };
async function heS02(): Promise<Sys | undefined> {
  const { GET } = await import("@/app/api/systems/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { systems: Sys[] };
  assert.ok(Array.isArray(body.systems));
  return body.systems.find((s) => s.code === ctx.sysCode);
}

test("GET /api/systems: tổ chức khác không thấy số liệu dự án A", S, async () => {
  await dangNhapDuAn(ctx.adminB, ctx.pB);
  const s = await heS02();
  assert.ok(s, "danh mục hệ vẫn hiện (chung toàn hệ)");
  assert.equal(Number(s.sheetCount), 0);
  assert.equal(Number(s.avgProgress), 0);
});

test("GET /api/systems: không có dự án khả kiến → 200 rỗng", S, async () => {
  await dangNhapDuAn(ctx.pmNone, null);
  const { GET } = await import("@/app/api/systems/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { systems: [] });
});

test("GET /api/systems: đúng dự án → số liệu như cũ", S, async () => {
  await dangNhapDuAn(ctx.adminA, ctx.pA);
  const s = await heS02();
  assert.ok(s);
  assert.equal(Number(s.sheetCount), 1);
  assert.equal(Number(s.avgProgress), 0.5);
});

test("ui-texts: admin tổ chức B không đọc/ghi được text dự án tổ chức A", S, async () => {
  const { GET, PATCH } = await import("@/app/api/ui-texts/route");
  const keyA = `s02.a.${RUN}`;
  const keyB = `s02.b.${RUN}`;

  await dangNhapDuAn(ctx.adminA, ctx.pA);
  assert.equal((await PATCH(req("PATCH", { key: keyA, value: "A" }))).status, 200);

  await dangNhapDuAn(ctx.adminB, ctx.pB);
  const resB = await PATCH(req("PATCH", { key: keyB, value: "B" }));
  assert.equal(resB.status, 200);
  const textsB = (await resB.json()).texts as Record<string, string>;
  assert.equal(keyA in textsB, false, "B không thấy text của A");

  await dangNhapDuAn(ctx.adminA, ctx.pA);
  const textsA = (await (await GET()).json()).texts as Record<string, string>;
  assert.equal(textsA[keyA], "A");
  assert.equal(keyB in textsA, false, "ghi của B không lọt vào dự án A");
});

test("ui-texts: admin tổ chức chưa có dự án → GET rỗng, PATCH 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { GET, PATCH } = await import("@/app/api/ui-texts/route");
  // Admin thấy mọi dự án trong org → dùng một tổ chức chưa có dự án nào.
  const orgC = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org C ${RUN}`);
  const adminNone = await taoUser("admin", orgC);
  await dangNhapDuAn(adminNone, null);
  const g = await GET();
  assert.equal(g.status, 200);
  assert.deepEqual(await g.json(), { texts: {} });
  const res = await PATCH(req("PATCH", { key: `s02.none.${RUN}`, value: "x" }));
  assert.equal(res.status, 404);
});
