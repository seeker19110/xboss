import { HAS_TEST_DB } from "./setup";
import { dangNhap, dangNhapDuAn } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S02a cụm 3 — route payment phải fail-closed theo dự án đã xác minh: không dự án khả kiến
// → 404 không ghi; bản ghi dự án khác cùng org → 404, DB không đổi; dòng legacy
// project_id NULL không sửa/xoá/đọc qua dự án nào; đúng dự án → như cũ.
const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let seq = 0;

async function taoDuAn(ten: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02a3 ${RUN} ${ten}`);
}

async function taoUser(role: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-s02a3', ?, 1)`,
    `S02a3 ${RUN}`,
    `s02a3-${RUN}-${++seq}@test.local`,
    role,
  );
  const row = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: row!.password_hash };
}

/** PM không thuộc dự án nào trong khi user_projects khác rỗng → không dự án khả kiến. */
async function taoUserKhongDuAn() {
  const khac = await taoUser("pm");
  const p = await taoDuAn("membership-guard");
  const { run } = await import("@/lib/db");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, khac.id, p);
  return taoUser("pm");
}

async function taoSheet(projectId: number, nhan: string) {
  const { insertId } = await import("@/lib/db");
  const tower = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${RUN} ${nhan}`,
  );
  const responsible = `NPT ${RUN} ${nhan}`;
  const sheet = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, responsible) VALUES (?, ?, ?, ?, ?)`,
    tower,
    `S3-${RUN}-${nhan}`,
    `Sheet ${RUN} ${nhan}`,
    `s3-${RUN}-${nhan}`,
    responsible,
  );
  await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, ?, 'T1')`,
    sheet,
    `WP-${RUN}-${nhan}`,
    `Nhóm ${nhan}`,
  );
  return { sheet, responsible };
}

async function taoBill(projectId: number | null, sheetTypeId: number | null = null, who = "NT") {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO payment_bills
       (responsible, type, amount, paid_date, project_id, sheet_type_id, floor_label, note)
     VALUES (?, 'bill', 1200, CURRENT_DATE, ?, ?, ?, 'goc')`,
    who,
    projectId,
    sheetTypeId,
    sheetTypeId != null ? "T1" : null,
  );
}

