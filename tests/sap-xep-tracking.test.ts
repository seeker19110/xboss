import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { cungTapId, docDanhSachId, MAX_SAP_XEP_IDS } from "@/lib/tien-do/sap-xep";

// M135 — kéo thả sắp xếp nhóm/task trên lưới tracking. Phủ:
//   - lib/tien-do/sap-xep.ts (kiểm ids thuần + so tập)
//   - PUT /api/workpackages           (thứ tự nhóm trong sheet)
//   - PUT /api/workpackages/:id/tasks (thứ tự task trong nhóm)

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

// ---------------------------------------------------------------------------
// Thuần
// ---------------------------------------------------------------------------

test("docDanhSachId: rỗng/không phải mảng → 400", () => {
  for (const raw of [undefined, null, [], "1,2", { 0: 1 }]) {
    const kq = docDanhSachId(raw);
    assert.ok("loi" in kq);
    assert.equal(kq.status, 400);
  }
});

test("docDanhSachId: sai kiểu/âm/thập phân/chuỗi số/trùng/quá dài → 422", () => {
  const sai: unknown[] = [
    [1, 0],
    [1, -2],
    [1.5],
    ["1", 2],
    [1, 2, 1],
    [Number.MAX_SAFE_INTEGER + 1],
    Array.from({ length: MAX_SAP_XEP_IDS + 1 }, (_, i) => i + 1),
  ];
  for (const raw of sai) {
    const kq = docDanhSachId(raw);
    assert.ok("loi" in kq, JSON.stringify(raw).slice(0, 40));
    assert.equal(kq.status, 422);
  }
});

test("docDanhSachId: hợp lệ giữ nguyên thứ tự", () => {
  assert.deepEqual(docDanhSachId([3, 1, 2]), { ids: [3, 1, 2] });
});

test("cungTapId: đúng tập khác thứ tự → true; thiếu/thừa/khác → false", () => {
  assert.equal(cungTapId([3, 1, 2], [1, 2, 3]), true);
  assert.equal(cungTapId([1, 2], [1, 2, 3]), false);
  assert.equal(cungTapId([1, 2, 3, 4], [1, 2, 3]), false);
  assert.equal(cungTapId([1, 2, 9], [1, 2, 3]), false);
});

// ---------------------------------------------------------------------------
// Route thật
// ---------------------------------------------------------------------------

async function dungSheet(ten: string) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SX ${uniq(ten)}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp SX')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet SX')`,
    towerId,
    `SX${uniq(ten)}`,
  );
  return { projectId, sheetTypeId };
}

async function taoNhom(sheetTypeId: number, code: string, sortOrder: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES (?, ?, ?, ?)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
    sortOrder,
  );
}

async function taoTask(packageId: number, code: string, sortOrder: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order) VALUES (?, ?, ?, ?)`,
    packageId,
    code,
    `Task ${code}`,
    sortOrder,
  );
}

