import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S02b (A1-AC02/AC03): tracking/BOQ. Gọi route thật.
// - User không có dự án khả kiến (pm không gán, user_projects có dòng khác) → route chi tiết/ghi
//   404, route danh sách 200 rỗng đúng shape — KHÔNG thấy dữ liệu dự án khác.
// - Id/dữ liệu thuộc dự án khác cùng org → 404 (ghi: DB không đổi) / không lộ trong danh sách.
// - Đúng dự án → như cũ.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;

type U = { id: number; passwordHash: string };
const ctx = {} as {
  pA: number;
  pB: number;
  userA: U; // pm, gán dự án A
  userNone: U; // pm, không gán dự án nào
  slugA: string;
  slugB: string;
  taskA: number;
  taskB: number;
  boqA: number;
  boqB: number;
  normA: number;
  normB: number;
  sysCode: string;
  uploadA: number;
  uploadB: number;
  stageB: number;
};

const homNayCong = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function taoUser(role: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02b', ?, 1)`,
    `S02b ${RUN}`,
    `s02b-${RUN}-${++seq}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-s02b" };
}

/** Dựng tháp → sheet → nhóm → task (giao cho `assignee`) cho 1 dự án. */
async function taoTracking(projectId: number, tag: string, systemId: number, assignee: number) {
  const { insertId } = await import("@/lib/db");
  const tower = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${tag}`,
  );
  const slug = `s02b-${RUN}-${tag.toLowerCase()}`;
  const sheet = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, ?, ?, ?)`,
    tower,
    `S02B${tag}`,
    `Sheet ${tag}`,
    slug,
    systemId,
  );
  const pkg = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, floor_label, name, start_date, end_date)
     VALUES (?, ?, ?, 'Nhóm S02b', ?, ?)`,
    sheet,
    `S02B${RUN}${tag}`,
    `T${tag}${RUN}`,
    homNayCong(-30),
    homNayCong(30),
  );
  const task = await insertId(
    `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent, assigned_to)
     VALUES (?, ?, 'Task S02b', ?, ?, 0, ?)`,
    pkg,
    `s02bt${RUN}${tag.toLowerCase()}`,
    homNayCong(2),
    homNayCong(5),
    assignee,
  );
  // Lịch sử cho timeline.history.
  await insertId(
    `INSERT INTO task_history (task_id, old_progress, new_progress) VALUES (?, 0, 0.1)`,
    task,
  );
  return { slug, task };
}

async function taoBoq(projectId: number, tag: string) {
  const { insertId } = await import("@/lib/db");
  const boq = await insertId(
    `INSERT INTO boq_items (code, name, unit, project_id, qty_contract) VALUES (?, 'BOQ S02b', 'm', ?, 10)`,
    `S02B-BOQ-${RUN}-${tag}`,
    projectId,
  );
  const norm = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label, note)
     VALUES (?, 'labor', 'Thợ', 1, 'công', 'gốc')`,
    boq,
  );
  return { boq, norm };
}

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
const p = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02b A ${RUN}`);
  ctx.pB = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02b B ${RUN}`);
  ctx.userA = await taoUser("pm");
  ctx.userNone = await taoUser("pm");
  // Gán userA vào A ⇒ user_projects khác rỗng ⇒ userNone (không gán) không thấy dự án nào.
  await dangNhapDuAn(ctx.userA, ctx.pA);

  ctx.sysCode = `S02B${RUN}`;
  const systemId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ S02b')`,
    ctx.sysCode,
  );
  const a = await taoTracking(ctx.pA, "A", systemId, ctx.userA.id);
  // Task dự án B giao cho userNone: code cũ (null = không lọc) sẽ lộ nó ở my-tasks.
  const b = await taoTracking(ctx.pB, "B", systemId, ctx.userNone.id);
  ctx.slugA = a.slug;
  ctx.slugB = b.slug;
  ctx.taskA = a.task;
  ctx.taskB = b.task;

  const ba = await taoBoq(ctx.pA, "A");
  const bb = await taoBoq(ctx.pB, "B");
  ctx.boqA = ba.boq;
  ctx.normA = ba.norm;
  ctx.boqB = bb.boq;
  ctx.normB = bb.norm;

  const upload = (projectId: number) =>
    insertId(
      `INSERT INTO system_uploads (system_id, kind, file_name, project_id) VALUES (?, 'tracking', ?, ?)`,
      systemId,
      `s02b-${RUN}-${++seq}.xlsx`,
      projectId,
    );
  ctx.uploadA = await upload(ctx.pA);
  ctx.uploadB = await upload(ctx.pB);

  ctx.stageB = await insertId(
    `INSERT INTO construction_stages (name, sort_order, active, project_id) VALUES (?, 5, TRUE, ?)`,
    `Công tác riêng B ${RUN}`,
    ctx.pB,
  );
});

