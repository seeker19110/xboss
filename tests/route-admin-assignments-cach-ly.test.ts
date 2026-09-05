import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Đợt 6, Việc I — /api/admin/assignments không scope theo dự án ở CẢ GET LẪN POST: đọc/ghi
// trên toàn bộ WBS hệ thống, xuyên dự án. GET lọc theo dự án đang chọn (dự án khác không được
// xuất hiện trong sheets/packages/tasks/workload); POST đối chiếu dự án của thực thể id nhận
// từ body bằng sheetTypeProjectId/packageProjectId/taskProjectId, không khớp → 404 y hệt thông
// điệp "Đối tượng không tồn tại" hiện có (không lộ tồn tại của thực thể dự án khác).

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `AA ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `aa-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-aa', ?, 1)`,
    `AA ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId: 1 };
}

/** Dựng dự án + tháp + sheet — chuỗi tối thiểu để suy project_id cho work_package/task. */
async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp AA')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet AA', ?)`,
    towerId,
    `AA${uniq(ten)}`,
    `aa-${ten.toLowerCase()}-${uniq("slug")}`,
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

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/**
 * Dọn dữ liệu đã tạo — bắt buộc vì `ensureDefaultUsers` (tests/auth.test.ts) `DELETE FROM
 * users` toàn bộ trong 1 transaction, vỡ FK nếu còn task/nhóm nào gán cho user do file này
 * tạo mà chưa xoá (đã thấy thật khi chạy `npm test` toàn bộ trước khi thêm hàm này).
 */
async function don(projectIds: number[], userIds: number[]): Promise<void> {
  const { run } = await import("@/lib/db");
  // assignment_log FK tới users (changed_by/prev_user_id/new_user_id) — dọn trước khi xoá user
  // (cùng khuôn cleanupProject của tests/assignments.test.ts).
  await run(
    `DELETE FROM assignment_log WHERE changed_by = ANY(?) OR new_user_id = ANY(?) OR prev_user_id = ANY(?)`,
    userIds,
    userIds,
    userIds,
  );
  await run(
    `DELETE FROM tasks WHERE package_id IN (
       SELECT wp.id FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ANY(?))`,
    projectIds,
  );
  await run(
    `DELETE FROM work_packages WHERE sheet_type_id IN (
       SELECT st.id FROM sheet_types st
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ANY(?))`,
    projectIds,
  );
  await run(
    `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ANY(?))`,
    projectIds,
  );
  await run(`DELETE FROM towers WHERE project_id = ANY(?)`, projectIds);
  await run(`DELETE FROM user_projects WHERE project_id = ANY(?)`, projectIds);
  await run(`DELETE FROM projects WHERE id = ANY(?)`, projectIds);
  await run(`DELETE FROM notifications WHERE user_id = ANY(?)`, userIds);
  await run(`DELETE FROM users WHERE id = ANY(?)`, userIds);
}

test.after(() => dangXuat());

// ============================================================================
// GET — chỉ trả sheets/packages/tasks/workload của dự án đang chọn
// ============================================================================

test("GET /api/admin/assignments: chỉ trả WBS của dự án đang chọn, không lộ dự án khác", S, async () => {
  const a = await dungSheet("getA");
  const b = await dungSheet("getB");
  const pkgA = await taoNhom(a.sheetTypeId, uniq("PKA"));
  const taskA = await taoTask(pkgA, uniq("TA"));
  const pkgB = await taoNhom(b.sheetTypeId, uniq("PKB"));
  const taskB = await taoTask(pkgB, uniq("TB"));

  const workerB = await taoUser("engineer", "workerB");
  const { run } = await import("@/lib/db");
  await run(`UPDATE tasks SET assigned_to = ? WHERE id = ?`, workerB.id, taskB);

  const pmA = await taoUser("pm", "pmA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/admin/assignments/route");
  const res = await GET(jreq("/api/admin/assignments", undefined, "GET"));
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.ok(
    data.sheets.some((s: { id: number }) => s.id === a.sheetTypeId),
    "phải có sheet dự án A",
  );
  assert.ok(
    !data.sheets.some((s: { id: number }) => s.id === b.sheetTypeId),
    "KHÔNG được có sheet dự án B",
  );
  assert.ok(
    !data.packages.some((p: { id: number }) => p.id === pkgB),
    "KHÔNG được có package dự án B",
  );
  assert.ok(
    !data.tasks.some((t: { id: number }) => t.id === taskB),
    "KHÔNG được có task dự án B",
  );
  assert.ok(
    data.tasks.some((t: { id: number }) => t.id === taskA),
    "phải có task dự án A",
  );
  assert.equal(
    data.workload[workerB.id],
    undefined,
    "workload KHÔNG được đếm task của dự án B",
  );

  await don([a.projectId, b.projectId], [workerB.id, pmA.id]);
});

