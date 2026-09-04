import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

// Test THỰC THI route handler thật cho cụm VẬT TƯ/BOQ/MUA SẮM cụm 2 + API v1 + cổng hệ
// thống (Đợt 4, việc V6). Route:
//   - app/api/boq-norms/[id]/route.ts               (PATCH/DELETE 1 định mức)
//   - app/api/boq/[id]/norms/route.ts                (GET/POST định mức của 1 dòng BOQ)
//   - app/api/boq/[id]/norm-usage/route.ts           (GET đối chiếu định mức thực tế)
//   - app/api/boq/import/route.ts                    (POST import Excel BOQ, preview/commit)
//   - app/api/boq/template/route.ts                  (GET file mẫu BOQ)
//   - app/api/norms/over/route.ts                    (GET hạng mục vượt định mức)
//   - app/api/materials/[id]/issue/route.ts          (POST xuất công trường)
//   - app/api/materials/[id]/move/route.ts           (PATCH đổi sort_order)
//   - app/api/materials/[id]/return/route.ts         (POST hoàn kho)
//   - app/api/materials/allocation-meta/route.ts     (GET gợi ý tầng/tổ đội)
//   - app/api/materials/batch/route.ts               (PATCH sửa hàng loạt)
//   - app/api/materials/columns/route.ts             (GET/PATCH tên cột tuỳ chỉnh)
//   - app/api/materials/sync/route.ts                (POST đồng bộ Google Sheet)
//   - app/api/materials/template/route.ts            (GET file mẫu)
//   - app/api/purchase-requests/route.ts             (GET/POST yêu cầu mua vật tư)
//   - app/api/purchase-requests/[id]/route.ts        (PATCH duyệt/từ chối, DELETE)
//   - app/api/resources/route.ts                     (GET tổng hợp tài nguyên)
//   - app/api/qr/labels/route.ts                     (GET trang in tem QR)
//   - app/api/r/[kind]/[id]/route.ts                 (GET tra cứu QR)
//   - app/api/systems/[code]/summary/route.ts        (GET KPI hệ)
//   - app/api/systems/[code]/upload/route.ts         (POST upload kế hoạch/tracking)
//   - app/api/systems/[code]/upload-template/route.ts (GET file mẫu kế hoạch/tracking)
//   - app/api/systems/[code]/uploads/route.ts        (GET lịch sử upload)
//   - app/api/system-uploads/[id]/file/route.ts      (GET tải lại file đã upload)
//   - app/api/portfolio/kpi/route.ts                 (GET KPI gộp cross-project)
//   - app/api/v1/materials/route.ts                  (GET API key, đọc-only)
//   - app/api/v1/packages/route.ts                   (GET API key, đọc-only)
//   - app/api/v1/dashboard/kpi/route.ts              (GET API key, đọc-only)

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `VT2 route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  overrides: { orgId?: number } = {},
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `vt2-${uniq(ten)}@test.local`;
  const orgId = overrides.orgId ?? 1;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-vt2', ?, ?)`,
    `VT2 ${ten}`,
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

/** Chuỗi Tower → SheetType → WorkPackage → Task đầy đủ thuộc 1 dự án, tuỳ chọn gắn hệ
 * (systemId) + BOQCODE cho task — cần cho các route hệ (systems/upload...). */
async function taoWbs(
  projectId: number,
  ten: string,
  opts: { systemId?: number; boqCode?: string } = {},
): Promise<{ towerId: number; sheetId: number; wpId: number; taskId: number }> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${uniq(ten)}`,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, ?, ?, ?)`,
    towerId,
    `SH-${uniq(ten)}`,
    `Sheet ${ten}`,
    `vt2-${uniq(ten)}`,
    opts.systemId ?? null,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, ?, 'T01')`,
    sheetId,
    `WP-${uniq(ten)}`,
    `Nhóm ${ten}`,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, ?, ?, ?)`,
    wpId,
    `WP-${uniq(ten)}A,01`,
    `Task ${ten}`,
    opts.boqCode ?? null,
  );
  return { towerId, sheetId, wpId, taskId };
}

async function heId(code: string): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = ?`, code);
  if (!row) throw new Error(`Không tìm thấy hệ seed sẵn code=${code}`);
  return row.id;
}

async function taoBoqItem(
  projectId: number,
  ten: string,
  overrides: { qtyContract?: number; systemId?: number } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, project_id, system_id)
     VALUES (?, ?, 'm', ?, ?, ?)`,
    `BOQ-${uniq(ten)}`,
    `Dòng BOQ ${ten}`,
    overrides.qtyContract ?? 100,
    projectId,
    overrides.systemId ?? null,
  );
}

async function taoMaterial(
  projectId: number,
  ten: string,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO materials (name, unit, project_id, qty_stock, qty_used, sort_order, sheet_type_id, boq_code, status)
     VALUES (?, 'kg', ?, ?, ?, ?, ?, ?, ?)`,
    `Vật tư ${uniq(ten)}`,
    projectId,
    overrides.qtyStock ?? 100,
    overrides.qtyUsed ?? 0,
    overrides.sortOrder ?? 0,
    overrides.sheetTypeId ?? null,
    overrides.boqCode ?? null,
    overrides.status ?? "dat_hang",
  );
}

async function taoApiKey(
  scopes: string[],
  projectId: number | null,
  createdBy: number,
): Promise<{ id: number; raw: string }> {
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/bao-mat/api-keys");
  const raw = generateApiKey();
  const id = await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('k', ?, ?, ?, ?)`,
    hashApiKey(raw),
    projectId,
    scopes,
    createdBy,
  );
  return { id, raw };
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const getreq = (url: string) => new NextRequest(`http://localhost${url}`);

function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

