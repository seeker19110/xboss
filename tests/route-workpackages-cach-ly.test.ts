import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// W0 (Đợt 5) — vá 8 nhóm route KHÔNG lọc dự án ở `app/api/workpackages/**` (nợ ghi ở Đợt 4,
// reviewer đã đọc code xác nhận, xem PROGRESS.md mục "Ghi nhận, CHƯA sửa"). Mọi route dưới đây
// suy dự án qua chuỗi work_packages/sheet_types.sheet_type_id → sheet_types.tower_id →
// towers.project_id (LEFT JOIN towers để dòng chưa gán tower ra null → 404, cùng khuôn V9 ở
// app/api/work-fronts/[id]/route.ts). Mỗi route có cả ca xuyên dự án (404 + dữ liệu dự án B
// không đổi) lẫn ca hoạt động đúng trong dự án của mình:
//   - app/api/workpackages/route.ts                              (POST tạo nhóm)
//   - app/api/workpackages/[id]/tasks/route.ts                   (POST tạo task dưới nhóm)
//   - app/api/workpackages/[id]/move/route.ts                    (PATCH đổi thứ tự nhóm)
//   - app/api/workpackages/[id]/copy/route.ts                    (POST copy nhóm)
//   - app/api/workpackages/[id]/bbnt/route.ts                    (GET/POST/DELETE biên bản NT)
//   - app/api/workpackages/[id]/drawing/route.ts                 (GET/POST/DELETE bản vẽ)
//   - app/api/workpackages/[id]/dimensions/route.ts               (GET ma trận dimension)
//   - app/api/workpackages/[id]/dimensions/column/route.ts        (POST/DELETE/PATCH cột)
//   - app/api/workpackages/[id]/dimensions/column/move/route.ts   (PATCH di chuyển cột)
//   - app/api/workpackages/qc-status/route.ts                     (GET trạng thái QC theo sheet)

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `WPISO ${uniq(ten)}`);
}

/** Dựng dự án + tháp + sheet — chuỗi tối thiểu để suy project_id cho work_package. */
async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp WPISO')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet WPISO', ?)`,
    towerId,
    `WPISO${uniq(ten)}`,
    `wpiso-${ten.toLowerCase()}-${uniq("slug")}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `wpiso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-wpiso', ?, 1)`,
    `WPISO ${ten}`,
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
  overrides: { sortOrder?: number; assignedTo?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order, assigned_to)
     VALUES (?, ?, ?, ?, ?)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
    overrides.sortOrder ?? 1,
    overrides.assignedTo ?? null,
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

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Nội dung PDF tối thiểu nhưng đủ để `sniffMime`/`verifyFileMime` nhận diện đúng. */
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");

function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

function pdfForm(): FormData {
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  return form;
}

// ============================================================================
// POST /api/workpackages
// ============================================================================

test("POST /api/workpackages: sheetTypeId thuộc dự án khác → 404, KHÔNG tạo nhóm", S, async () => {
  const a = await dungSheet("wpPostA");
  const b = await dungSheet("wpPostB");
  const pmA = await taoUser("pm", "wpPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(
    jreq("/api/workpackages", { sheetTypeId: b.sheetTypeId, code: "HACK1", name: "Hack" }),
  );
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const wp = await queryOne(
    `SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = ?`,
    b.sheetTypeId,
    "HACK1",
  );
  assert.equal(wp, undefined, "không được tạo nhóm ở sheet dự án khác");
});

test("POST /api/workpackages: đúng dự án của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("wpPostOk");
  const pmA = await taoUser("pm", "wpPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(
    jreq("/api/workpackages", { sheetTypeId: a.sheetTypeId, code: "OK1", name: "Nhóm hợp lệ" }),
  );
  assert.equal(res.status, 201);
});

// ============================================================================
// POST /api/workpackages/:id/tasks
// ============================================================================