async function taoUser(role: string, ten: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-sx', ?, 1)`,
    `SX ${ten}`,
    `sx-${uniq(ten)}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

async function thuTu(bang: "work_packages" | "tasks", ids: number[]): Promise<number[]> {
  const { query } = await import("@/lib/db");
  const rows = await query<{ id: number; sort_order: number }>(
    `SELECT id, sort_order FROM ${bang} WHERE id = ANY(?::int[])`,
    ids,
  );
  const map = new Map(rows.map((r) => [r.id, r.sort_order]));
  return ids.map((id) => map.get(id)!);
}

const put = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "PUT", body: JSON.stringify(body) });
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

test("PUT /api/workpackages: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/workpackages/route");
  assert.equal((await PUT(put({}))).status, 401);
});

test("PUT /api/workpackages: engineer/subcon/viewer → 403, DB không đổi", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wp403");
  const a = await taoNhom(sheetTypeId, "A", 1);
  const b = await taoNhom(sheetTypeId, "B", 2);
  const { PUT } = await import("@/app/api/workpackages/route");
  for (const role of ["engineer", "subcon", "viewer"]) {
    await dangNhapDuAn(await taoUser(role, `wp403${role}`), projectId);
    const res = await PUT(put({ sheetTypeId, ids: [b, a] }));
    assert.equal(res.status, 403, role);
  }
  assert.deepEqual(await thuTu("work_packages", [a, b]), [1, 2]);
});

test("PUT /api/workpackages: PM đảo thứ tự → sort_order 1..n đúng thứ tự gửi", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpok");
  const a = await taoNhom(sheetTypeId, "A", 1);
  const b = await taoNhom(sheetTypeId, "B", 2);
  const c = await taoNhom(sheetTypeId, "C", 3);
  // Nhóm ở sheet khác không được đụng tới.
  const khac = await dungSheet("wpokkhac");
  const x = await taoNhom(khac.sheetTypeId, "X", 7);
  await dangNhapDuAn(await taoUser("pm", "wpok"), projectId);
  const { PUT } = await import("@/app/api/workpackages/route");
  const res = await PUT(put({ sheetTypeId, ids: [c, a, b] }));
  assert.equal(res.status, 200);
  assert.deepEqual(await thuTu("work_packages", [c, a, b]), [1, 2, 3]);
  assert.deepEqual(await thuTu("work_packages", [x]), [7]);
  // Gửi lại y hệt (mạng chập chờn) → idempotent.
  assert.equal((await PUT(put({ sheetTypeId, ids: [c, a, b] }))).status, 200);
  assert.deepEqual(await thuTu("work_packages", [c, a, b]), [1, 2, 3]);
});

test("PUT /api/workpackages: thiếu/thừa/lẫn id sheet khác → 409, DB không đổi", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wp409");
  const a = await taoNhom(sheetTypeId, "A", 1);
  const b = await taoNhom(sheetTypeId, "B", 2);
  const khac = await dungSheet("wp409khac");
  const x = await taoNhom(khac.sheetTypeId, "X", 1);
  await dangNhapDuAn(await taoUser("admin", "wp409"), projectId);
  const { PUT } = await import("@/app/api/workpackages/route");
  for (const ids of [[b], [b, a, x], [b, x]]) {
    const res = await PUT(put({ sheetTypeId, ids }));
    assert.equal(res.status, 409, JSON.stringify(ids));
  }
  assert.deepEqual(await thuTu("work_packages", [a, b, x]), [1, 2, 1]);
});

test("PUT /api/workpackages: input sai → 400/422; sheet không tồn tại → 404", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpval");
  const a = await taoNhom(sheetTypeId, "A", 1);
  await dangNhapDuAn(await taoUser("pm", "wpval"), projectId);
  const { PUT } = await import("@/app/api/workpackages/route");
  assert.equal((await PUT(put({ ids: [a] }))).status, 400);
  assert.equal((await PUT(put({ sheetTypeId, ids: [] }))).status, 400);
  assert.equal((await PUT(put({ sheetTypeId, ids: [a, a] }))).status, 422);
  assert.equal((await PUT(put({ sheetTypeId, ids: ["x"] }))).status, 422);
  assert.equal((await PUT(put({ sheetTypeId: 2_000_000_000, ids: [a] }))).status, 404);
});

test("PUT /api/workpackages/:id/tasks: 401 / 403 engineer", S, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/workpackages/[id]/tasks/route");
  assert.equal((await PUT(put({}), params(1))).status, 401);
  const { projectId, sheetTypeId } = await dungSheet("tk403");
  const p = await taoNhom(sheetTypeId, "P", 1);
  const t1 = await taoTask(p, "T1", 1);
  const t2 = await taoTask(p, "T2", 2);
  await dangNhapDuAn(await taoUser("engineer", "tk403"), projectId);
  assert.equal((await PUT(put({ ids: [t2, t1] }), params(p))).status, 403);
  assert.deepEqual(await thuTu("tasks", [t1, t2]), [1, 2]);
});

test("PUT /api/workpackages/:id/tasks: PM đảo thứ tự task trong nhóm", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tkok");
  const p = await taoNhom(sheetTypeId, "P", 1);
  const q = await taoNhom(sheetTypeId, "Q", 2);
  const t1 = await taoTask(p, "T1", 1);
  const t2 = await taoTask(p, "T2", 2);
  const t3 = await taoTask(p, "T3", 3);
  const u1 = await taoTask(q, "U1", 5);
  await dangNhapDuAn(await taoUser("pm", "tkok"), projectId);
  const { PUT } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await PUT(put({ ids: [t3, t1, t2] }), params(p));
  assert.equal(res.status, 200);
  assert.deepEqual(await thuTu("tasks", [t3, t1, t2]), [1, 2, 3]);
  assert.deepEqual(await thuTu("tasks", [u1]), [5]);
});

test("PUT /api/workpackages/:id/tasks: kéo task sang nhóm khác bị chặn (409)", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tk409");
  const p = await taoNhom(sheetTypeId, "P", 1);
  const q = await taoNhom(sheetTypeId, "Q", 2);
  const t1 = await taoTask(p, "T1", 1);
  const u1 = await taoTask(q, "U1", 1);
  await dangNhapDuAn(await taoUser("pm", "tk409"), projectId);
  const { PUT } = await import("@/app/api/workpackages/[id]/tasks/route");
  assert.equal((await PUT(put({ ids: [u1, t1] }), params(p))).status, 409);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ package_id: number }>(
    `SELECT package_id FROM tasks WHERE id = ?`,
    u1,
  );
  assert.equal(row?.package_id, q);
  assert.deepEqual(await thuTu("tasks", [t1, u1]), [1, 1]);
});

test("PUT /api/workpackages/:id/tasks: id nhóm sai → 400, không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("tk404");
  await dangNhapDuAn(await taoUser("pm", "tk404"), projectId);
  const { PUT } = await import("@/app/api/workpackages/[id]/tasks/route");
  assert.equal((await PUT(put({ ids: [1] }), params("abc"))).status, 400);
  assert.equal((await PUT(put({ ids: [1] }), params(2_000_000_000))).status, 404);
});

test("thuTuSauKhiTha: dời phần tử tới vị trí đích; thả tại chỗ/id lạ → null", async () => {
  const { thuTuSauKhiTha } = await import("@/app/tracking/[sheet]/KeoTha");
  assert.deepEqual(thuTuSauKhiTha([1, 2, 3, 4], 4, 1), [4, 1, 2, 3]);
  assert.deepEqual(thuTuSauKhiTha([1, 2, 3, 4], 1, 3), [2, 3, 1, 4]);
  assert.equal(thuTuSauKhiTha([1, 2, 3], 2, 2), null);
  assert.equal(thuTuSauKhiTha([1, 2, 3], 9, 1), null);
});