const apiReq = (url: string, key?: string) =>
  new NextRequest(`http://localhost${url}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });

/** Dựng buffer .xlsx tối thiểu ở định dạng chuẩn xBoss (đủ để parseBoqWorkbook nhận ra
 * header — xem lib/khoi-luong/boq-import.ts). */
function xlsxBoqBuffer(code: string, qty: number): Buffer {
  const aoa = [
    ["Mã BOQ", "STT", "Mô tả", "Quy cách", "Đơn vị", "Khối lượng BOQ Tháp A", "Định mức Shop", "", "Ghi chú"],
    [code, "1", `Hạng mục test ${code}`, "", "m", qty, 0, "", "Ghi chú test"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data-BOQ");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

/** Dựng buffer .xlsx tối thiểu cho upload "kế hoạch" (systems/:code/upload?kind=ke_hoach). */
function xlsxPlanBuffer(boqCode: string, start: string, end: string): Buffer {
  const aoa = [
    ["BOQCODE", "Sheet", "Nhóm", "Mã", "Tên công việc", "Ngày bắt đầu KH", "Ngày kết thúc KH"],
    [boqCode, "Sheet", "Nhóm", "A1,01", "Task test", start, end],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kế hoạch");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ============================================================================
// PATCH/DELETE /api/boq-norms/:id
// ============================================================================

test("PATCH /api/boq-norms/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/boq-norms/:id: engineer không có quyền sửa định mức → 403", S, async () => {
  const projectId = await taoDuAn("norm-403");
  const eng = await taoUser("engineer", "norm-403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/boq-norms/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("norm-badid");
  const pm = await taoUser("pm", "norm-badid");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/boq-norms/:id: dự án khác → 404 (cách ly)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("norm-isoA");
  const projectB = await taoDuAn("norm-isoB");
  const boqB = await taoBoqItem(projectB, "norm-isoB");
  const normId = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label, created_by)
     VALUES (?, 'labor', 'Thợ hàn', 1, 'công', 1)`,
    boqB,
  );
  const pmA = await taoUser("pm", "norm-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  const res = await PATCH(jreq("/x", { qtyPerUnit: 2 }, "PATCH"), {
    params: Promise.resolve({ id: String(normId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/boq-norms/:id: sửa hợp lệ → 200, ghi đúng DB", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("norm-ok");
  const boqId = await taoBoqItem(projectId, "norm-ok");
  const normId = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label, created_by)
     VALUES (?, 'labor', 'Thợ hàn', 1, 'công', 1)`,
    boqId,
  );
  const pm = await taoUser("pm", "norm-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  const res = await PATCH(jreq("/x", { qtyPerUnit: 5 }, "PATCH"), {
    params: Promise.resolve({ id: String(normId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ qty_per_unit: number }>(
    `SELECT qty_per_unit FROM boq_norms WHERE id = ?`,
    normId,
  );
  assert.equal(Number(row?.qty_per_unit), 5);
});

test("PATCH /api/boq-norms/:id: qtyPerUnit <= 0 → 422", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("norm-422");
  const boqId = await taoBoqItem(projectId, "norm-422");
  const normId = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label, created_by)
     VALUES (?, 'labor', 'Thợ hàn', 1, 'công', 1)`,
    boqId,
  );
  const pm = await taoUser("pm", "norm-422");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  const res = await PATCH(jreq("/x", { qtyPerUnit: 0 }, "PATCH"), {
    params: Promise.resolve({ id: String(normId) }),
  });
  assert.equal(res.status, 422);
});

test("DELETE /api/boq-norms/:id: xoá hợp lệ → 200, mất khỏi DB", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("norm-del");
  const boqId = await taoBoqItem(projectId, "norm-del");
  const normId = await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label, created_by)
     VALUES (?, 'labor', 'Thợ hàn', 1, 'công', 1)`,
    boqId,
  );
  const pm = await taoUser("pm", "norm-del");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/boq-norms/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(normId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM boq_norms WHERE id = ?`, normId);
  assert.equal(row, undefined);
});

