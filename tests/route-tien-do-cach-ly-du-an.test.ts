import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// W6 (Đợt 5) — vá lỗ hổng cách ly dự án ở các route chỉ dựa vào `canTouchTask`/`canTouchFloor`.
//
// `canTouchTask`/`canTouchFloor` (lib/bao-mat/auth.ts) mở đầu bằng
// `if (user.role !== "subcon") return true;` — chúng chỉ trả lời "subcon này có được giao
// việc/tầng đó không", KHÔNG hề so dự án, và trả `true` VÔ ĐIỀU KIỆN cho mọi vai trò khác
// (admin/pm/engineer/bch/cdt/viewer). Route nào chỉ dựa vào 2 hàm này mà không có lớp lọc dự
// án riêng thì mọi vai trò không phải subcon ở dự án A đọc/ghi được dữ liệu của dự án B qua id
// đoán được (số nguyên tăng dần). Route đã vá:
//   - app/api/dimensions/[id]/route.ts             (PATCH tick ô)
//   - app/api/dimensions/batch/route.ts             (PATCH tick hàng loạt)
//   - app/api/tasks/[id]/progress/route.ts          (PATCH progress trực tiếp)
//   - app/api/tasks/[id]/comments/route.ts          (GET + POST)
//   - app/api/tasks/[id]/delay-reason/route.ts      (POST)
//   - app/api/tasks/[id]/dimensions/route.ts        (GET)
//   - app/api/tasks/[id]/documents/route.ts         (GET + POST)
//   - app/api/tasks/[id]/history/route.ts           (GET)
//   - app/api/tasks/[id]/photos/route.ts            (GET + POST)
//   - app/api/photos/[id]/route.ts                  (GET + DELETE)
//   - app/api/floor-approvals/route.ts              (POST get-or-create)
//   - app/api/floor-approvals/[id]/documents/route.ts (GET + POST)
//
// Mỗi route: ca xuyên dự án (pm dự án A đụng id dự án B → 404 + dữ liệu B không đổi) + ca đối
// chứng (đúng dự án của mình → thành công). Thêm admin/engineer cho vài route (reviewer W0 chỉ
// ra test W0 trước đây chỉ phủ mỗi `pm`) + subcon cho 2 route đại diện để chứng minh 2 lớp kiểm
// (lọc dự án trước, canTouchTask/Floor sau) xếp đúng thứ tự.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TDISO ${uniq(ten)}`);
}

/** Dựng dự án + tháp + sheet — chuỗi tối thiểu để suy project_id cho task/dimension/floor. */
async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp TDISO')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet TDISO', ?)`,
    towerId,
    `TDISO${uniq(ten)}`,
    `tdiso-${ten.toLowerCase()}-${uniq("slug")}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tdiso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tdiso', ?, 1)`,
    `TDISO ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

async function taoNhom(
  sheetTypeId: number,
  code: string,
  overrides: { assignedTo?: number | null; floorLabel?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order, assigned_to, floor_label)
     VALUES (?, ?, ?, 1, ?, ?)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
    overrides.assignedTo ?? null,
    overrides.floorLabel ?? null,
  );
}

async function taoTask(
  packageId: number,
  code: string,
  overrides: { assignedTo?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, assigned_to) VALUES (?, ?, ?, 1, ?)`,
    packageId,
    code,
    `Task ${code}`,
    overrides.assignedTo ?? null,
  );
}