test("POST /api/workpackages/:id/tasks: nhóm thuộc dự án khác → 404, KHÔNG tạo task", S, async () => {
  const a = await dungSheet("wpTaskA");
  const b = await dungSheet("wpTaskB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpTaskA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1", name: "Task hack" }), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const t = await queryOne(`SELECT id FROM tasks WHERE package_id = ? AND code = ?`, pkgB, "T1");
  assert.equal(t, undefined, "không được tạo task ở nhóm dự án khác");
});

test("POST /api/workpackages/:id/tasks: đúng dự án của mình → 201, tạo thành công", S, async () => {
  const a = await dungSheet("wpTaskOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const pmA = await taoUser("pm", "wpTaskOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1", name: "Task hợp lệ" }), {
    params: Promise.resolve({ id: String(pkgA) }),
  });
  assert.equal(res.status, 201);
});

// ============================================================================
// PATCH /api/workpackages/:id/move
// ============================================================================

test("PATCH /api/workpackages/:id/move: nhóm thuộc dự án khác → 404, sort_order KHÔNG đổi", S, async () => {
  const a = await dungSheet("wpMoveA");
  const b = await dungSheet("wpMoveB");
  const pkgB1 = await taoNhom(b.sheetTypeId, "B1", { sortOrder: 1 });
  await taoNhom(b.sheetTypeId, "B2", { sortOrder: 2 });
  const pmA = await taoUser("pm", "wpMoveA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgB1) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM work_packages WHERE id = ?`,
    pkgB1,
  );
  assert.equal(row?.sort_order, 1, "sort_order nhóm dự án B không được đổi");
});

test("PATCH /api/workpackages/:id/move: đúng dự án của mình → 200, hoán đổi thành công", S, async () => {
  const a = await dungSheet("wpMoveOk");
  const p1 = await taoNhom(a.sheetTypeId, "A1", { sortOrder: 1 });
  const p2 = await taoNhom(a.sheetTypeId, "A2", { sortOrder: 2 });
  const pmA = await taoUser("pm", "wpMoveOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(p1) }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);

  const { queryOne } = await import("@/lib/db");
  const r1 = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM work_packages WHERE id = ?`,
    p1,
  );
  const r2 = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM work_packages WHERE id = ?`,
    p2,
  );
  assert.equal(r1?.sort_order, 2);
  assert.equal(r2?.sort_order, 1);
});

// ============================================================================
// POST /api/workpackages/:id/copy
// ============================================================================

test("POST /api/workpackages/:id/copy: nhóm gốc thuộc dự án khác → 404, KHÔNG tạo bản sao", S, async () => {
  const a = await dungSheet("wpCopyA");
  const b = await dungSheet("wpCopyB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpCopyA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(pkgB) }) });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const copy = await queryOne(
    `SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = 'B1_copy'`,
    b.sheetTypeId,
  );
  assert.equal(copy, undefined, "không được sao chép nhóm dự án khác");
});

test("POST /api/workpackages/:id/copy: đúng dự án của mình → 201, sao chép thành công", S, async () => {
  const a = await dungSheet("wpCopyOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const pmA = await taoUser("pm", "wpCopyOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(pkgA) }) });
  assert.equal(res.status, 201);
});

// ============================================================================
// GET/POST/DELETE /api/workpackages/:id/bbnt
// ============================================================================

test("GET /api/workpackages/:id/bbnt: nhóm thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wpBbntGetA");
  const b = await dungSheet("wpBbntGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpBbntGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/workpackages/:id/bbnt: nhóm thuộc dự án khác → 404, KHÔNG lưu file", S, async () => {
  const a = await dungSheet("wpBbntPostA");
  const b = await dungSheet("wpBbntPostB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpBbntPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ bbntFileName: string | null }>(
    `SELECT bbnt_file_name AS "bbntFileName" FROM work_packages WHERE id = ?`,
    pkgB,
  );
  assert.equal(row?.bbntFileName, null, "không được ghi file biên bản cho nhóm dự án khác");
});