test("GET /api/admin/assignments: chưa chọn dự án → trả danh sách rỗng, KHÔNG lỗi", S, async () => {
  const pmNoProj = await taoUser("pm", "pmNoProj");
  dangXuat();
  const { dangNhap } = await import("./helpers/phien");
  dangNhap(pmNoProj, null);

  const { GET } = await import("@/app/api/admin/assignments/route");
  const res = await GET(jreq("/api/admin/assignments", undefined, "GET"));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { sheets: [], packages: [], tasks: [], workload: {} });

  await don([], [pmNoProj.id]);
});

// ============================================================================
// POST — id tham chiếu từ body phải thuộc dự án đang chọn
// ============================================================================

test("POST /api/admin/assignments: gán task thuộc dự án khác → 404, KHÔNG đổi assigned_to", S, async () => {
  const a = await dungSheet("postTaskA");
  const b = await dungSheet("postTaskB");
  const pkgB = await taoNhom(b.sheetTypeId, uniq("PKB"));
  const taskB = await taoTask(pkgB, uniq("TB"));

  const pmA = await taoUser("pm", "postTaskPmA");
  const target = await taoUser("engineer", "postTaskTarget");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/api/admin/assignments", { level: "task", id: taskB, userId: target.id }));
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, "Đối tượng không tồn tại");

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ assignedTo: number | null }>(
    `SELECT assigned_to AS "assignedTo" FROM tasks WHERE id = ?`,
    taskB,
  );
  assert.equal(row?.assignedTo, null, "task dự án B không được đổi assigned_to");

  await don([a.projectId, b.projectId], [pmA.id, target.id]);
});

test("POST /api/admin/assignments: gán package thuộc dự án khác → 404, KHÔNG đổi assigned_to", S, async () => {
  const a = await dungSheet("postPkgA");
  const b = await dungSheet("postPkgB");
  const pkgB = await taoNhom(b.sheetTypeId, uniq("PKB2"));

  const pmA = await taoUser("pm", "postPkgPmA");
  const target = await taoUser("engineer", "postPkgTarget");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/api/admin/assignments", { level: "package", id: pkgB, userId: target.id }));
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, "Đối tượng không tồn tại");

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ assignedTo: number | null }>(
    `SELECT assigned_to AS "assignedTo" FROM work_packages WHERE id = ?`,
    pkgB,
  );
  assert.equal(row?.assignedTo, null, "package dự án B không được đổi assigned_to");

  await don([a.projectId, b.projectId], [pmA.id, target.id]);
});

test("POST /api/admin/assignments: gán sheet thuộc dự án khác → 404, KHÔNG đổi manager_id", S, async () => {
  const a = await dungSheet("postSheetA");
  const b = await dungSheet("postSheetB");

  const pmA = await taoUser("pm", "postSheetPmA");
  const target = await taoUser("engineer", "postSheetTarget");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(
    jreq("/api/admin/assignments", { level: "sheet", id: b.sheetTypeId, userId: target.id }),
  );
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, "Đối tượng không tồn tại");

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ managerId: number | null }>(
    `SELECT manager_id AS "managerId" FROM sheet_types WHERE id = ?`,
    b.sheetTypeId,
  );
  assert.equal(row?.managerId, null, "sheet dự án B không được đổi manager_id");

  await don([a.projectId, b.projectId], [pmA.id, target.id]);
});

test("POST /api/admin/assignments: gán task đúng dự án của mình → 200, ghi đúng", S, async () => {
  const a = await dungSheet("postOkA");
  const pkgA = await taoNhom(a.sheetTypeId, uniq("PKOK"));
  const taskA = await taoTask(pkgA, uniq("TOK"));

  const pmA = await taoUser("pm", "postOkPmA");
  const target = await taoUser("engineer", "postOkTarget");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/api/admin/assignments", { level: "task", id: taskA, userId: target.id }));
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ assignedTo: number | null }>(
    `SELECT assigned_to AS "assignedTo" FROM tasks WHERE id = ?`,
    taskA,
  );
  assert.equal(row?.assignedTo, target.id);

  await don([a.projectId], [pmA.id, target.id]);
});

test("POST /api/admin/assignments: chưa chọn dự án → 422", S, async () => {
  const pmNoProj = await taoUser("pm", "postNoProj");
  const target = await taoUser("engineer", "postNoProjTarget");
  dangXuat();
  const { dangNhap } = await import("./helpers/phien");
  dangNhap(pmNoProj, null);

  const { POST } = await import("@/app/api/admin/assignments/route");
  const res = await POST(jreq("/api/admin/assignments", { level: "task", id: 1, userId: target.id }));
  assert.equal(res.status, 422);

  await don([], [pmNoProj.id, target.id]);
});
