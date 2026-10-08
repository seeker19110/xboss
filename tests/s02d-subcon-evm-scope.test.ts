import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S02 (A1-AC01/AC02) — nhà thầu phụ + EVM. Gọi route handler thật.
// - /api/subcontractors (+ [supplierId]): công nợ là tiền → che theo CAN.viewPayments; công nợ
//   chỉ tính hợp đồng của dự án đang chọn; NCC chỉ cùng org; không dự án → rỗng/404.
// - /api/dashboard/evm: không dự án → rỗng đúng shape, không tính "toàn hệ".

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let seq = 0;

type U = { id: number; passwordHash: string; orgId?: number };
const ctx = {} as {
  orgB: number;
  pA: number;
  pB: number;
  supplier: number; // NTP org 1, có HĐ ở cả dự án A lẫn B
  supplierOrgB: number; // NTP org B
  supplierTagB: number; // NTP org 1, hồ sơ gắn riêng dự án B
  pm: U; // pm, gán dự án A
  engineer: U; // engineer (không viewPayments), gán dự án A
  bch: U; // bch (viewPayments), gán dự án A
  pmNone: U; // pm, không gán dự án nào
  bchNone: U; // bch, không gán dự án nào
};

async function taoUser(role: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02d', ?, 1)`,
    `S02d ${RUN}`,
    `s02d-${RUN}-${++seq}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-s02d" };
}

async function taoNtp(ten: string, orgId: number, sysId: number): Promise<number> {
  const { insertId, run } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO suppliers (name, org_id) VALUES (?, ?)`,
    `S02D-NTP-${RUN}-${ten}`,
    orgId,
  );
  await run(`INSERT INTO system_contractors (system_id, supplier_id) VALUES (?, ?)`, sysId, id);
  return id;
}

// HĐ giao thầu value tại dự án, đã thanh toán `paid` → công nợ = value − paid.
async function taoHopDong(projectId: number, tag: string, value: number, paid: number) {
  const { insertId } = await import("@/lib/db");
  const cid = await insertId(
    `INSERT INTO contracts (code, kind, title, party_supplier_id, value, status, project_id)
     VALUES (?, 'giao_thau', ?, ?, ?, 'active', ?)`,
    `S02D-HD-${RUN}-${tag}`,
    `HĐ S02d ${tag}`,
    ctx.supplier,
    value,
    projectId,
  );
  await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id, project_id)
     VALUES ('S02d', 'bill', ?, '2026-07-01', ?, ?)`,
    paid,
    cid,
    projectId,
  );
}

// WBS tối thiểu 1 task/dự án cho EVM.
async function taoWbs(projectId: number, tag: string): Promise<void> {
  const { insertId, daysFromTodayISO } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp S02d ${tag}`,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
    towerId,
    `S02D${RUN}${tag}`,
    `Sheet ${tag}`,
    `s02d-${RUN}-${tag}`.toLowerCase(),
  );
  const pkg = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
     VALUES (?, ?, 'Nhóm S02d', 'T1', ?, ?)`,
    sheetId,
    `PKG-${RUN}-${tag}`,
    daysFromTodayISO(-20),
    daysFromTodayISO(10),
  );
  await insertId(
    `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent, status)
     VALUES (?, ?, ?, ?, ?, 0.3, 'dang_thi_cong')`,
    pkg,
    `T-${RUN}-${tag}`,
    `S02D-TASK-${RUN}-${tag}`,
    daysFromTodayISO(-20),
    daysFromTodayISO(10),
  );
}

const req = (url: string) => new NextRequest(`http://localhost${url}`);
const chiTiet = async (supplierId: number, v1 = false) => {
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const url = `/api/subcontractors/${supplierId}`;
  return GET(v1 ? reqV1(url) : req(url), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
};
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
const reqV1 = (url: string) => new NextRequest(`http://localhost${url}`, { headers: V1 });
const danhSach = async (v1 = false) => {
  const { GET } = await import("@/app/api/subcontractors/route");
  return GET(v1 ? reqV1("/api/subcontractors") : req("/api/subcontractors"));
};
type Item = { id: number; outstanding: number | string | null };

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  ctx.orgB = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S02d org B ${RUN}`);
  ctx.pA = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02d A ${RUN}`);
  ctx.pB = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02d B ${RUN}`);
  const sysId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ S02d')`,
    `S02D-${RUN}`,
  );
  ctx.supplier = await taoNtp("chinh", 1, sysId);
  ctx.supplierOrgB = await taoNtp("orgB", ctx.orgB, sysId);
  ctx.supplierTagB = await taoNtp("tagB", 1, sysId);
  await run(
    `INSERT INTO subcontractor_profiles (supplier_id, project_id, site_rep_name) VALUES (?, ?, ?)`,
    ctx.supplierTagB,
    ctx.pB,
    `S02D-REP-${RUN}`,
  );
  // Dự án A: 1000 − 300 = 700 còn nợ; dự án B: 5000 − 1000 = 4000 (không được lẫn vào A).
  await taoHopDong(ctx.pA, "A", 1000, 300);
  await taoHopDong(ctx.pB, "B", 5000, 1000);
  await taoWbs(ctx.pA, "A");
  await taoWbs(ctx.pB, "B");

  ctx.pm = await taoUser("pm");
  ctx.engineer = await taoUser("engineer");
  ctx.bch = await taoUser("bch");
  ctx.pmNone = await taoUser("pm");
  ctx.bchNone = await taoUser("bch");
  // Gán vào A ⇒ user_projects khác rỗng ⇒ *None (không gán) không thấy dự án nào.
  await dangNhapDuAn(ctx.pm, ctx.pA);
  await dangNhapDuAn(ctx.engineer, ctx.pA);
  await dangNhapDuAn(ctx.bch, ctx.pA);
});

