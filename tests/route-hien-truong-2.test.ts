import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm HIỆN TRƯỜNG 2 (Việc V4, Đợt 4 chiến dịch
// coverage) — nhân sự · huy động · môi trường · bảo hành · rủi ro · quan trắc · album ·
// bàn giao · thiết bị · hồ sơ NTP. 44 route trong phạm vi:
//   - app/api/attendance/route.ts, app/api/attendance/[id]/route.ts
//   - app/api/personnel/route.ts, app/api/personnel/[id]/route.ts
//   - app/api/mobilization/route.ts, app/api/mobilization/[id]/route.ts
//   - app/api/demob/route.ts, app/api/demob/[id]/route.ts
//   - app/api/commissioning/route.ts, app/api/commissioning/[id]/route.ts
//   - app/api/env-monitoring/route.ts, app/api/env-monitoring/[id]/route.ts
//   - app/api/env-permits/[id]/file/route.ts
//   - app/api/waste-logs/route.ts, app/api/waste-logs/[id]/route.ts
//   - app/api/warranty-items/route.ts, app/api/warranty-items/[id]/route.ts
//   - app/api/warranty-claims/route.ts, app/api/warranty-claims/[id]/route.ts
//   - app/api/om-documents/route.ts, app/api/om-documents/[id]/route.ts
//   - app/api/lessons-learned/route.ts, app/api/lessons-learned/[id]/route.ts
//   - app/api/community-cases/route.ts, app/api/community-cases/[id]/route.ts
//   - app/api/risks/route.ts, app/api/risks/[id]/route.ts
//   - app/api/monitoring-points/route.ts, app/api/monitoring-points/[id]/route.ts,
//     app/api/monitoring-points/[id]/readings/route.ts
//   - app/api/progress-albums/route.ts, app/api/progress-albums/[id]/route.ts,
//     app/api/progress-albums/[id]/photos/route.ts
//   - app/api/hse/[id]/photos/route.ts, app/api/hse-photos/[id]/route.ts
//   - app/api/handover-items/[id]/route.ts, app/api/handover-items/[id]/file/route.ts
//   - app/api/inspection-requests/[id]/route.ts
//   - app/api/diaries/[date]/lock/route.ts
//   - app/api/equipment/[id]/cert/route.ts, app/api/equipment/[id]/logs/route.ts
//   - app/api/certifications/[id]/file/route.ts, app/api/legal-documents/[id]/file/route.ts
//   - app/api/meetings/[id]/actions/route.ts, app/api/meetings/[id]/actions/[aid]/route.ts,
//     app/api/meetings/actions/route.ts
//   - app/api/crews/[id]/members/route.ts
//   - app/api/subcontractors/[supplierId]/documents/route.ts,
//     app/api/subcontractors/[supplierId]/evaluations/route.ts,
//     app/api/subcontractors/[supplierId]/profile/route.ts
//   - app/api/subcon-documents/[id]/route.ts

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `HT2 ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  overrides: { supplierId?: number | null; orgId?: number } = {},
): Promise<{ id: number; passwordHash: string; name: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const name = `HT2 ${ten}`;
  const email = `ht2-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id, supplier_id) VALUES (?, ?, 'hash-test-ht2', ?, ?, ?)`,
    name,
    email,
    role,
    overrides.orgId ?? 1,
    overrides.supplierId ?? null,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, name };
}

async function taoSupplier(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name) VALUES (?)`, `NTP ${uniq(ten)}`);
}

async function taoSystem(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ test')`,
    `SYS-${uniq(ten)}`,
  );
}

async function taoCrew(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO crews (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tổ ${uniq(ten)}`,
  );
}

async function taoPersonnel(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO personnel (project_id, full_name, status) VALUES (?, ?, 'active')`,
    projectId,
    `NV ${uniq(ten)}`,
  );
}

/** Chuỗi Tower → SheetType → WorkPackage → Task đầy đủ thuộc 1 dự án. */
async function taoTask(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${uniq(ten)}`,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, ?)`,
    towerId,
    `SH-${uniq(ten)}`,
    `Sheet ${ten}`,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, ?, 'T01')`,
    sheetId,
    `WP-${uniq(ten)}`,
    `Nhóm ${ten}`,
  );
  return insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, ?)`,
    wpId,
    `WP-${uniq(ten)}A,01`,
    `Task ${ten}`,
  );
}

async function taoWorkPackage(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(`INSERT INTO towers (name) VALUES (?)`, `Tháp ${uniq(ten)}`);
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, ?)`,
    towerId,
    `SH-${uniq(ten)}`,
    `Sheet ${ten}`,
  );
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, ?, 'T01')`,
    sheetId,
    `WP-${uniq(ten)}`,
    `Nhóm ${ten}`,
  );
}

async function taoMeeting(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO meetings (project_id, meeting_date, kind, title) VALUES (?, '2026-09-01', 'weekly', ?)`,
    projectId,
    `Họp ${uniq(ten)}`,
  );
}

async function taoHandoverItem(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO handover_items (project_id, title, status) VALUES (?, ?, 'pending')`,
    projectId,
    `Bàn giao ${uniq(ten)}`,
  );
}

async function taoInsuranceBond(projectId: number, ten: string, kind = "bao_lanh_bao_hanh"): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO insurance_bonds (project_id, kind, title) VALUES (?, ?, ?)`,
    projectId,
    kind,
    `Bảo lãnh ${uniq(ten)}`,
  );
}

async function taoWarrantyItem(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO warranty_items (project_id, title, status) VALUES (?, ?, 'active')`,
    projectId,
    `HMBH ${uniq(ten)}`,
  );
}

async function taoMonitoringPoint(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO monitoring_points (project_id, code, kind) VALUES (?, ?, 'lun')`,
    projectId,
    `MQT-${uniq(ten)}`,
  );
}

async function taoAlbum(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO progress_albums (project_id, milestone_label) VALUES (?, ?)`,
    projectId,
    `Mốc ${uniq(ten)}`,
  );
}

async function taoHseRecord(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO hse_records (project_id, kind, record_date, description)
     VALUES (?, 'inspection', '2026-09-01', ?)`,
    projectId,
    `HSE ${uniq(ten)}`,
  );
}

async function taoEquipment(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO equipment (code, name, kind) VALUES (?, ?, 'may')`,
    `EQ-${uniq(ten)}`,
    `Thiết bị ${ten}`,
  );
}

async function taoEquipmentInProject(projectId: number, ten: string): Promise<number> {
  const { insertId, run } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO equipment (code, name, kind, project_id) VALUES (?, ?, 'may', ?)`,
    `EQ-${uniq(ten)}`,
    `Thiết bị ${ten}`,
    projectId,
  );
  await run(`INSERT INTO equipment_logs (equipment_id, action) VALUES (?, 'issue')`, id);
  return id;
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Nội dung PDF tối thiểu nhưng đủ để `sniffMime` nhận diện đúng (magic byte "%PDF-"). */
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");
/** PNG 1x1 tối thiểu (magic byte hợp lệ cho parseUploadedFile accept: "image"). */
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);

function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

function pdfFile(name = "f.pdf"): File {
  return new File([PDF_BYTES], name, { type: "application/pdf" });
}
function pngFile(name = "f.png"): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

// ============================================================================
// GET/POST /api/attendance, PATCH/DELETE /api/attendance/:id
// ============================================================================

test("GET /api/attendance: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/attendance/route");
  const res = await GET(jreq("/api/attendance", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/attendance: subcon không có quyền chấm công → 403", S, async () => {
  const projectId = await taoDuAn("att-403");
  const sub = await taoUser("subcon", "att-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/attendance/route");
  const res = await POST(jreq("/api/attendance", { workDate: "2026-09-01", headcount: 5 }));
  assert.equal(res.status, 403);
});

test("POST /api/attendance: thiếu tổ đội lẫn nhân sự → 422", S, async () => {
  const projectId = await taoDuAn("att-422");
  const pm = await taoUser("pm", "att-422");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/attendance/route");
  const res = await POST(jreq("/api/attendance", { workDate: "2026-09-01", headcount: 5 }));
  assert.equal(res.status, 422);
});

test("POST /api/attendance: chấm công theo tổ thành công → ghi project_id server suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("att-ok");
  const pm = await taoUser("pm", "att-ok");
  const crewId = await taoCrew(projectId, "att-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/attendance/route");
  const res = await POST(
    jreq("/api/attendance", { workDate: "2026-09-01", crewId, headcount: 5 }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM attendance WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

test("PATCH /api/attendance/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("attid-isoA");
  const projectB = await taoDuAn("attid-isoB");
  const pmA = await taoUser("pm", "attid-isoA");
  const attId = await insertId(
    `INSERT INTO attendance (project_id, work_date, headcount) VALUES (?, '2026-09-01', 5)`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/attendance/[id]/route");
  const res = await PATCH(jreq("/x", { workDate: "2026-09-02", headcount: 6 }, "PATCH"), {
    params: Promise.resolve({ id: String(attId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/attendance/:id: engineer xoá được (recordAttendance)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("attid-del");
  const eng = await taoUser("engineer", "attid-del");
  const crewId = await taoCrew(projectId, "attid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/attendance/route");
  const created = await POST(jreq("/api/attendance", { workDate: "2026-09-01", crewId, headcount: 3 }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/attendance/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM attendance WHERE id = ?`, id);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/personnel, PATCH/DELETE /api/personnel/:id
// ============================================================================