async function taoDimension(taskId: number, label = "D1"): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, ?, 0)`,
    taskId,
    label,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");
function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}
function pdfForm(): FormData {
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  return form;
}
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
function pngForm(): FormData {
  const form = new FormData();
  form.set("file", new File([PNG_1X1], "a.png", { type: "image/png" }));
  return form;
}

// ============================================================================
// PATCH /api/dimensions/:id
// ============================================================================

test("PATCH /api/dimensions/:id: ô thuộc dự án khác (pm) → 404, KHÔNG đổi installed", S, async () => {
  const a = await dungSheet("dimA");
  const b = await dungSheet("dimB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const dimB = await taoDimension(taskB);
  const pmA = await taoUser("pm", "dimA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ installed: number }>(
    `SELECT installed FROM progress_dimensions WHERE id = ?`,
    dimB,
  );
  assert.equal(row!.installed, 0, "ô dự án B không được tick");
});

test("PATCH /api/dimensions/:id: ô thuộc dự án khác (admin) → 404", S, async () => {
  const a = await dungSheet("dimAdmA");
  const b = await dungSheet("dimAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const dimB = await taoDimension(taskB);
  const admin = await taoUser("admin", "dimAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/dimensions/:id: ô thuộc dự án khác (engineer) → 404", S, async () => {
  const a = await dungSheet("dimEngA");
  const b = await dungSheet("dimEngB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const dimB = await taoDimension(taskB);
  const eng = await taoUser("engineer", "dimEngA");
  await dangNhapDuAn(eng, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/dimensions/:id: ô đúng dự án của mình → 200, tick thành công", S, async () => {
  const a = await dungSheet("dimOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const dimA = await taoDimension(taskA);
  const pmA = await taoUser("pm", "dimOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimA) }),
  });
  assert.equal(res.status, 200);
  const { installed } = await res.json();
  assert.equal(installed, true);
});

test("PATCH /api/dimensions/:id: subcon được giao task → 200", S, async () => {
  const a = await dungSheet("dimSubOk");
  const sub = await taoUser("subcon", "dimSubOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1", { assignedTo: sub.id });
  const dimA = await taoDimension(taskA);
  await dangNhapDuAn(sub, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimA) }),
  });
  assert.equal(res.status, 200);
});

test("PATCH /api/dimensions/:id: subcon task cùng dự án nhưng KHÔNG được giao → 403", S, async () => {
  const a = await dungSheet("dimSub403");
  const sub = await taoUser("subcon", "dimSub403");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1"); // không gán cho ai
  const dimA = await taoDimension(taskA);
  await dangNhapDuAn(sub, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimA) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/dimensions/:id: subcon ô thuộc dự án khác → 404 (không phải 403)", S, async () => {
  const a = await dungSheet("dimSub404A");
  const b = await dungSheet("dimSub404B");
  const sub = await taoUser("subcon", "dimSub404A");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1", { assignedTo: sub.id }); // gán cho sub NHƯNG ở dự án B
  const dimB = await taoDimension(taskB);
  await dangNhapDuAn(sub, a.projectId); // sub đang chọn dự án A

  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(jreq("/x", { installed: true }, "PATCH"), {
    params: Promise.resolve({ id: String(dimB) }),
  });
  assert.equal(res.status, 404);
});

// ============================================================================
// PATCH /api/dimensions/batch
// ============================================================================

test("PATCH /api/dimensions/batch: có 1 ô thuộc dự án khác → 404, KHÔNG ô nào bị đổi", S, async () => {
  const a = await dungSheet("batchA");
  const b = await dungSheet("batchB");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const dimA = await taoDimension(taskA);
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const dimB = await taoDimension(taskB);
  const pmA = await taoUser("pm", "batchA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(jreq("/x", { ids: [dimA, dimB], installed: true }, "PATCH"));
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const rowA = await queryOne<{ installed: number }>(
    `SELECT installed FROM progress_dimensions WHERE id = ?`,
    dimA,
  );
  const rowB = await queryOne<{ installed: number }>(
    `SELECT installed FROM progress_dimensions WHERE id = ?`,
    dimB,
  );
  assert.equal(rowA!.installed, 0, "ô dự án A cũng không bị tick (atomic — cả lô fail)");
  assert.equal(rowB!.installed, 0, "ô dự án B không bị tick");
});

test("PATCH /api/dimensions/batch: mọi ô đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("batchOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const dim1 = await taoDimension(taskA, "D1");
  const dim2 = await taoDimension(taskA, "D2");
  const pmA = await taoUser("pm", "batchOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(jreq("/x", { ids: [dim1, dim2], installed: true }, "PATCH"));
  assert.equal(res.status, 200);
  const { updated } = await res.json();
  assert.equal(updated, 2);
});

// ============================================================================
// PATCH /api/tasks/:id/progress
// ============================================================================

test("PATCH /api/tasks/:id/progress: task thuộc dự án khác (pm) → 404, progress KHÔNG đổi", S, async () => {
  const a = await dungSheet("progA");
  const b = await dungSheet("progB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "progA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(jreq("/x", { progress: 0.5 }, "PATCH"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ progress_percent: number | null }>(
    `SELECT progress_percent FROM tasks WHERE id = ?`,
    taskB,
  );
  assert.equal(row!.progress_percent, 0, "progress task dự án B không đổi");
});

test("PATCH /api/tasks/:id/progress: task thuộc dự án khác (engineer) → 404", S, async () => {
  const a = await dungSheet("progEngA");
  const b = await dungSheet("progEngB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const eng = await taoUser("engineer", "progEngA");
  await dangNhapDuAn(eng, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(jreq("/x", { progress: 0.5 }, "PATCH"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/tasks/:id/progress: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("progOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "progOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(jreq("/x", { progress: 0.5 }, "PATCH"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/tasks/:id/comments
// ============================================================================

test("GET /api/tasks/:id/comments: task thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("cmtGetA");
  const b = await dungSheet("cmtGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "cmtGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/tasks/:id/comments: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("cmtGetOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "cmtGetOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

test("POST /api/tasks/:id/comments: task thuộc dự án khác (pm) → 404, KHÔNG tạo bình luận", S, async () => {
  const a = await dungSheet("cmtPostA");
  const b = await dungSheet("cmtPostB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "cmtPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await POST(jreq("/x", { body: "hack" }, "POST"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM task_comments WHERE task_id = ?`, taskB);
  assert.equal(row, undefined, "không có bình luận nào được tạo ở task dự án B");
});