// ===== /api/subcontractors =====

test("GET /api/subcontractors: công nợ chỉ HĐ của dự án đang chọn (PM)", S, async () => {
  await dangNhapDuAn(ctx.pm, ctx.pA);
  const res = await danhSach();
  assert.equal(res.status, 200);
  const items: Item[] = (await res.json()).items;
  const row = items.find((i) => i.id === ctx.supplier);
  assert.ok(row, "NTP cùng org hiện trong danh sách");
  assert.equal(row.outstanding, 700, "không cộng HĐ dự án B (4000)");
});

test("GET /api/subcontractors: vai trò thiếu viewPayments bị che công nợ", S, async () => {
  await dangNhapDuAn(ctx.engineer, ctx.pA);
  const items: Item[] = (await (await danhSach()).json()).items;
  const row = items.find((i) => i.id === ctx.supplier);
  assert.ok(row, "engineer vẫn xem được danh sách NTP");
  assert.equal(row.outstanding, null, "engineer không được thấy tiền công nợ");
  assert.ok("outstanding" in row, "giữ đúng shape (trường có mặt, giá trị null)");

  await dangNhapDuAn(ctx.bch, ctx.pA);
  const forBch: Item[] = (await (await danhSach()).json()).items;
  assert.equal(forBch.find((i) => i.id === ctx.supplier)?.outstanding, 700, "BCH xem được");
});

test("GET /api/subcontractors: không lộ NCC org khác, hồ sơ gắn dự án khác", S, async () => {
  await dangNhapDuAn(ctx.pm, ctx.pA);
  const ids = ((await (await danhSach()).json()).items as Item[]).map((i) => i.id);
  assert.ok(!ids.includes(ctx.supplierOrgB), "NCC org B không được liệt kê cho org 1");
  assert.ok(!ids.includes(ctx.supplierTagB), "hồ sơ gắn dự án B không hiện ở dự án A");
});

test("GET /api/subcontractors: không có dự án khả kiến → rỗng đúng shape", S, async () => {
  await dangNhapDuAn(ctx.pmNone, null);
  const res = await danhSach();
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(j, { items: [] });
});

// ===== /api/subcontractors/:supplierId =====

