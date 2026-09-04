import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm BẢN VẼ/HỒ SƠ CỤM 2 + BOT TELEGRAM/ZALO +
// TIỆN ÍCH DASHBOARD (Việc V7 — Đợt 4). Route:
//   - app/api/drawings/revisions/[id]/file/route.ts        (GET stream file rev)
//   - app/api/drawings/revisions/[id]/withdraw/route.ts     (POST thu hồi rev)
//   - app/api/drawings/scan-local/route.ts                  (POST quét thư mục cục bộ)
//   - app/api/documents-hub/route.ts                        (GET view hợp nhất hồ sơ)
//   - app/api/project-documents/[id]/route.ts               (GET/DELETE hồ sơ dự án)
//   - app/api/correspondences/[id]/files/route.ts           (GET/POST file scan công văn)
//   - app/api/correspondence-files/[id]/route.ts            (GET/DELETE file scan)
//   - app/api/proposals/[id]/decide/route.ts                (POST quyết đề xuất)
//   - app/api/proposals/[id]/submit/route.ts                (POST trình đề xuất)
//   - app/api/proposals/[id]/documents/route.ts             (GET/POST đính kèm đề xuất)
//   - app/api/proposals/[id]/documents/[did]/route.ts       (GET/DELETE đính kèm đề xuất)
//   - app/api/design-changes/[id]/decide/route.ts           (POST quyết thay đổi thiết kế)
//   - app/api/qc/documents/export/zip/route.ts              (GET zip hồ sơ chất lượng)
//   - app/api/tech-links/route.ts                           (GET/POST link công cụ ngoài)
//   - app/api/tech-links/[id]/route.ts                      (GET/PATCH/DELETE 1 link)
//   - app/api/tech/health-check/route.ts                    (GET kiểm tra hệ thống)
//   - app/api/tech/system-status/route.ts                   (GET trạng thái hệ thống)
//   - app/api/telegram/link-otp/route.ts                    (POST sinh OTP liên kết)
//   - app/api/telegram/simulate-voice/route.ts              (GET/POST mô phỏng bot)
//   - app/api/zalo/link-otp/route.ts                        (POST sinh/xác thực OTP)
//   - app/api/zalo/simulate-action/route.ts                 (POST mô phỏng bot)
//   - app/api/saved-reports/[id]/data/route.ts              (GET chạy báo cáo đã lưu)
//   - app/api/schedule-control/route.ts                     (GET đường găng/chậm tiến độ)
//   - app/api/dashboard/evm/route.ts                        (GET EVM)
//   - app/api/dashboard/floors/route.ts                     (GET ma trận tầng×sheet)
//   - app/api/dashboard/forecast/route.ts                   (GET dự báo hoàn thành)
//   - app/api/export/excel/route.ts                         (GET xuất Excel)
//   - app/api/events/route.ts                               (GET SSE)
// Không đợi SSE (chỉ kiểm 401 + content-type rồi huỷ stream ngay).

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `HSB ${uniq(ten)}`);
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `hsb-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-hsb', ?, 1)`,
    `HSB ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Chuỗi Tower → SheetType → WorkPackage → Task đầy đủ thuộc 1 dự án (task_documents suy
 * project qua chuỗi này — không có cột project_id trực tiếp). */
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

async function taoDrawing(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO drawings (code, name, kind, project_id) VALUES (?, ?, 'shop', ?)`,
    `DWG-${uniq(ten)}`,
    `Bản vẽ ${ten}`,
    projectId,
  );
}

const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");

async function taoRevision(
  drawingId: number,
  uploadedBy: number,
  ten: string,
  overrides: { status?: string; rev?: string } = {},
): Promise<number> {
  const { insertId, run } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const fileName = `revfile-${uniq(ten)}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  const id = await insertId(
    `INSERT INTO drawing_revisions (drawing_id, rev, file_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, 'a.pdf', 'application/pdf', ?, ?)`,
    drawingId,
    overrides.rev ?? "R0",
    fileName,
    PDF_BYTES.length,
    uploadedBy,
  );
  if (overrides.status) await run(`UPDATE drawing_revisions SET status = ? WHERE id = ?`, overrides.status, id);
  return id;
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const getReq = (url: string) => new NextRequest(`http://localhost${url}`, { method: "GET" });

function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

// ============================================================================
// GET /api/drawings/revisions/:id/file
// ============================================================================

test("GET /api/drawings/revisions/:id/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/drawings/revisions/[id]/file/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/drawings/revisions/:id/file: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("filebad");
  const pm = await taoUser("pm", "filebad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/drawings/revisions/[id]/file/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/drawings/revisions/:id/file: revision dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("fileisoA");
  const projectB = await taoDuAn("fileisoB");
  const pmB = await taoUser("pm", "fileisoB");
  const drawingB = await taoDrawing(projectB, "fileisoB");
  const revB = await taoRevision(drawingB, pmB.id, "fileisoB");

  const pmA = await taoUser("pm", "fileisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/drawings/revisions/[id]/file/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(revB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/drawings/revisions/:id/file: subcon vẫn xem được + byte khớp file đã lưu", S, async () => {
  const projectId = await taoDuAn("fileok");
  const pm = await taoUser("pm", "fileok");
  const sub = await taoUser("subcon", "fileok");
  const drawingId = await taoDrawing(projectId, "fileok");
  const revId = await taoRevision(drawingId, pm.id, "fileok");

  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/drawings/revisions/[id]/file/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(revId) }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("GET /api/drawings/revisions/:id/file: file không còn trên đĩa → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("filemissing");
  const pm = await taoUser("pm", "filemissing");
  const drawingId = await taoDrawing(projectId, "filemissing");
  const revId = await insertId(
    `INSERT INTO drawing_revisions (drawing_id, rev, file_name, original_name, mime_type, uploaded_by)
     VALUES (?, 'R0', ?, 'a.pdf', 'application/pdf', ?)`,
    drawingId,
    "khong-ton-tai.pdf",
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/drawings/revisions/[id]/file/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(revId) }) });
  assert.equal(res.status, 404);
});

// ============================================================================
// POST /api/drawings/revisions/:id/withdraw
// ============================================================================

