import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Đợt 6, Việc G — vá cụm lỗ hổng "kiểm tồn tại theo id nhưng thiếu lọc dự án/tổ chức".
// Đường GHI nhận id thực thể từ body rồi chỉ kiểm TỒN TẠI (`SELECT id FROM <bảng> WHERE
// id = ?`), không kiểm thực thể đó thuộc dự án/tổ chức của người gọi — trong khi đường ĐỌC
// cùng cụm lọc đúng. Id là số nguyên tuần tự nên đoán được; "đã kiểm tồn tại" KHÔNG cách ly
// gì cả. Mỗi route dưới đây có cả ca tham chiếu XUYÊN dự án/tổ chức (kèm kiểm dữ liệu bên
// kia KHÔNG đổi) lẫn ca tham chiếu HỢP LỆ trong phạm vi của mình (vẫn 200/201, ghi đúng).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

// ============================================================================
// Hạ tầng dựng dữ liệu — mọi id đều lấy từ các hàm tao*() dưới đây, không gán cứng.
// ============================================================================

async function taoToChuc(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${uniq(ten)}`);
}

async function taoDuAn(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, `CLTR ${uniq(ten)}`, orgId);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `cltr-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-cltr', ?, ?)`,
    `CLTR ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId };
}

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

/** Dựng dự án + tháp + sheet — chuỗi tối thiểu để suy project_id cho work_package/task. */
async function dungSheet(ten: string, orgId = 1): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten, orgId);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp CLTR')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet CLTR', ?)`,
    towerId,
    `CLTR${uniq(ten)}`,
    `cltr-${ten.toLowerCase()}-${uniq("slug")}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoNhom(sheetTypeId: number, code: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES (?, ?, ?, 1)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
  );
}

async function taoTask(packageId: number, code: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order) VALUES (?, ?, ?, 1)`,
    packageId,
    code,
    `Task ${code}`,
  );
}

async function taoBoqItem(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, project_id) VALUES (?, ?, 'm', ?)`,
    `BOQCLTR-${uniq(ten)}`,
    `BOQ ${ten}`,
    projectId,
  );
}

async function taoVatTu(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO materials (name, unit, project_id) VALUES (?, 'cái', ?)`,
    `VT ${uniq(ten)}`,
    projectId,
  );
}

async function taoNhaCungCap(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, `NCC ${uniq(ten)}`, orgId);
}

async function taoGoiThau(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tender_packages (code, name, project_id) VALUES (?, ?, ?)`,
    `GT-${uniq(ten)}`,
    `Gói thầu ${ten}`,
    projectId,
  );
}

async function taoCuocHop(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO meetings (meeting_date, title, project_id) VALUES (CURRENT_DATE, ?, ?)`,
    `Họp ${uniq(ten)}`,
    projectId,
  );
}

async function taoRuiRo(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO risks (code, title, category, probability, impact, project_id)
     VALUES (?, ?, 'schedule', 3, 3, ?)`,
    `R-${uniq(ten)}`,
    `Rủi ro ${ten}`,
    projectId,
  );
}

async function taoHangMucBanGiao(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO handover_items (project_id, title) VALUES (?, ?)`,
    projectId,
    `Bàn giao ${uniq(ten)}`,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// POST /api/tenders — boq_items phải thuộc đúng dự án đang chọn
// ============================================================================

test("POST /api/tenders: dòng BOQ thuộc dự án khác → 422, KHÔNG tạo gói thầu", S, async () => {
  const a = await dungSheet("tenderA");
  const b = await dungSheet("tenderB");
  const boqB = await taoBoqItem(b.projectId, "tenderHack");
  const pmA = await taoUser("pm", "tenderA");
  await dangNhapDuAn(pmA, a.projectId);

  const tenGoi = `Gói thầu hack ${uniq("tender")}`;
  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(
    jreq("/api/tenders", {
      name: tenGoi,
      items: [{ boqItemId: boqB, qty: 1 }],
    }),
  );
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const tender = await queryOne(`SELECT id FROM tender_packages WHERE name = ?`, tenGoi);
  assert.equal(tender, undefined, "không được tạo gói thầu tham chiếu BOQ dự án khác");
  const boqRow = await queryOne<{ projectId: number }>(
    `SELECT project_id AS "projectId" FROM boq_items WHERE id = ?`,
    boqB,
  );
  assert.equal(boqRow?.projectId, b.projectId, "dòng BOQ dự án B không đổi chủ");
});

test("POST /api/tenders: dòng BOQ đúng dự án của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("tenderOk");
  const boqA = await taoBoqItem(a.projectId, "tenderOk");
  const pmA = await taoUser("pm", "tenderOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(
    jreq("/api/tenders", {
      name: "Gói thầu hợp lệ",
      items: [{ boqItemId: boqA, qty: 2 }],
    }),
  );
  assert.equal(res.status, 201);

  const { queryOne } = await import("@/lib/db");
  const { id } = await res.json();
  const item = await queryOne(
    `SELECT boq_item_id AS "boqItemId" FROM tender_items WHERE tender_id = ?`,
    id,
  );
  assert.equal((item as { boqItemId: number } | undefined)?.boqItemId, boqA);
});

