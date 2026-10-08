import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// P1-6 — cách ly dự án cho app/api/sheets/**: PUT sắp xếp, GET danh sách, PATCH/DELETE :id
// chỉ chạm sheet thuộc DỰ ÁN ĐANG CHỌN (sheet_types → towers.project_id + projects.org_id).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

async function taoUser(role: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('P16', ?, 'hash-p16', ?, 1)`,
    `p16-${uniq("u")}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Dự án + tháp + n sheet (sort_order 1..n). */
async function dungDuAn(n: number): Promise<{ projectId: number; sheets: number[] }> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `P16 ${uniq("p")}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp P16')`,
    projectId,
  );
  const sheets: number[] = [];
  for (let i = 1; i <= n; i++) {
    sheets.push(
      await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, slug, sort_order) VALUES (?, ?, 'Sheet P16', ?, ?)`,
        towerId,
        `P16${uniq("c")}`,
        `p16-${uniq("s").toLowerCase()}`,
        i,
      ),
    );
  }
  return { projectId, sheets };
}

async function thuTu(ids: number[]): Promise<number[]> {
  const { queryOne } = await import("@/lib/db");
  const out: number[] = [];
  for (const id of ids) {
    const r = await queryOne<{ s: number }>(
      `SELECT sort_order AS s FROM sheet_types WHERE id = ?`,
      id,
    );
    out.push(r!.s);
  }
  return out;
}

const put = (ids: unknown) =>
  new NextRequest("http://localhost/api/sheets", {
    method: "PUT",
    body: JSON.stringify({ ids }),
    headers: { "content-type": "application/json" },
  });

test("PUT /api/sheets: id sheet dự án B → 404, sort_order B không đổi", S, async () => {
  const a = await dungDuAn(1);
  const b = await dungDuAn(2);
  await dangNhapDuAn(await taoUser("pm"), a.projectId);
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(put([b.sheets[1], b.sheets[0]]));
  assert.equal(res.status, 404);
  assert.deepEqual(await thuTu(b.sheets), [1, 2]);
});

test("PUT /api/sheets: trộn id A + B → 404, sort_order A cũng không đổi", S, async () => {
  const a = await dungDuAn(2);
  const b = await dungDuAn(1);
  await dangNhapDuAn(await taoUser("pm"), a.projectId);
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(put([a.sheets[1], a.sheets[0], b.sheets[0]]));
  assert.equal(res.status, 404);
  assert.deepEqual(await thuTu(a.sheets), [1, 2]);
  assert.deepEqual(await thuTu(b.sheets), [1]);
});

test("PUT /api/sheets: user không thuộc dự án nào → 404", S, async () => {
  const a = await dungDuAn(1);
  // Cần ít nhất 1 dòng user_projects để visibleProjectIds không trả "mọi dự án của org".
  await dangNhapDuAn(await taoUser("pm"), a.projectId);
  await dangNhapDuAn(await taoUser("pm"), null);
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(put([a.sheets[0]]));
  assert.equal(res.status, 404);
  assert.deepEqual(await thuTu(a.sheets), [1]);
});

test("PUT /api/sheets: đúng dự án → 200, thứ tự đổi đúng", S, async () => {
  const a = await dungDuAn(3);
  await dangNhapDuAn(await taoUser("pm"), a.projectId);
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(put([a.sheets[2], a.sheets[0], a.sheets[1]]));
  assert.equal(res.status, 200);
  assert.deepEqual(await thuTu(a.sheets), [2, 3, 1]);
});

test("PUT /api/sheets: ids trùng / không dương / quá 200 → 422", S, async () => {
  const a = await dungDuAn(1);
  await dangNhapDuAn(await taoUser("pm"), a.projectId);
  const { PUT } = await import("@/app/api/sheets/route");
  assert.equal((await PUT(put([a.sheets[0], a.sheets[0]]))).status, 422);
  assert.equal((await PUT(put([0]))).status, 422);
  assert.equal((await PUT(put(Array.from({ length: 201 }, (_, i) => i + 1)))).status, 422);
});

test("GET /api/sheets: không lộ sheet dự án B", S, async () => {
  const a = await dungDuAn(1);
  const b = await dungDuAn(1);
  await dangNhapDuAn(await taoUser("pm"), a.projectId);
  const { GET } = await import("@/app/api/sheets/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const ids = ((await res.json()).sheets as { id: number }[]).map((s) => s.id);
  assert.ok(ids.includes(a.sheets[0]));
  assert.ok(!ids.includes(b.sheets[0]));
});

test("PATCH/DELETE /api/sheets/:id: sheet dự án khác KHÔNG đang chọn → 404", S, async () => {
  const a = await dungDuAn(1);
  const b = await dungDuAn(1);
  const pm = await taoUser("pm");
  // Được gán cả hai dự án nhưng đang chọn A.
  await dangNhapDuAn(pm, b.projectId);
  await dangNhapDuAn(pm, a.projectId);
  const { PATCH, DELETE } = await import("@/app/api/sheets/[id]/route");
  const r1 = await PATCH(
    new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ name: "hack" }),
    }),
    { params: Promise.resolve({ id: String(b.sheets[0]) }) },
  );
  assert.equal(r1.status, 404);
  const r2 = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), {
    params: Promise.resolve({ id: String(b.sheets[0]) }),
  });
  assert.equal(r2.status, 404);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ name: string }>(
    `SELECT name FROM sheet_types WHERE id = ?`,
    b.sheets[0],
  );
  assert.equal(row?.name, "Sheet P16");
});