test("POST /api/drawings/revisions/:id/withdraw: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/drawings/revisions/:id/withdraw: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("wdsub");
  const sub = await taoUser("subcon", "wdsub");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/drawings/revisions/:id/withdraw: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("wdbad");
  const pm = await taoUser("pm", "wdbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/drawings/revisions/:id/withdraw: revision dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("wdisoA");
  const projectB = await taoDuAn("wdisoB");
  const pmB = await taoUser("pm", "wdisoB");
  const drawingB = await taoDrawing(projectB, "wdisoB");
  const revB = await taoRevision(drawingB, pmB.id, "wdisoB");

  const pmA = await taoUser("pm", "wdisoA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(revB) }) });
  assert.equal(res.status, 404);
});

test("POST /api/drawings/revisions/:id/withdraw: người khác (không phải chủ rev) → 403", S, async () => {
  const projectId = await taoDuAn("wdforbid");
  const eng = await taoUser("engineer", "wdforbid");
  const eng2 = await taoUser("engineer", "wdforbid2");
  const drawingId = await taoDrawing(projectId, "wdforbid");
  const revId = await taoRevision(drawingId, eng.id, "wdforbid");

  await dangNhapDuAn(eng2, projectId);
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(revId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/drawings/revisions/:id/withdraw: rev đã duyệt (không còn thu hồi được) → 409", S, async () => {
  const projectId = await taoDuAn("wdconflict");
  const eng = await taoUser("engineer", "wdconflict");
  const drawingId = await taoDrawing(projectId, "wdconflict");
  const revId = await taoRevision(drawingId, eng.id, "wdconflict", { status: "approved" });

  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(revId) }) });
  assert.equal(res.status, 409);
});

test("POST /api/drawings/revisions/:id/withdraw: chính chủ thu hồi thành công → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("wdok");
  const eng = await taoUser("engineer", "wdok");
  const drawingId = await taoDrawing(projectId, "wdok");
  const revId = await taoRevision(drawingId, eng.id, "wdok");

  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/drawings/revisions/[id]/withdraw/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(revId) }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "withdrawn");
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM drawing_revisions WHERE id = ?`,
    revId,
  );
  assert.equal(row?.status, "withdrawn");
});

// ============================================================================
// POST /api/drawings/scan-local
// ============================================================================

test("POST /api/drawings/scan-local: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/drawings/scan-local/route");
  const res = await POST(jreq("/x"));
  assert.equal(res.status, 401);
});

test("POST /api/drawings/scan-local: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("scansub");
  const sub = await taoUser("subcon", "scansub");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/drawings/scan-local/route");
  const res = await POST(jreq("/x"));
  assert.equal(res.status, 403);
});

test("POST /api/drawings/scan-local: thư mục data/uploads/drawings chưa tồn tại → 404 (ghi nhận: DRAWINGS_DIR là hằng cứng, không đổi được trong test)", S, async () => {
  const projectId = await taoDuAn("scanok");
  const pm = await taoUser("pm", "scanok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/scan-local/route");
  const res = await POST(jreq("/x"));
  assert.equal(res.status, 404);
});

// ============================================================================
// GET /api/documents-hub
// ============================================================================

test("GET /api/documents-hub: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/documents-hub/route");
  const res = await GET(getReq("/api/documents-hub"));
  assert.equal(res.status, 401);
});

test("GET /api/documents-hub: source không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("hubbad");
  const pm = await taoUser("pm", "hubbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/documents-hub/route");
  const res = await GET(getReq("/api/documents-hub?source=khong_ton_tai"));
  assert.equal(res.status, 422);
});

test("GET /api/documents-hub: thành công — thấy tài liệu dự án (project_documents)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectId = await taoDuAn("hubok");
  const pm = await taoUser("pm", "hubok");
  const fileName = `hub-${uniq("hubok")}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  await insertId(
    `INSERT INTO project_documents (title, file_name, original_name, mime_type, size_bytes, uploaded_by, project_id)
     VALUES (?, ?, 'a.pdf', 'application/pdf', ?, ?, ?)`,
    "Hồ sơ chung",
    fileName,
    PDF_BYTES.length,
    pm.id,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/documents-hub/route");
  const res = await GET(getReq("/api/documents-hub?source=project"));
  assert.equal(res.status, 200);
  const { documents } = await res.json();
  assert.ok(documents.some((d: { title: string }) => d.title === "Hồ sơ chung"));
});

// ============================================================================
// GET/DELETE /api/project-documents/:id
// ============================================================================

async function taoProjectDoc(
  projectId: number,
  uploadedBy: number,
  ten: string,
  overrides: { fileName?: string } = {},
) {
  const { insertId } = await import("@/lib/db");
  const fileName = overrides.fileName ?? `pd-${uniq(ten)}.pdf`;
  if (!overrides.fileName) {
    const { storagePut } = await import("@/lib/nen/storage");
    await storagePut(1, fileName, PDF_BYTES);
  }
  return insertId(
    `INSERT INTO project_documents (title, file_name, original_name, mime_type, size_bytes, uploaded_by, project_id)
     VALUES (?, ?, 'a.pdf', 'application/pdf', ?, ?, ?)`,
    `Doc ${ten}`,
    fileName,
    PDF_BYTES.length,
    uploadedBy,
    projectId,
  );
}