// ============================================================================
// POST /api/purchase-requests — materials phải thuộc đúng dự án đang chọn
// ============================================================================

test(
  "POST /api/purchase-requests: vật tư thuộc dự án khác → 404, KHÔNG tạo yêu cầu",
  S,
  async () => {
    const a = await dungSheet("prA");
    const b = await dungSheet("prB");
    const vatTuB = await taoVatTu(b.projectId, "prHack");
    const pmA = await taoUser("pm", "prA");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/purchase-requests/route");
    const res = await POST(jreq("/api/purchase-requests", { materialId: vatTuB, qtyRequested: 5 }));
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const pr = await queryOne(`SELECT id FROM purchase_requests WHERE material_id = ?`, vatTuB);
    assert.equal(pr, undefined, "không được tạo yêu cầu mua vật tư dự án khác");
  },
);

test(
  "POST /api/purchase-requests: vật tư đúng dự án của mình → 201, tạo thành công",
  S,
  async () => {
    const a = await dungSheet("prOk");
    const vatTuA = await taoVatTu(a.projectId, "prOk");
    const pmA = await taoUser("pm", "prOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/purchase-requests/route");
    const res = await POST(jreq("/api/purchase-requests", { materialId: vatTuA, qtyRequested: 5 }));
    assert.equal(res.status, 201);

    const { queryOne } = await import("@/lib/db");
    const { id } = await res.json();
    const row = await queryOne<{ projectId: number }>(
      `SELECT project_id AS "projectId" FROM purchase_requests WHERE id = ?`,
      id,
    );
    assert.equal(row?.projectId, a.projectId);
  },
);

// ============================================================================
// POST /api/tenders/:id/bids — suppliers phải thuộc đúng tổ chức
// ============================================================================

test("POST /api/tenders/:id/bids: NCC thuộc tổ chức khác → 422, KHÔNG tạo báo giá", S, async () => {
  const a = await dungSheet("bidA");
  const goiThauA = await taoGoiThau(a.projectId, "bidA");
  const orgB = await taoToChuc("bidOrgB");
  const supplierB = await taoNhaCungCap("bidB", orgB);
  const pmA = await taoUser("pm", "bidA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { supplierId: supplierB, lumpSum: 1000 }), {
    params: Promise.resolve({ id: String(goiThauA) }),
  });
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const bid = await queryOne(
    `SELECT id FROM tender_bids WHERE tender_id = ? AND supplier_id = ?`,
    goiThauA,
    supplierB,
  );
  assert.equal(bid, undefined, "không được tạo báo giá của NCC tổ chức khác");
});

test("POST /api/tenders/:id/bids: NCC đúng tổ chức của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("bidOk");
  const goiThauA = await taoGoiThau(a.projectId, "bidOk");
  const supplierA = await taoNhaCungCap("bidOk", 1);
  const pmA = await taoUser("pm", "bidOk", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { supplierId: supplierA, lumpSum: 1000 }), {
    params: Promise.resolve({ id: String(goiThauA) }),
  });
  assert.equal(res.status, 201);
});

// ============================================================================
// POST /api/crews — suppliers phải thuộc đúng tổ chức
// ============================================================================