test("GET /api/personnel: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/personnel/route");
  const res = await GET(jreq("/api/personnel", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/personnel: engineer không thấy CCCD (chỉ admin/pm)", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("pers-mask");
  const eng = await taoUser("engineer", "pers-mask");
  await run(
    `INSERT INTO personnel (project_id, full_name, id_number, status) VALUES (?, ?, '012345678900', 'active')`,
    projectId,
    `NV ${uniq("persmask")}`,
  );
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/personnel/route");
  const res = await GET(jreq("/api/personnel", undefined, "GET"));
  assert.equal(res.status, 200);
  const { personnel } = await res.json();
  assert.ok(personnel.length >= 1);
  assert.equal(personnel[0].idNumber, null);
});

test("POST /api/personnel: engineer không có quyền tạo (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("pers-403");
  const eng = await taoUser("engineer", "pers-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/personnel/route");
  const res = await POST(jreq("/api/personnel", { fullName: "Nguyễn Văn A" }));
  assert.equal(res.status, 403);
});

test("POST /api/personnel: thiếu họ tên → 422", S, async () => {
  const projectId = await taoDuAn("pers-422");
  const pm = await taoUser("pm", "pers-422");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/personnel/route");
  const res = await POST(jreq("/api/personnel", { fullName: "" }));
  assert.equal(res.status, 422);
});

test("POST /api/personnel: thành công", S, async () => {
  const projectId = await taoDuAn("pers-ok");
  const pm = await taoUser("pm", "pers-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/personnel/route");
  const res = await POST(jreq("/api/personnel", { fullName: `NV ${uniq("persok")}` }));
  assert.equal(res.status, 201);
});