test("GET /api/project-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/project-documents/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/project-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("pdbad");
  const pm = await taoUser("pm", "pdbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/project-documents/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/project-documents/:id: tài liệu dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("pdisoA");
  const projectB = await taoDuAn("pdisoB");
  const pmB = await taoUser("pm", "pdisoB");
  const docB = await taoProjectDoc(projectB, pmB.id, "pdisoB");

  const pmA = await taoUser("pm", "pdisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/project-documents/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(docB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/project-documents/:id: thành công → stream đúng byte", S, async () => {
  const projectId = await taoDuAn("pdok");
  const pm = await taoUser("pm", "pdok");
  const docId = await taoProjectDoc(projectId, pm.id, "pdok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/project-documents/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("GET /api/project-documents/:id: file không còn trên đĩa → 404", S, async () => {
  const projectId = await taoDuAn("pdmissing");
  const pm = await taoUser("pm", "pdmissing");
  const docId = await taoProjectDoc(projectId, pm.id, "pdmissing", {
    fileName: "khong-ton-tai-pd.pdf",
  });
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/project-documents/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/project-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/project-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/project-documents/:id: không phải người upload và không phải Admin/PM → 403", S, async () => {
  const projectId = await taoDuAn("pdforbid");
  const eng = await taoUser("engineer", "pdforbid");
  const other = await taoUser("engineer", "pdforbidOther");
  const docId = await taoProjectDoc(projectId, other.id, "pdforbid");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/project-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/project-documents/:id: Admin/PM xoá được dù không phải người upload → xoá cả file vật lý", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const { storageGet } = await import("@/lib/nen/storage");
  const projectId = await taoDuAn("pdadmin");
  const eng = await taoUser("engineer", "pdadmin");
  const pm = await taoUser("pm", "pdadminPm");
  const fileName = `pd-del-${uniq("pdadmin")}.pdf`;
  const docId = await taoProjectDoc(projectId, eng.id, "pdadmin", { fileName });
  const { storagePut } = await import("@/lib/nen/storage");
  await storagePut(1, fileName, PDF_BYTES);
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/project-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
  assert.equal(await queryOne(`SELECT id FROM project_documents WHERE id = ?`, docId), undefined);
  assert.equal(await storageGet(1, fileName), null);
});

// ============================================================================
// GET/POST /api/correspondences/:id/files
// ============================================================================

async function taoCongVan(projectId: number, createdBy: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, project_id, created_by)
     VALUES (?, 'in', 'letter', 'CĐT', ?, CURRENT_DATE, ?, ?)`,
    `CV-${uniq(ten)}`,
    `Công văn ${ten}`,
    projectId,
    createdBy,
  );
}

test("GET /api/correspondences/:id/files: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/correspondences/[id]/files/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/correspondences/:id/files: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("cvfsub");
  const sub = await taoUser("subcon", "cvfsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/correspondences/[id]/files/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/correspondences/:id/files: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cvfbad");
  const pm = await taoUser("pm", "cvfbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/correspondences/[id]/files/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/correspondences/:id/files: công văn dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("cvfisoA");
  const projectB = await taoDuAn("cvfisoB");
  const pmB = await taoUser("pm", "cvfisoB");
  const cvB = await taoCongVan(projectB, pmB.id, "cvfisoB");

  const pmA = await taoUser("pm", "cvfisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/correspondences/[id]/files/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(cvB) }) });
  assert.equal(res.status, 404);
});

test("POST /api/correspondences/:id/files: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/correspondences/[id]/files/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/correspondences/:id/files: subcon không có quyền upload → 403", S, async () => {
  const projectId = await taoDuAn("cvfpsub");
  const sub = await taoUser("subcon", "cvfpsub");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/correspondences/[id]/files/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/correspondences/:id/files: thiếu file → 400", S, async () => {
  const projectId = await taoDuAn("cvfnofile");
  const pm = await taoUser("pm", "cvfnofile");
  const cvId = await taoCongVan(projectId, pm.id, "cvfnofile");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/correspondences/[id]/files/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(cvId) }) });
  assert.equal(res.status, 400);
});

test("POST /api/correspondences/:id/files: upload thành công → 201, xem lại thấy trong danh sách", S, async () => {
  const projectId = await taoDuAn("cvfok");
  const pm = await taoUser("pm", "cvfok");
  const cvId = await taoCongVan(projectId, pm.id, "cvfok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/correspondences/[id]/files/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "scan.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(cvId) }) });
  assert.equal(res.status, 201);

  const { GET } = await import("@/app/api/correspondences/[id]/files/route");
  const listRes = await GET(getReq("/x"), { params: Promise.resolve({ id: String(cvId) }) });
  const { files } = await listRes.json();
  assert.equal(files.length, 1);
});

// ============================================================================
// GET/DELETE /api/correspondence-files/:id
// ============================================================================

async function taoFileCongVan(cvId: number, uploadedBy: number, ten: string) {
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const fileName = `cvf-${uniq(ten)}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  return insertId(
    `INSERT INTO correspondence_files (correspondence_id, file_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, 'scan.pdf', 'application/pdf', ?, ?)`,
    cvId,
    fileName,
    PDF_BYTES.length,
    uploadedBy,
  );
}

test("GET /api/correspondence-files/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/correspondence-files/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/correspondence-files/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cvffsub");
  const sub = await taoUser("subcon", "cvffsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/correspondence-files/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/correspondence-files/:id: file dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("cvffisoA");
  const projectB = await taoDuAn("cvffisoB");
  const pmB = await taoUser("pm", "cvffisoB");
  const cvB = await taoCongVan(projectB, pmB.id, "cvffisoB");
  const fileB = await taoFileCongVan(cvB, pmB.id, "cvffisoB");

  const pmA = await taoUser("pm", "cvffisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/correspondence-files/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(fileB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/correspondence-files/:id: thành công → byte khớp", S, async () => {
  const projectId = await taoDuAn("cvffok");
  const pm = await taoUser("pm", "cvffok");
  const cvId = await taoCongVan(projectId, pm.id, "cvffok");
  const fileId = await taoFileCongVan(cvId, pm.id, "cvffok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/correspondence-files/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(fileId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("DELETE /api/correspondence-files/:id: người upload xoá được dù không phải Admin/PM", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cvffdel");
  const eng = await taoUser("engineer", "cvffdel");
  const cvId = await taoCongVan(projectId, eng.id, "cvffdel");
  const fileId = await taoFileCongVan(cvId, eng.id, "cvffdel");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/correspondence-files/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(fileId) }),
  });
  assert.equal(res.status, 200);
  assert.equal(
    await queryOne(`SELECT id FROM correspondence_files WHERE id = ?`, fileId),
    undefined,
  );
});

test("DELETE /api/correspondence-files/:id: người khác không phải Admin/PM/kỹ sư → 403", S, async () => {
  const projectId = await taoDuAn("cvffforbid");
  const bch = await taoUser("bch", "cvffforbid");
  const pm = await taoUser("pm", "cvffforbidPm");
  const cvId = await taoCongVan(projectId, pm.id, "cvffforbid");
  const fileId = await taoFileCongVan(cvId, pm.id, "cvffforbid");
  await dangNhapDuAn(bch, projectId);
  const { DELETE } = await import("@/app/api/correspondence-files/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(fileId) }),
  });
  assert.equal(res.status, 403);
});

// ============================================================================
// POST /api/proposals/:id/decide, /submit, /documents, /documents/:did
// ============================================================================

async function taoDeXuat(
  projectId: number,
  requestedBy: number,
  ten: string,
  overrides: { status?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO proposals (code, kind, title, status, requested_by, project_id, submitted_at)
     VALUES (?, 'other', ?, ?, ?, ?, CASE WHEN ? = 'submitted' THEN CURRENT_DATE ELSE NULL END)`,
    `DX-${uniq(ten)}`,
    `Đề xuất ${ten}`,
    overrides.status ?? "draft",
    requestedBy,
    projectId,
    overrides.status ?? "draft",
  );
}

test("POST /api/proposals/:id/decide: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/proposals/:id/decide: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("dxdbad");
  const pm = await taoUser("pm", "dxdbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/proposals/:id/decide: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("dxdinvalid");
  const pm = await taoUser("pm", "dxdinvalid");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdinvalid", { status: "submitted" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "khong_hop_le" }), {
    params: Promise.resolve({ id: String(dxId) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/proposals/:id/decide: engineer không được quyết → 403", S, async () => {
  const projectId = await taoDuAn("dxdforbid");
  const eng = await taoUser("engineer", "dxdforbid");
  const dxId = await taoDeXuat(projectId, eng.id, "dxdforbid", { status: "submitted" });
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dxId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/proposals/:id/decide: đề xuất dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("dxdisoA");
  const projectB = await taoDuAn("dxdisoB");
  const pmB = await taoUser("pm", "dxdisoB");
  const dxB = await taoDeXuat(projectB, pmB.id, "dxdisoB", { status: "submitted" });

  const pmA = await taoUser("pm", "dxdisoA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dxB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/proposals/:id/decide: đề xuất còn nháp (chưa trình) → 409", S, async () => {
  const projectId = await taoDuAn("dxddraft");
  const pm = await taoUser("pm", "dxddraft");
  const dxId = await taoDeXuat(projectId, pm.id, "dxddraft"); // draft
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dxId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/proposals/:id/decide: từ chối thiếu lý do → 409 (rejectReason bắt buộc)", S, async () => {
  const projectId = await taoDuAn("dxdnoreason");
  const pm = await taoUser("pm", "dxdnoreason");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdnoreason", { status: "submitted" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "rejected" }), {
    params: Promise.resolve({ id: String(dxId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/proposals/:id/decide: duyệt thành công → 200, quyết lần 2 → 409 (không đè)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("dxdok");
  const pm = await taoUser("pm", "dxdok");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdok", { status: "submitted" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dxId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM proposals WHERE id = ?`, dxId);
  assert.equal(row?.status, "approved");

  const res2 = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dxId) }),
  });
  assert.equal(res2.status, 409, "đã quyết rồi — không được quyết lại/đè");
});