test("POST /api/crews: NCC thuộc tổ chức khác → 422, KHÔNG tạo tổ đội", S, async () => {
  const a = await dungSheet("crewPostA");
  const orgB = await taoToChuc("crewPostOrgB");
  const supplierB = await taoNhaCungCap("crewPostB", orgB);
  const pmA = await taoUser("pm", "crewPostA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const tenTo = `Tổ hack ${uniq("crew")}`;
  const { POST } = await import("@/app/api/crews/route");
  const res = await POST(jreq("/x", { name: tenTo, supplierId: supplierB }));
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const crew = await queryOne(`SELECT id FROM crews WHERE name = ?`, tenTo);
  assert.equal(crew, undefined, "không được tạo tổ đội gắn NCC tổ chức khác");
});

test("POST /api/crews: NCC đúng tổ chức của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("crewPostOk");
  const supplierA = await taoNhaCungCap("crewPostOk", 1);
  const pmA = await taoUser("pm", "crewPostOk", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/crews/route");
  const res = await POST(jreq("/x", { name: "Tổ hợp lệ", supplierId: supplierA }));
  assert.equal(res.status, 201);
});

// ============================================================================
// PATCH /api/crews/:id — suppliers phải thuộc đúng tổ chức
// ============================================================================

async function taoToDoi(
  projectId: number,
  ten: string,
  overrides: { supplierId?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO crews (project_id, name, supplier_id) VALUES (?, ?, ?)`,
    projectId,
    `Tổ ${uniq(ten)}`,
    overrides.supplierId ?? null,
  );
}

test("PATCH /api/crews/:id: NCC thuộc tổ chức khác → 422, KHÔNG đổi", S, async () => {
  const a = await dungSheet("crewPatchA");
  const crewA = await taoToDoi(a.projectId, "crewPatchA");
  const orgB = await taoToChuc("crewPatchOrgB");
  const supplierB = await taoNhaCungCap("crewPatchB", orgB);
  const pmA = await taoUser("pm", "crewPatchA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/crews/[id]/route");
  const res = await PATCH(jreq("/x", { supplierId: supplierB }, "PATCH"), {
    params: Promise.resolve({ id: String(crewA) }),
  });
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ supplierId: number | null }>(
    `SELECT supplier_id AS "supplierId" FROM crews WHERE id = ?`,
    crewA,
  );
  assert.equal(row?.supplierId, null, "supplier_id của tổ đội không bị đổi nhầm");
});

test("PATCH /api/crews/:id: NCC đúng tổ chức của mình → 200, đổi thành công", S, async () => {
  const a = await dungSheet("crewPatchOk");
  const crewA = await taoToDoi(a.projectId, "crewPatchOk");
  const supplierA = await taoNhaCungCap("crewPatchOk", 1);
  const pmA = await taoUser("pm", "crewPatchOk", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/crews/[id]/route");
  const res = await PATCH(jreq("/x", { supplierId: supplierA }, "PATCH"), {
    params: Promise.resolve({ id: String(crewA) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ supplierId: number | null }>(
    `SELECT supplier_id AS "supplierId" FROM crews WHERE id = ?`,
    crewA,
  );
  assert.equal(row?.supplierId, supplierA);
});

// ============================================================================
// POST /api/personnel — suppliers phải thuộc đúng tổ chức
// ============================================================================

test("POST /api/personnel: NCC thuộc tổ chức khác → 422, KHÔNG tạo nhân sự", S, async () => {
  const a = await dungSheet("personPostA");
  const orgB = await taoToChuc("personPostOrgB");
  const supplierB = await taoNhaCungCap("personPostB", orgB);
  const pmA = await taoUser("pm", "personPostA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const tenNguoi = `Người hack ${uniq("personnel")}`;
  const { POST } = await import("@/app/api/personnel/route");
  const res = await POST(jreq("/x", { fullName: tenNguoi, supplierId: supplierB }));
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const p = await queryOne(`SELECT id FROM personnel WHERE full_name = ?`, tenNguoi);
  assert.equal(p, undefined, "không được tạo nhân sự gắn NCC tổ chức khác");
});

test("POST /api/personnel: NCC đúng tổ chức của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("personPostOk");
  const supplierA = await taoNhaCungCap("personPostOk", 1);
  const pmA = await taoUser("pm", "personPostOk", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/personnel/route");
  const res = await POST(jreq("/x", { fullName: "Người hợp lệ", supplierId: supplierA }));
  assert.equal(res.status, 201);
});

// ============================================================================
// PATCH /api/personnel/:id — suppliers phải thuộc đúng tổ chức
// ============================================================================

async function taoNhanSu(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NS ${uniq(ten)}`,
  );
}

test("PATCH /api/personnel/:id: NCC thuộc tổ chức khác → 422, KHÔNG đổi", S, async () => {
  const a = await dungSheet("personPatchA");
  const nsA = await taoNhanSu(a.projectId, "personPatchA");
  const orgB = await taoToChuc("personPatchOrgB");
  const supplierB = await taoNhaCungCap("personPatchB", orgB);
  const pmA = await taoUser("pm", "personPatchA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/personnel/[id]/route");
  const res = await PATCH(jreq("/x", { supplierId: supplierB }, "PATCH"), {
    params: Promise.resolve({ id: String(nsA) }),
  });
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ supplierId: number | null }>(
    `SELECT supplier_id AS "supplierId" FROM personnel WHERE id = ?`,
    nsA,
  );
  assert.equal(row?.supplierId, null, "supplier_id của nhân sự không bị đổi nhầm");
});