test("GET /api/personnel/:id: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("persid-isoA");
  const projectB = await taoDuAn("persid-isoB");
  const pmA = await taoUser("pm", "persid-isoA");
  const persId = await taoPersonnel(projectB, "persid-iso");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/personnel/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(persId) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/personnel/:id: admin sửa thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("persid-ok");
  const admin = await taoUser("admin", "persid-ok");
  const persId = await taoPersonnel(projectId, "persid-ok");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/personnel/[id]/route");
  const newName = `Sửa ${uniq("persidok")}`;
  const res = await PATCH(jreq("/x", { fullName: newName }, "PATCH"), {
    params: Promise.resolve({ id: String(persId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ full_name: string }>(`SELECT full_name FROM personnel WHERE id = ?`, persId);
  assert.equal(row?.full_name, newName);
});

test("DELETE /api/personnel/:id: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("persid-del403");
  const eng = await taoUser("engineer", "persid-del403");
  const persId = await taoPersonnel(projectId, "persid-del403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/personnel/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(persId) }) });
  assert.equal(res.status, 403);
});

// ============================================================================
// GET/POST /api/mobilization, PATCH/DELETE /api/mobilization/:id
// ============================================================================

test("GET /api/mobilization: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/mobilization/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/mobilization: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("mob-403");
  const eng = await taoUser("engineer", "mob-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/mobilization/route");
  const res = await POST(jreq("/api/mobilization", { category: "mat_bang", title: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/mobilization: hạn không đúng định dạng ngày thật → 422 (không 500)", S, async () => {
  const projectId = await taoDuAn("mob-baddate");
  const pm = await taoUser("pm", "mob-baddate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/mobilization/route");
  const res = await POST(
    jreq("/api/mobilization", { category: "mat_bang", title: "x", dueDate: "2026-13-40" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/mobilization: tạo với status=done tự set done_date", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("mob-done");
  const pm = await taoUser("pm", "mob-done");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/mobilization/route");
  const res = await POST(
    jreq("/api/mobilization", { category: "mat_bang", title: "x", status: "done" }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ done_date: string | null }>(
    `SELECT done_date FROM mobilization_items WHERE id = ?`,
    id,
  );
  assert.ok(row?.done_date);
});

test("PATCH /api/mobilization/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("mobid-isoA");
  const projectB = await taoDuAn("mobid-isoB");
  const pmA = await taoUser("pm", "mobid-isoA");
  const id = await insertId(
    `INSERT INTO mobilization_items (project_id, category, title) VALUES (?, 'mat_bang', 'x')`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/mobilization/[id]/route");
  const res = await PATCH(jreq("/x", { title: "y" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/mobilization/:id: PM xoá thành công", S, async () => {
  const projectId = await taoDuAn("mobid-del");
  const pm = await taoUser("pm", "mobid-del");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/mobilization/route");
  const created = await POST(jreq("/api/mobilization", { category: "mat_bang", title: "xoá tôi" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/mobilization/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/demob, GET/PATCH/DELETE /api/demob/:id
// ============================================================================

test("GET /api/demob: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/demob/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/demob: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("demob-403");
  const sub = await taoUser("subcon", "demob-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/demob/route");
  const res = await POST(jreq("/api/demob", { title: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/demob: thiếu tên → 422", S, async () => {
  const projectId = await taoDuAn("demob-422");
  const eng = await taoUser("engineer", "demob-422");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/demob/route");
  const res = await POST(jreq("/api/demob", { title: "" }));
  assert.equal(res.status, 422);
});

test("GET /api/demob/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("demobid-isoA");
  const projectB = await taoDuAn("demobid-isoB");
  const pmA = await taoUser("pm", "demobid-isoA");
  const id = await insertId(`INSERT INTO demob_items (project_id, title) VALUES (?, 'x')`, projectB);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/demob/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/demob/:id: engineer sửa thành công (manageHandover)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("demobid-ok");
  const eng = await taoUser("engineer", "demobid-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/demob/route");
  const created = await POST(jreq("/api/demob", { title: "cũ" }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/demob/[id]/route");
  const res = await PATCH(jreq("/x", { title: "mới" }, "PATCH"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ title: string }>(`SELECT title FROM demob_items WHERE id = ?`, id);
  assert.equal(row?.title, "mới");
});

test("DELETE /api/demob/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("demobid-del");
  const eng = await taoUser("engineer", "demobid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/demob/route");
  const created = await POST(jreq("/api/demob", { title: "xoá tôi" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/demob/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/commissioning, GET/PATCH/DELETE /api/commissioning/:id
// ============================================================================

test("GET /api/commissioning: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/commissioning/route");
  const res = await GET(jreq("/api/commissioning", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/commissioning: engineer đặt result=passed → 403 (cần CAN.approve)", S, async () => {
  const projectId = await taoDuAn("comm-403");
  const eng = await taoUser("engineer", "comm-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/commissioning/route");
  const res = await POST(
    jreq("/api/commissioning", { systemName: "Điện", result: "passed" }),
  );
  assert.equal(res.status, 403);
});

test(
  "POST /api/commissioning: ngày chạy thử không đúng định dạng ngày thật → 422 (không 500)",
  S,
  async () => {
    const projectId = await taoDuAn("comm-baddate");
    const pm = await taoUser("pm", "comm-baddate");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/commissioning/route");
    const res = await POST(
      jreq("/api/commissioning", { systemName: "Điện", testedAt: "2026-13-40" }),
    );
    assert.equal(res.status, 422);
  },
);

test("POST /api/commissioning: PM đặt result=passed thành công", S, async () => {
  const projectId = await taoDuAn("comm-ok");
  const pm = await taoUser("pm", "comm-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/commissioning/route");
  const res = await POST(jreq("/api/commissioning", { systemName: "Điện", result: "passed" }));
  assert.equal(res.status, 201);
});

test("GET /api/commissioning/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("commid-isoA");
  const projectB = await taoDuAn("commid-isoB");
  const pmA = await taoUser("pm", "commid-isoA");
  const id = await insertId(
    `INSERT INTO commissioning (project_id, system_name) VALUES (?, 'x')`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/commissioning/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/commissioning/:id: engineer đổi sang failed → 403 (cần CAN.approve)", S, async () => {
  const projectId = await taoDuAn("commid-403");
  const eng = await taoUser("engineer", "commid-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/commissioning/route");
  const created = await POST(jreq("/api/commissioning", { systemName: "Điện" }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/commissioning/[id]/route");
  const res = await PATCH(jreq("/x", { result: "failed" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/commissioning/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("commid-del");
  const pm = await taoUser("pm", "commid-del");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/commissioning/route");
  const created = await POST(jreq("/api/commissioning", { systemName: "Điện" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/commissioning/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/env-monitoring, GET/PATCH/DELETE /api/env-monitoring/:id
// ============================================================================

test("GET /api/env-monitoring: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/env-monitoring/route");
  const res = await GET(jreq("/api/env-monitoring", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/env-monitoring: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("envm-403");
  const sub = await taoUser("subcon", "envm-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/env-monitoring/route");
  const res = await POST(
    jreq("/api/env-monitoring", {
      measuredAt: "2026-09-01",
      category: "nuoc_thai",
      indicator: "pH",
    }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/env-monitoring: ngày đo không hợp lệ (ngày thật) → 422", S, async () => {
  const projectId = await taoDuAn("envm-baddate");
  const eng = await taoUser("engineer", "envm-baddate");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/env-monitoring/route");
  const res = await POST(
    jreq("/api/env-monitoring", {
      measuredAt: "2026-02-30",
      category: "nuoc_thai",
      indicator: "pH",
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/env-monitoring: value <= threshold → passed=true (snapshot lúc ghi)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("envm-ok");
  const eng = await taoUser("engineer", "envm-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/env-monitoring/route");
  const res = await POST(
    jreq("/api/env-monitoring", {
      measuredAt: "2026-09-01",
      category: "nuoc_thai",
      indicator: "pH",
      value: 5,
      threshold: 8,
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ passed: boolean }>(`SELECT passed FROM env_monitoring WHERE id = ?`, id);
  assert.equal(row?.passed, true);
});

test("GET /api/env-monitoring/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("envmid-isoA");
  const projectB = await taoDuAn("envmid-isoB");
  const pmA = await taoUser("pm", "envmid-isoA");
  const id = await insertId(
    `INSERT INTO env_monitoring (project_id, measured_at, category, indicator) VALUES (?, '2026-09-01', 'nuoc_thai', 'pH')`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/env-monitoring/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/env-monitoring/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("envmid-del");
  const eng = await taoUser("engineer", "envmid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/env-monitoring/route");
  const created = await POST(
    jreq("/api/env-monitoring", { measuredAt: "2026-09-01", category: "nuoc_thai", indicator: "pH" }),
  );
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/env-monitoring/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET /api/env-permits/:id/file
// ============================================================================

test("GET /api/env-permits/:id/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/env-permits/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/env-permits/:id/file: chưa có file đính kèm → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("envpf-nofile");
  const pm = await taoUser("pm", "envpf-nofile");
  const id = await insertId(
    `INSERT INTO env_permits (project_id, kind, title) VALUES (?, 'dtm', 'x')`,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/env-permits/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("GET /api/env-permits/:id/file: có file → 200 kèm đúng byte đã lưu", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectId = await taoDuAn("envpf-ok");
  const pm = await taoUser("pm", "envpf-ok");
  const fileName = `envpermit-${uniq("f")}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  const id = await insertId(
    `INSERT INTO env_permits (project_id, kind, title, file_name, mime_type, original_name)
     VALUES (?, 'dtm', 'x', ?, 'application/pdf', 'x.pdf')`,
    projectId,
    fileName,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/env-permits/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("GET /api/env-permits/:id/file: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectA = await taoDuAn("envpf-isoA");
  const projectB = await taoDuAn("envpf-isoB");
  const pmA = await taoUser("pm", "envpf-isoA");
  const fileName = `envpermit-${uniq("iso")}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  const id = await insertId(
    `INSERT INTO env_permits (project_id, kind, title, file_name, mime_type) VALUES (?, 'dtm', 'x', ?, 'application/pdf')`,
    projectB,
    fileName,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/env-permits/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET/POST /api/waste-logs, GET/PATCH/DELETE /api/waste-logs/:id
// ============================================================================

test("GET /api/waste-logs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/waste-logs/route");
  const res = await GET(jreq("/api/waste-logs", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/waste-logs: loại chất thải không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("waste-422");
  const eng = await taoUser("engineer", "waste-422");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/waste-logs/route");
  const res = await POST(
    jreq("/api/waste-logs", { logDate: "2026-09-01", wasteType: "khong_ton_tai" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/waste-logs: ngày ghi nhận không phải ngày thật → 422 (không 500)", S, async () => {
  const projectId = await taoDuAn("waste-baddate");
  const eng = await taoUser("engineer", "waste-baddate");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/waste-logs/route");
  const res = await POST(
    jreq("/api/waste-logs", { logDate: "2026-13-40", wasteType: "ran_xd" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/waste-logs: thành công", S, async () => {
  const projectId = await taoDuAn("waste-ok");
  const eng = await taoUser("engineer", "waste-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/waste-logs/route");
  const res = await POST(jreq("/api/waste-logs", { logDate: "2026-09-01", wasteType: "ran_xd" }));
  assert.equal(res.status, 201);
});

test("GET /api/waste-logs/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("wasteid-isoA");
  const projectB = await taoDuAn("wasteid-isoB");
  const pmA = await taoUser("pm", "wasteid-isoA");
  const id = await insertId(
    `INSERT INTO waste_logs (project_id, log_date, waste_type) VALUES (?, '2026-09-01', 'ran_xd')`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/waste-logs/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/waste-logs/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("wasteid-del");
  const eng = await taoUser("engineer", "wasteid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/waste-logs/route");
  const created = await POST(jreq("/api/waste-logs", { logDate: "2026-09-01", wasteType: "ran_xd" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/waste-logs/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/warranty-items, GET/PATCH/DELETE /api/warranty-items/:id
// ============================================================================

test("GET /api/warranty-items: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/warranty-items/route");
  const res = await GET(jreq("/api/warranty-items", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/warranty-items: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wi-403");
  const sub = await taoUser("subcon", "wi-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/warranty-items/route");
  const res = await POST(jreq("/api/warranty-items", { title: "x" }));
  assert.equal(res.status, 403);
});

test(
  "POST /api/warranty-items: ngày bắt đầu bảo hành không phải ngày thật → 422 (không 500)",
  S,
  async () => {
    const projectId = await taoDuAn("wi-baddate");
    const eng = await taoUser("engineer", "wi-baddate");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/warranty-items/route");
    const res = await POST(
      jreq("/api/warranty-items", { title: "x", warrantyFrom: "2026-02-30" }),
    );
    assert.equal(res.status, 422);
  },
);

test("POST /api/warranty-items: guaranteeId không đúng loại bảo lãnh → 422", S, async () => {
  const projectId = await taoDuAn("wi-badguarantee");
  const eng = await taoUser("engineer", "wi-badguarantee");
  const bondId = await taoInsuranceBond(projectId, "wi-badguarantee", "car");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/warranty-items/route");
  const res = await POST(
    jreq("/api/warranty-items", { title: "x", guaranteeId: bondId }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/warranty-items: thành công", S, async () => {
  const projectId = await taoDuAn("wi-ok");
  const eng = await taoUser("engineer", "wi-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/warranty-items/route");
  const res = await POST(jreq("/api/warranty-items", { title: `HMBH ${uniq("wiok")}` }));
  assert.equal(res.status, 201);
});

test("GET /api/warranty-items/:id: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("wiid-isoA");
  const projectB = await taoDuAn("wiid-isoB");
  const pmA = await taoUser("pm", "wiid-isoA");
  const id = await taoWarrantyItem(projectB, "wiid-iso");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/warranty-items/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/warranty-items/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("wiid-del");
  const eng = await taoUser("engineer", "wiid-del");
  const id = await taoWarrantyItem(projectId, "wiid-del");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/warranty-items/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/warranty-claims, GET/PATCH/DELETE /api/warranty-claims/:id
// ============================================================================

test("GET /api/warranty-claims: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/warranty-claims/route");
  const res = await GET(jreq("/api/warranty-claims", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/warranty-claims: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wc-403");
  const sub = await taoUser("subcon", "wc-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/warranty-claims/route");
  const res = await POST(jreq("/api/warranty-claims", { description: "lỗi" }));
  assert.equal(res.status, 403);
});

test(
  "POST /api/warranty-claims: ngày báo lỗi không phải ngày thật → 422 (không 500)",
  S,
  async () => {
    const projectId = await taoDuAn("wc-baddate");
    const eng = await taoUser("engineer", "wc-baddate");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/warranty-claims/route");
    const res = await POST(
      jreq("/api/warranty-claims", { description: "lỗi", reportedDate: "2026-13-40" }),
    );
    assert.equal(res.status, 422);
  },
);

test("POST /api/warranty-claims: status=closed tự set closed_date hôm nay", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("wc-closed");
  const eng = await taoUser("engineer", "wc-closed");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/warranty-claims/route");
  const res = await POST(
    jreq("/api/warranty-claims", { description: "lỗi", status: "closed" }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ closed_date: string | null }>(
    `SELECT closed_date FROM warranty_claims WHERE id = ?`,
    id,
  );
  assert.ok(row?.closed_date);
});

test("GET /api/warranty-claims/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("wcid-isoA");
  const projectB = await taoDuAn("wcid-isoB");
  const pmA = await taoUser("pm", "wcid-isoA");
  const id = await insertId(
    `INSERT INTO warranty_claims (project_id, description) VALUES (?, 'lỗi')`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/warranty-claims/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/warranty-claims/:id: chuyển sang closed lần đầu tự set closed_date, không đè khi đã đóng",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("wcid-closeflow");
    const eng = await taoUser("engineer", "wcid-closeflow");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/warranty-claims/route");
    const created = await POST(jreq("/api/warranty-claims", { description: "lỗi" }));
    const { id } = await created.json();

    const { PATCH } = await import("@/app/api/warranty-claims/[id]/route");
    const closed1 = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(closed1.status, 200);
    const row1 = await queryOne<{ closed_date: string | null }>(
      `SELECT closed_date FROM warranty_claims WHERE id = ?`,
      id,
    );
    assert.ok(row1?.closed_date);

    // Sửa lại record đã đóng (không đổi status) → không bị xoá closed_date đã có.
    const closed2 = await PATCH(jreq("/x", { status: "closed", severity: "high" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(closed2.status, 200);
    const row2 = await queryOne<{ closed_date: string | null }>(
      `SELECT closed_date FROM warranty_claims WHERE id = ?`,
      id,
    );
    assert.equal(row2?.closed_date, row1?.closed_date);
  },
);

test("DELETE /api/warranty-claims/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("wcid-del");
  const eng = await taoUser("engineer", "wcid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/warranty-claims/route");
  const created = await POST(jreq("/api/warranty-claims", { description: "xoá tôi" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/warranty-claims/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/om-documents, GET/DELETE /api/om-documents/:id
// ============================================================================

test("GET /api/om-documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/om-documents/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/om-documents: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("omd-403");
  const sub = await taoUser("subcon", "omd-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/om-documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HD");
  const res = await POST(formReq("/api/om-documents", form));
  assert.equal(res.status, 403);
});

test("POST /api/om-documents: thiếu tên tài liệu → 422", S, async () => {
  const projectId = await taoDuAn("omd-422");
  const eng = await taoUser("engineer", "omd-422");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/om-documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  const res = await POST(formReq("/api/om-documents", form));
  assert.equal(res.status, 422);
});

test("POST /api/om-documents: upload PDF thành công, GET trả đúng byte", S, async () => {
  const projectId = await taoDuAn("omd-ok");
  const eng = await taoUser("engineer", "omd-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/om-documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", `HD ${uniq("omdok")}`);
  const created = await POST(formReq("/api/om-documents", form));
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const { GET } = await import("@/app/api/om-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("GET /api/om-documents/:id: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("omdid-isoA");
  const projectB = await taoDuAn("omdid-isoB");
  const eng = await taoUser("engineer", "omdid-isoB");
  await dangNhapDuAn(eng, projectB);
  const { POST } = await import("@/app/api/om-documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HD B");
  const created = await POST(formReq("/api/om-documents", form));
  const { id } = await created.json();

  const pmA = await taoUser("pm", "omdid-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/om-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/om-documents/:id: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("omdid-403");
  const eng = await taoUser("engineer", "omdid-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/om-documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HD");
  const created = await POST(formReq("/api/om-documents", form));
  const { id } = await created.json();

  const sub = await taoUser("subcon", "omdid-403sub");
  await dangNhapDuAn(sub, projectId);
  const { DELETE } = await import("@/app/api/om-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 403);
});

// ============================================================================
// GET/POST /api/lessons-learned, GET/PATCH/DELETE /api/lessons-learned/:id
// ============================================================================

test("GET /api/lessons-learned: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/lessons-learned/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/lessons-learned: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("ll-403");
  const sub = await taoUser("subcon", "ll-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/lessons-learned/route");
  const res = await POST(jreq("/api/lessons-learned", { title: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/lessons-learned: thiếu tiêu đề → 422", S, async () => {
  const projectId = await taoDuAn("ll-422");
  const eng = await taoUser("engineer", "ll-422");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/lessons-learned/route");
  const res = await POST(jreq("/api/lessons-learned", { title: "" }));
  assert.equal(res.status, 422);
});

test("GET /api/lessons-learned/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("llid-isoA");
  const projectB = await taoDuAn("llid-isoB");
  const pmA = await taoUser("pm", "llid-isoA");
  const id = await insertId(`INSERT INTO lessons_learned (project_id, title) VALUES (?, 'x')`, projectB);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/lessons-learned/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/lessons-learned/:id: sửa thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("llid-ok");
  const eng = await taoUser("engineer", "llid-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/lessons-learned/route");
  const created = await POST(jreq("/api/lessons-learned", { title: "cũ" }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/lessons-learned/[id]/route");
  const res = await PATCH(jreq("/x", { title: "mới" }, "PATCH"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ title: string }>(`SELECT title FROM lessons_learned WHERE id = ?`, id);
  assert.equal(row?.title, "mới");
});

test("DELETE /api/lessons-learned/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("llid-del");
  const eng = await taoUser("engineer", "llid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/lessons-learned/route");
  const created = await POST(jreq("/api/lessons-learned", { title: "xoá tôi" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/lessons-learned/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/community-cases, GET/PATCH/DELETE /api/community-cases/:id
// ============================================================================

test("GET /api/community-cases: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/community-cases/route");
  const res = await GET(jreq("/api/community-cases", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("POST /api/community-cases: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cc-403");
  const sub = await taoUser("subcon", "cc-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/community-cases/route");
  const res = await POST(jreq("/api/community-cases", { title: "khiếu nại" }));
  assert.equal(res.status, 403);
});

test(
  "POST /api/community-cases: receivedDate không phải ngày thật → 422 (không 500)",
  S,
  async () => {
    const projectId = await taoDuAn("cc-baddate");
    const eng = await taoUser("engineer", "cc-baddate");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/community-cases/route");
    const res = await POST(
      jreq("/api/community-cases", { title: "khiếu nại", receivedDate: "2026-13-40" }),
    );
    assert.equal(res.status, 422);
  },
);

test("POST /api/community-cases: status=closed tự set closed_date", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cc-closed");
  const eng = await taoUser("engineer", "cc-closed");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/community-cases/route");
  const res = await POST(jreq("/api/community-cases", { title: "khiếu nại", status: "closed" }));
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ closed_date: string | null }>(
    `SELECT closed_date FROM community_cases WHERE id = ?`,
    id,
  );
  assert.ok(row?.closed_date);
});

test("GET /api/community-cases/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("ccid-isoA");
  const projectB = await taoDuAn("ccid-isoB");
  const pmA = await taoUser("pm", "ccid-isoA");
  const id = await insertId(`INSERT INTO community_cases (project_id, title) VALUES (?, 'x')`, projectB);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/community-cases/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/community-cases/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("ccid-del");
  const eng = await taoUser("engineer", "ccid-del");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/community-cases/route");
  const created = await POST(jreq("/api/community-cases", { title: "xoá tôi" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/community-cases/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/risks, PATCH/DELETE /api/risks/:id
// ============================================================================

test("GET /api/risks: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/risks/route");
  const res = await GET(jreq("/api/risks", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/risks: subcon không được xem sổ rủi ro → 403", S, async () => {
  const projectId = await taoDuAn("risk-403view");
  const sub = await taoUser("subcon", "risk-403view");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/risks/route");
  const res = await GET(jreq("/api/risks", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("POST /api/risks: subcon không có quyền ghi nhận → 403", S, async () => {
  const projectId = await taoDuAn("risk-403");
  const sub = await taoUser("subcon", "risk-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/risks/route");
  const res = await POST(
    jreq("/api/risks", { title: "x", category: "schedule", probability: 3, impact: 3 }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/risks: mã tự sinh R-000N và gán project_id server suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("risk-ok");
  const eng = await taoUser("engineer", "risk-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/risks/route");
  const res = await POST(
    jreq("/api/risks", { title: "Rủi ro test", category: "schedule", probability: 3, impact: 4 }),
  );
  assert.equal(res.status, 201);
  const { id, code } = await res.json();
  assert.match(code, /^R-\d{4}$/);
  const row = await queryOne<{ project_id: number }>(`SELECT project_id FROM risks WHERE id = ?`, id);
  assert.equal(row?.project_id, projectId);
});

test("PATCH /api/risks/:id: dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("riskid-isoA");
  const projectB = await taoDuAn("riskid-isoB");
  const pmA = await taoUser("pm", "riskid-isoA");
  const id = await insertId(
    `INSERT INTO risks (code, title, category, probability, impact, project_id) VALUES (?, 'x', 'schedule', 3, 3, ?)`,
    `R-${uniq("riso")}`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/risks/[id]/route");
  const res = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/risks/:id: đổi status=closed → ghi closed_at", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("riskid-close");
  const eng = await taoUser("engineer", "riskid-close");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/risks/route");
  const created = await POST(
    jreq("/api/risks", { title: "x", category: "schedule", probability: 2, impact: 2 }),
  );
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/risks/[id]/route");
  const res = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ closed_at: string | null }>(`SELECT closed_at FROM risks WHERE id = ?`, id);
  assert.ok(row?.closed_at);
});

test("DELETE /api/risks/:id: engineer không có quyền xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("riskid-del403");
  const eng = await taoUser("engineer", "riskid-del403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/risks/route");
  const created = await POST(
    jreq("/api/risks", { title: "x", category: "schedule", probability: 2, impact: 2 }),
  );
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/risks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 403);
});

test("DELETE /api/risks/:id: PM xoá thành công", S, async () => {
  const projectId = await taoDuAn("riskid-delok");
  const pm = await taoUser("pm", "riskid-delok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/risks/route");
  const created = await POST(
    jreq("/api/risks", { title: "x", category: "schedule", probability: 2, impact: 2 }),
  );
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/risks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/monitoring-points, GET/PATCH/DELETE /api/monitoring-points/:id,
// GET/POST /api/monitoring-points/:id/readings
// ============================================================================

test("GET /api/monitoring-points: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/monitoring-points/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/monitoring-points: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("mp-403");
  const sub = await taoUser("subcon", "mp-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/monitoring-points/route");
  const res = await POST(jreq("/api/monitoring-points", { code: "M1", kind: "lun" }));
  assert.equal(res.status, 403);
});

test("POST /api/monitoring-points: trùng mã trong dự án → 409", S, async () => {
  const projectId = await taoDuAn("mp-dup");
  const eng = await taoUser("engineer", "mp-dup");
  const code = `M-${uniq("mpdup")}`;
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/monitoring-points/route");
  const first = await POST(jreq("/api/monitoring-points", { code, kind: "lun" }));
  assert.equal(first.status, 201);
  const second = await POST(jreq("/api/monitoring-points", { code, kind: "lun" }));
  assert.equal(second.status, 409);
});

test("GET /api/monitoring-points/:id: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("mpid-isoA");
  const projectB = await taoDuAn("mpid-isoB");
  const pmA = await taoUser("pm", "mpid-isoA");
  const id = await taoMonitoringPoint(projectB, "mpid-iso");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/monitoring-points/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/monitoring-points/:id: đổi mã trùng mã điểm khác → 409", S, async () => {
  const projectId = await taoDuAn("mpid-dup");
  const eng = await taoUser("engineer", "mpid-dup");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/monitoring-points/route");
  const codeA = `M-${uniq("mpidA")}`;
  const codeB = `M-${uniq("mpidB")}`;
  const a = await POST(jreq("/api/monitoring-points", { code: codeA, kind: "lun" }));
  const { id: idA } = await a.json();
  await POST(jreq("/api/monitoring-points", { code: codeB, kind: "lun" }));
  const { PATCH } = await import("@/app/api/monitoring-points/[id]/route");
  const res = await PATCH(jreq("/x", { code: codeB }, "PATCH"), { params: Promise.resolve({ id: String(idA) }) });
  assert.equal(res.status, 409);
});

test("DELETE /api/monitoring-points/:id: xoá thành công (kèm CASCADE kỳ đo)", S, async () => {
  const projectId = await taoDuAn("mpid-del");
  const eng = await taoUser("engineer", "mpid-del");
  const id = await taoMonitoringPoint(projectId, "mpid-del");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/monitoring-points/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

test("GET /api/monitoring-points/:id/readings: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("mpr-isoA");
  const projectB = await taoDuAn("mpr-isoB");
  const pmA = await taoUser("pm", "mpr-isoA");
  const pointId = await taoMonitoringPoint(projectB, "mpr-iso");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/monitoring-points/[id]/readings/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(pointId) }) });
  assert.equal(res.status, 404);
});

test(
  "POST /api/monitoring-points/:id/readings: subcon không có quyền → 403",
  S,
  async () => {
    const projectId = await taoDuAn("mpr-403");
    const sub = await taoUser("subcon", "mpr-403");
    const pointId = await taoMonitoringPoint(projectId, "mpr-403");
    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/monitoring-points/[id]/readings/route");
    const res = await POST(jreq("/x", { measuredAt: "2026-09-01", value: 1 }, "POST"), {
      params: Promise.resolve({ id: String(pointId) }),
    });
    assert.equal(res.status, 403);
  },
);

test(
  "POST /api/monitoring-points/:id/readings: ngày đo không phải ngày thật → 422 (không 500)",
  S,
  async () => {
    const projectId = await taoDuAn("mpr-baddate");
    const eng = await taoUser("engineer", "mpr-baddate");
    const pointId = await taoMonitoringPoint(projectId, "mpr-baddate");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/monitoring-points/[id]/readings/route");
    const res = await POST(jreq("/x", { measuredAt: "2026-02-30", value: 1 }, "POST"), {
      params: Promise.resolve({ id: String(pointId) }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/monitoring-points/:id/readings: vượt ngưỡng alarm → level=alarm; trùng ngày → 409",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("mpr-alarm");
    const eng = await taoUser("engineer", "mpr-alarm");
    const pointId = await taoMonitoringPoint(projectId, "mpr-alarm");
    await run(`UPDATE monitoring_points SET warn_threshold = 5, alarm_threshold = 10 WHERE id = ?`, pointId);
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/monitoring-points/[id]/readings/route");
    const res = await POST(jreq("/x", { measuredAt: "2026-09-01", value: 12 }, "POST"), {
      params: Promise.resolve({ id: String(pointId) }),
    });
    assert.equal(res.status, 201);
    const { level } = await res.json();
    assert.equal(level, "alarm");

    const dup = await POST(jreq("/x", { measuredAt: "2026-09-01", value: 13 }, "POST"), {
      params: Promise.resolve({ id: String(pointId) }),
    });
    assert.equal(dup.status, 409);
  },
);

// ============================================================================
// GET/POST /api/progress-albums, GET/PATCH/DELETE /api/progress-albums/:id,
// GET/POST /api/progress-albums/:id/photos
// ============================================================================

test("GET /api/progress-albums: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/progress-albums/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("POST /api/progress-albums: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("alb-403");
  const eng = await taoUser("engineer", "alb-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/progress-albums/route");
  const res = await POST(jreq("/api/progress-albums", { milestoneLabel: "x" }));
  assert.equal(res.status, 403);
});

test("GET /api/progress-albums/:id: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("albid-isoA");
  const projectB = await taoDuAn("albid-isoB");
  const pmA = await taoUser("pm", "albid-isoA");
  const id = await taoAlbum(projectB, "albid-iso");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/progress-albums/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/progress-albums/:id: sửa thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("albid-ok");
  const pm = await taoUser("pm", "albid-ok");
  const id = await taoAlbum(projectId, "albid-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/progress-albums/[id]/route");
  const newLabel = `Mốc mới ${uniq("albidok")}`;
  const res = await PATCH(jreq("/x", { milestoneLabel: newLabel }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ milestone_label: string }>(
    `SELECT milestone_label FROM progress_albums WHERE id = ?`,
    id,
  );
  assert.equal(row?.milestone_label, newLabel);
});

test(
  "POST /api/progress-albums/:id/photos: upload ảnh thành công, GET liệt kê đúng",
  S,
  async () => {
    const projectId = await taoDuAn("albph-ok");
    const pm = await taoUser("pm", "albph-ok");
    const albumId = await taoAlbum(projectId, "albph-ok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/progress-albums/[id]/photos/route");
    const form = new FormData();
    form.set("file", pngFile());
    form.set("caption", "Ảnh 1");
    const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(albumId) }) });
    assert.equal(res.status, 201);

    const { GET } = await import("@/app/api/progress-albums/[id]/photos/route");
    const list = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(albumId) }) });
    assert.equal(list.status, 200);
    const { photos } = await list.json();
    assert.equal(photos.length, 1);
  },
);

test("POST /api/progress-albums/:id/photos: album dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("albph-isoA");
  const projectB = await taoDuAn("albph-isoB");
  const pmA = await taoUser("pm", "albph-isoA");
  const albumId = await taoAlbum(projectB, "albph-iso");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/progress-albums/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(albumId) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/progress-albums/:id: xoá album + ảnh kèm theo", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("albid-del");
  const pm = await taoUser("pm", "albid-del");
  const albumId = await taoAlbum(projectId, "albid-del");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/progress-albums/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  await POST(formReq("/x", form), { params: Promise.resolve({ id: String(albumId) }) });

  const { DELETE } = await import("@/app/api/progress-albums/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(albumId) }) });
  assert.equal(res.status, 200);
  const { photosDeleted } = await res.json();
  assert.equal(photosDeleted, 1);
  const row = await queryOne(`SELECT id FROM progress_albums WHERE id = ?`, albumId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/hse/:id/photos, GET/DELETE /api/hse-photos/:id
// ============================================================================

test("GET /api/hse/:id/photos: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/hse/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/hse/:id/photos: role cdt không có quyền upload → 403", S, async () => {
  const projectId = await taoDuAn("hsep-403");
  const cdt = await taoUser("cdt", "hsep-403");
  const hseId = await taoHseRecord(projectId, "hsep-403");
  await dangNhapDuAn(cdt, projectId);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/hse/:id/photos: subcon upload được, GET liệt kê đúng", S, async () => {
  const projectId = await taoDuAn("hsep-ok");
  const sub = await taoUser("subcon", "hsep-ok");
  const hseId = await taoHseRecord(projectId, "hsep-ok");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  assert.equal(created.status, 201);

  const { GET } = await import("@/app/api/hse/[id]/photos/route");
  const list = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(hseId) }) });
  assert.equal(list.status, 200);
  const { photos } = await list.json();
  assert.equal(photos.length, 1);
});

test("POST /api/hse/:id/photos: ghi nhận HSE dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("hsep-isoA");
  const projectB = await taoDuAn("hsep-isoB");
  const pmA = await taoUser("pm", "hsep-isoA");
  const hseId = await taoHseRecord(projectB, "hsep-iso");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  assert.equal(res.status, 404);
});

test("GET /api/hse-photos/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/hse-photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/hse-photos/:id: 200 trả đúng byte đã upload", S, async () => {
  const projectId = await taoDuAn("hseph-ok");
  const eng = await taoUser("engineer", "hseph-ok");
  const hseId = await taoHseRecord(projectId, "hseph-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  const { id: photoId } = await created.json();

  const { GET } = await import("@/app/api/hse-photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(photoId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PNG_BYTES));
});

test("GET /api/hse-photos/:id: dự án khác → 404 (chặn qua đoán id)", S, async () => {
  const projectA = await taoDuAn("hseph-isoA");
  const projectB = await taoDuAn("hseph-isoB");
  const engB = await taoUser("engineer", "hseph-isoB");
  const hseId = await taoHseRecord(projectB, "hseph-iso");
  await dangNhapDuAn(engB, projectB);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  const { id: photoId } = await created.json();

  const pmA = await taoUser("pm", "hseph-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/hse-photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(photoId) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/hse-photos/:id: người upload khác, không phải quản lý HSE → 403", S, async () => {
  const projectId = await taoDuAn("hseph-403");
  const sub1 = await taoUser("subcon", "hseph-403a");
  const sub2 = await taoUser("subcon", "hseph-403b");
  const hseId = await taoHseRecord(projectId, "hseph-403");
  await dangNhapDuAn(sub1, projectId);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  const { id: photoId } = await created.json();

  await dangNhapDuAn(sub2, projectId);
  const { DELETE } = await import("@/app/api/hse-photos/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(photoId) }) });
  assert.equal(res.status, 403);
});

test("DELETE /api/hse-photos/:id: người upload tự xoá được", S, async () => {
  const projectId = await taoDuAn("hseph-selfdel");
  const sub = await taoUser("subcon", "hseph-selfdel");
  const hseId = await taoHseRecord(projectId, "hseph-selfdel");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/hse/[id]/photos/route");
  const form = new FormData();
  form.set("file", pngFile());
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(hseId) }) });
  const { id: photoId } = await created.json();
  const { DELETE } = await import("@/app/api/hse-photos/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(photoId) }) });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/PATCH/DELETE /api/handover-items/:id, GET /api/handover-items/:id/file
// ============================================================================

test("GET /api/handover-items/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/handover-items/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/handover-items/:id: dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("hoid-isoA");
  const projectB = await taoDuAn("hoid-isoB");
  const pmA = await taoUser("pm", "hoid-isoA");
  const id = await taoHandoverItem(projectB, "hoid-iso");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/handover-items/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/handover-items/:id: engineer đặt status=accepted → 403 (cần CAN.approve)", S, async () => {
  const projectId = await taoDuAn("hoid-403");
  const eng = await taoUser("engineer", "hoid-403");
  const id = await taoHandoverItem(projectId, "hoid-403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/handover-items/[id]/route");
  const res = await PATCH(jreq("/x", { status: "accepted" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/handover-items/:id: PM đặt status=accepted thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("hoid-ok");
  const pm = await taoUser("pm", "hoid-ok");
  const id = await taoHandoverItem(projectId, "hoid-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/handover-items/[id]/route");
  const res = await PATCH(jreq("/x", { status: "accepted" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM handover_items WHERE id = ?`, id);
  assert.equal(row?.status, "accepted");
});

test("PATCH /api/handover-items/:id: multipart kèm file biên bản → lưu minutes_file", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("hoid-file");
  const eng = await taoUser("engineer", "hoid-file");
  const id = await taoHandoverItem(projectId, "hoid-file");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/handover-items/[id]/route");
  const form = new FormData();
  form.set("file", pdfFile());
  const res = await PATCH(formReq("/x", form, "PATCH"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ minutes_file: string | null }>(
    `SELECT minutes_file FROM handover_items WHERE id = ?`,
    id,
  );
  assert.ok(row?.minutes_file);
});

test("DELETE /api/handover-items/:id: xoá thành công", S, async () => {
  const projectId = await taoDuAn("hoid-del");
  const eng = await taoUser("engineer", "hoid-del");
  const id = await taoHandoverItem(projectId, "hoid-del");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/handover-items/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
});

test("GET /api/handover-items/:id/file: chưa có file → 404", S, async () => {
  const projectId = await taoDuAn("hoif-404");
  const pm = await taoUser("pm", "hoif-404");
  const id = await taoHandoverItem(projectId, "hoif-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/handover-items/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 404);
});

test("GET /api/handover-items/:id/file: có file (upload qua PATCH) → 200 đúng byte", S, async () => {
  const projectId = await taoDuAn("hoif-ok");
  const eng = await taoUser("engineer", "hoif-ok");
  const id = await taoHandoverItem(projectId, "hoif-ok");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/handover-items/[id]/route");
  const form = new FormData();
  form.set("file", pdfFile());
  await PATCH(formReq("/x", form, "PATCH"), { params: Promise.resolve({ id: String(id) }) });

  const { GET } = await import("@/app/api/handover-items/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

// ============================================================================
// GET/PATCH /api/inspection-requests/:id
// ============================================================================

test("GET /api/inspection-requests/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/inspection-requests/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/inspection-requests/:id: không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("insr-404");
  const pm = await taoUser("pm", "insr-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/inspection-requests/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test(
  "GET /api/inspection-requests/:id: dự án khác (suy qua task gắn phiếu) → 404",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const projectA = await taoDuAn("insr-isoA");
    const projectB = await taoDuAn("insr-isoB");
    const pmA = await taoUser("pm", "insr-isoA");
    const taskId = await taoTask(projectB, "insr-iso");
    const reqId = await insertId(
      `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, NOW())`,
      `YCNT-${uniq("insr")}`,
    );
    await run(
      `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
      reqId,
      taskId,
    );
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/inspection-requests/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(reqId) }) });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/inspection-requests/:id: engineer không có quyền (cần CAN.approve) → 403", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await taoDuAn("insr-403");
  const eng = await taoUser("engineer", "insr-403");
  const taskId = await taoTask(projectId, "insr-403");
  const reqId = await insertId(
    `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, NOW())`,
    `YCNT-${uniq("insr403")}`,
  );
  await run(`INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`, reqId, taskId);
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/inspection-requests/[id]/route");
  const res = await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
    params: Promise.resolve({ id: String(reqId) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/inspection-requests/:id: trạng thái không hợp lệ → 422", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await taoDuAn("insr-422");
  const pm = await taoUser("pm", "insr-422");
  const taskId = await taoTask(projectId, "insr-422");
  const reqId = await insertId(
    `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, NOW())`,
    `YCNT-${uniq("insr422")}`,
  );
  await run(`INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`, reqId, taskId);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/inspection-requests/[id]/route");
  const res = await PATCH(jreq("/x", { status: "khong_ton_tai" }, "PATCH"), {
    params: Promise.resolve({ id: String(reqId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/inspection-requests/:id: PM đổi trạng thái thành công", S, async () => {
  const { insertId, run, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("insr-ok");
  const pm = await taoUser("pm", "insr-ok");
  const taskId = await taoTask(projectId, "insr-ok");
  const reqId = await insertId(
    `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, NOW())`,
    `YCNT-${uniq("insrok")}`,
  );
  await run(`INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`, reqId, taskId);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/inspection-requests/[id]/route");
  const res = await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
    params: Promise.resolve({ id: String(reqId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM inspection_requests WHERE id = ?`,
    reqId,
  );
  assert.equal(row?.status, "confirmed");
});

// ============================================================================
// POST/DELETE /api/diaries/:date/lock
// ============================================================================

test("POST /api/diaries/:date/lock: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/diaries/[date]/lock/route");
  const res = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ date: "2026-09-01" }) });
  assert.equal(res.status, 401);
});

test("POST /api/diaries/:date/lock: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("diary-403");
  const eng = await taoUser("engineer", "diary-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/diaries/[date]/lock/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ date: uniqDate() }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/diaries/:date/lock: ngày không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("diary-422");
  const pm = await taoUser("pm", "diary-422");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/diaries/[date]/lock/route");
  const res = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ date: "khong-phai-ngay" }) });
  assert.equal(res.status, 422);
});

test("POST /api/diaries/:date/lock: chưa có nhật ký ngày này → 404", S, async () => {
  const projectId = await taoDuAn("diary-404");
  const pm = await taoUser("pm", "diary-404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/diaries/[date]/lock/route");
  const res = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ date: uniqDate() }) });
  assert.equal(res.status, 404);
});

test("POST /api/diaries/:date/lock: khoá thành công, khoá lần 2 → 409 idempotent-check", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("diary-ok");
  const pm = await taoUser("pm", "diary-ok");
  const date = uniqDate();
  await insertId(`INSERT INTO site_diaries (diary_date, project_id) VALUES (?, ?)`, date, projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/diaries/[date]/lock/route");
  const first = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ date }) });
  assert.equal(first.status, 200);
  const second = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ date }) });
  assert.equal(second.status, 409);
});

test("DELETE /api/diaries/:date/lock: PM không đủ quyền mở khoá (chỉ Admin) → 403", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("diary-unlock403");
  const pm = await taoUser("pm", "diary-unlock403");
  const date = uniqDate();
  await insertId(
    `INSERT INTO site_diaries (diary_date, project_id, status) VALUES (?, ?, 'locked')`,
    date,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/diaries/[date]/lock/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ date }) });
  assert.equal(res.status, 403);
});

test("DELETE /api/diaries/:date/lock: Admin mở khoá thành công", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("diary-unlockok");
  const admin = await taoUser("admin", "diary-unlockok");
  const date = uniqDate();
  const diaryId = await insertId(
    `INSERT INTO site_diaries (diary_date, project_id, status) VALUES (?, ?, 'locked')`,
    date,
    projectId,
  );
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/diaries/[date]/lock/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ date }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM site_diaries WHERE id = ?`, diaryId);
  assert.equal(row?.status, "draft");
});

let diarySeq = 0;
function uniqDate(): string {
  diarySeq += 1;
  const day = (diarySeq % 27) + 1;
  return `2027-01-${String(day).padStart(2, "0")}`;
}

// ============================================================================
// GET/POST /api/equipment/:id/cert, GET/POST /api/equipment/:id/logs
// ============================================================================

test("GET /api/equipment/:id/cert: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/equipment/[id]/cert/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/equipment/:id/cert: chưa có giấy kiểm định → 404", S, async () => {
  const projectId = await taoDuAn("eqc-404");
  const pm = await taoUser("pm", "eqc-404");
  const eqId = await taoEquipmentInProject(projectId, "eqc-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/equipment/[id]/cert/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(eqId) }) });
  assert.equal(res.status, 404);
});

test("POST /api/equipment/:id/cert: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("eqc-403");
  const sub = await taoUser("subcon", "eqc-403");
  const eqId = await taoEquipmentInProject(projectId, "eqc-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/equipment/[id]/cert/route");
  const form = new FormData();
  form.set("file", pdfFile());
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(eqId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/equipment/:id/cert: upload thành công, GET trả đúng byte", S, async () => {
  const projectId = await taoDuAn("eqc-ok");
  const eng = await taoUser("engineer", "eqc-ok");
  const eqId = await taoEquipmentInProject(projectId, "eqc-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/equipment/[id]/cert/route");
  const form = new FormData();
  form.set("file", pdfFile());
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(eqId) }) });
  assert.equal(created.status, 201);
  const { GET } = await import("@/app/api/equipment/[id]/cert/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(eqId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("GET /api/equipment/:id/logs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/equipment/[id]/logs/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/equipment/:id/logs: subcon chỉ được 'return' thiết bị mình đang giữ, không phải action khác → 403", S, async () => {
  const projectId = await taoDuAn("eql-403");
  const sub = await taoUser("subcon", "eql-403");
  const eqId = await taoEquipmentInProject(projectId, "eql-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/equipment/[id]/logs/route");
  const res = await POST(jreq("/x", { action: "calibrate" }, "POST"), {
    params: Promise.resolve({ id: String(eqId) }),
  });
  assert.equal(res.status, 403);
});

test(
  "POST /api/equipment/:id/logs: subcon 'return' thiết bị KHÔNG do mình giữ → 403",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("eql-403b");
    const sub = await taoUser("subcon", "eql-403b");
    const eqId = await taoEquipmentInProject(projectId, "eql-403b");
    await run(`UPDATE equipment SET current_crew = 'Ai đó khác' WHERE id = ?`, eqId);
    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/equipment/[id]/logs/route");
    const res = await POST(jreq("/x", { action: "return" }, "POST"), {
      params: Promise.resolve({ id: String(eqId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("POST /api/equipment/:id/logs: engineer ghi log 'maintain' thành công", S, async () => {
  const projectId = await taoDuAn("eql-ok");
  const eng = await taoUser("engineer", "eql-ok");
  const eqId = await taoEquipmentInProject(projectId, "eql-ok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/equipment/[id]/logs/route");
  const res = await POST(jreq("/x", { action: "maintain" }, "POST"), {
    params: Promise.resolve({ id: String(eqId) }),
  });
  assert.equal(res.status, 201);
  const { GET } = await import("@/app/api/equipment/[id]/logs/route");
  const list = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(eqId) }) });
  assert.equal(list.status, 200);
  const { logs } = await list.json();
  assert.ok(logs.length >= 1);
});

// ============================================================================
// GET /api/certifications/:id/file, GET /api/legal-documents/:id/file
// ============================================================================

test("GET /api/certifications/:id/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/certifications/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/certifications/:id/file: có file → 200 đúng byte, dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectA = await taoDuAn("certf-isoA");
  const projectB = await taoDuAn("certf-isoB");
  const pmB = await taoUser("pm", "certf-isoB");
  const fileName = `cert-${uniq("f")}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  const id = await insertId(
    `INSERT INTO certifications (project_id, kind, file_name, mime_type) VALUES (?, 'the_an_toan', ?, 'application/pdf')`,
    projectB,
    fileName,
  );
  await dangNhapDuAn(pmB, projectB);
  const { GET } = await import("@/app/api/certifications/[id]/file/route");
  const ok = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(ok.status, 200);
  const buf = Buffer.from(await ok.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));

  const pmA = await taoUser("pm", "certf-isoA");
  await dangNhapDuAn(pmA, projectA);
  const cross = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(cross.status, 404);
});

test("GET /api/legal-documents/:id/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/legal-documents/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/legal-documents/:id/file: có file → 200 đúng byte, dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectA = await taoDuAn("legf-isoA");
  const projectB = await taoDuAn("legf-isoB");
  const pmB = await taoUser("pm", "legf-isoB");
  const fileName = `legal-${uniq("f")}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  const id = await insertId(
    `INSERT INTO legal_documents (project_id, kind, title, file_name, mime_type) VALUES (?, 'giay_phep_xd', 'x', ?, 'application/pdf')`,
    projectB,
    fileName,
  );
  await dangNhapDuAn(pmB, projectB);
  const { GET } = await import("@/app/api/legal-documents/[id]/file/route");
  const ok = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(ok.status, 200);
  const buf = Buffer.from(await ok.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));

  const pmA = await taoUser("pm", "legf-isoA");
  await dangNhapDuAn(pmA, projectA);
  const cross = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(cross.status, 404);
});

// ============================================================================
// POST /api/meetings/:id/actions, PATCH/DELETE /api/meetings/:id/actions/:aid,
// GET /api/meetings/actions
// ============================================================================

test("POST /api/meetings/:id/actions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/meetings/[id]/actions/route");
  const res = await POST(jreq("/x", {}, "POST"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/meetings/:id/actions: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("mact-403");
  const sub = await taoUser("subcon", "mact-403");
  const meetingId = await taoMeeting(projectId, "mact-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/meetings/[id]/actions/route");
  const res = await POST(jreq("/x", { content: "x" }, "POST"), {
    params: Promise.resolve({ id: String(meetingId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/meetings/:id/actions: cuộc họp dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("mact-isoA");
  const projectB = await taoDuAn("mact-isoB");
  const pmA = await taoUser("pm", "mact-isoA");
  const meetingId = await taoMeeting(projectB, "mact-iso");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/meetings/[id]/actions/route");
  const res = await POST(jreq("/x", { content: "x" }, "POST"), {
    params: Promise.resolve({ id: String(meetingId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/meetings/:id/actions: hạn hoàn thành không phải ngày thật → 422 (không 500)",
  S,
  async () => {
    const projectId = await taoDuAn("mact-baddate");
    const pm = await taoUser("pm", "mact-baddate");
    const meetingId = await taoMeeting(projectId, "mact-baddate");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/meetings/[id]/actions/route");
    const res = await POST(jreq("/x", { content: "x", dueDate: "2026-13-40" }, "POST"), {
      params: Promise.resolve({ id: String(meetingId) }),
    });
    assert.equal(res.status, 422);
  },
);

test("POST /api/meetings/:id/actions: thành công", S, async () => {
  const projectId = await taoDuAn("mact-ok");
  const pm = await taoUser("pm", "mact-ok");
  const meetingId = await taoMeeting(projectId, "mact-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/meetings/[id]/actions/route");
  const res = await POST(jreq("/x", { content: "Việc cần làm" }, "POST"), {
    params: Promise.resolve({ id: String(meetingId) }),
  });
  assert.equal(res.status, 201);
});

test(
  "PATCH /api/meetings/:id/actions/:aid: người KHÁC không phải assignee/Admin/PM đổi status → 403",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("mactid-403");
    const pm = await taoUser("pm", "mactid-403");
    const engOther = await taoUser("engineer", "mactid-403other");
    const meetingId = await taoMeeting(projectId, "mactid-403");
    const assignee = await taoUser("engineer", "mactid-403assignee");
    const aid = await insertId(
      `INSERT INTO meeting_actions (meeting_id, content, assignee) VALUES (?, ?, ?)`,
      meetingId,
      "x",
      assignee.id,
    );
    await dangNhapDuAn(engOther, projectId);
    const { PATCH } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
    const res = await PATCH(jreq("/x", { status: "done" }, "PATCH"), {
      params: Promise.resolve({ id: String(meetingId), aid: String(aid) }),
    });
    assert.equal(res.status, 403);
    void pm;
  },
);

test("PATCH /api/meetings/:id/actions/:aid: assignee tự đổi status=done thành công", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("mactid-ok");
  const meetingId = await taoMeeting(projectId, "mactid-ok");
  const assignee = await taoUser("engineer", "mactid-okassignee");
  const aid = await insertId(
    `INSERT INTO meeting_actions (meeting_id, content, assignee) VALUES (?, ?, ?)`,
    meetingId,
    "x",
    assignee.id,
  );
  await dangNhapDuAn(assignee, projectId);
  const { PATCH } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
  const res = await PATCH(jreq("/x", { status: "done" }, "PATCH"), {
    params: Promise.resolve({ id: String(meetingId), aid: String(aid) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM meeting_actions WHERE id = ?`, aid);
  assert.equal(row?.status, "done");
});

test("DELETE /api/meetings/:id/actions/:aid: engineer không đủ quyền (chỉ Admin/PM) → 403", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("mactid-del403");
  const eng = await taoUser("engineer", "mactid-del403");
  const meetingId = await taoMeeting(projectId, "mactid-del403");
  const aid = await insertId(`INSERT INTO meeting_actions (meeting_id, content) VALUES (?, 'x')`, meetingId);
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(meetingId), aid: String(aid) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/meetings/:id/actions/:aid: PM xoá thành công", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("mactid-delok");
  const pm = await taoUser("pm", "mactid-delok");
  const meetingId = await taoMeeting(projectId, "mactid-delok");
  const aid = await insertId(`INSERT INTO meeting_actions (meeting_id, content) VALUES (?, 'x')`, meetingId);
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/meetings/[id]/actions/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(meetingId), aid: String(aid) }),
  });
  assert.equal(res.status, 200);
});

test("GET /api/meetings/actions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/meetings/actions/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/meetings/actions: chỉ trả action mở được giao cho user hiện tại", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("mactopen-ok");
  const meetingId = await taoMeeting(projectId, "mactopen-ok");
  const eng = await taoUser("engineer", "mactopen-ok");
  const other = await taoUser("engineer", "mactopen-okother");
  await insertId(
    `INSERT INTO meeting_actions (meeting_id, content, assignee) VALUES (?, 'Việc của tôi', ?)`,
    meetingId,
    eng.id,
  );
  await insertId(
    `INSERT INTO meeting_actions (meeting_id, content, assignee) VALUES (?, 'Việc người khác', ?)`,
    meetingId,
    other.id,
  );
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/meetings/actions/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { actions } = await res.json();
  assert.ok(actions.every((a: { content: string }) => a.content === "Việc của tôi"));
});

// ============================================================================
// POST/DELETE /api/crews/:id/members
// ============================================================================

test("POST /api/crews/:id/members: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/crews/[id]/members/route");
  const res = await POST(jreq("/x", {}, "POST"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/crews/:id/members: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("cm-403");
  const eng = await taoUser("engineer", "cm-403");
  const crewId = await taoCrew(projectId, "cm-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/crews/[id]/members/route");
  const res = await POST(jreq("/x", { personnelId: 1 }, "POST"), {
    params: Promise.resolve({ id: String(crewId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/crews/:id/members: tổ đội dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("cm-isoA");
  const projectB = await taoDuAn("cm-isoB");
  const pmA = await taoUser("pm", "cm-isoA");
  const crewId = await taoCrew(projectB, "cm-iso");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/crews/[id]/members/route");
  const res = await POST(jreq("/x", { personnelId: 1 }, "POST"), {
    params: Promise.resolve({ id: String(crewId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/crews/:id/members: thêm thành công, gọi lại (trùng) vẫn 201 idempotent", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cm-ok");
  const pm = await taoUser("pm", "cm-ok");
  const crewId = await taoCrew(projectId, "cm-ok");
  const persId = await taoPersonnel(projectId, "cm-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/[id]/members/route");
  const first = await POST(jreq("/x", { personnelId: persId }, "POST"), {
    params: Promise.resolve({ id: String(crewId) }),
  });
  assert.equal(first.status, 201);
  const second = await POST(jreq("/x", { personnelId: persId }, "POST"), {
    params: Promise.resolve({ id: String(crewId) }),
  });
  assert.equal(second.status, 201);
  const row = await queryOne(
    `SELECT COUNT(*)::int AS c FROM crew_members WHERE crew_id = ? AND personnel_id = ?`,
    crewId,
    persId,
  );
  assert.equal((row as { c: number }).c, 1);
});

test("DELETE /api/crews/:id/members: bỏ nhân sự khỏi tổ thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cm-del");
  const pm = await taoUser("pm", "cm-del");
  const crewId = await taoCrew(projectId, "cm-del");
  const persId = await taoPersonnel(projectId, "cm-del");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/[id]/members/route");
  await POST(jreq("/x", { personnelId: persId }, "POST"), { params: Promise.resolve({ id: String(crewId) }) });
  const { DELETE } = await import("@/app/api/crews/[id]/members/route");
  const res = await DELETE(
    new NextRequest(`http://localhost/x?personnelId=${persId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: String(crewId) }) },
  );
  assert.equal(res.status, 200);
  const row = await queryOne(
    `SELECT crew_id FROM crew_members WHERE crew_id = ? AND personnel_id = ?`,
    crewId,
    persId,
  );
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/subcontractors/:supplierId/documents,
// GET/POST /api/subcontractors/:supplierId/evaluations,
// PATCH /api/subcontractors/:supplierId/profile,
// GET/DELETE /api/subcon-documents/:id
// ============================================================================

test("GET /api/subcontractors/:supplierId/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ supplierId: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "GET /api/subcontractors/:supplierId/documents: subcon xem hồ sơ NTP KHÁC → 403",
  S,
  async () => {
    const projectId = await taoDuAn("subd-403");
    const supplierMine = await taoSupplier("subd403mine");
    const supplierOther = await taoSupplier("subd403other");
    const sub = await taoUser("subcon", "subd-403", { supplierId: supplierMine });
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ supplierId: String(supplierOther) }),
    });
    assert.equal(res.status, 403);
  },
);

test("POST /api/subcontractors/:supplierId/documents: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const supplierId = await taoSupplier("subd-403post");
  const projectId = await taoDuAn("subd-403post");
  const eng = await taoUser("engineer", "subd-403post");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HS");
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ supplierId: String(supplierId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/subcontractors/:supplierId/documents: NCC không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("subd-404");
  const pm = await taoUser("pm", "subd-404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HS");
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ supplierId: "999999999" }) });
  assert.equal(res.status, 404);
});

test(
  "POST /api/subcontractors/:supplierId/documents: upload thành công, GET liệt kê + GET /api/subcon-documents/:id trả đúng byte",
  S,
  async () => {
    const supplierId = await taoSupplier("subd-ok");
    const projectId = await taoDuAn("subd-ok");
    const pm = await taoUser("pm", "subd-ok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
    const form = new FormData();
    form.set("file", pdfFile());
    form.set("title", "Hồ sơ năng lực");
    const created = await POST(formReq("/x", form), { params: Promise.resolve({ supplierId: String(supplierId) }) });
    assert.equal(created.status, 201);
    const { id: docId } = await created.json();

    const { GET } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
    const list = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ supplierId: String(supplierId) }) });
    assert.equal(list.status, 200);
    const { documents } = await list.json();
    assert.equal(documents.length, 1);

    const { GET: GET_DOC } = await import("@/app/api/subcon-documents/[id]/route");
    const stream = await GET_DOC(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(docId) }) });
    assert.equal(stream.status, 200);
    const buf = Buffer.from(await stream.arrayBuffer());
    assert.ok(buf.equals(PDF_BYTES));
  },
);

test("GET /api/subcontractors/:supplierId/evaluations: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ supplierId: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/subcontractors/:supplierId/evaluations: subcon không được tự đánh giá → 403", S, async () => {
  const supplierId = await taoSupplier("sube-403");
  const projectId = await taoDuAn("sube-403");
  const sub = await taoUser("subcon", "sube-403", { supplierId });
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
  const res = await POST(jreq("/x", { period: "2026-Q3" }, "POST"), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/subcontractors/:supplierId/evaluations: thiếu period → 422", S, async () => {
  const supplierId = await taoSupplier("sube-422");
  const projectId = await taoDuAn("sube-422");
  const pm = await taoUser("pm", "sube-422");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
  const res = await POST(jreq("/x", { period: "" }, "POST"), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/subcontractors/:supplierId/evaluations: trùng kỳ → 409", S, async () => {
  const supplierId = await taoSupplier("sube-dup");
  const projectId = await taoDuAn("sube-dup");
  const pm = await taoUser("pm", "sube-dup");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
  const period = "2026-Q1";
  const first = await POST(jreq("/x", { period, safetyScore: 4 }, "POST"), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
  assert.equal(first.status, 201);
  const second = await POST(jreq("/x", { period, safetyScore: 3 }, "POST"), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
  assert.equal(second.status, 409);
});

test("PATCH /api/subcontractors/:supplierId/profile: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ supplierId: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/subcontractors/:supplierId/profile: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const supplierId = await taoSupplier("subp-403");
  const projectId = await taoDuAn("subp-403");
  const eng = await taoUser("engineer", "subp-403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
  const res = await PATCH(jreq("/x", { siteRepName: "A" }, "PATCH"), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/subcontractors/:supplierId/profile: NCC không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("subp-404");
  const pm = await taoUser("pm", "subp-404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
  const res = await PATCH(jreq("/x", { siteRepName: "A" }, "PATCH"), {
    params: Promise.resolve({ supplierId: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/subcontractors/:supplierId/profile: dự án gửi kèm không thuộc quyền PM → 403",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const supplierId = await taoSupplier("subp-projforbid");
    const projectMine = await taoDuAn("subp-projforbidA");
    const projectOther = await taoDuAn("subp-projforbidB");
    const pm = await taoUser("pm", "subp-projforbid");
    // PM chỉ được gán vào projectMine (không phải Admin, không thấy toàn hệ khi
    // user_projects không rỗng).
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pm.id, projectMine);
    await dangNhapDuAn(pm, projectMine);
    const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
    const res = await PATCH(
      jreq("/x", { siteRepName: "A", projectId: projectOther }, "PATCH"),
      { params: Promise.resolve({ supplierId: String(supplierId) }) },
    );
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/subcontractors/:supplierId/profile: PM sửa thành công (upsert)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const supplierId = await taoSupplier("subp-ok");
  const projectId = await taoDuAn("subp-ok");
  const pm = await taoUser("pm", "subp-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
  const res = await PATCH(jreq("/x", { siteRepName: "Ông A", siteRepPhone: "0900000000" }, "PATCH"), {
    params: Promise.resolve({ supplierId: String(supplierId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ site_rep_name: string }>(
    `SELECT site_rep_name FROM subcontractor_profiles WHERE supplier_id = ?`,
    supplierId,
  );
  assert.equal(row?.site_rep_name, "Ông A");
});

test("GET /api/subcon-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/subcon-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/subcon-documents/:id: subcon xem tài liệu NTP KHÁC → 403", S, async () => {
  const supplierMine = await taoSupplier("subdoc403mine");
  const supplierOther = await taoSupplier("subdoc403other");
  const projectId = await taoDuAn("subdoc-403");
  const pm = await taoUser("pm", "subdoc-403pm");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HS other");
  const created = await POST(formReq("/x", form), {
    params: Promise.resolve({ supplierId: String(supplierOther) }),
  });
  const { id: docId } = await created.json();

  const sub = await taoUser("subcon", "subdoc-403sub", { supplierId: supplierMine });
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/subcon-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 403);
});

test("DELETE /api/subcon-documents/:id: người upload khác, không phải Admin/PM → 403", S, async () => {
  const supplierId = await taoSupplier("subdoc-del403");
  const projectId = await taoDuAn("subdoc-del403");
  const pm = await taoUser("pm", "subdoc-del403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HS");
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ supplierId: String(supplierId) }) });
  const { id: docId } = await created.json();

  const eng = await taoUser("engineer", "subdoc-del403eng");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/subcon-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 403);
});

test("DELETE /api/subcon-documents/:id: người upload tự xoá được", S, async () => {
  const supplierId = await taoSupplier("subdoc-delok");
  const projectId = await taoDuAn("subdoc-delok");
  const pm = await taoUser("pm", "subdoc-delok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const form = new FormData();
  form.set("file", pdfFile());
  form.set("title", "HS");
  const created = await POST(formReq("/x", form), { params: Promise.resolve({ supplierId: String(supplierId) }) });
  const { id: docId } = await created.json();
  const { DELETE } = await import("@/app/api/subcon-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 200);
});

void taoWorkPackage;