async function docBill(id: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{ note: string | null }>(`SELECT note FROM payment_bills WHERE id = ?`, id);
}

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const patchReq = (id: number) =>
  new NextRequest(`http://localhost/api/payments/bills/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ note: "da-sua" }),
  });
const delReq = (id: number) =>
  new NextRequest(`http://localhost/api/payments/bills/${id}`, { method: "DELETE" });

// ---------------- PATCH/DELETE /api/payments/bills/:id ----------------

test("bills/:id: không dự án khả kiến → 404, không ghi/xoá", S, async () => {
  const p = await taoDuAn("nv");
  const bill = await taoBill(p);
  const legacy = await taoBill(null);
  dangNhap(await taoUserKhongDuAn());
  const { PATCH, DELETE } = await import("@/app/api/payments/bills/[id]/route");
  for (const id of [bill, legacy]) {
    const r1 = await PATCH(patchReq(id), ctx(id));
    assert.equal(r1.status, 404);
    assert.equal(r1.headers.get("cache-control"), "private, no-store");
    assert.equal((await DELETE(delReq(id), ctx(id))).status, 404);
    assert.equal((await docBill(id))?.note, "goc");
  }
});

test("bills/:id: bill dự án khác cùng org → 404, DB không đổi", S, async () => {
  const a = await taoDuAn("a");
  const b = await taoDuAn("b");
  const billB = await taoBill(b);
  const user = await taoUser("pm");
  await dangNhapDuAn(user, a);
  const { PATCH, DELETE } = await import("@/app/api/payments/bills/[id]/route");
  assert.equal((await PATCH(patchReq(billB), ctx(billB))).status, 404);
  assert.equal((await DELETE(delReq(billB), ctx(billB))).status, 404);
  assert.equal((await docBill(billB))?.note, "goc");
});

test("bills/:id: dòng legacy NULL và bill có sheet dự án khác → 404", S, async () => {
  const a = await taoDuAn("leg-a");
  const b = await taoDuAn("leg-b");
  const { sheet: sheetB } = await taoSheet(b, "legb");
  const legacy = await taoBill(null);
  const lechSheet = await taoBill(a, sheetB);
  const user = await taoUser("admin");
  await dangNhapDuAn(user, a);
  const { PATCH, DELETE } = await import("@/app/api/payments/bills/[id]/route");
  for (const id of [legacy, lechSheet]) {
    assert.equal((await PATCH(patchReq(id), ctx(id))).status, 404);
    assert.equal((await DELETE(delReq(id), ctx(id))).status, 404);
    assert.equal((await docBill(id))?.note, "goc");
  }
});

test("bills/:id: đúng dự án → sửa và xoá được; chưa đăng nhập 401", S, async () => {
  const a = await taoDuAn("ok");
  const bill = await taoBill(a);
  const user = await taoUser("pm");
  await dangNhapDuAn(user, a);
  const { PATCH, DELETE } = await import("@/app/api/payments/bills/[id]/route");
  const r = await PATCH(patchReq(bill), ctx(bill));
  assert.equal(r.status, 200);
  assert.equal((await docBill(bill))?.note, "da-sua");
  assert.equal((await DELETE(delReq(bill), ctx(bill))).status, 200);
  assert.equal((await docBill(bill)) ?? null, null);
  const { dangXuat } = await import("./helpers/phien");
  dangXuat();
  assert.equal((await PATCH(patchReq(bill), ctx(bill))).status, 401);
});

// ---------------- GET /api/payments/floors ----------------

const floorsReq = (person: string) =>
  new NextRequest(`http://localhost/api/payments/floors?person=${encodeURIComponent(person)}`);

test("floors GET: không dự án khả kiến → 404, không dữ liệu", S, async () => {
  const p = await taoDuAn("fl-nv");
  const { responsible } = await taoSheet(p, "flnv");
  dangNhap(await taoUserKhongDuAn());
  const { GET } = await import("@/app/api/payments/floors/route");
  const r = await GET(floorsReq(responsible));
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal((await r.json()).floors, undefined);
});

test("floors GET: tầng/bill dự án khác và legacy NULL không lộ; đúng dự án như cũ", S, async () => {
  const a = await taoDuAn("fl-a");
  const b = await taoDuAn("fl-b");
  const sa = await taoSheet(a, "fla");
  const sb = await taoSheet(b, "flb");
  const billA = await taoBill(a, sa.sheet, sa.responsible);
  await taoBill(null, sa.sheet, sa.responsible); // legacy NULL cùng tầng
  await taoBill(b, sa.sheet, sa.responsible); // bill dự án khác gắn sheet A
  const user = await taoUser("pm");
  await dangNhapDuAn(user, a);
  const { GET } = await import("@/app/api/payments/floors/route");

  const rb = await GET(floorsReq(sb.responsible));
  assert.equal(rb.status, 200);
  assert.deepEqual((await rb.json()).floors, []);

  const ra = await GET(floorsReq(sa.responsible));
  assert.equal(ra.status, 200);
  assert.equal(ra.headers.get("cache-control"), "private, no-store");
  const { floors } = await ra.json();
  assert.equal(floors.length, 1);
  assert.equal(floors[0].history.length, 1);
  assert.ok(billA > 0);
});

// ---------------- GET /api/payments ----------------

const payReq = () => new NextRequest("http://localhost/api/payments");

test("payments GET: không dự án khả kiến → 404", S, async () => {
  dangNhap(await taoUserKhongDuAn());
  const { GET } = await import("@/app/api/payments/route");
  const r = await GET(payReq());
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});

test("payments GET: cookie dự án không được cấp → 404 (không fallback)", S, async () => {
  const a = await taoDuAn("pg-a");
  const b = await taoDuAn("pg-b");
  const user = await taoUser("pm");
  await dangNhapDuAn(user, a);
  dangNhap(user, b);
  const { GET } = await import("@/app/api/payments/route");
  assert.equal((await GET(payReq())).status, 404);
});

test("payments GET: chỉ tầng của dự án đang chọn", S, async () => {
  const a = await taoDuAn("pg-ok-a");
  const b = await taoDuAn("pg-ok-b");
  const sa = await taoSheet(a, "pga");
  const sb = await taoSheet(b, "pgb");
  const user = await taoUser("pm");
  await dangNhapDuAn(user, a);
  const { GET } = await import("@/app/api/payments/route");
  const r = await GET(payReq());
  assert.equal(r.status, 200);
  const { rows } = await r.json();
  const ids = rows.map((x: { sheetTypeId: number }) => x.sheetTypeId);
  assert.ok(ids.includes(sa.sheet));
  assert.ok(!ids.includes(sb.sheet));
});