test("DELETE /api/boq-norms/:id: không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("norm-del404");
  const pm = await taoUser("pm", "norm-del404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/boq-norms/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET/POST /api/boq/:id/norms
// ============================================================================

test("GET /api/boq/:id/norms: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/[id]/norms/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/boq/:id/norms: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("bqnorm-isoA");
  const projectB = await taoDuAn("bqnorm-isoB");
  const boqB = await taoBoqItem(projectB, "bqnorm-isoB");
  const pmA = await taoUser("pm", "bqnorm-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/boq/[id]/norms/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ id: String(boqB) }) });
  assert.equal(res.status, 404);
});

test("POST /api/boq/:id/norms: engineer không có quyền tạo định mức → 403", S, async () => {
  const projectId = await taoDuAn("bqnorm-403");
  const boqId = await taoBoqItem(projectId, "bqnorm-403");
  const eng = await taoUser("engineer", "bqnorm-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/boq/[id]/norms/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(boqId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/boq/:id/norms: thiếu resourceType hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("bqnorm-422");
  const boqId = await taoBoqItem(projectId, "bqnorm-422");
  const pm = await taoUser("pm", "bqnorm-422");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/boq/[id]/norms/route");
  const res = await POST(jreq("/x", { qtyPerUnit: 1, unitLabel: "công" }), {
    params: Promise.resolve({ id: String(boqId) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/boq/:id/norms: materialId không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("bqnorm-matmiss");
  const boqId = await taoBoqItem(projectId, "bqnorm-matmiss");
  const pm = await taoUser("pm", "bqnorm-matmiss");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/boq/[id]/norms/route");
  const res = await POST(
    jreq("/x", {
      resourceType: "material",
      materialId: 999999999,
      qtyPerUnit: 1,
      unitLabel: "kg",
    }),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res.status, 422);
});

test("POST /api/boq/:id/norms: tạo hợp lệ → 201, GET thấy đúng dòng vừa tạo", S, async () => {
  const projectId = await taoDuAn("bqnorm-ok");
  const boqId = await taoBoqItem(projectId, "bqnorm-ok");
  const pm = await taoUser("pm", "bqnorm-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST, GET } = await import("@/app/api/boq/[id]/norms/route");
  const created = await POST(
    jreq("/x", { resourceType: "labor", resourceName: "Thợ hàn", qtyPerUnit: 2, unitLabel: "công" }),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(created.status, 201);
  const res = await GET(getreq("/x"), { params: Promise.resolve({ id: String(boqId) }) });
  assert.equal(res.status, 200);
  const { norms } = await res.json();
  assert.equal(norms.length, 1);
  assert.equal(norms[0].resourceName, "Thợ hàn");
});

// ============================================================================
// GET /api/boq/:id/norm-usage
// ============================================================================

test("GET /api/boq/:id/norm-usage: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/[id]/norm-usage/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/boq/:id/norm-usage: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("normusage-isoA");
  const projectB = await taoDuAn("normusage-isoB");
  const boqB = await taoBoqItem(projectB, "normusage-isoB");
  const pmA = await taoUser("pm", "normusage-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/boq/[id]/norm-usage/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ id: String(boqB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/boq/:id/norm-usage: trả mảng usage đúng định mức đã tạo", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("normusage-ok");
  const boqId = await taoBoqItem(projectId, "normusage-ok", { qtyContract: 10 });
  await insertId(
    `INSERT INTO boq_norms (boq_item_id, resource_type, resource_name, qty_per_unit, unit_label, created_by)
     VALUES (?, 'labor', 'Thợ hàn', 2, 'công', 1)`,
    boqId,
  );
  const pm = await taoUser("pm", "normusage-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/boq/[id]/norm-usage/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ id: String(boqId) }) });
  assert.equal(res.status, 200);
  const { usage } = await res.json();
  assert.equal(usage.length, 1);
  assert.equal(usage[0].resourceLabel, "Thợ hàn");
});

// ============================================================================
// GET /api/norms/over
// ============================================================================

test("GET /api/norms/over: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/norms/over/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/norms/over: viewer không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("over-403");
  const viewer = await taoUser("viewer", "over-403");
  await dangNhapDuAn(viewer, projectId);
  const { GET } = await import("@/app/api/norms/over/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 403);
});

test("GET /api/norms/over: thresholdPct âm → 422", S, async () => {
  const projectId = await taoDuAn("over-422");
  const pm = await taoUser("pm", "over-422");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/norms/over/route");
  const res = await GET(getreq("/x?thresholdPct=-5"));
  assert.equal(res.status, 422);
});

test("GET /api/norms/over: scope theo dự án đang chọn — 200, mảng đúng kiểu", S, async () => {
  const projectId = await taoDuAn("over-ok");
  const pm = await taoUser("pm", "over-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/norms/over/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.ok(Array.isArray(items));
});

// ============================================================================
// POST /api/boq/import
// ============================================================================

test("POST /api/boq/import: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(new NextRequest("http://localhost/api/boq/import", { method: "POST" }));
  assert.equal(res.status, 401);
});

test("POST /api/boq/import: engineer không có quyền import → 403", S, async () => {
  const projectId = await taoDuAn("boqimp-403");
  const eng = await taoUser("engineer", "boqimp-403");
  await dangNhapDuAn(eng, projectId);
  const form = new FormData();
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(formReq("/api/boq/import", form));
  assert.equal(res.status, 403);
});

test("POST /api/boq/import: thiếu file → 400", S, async () => {
  const projectId = await taoDuAn("boqimp-nofile");
  const pm = await taoUser("pm", "boqimp-nofile");
  await dangNhapDuAn(pm, projectId);
  const form = new FormData();
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(formReq("/api/boq/import", form));
  assert.equal(res.status, 400);
});

test("POST /api/boq/import: file không đọc được (sai định dạng) → 400", S, async () => {
  const projectId = await taoDuAn("boqimp-badformat");
  const pm = await taoUser("pm", "boqimp-badformat");
  await dangNhapDuAn(pm, projectId);
  const acmv = await heId("acmv");
  const form = new FormData();
  form.set("file", new File(["đây không phải file excel"], "a.xlsx", { type: XLSX_MIME }));
  form.set("systemId", String(acmv));
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(formReq("/api/boq/import?commit=1", form));
  assert.equal(res.status, 400);
});

test("POST /api/boq/import: thiếu systemId hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("boqimp-nosys");
  const pm = await taoUser("pm", "boqimp-nosys");
  await dangNhapDuAn(pm, projectId);
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(xlsxBoqBuffer(uniq("BOQ-X"), 5))], "a.xlsx", { type: XLSX_MIME }),
  );
  form.set("systemId", "999999999");
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(formReq("/api/boq/import", form));
  assert.equal(res.status, 422);
});

test("POST /api/boq/import: preview (không commit) → 200, không ghi DB", S, async () => {
  const { query } = await import("@/lib/db");
  const projectId = await taoDuAn("boqimp-preview");
  const pm = await taoUser("pm", "boqimp-preview");
  await dangNhapDuAn(pm, projectId);
  const acmv = await heId("acmv");
  const code = uniq("BOQ-PRV");
  const form = new FormData();
  form.set("file", new File([new Uint8Array(xlsxBoqBuffer(code, 7))], "a.xlsx", { type: XLSX_MIME }));
  form.set("systemId", String(acmv));
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(formReq("/api/boq/import", form));
  assert.equal(res.status, 200);
  const { preview } = await res.json();
  assert.equal(preview.length, 1);
  assert.equal(preview[0].code, code);
  const rows = await query(`SELECT id FROM boq_items WHERE code = ?`, code);
  assert.equal(rows.length, 0);
});

test("POST /api/boq/import: commit=1 → 201/200 ghi vào boq_items", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("boqimp-commit");
  const pm = await taoUser("pm", "boqimp-commit");
  await dangNhapDuAn(pm, projectId);
  const acmv = await heId("acmv");
  const code = uniq("BOQ-CMT");
  const form = new FormData();
  form.set("file", new File([new Uint8Array(xlsxBoqBuffer(code, 8))], "a.xlsx", { type: XLSX_MIME }));
  form.set("systemId", String(acmv));
  const { POST } = await import("@/app/api/boq/import/route");
  const res = await POST(formReq("/api/boq/import?commit=1", form));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.inserted, 1);
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM boq_items WHERE code = ?`,
    code,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET /api/boq/template
// ============================================================================

test("GET /api/boq/template: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/template/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/boq/template: trả file xlsx (magic bytes PK)", S, async () => {
  const projectId = await taoDuAn("boqtpl-ok");
  const pm = await taoUser("pm", "boqtpl-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/boq/template/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), XLSX_MIME);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
});

// ============================================================================
// POST /api/materials/:id/issue
// ============================================================================

test("POST /api/materials/:id/issue: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/materials/:id/issue: subcon không có quyền xuất vật tư → 403", S, async () => {
  const projectId = await taoDuAn("issue-403");
  const sub = await taoUser("subcon", "issue-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  const res = await POST(jreq("/x", { qty: 1 }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/materials/:id/issue: số lượng không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("issue-400");
  const matId = await taoMaterial(projectId, "issue-400", { qtyStock: 50 });
  const eng = await taoUser("engineer", "issue-400");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  const res = await POST(jreq("/x", { qty: 0 }), { params: Promise.resolve({ id: String(matId) }) });
  assert.equal(res.status, 400);
});

test("POST /api/materials/:id/issue: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("issue-isoA");
  const projectB = await taoDuAn("issue-isoB");
  const matB = await taoMaterial(projectB, "issue-isoB", { qtyStock: 50 });
  const engA = await taoUser("engineer", "issue-isoA");
  await dangNhapDuAn(engA, projectA);
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  const res = await POST(jreq("/x", { qty: 1 }), { params: Promise.resolve({ id: String(matB) }) });
  assert.equal(res.status, 404);
});

test("POST /api/materials/:id/issue: vượt tồn kho → 409", S, async () => {
  const projectId = await taoDuAn("issue-409");
  const matId = await taoMaterial(projectId, "issue-409", { qtyStock: 5 });
  const eng = await taoUser("engineer", "issue-409");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  const res = await POST(jreq("/x", { qty: 10 }), { params: Promise.resolve({ id: String(matId) }) });
  assert.equal(res.status, 409);
});

test(
  "POST /api/materials/:id/issue: xuất hợp lệ → giảm qty_stock, tăng qty_used, ghi material_transactions delta âm",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("issue-ok");
    const matId = await taoMaterial(projectId, "issue-ok", { qtyStock: 50, qtyUsed: 0 });
    const eng = await taoUser("engineer", "issue-ok");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/materials/[id]/issue/route");
    const res = await POST(jreq("/x", { qty: 10 }), {
      params: Promise.resolve({ id: String(matId) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.qtyStock, 40);
    assert.equal(body.qtyUsed, 10);
    const tx = await queryOne<{ delta: number; type: string }>(
      `SELECT delta, type FROM material_transactions WHERE material_id = ? ORDER BY id DESC LIMIT 1`,
      matId,
    );
    assert.equal(Number(tx?.delta), -10);
    assert.equal(tx?.type, "xuat_cong_truong");
  },
);

test("POST /api/materials/:id/issue: cùng Idempotency-Key gọi 2 lần → chỉ ghi 1 giao dịch", S, async () => {
  const { query } = await import("@/lib/db");
  const projectId = await taoDuAn("issue-idem");
  const matId = await taoMaterial(projectId, "issue-idem", { qtyStock: 50 });
  const eng = await taoUser("engineer", "issue-idem");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  const req1 = new NextRequest("http://localhost/x", {
    method: "POST",
    body: JSON.stringify({ qty: 5 }),
    headers: { "Idempotency-Key": "key-issue-1" },
  });
  const res1 = await POST(req1, { params: Promise.resolve({ id: String(matId) }) });
  assert.equal(res1.status, 200);
  const req2 = new NextRequest("http://localhost/x", {
    method: "POST",
    body: JSON.stringify({ qty: 5 }),
    headers: { "Idempotency-Key": "key-issue-1" },
  });
  const res2 = await POST(req2, { params: Promise.resolve({ id: String(matId) }) });
  assert.equal(res2.status, 200);
  const txs = await query(
    `SELECT id FROM material_transactions WHERE material_id = ? AND type = 'xuat_cong_truong'`,
    matId,
  );
  assert.equal(txs.length, 1);
});

// ============================================================================
// PATCH /api/materials/:id/move
// ============================================================================

test("PATCH /api/materials/:id/move: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/materials/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/materials/:id/move: subcon không được di chuyển → 403", S, async () => {
  const projectId = await taoDuAn("move-403");
  const sub = await taoUser("subcon", "move-403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/materials/:id/move: direction không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("move-400");
  const matId = await taoMaterial(projectId, "move-400");
  const pm = await taoUser("pm", "move-400");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "sideways" }, "PATCH"), {
    params: Promise.resolve({ id: String(matId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/materials/:id/move: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("move-isoA");
  const projectB = await taoDuAn("move-isoB");
  const matB = await taoMaterial(projectB, "move-isoB");
  const pmA = await taoUser("pm", "move-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/materials/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: String(matB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/materials/:id/move: hoán đổi sort_order với vật tư liền kề → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("move-ok");
  const sheetId = (await taoWbs(projectId, "move-ok")).sheetId;
  const matA = await taoMaterial(projectId, "move-okA", { sheetTypeId: sheetId, sortOrder: 1 });
  const matB = await taoMaterial(projectId, "move-okB", { sheetTypeId: sheetId, sortOrder: 2 });
  const pm = await taoUser("pm", "move-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(matA) }),
  });
  assert.equal(res.status, 200);
  const rowA = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM materials WHERE id = ?`,
    matA,
  );
  const rowB = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM materials WHERE id = ?`,
    matB,
  );
  assert.equal(rowA?.sort_order, 2);
  assert.equal(rowB?.sort_order, 1);
});

test("PATCH /api/materials/:id/move: đã ở cuối danh sách → ok:false, không đổi gì", S, async () => {
  const projectId = await taoDuAn("move-edge");
  const matId = await taoMaterial(projectId, "move-edge", { sortOrder: 1 });
  const pm = await taoUser("pm", "move-edge");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(matId) }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, false);
});

// ============================================================================
// POST /api/materials/:id/return
// ============================================================================

test("POST /api/materials/:id/return: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/materials/[id]/return/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/materials/:id/return: subcon không có quyền hoàn kho → 403", S, async () => {
  const projectId = await taoDuAn("return-403");
  const sub = await taoUser("subcon", "return-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/materials/[id]/return/route");
  const res = await POST(jreq("/x", { qty: 1 }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/materials/:id/return: số đã dùng không đủ để hoàn → 409", S, async () => {
  const projectId = await taoDuAn("return-409");
  const matId = await taoMaterial(projectId, "return-409", { qtyUsed: 5, qtyStock: 5 });
  const eng = await taoUser("engineer", "return-409");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/materials/[id]/return/route");
  const res = await POST(jreq("/x", { qty: 10 }), { params: Promise.resolve({ id: String(matId) }) });
  assert.equal(res.status, 409);
});

test(
  "POST /api/materials/:id/return: hoàn hợp lệ → tăng qty_stock, giảm qty_used, ghi delta dương",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("return-ok");
    const matId = await taoMaterial(projectId, "return-ok", { qtyUsed: 20, qtyStock: 30 });
    const eng = await taoUser("engineer", "return-ok");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/materials/[id]/return/route");
    const res = await POST(jreq("/x", { qty: 8 }), {
      params: Promise.resolve({ id: String(matId) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.qtyStock, 38);
    assert.equal(body.qtyUsed, 12);
    const tx = await queryOne<{ delta: number; type: string }>(
      `SELECT delta, type FROM material_transactions WHERE material_id = ? ORDER BY id DESC LIMIT 1`,
      matId,
    );
    assert.equal(Number(tx?.delta), 8);
    assert.equal(tx?.type, "hoan_kho");
  },
);

test("POST /api/materials/:id/return: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("return-isoA");
  const projectB = await taoDuAn("return-isoB");
  const matB = await taoMaterial(projectB, "return-isoB", { qtyUsed: 5 });
  const engA = await taoUser("engineer", "return-isoA");
  await dangNhapDuAn(engA, projectA);
  const { POST } = await import("@/app/api/materials/[id]/return/route");
  const res = await POST(jreq("/x", { qty: 1 }), { params: Promise.resolve({ id: String(matB) }) });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET /api/materials/allocation-meta
// ============================================================================

test("GET /api/materials/allocation-meta: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/materials/allocation-meta/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/materials/allocation-meta: trả floors/crews đã dùng qua issue", S, async () => {
  const projectId = await taoDuAn("allocmeta-ok");
  const matId = await taoMaterial(projectId, "allocmeta-ok", { qtyStock: 50 });
  const eng = await taoUser("engineer", "allocmeta-ok");
  await dangNhapDuAn(eng, projectId);
  const floorLabel = uniq("T99");
  const crew = uniq("ToDoi");
  const { POST } = await import("@/app/api/materials/[id]/issue/route");
  await POST(jreq("/x", { qty: 1, floorLabel, crew }), {
    params: Promise.resolve({ id: String(matId) }),
  });
  const { GET } = await import("@/app/api/materials/allocation-meta/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { floors, crews } = await res.json();
  assert.ok(floors.includes(floorLabel));
  assert.ok(crews.includes(crew));
});

// ============================================================================
// PATCH /api/materials/batch
// ============================================================================

test("PATCH /api/materials/batch: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/materials/batch/route");
  const res = await PATCH(jreq("/x", { updates: [] }, "PATCH"));
  assert.equal(res.status, 401);
});

test("PATCH /api/materials/batch: subcon không có quyền sửa → 403", S, async () => {
  const projectId = await taoDuAn("batch-403");
  const sub = await taoUser("subcon", "batch-403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/materials/batch/route");
  const res = await PATCH(jreq("/x", { updates: [{ id: 1, patch: {} }] }, "PATCH"));
  assert.equal(res.status, 403);
});

test("PATCH /api/materials/batch: mảng updates rỗng → 400", S, async () => {
  const projectId = await taoDuAn("batch-400");
  const pm = await taoUser("pm", "batch-400");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/materials/batch/route");
  const res = await PATCH(jreq("/x", { updates: [] }, "PATCH"));
  assert.equal(res.status, 400);
});

test("PATCH /api/materials/batch: vật tư không thuộc dự án đang chọn → lỗi 422 (transaction rollback)", S, async () => {
  const projectA = await taoDuAn("batch-isoA");
  const projectB = await taoDuAn("batch-isoB");
  const matB = await taoMaterial(projectB, "batch-isoB");
  const pmA = await taoUser("pm", "batch-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/materials/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: matB, patch: { name: "Đổi trộm" } }] }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/materials/batch: sửa qtyUsed hàng loạt → ghi material_transactions, cả lô thành công",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("batch-ok");
    const matA = await taoMaterial(projectId, "batch-okA", { qtyUsed: 0 });
    const matB = await taoMaterial(projectId, "batch-okB", { qtyUsed: 0 });
    const pm = await taoUser("pm", "batch-ok");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/materials/batch/route");
    const res = await PATCH(
      jreq(
        "/x",
        {
          updates: [
            { id: matA, patch: { qtyUsed: 5 } },
            { id: matB, patch: { name: "Tên mới" } },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, 2);
    const tx = await queryOne<{ delta: number }>(
      `SELECT delta FROM material_transactions WHERE material_id = ?`,
      matA,
    );
    assert.equal(Number(tx?.delta), 5);
    const rowB = await queryOne<{ name: string }>(`SELECT name FROM materials WHERE id = ?`, matB);
    assert.equal(rowB?.name, "Tên mới");
  },
);

test("PATCH /api/materials/batch: boqCode trùng đã dùng nơi khác → lỗi 422, không ghi lô", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("batch-boqdup");
  const boqCode = uniq("BOQ-BATCHDUP");
  const matTaken = await taoMaterial(projectId, "batch-boqdup-taken", { boqCode });
  const matTarget = await taoMaterial(projectId, "batch-boqdup-target");
  const pm = await taoUser("pm", "batch-boqdup");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/materials/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: matTarget, patch: { boqCode } }] }, "PATCH"),
  );
  assert.equal(res.status, 422);
  void matTaken;
  const row = await queryOne<{ boq_code: string | null }>(
    `SELECT boq_code FROM materials WHERE id = ?`,
    matTarget,
  );
  assert.equal(row?.boq_code, null);
});

// ============================================================================
// GET/PATCH /api/materials/columns
// ============================================================================

test("GET /api/materials/columns: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/materials/columns/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("PATCH /api/materials/columns: engineer không được đổi tên cột → 403", S, async () => {
  const projectId = await taoDuAn("cols-403");
  const eng = await taoUser("engineer", "cols-403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/materials/columns/route");
  const res = await PATCH(jreq("/x", { labels: {} }, "PATCH"));
  assert.equal(res.status, 403);
});

test("PATCH /api/materials/columns: PM đổi tên cột → 200, GET đọc lại đúng", S, async () => {
  const projectId = await taoDuAn("cols-ok");
  const pm = await taoUser("pm", "cols-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET, PATCH } = await import("@/app/api/materials/columns/route");
  const label = uniq("Cột X");
  const resPatch = await PATCH(jreq("/x", { labels: { qtyBoq: label } }, "PATCH"));
  assert.equal(resPatch.status, 200);
  const resGet = await GET();
  assert.equal(resGet.status, 200);
  const { labels } = await resGet.json();
  assert.equal(labels.qtyBoq, label);
});

test("PATCH /api/materials/columns: đổi tên cột dự án A không ảnh hưởng dự án B", S, async () => {
  const projectA = await taoDuAn("cols-isoA");
  const projectB = await taoDuAn("cols-isoB");
  const pmA = await taoUser("pm", "cols-isoA");
  const pmB = await taoUser("pm", "cols-isoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET, PATCH } = await import("@/app/api/materials/columns/route");
  await PATCH(jreq("/x", { labels: { qtyBoq: "Đổi ở A" } }, "PATCH"));
  await dangNhapDuAn(pmB, projectB);
  const resGet = await GET();
  const { labels } = await resGet.json();
  assert.notEqual(labels.qtyBoq, "Đổi ở A");
});

// ============================================================================
// POST /api/materials/sync
// ============================================================================

test("POST /api/materials/sync: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/materials/sync/route");
  const res = await POST();
  assert.equal(res.status, 401);
});

test("POST /api/materials/sync: engineer không có quyền đồng bộ → 403", S, async () => {
  const projectId = await taoDuAn("sync-403");
  const eng = await taoUser("engineer", "sync-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/materials/sync/route");
  const res = await POST();
  assert.equal(res.status, 403);
});

test("POST /api/materials/sync: thiếu cấu hình Google Sheets → 500 với lỗi rõ ràng, KHÔNG gọi mạng", S, async () => {
  // Chặn mạng bằng cách đảm bảo GOOGLE_* KHÔNG được cấu hình (fail-fast trong
  // lib/vat-tu/google-sheets.ts trước khi có bất kỳ lời gọi HTTP nào ra ngoài).
  const savedVars = [
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SA_EMAIL",
    "GOOGLE_SA_PRIVATE_KEY",
    "GOOGLE_SHEET_ID",
  ].map((k) => [k, process.env[k]] as const);
  for (const [k] of savedVars) delete process.env[k];
  try {
    const projectId = await taoDuAn("sync-500");
    const pm = await taoUser("pm", "sync-500");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/materials/sync/route");
    const res = await POST();
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.match(body.error, /Thiếu cấu hình Google Sheets|GOOGLE_SERVICE_ACCOUNT_JSON/);
  } finally {
    for (const [k, v] of savedVars) if (v !== undefined) process.env[k] = v;
  }
});

// ============================================================================
// GET /api/materials/template
// ============================================================================

test("GET /api/materials/template: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/materials/template/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/materials/template: trả file xlsx (magic bytes PK)", S, async () => {
  const projectId = await taoDuAn("mattpl-ok");
  const pm = await taoUser("pm", "mattpl-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/materials/template/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
});

// ============================================================================
// GET/POST /api/purchase-requests
// ============================================================================

test("GET /api/purchase-requests: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/purchase-requests/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/purchase-requests: cách ly dự án — không thấy PR của dự án khác", S, async () => {
  const projectA = await taoDuAn("pr-isoA");
  const projectB = await taoDuAn("pr-isoB");
  const matB = await taoMaterial(projectB, "pr-isoB");
  const pmB = await taoUser("pm", "pr-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/purchase-requests/route");
  await POST(jreq("/x", { materialId: matB, qtyRequested: 10 }));
  const pmA = await taoUser("pm", "pr-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/purchase-requests/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).requests, []);
});

test("POST /api/purchase-requests: viewer không có quyền tạo → 403", S, async () => {
  const projectId = await taoDuAn("pr-403");
  const viewer = await taoUser("viewer", "pr-403");
  await dangNhapDuAn(viewer, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const res = await POST(jreq("/x", { materialId: 1, qtyRequested: 1 }));
  assert.equal(res.status, 403);
});

test("POST /api/purchase-requests: số lượng không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("pr-400");
  const matId = await taoMaterial(projectId, "pr-400");
  const pm = await taoUser("pm", "pr-400");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const res = await POST(jreq("/x", { materialId: matId, qtyRequested: 0 }));
  assert.equal(res.status, 400);
});

test("POST /api/purchase-requests: vật tư không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("pr-404");
  const pm = await taoUser("pm", "pr-404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const res = await POST(jreq("/x", { materialId: 999999999, qtyRequested: 1 }));
  assert.equal(res.status, 404);
});

test("POST /api/purchase-requests: tạo hợp lệ → 201, project_id do server suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pr-ok");
  const matId = await taoMaterial(projectId, "pr-ok");
  const pm = await taoUser("pm", "pr-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const res = await POST(jreq("/x", { materialId: matId, qtyRequested: 5 }));
  assert.equal(res.status, 201);
  const { id, prCode } = await res.json();
  assert.match(prCode, /^PR-\d{6}-\d+$/);
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM purchase_requests WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// PATCH/DELETE /api/purchase-requests/:id
// ============================================================================

test("PATCH /api/purchase-requests/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/purchase-requests/[id]/route");
  const res = await PATCH(jreq("/x", { action: "approve" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/purchase-requests/:id: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("pr2-isoA");
  const projectB = await taoDuAn("pr2-isoB");
  const matB = await taoMaterial(projectB, "pr2-isoB");
  const pmB = await taoUser("pm", "pr2-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const created = await POST(jreq("/x", { materialId: matB, qtyRequested: 3 }));
  const { id: prId } = await created.json();
  const pmA = await taoUser("pm", "pr2-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/purchase-requests/[id]/route");
  const res = await PATCH(jreq("/x", { action: "approve" }, "PATCH"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/purchase-requests/:id: engineer không được duyệt → 403", S, async () => {
  const projectId = await taoDuAn("pr2-403");
  const matId = await taoMaterial(projectId, "pr2-403");
  const pm = await taoUser("pm", "pr2-403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const created = await POST(jreq("/x", { materialId: matId, qtyRequested: 3 }));
  const { id: prId } = await created.json();
  const eng = await taoUser("engineer", "pr2-403b");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/purchase-requests/[id]/route");
  const res = await PATCH(jreq("/x", { action: "approve" }, "PATCH"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/purchase-requests/:id: duyệt hợp lệ → 200, không thể duyệt lần 2 (409)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pr2-ok");
  const matId = await taoMaterial(projectId, "pr2-ok");
  const pm = await taoUser("pm", "pr2-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const created = await POST(jreq("/x", { materialId: matId, qtyRequested: 3 }));
  const { id: prId } = await created.json();
  const { PATCH } = await import("@/app/api/purchase-requests/[id]/route");
  const res1 = await PATCH(jreq("/x", { action: "approve" }, "PATCH"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res1.status, 200);
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM purchase_requests WHERE id = ?`,
    prId,
  );
  assert.equal(row?.status, "approved");
  const res2 = await PATCH(jreq("/x", { action: "approve" }, "PATCH"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res2.status, 409);
});

test("DELETE /api/purchase-requests/:id: đã đặt hàng (ordered) → 409, không xoá được", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("pr2-del409");
  const matId = await taoMaterial(projectId, "pr2-del409");
  const pm = await taoUser("pm", "pr2-del409");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const created = await POST(jreq("/x", { materialId: matId, qtyRequested: 3 }));
  const { id: prId } = await created.json();
  await run(`UPDATE purchase_requests SET status = 'ordered' WHERE id = ?`, prId);
  const { DELETE } = await import("@/app/api/purchase-requests/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/purchase-requests/:id: người khác (không phải người tạo/Admin/PM) không xoá được → 403", S, async () => {
  const projectId = await taoDuAn("pr2-del403");
  const matId = await taoMaterial(projectId, "pr2-del403");
  const eng1 = await taoUser("engineer", "pr2-del403a");
  await dangNhapDuAn(eng1, projectId);
  const { POST } = await import("@/app/api/purchase-requests/route");
  const created = await POST(jreq("/x", { materialId: matId, qtyRequested: 3 }));
  const { id: prId } = await created.json();
  const eng2 = await taoUser("engineer", "pr2-del403b");
  await dangNhapDuAn(eng2, projectId);
  const { DELETE } = await import("@/app/api/purchase-requests/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 403);
});

// ============================================================================
// GET /api/resources
// ============================================================================

test("GET /api/resources: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/resources/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/resources: trả workload/manpower mặc định → 200", S, async () => {
  const projectId = await taoDuAn("res-ok");
  const pm = await taoUser("pm", "res-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/resources/route");
  const res = await GET(getreq("/x"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.workload));
  assert.ok(Array.isArray(body.manpower));
  assert.equal(body.equipmentUsage, undefined);
});

test("GET /api/resources?view=equipment: trả thêm equipmentUsage", S, async () => {
  const projectId = await taoDuAn("res-eq");
  const pm = await taoUser("pm", "res-eq");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/resources/route");
  const res = await GET(getreq("/x?view=equipment"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.equipmentUsage));
});

test("GET /api/resources?view=conflicts: subcon chỉ thấy tải/xung đột của chính mình", S, async () => {
  const projectId = await taoDuAn("res-sub");
  const sub = await taoUser("subcon", "res-sub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/resources/route");
  const res = await GET(getreq("/x?view=conflicts"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.conflicts));
});

// ============================================================================
// GET /api/qr/labels
// ============================================================================

test("GET /api/qr/labels: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/qr/labels/route");
  const res = await GET(getreq("/x?kind=mt&ids=1"));
  assert.equal(res.status, 401);
});

test("GET /api/qr/labels: engineer không có quyền in tem QR → 403", S, async () => {
  const projectId = await taoDuAn("qrlabel-403");
  const eng = await taoUser("engineer", "qrlabel-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/qr/labels/route");
  const res = await GET(getreq("/x?kind=mt&ids=1"));
  assert.equal(res.status, 403);
});

test("GET /api/qr/labels: kind không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("qrlabel-400a");
  const pm = await taoUser("pm", "qrlabel-400a");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/qr/labels/route");
  const res = await GET(getreq("/x?kind=xx&ids=1"));
  assert.equal(res.status, 400);
});

test("GET /api/qr/labels: thiếu ids hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("qrlabel-400b");
  const pm = await taoUser("pm", "qrlabel-400b");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/qr/labels/route");
  const res = await GET(getreq("/x?kind=mt&ids="));
  assert.equal(res.status, 400);
});

test("GET /api/qr/labels: kind=mt hợp lệ → trả trang HTML có tem của vật tư", S, async () => {
  const projectId = await taoDuAn("qrlabel-ok");
  const matId = await taoMaterial(projectId, "qrlabel-ok", { boqCode: uniq("QRMT") });
  const pm = await taoUser("pm", "qrlabel-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/qr/labels/route");
  const res = await GET(getreq(`/x?kind=mt&ids=${matId}`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await res.text();
  assert.match(html, /class="label"/);
});

// ============================================================================
// GET /api/r/:kind/:id
// ============================================================================

test("GET /api/r/:kind/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/r/[kind]/[id]/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ kind: "mt", id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/r/:kind/:id: kind lạ → 400", S, async () => {
  const projectId = await taoDuAn("r-400");
  const pm = await taoUser("pm", "r-400");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/r/[kind]/[id]/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ kind: "zz", id: "1" }) });
  assert.equal(res.status, 400);
});