test("DELETE /api/workpackages/:id/bbnt: nhóm thuộc dự án khác → 404, KHÔNG bị xoá", S, async () => {
  const a = await dungSheet("wpBbntDelA");
  const b = await dungSheet("wpBbntDelB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmB = await taoUser("pm", "wpBbntDelBUp");
  await dangNhapDuAn(pmB, b.projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const uploaded = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(uploaded.status, 201);

  const pmA = await taoUser("pm", "wpBbntDelA");
  await dangNhapDuAn(pmA, a.projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ bbntFileName: string | null }>(
    `SELECT bbnt_file_name AS "bbntFileName" FROM work_packages WHERE id = ?`,
    pkgB,
  );
  assert.ok(row?.bbntFileName, "file biên bản của nhóm dự án B vẫn còn nguyên");
});

test(
  "DELETE /api/workpackages/:id/bbnt: nhóm THẬT SỰ không tồn tại → vẫn 200 (idempotent, giữ hành vi cũ)",
  S,
  async () => {
    const a = await dungSheet("wpBbntDelNone");
    const pmA = await taoUser("pm", "wpBbntDelNone");
    await dangNhapDuAn(pmA, a.projectId);
    const { DELETE } = await import("@/app/api/workpackages/[id]/bbnt/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: "999999999" }),
    });
    assert.equal(res.status, 200);
  },
);

test(
  "POST+GET+DELETE /api/workpackages/:id/bbnt: đúng dự án của mình → hoạt động bình thường",
  S,
  async () => {
    const a = await dungSheet("wpBbntOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const pmA = await taoUser("pm", "wpBbntOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
    const posted = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(posted.status, 201);

    const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
    const got = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(got.status, 200);
    const buf = Buffer.from(await got.arrayBuffer());
    assert.deepEqual(buf, PDF_BYTES);

    const { DELETE } = await import("@/app/api/workpackages/[id]/bbnt/route");
    const deleted = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(deleted.status, 200);
  },
);

// ============================================================================
// GET/POST/DELETE /api/workpackages/:id/drawing
// ============================================================================

test("GET /api/workpackages/:id/drawing: nhóm thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wpDrawGetA");
  const b = await dungSheet("wpDrawGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpDrawGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/workpackages/:id/drawing: nhóm thuộc dự án khác → 404, KHÔNG lưu file", S, async () => {
  const a = await dungSheet("wpDrawPostA");
  const b = await dungSheet("wpDrawPostB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpDrawPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ drawingFileName: string | null }>(
    `SELECT drawing_file_name AS "drawingFileName" FROM work_packages WHERE id = ?`,
    pkgB,
  );
  assert.equal(row?.drawingFileName, null, "không được ghi file bản vẽ cho nhóm dự án khác");
});

test("DELETE /api/workpackages/:id/drawing: nhóm thuộc dự án khác → 404, KHÔNG bị xoá", S, async () => {
  const a = await dungSheet("wpDrawDelA");
  const b = await dungSheet("wpDrawDelB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmB = await taoUser("pm", "wpDrawDelBUp");
  await dangNhapDuAn(pmB, b.projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
  const uploaded = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(uploaded.status, 201);

  const pmA = await taoUser("pm", "wpDrawDelA");
  await dangNhapDuAn(pmA, a.projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ drawingFileName: string | null }>(
    `SELECT drawing_file_name AS "drawingFileName" FROM work_packages WHERE id = ?`,
    pkgB,
  );
  assert.ok(row?.drawingFileName, "file bản vẽ của nhóm dự án B vẫn còn nguyên");
});

test(
  "POST+GET+DELETE /api/workpackages/:id/drawing: đúng dự án của mình → hoạt động bình thường",
  S,
  async () => {
    const a = await dungSheet("wpDrawOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const pmA = await taoUser("pm", "wpDrawOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
    const posted = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(posted.status, 201);

    const { GET } = await import("@/app/api/workpackages/[id]/drawing/route");
    const got = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(got.status, 200);
    const buf = Buffer.from(await got.arrayBuffer());
    assert.deepEqual(buf, PDF_BYTES);

    const { DELETE } = await import("@/app/api/workpackages/[id]/drawing/route");
    const deleted = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(deleted.status, 200);
  },
);

// ============================================================================
// GET /api/workpackages/:id/dimensions
// ============================================================================

test("GET /api/workpackages/:id/dimensions: nhóm thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wpDimGetA");
  const b = await dungSheet("wpDimGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "wpDimGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/workpackages/:id/dimensions: đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("wpDimGetOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  await taoTask(pkgA, "A1,01");
  const pmA = await taoUser("pm", "wpDimGetOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgA) }),
  });
  assert.equal(res.status, 200);
  const { tasks } = await res.json();
  assert.equal(tasks.length, 1);
});

// ============================================================================
// POST/DELETE/PATCH /api/workpackages/:id/dimensions/column
// ============================================================================

test("POST /api/workpackages/:id/dimensions/column: nhóm thuộc dự án khác → 404, KHÔNG tạo cột", S, async () => {
  const a = await dungSheet("wpColPostA");
  const b = await dungSheet("wpColPostB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  await taoTask(pkgB, "B1,01");
  const pmA = await taoUser("pm", "wpColPostA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", { label: "Ø100" }), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const dim = await queryOne(
    `SELECT pd.id FROM progress_dimensions pd JOIN tasks t ON pd.task_id = t.id
      WHERE t.package_id = ? AND pd.dimension_label = 'Ø100'`,
    pkgB,
  );
  assert.equal(dim, undefined, "không được tạo cột cho nhóm dự án khác");
});

test("POST /api/workpackages/:id/dimensions/column: đúng dự án của mình → 201", S, async () => {
  const a = await dungSheet("wpColPostOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  await taoTask(pkgA, "A1,01");
  const pmA = await taoUser("pm", "wpColPostOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", { label: "Ø100" }), {
    params: Promise.resolve({ id: String(pkgA) }),
  });
  assert.equal(res.status, 201);
});

test("DELETE /api/workpackages/:id/dimensions/column: nhóm thuộc dự án khác → 404, KHÔNG xoá cột", S, async () => {
  const a = await dungSheet("wpColDelA");
  const b = await dungSheet("wpColDelB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const t1 = await taoTask(pkgB, "B1,01");
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø100', 1)`,
    t1,
  );
  const pmA = await taoUser("pm", "wpColDelA");
  await dangNhapDuAn(pmA, a.projectId);

  const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await DELETE(jreq("/x?label=Ø100", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const dim = await queryOne(
    `SELECT id FROM progress_dimensions WHERE task_id = ? AND dimension_label = 'Ø100'`,
    t1,
  );
  assert.ok(dim, "cột của nhóm dự án B vẫn còn nguyên");
});

test("DELETE /api/workpackages/:id/dimensions/column: đúng dự án của mình → 200, xoá thành công", S, async () => {
  const a = await dungSheet("wpColDelOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const t1 = await taoTask(pkgA, "A1,01");
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø100', 1)`,
    t1,
  );
  const pmA = await taoUser("pm", "wpColDelOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await DELETE(jreq("/x?label=Ø100", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgA) }),
  });
  assert.equal(res.status, 200);
  const { deleted } = await res.json();
  assert.equal(deleted, 1);
});

test("PATCH /api/workpackages/:id/dimensions/column (copy): nhóm thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wpColCopyA");
  const b = await dungSheet("wpColCopyB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const t1 = await taoTask(pkgB, "B1,01");
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø100', 1)`,
    t1,
  );
  const pmA = await taoUser("pm", "wpColCopyA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await PATCH(
    jreq("/x", { action: "copy", label: "Ø100", newLabel: "Ø150" }, "PATCH"),
    { params: Promise.resolve({ id: String(pkgB) }) },
  );
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const dim = await queryOne(
    `SELECT id FROM progress_dimensions WHERE task_id = ? AND dimension_label = 'Ø150'`,
    t1,
  );
  assert.equal(dim, undefined, "không được copy cột cho nhóm dự án khác");
});

test("PATCH /api/workpackages/:id/dimensions/column (copy): đúng dự án của mình → 201", S, async () => {
  const a = await dungSheet("wpColCopyOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const t1 = await taoTask(pkgA, "A1,01");
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø100', 1)`,
    t1,
  );
  const pmA = await taoUser("pm", "wpColCopyOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await PATCH(
    jreq("/x", { action: "copy", label: "Ø100", newLabel: "Ø150" }, "PATCH"),
    { params: Promise.resolve({ id: String(pkgA) }) },
  );
  assert.equal(res.status, 201);
});

// ============================================================================
// PATCH /api/workpackages/:id/dimensions/column/move
// ============================================================================

test(
  "PATCH /api/workpackages/:id/dimensions/column/move: nhóm thuộc dự án khác → 404, KHÔNG đổi cột",
  S,
  async () => {
    const a = await dungSheet("wpColMoveA");
    const b = await dungSheet("wpColMoveB");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const t1 = await taoTask(pkgB, "B1,01");
    const { insertId } = await import("@/lib/db");
    await insertId(
      `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø100', 1)`,
      t1,
    );
    await insertId(
      `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø200', 2)`,
      t1,
    );
    const pmA = await taoUser("pm", "wpColMoveA");
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
    const res = await PATCH(
      jreq("/x", { label: "Ø100", direction: "right" }, "PATCH"),
      { params: Promise.resolve({ id: String(pkgB) }) },
    );
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const dim = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = 'Ø100'`,
      t1,
    );
    assert.equal(dim?.sort_order, 1, "thứ tự cột của nhóm dự án B không được đổi");
  },
);

test(
  "PATCH /api/workpackages/:id/dimensions/column/move: đúng dự án của mình → 200, hoán đổi thành công",
  S,
  async () => {
    const a = await dungSheet("wpColMoveOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const t1 = await taoTask(pkgA, "A1,01");
    const { insertId } = await import("@/lib/db");
    await insertId(
      `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø100', 1)`,
      t1,
    );
    await insertId(
      `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, 'Ø200', 2)`,
      t1,
    );
    const pmA = await taoUser("pm", "wpColMoveOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
    const res = await PATCH(
      jreq("/x", { label: "Ø100", direction: "right" }, "PATCH"),
      { params: Promise.resolve({ id: String(pkgA) }) },
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    const { queryOne } = await import("@/lib/db");
    const dim = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = 'Ø100'`,
      t1,
    );
    assert.equal(dim?.sort_order, 2);
  },
);

// ============================================================================
// GET /api/workpackages/qc-status
// ============================================================================

test("GET /api/workpackages/qc-status: sheetTypeId thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wpQcA");
  const b = await dungSheet("wpQcB");
  const pmA = await taoUser("pm", "wpQcA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/workpackages/qc-status/route");
  const res = await GET(
    jreq(`/api/workpackages/qc-status?sheetTypeId=${b.sheetTypeId}`, undefined, "GET"),
  );
  assert.equal(res.status, 404);
});

test("GET /api/workpackages/qc-status: đúng dự án của mình → 200", S, async () => {
  const a = await dungSheet("wpQcOk");
  const pmA = await taoUser("pm", "wpQcOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/workpackages/qc-status/route");
  const res = await GET(
    jreq(`/api/workpackages/qc-status?sheetTypeId=${a.sheetTypeId}`, undefined, "GET"),
  );
  assert.equal(res.status, 200);
  const { blocked } = await res.json();
  assert.deepEqual(blocked, []);
});

// Kiểm chứng chống nhiễu: đảm bảo dangXuat() không rò cookie sang test khác trong cùng tiến trình.
test("dọn phiên cuối file", S, async () => {
  dangXuat();
  assert.ok(true);
});