test("POST /api/proposals/:id/submit: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/proposals/[id]/submit/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/proposals/:id/submit: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("dxsbad");
  const pm = await taoUser("pm", "dxsbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/submit/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/proposals/:id/submit: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("dxsnf");
  const pm = await taoUser("pm", "dxsnf");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/submit/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test("POST /api/proposals/:id/submit: người khác không phải Admin/PM → 403", S, async () => {
  const projectId = await taoDuAn("dxsforbid");
  const eng = await taoUser("engineer", "dxsforbid");
  const other = await taoUser("engineer", "dxsforbidOther");
  const dxId = await taoDeXuat(projectId, other.id, "dxsforbid");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/submit/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/proposals/:id/submit: đã trình rồi → 409", S, async () => {
  const projectId = await taoDuAn("dxsdup");
  const eng = await taoUser("engineer", "dxsdup");
  const dxId = await taoDeXuat(projectId, eng.id, "dxsdup", { status: "submitted" });
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/submit/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 409);
});

test("POST /api/proposals/:id/submit: chính người tạo trình thành công → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("dxsok");
  const eng = await taoUser("engineer", "dxsok");
  const dxId = await taoDeXuat(projectId, eng.id, "dxsok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/submit/route");
  const res = await POST(jreq("/x"), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM proposals WHERE id = ?`, dxId);
  assert.equal(row?.status, "submitted");
});

test("GET /api/proposals/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/proposals/[id]/documents/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/proposals/:id/documents: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("dxddocbad");
  const pm = await taoUser("pm", "dxddocbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/proposals/[id]/documents/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/proposals/:id/documents: đề xuất dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("dxddociA");
  const projectB = await taoDuAn("dxddociB");
  const pmB = await taoUser("pm", "dxddociB");
  const dxB = await taoDeXuat(projectB, pmB.id, "dxddociB");

  const pmA = await taoUser("pm", "dxddociA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/proposals/[id]/documents/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(dxB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/proposals/:id/documents: người không liên quan và không thấy hết đề xuất → 403", S, async () => {
  const projectId = await taoDuAn("dxddocforbid");
  const eng = await taoUser("engineer", "dxddocforbid");
  const other = await taoUser("engineer", "dxddocforbidOther");
  const dxId = await taoDeXuat(projectId, other.id, "dxddocforbid");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/proposals/[id]/documents/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/proposals/:id/documents: thiếu file → 400", S, async () => {
  const projectId = await taoDuAn("dxdocnofile");
  const pm = await taoUser("pm", "dxdocnofile");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdocnofile");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 400);
});

test("POST /api/proposals/:id/documents: đề xuất đã trình (không còn nháp) → 403 (canEditProposal)", S, async () => {
  const projectId = await taoDuAn("dxdocsubmitted");
  const pm = await taoUser("pm", "dxdocsubmitted");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdocsubmitted", { status: "submitted" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/proposals/:id/documents: upload thành công khi còn nháp → 201, xem lại & tải lại được", S, async () => {
  const projectId = await taoDuAn("dxdocok");
  const pm = await taoUser("pm", "dxdocok");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdocok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  form.set("caption", "Chú thích");
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(dxId) }) });
  assert.equal(res.status, 201);
  const { id: docId } = await res.json();

  const { GET: GETLIST } = await import("@/app/api/proposals/[id]/documents/route");
  const listRes = await GETLIST(getReq("/x"), { params: Promise.resolve({ id: String(dxId) }) });
  const { documents } = await listRes.json();
  assert.equal(documents.length, 1);

  const { GET: GETONE } = await import("@/app/api/proposals/[id]/documents/[did]/route");
  const oneRes = await GETONE(getReq("/x"), {
    params: Promise.resolve({ id: String(dxId), did: String(docId) }),
  });
  assert.equal(oneRes.status, 200);
  const buf = Buffer.from(await oneRes.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test("GET /api/proposals/:id/documents/:did: ID không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("dxdidbad");
  const pm = await taoUser("pm", "dxdidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/proposals/[id]/documents/[did]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1", did: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/proposals/:id/documents/:did: tài liệu không thuộc đề xuất này → 404", S, async () => {
  const projectId = await taoDuAn("dxdidmismatch");
  const pm = await taoUser("pm", "dxdidmismatch");
  const dx1 = await taoDeXuat(projectId, pm.id, "dxdidmismatch1");
  const dx2 = await taoDeXuat(projectId, pm.id, "dxdidmismatch2");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const uploaded = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(dx1) }) });
  const { id: docId } = await uploaded.json();

  const { GET } = await import("@/app/api/proposals/[id]/documents/[did]/route");
  const res = await GET(getReq("/x"), {
    params: Promise.resolve({ id: String(dx2), did: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/proposals/:id/documents/:did: xoá thành công khi còn nháp → 200, mất file vật lý", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const { storageGet } = await import("@/lib/nen/storage");
  const projectId = await taoDuAn("dxdiddel");
  const pm = await taoUser("pm", "dxdiddel");
  const dxId = await taoDeXuat(projectId, pm.id, "dxdiddel");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const uploaded = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(dxId) }) });
  const { id: docId } = await uploaded.json();
  const rowBefore = await queryOne<{ file_name: string }>(
    `SELECT file_name FROM proposal_documents WHERE id = ?`,
    docId,
  );

  const { DELETE } = await import("@/app/api/proposals/[id]/documents/[did]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(dxId), did: String(docId) }),
  });
  assert.equal(res.status, 200);
  assert.equal(await queryOne(`SELECT id FROM proposal_documents WHERE id = ?`, docId), undefined);
  assert.equal(await storageGet(1, rowBefore!.file_name), null);
});

// ============================================================================
// POST /api/design-changes/:id/decide
// ============================================================================

async function taoDcThietKe(
  projectId: number,
  ten: string,
  overrides: { status?: string; impactCost?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO design_changes (project_id, code, title, reason, status, impact_cost)
     VALUES (?, ?, ?, 'Lý do', ?, ?)`,
    projectId,
    `DC-${uniq(ten)}`,
    `DC ${ten}`,
    overrides.status ?? "submitted",
    overrides.impactCost ?? null,
  );
}

test("POST /api/design-changes/:id/decide: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/design-changes/:id/decide: engineer không được quyết → 403", S, async () => {
  const projectId = await taoDuAn("dcforbid");
  const eng = await taoUser("engineer", "dcforbid");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/design-changes/:id/decide: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("dcinvalid");
  const pm = await taoUser("pm", "dcinvalid");
  const dcId = await taoDcThietKe(projectId, "dcinvalid");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "khong_hop_le" }), {
    params: Promise.resolve({ id: String(dcId) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/design-changes/:id/decide: thuộc dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("dcisoA");
  const projectB = await taoDuAn("dcisoB");
  const dcB = await taoDcThietKe(projectB, "dcisoB");

  const pmA = await taoUser("pm", "dcisoA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dcB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/design-changes/:id/decide: có tác động chi phí mà duyệt không ghi chú → 409", S, async () => {
  const projectId = await taoDuAn("dcnoimpact");
  const pm = await taoUser("pm", "dcnoimpact");
  const dcId = await taoDcThietKe(projectId, "dcnoimpact", { impactCost: "Tăng 10tr" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(dcId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/design-changes/:id/decide: từ chối thành công (không cần ghi chú dù có tác động) → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("dcreject");
  const pm = await taoUser("pm", "dcreject");
  const dcId = await taoDcThietKe(projectId, "dcreject", { impactCost: "Tăng 10tr" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "rejected" }), {
    params: Promise.resolve({ id: String(dcId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM design_changes WHERE id = ?`,
    dcId,
  );
  assert.equal(row?.status, "rejected");
});

test("POST /api/design-changes/:id/decide: đã quyết rồi (không còn pending) → 409", S, async () => {
  const projectId = await taoDuAn("dcdup");
  const pm = await taoUser("pm", "dcdup");
  const dcId = await taoDcThietKe(projectId, "dcdup", { status: "approved" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "rejected" }), {
    params: Promise.resolve({ id: String(dcId) }),
  });
  assert.equal(res.status, 409);
});

// ============================================================================
// GET /api/qc/documents/export/zip
// ============================================================================

test("GET /api/qc/documents/export/zip: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/qc/documents/export/zip/route");
  const res = await GET(getReq("/api/qc/documents/export/zip"));
  assert.equal(res.status, 401);
});

test("GET /api/qc/documents/export/zip: engineer không có quyền export → 403", S, async () => {
  const projectId = await taoDuAn("qczipforbid");
  const eng = await taoUser("engineer", "qczipforbid");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/qc/documents/export/zip/route");
  const res = await GET(getReq("/api/qc/documents/export/zip"));
  assert.equal(res.status, 403);
});

test("GET /api/qc/documents/export/zip: category không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("qczipcat");
  const pm = await taoUser("pm", "qczipcat");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/qc/documents/export/zip/route");
  const res = await GET(getReq("/api/qc/documents/export/zip?category=khong_hop_le"));
  assert.equal(res.status, 422);
});

test("GET /api/qc/documents/export/zip: thành công → trả zip chứa đúng file đã upload (magic PK), cách ly dự án", S, async () => {
  const projectA = await taoDuAn("qczipokA");
  const projectB = await taoDuAn("qczipokB");
  const pmA = await taoUser("pm", "qczipokA");
  const pmB = await taoUser("pm", "qczipokB");
  const { insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");

  const taskA = await taoTask(projectA, "qczipokA");
  const fileNameA = `qc-${uniq("qczipokA")}.pdf`;
  await storagePut(1, fileNameA, PDF_BYTES);
  await insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by, doc_category)
     VALUES (?, ?, 'a.pdf', 'application/pdf', ?, 'vat_lieu')`,
    taskA,
    fileNameA,
    pmA.id,
  );

  const taskB = await taoTask(projectB, "qczipokB");
  const fileNameB = `qc-${uniq("qczipokB")}.pdf`;
  await storagePut(1, fileNameB, Buffer.from("%PDF-1.4\nKHAC DU AN\n%%EOF"));
  await insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by, doc_category)
     VALUES (?, ?, 'b.pdf', 'application/pdf', ?, 'vat_lieu')`,
    taskB,
    fileNameB,
    pmB.id,
  );

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/qc/documents/export/zip/route");
  const res = await GET(getReq("/api/qc/documents/export/zip"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/zip");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const text = buf.toString("latin1");
  assert.ok(text.includes("a.pdf"), "phải chứa file của dự án A");
  assert.ok(!text.includes("KHAC DU AN"), "không được lẫn nội dung file dự án B");
});

// ============================================================================
// GET/POST /api/tech-links, GET/PATCH/DELETE /api/tech-links/:id
// ============================================================================

test("GET /api/tech-links: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tech-links/route");
  const res = await GET(getReq("/api/tech-links"));
  assert.equal(res.status, 401);
});

test("GET /api/tech-links: category không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("tlcat");
  const pm = await taoUser("pm", "tlcat");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tech-links/route");
  const res = await GET(getReq("/api/tech-links?category=khong_hop_le"));
  assert.equal(res.status, 422);
});

test("GET /api/tech-links: cách ly dự án — không thấy link dự án khác", S, async () => {
  const projectA = await taoDuAn("tlisoA");
  const projectB = await taoDuAn("tlisoB");
  const pmB = await taoUser("pm", "tlisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/tech-links/route");
  await POST(
    jreq("/x", { category: "bim", title: "BIM B", url: "https://viewer.autodesk.com/x" }),
  );

  const pmA = await taoUser("pm", "tlisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/tech-links/route");
  const res = await GET(getReq("/api/tech-links"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).links, []);
});

test("POST /api/tech-links: engineer không có quyền tạo → 403", S, async () => {
  const projectId = await taoDuAn("tlpforbid");
  const eng = await taoUser("engineer", "tlpforbid");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/tech-links/route");
  const res = await POST(jreq("/x", { category: "bim", title: "T", url: "https://a.com" }));
  assert.equal(res.status, 403);
});

test("POST /api/tech-links: body không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("tlpbody");
  const pm = await taoUser("pm", "tlpbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tech-links/route");
  const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "x" }));
  assert.equal(res.status, 400);
});

test("POST /api/tech-links: URL không phải https → 422", S, async () => {
  const projectId = await taoDuAn("tlphttp");
  const pm = await taoUser("pm", "tlphttp");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tech-links/route");
  const res = await POST(
    jreq("/x", { category: "bim", title: "T", url: "http://khong-https.com" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/tech-links: tạo thành công → 201", S, async () => {
  const projectId = await taoDuAn("tlpok");
  const pm = await taoUser("pm", "tlpok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tech-links/route");
  const res = await POST(
    jreq("/x", { category: "bim", title: "BIM Viewer", url: "https://viewer.autodesk.com/x" }),
  );
  assert.equal(res.status, 201);
});

test("GET /api/tech-links/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tech-links/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tech-links/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("tlidbad");
  const pm = await taoUser("pm", "tlidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tech-links/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

async function taoTechLink(projectId: number, pm: { id: number; passwordHash: string }, ten: string) {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tech-links/route");
  const res = await POST(
    jreq("/x", { category: "bim", title: `Link ${ten}`, url: "https://viewer.autodesk.com/x" }),
  );
  const { id } = await res.json();
  return id as number;
}

test("GET /api/tech-links/:id: link dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("tlidisoA");
  const projectB = await taoDuAn("tlidisoB");
  const pmB = await taoUser("pm", "tlidisoB");
  const linkB = await taoTechLink(projectB, pmB, "tlidisoB");

  const pmA = await taoUser("pm", "tlidisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/tech-links/[id]/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(linkB) }) });
  assert.equal(res.status, 404);
});

test("PATCH /api/tech-links/:id: sửa thành công (merge — field không gửi giữ nguyên)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("tlpatchok");
  const pm = await taoUser("pm", "tlpatchok");
  const linkId = await taoTechLink(projectId, pm, "tlpatchok");
  const { PATCH } = await import("@/app/api/tech-links/[id]/route");
  const res = await PATCH(jreq("/x", { title: "Tên mới" }, "PATCH"), {
    params: Promise.resolve({ id: String(linkId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ title: string; category: string }>(
    `SELECT title, category FROM tech_links WHERE id = ?`,
    linkId,
  );
  assert.equal(row?.title, "Tên mới");
  assert.equal(row?.category, "bim");
});

test("PATCH /api/tech-links/:id: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("tlpatchforbid");
  const pm = await taoUser("pm", "tlpatchforbidPm");
  const eng = await taoUser("engineer", "tlpatchforbid");
  const linkId = await taoTechLink(projectId, pm, "tlpatchforbid");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/tech-links/[id]/route");
  const res = await PATCH(jreq("/x", { title: "x" }, "PATCH"), {
    params: Promise.resolve({ id: String(linkId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/tech-links/:id: xoá thành công → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("tldelok");
  const pm = await taoUser("pm", "tldelok");
  const linkId = await taoTechLink(projectId, pm, "tldelok");
  const { DELETE } = await import("@/app/api/tech-links/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(linkId) }),
  });
  assert.equal(res.status, 200);
  assert.equal(await queryOne(`SELECT id FROM tech_links WHERE id = ?`, linkId), undefined);
});

test("DELETE /api/tech-links/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("tldelnf");
  const pm = await taoUser("pm", "tldelnf");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/tech-links/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET /api/tech/health-check, /api/tech/system-status
// ============================================================================

test("GET /api/tech/health-check: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tech/health-check/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/tech/health-check: PM không được xem (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("hcpm");
  const pm = await taoUser("pm", "hcpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tech/health-check/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/tech/health-check: Admin xem thành công → 200, ghi vào health_check_runs", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("hcadmin");
  const admin = await taoUser("admin", "hcadmin");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/tech/health-check/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.runId === "number");
  const row = await queryOne(`SELECT id FROM health_check_runs WHERE id = ?`, body.runId);
  assert.ok(row);
});

test("GET /api/tech/system-status: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tech/system-status/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/tech/system-status: PM không được xem (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("ssPm");
  const pm = await taoUser("pm", "ssPm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tech/system-status/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/tech/system-status: Admin xem thành công → 200", S, async () => {
  const projectId = await taoDuAn("ssAdmin");
  const admin = await taoUser("admin", "ssAdmin");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/tech/system-status/route");
  const res = await GET();
  assert.equal(res.status, 200);
});

// ============================================================================
// POST /api/telegram/link-otp, GET/POST /api/telegram/simulate-voice
// ============================================================================

test("POST /api/telegram/link-otp: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/telegram/link-otp/route");
  const res = await POST(jreq("/x"));
  assert.equal(res.status, 401);
});

test("POST /api/telegram/link-otp: sinh OTP mới thay thế OTP cũ (1 user 1 OTP sống)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("tgotp");
  const eng = await taoUser("engineer", "tgotp");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/telegram/link-otp/route");
  const res1 = await POST(jreq("/x"));
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.match(body1.otp, /^\d{6}$/);

  const res2 = await POST(jreq("/x"));
  const body2 = await res2.json();
  assert.equal(res2.status, 200);

  const rows = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM telegram_user_bindings WHERE user_id = ?`,
    eng.id,
  );
  assert.equal(rows?.count, "1", "chỉ 1 dòng binding chưa xác thực cho user này (upsert, không tạo mới)");
  // OTP không nhất thiết khác nhau về giá trị hiển thị (ngẫu nhiên có thể trùng), nhưng cả
  // hai lần đều phải trả OTP hợp lệ.
  assert.match(body2.otp, /^\d{6}$/);
});

test("GET /api/telegram/simulate-voice: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/telegram/simulate-voice/route");
  const res = await GET(getReq("/api/telegram/simulate-voice"));
  assert.equal(res.status, 401);
});

test("GET /api/telegram/simulate-voice: dự án không được phép truy cập qua query → 403", S, async () => {
  const projectA = await taoDuAn("tgsimA");
  const projectB = await taoDuAn("tgsimB");
  const eng = await taoUser("engineer", "tgsim");
  await dangNhapDuAn(eng, projectA);
  const { GET } = await import("@/app/api/telegram/simulate-voice/route");
  const res = await GET(getReq(`/api/telegram/simulate-voice?projectId=${projectB}`));
  assert.equal(res.status, 403);
});

test("GET /api/telegram/simulate-voice: thành công → trả logs rỗng ban đầu", S, async () => {
  const projectId = await taoDuAn("tgsimok");
  const eng = await taoUser("engineer", "tgsimok");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/telegram/simulate-voice/route");
  const res = await GET(getReq("/api/telegram/simulate-voice"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.data));
});

test("POST /api/telegram/simulate-voice: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/telegram/simulate-voice/route");
  const res = await POST(jreq("/x", { text: "xin chao" }));
  assert.equal(res.status, 401);
});

test("POST /api/telegram/simulate-voice: dự án không được phép → 403", S, async () => {
  const projectA = await taoDuAn("tgsimpA");
  const projectB = await taoDuAn("tgsimpB");
  const eng = await taoUser("engineer", "tgsimp");
  await dangNhapDuAn(eng, projectA);
  const { POST } = await import("@/app/api/telegram/simulate-voice/route");
  const res = await POST(jreq("/x", { text: "xin chao", projectId: projectB }));
  assert.equal(res.status, 403);
});

test("POST /api/telegram/simulate-voice: gửi lệnh giả lập thành công → 200, tự tạo binding xác thực", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("tgsimpok");
  const eng = await taoUser("engineer", "tgsimpok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/telegram/simulate-voice/route");
  const res = await POST(jreq("/x", { text: "xin chao" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  const row = await queryOne<{ is_verified: boolean }>(
    `SELECT is_verified FROM telegram_user_bindings WHERE user_id = ?`,
    eng.id,
  );
  assert.equal(row?.is_verified, true);
});

// ============================================================================
// POST /api/zalo/link-otp, /api/zalo/simulate-action
// ============================================================================

test("POST /api/zalo/link-otp: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/zalo/link-otp/route");
  const res = await POST(jreq("/x", { action: "generate" }));
  assert.equal(res.status, 401);
});

test("POST /api/zalo/link-otp: dự án không được phép → 403", S, async () => {
  const projectA = await taoDuAn("zlotpA");
  const projectB = await taoDuAn("zlotpB");
  const eng = await taoUser("engineer", "zlotp");
  await dangNhapDuAn(eng, projectA);
  const { POST } = await import("@/app/api/zalo/link-otp/route");
  const res = await POST(jreq("/x", { action: "generate", projectId: projectB }));
  assert.equal(res.status, 403);
});

test("POST /api/zalo/link-otp: hành động không hợp lệ → 400", S, async () => {
  const projectId = await taoDuAn("zlbadaction");
  const eng = await taoUser("engineer", "zlbadaction");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/zalo/link-otp/route");
  const res = await POST(jreq("/x", { action: "khong_hop_le" }));
  assert.equal(res.status, 400);
});

test("POST /api/zalo/link-otp: verify thiếu zaloUserId/otpCode → 422", S, async () => {
  const projectId = await taoDuAn("zlverifymissing");
  const eng = await taoUser("engineer", "zlverifymissing");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/zalo/link-otp/route");
  const res = await POST(jreq("/x", { action: "verify" }));
  assert.equal(res.status, 422);
});

test("POST /api/zalo/link-otp: verify sai mã → 400", S, async () => {
  const projectId = await taoDuAn("zlverifywrong");
  const eng = await taoUser("engineer", "zlverifywrong");
  await dangNhapDuAn(eng, projectId);
  const zaloUserId = `ZID_${uniq("zlverifywrong")}`;
  const { POST } = await import("@/app/api/zalo/link-otp/route");
  await POST(jreq("/x", { action: "generate", zaloUserId }));
  const res = await POST(jreq("/x", { action: "verify", zaloUserId, otpCode: "000000" }));
  assert.equal(res.status, 400);
});

test("POST /api/zalo/link-otp: generate rồi verify đúng mã → 200 liên kết thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("zlok");
  const eng = await taoUser("engineer", "zlok");
  await dangNhapDuAn(eng, projectId);
  const zaloUserId = `ZID_${uniq("zlok")}`;
  const { POST } = await import("@/app/api/zalo/link-otp/route");
  const genRes = await POST(jreq("/x", { action: "generate", zaloUserId }));
  assert.equal(genRes.status, 200);
  const { data } = await genRes.json();

  const verifyRes = await POST(
    jreq("/x", { action: "verify", zaloUserId, otpCode: data.otpCode }),
  );
  assert.equal(verifyRes.status, 200);
  const row = await queryOne<{ is_verified: boolean }>(
    `SELECT is_verified FROM zalo_user_bindings WHERE zalo_user_id = ?`,
    zaloUserId,
  );
  assert.equal(row?.is_verified, true);
});

test("POST /api/zalo/link-otp: zaloUserId đã liên kết tài khoản khác → 409", S, async () => {
  const projectId = await taoDuAn("zldup");
  const eng1 = await taoUser("engineer", "zldup1");
  const eng2 = await taoUser("engineer", "zldup2");
  const zaloUserId = `ZID_${uniq("zldup")}`;
  const { POST } = await import("@/app/api/zalo/link-otp/route");

  await dangNhapDuAn(eng1, projectId);
  const gen1 = await POST(jreq("/x", { action: "generate", zaloUserId }));
  const { data: data1 } = await gen1.json();
  await POST(jreq("/x", { action: "verify", zaloUserId, otpCode: data1.otpCode }));

  await dangNhapDuAn(eng2, projectId);
  const res = await POST(jreq("/x", { action: "generate", zaloUserId }));
  assert.equal(res.status, 409);
});

test("POST /api/zalo/simulate-action: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/zalo/simulate-action/route");
  const res = await POST(jreq("/x", { text: "xin chao" }));
  assert.equal(res.status, 401);
});

test("POST /api/zalo/simulate-action: dự án không được phép → 403", S, async () => {
  const projectA = await taoDuAn("zlsimA");
  const projectB = await taoDuAn("zlsimB");
  const eng = await taoUser("engineer", "zlsim");
  await dangNhapDuAn(eng, projectA);
  const { POST } = await import("@/app/api/zalo/simulate-action/route");
  const res = await POST(jreq("/x", { text: "xin chao", projectId: projectB }));
  assert.equal(res.status, 403);
});

test("POST /api/zalo/simulate-action: nội dung rỗng → 400", S, async () => {
  const projectId = await taoDuAn("zlsimempty");
  const eng = await taoUser("engineer", "zlsimempty");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/zalo/simulate-action/route");
  const res = await POST(jreq("/x", { text: "   " }));
  assert.equal(res.status, 400);
});

test("POST /api/zalo/simulate-action: gửi lệnh giả lập thành công → 200, tự tạo binding xác thực", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("zlsimok");
  const eng = await taoUser("engineer", "zlsimok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/zalo/simulate-action/route");
  const res = await POST(jreq("/x", { text: "xin chao" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  const row = await queryOne<{ is_verified: boolean }>(
    `SELECT is_verified FROM zalo_user_bindings WHERE project_id = ? AND user_id = ?`,
    projectId,
    eng.id,
  );
  assert.equal(row?.is_verified, true);
});

// ============================================================================
// GET /api/saved-reports/:id/data
// ============================================================================

async function taoBaoCaoDaLuu(
  projectId: number | null,
  ownerId: number,
  ten: string,
  overrides: { source?: string; shared?: boolean } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO saved_reports (project_id, owner_id, name, source, config, shared)
     VALUES (?, ?, ?, ?, '{}'::jsonb, ?)`,
    projectId,
    ownerId,
    `Báo cáo ${ten}`,
    overrides.source ?? "late_tasks",
    overrides.shared ?? false,
  );
}

test("GET /api/saved-reports/:id/data: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/saved-reports/:id/data: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("srbad");
  const pm = await taoUser("pm", "srbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/saved-reports/:id/data: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("srnf");
  const pm = await taoUser("pm", "srnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test("GET /api/saved-reports/:id/data: không phải chủ, không chia sẻ, không phải admin → 403", S, async () => {
  const projectId = await taoDuAn("srforbid");
  const owner = await taoUser("pm", "srforbidOwner");
  const other = await taoUser("engineer", "srforbid");
  const reportId = await taoBaoCaoDaLuu(projectId, owner.id, "srforbid", { shared: false });
  await dangNhapDuAn(other, projectId);
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(reportId) }) });
  assert.equal(res.status, 403);
});

test("GET /api/saved-reports/:id/data: chủ sở hữu nhưng nguồn dữ liệu chặn vai trò (subcon) → 403", S, async () => {
  const projectId = await taoDuAn("srsrcforbid");
  const sub = await taoUser("subcon", "srsrcforbid");
  const reportId = await taoBaoCaoDaLuu(projectId, sub.id, "srsrcforbid", {
    source: "cost_by_month",
  });
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(reportId) }) });
  assert.equal(res.status, 403);
});

test("GET /api/saved-reports/:id/data: chia sẻ → người khác xem được (JSON)", S, async () => {
  const projectId = await taoDuAn("srshared");
  const owner = await taoUser("pm", "srsharedOwner");
  const other = await taoUser("engineer", "srshared");
  const reportId = await taoBaoCaoDaLuu(projectId, owner.id, "srshared", { shared: true });
  await dangNhapDuAn(other, projectId);
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq("/x"), { params: Promise.resolve({ id: String(reportId) }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "late_tasks");
  assert.ok(Array.isArray(body.rows));
});

test("GET /api/saved-reports/:id/data?export=excel: trả file xlsx (magic PK)", S, async () => {
  const projectId = await taoDuAn("srexcel");
  const pm = await taoUser("pm", "srexcel");
  const reportId = await taoBaoCaoDaLuu(projectId, pm.id, "srexcel");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
  const res = await GET(getReq(`/x?export=excel`), { params: Promise.resolve({ id: String(reportId) }) });
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), "PK");
});

// ============================================================================
// GET /api/schedule-control, /api/dashboard/evm, /api/dashboard/floors, /api/dashboard/forecast
// ============================================================================

test("GET /api/schedule-control: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/schedule-control/route");
  const res = await GET(getReq("/api/schedule-control"));
  assert.equal(res.status, 401);
});

test("GET /api/schedule-control: subcon vẫn xem được (đọc thuần) → 200", S, async () => {
  const projectId = await taoDuAn("scsub");
  const sub = await taoUser("subcon", "scsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/schedule-control/route");
  const res = await GET(getReq("/api/schedule-control"));
  assert.equal(res.status, 200);
});

test("GET /api/dashboard/evm: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/dashboard/evm/route");
  const res = await GET(getReq("/api/dashboard/evm"));
  assert.equal(res.status, 401);
});

test("GET /api/dashboard/evm: subcon không có quyền xem chi phí → 403", S, async () => {
  const projectId = await taoDuAn("evmsub");
  const sub = await taoUser("subcon", "evmsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/dashboard/evm/route");
  const res = await GET(getReq("/api/dashboard/evm"));
  assert.equal(res.status, 403);
});

test("GET /api/dashboard/evm: source không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("evmsrc");
  const pm = await taoUser("pm", "evmsrc");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/dashboard/evm/route");
  const res = await GET(getReq("/api/dashboard/evm?source=khong_hop_le"));
  assert.equal(res.status, 422);
});

test("GET /api/dashboard/evm: source=cash kèm system → 422 (không gắn hệ)", S, async () => {
  const projectId = await taoDuAn("evmcash");
  const pm = await taoUser("pm", "evmcash");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/dashboard/evm/route");
  const res = await GET(getReq("/api/dashboard/evm?source=cash&system=hvac"));
  assert.equal(res.status, 422);
});

test("GET /api/dashboard/evm: PM xem thành công → 200", S, async () => {
  const projectId = await taoDuAn("evmok");
  const pm = await taoUser("pm", "evmok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/dashboard/evm/route");
  const res = await GET(getReq("/api/dashboard/evm"));
  assert.equal(res.status, 200);
});

test("GET /api/dashboard/floors: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/dashboard/floors/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/dashboard/floors: subcon không có quyền xem dashboard → 403", S, async () => {
  const projectId = await taoDuAn("flsub");
  const sub = await taoUser("subcon", "flsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/dashboard/floors/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/dashboard/floors: PM xem thành công → 200", S, async () => {
  const projectId = await taoDuAn("flok");
  const pm = await taoUser("pm", "flok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/dashboard/floors/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.cells));
});

test("GET /api/dashboard/forecast: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/dashboard/forecast/route");
  const res = await GET(getReq("/api/dashboard/forecast"));
  assert.equal(res.status, 401);
});

test("GET /api/dashboard/forecast: subcon không có quyền xem dashboard → 403", S, async () => {
  const projectId = await taoDuAn("fcsub");
  const sub = await taoUser("subcon", "fcsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/dashboard/forecast/route");
  const res = await GET(getReq("/api/dashboard/forecast"));
  assert.equal(res.status, 403);
});

test("GET /api/dashboard/forecast: PM xem thành công → 200", S, async () => {
  const projectId = await taoDuAn("fcok");
  const pm = await taoUser("pm", "fcok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/dashboard/forecast/route");
  const res = await GET(getReq("/api/dashboard/forecast"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.forecast));
});

// ============================================================================
// GET /api/export/excel
// ============================================================================

test("GET /api/export/excel: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/export/excel/route");
  const res = await GET(getReq("/api/export/excel"));
  assert.equal(res.status, 401);
});

test("GET /api/export/excel: engineer không có quyền export → 403", S, async () => {
  const projectId = await taoDuAn("exforbid");
  const eng = await taoUser("engineer", "exforbid");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/export/excel/route");
  const res = await GET(getReq("/api/export/excel"));
  assert.equal(res.status, 403);
});

test("GET /api/export/excel: sheet không tồn tại → 400", S, async () => {
  const projectId = await taoDuAn("exbadsheet");
  const pm = await taoUser("pm", "exbadsheet");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/export/excel/route");
  const res = await GET(getReq("/api/export/excel?sheet=khong-ton-tai"));
  assert.equal(res.status, 400);
});

test("GET /api/export/excel: xuất thành công → xlsx (magic PK)", S, async () => {
  const projectId = await taoDuAn("exok");
  const pm = await taoUser("pm", "exok");
  await taoTask(projectId, "exok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/export/excel/route");
  const res = await GET(getReq("/api/export/excel"));
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), "PK");
});

// ============================================================================
// GET /api/events (SSE) — không chờ tick, chỉ kiểm 401 + content-type rồi huỷ ngay
// ============================================================================

test("GET /api/events: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/events/route");
  const res = await GET(getReq("/api/events?sheet=ogtd"));
  assert.equal(res.status, 401);
});

test("GET /api/events: thiếu tham số sheet → 400", S, async () => {
  const projectId = await taoDuAn("evsheetmissing");
  const pm = await taoUser("pm", "evsheetmissing");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/events/route");
  const res = await GET(getReq("/api/events"));
  assert.equal(res.status, 400);
});

test("GET /api/events: mở stream thành công → content-type text/event-stream (huỷ ngay, không chờ tick)", S, async () => {
  const projectId = await taoDuAn("evok");
  const pm = await taoUser("pm", "evok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/events/route");
  const res = await GET(getReq("/api/events?sheet=ogtd"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  await res.body?.cancel();
});