test("PATCH /api/personnel/:id: NCC đúng tổ chức của mình → 200, đổi thành công", S, async () => {
  const a = await dungSheet("personPatchOk");
  const nsA = await taoNhanSu(a.projectId, "personPatchOk");
  const supplierA = await taoNhaCungCap("personPatchOk", 1);
  const pmA = await taoUser("pm", "personPatchOk", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/personnel/[id]/route");
  const res = await PATCH(jreq("/x", { supplierId: supplierA }, "PATCH"), {
    params: Promise.resolve({ id: String(nsA) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ supplierId: number | null }>(
    `SELECT supplier_id AS "supplierId" FROM personnel WHERE id = ?`,
    nsA,
  );
  assert.equal(row?.supplierId, supplierA);
});

// ============================================================================
// PATCH/DELETE /api/suppliers/:id — phải thuộc đúng tổ chức
// ============================================================================

test("PATCH /api/suppliers/:id: NCC thuộc tổ chức khác → 404, KHÔNG đổi", S, async () => {
  const projectA = await taoDuAn("supPatchA", 1);
  const orgB = await taoToChuc("supPatchOrgB");
  const supplierB = await taoNhaCungCap("supPatchB", orgB);
  const adminA = await taoUser("admin", "supPatchA", 1);
  await dangNhapDuAn(adminA, projectA);

  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Tên hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(supplierB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ name: string }>(
    `SELECT name FROM suppliers WHERE id = ?`,
    supplierB,
  );
  assert.notEqual(row?.name, "Tên hack", "tên NCC tổ chức khác không bị đổi nhầm");
});

test("PATCH /api/suppliers/:id: NCC đúng tổ chức của mình → 200, đổi thành công", S, async () => {
  const projectA = await taoDuAn("supPatchOk", 1);
  const supplierA = await taoNhaCungCap("supPatchOk", 1);
  const adminA = await taoUser("admin", "supPatchOk", 1);
  await dangNhapDuAn(adminA, projectA);

  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Tên đã sửa" }, "PATCH"), {
    params: Promise.resolve({ id: String(supplierA) }),
  });
  assert.equal(res.status, 200);
  const { supplier } = await res.json();
  assert.equal(supplier.name, "Tên đã sửa");
});

test("DELETE /api/suppliers/:id: NCC thuộc tổ chức khác → 404, KHÔNG bị xoá", S, async () => {
  const projectA = await taoDuAn("supDelA", 1);
  const orgB = await taoToChuc("supDelOrgB");
  const supplierB = await taoNhaCungCap("supDelB", orgB);
  const adminA = await taoUser("admin", "supDelA", 1);
  await dangNhapDuAn(adminA, projectA);

  const { DELETE } = await import("@/app/api/suppliers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(supplierB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierB);
  assert.ok(row, "NCC tổ chức khác không bị xoá nhầm");
});

test("DELETE /api/suppliers/:id: NCC đúng tổ chức của mình → 200, xoá thành công", S, async () => {
  const projectA = await taoDuAn("supDelOk", 1);
  const supplierA = await taoNhaCungCap("supDelOk", 1);
  const adminA = await taoUser("admin", "supDelOk", 1);
  await dangNhapDuAn(adminA, projectA);

  const { DELETE } = await import("@/app/api/suppliers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(supplierA) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierA);
  assert.equal(row, undefined);
});

// ============================================================================
// POST /api/admin/assignments — users phải thuộc đúng tổ chức
// ============================================================================

test("POST /api/admin/assignments: user thuộc tổ chức khác → 404, KHÔNG gán", S, async () => {
  const a = await dungSheet("assignA");
  const pkgA = await taoNhom(a.sheetTypeId, "AsgA1");
  const taskA = await taoTask(pkgA, "AsgA1,01");
  const orgB = await taoToChuc("assignOrgB");
  const userB = await taoUser("engineer", "assignB", orgB);
  const pmA = await taoUser("pm", "assignA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/x", { level: "task", id: taskA, userId: userB.id }));
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ assignedTo: number | null }>(
    `SELECT assigned_to AS "assignedTo" FROM tasks WHERE id = ?`,
    taskA,
  );
  assert.equal(row?.assignedTo, null, "task không bị gán nhầm cho user tổ chức khác");
});

test(
  "POST /api/admin/assignments: user đúng tổ chức của mình → 200, gán thành công",
  S,
  async () => {
    const a = await dungSheet("assignOk");
    const pkgA = await taoNhom(a.sheetTypeId, "AsgOk1");
    const taskA = await taoTask(pkgA, "AsgOk1,01");
    const userA = await taoUser("engineer", "assignOk", 1);
    const pmA = await taoUser("pm", "assignOkPm", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/admin/assignments/route");
    const res = await POST(jreq("/x", { level: "task", id: taskA, userId: userA.id }));
    assert.equal(res.status, 200);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ assignedTo: number | null }>(
      `SELECT assigned_to AS "assignedTo" FROM tasks WHERE id = ?`,
      taskA,
    );
    assert.equal(row?.assignedTo, userA.id);
  },
);

// ============================================================================
// POST /api/meetings/:id/actions — assignee (org) + taskId (dự án)
// ============================================================================

test(
  "POST /api/meetings/:id/actions: người được giao thuộc tổ chức khác → 422, KHÔNG tạo",
  S,
  async () => {
    const a = await dungSheet("actAssignA");
    const meetingA = await taoCuocHop(a.projectId, "actAssignA");
    const orgB = await taoToChuc("actAssignOrgB");
    const userB = await taoUser("engineer", "actAssignB", orgB);
    const pmA = await taoUser("pm", "actAssignA", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/meetings/[id]/actions/route");
    const res = await POST(jreq("/x", { content: "Việc hack assignee", assignee: userB.id }), {
      params: Promise.resolve({ id: String(meetingA) }),
    });
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne(
      `SELECT id FROM meeting_actions WHERE meeting_id = ? AND content = 'Việc hack assignee'`,
      meetingA,
    );
    assert.equal(row, undefined, "không được tạo việc gán cho user tổ chức khác");
  },
);

test(
  "POST /api/meetings/:id/actions: task liên kết thuộc dự án khác → 422, KHÔNG tạo",
  S,
  async () => {
    const a = await dungSheet("actTaskA");
    const b = await dungSheet("actTaskB");
    const meetingA = await taoCuocHop(a.projectId, "actTaskA");
    const pkgB = await taoNhom(b.sheetTypeId, "ActTB1");
    const taskB = await taoTask(pkgB, "ActTB1,01");
    const pmA = await taoUser("pm", "actTaskA", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/meetings/[id]/actions/route");
    const res = await POST(jreq("/x", { content: "Việc hack task", taskId: taskB }), {
      params: Promise.resolve({ id: String(meetingA) }),
    });
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne(
      `SELECT id FROM meeting_actions WHERE meeting_id = ? AND content = 'Việc hack task'`,
      meetingA,
    );
    assert.equal(row, undefined, "không được tạo việc liên kết task dự án khác");
  },
);

test("POST /api/meetings/:id/actions: assignee + task đúng phạm vi của mình → 201", S, async () => {
  const a = await dungSheet("actOk");
  const meetingA = await taoCuocHop(a.projectId, "actOk");
  const pkgA = await taoNhom(a.sheetTypeId, "ActOk1");
  const taskA = await taoTask(pkgA, "ActOk1,01");
  const userA = await taoUser("engineer", "actOk", 1);
  const pmA = await taoUser("pm", "actOkPm", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/meetings/[id]/actions/route");
  const res = await POST(
    jreq("/x", { content: "Việc hợp lệ", assignee: userA.id, taskId: taskA }),
    { params: Promise.resolve({ id: String(meetingA) }) },
  );
  assert.equal(res.status, 201);
});

// ============================================================================
// PATCH /api/meetings/:id/actions/:aid — assignee phải thuộc đúng tổ chức
// ============================================================================

async function taoViecSauHop(meetingId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO meeting_actions (meeting_id, content) VALUES (?, ?)`,
    meetingId,
    `Việc ${uniq(ten)}`,
  );
}

test(
  "PATCH /api/meetings/:id/actions/:aid: assignee thuộc tổ chức khác → 422, KHÔNG đổi",
  S,
  async () => {
    const a = await dungSheet("actPatchA");
    const meetingA = await taoCuocHop(a.projectId, "actPatchA");
    const actionA = await taoViecSauHop(meetingA, "actPatchA");
    const orgB = await taoToChuc("actPatchOrgB");
    const userB = await taoUser("engineer", "actPatchB", orgB);
    const pmA = await taoUser("pm", "actPatchA", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
    const res = await PATCH(jreq("/x", { content: "Nội dung mới", assignee: userB.id }, "PATCH"), {
      params: Promise.resolve({ id: String(meetingA), aid: String(actionA) }),
    });
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ assignee: number | null }>(
      `SELECT assignee FROM meeting_actions WHERE id = ?`,
      actionA,
    );
    assert.equal(row?.assignee, null, "assignee không bị đổi nhầm sang user tổ chức khác");
  },
);

test(
  "PATCH /api/meetings/:id/actions/:aid: task liên kết thuộc dự án khác → 422, KHÔNG đổi",
  S,
  async () => {
    // Nhánh PATCH trước đây ghi thẳng `task_id` mà KHÔNG kiểm gì, trong khi POST cùng cụm đã
    // đối chiếu dự án — cùng lớp lỗi, chỉ khác động từ HTTP nên bộ quét theo route bỏ sót.
    const a = await dungSheet("actPatchTaskA");
    const b = await dungSheet("actPatchTaskB");
    const meetingA = await taoCuocHop(a.projectId, "actPatchTaskA");
    const actionA = await taoViecSauHop(meetingA, "actPatchTaskA");
    const pkgB = await taoNhom(b.sheetTypeId, "ActPTB1");
    const taskB = await taoTask(pkgB, "ActPTB1,01");
    const pmA = await taoUser("pm", "actPatchTaskA", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
    const res = await PATCH(
      jreq("/x", { content: "Gán task dự án khác", taskId: taskB }, "PATCH"),
      { params: Promise.resolve({ id: String(meetingA), aid: String(actionA) }) },
    );
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ task_id: number | null }>(
      `SELECT task_id FROM meeting_actions WHERE id = ?`,
      actionA,
    );
    assert.equal(row?.task_id ?? null, null, "task_id không được gán sang task dự án khác");
  },
);

test("PATCH /api/meetings/:id/actions/:aid: assignee đúng tổ chức của mình → 200", S, async () => {
  const a = await dungSheet("actPatchOk");
  const meetingA = await taoCuocHop(a.projectId, "actPatchOk");
  const actionA = await taoViecSauHop(meetingA, "actPatchOk");
  const userA = await taoUser("engineer", "actPatchOk", 1);
  const pmA = await taoUser("pm", "actPatchOkPm", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
  const res = await PATCH(jreq("/x", { content: "Nội dung mới", assignee: userA.id }, "PATCH"), {
    params: Promise.resolve({ id: String(meetingA), aid: String(actionA) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ assignee: number | null }>(
    `SELECT assignee FROM meeting_actions WHERE id = ?`,
    actionA,
  );
  assert.equal(row?.assignee, userA.id);
});

// ============================================================================
// PATCH /api/risks/:id — owner phải thuộc đúng tổ chức
// ============================================================================

test("PATCH /api/risks/:id: owner thuộc tổ chức khác → 422, KHÔNG đổi", S, async () => {
  const a = await dungSheet("riskPatchA");
  const riskA = await taoRuiRo(a.projectId, "riskPatchA");
  const orgB = await taoToChuc("riskPatchOrgB");
  const userB = await taoUser("engineer", "riskPatchB", orgB);
  const pmA = await taoUser("pm", "riskPatchA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/risks/[id]/route");
  const res = await PATCH(
    jreq(
      "/x",
      {
        title: "Rủi ro sửa",
        category: "schedule",
        probability: 3,
        impact: 3,
        owner: userB.id,
      },
      "PATCH",
    ),
    { params: Promise.resolve({ id: String(riskA) }) },
  );
  assert.equal(res.status, 422);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ owner: number | null }>(
    `SELECT owner FROM risks WHERE id = ?`,
    riskA,
  );
  assert.equal(row?.owner, null, "owner của rủi ro không bị đổi nhầm sang user tổ chức khác");
});

test("PATCH /api/risks/:id: owner đúng tổ chức của mình → 200, đổi thành công", S, async () => {
  const a = await dungSheet("riskPatchOk");
  const riskA = await taoRuiRo(a.projectId, "riskPatchOk");
  const userA = await taoUser("engineer", "riskPatchOk", 1);
  const pmA = await taoUser("pm", "riskPatchOkPm", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/risks/[id]/route");
  const res = await PATCH(
    jreq(
      "/x",
      {
        title: "Rủi ro sửa",
        category: "schedule",
        probability: 3,
        impact: 3,
        owner: userA.id,
      },
      "PATCH",
    ),
    { params: Promise.resolve({ id: String(riskA) }) },
  );
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ owner: number | null }>(
    `SELECT owner FROM risks WHERE id = ?`,
    riskA,
  );
  assert.equal(row?.owner, userA.id);
});

// ============================================================================
// POST /api/warranty-claims — assignee phải thuộc đúng tổ chức
// ============================================================================

test(
  "POST /api/warranty-claims: assignee thuộc tổ chức khác → 422, KHÔNG tạo claim",
  S,
  async () => {
    const a = await dungSheet("warrantyA");
    const orgB = await taoToChuc("warrantyOrgB");
    const userB = await taoUser("engineer", "warrantyB", orgB);
    const pmA = await taoUser("pm", "warrantyA", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const moTa = `Claim hack ${uniq("warranty")}`;
    const { POST } = await import("@/app/api/warranty-claims/route");
    const res = await POST(jreq("/x", { description: moTa, assignee: userB.id }));
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne(`SELECT id FROM warranty_claims WHERE description = ?`, moTa);
    assert.equal(row, undefined, "không được tạo claim gán cho user tổ chức khác");
  },
);

test(
  "POST /api/warranty-claims: assignee đúng tổ chức của mình → 201, tạo thành công",
  S,
  async () => {
    const a = await dungSheet("warrantyOk");
    const userA = await taoUser("engineer", "warrantyOk", 1);
    const pmA = await taoUser("pm", "warrantyOkPm", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/warranty-claims/route");
    const res = await POST(jreq("/x", { description: "Claim hợp lệ", assignee: userA.id }));
    assert.equal(res.status, 201);
  },
);

// ============================================================================
// POST /api/sheets — copyFromId phải thuộc dự án người gọi thấy được
// ============================================================================

test("POST /api/sheets: copyFromId thuộc dự án khác → 400, KHÔNG tạo sheet", S, async () => {
  const a = await dungSheet("sheetCopyA");
  const b = await dungSheet("sheetCopyB");
  const pmA = await taoUser("pm", "sheetCopyA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const tenSheet = `Sheet hack ${uniq("copy")}`;
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(jreq("/x", { name: tenSheet, copyFromId: b.sheetTypeId }));
  assert.equal(res.status, 400);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM sheet_types WHERE name = ?`, tenSheet);
  assert.equal(row, undefined, "không được tạo sheet copy từ dự án không thấy được");
});

test("POST /api/sheets: copyFromId thuộc dự án của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("sheetCopyOk");
  const pkgA = await taoNhom(a.sheetTypeId, "SC1");
  await taoTask(pkgA, "SC1,01");
  const pmA = await taoUser("pm", "sheetCopyOk", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const tenSheet = `Sheet hợp lệ ${uniq("copy")}`;
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(jreq("/x", { name: tenSheet, copyFromId: a.sheetTypeId }));
  assert.equal(res.status, 201);
  const { copiedTasks } = await res.json();
  assert.equal(copiedTasks, 1);
});

// ============================================================================
// PATCH /api/sheets/:id — managerId phải thuộc đúng tổ chức
// ============================================================================

test("PATCH /api/sheets/:id: managerId thuộc tổ chức khác → 400, KHÔNG đổi", S, async () => {
  const a = await dungSheet("sheetMgrA");
  const orgB = await taoToChuc("sheetMgrOrgB");
  const userB = await taoUser("engineer", "sheetMgrB", orgB);
  const pmA = await taoUser("pm", "sheetMgrA", 1);
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(jreq("/x", { managerId: userB.id }, "PATCH"), {
    params: Promise.resolve({ id: String(a.sheetTypeId) }),
  });
  assert.equal(res.status, 400);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ managerId: number | null }>(
    `SELECT manager_id AS "managerId" FROM sheet_types WHERE id = ?`,
    a.sheetTypeId,
  );
  assert.equal(row?.managerId, null, "manager_id không bị đổi nhầm sang user tổ chức khác");
});

test(
  "PATCH /api/sheets/:id: managerId đúng tổ chức của mình → 200, đổi thành công",
  S,
  async () => {
    const a = await dungSheet("sheetMgrOk");
    const userA = await taoUser("engineer", "sheetMgrOk", 1);
    const pmA = await taoUser("pm", "sheetMgrOkPm", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/sheets/[id]/route");
    const res = await PATCH(jreq("/x", { managerId: userA.id }, "PATCH"), {
      params: Promise.resolve({ id: String(a.sheetTypeId) }),
    });
    assert.equal(res.status, 200);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ managerId: number | null }>(
      `SELECT manager_id AS "managerId" FROM sheet_types WHERE id = ?`,
      a.sheetTypeId,
    );
    assert.equal(row?.managerId, userA.id);
  },
);

// ============================================================================
// PATCH /api/handover-items/:id — work_packages phải thuộc đúng dự án
// ============================================================================

test(
  "PATCH /api/handover-items/:id: nhóm công việc thuộc dự án khác → 422, KHÔNG đổi",
  S,
  async () => {
    const a = await dungSheet("handoverA");
    const b = await dungSheet("handoverB");
    const itemA = await taoHangMucBanGiao(a.projectId, "handoverA");
    const pkgB = await taoNhom(b.sheetTypeId, "HovB1");
    const pmA = await taoUser("pm", "handoverA", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/handover-items/[id]/route");
    const res = await PATCH(jreq("/x", { workPackageId: pkgB }, "PATCH"), {
      params: Promise.resolve({ id: String(itemA) }),
    });
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ workPackageId: number | null }>(
      `SELECT work_package_id AS "workPackageId" FROM handover_items WHERE id = ?`,
      itemA,
    );
    assert.equal(row?.workPackageId, null, "work_package_id không bị đổi nhầm sang dự án khác");
  },
);

test(
  "PATCH /api/handover-items/:id: nhóm công việc đúng dự án của mình → 200, đổi thành công",
  S,
  async () => {
    const a = await dungSheet("handoverOk");
    const itemA = await taoHangMucBanGiao(a.projectId, "handoverOk");
    const pkgA = await taoNhom(a.sheetTypeId, "HovOk1");
    const pmA = await taoUser("pm", "handoverOk", 1);
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/handover-items/[id]/route");
    const res = await PATCH(jreq("/x", { workPackageId: pkgA }, "PATCH"), {
      params: Promise.resolve({ id: String(itemA) }),
    });
    assert.equal(res.status, 200);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ workPackageId: number | null }>(
      `SELECT work_package_id AS "workPackageId" FROM handover_items WHERE id = ?`,
      itemA,
    );
    assert.equal(row?.workPackageId, pkgA);

    // Dọn tham chiếu FK handover_items.work_package_id → work_packages trước khi kết thúc:
    // các file test khác (vd tests/import-real.test.ts) có `DELETE FROM work_packages` toàn
    // cục để dựng lại WBS sạch — để sót dòng tham chiếu này làm vỡ FK ở file KHÔNG liên quan.
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM handover_items WHERE id = ?`, itemA);
  },
);

// Kiểm chứng chống nhiễu: đảm bảo dangXuat() không rò cookie sang test khác trong cùng tiến trình.
test("dọn phiên cuối file", S, async () => {
  dangXuat();
  assert.ok(true);
});