test("GET /api/r/:kind/:id: không tìm thấy hoặc thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("r-isoA");
  const projectB = await taoDuAn("r-isoB");
  const matB = await taoMaterial(projectB, "r-isoB");
  const pmA = await taoUser("pm", "r-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/r/[kind]/[id]/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ kind: "mt", id: String(matB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/r/:kind/:id: kind=mt hợp lệ → 200 trả đúng vật tư", S, async () => {
  const projectId = await taoDuAn("r-ok");
  const matId = await taoMaterial(projectId, "r-ok");
  const pm = await taoUser("pm", "r-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/r/[kind]/[id]/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ kind: "mt", id: String(matId) }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, matId);
  assert.equal(body.kind, "mt");
});

// ============================================================================
// GET /api/systems/:code/summary
// ============================================================================

test("GET /api/systems/:code/summary: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/systems/[code]/summary/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 401);
});

test("GET /api/systems/:code/summary: hệ không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("syssum-404");
  const pm = await taoUser("pm", "syssum-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/systems/[code]/summary/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ code: "khong-ton-tai" }) });
  assert.equal(res.status, 404);
});

test("GET /api/systems/:code/summary: hệ tồn tại → 200 kèm % tiến độ", S, async () => {
  const projectId = await taoDuAn("syssum-ok");
  const acmv = await heId("acmv");
  await taoWbs(projectId, "syssum-ok", { systemId: acmv });
  const pm = await taoUser("pm", "syssum-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/systems/[code]/summary/route");
  const res = await GET(getreq("/x"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok("avgProgress" in body || "progress" in body || typeof body === "object");
});

// ============================================================================
// POST /api/systems/:code/upload
// ============================================================================

test("POST /api/systems/:code/upload: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  const res = await POST(formReq("/x", new FormData()), {
    params: Promise.resolve({ code: "acmv" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/systems/:code/upload: PM không phải Admin → 403", S, async () => {
  const projectId = await taoDuAn("sysup-403");
  const pm = await taoUser("pm", "sysup-403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  const res = await POST(formReq("/x", new FormData()), {
    params: Promise.resolve({ code: "acmv" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/systems/:code/upload: hệ không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("sysup-404");
  const admin = await taoUser("admin", "sysup-404");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  const res = await POST(formReq("/x?kind=ke_hoach", new FormData()), {
    params: Promise.resolve({ code: "khong-ton-tai" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/systems/:code/upload: kind không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("sysup-400kind");
  const admin = await taoUser("admin", "sysup-400kind");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  const res = await POST(formReq("/x?kind=abc", new FormData()), {
    params: Promise.resolve({ code: "acmv" }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/systems/:code/upload: thiếu file → 400", S, async () => {
  const projectId = await taoDuAn("sysup-nofile");
  const admin = await taoUser("admin", "sysup-nofile");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  const res = await POST(formReq("/x?kind=ke_hoach", new FormData()), {
    params: Promise.resolve({ code: "acmv" }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/systems/:code/upload: đuôi file không phải .xlsx → 415", S, async () => {
  const projectId = await taoDuAn("sysup-415");
  const admin = await taoUser("admin", "sysup-415");
  await dangNhapDuAn(admin, projectId);
  const form = new FormData();
  form.set("file", new File(["x"], "a.csv", { type: "text/csv" }));
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  const res = await POST(formReq("/x?kind=ke_hoach", form), {
    params: Promise.resolve({ code: "acmv" }),
  });
  assert.equal(res.status, 415);
});

test(
  "POST /api/systems/:code/upload: upload kế hoạch hợp lệ → cập nhật ngày task, ghi system_uploads",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("sysup-ok");
    const acmv = await heId("acmv");
    const boqCode = uniq("BOQ-UP");
    const { taskId } = await taoWbs(projectId, "sysup-ok", { systemId: acmv, boqCode });
    const admin = await taoUser("admin", "sysup-ok");
    await dangNhapDuAn(admin, projectId);
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(xlsxPlanBuffer(boqCode, "2026-09-10", "2026-09-20"))], "a.xlsx", {
        type: XLSX_MIME,
      }),
    );
    const { POST } = await import("@/app/api/systems/[code]/upload/route");
    const res = await POST(formReq("/x?kind=ke_hoach", form), {
      params: Promise.resolve({ code: "acmv" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.matched, 1);
    const row = await queryOne<{ start_date: string; end_date: string }>(
      `SELECT start_date, end_date FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(row?.start_date, "2026-09-10");
    assert.equal(row?.end_date, "2026-09-20");
    const uploadRow = await queryOne<{ id: number }>(
      `SELECT id FROM system_uploads WHERE id = ?`,
      body.uploadId,
    );
    assert.ok(uploadRow);
  },
);

// ============================================================================
// GET /api/systems/:code/upload-template
// ============================================================================

test("GET /api/systems/:code/upload-template: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/systems/[code]/upload-template/route");
  const res = await GET(getreq("/x?kind=ke_hoach"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 401);
});

test("GET /api/systems/:code/upload-template: hệ không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("sysuptpl-404");
  const pm = await taoUser("pm", "sysuptpl-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/systems/[code]/upload-template/route");
  const res = await GET(getreq("/x?kind=ke_hoach"), {
    params: Promise.resolve({ code: "khong-ton-tai" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/systems/:code/upload-template: kind không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("sysuptpl-400");
  const pm = await taoUser("pm", "sysuptpl-400");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/systems/[code]/upload-template/route");
  const res = await GET(getreq("/x?kind=abc"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 400);
});

test("GET /api/systems/:code/upload-template: kind=ke_hoach hợp lệ → trả xlsx (magic PK)", S, async () => {
  const projectId = await taoDuAn("sysuptpl-ok");
  const pm = await taoUser("pm", "sysuptpl-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/systems/[code]/upload-template/route");
  const res = await GET(getreq("/x?kind=ke_hoach"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
});

// ============================================================================
// GET /api/systems/:code/uploads
// ============================================================================

test("GET /api/systems/:code/uploads: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/systems/[code]/uploads/route");
  const res = await GET(getreq("/x?kind=ke_hoach"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 401);
});

test("GET /api/systems/:code/uploads: hệ không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("sysuploads-404");
  const pm = await taoUser("pm", "sysuploads-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/systems/[code]/uploads/route");
  const res = await GET(getreq("/x?kind=ke_hoach"), {
    params: Promise.resolve({ code: "khong-ton-tai" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/systems/:code/uploads: liệt kê đúng lịch sử upload vừa tạo", S, async () => {
  const projectId = await taoDuAn("sysuploads-ok");
  const acmv = await heId("acmv");
  const boqCode = uniq("BOQ-UPL");
  await taoWbs(projectId, "sysuploads-ok", { systemId: acmv, boqCode });
  const admin = await taoUser("admin", "sysuploads-ok");
  await dangNhapDuAn(admin, projectId);
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(xlsxPlanBuffer(boqCode, "2026-09-01", "2026-09-05"))], "a.xlsx", {
      type: XLSX_MIME,
    }),
  );
  const { POST } = await import("@/app/api/systems/[code]/upload/route");
  await POST(formReq("/x?kind=ke_hoach", form), { params: Promise.resolve({ code: "acmv" }) });

  const { GET } = await import("@/app/api/systems/[code]/uploads/route");
  const res = await GET(getreq("/x?kind=ke_hoach"), { params: Promise.resolve({ code: "acmv" }) });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
});

// ============================================================================
// GET /api/system-uploads/:id/file
// ============================================================================

test("GET /api/system-uploads/:id/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/system-uploads/:id/file: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("sysupfile-400");
  const pm = await taoUser("pm", "sysupfile-400");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/system-uploads/:id/file: không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("sysupfile-404");
  const pm = await taoUser("pm", "sysupfile-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/system-uploads/:id/file: thuộc dự án khác → 403", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("sysupfile-403A");
  const projectB = await taoDuAn("sysupfile-403B");
  const acmv = await heId("acmv");
  const uploadId = await insertId(
    `INSERT INTO system_uploads (system_id, project_id, kind, file_name, original_name, row_count, matched_count, unmatched_count)
     VALUES (?, ?, 'ke_hoach', ?, 'a.xlsx', 0, 0, 0)`,
    acmv,
    projectB,
    `not-exist-${uniq("f")}.xlsx`,
  );
  const pmA = await taoUser("pm", "sysupfile-403A");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ id: String(uploadId) }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/system-uploads/:id/file: file tồn tại → trả đúng byte đã lưu", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectId = await taoDuAn("sysupfile-ok");
  const acmv = await heId("acmv");
  const pm = await taoUser("pm", "sysupfile-ok");
  const fileName = `sysup-test-${uniq("f")}.xlsx`;
  const content = xlsxPlanBuffer("X", "2026-09-01", "2026-09-02");
  await storagePut(pm.orgId, fileName, content);
  const uploadId = await insertId(
    `INSERT INTO system_uploads (system_id, project_id, kind, file_name, original_name, row_count, matched_count, unmatched_count)
     VALUES (?, ?, 'ke_hoach', ?, 'mau.xlsx', 0, 0, 0)`,
    acmv,
    projectId,
    fileName,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/system-uploads/[id]/file/route");
  const res = await GET(getreq("/x"), {
    params: Promise.resolve({ id: String(uploadId) }),
  });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.equals(content), true);
});

// ============================================================================
// GET /api/portfolio/kpi
// ============================================================================

test("GET /api/portfolio/kpi: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/portfolio/kpi/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/portfolio/kpi: trả tổng hợp KPI theo user_projects hiện tại", S, async () => {
  const projectId = await taoDuAn("pfkpi-ok");
  const pm = await taoUser("pm", "pfkpi-ok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/portfolio/kpi/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.totalProjects >= 1);
});

// ============================================================================
// GET /api/v1/materials, /api/v1/packages, /api/v1/dashboard/kpi (API key)
// ============================================================================

test("GET /api/v1/materials: thiếu key → 401", S, async () => {
  const { GET } = await import("@/app/api/v1/materials/route");
  const res = await GET(apiReq("/api/v1/materials"));
  assert.equal(res.status, 401);
});

test("GET /api/v1/materials: key sai scope (read_finance) → 403", S, async () => {
  const projectId = await taoDuAn("v1mat-403");
  const admin = await taoUser("admin", "v1mat-403");
  const { raw } = await taoApiKey(["read_finance"], projectId, admin.id);
  const { GET } = await import("@/app/api/v1/materials/route");
  const res = await GET(apiReq("/api/v1/materials", raw));
  assert.equal(res.status, 403);
});

test("GET /api/v1/materials: key hợp lệ → 200, chỉ thấy vật tư đúng dự án của key", S, async () => {
  const projectA = await taoDuAn("v1mat-okA");
  const projectB = await taoDuAn("v1mat-okB");
  const admin = await taoUser("admin", "v1mat-ok");
  await taoMaterial(projectA, "v1mat-okA");
  await taoMaterial(projectB, "v1mat-okB");
  const { raw } = await taoApiKey(["read"], projectA, admin.id);
  const { GET } = await import("@/app/api/v1/materials/route");
  const res = await GET(apiReq("/api/v1/materials", raw));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.ok(data.length >= 1);
  assert.ok(data.every((m: { id: number }) => m.id));
});

test("GET /api/v1/packages: thiếu key → 401", S, async () => {
  const { GET } = await import("@/app/api/v1/packages/route");
  const res = await GET(apiReq("/api/v1/packages"));
  assert.equal(res.status, 401);
});

test("GET /api/v1/packages: key hợp lệ → 200, lọc đúng theo sheet slug", S, async () => {
  const projectId = await taoDuAn("v1pkg-ok");
  const admin = await taoUser("admin", "v1pkg-ok");
  const { wpId, sheetId } = await taoWbs(projectId, "v1pkg-ok");
  void wpId;
  const { queryOne } = await import("@/lib/db");
  const sheetRow = await queryOne<{ slug: string }>(
    `SELECT slug FROM sheet_types WHERE id = ?`,
    sheetId,
  );
  const { raw } = await taoApiKey(["read"], projectId, admin.id);
  const { GET } = await import("@/app/api/v1/packages/route");
  const res = await GET(apiReq(`/api/v1/packages?sheet=${sheetRow!.slug}`, raw));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.ok(data.length >= 1);
});

test("GET /api/v1/dashboard/kpi: thiếu key → 401", S, async () => {
  const { GET } = await import("@/app/api/v1/dashboard/kpi/route");
  const res = await GET(apiReq("/api/v1/dashboard/kpi"));
  assert.equal(res.status, 401);
});

test("GET /api/v1/dashboard/kpi: key hợp lệ → 200, trả kpi + statusCounts", S, async () => {
  const projectId = await taoDuAn("v1kpi-ok");
  const admin = await taoUser("admin", "v1kpi-ok");
  await taoWbs(projectId, "v1kpi-ok");
  const { raw } = await taoApiKey(["read"], projectId, admin.id);
  const { GET } = await import("@/app/api/v1/dashboard/kpi/route");
  const res = await GET(apiReq("/api/v1/dashboard/kpi", raw));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.kpi));
  assert.ok(typeof body.statusCounts === "object");
});