test("POST /api/tasks/:id/comments: task đúng dự án của mình → 201", S, async () => {
  const a = await dungSheet("cmtPostOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "cmtPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await POST(jreq("/x", { body: "hợp lệ" }, "POST"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 201);
});

// ============================================================================
// POST /api/tasks/:id/delay-reason
// ============================================================================

test("POST /api/tasks/:id/delay-reason: task thuộc dự án khác (pm) → 404, KHÔNG đổi", S, async () => {
  const a = await dungSheet("delayA");
  const b = await dungSheet("delayB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "delayA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
  const res = await POST(jreq("/x", { reason: "thoi_tiet" }, "POST"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ delay_reason: string | null }>(
    `SELECT delay_reason FROM tasks WHERE id = ?`,
    taskB,
  );
  assert.equal(row!.delay_reason, null, "delay_reason task dự án B không đổi");
});

test("POST /api/tasks/:id/delay-reason: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("delayOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "delayOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
  const res = await POST(jreq("/x", { reason: "thoi_tiet" }, "POST"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET /api/tasks/:id/dimensions
// ============================================================================

test("GET /api/tasks/:id/dimensions: task thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("tdimA");
  const b = await dungSheet("tdimB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  await taoDimension(taskB);
  const pmA = await taoUser("pm", "tdimA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/tasks/:id/dimensions: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("tdimOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  await taoDimension(taskA);
  const pmA = await taoUser("pm", "tdimOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
  const { dimensions } = await res.json();
  assert.equal(dimensions.length, 1);
});

// ============================================================================
// GET/POST /api/tasks/:id/documents
// ============================================================================

test("GET /api/tasks/:id/documents: task thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("docGetA");
  const b = await dungSheet("docGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "docGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/tasks/:id/documents: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("docGetOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "docGetOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

test("POST /api/tasks/:id/documents: task thuộc dự án khác (pm) → 404, KHÔNG tạo tài liệu", S, async () => {
  const a = await dungSheet("docPostA");
  const b = await dungSheet("docPostB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "docPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM task_documents WHERE task_id = ?`, taskB);
  assert.equal(row, undefined, "không có tài liệu nào được tạo ở task dự án B");
});

test("POST /api/tasks/:id/documents: task đúng dự án của mình → 201", S, async () => {
  const a = await dungSheet("docPostOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "docPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 201);
});

// ============================================================================
// GET /api/tasks/:id/history
// ============================================================================

test("GET /api/tasks/:id/history: task thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("histA");
  const b = await dungSheet("histB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "histA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/history/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/tasks/:id/history: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("histOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "histOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/history/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/tasks/:id/photos
// ============================================================================

test("GET /api/tasks/:id/photos: task thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("phGetA");
  const b = await dungSheet("phGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "phGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/tasks/:id/photos: task đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("phGetOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "phGetOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

test("POST /api/tasks/:id/photos: task thuộc dự án khác (pm) → 404, KHÔNG tạo ảnh", S, async () => {
  const a = await dungSheet("phPostA");
  const b = await dungSheet("phPostB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "phPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM task_photos WHERE task_id = ?`, taskB);
  assert.equal(row, undefined, "không có ảnh nào được tạo ở task dự án B");
});

test("POST /api/tasks/:id/photos: task đúng dự án của mình → 201", S, async () => {
  const a = await dungSheet("phPostOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "phPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 201);
});

test("POST /api/tasks/:id/photos: subcon được giao task → 201", S, async () => {
  const a = await dungSheet("phSubOk");
  const sub = await taoUser("subcon", "phSubOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1", { assignedTo: sub.id });
  await dangNhapDuAn(sub, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 201);
});

test("POST /api/tasks/:id/photos: subcon task cùng dự án nhưng KHÔNG được giao → 403", S, async () => {
  const a = await dungSheet("phSub403");
  const sub = await taoUser("subcon", "phSub403");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  await dangNhapDuAn(sub, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/photos: subcon task thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("phSub404A");
  const b = await dungSheet("phSub404B");
  const sub = await taoUser("subcon", "phSub404A");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1", { assignedTo: sub.id });
  await dangNhapDuAn(sub, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET/DELETE /api/photos/:id
// ============================================================================

test("GET /api/photos/:id: ảnh thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("pidGetA");
  const b = await dungSheet("pidGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmB = await taoUser("pm", "pidGetB");
  await dangNhapDuAn(pmB, b.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  const { id: photoId } = await created.json();

  const pmA = await taoUser("pm", "pidGetA");
  await dangNhapDuAn(pmA, a.projectId);
  const { GET } = await import("@/app/api/photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/photos/:id: ảnh đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("pidGetOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "pidGetOk");
  await dangNhapDuAn(pmA, a.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  const { id: photoId } = await created.json();

  const { GET } = await import("@/app/api/photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 200);
});

test("DELETE /api/photos/:id: ảnh thuộc dự án khác (pm), là người upload gốc → vẫn 404", S, async () => {
  const a = await dungSheet("pidDelA");
  const b = await dungSheet("pidDelB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  // Cùng 1 user thao tác ở cả 2 dự án (uploaded_by khớp) để chứng minh việc chặn không chỉ
  // dựa vào "không phải người upload" — phải chặn ở TẦNG dự án trước.
  const pmMulti = await taoUser("pm", "pidDelMulti");
  await dangNhapDuAn(pmMulti, b.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  const { id: photoId } = await created.json();

  await dangNhapDuAn(pmMulti, a.projectId);
  const { DELETE } = await import("@/app/api/photos/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM task_photos WHERE id = ?`, photoId);
  assert.ok(row, "ảnh dự án B vẫn còn nguyên");
});

test("DELETE /api/photos/:id: ảnh đúng dự án, người upload xoá được → 200", S, async () => {
  const a = await dungSheet("pidDelOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const pmA = await taoUser("pm", "pidDelOk");
  await dangNhapDuAn(pmA, a.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  const { id: photoId } = await created.json();

  const { DELETE } = await import("@/app/api/photos/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// POST /api/floor-approvals
// ============================================================================

test("POST /api/floor-approvals: sheetTypeId thuộc dự án khác (pm) → 404, KHÔNG tạo bản ghi", S, async () => {
  const a = await dungSheet("faPostA");
  const b = await dungSheet("faPostB");
  const pmA = await taoUser("pm", "faPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(
    jreq("/x", { sheetTypeId: b.sheetTypeId, floorLabel: "T5" }, "POST"),
  );
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(
    `SELECT id FROM floor_approvals WHERE sheet_type_id = ? AND floor_label = ?`,
    b.sheetTypeId,
    "T5",
  );
  assert.equal(row, undefined, "không tạo được bản ghi floor_approval ở sheet dự án B");
});

test("POST /api/floor-approvals: sheetTypeId thuộc dự án khác (admin) → 404", S, async () => {
  const a = await dungSheet("faPostAdmA");
  const b = await dungSheet("faPostAdmB");
  const admin = await taoUser("admin", "faPostAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(
    jreq("/x", { sheetTypeId: b.sheetTypeId, floorLabel: "T5" }, "POST"),
  );
  assert.equal(res.status, 404);
});

test("POST /api/floor-approvals: sheetTypeId đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("faPostOk");
  const pmA = await taoUser("pm", "faPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(
    jreq("/x", { sheetTypeId: a.sheetTypeId, floorLabel: "T5" }, "POST"),
  );
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/floor-approvals/:id/documents
// ============================================================================

async function taoFloorApproval(sheetTypeId: number, floorLabel = "T5"): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO floor_approvals (sheet_type_id, floor_label, is_approved) VALUES (?, ?, FALSE)`,
    sheetTypeId,
    floorLabel,
  );
}

test("GET /api/floor-approvals/:id/documents: bản ghi thuộc dự án khác (pm) → 404", S, async () => {
  const a = await dungSheet("faDocGetA");
  const b = await dungSheet("faDocGetB");
  const approvalB = await taoFloorApproval(b.sheetTypeId);
  const pmA = await taoUser("pm", "faDocGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(approvalB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/floor-approvals/:id/documents: bản ghi đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("faDocGetOk");
  const approvalA = await taoFloorApproval(a.sheetTypeId);
  const pmA = await taoUser("pm", "faDocGetOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(approvalA) }),
  });
  assert.equal(res.status, 200);
});

test("POST /api/floor-approvals/:id/documents: bản ghi thuộc dự án khác (pm) → 404, KHÔNG tạo tài liệu", S, async () => {
  const a = await dungSheet("faDocPostA");
  const b = await dungSheet("faDocPostB");
  const approvalB = await taoFloorApproval(b.sheetTypeId);
  const pmA = await taoUser("pm", "faDocPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(approvalB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(
    `SELECT id FROM task_documents WHERE floor_approval_id = ?`,
    approvalB,
  );
  assert.equal(row, undefined, "không có tài liệu nào được tạo ở bản ghi dự án B");
});

test("POST /api/floor-approvals/:id/documents: bản ghi đúng dự án của mình → 201", S, async () => {
  const a = await dungSheet("faDocPostOk");
  const approvalA = await taoFloorApproval(a.sheetTypeId);
  const pmA = await taoUser("pm", "faDocPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(approvalA) }),
  });
  assert.equal(res.status, 201);
});

test("cuối file: đăng xuất để không rò cookie phiên sang file test khác", S, async () => {
  dangXuat();
});