const asNone = () => dangNhapDuAn(ctx.userNone, null);
const asA = () => dangNhapDuAn(ctx.userA, ctx.pA);

async function normNote(id: number) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ note: string }>(`SELECT note FROM boq_norms WHERE id = ?`, id))?.note;
}

test(
  "PATCH /api/boq-norms/:id: không dự án → 404; dự án khác → 404 (DB không đổi); đúng → 200",
  S,
  async () => {
    const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
    await asNone();
    assert.equal((await PATCH(req("/x", "PATCH", { note: "hack" }), p(ctx.normB))).status, 404);
    assert.equal(await normNote(ctx.normB), "gốc");

    await asA();
    assert.equal((await PATCH(req("/x", "PATCH", { note: "hack" }), p(ctx.normB))).status, 404);
    assert.equal(await normNote(ctx.normB), "gốc");
    assert.equal((await PATCH(req("/x", "PATCH", { note: "sửa A" }), p(ctx.normA))).status, 200);
    assert.equal(await normNote(ctx.normA), "sửa A");
  },
);

test(
  "GET /api/boq/:id/norms + norm-usage: không dự án → 404; dự án khác → 404; đúng → 200",
  S,
  async () => {
    const norms = await import("@/app/api/boq/[id]/norms/route");
    const usage = await import("@/app/api/boq/[id]/norm-usage/route");
    await asNone();
    assert.equal((await norms.GET(req("/x"), p(ctx.boqB))).status, 404);
    assert.equal((await usage.GET(req("/x"), p(ctx.boqB))).status, 404);

    await asA();
    assert.equal((await norms.GET(req("/x"), p(ctx.boqB))).status, 404);
    assert.equal((await usage.GET(req("/x"), p(ctx.boqB))).status, 404);
    const r = await norms.GET(req("/x"), p(ctx.boqA));
    assert.equal(r.status, 200);
    assert.ok(((await r.json()).norms as { id: number }[]).some((n) => n.id === ctx.normA));
    assert.equal((await usage.GET(req("/x"), p(ctx.boqA))).status, 200);
  },
);