test("GET /api/subcontractors/:id: công nợ chỉ HĐ dự án đang chọn (PM)", S, async () => {
  await dangNhapDuAn(ctx.pm, ctx.pA);
  const res = await chiTiet(ctx.supplier);
  assert.equal(res.status, 200);
  const { item } = await res.json();
  assert.equal(item.debt.contractValue, 1000);
  assert.equal(item.debt.paid, 300);
  assert.equal(item.debt.outstanding, 700);
  assert.deepEqual(
    item.debt.contracts.map((c: { code: string }) => c.code),
    [`S02D-HD-${RUN}-A`],
    "không lộ HĐ dự án B",
  );
});

test("GET /api/subcontractors/:id: engineer bị che toàn bộ khối công nợ", S, async () => {
  await dangNhapDuAn(ctx.engineer, ctx.pA);
  const res = await chiTiet(ctx.supplier);
  assert.equal(res.status, 200);
  const { item } = await res.json();
  assert.equal(item.id, ctx.supplier, "hồ sơ vẫn xem được");
  assert.equal(item.debt, null, "giá trị HĐ/đã thanh toán/còn nợ không được lộ");
  assert.ok(!JSON.stringify(item).includes(`S02D-HD-${RUN}`), "không lộ mã HĐ");
});

test(
  "GET /api/subcontractors/:id: không dự án → 404; NCC org khác/hồ sơ dự án khác → 404",
  S,
  async () => {
    await dangNhapDuAn(ctx.pmNone, null);
    const res = await chiTiet(ctx.supplier);
    assert.equal(res.status, 404);
    assert.ok(!JSON.stringify(await res.json()).includes(RUN), "không lộ dữ liệu đã seed");

    await dangNhapDuAn(ctx.pm, ctx.pA);
    assert.equal((await chiTiet(ctx.supplierOrgB)).status, 404, "NCC org khác");
    const tagB = await chiTiet(ctx.supplierTagB);
    assert.equal(tagB.status, 404, "hồ sơ gắn riêng dự án B không xem được từ dự án A");
  },
);

// ===== /api/dashboard/evm =====

test("GET /api/dashboard/evm: không dự án → rỗng đúng shape; dự án A không lẫn B", S, async () => {
  const { GET } = await import("@/app/api/dashboard/evm/route");
  for (const u of [ctx.pmNone, ctx.bchNone]) {
    await dangNhapDuAn(u, null);
    const res = await GET(req("/api/dashboard/evm"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { series: [], summary: null }, "không tính toàn hệ");
    const cash = await GET(req("/api/dashboard/evm?source=cash"));
    assert.deepEqual(await cash.json(), { series: [], summary: null });
  }

  await dangNhapDuAn(ctx.bch, ctx.pA);
  const j = await (await GET(req("/api/dashboard/evm"))).json();
  assert.ok(j.summary, "đúng dự án → có số liệu");
  assert.equal(j.summary.totalTasks, 1, "chỉ task của dự án A");
});

// Gộp S10c: che (null) TRƯỚC rồi mới đổi wire — ở decimal-string-v1, trường bị che vẫn null
// (không thành "0.00"), trường được xem là chuỗi canonical.
test("decimal-string-v1: trường bị che giữ null, trường được xem là chuỗi exact", S, async () => {
  await dangNhapDuAn(ctx.engineer, ctx.pA);
  const ds = await (await danhSach(true)).json();
  assert.equal(ds.moneyFormat, "decimal-string-v1");
  assert.equal(ds.items.find((i: Item) => i.id === ctx.supplier)?.outstanding, null);
  const ct = await (await chiTiet(ctx.supplier, true)).json();
  assert.equal(ct.item.debt, null);

  await dangNhapDuAn(ctx.pm, ctx.pA);
  const dsPm = await (await danhSach(true)).json();
  assert.equal(dsPm.items.find((i: Item) => i.id === ctx.supplier)?.outstanding, "700.00");
  const ctPm = await (await chiTiet(ctx.supplier, true)).json();
  assert.equal(ctPm.item.debt.outstanding, "700.00");
  assert.equal(ctPm.item.debt.contracts.length, 1);
});