test(
  "POST /api/boq/:id/norms: không dự án → 404; dự án khác → 404 (không chèn); đúng → 201",
  S,
  async () => {
    const { POST } = await import("@/app/api/boq/[id]/norms/route");
    const { queryOne } = await import("@/lib/db");
    const dem = async (boq: number) =>
      Number(
        (await queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM boq_norms WHERE boq_item_id = ?`,
          boq,
        ))!.n,
      );
    const body = {
      resourceType: "labor",
      resourceName: "Thợ phụ",
      qtyPerUnit: 2,
      unitLabel: "công",
    };
    const truoc = await dem(ctx.boqB);
    await asNone();
    assert.equal((await POST(req("/x", "POST", body), p(ctx.boqB))).status, 404);
    await asA();
    assert.equal((await POST(req("/x", "POST", body), p(ctx.boqB))).status, 404);
    assert.equal(await dem(ctx.boqB), truoc);
    assert.equal((await POST(req("/x", "POST", body), p(ctx.boqA))).status, 201);
  },
);

test(
  "POST /api/boq/:id/norms: vật tư thuộc dự án khác → 422 như không tồn tại; cùng dự án → 201",
  S,
  async () => {
    const { POST } = await import("@/app/api/boq/[id]/norms/route");
    const { insertId } = await import("@/lib/db");
    const taoVatTu = (projectId: number, tag: string) =>
      insertId(
        `INSERT INTO materials (project_id, name, qty_planned, qty_used) VALUES (?, ?, 0, 0)`,
        projectId,
        `Vật tư S02b ${RUN} ${tag}`,
      );
    const vtA = await taoVatTu(ctx.pA, "A");
    const vtB = await taoVatTu(ctx.pB, "B");
    const body = (materialId: number) => ({
      resourceType: "material",
      materialId,
      qtyPerUnit: 1,
      unitLabel: "kg",
    });
    await asA();
    const sai = await POST(req("/x", "POST", body(vtB)), p(ctx.boqA));
    assert.equal(sai.status, 422);
    assert.equal((await sai.json()).error, "Vật tư không tồn tại");
    assert.equal((await POST(req("/x", "POST", body(vtA)), p(ctx.boqA))).status, 201);
  },
);

test(
  "GET /api/boq (B — chốt hồi quy): không dự án → 200 rỗng đúng shape; đúng dự án chỉ thấy A",
  S,
  async () => {
    const { GET } = await import("@/app/api/boq/route");
    await asNone();
    const r0 = await GET(req("/api/boq"));
    assert.equal(r0.status, 200);
    assert.deepEqual(await r0.json(), {
      items: [],
      totals: { contractValue: 0, subValue: 0, executedValue: 0 },
    });

    await asA();
    const ids = ((await (await GET(req("/api/boq"))).json()).items as { id: number }[]).map(
      (x) => x.id,
    );
    assert.ok(ids.includes(ctx.boqA));
    assert.ok(!ids.includes(ctx.boqB));
  },
);

test("GET /api/tasks: không dự án → 404; sheet dự án khác → 404; đúng → 200", S, async () => {
  const { GET } = await import("@/app/api/tasks/route");
  await asNone();
  assert.equal((await GET(req(`/api/tasks?sheet=${ctx.slugB}`))).status, 404);
  await asA();
  assert.equal((await GET(req(`/api/tasks?sheet=${ctx.slugB}`))).status, 404);
  const r = await GET(req(`/api/tasks?sheet=${ctx.slugA}`));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(
    j.packages.some((pk: { tasks: { id: number }[] }) => pk.tasks.some((t) => t.id === ctx.taskA)),
  );
});

test(
  "GET /api/my-tasks: không dự án → 200 rỗng; đúng dự án chỉ thấy task dự án đó",
  S,
  async () => {
    const { GET } = await import("@/app/api/my-tasks/route");
    await asNone();
    const r0 = await GET();
    assert.equal(r0.status, 200);
    const j0 = await r0.json();
    assert.deepEqual(j0.tasks, [], "không lộ task dự án B được giao cho userNone");
    assert.equal(j0.summary.total, 0);
    assert.equal(typeof j0.summary.dueSoonDays, "number");

    await asA();
    const ids = ((await (await GET()).json()).tasks as { id: number }[]).map((t) => t.id);
    assert.ok(ids.includes(ctx.taskA));
    assert.ok(!ids.includes(ctx.taskB));
  },
);

test(
  "GET /api/lookahead: không dự án → 200 rỗng đúng shape; đúng dự án không lộ dự án khác",
  S,
  async () => {
    const { GET } = await import("@/app/api/lookahead/route");
    await asNone();
    const r0 = await GET(req("/api/lookahead?days=14"));
    assert.equal(r0.status, 200);
    const j0 = await r0.json();
    assert.deepEqual([j0.starting, j0.due, j0.days], [[], [], 14]);
    assert.ok(j0.from && j0.until);

    await asA();
    const j = await (await GET(req("/api/lookahead?days=14"))).json();
    const ids = [...j.starting, ...j.due].map((t: { id: number }) => t.id);
    assert.ok(ids.includes(ctx.taskA));
    assert.ok(!ids.includes(ctx.taskB));
  },
);

test(
  "GET /api/timeline: không dự án → 200 rỗng đúng shape; đúng dự án không lộ dự án khác",
  S,
  async () => {
    const { GET } = await import("@/app/api/timeline/route");
    await asNone();
    const r0 = await GET(req("/api/timeline"));
    assert.equal(r0.status, 200);
    assert.deepEqual(await r0.json(), {
      towers: [],
      current: [],
      history: [],
      weeks: [],
      floors: [],
      sheets: [],
    });

    await asA();
    const j = await (await GET(req(`/api/timeline?system=${ctx.sysCode}`))).json();
    const slugs = (j.sheets as { slug: string }[]).map((s) => s.slug);
    assert.ok(slugs.includes(ctx.slugA));
    assert.ok(!slugs.includes(ctx.slugB));
    assert.ok(!(j.floors as string[]).includes(`TB${RUN}`));
  },
);

test(
  "GET /api/search: không dự án → 200 hits rỗng; đúng dự án không lộ dự án khác",
  S,
  async () => {
    const { GET } = await import("@/app/api/search/route");
    const q = `s02bt${RUN}`;
    await asNone();
    const r0 = await GET(req(`/api/search?q=${q}`));
    assert.equal(r0.status, 200);
    assert.deepEqual(await r0.json(), { hits: [] });

    await asA();
    const hits = (await (await GET(req(`/api/search?q=${q}`))).json()).hits as {
      kind: string;
      id: number;
    }[];
    const taskIds = hits.filter((h) => h.kind === "task").map((h) => h.id);
    assert.ok(taskIds.includes(ctx.taskA));
    assert.ok(!taskIds.includes(ctx.taskB));
  },
);

test(
  "GET /api/systems/:code/uploads: không dự án → 404; đúng dự án không lộ upload dự án khác",
  S,
  async () => {
    const { GET } = await import("@/app/api/systems/[code]/uploads/route");
    const pc = { params: Promise.resolve({ code: ctx.sysCode }) };
    await asNone();
    assert.equal((await GET(req("/x?kind=tracking"), pc)).status, 404);

    await asA();
    const r = await GET(req("/x?kind=tracking"), {
      params: Promise.resolve({ code: ctx.sysCode }),
    });
    assert.equal(r.status, 200);
    const ids = ((await r.json()) as { id: number }[]).map((u) => u.id);
    assert.ok(ids.includes(ctx.uploadA));
    assert.ok(!ids.includes(ctx.uploadB));
  },
);

test(
  "PATCH /api/construction-stages/:id (B — chốt hồi quy): không dự án → 400; công tác dự án khác → 404, không đổi",
  S,
  async () => {
    const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
    const { queryOne } = await import("@/lib/db");
    await asNone();
    assert.equal((await PATCH(req("/x", "PATCH", { name: "hack" }), p(ctx.stageB))).status, 400);
    await asA();
    assert.equal((await PATCH(req("/x", "PATCH", { name: "hack" }), p(ctx.stageB))).status, 404);
    const row = await queryOne<{ name: string }>(
      `SELECT name FROM construction_stages WHERE id = ?`,
      ctx.stageB,
    );
    assert.equal(row?.name, `Công tác riêng B ${RUN}`);
  },
);

test(
  "PUT /api/floor-stage-fronts (B — làm chặt): không dự án → 400; công tác chuyển bước của dự án khác → 404, không ghi",
  S,
  async () => {
    const { PUT } = await import("@/app/api/floor-stage-fronts/route");
    const { queryOne, insertId } = await import("@/lib/db");
    // Công tác dùng chung (project_id NULL) để làm ô hợp lệ.
    const chung = await insertId(
      `INSERT INTO construction_stages (name, sort_order, active) VALUES (?, 6, TRUE)`,
      `Công tác chung ${RUN}`,
    );
    const floorLabel = `FS${RUN}`;
    const body = { floorLabel, stageId: chung, note: "x", transitionStageId: ctx.stageB };

    await asNone();
    assert.equal((await PUT(req("/x", "PUT", { floorLabel, stageId: chung }))).status, 400);
    await asA();
    assert.equal((await PUT(req("/x", "PUT", body))).status, 404);
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM floor_stage_fronts WHERE floor_label = ?`,
      floorLabel,
    );
    assert.equal(Number(n!.n), 0);
    assert.equal(
      (await PUT(req("/x", "PUT", { floorLabel, stageId: chung, note: "ok" }))).status,
      200,
    );
  },
);
