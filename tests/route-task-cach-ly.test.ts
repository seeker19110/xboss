import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// W7 (Đợt 5) — vá 2 lỗ hổng:
//
// PHẦN A — cách ly DỰ ÁN cho đường sửa/xoá/nghiệm thu/gộp/di chuyển/copy task. Các route
// dưới đây chỉ dựa CAN.editStructure/CAN.approve (vai trò) — KHÔNG so dự án đang chọn —
// trong khi id task là số nguyên tăng dần đoán được:
//   - app/api/tasks/[id]/route.ts            (PATCH sửa, DELETE xoá cascade)
//   - app/api/tasks/[id]/approve/route.ts    (POST/DELETE nghiệm thu 2 bước)
//   - app/api/tasks/batch/route.ts           (PATCH hàng loạt)
//   - app/api/tasks/[id]/move/route.ts       (PATCH đổi thứ tự)
//   - app/api/tasks/[id]/copy/route.ts       (POST nhân bản)
// Vá bằng taskProjectId() (lib/tien-do/workpackages.ts, đã có từ W0/W6) đối chiếu
// getCurrentProjectId() TRƯỚC mọi thao tác ghi/xoá — khác dự án → 404.
//
// PHẦN B — rò rỉ nhà cung cấp XUYÊN TỔ CHỨC: getSubcontractor() (lib/hien-truong/
// subcontractors.ts) không lọc org_id trong khi GET /api/suppliers đã lọc từ M54 GĐ1.
// Vá org_id ở getSubcontractor() + các route dùng canViewSubcontractor/tự SELECT suppliers
// inline: subcontractors/:id, .../documents, .../evaluations, .../profile, subcon-documents/:id.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// Hạ tầng dựng dữ liệu — PHẦN A (task/package/sheet/project)
// ============================================================================

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TASKISO ${uniq(ten)}`);
}

async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp TASKISO')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet TASKISO', ?)`,
    towerId,
    `TKISO${uniq(ten)}`,
    `tkiso-${ten.toLowerCase()}-${uniq("slug")}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tkiso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tkiso', ?, 1)`,
    `TKISO ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
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

async function taoTask(
  packageId: number,
  code: string,
  overrides: { progress?: number; sortOrder?: number } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent)
     VALUES (?, ?, ?, ?, ?)`,
    packageId,
    code,
    `Task ${code}`,
    overrides.sortOrder ?? 1,
    overrides.progress ?? 0,
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

async function taoComment(taskId: number, userId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, 'bình luận test')`,
    taskId,
    userId,
  );
}

// ============================================================================
// PHẦN A.1 — PATCH /api/tasks/:id
// ============================================================================

test("PATCH /api/tasks/:id: task thuộc dự án khác (pm) → 404, KHÔNG đổi tên", S, async () => {
  const a = await dungSheet("patchA");
  const b = await dungSheet("patchB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const pmA = await taoUser("pm", "patchA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Bị đổi tên trái phép" }, "PATCH"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ name: string }>(`SELECT name FROM tasks WHERE id = ?`, taskB);
  assert.equal(row!.name, "Task T1", "task dự án B không được đổi tên");
});

test("PATCH /api/tasks/:id: task thuộc dự án khác (admin) → 404", S, async () => {
  const a = await dungSheet("patchAdmA");
  const b = await dungSheet("patchAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const admin = await taoUser("admin", "patchAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/tasks/:id: engineer đúng dự án của mình → 403 (role check, không phải 404)",
  S,
  async () => {
    const a = await dungSheet("patchEngA");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const taskA = await taoTask(pkgA, "T1");
    const eng = await taoUser("engineer", "patchEngA");
    await dangNhapDuAn(eng, a.projectId);

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
      params: Promise.resolve({ id: String(taskA) }),
    });
    // CAN.editStructure chỉ admin/pm — engineer bị chặn ở lớp vai trò TRƯỚC lớp dự án.
    assert.equal(res.status, 403);
  },
);

test(
  "PATCH /api/tasks/:id: task đúng dự án của mình (pm) → 200, đổi tên thành công",
  S,
  async () => {
    const a = await dungSheet("patchOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const taskA = await taoTask(pkgA, "T1");
    const pmA = await taoUser("pm", "patchOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(jreq("/x", { name: "Tên mới hợp lệ" }, "PATCH"), {
      params: Promise.resolve({ id: String(taskA) }),
    });
    assert.equal(res.status, 200);
    const { task } = await res.json();
    assert.equal(task.name, "Tên mới hợp lệ");
  },
);

test("PATCH /api/tasks/:id: task đúng dự án của mình (admin) → 200", S, async () => {
  const a = await dungSheet("patchOkAdm");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  const admin = await taoUser("admin", "patchOkAdm");
  await dangNhapDuAn(admin, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(jreq("/x", { code: "T1-B" }, "PATCH"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// PHẦN A.2 — DELETE /api/tasks/:id
// ============================================================================

test(
  "DELETE /api/tasks/:id: task dự án khác (pm) → 404, task + dữ liệu con VẪN CÒN",
  S,
  async () => {
    const a = await dungSheet("delA");
    const b = await dungSheet("delB");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const taskB = await taoTask(pkgB, "T1");
    const dimB = await taoDimension(taskB);
    const pmB = await taoUser("pm", "delBOwner");
    const commentB = await taoComment(taskB, pmB.id);
    const pmA = await taoUser("pm", "delA");
    await dangNhapDuAn(pmA, a.projectId);

    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(taskB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const task = await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskB);
    assert.ok(task, "task dự án B vẫn còn");
    const dim = await queryOne(`SELECT id FROM progress_dimensions WHERE id = ?`, dimB);
    assert.ok(dim, "dimension của task dự án B vẫn còn");
    const cmt = await queryOne(`SELECT id FROM task_comments WHERE id = ?`, commentB);
    assert.ok(cmt, "bình luận của task dự án B vẫn còn");
  },
);

test("DELETE /api/tasks/:id: task dự án khác (admin) → 404, task vẫn còn", S, async () => {
  const a = await dungSheet("delAdmA");
  const b = await dungSheet("delAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const admin = await taoUser("admin", "delAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { DELETE } = await import("@/app/api/tasks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const task = await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskB);
  assert.ok(task, "task dự án B vẫn còn");
});

test("DELETE /api/tasks/:id: task đúng dự án của mình (pm) → 200, xoá thành công", S, async () => {
  const a = await dungSheet("delOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const taskA = await taoTask(pkgA, "T1");
  await taoDimension(taskA);
  const pmA = await taoUser("pm", "delOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { DELETE } = await import("@/app/api/tasks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(taskA) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const task = await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskA);
  assert.equal(task, undefined, "task đã bị xoá");
});

// ============================================================================
// PHẦN A.3 — POST/DELETE /api/tasks/:id/approve
// ============================================================================

test("POST /api/tasks/:id/approve: task dự án khác (pm) → 404, KHÔNG nghiệm thu", S, async () => {
  const a = await dungSheet("appA");
  const b = await dungSheet("appB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1", { progress: 1 });
  const pmA = await taoUser("pm", "appA");
  await dangNhapDuAn(pmA, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(jreq("/x", {}, "POST"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ status: string }>(`SELECT status FROM tasks WHERE id = ?`, taskB);
  assert.notEqual(row!.status, "nghiem_thu");
});

test("POST /api/tasks/:id/approve: task dự án khác (admin) → 404", S, async () => {
  const a = await dungSheet("appAdmA");
  const b = await dungSheet("appAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1", { progress: 1 });
  const admin = await taoUser("admin", "appAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(jreq("/x", {}, "POST"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/tasks/:id/approve: task đúng dự án của mình (pm) → 200, nghiệm thu",
  S,
  async () => {
    const a = await dungSheet("appOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const taskA = await taoTask(pkgA, "T1", { progress: 1 });
    const pmA = await taoUser("pm", "appOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    const res = await POST(jreq("/x", {}, "POST"), {
      params: Promise.resolve({ id: String(taskA) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "nghiem_thu");
  },
);

test(
  "DELETE /api/tasks/:id/approve: task dự án khác (pm) → 404, vẫn giữ nghiem_thu",
  S,
  async () => {
    const a = await dungSheet("unappA");
    const b = await dungSheet("unappB");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const taskB = await taoTask(pkgB, "T1", { progress: 1 });
    const { run } = await import("@/lib/db");
    await run(`UPDATE tasks SET status = 'nghiem_thu' WHERE id = ?`, taskB);
    const pmA = await taoUser("pm", "unappA");
    await dangNhapDuAn(pmA, a.projectId);

    const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
    const res = await DELETE(jreq("/x", {}, "DELETE"), {
      params: Promise.resolve({ id: String(taskB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ status: string }>(`SELECT status FROM tasks WHERE id = ?`, taskB);
    assert.equal(row!.status, "nghiem_thu", "trạng thái dự án B không bị đổi");
  },
);

test(
  "DELETE /api/tasks/:id/approve: task đúng dự án của mình (admin) → 200, huỷ nghiệm thu",
  S,
  async () => {
    const a = await dungSheet("unappOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const taskA = await taoTask(pkgA, "T1", { progress: 1 });
    const { run } = await import("@/lib/db");
    await run(`UPDATE tasks SET status = 'nghiem_thu' WHERE id = ?`, taskA);
    const admin = await taoUser("admin", "unappOk");
    await dangNhapDuAn(admin, a.projectId);

    const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
    const res = await DELETE(jreq("/x", {}, "DELETE"), {
      params: Promise.resolve({ id: String(taskA) }),
    });
    assert.equal(res.status, 200);
  },
);

// ============================================================================
// PHẦN A.4 — PATCH /api/tasks/batch
// ============================================================================

test(
  "PATCH /api/tasks/batch: chứa task dự án khác (pm) → 422 cả lô, task dự án A không đổi",
  S,
  async () => {
    const a = await dungSheet("batchA");
    const b = await dungSheet("batchB");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const taskA = await taoTask(pkgA, "T1");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const taskB = await taoTask(pkgB, "T1");
    const pmA = await taoUser("pm", "batchA");
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/tasks/batch/route");
    const res = await PATCH(
      jreq(
        "/x",
        {
          updates: [
            { id: taskA, patch: { name: "A đổi" } },
            { id: taskB, patch: { name: "B đổi trái phép" } },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(res.status, 422);

    const { queryOne } = await import("@/lib/db");
    const rowA = await queryOne<{ name: string }>(`SELECT name FROM tasks WHERE id = ?`, taskA);
    assert.equal(rowA!.name, "Task T1", "cả lô rollback — task A cũng không đổi");
    const rowB = await queryOne<{ name: string }>(`SELECT name FROM tasks WHERE id = ?`, taskB);
    assert.equal(rowB!.name, "Task T1", "task dự án B không bị đổi tên");
  },
);

test("PATCH /api/tasks/batch: chứa task dự án khác (admin) → 422", S, async () => {
  const a = await dungSheet("batchAdmA");
  const b = await dungSheet("batchAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const admin = await taoUser("admin", "batchAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(jreq("/x", { updates: [{ id: taskB, patch: { name: "x" } }] }, "PATCH"));
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/tasks/batch: toàn bộ task đúng dự án của mình (pm) → 200, ghi đúng",
  S,
  async () => {
    const a = await dungSheet("batchOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const task1 = await taoTask(pkgA, "T1");
    const task2 = await taoTask(pkgA, "T2");
    const pmA = await taoUser("pm", "batchOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { PATCH } = await import("@/app/api/tasks/batch/route");
    const res = await PATCH(
      jreq(
        "/x",
        {
          updates: [
            { id: task1, patch: { name: "T1 đổi" } },
            { id: task2, patch: { name: "T2 đổi" } },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).updated, 2);
  },
);

// ============================================================================
// PHẦN A.5 — PATCH /api/tasks/:id/move
// ============================================================================

test("PATCH /api/tasks/:id/move: task dự án khác (pm) → 404, sort_order không đổi", S, async () => {
  const a = await dungSheet("moveA");
  const b = await dungSheet("moveB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB1 = await taoTask(pkgB, "T1", { sortOrder: 1 });
  await taoTask(pkgB, "T2", { sortOrder: 2 });
  const pmA = await taoUser("pm", "moveA");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(taskB1) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM tasks WHERE id = ?`,
    taskB1,
  );
  assert.equal(row!.sort_order, 1, "sort_order dự án B không đổi");
});

test("PATCH /api/tasks/:id/move: task dự án khác (admin) → 404", S, async () => {
  const a = await dungSheet("moveAdmA");
  const b = await dungSheet("moveAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB1 = await taoTask(pkgB, "T1", { sortOrder: 1 });
  const admin = await taoUser("admin", "moveAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(taskB1) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/tasks/:id/move: task đúng dự án của mình (pm) → 200, đổi thứ tự", S, async () => {
  const a = await dungSheet("moveOk");
  const pkgA = await taoNhom(a.sheetTypeId, "A1");
  const task1 = await taoTask(pkgA, "T1", { sortOrder: 1 });
  const task2 = await taoTask(pkgA, "T2", { sortOrder: 2 });
  const pmA = await taoUser("pm", "moveOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(task1) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row1 = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM tasks WHERE id = ?`,
    task1,
  );
  const row2 = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM tasks WHERE id = ?`,
    task2,
  );
  assert.equal(row1!.sort_order, 2);
  assert.equal(row2!.sort_order, 1);
});

// ============================================================================
// PHẦN A.6 — POST /api/tasks/:id/copy
// ============================================================================

test(
  "POST /api/tasks/:id/copy: task nguồn thuộc dự án khác (pm) → 404, không tạo bản sao",
  S,
  async () => {
    const a = await dungSheet("copyA");
    const b = await dungSheet("copyB");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const taskB = await taoTask(pkgB, "T1");
    const pmA = await taoUser("pm", "copyA");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/tasks/[id]/copy/route");
    const res = await POST(jreq("/x", {}, "POST"), {
      params: Promise.resolve({ id: String(taskB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const cnt = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tasks WHERE package_id = ?`,
      pkgB,
    );
    assert.equal(cnt!.count, 1, "không có bản sao nào được tạo ở dự án B");
  },
);

test("POST /api/tasks/:id/copy: task nguồn thuộc dự án khác (admin) → 404", S, async () => {
  const a = await dungSheet("copyAdmA");
  const b = await dungSheet("copyAdmB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const taskB = await taoTask(pkgB, "T1");
  const admin = await taoUser("admin", "copyAdmA");
  await dangNhapDuAn(admin, a.projectId);

  const { POST } = await import("@/app/api/tasks/[id]/copy/route");
  const res = await POST(jreq("/x", {}, "POST"), {
    params: Promise.resolve({ id: String(taskB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/tasks/:id/copy: task nguồn đúng dự án của mình (pm) → 201, tạo bản sao",
  S,
  async () => {
    const a = await dungSheet("copyOk");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const taskA = await taoTask(pkgA, "T1");
    await taoDimension(taskA);
    const pmA = await taoUser("pm", "copyOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/tasks/[id]/copy/route");
    const res = await POST(jreq("/x", {}, "POST"), {
      params: Promise.resolve({ id: String(taskA) }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.code, "T1_copy");
  },
);

// ============================================================================
// PHẦN B — rò rỉ nhà cung cấp xuyên tổ chức
// ============================================================================

async function taoOrg(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${uniq(ten)}`);
}

async function taoUserOrg(
  role: string,
  ten: string,
  orgId: number,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `subiso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-subiso', ?, ?)`,
    `SUBISO ${ten}`,
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

async function taoSupplier(ten: string, orgId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, `NTP ${uniq(ten)}`, orgId);
}

function dangNhapOrg(user: { id: number; passwordHash: string; orgId: number }): void {
  dangNhap({ id: user.id, passwordHash: user.passwordHash, orgId: user.orgId });
}

// ----- GET /api/subcontractors/:supplierId -----

test("GET /api/subcontractors/:id: NTP thuộc tổ chức khác (pm) → 404", S, async () => {
  const orgA = await taoOrg("subGetA");
  const orgB = await taoOrg("subGetB");
  const supplierB = await taoSupplier("subGetB", orgB);
  const pmA = await taoUserOrg("pm", "subGetA", orgA);
  dangNhapOrg(pmA);

  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/subcontractors/:id: NTP thuộc tổ chức khác (admin) → 404", S, async () => {
  const orgA = await taoOrg("subGetAdmA");
  const orgB = await taoOrg("subGetAdmB");
  const supplierB = await taoSupplier("subGetAdmB", orgB);
  const admin = await taoUserOrg("admin", "subGetAdmA", orgA);
  dangNhapOrg(admin);

  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/subcontractors/:id: NTP đúng tổ chức của mình (pm) → 200", S, async () => {
  const orgA = await taoOrg("subGetOk");
  const supplierA = await taoSupplier("subGetOk", orgA);
  const pmA = await taoUserOrg("pm", "subGetOk", orgA);
  dangNhapOrg(pmA);

  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierA) }),
  });
  assert.equal(res.status, 200);
  const { item } = await res.json();
  assert.equal(item.id, supplierA);
});

test(
  "GET /api/subcontractors/:id: subcon đúng NTP của mình nhưng khác tổ chức → 404",
  S,
  async () => {
    const orgA = await taoOrg("subSubA");
    const orgB = await taoOrg("subSubB");
    const supplierB = await taoSupplier("subSubB", orgB);
    // subcon thuộc org A nhưng users.supplier_id trỏ tới NTP org B (dữ liệu lẫn giả định) —
    // dù canViewSubcontractor cho qua (đúng supplier_id của mình), lớp org vẫn phải chặn.
    const { insertId, queryOne } = await import("@/lib/db");
    const email = `subiso-${uniq("subSubA")}@test.local`;
    const subId = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id, supplier_id)
       VALUES (?, ?, 'hash-test-subiso', 'subcon', ?, ?)`,
      "SUBISO subSubA",
      email,
      orgA,
      supplierB,
    );
    const u = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      subId,
    );
    dangNhap({ id: subId, passwordHash: u!.password_hash, orgId: orgA });

    const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ supplierId: String(supplierB) }),
    });
    assert.equal(res.status, 404);
  },
);

test("GET /api/subcontractors/:id: subcon đúng NTP + đúng tổ chức → 200", S, async () => {
  const orgA = await taoOrg("subSubOkA");
  const supplierA = await taoSupplier("subSubOkA", orgA);
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `subiso-${uniq("subSubOkA")}@test.local`;
  const subId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id, supplier_id)
     VALUES (?, ?, 'hash-test-subiso', 'subcon', ?, ?)`,
    "SUBISO subSubOkA",
    email,
    orgA,
    supplierA,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    subId,
  );
  dangNhap({ id: subId, passwordHash: u!.password_hash, orgId: orgA });

  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierA) }),
  });
  assert.equal(res.status, 200);
});

// ----- GET/POST /api/subcontractors/:supplierId/documents -----

test("GET /api/subcontractors/:id/documents: NTP thuộc tổ chức khác (pm) → 404", S, async () => {
  const orgA = await taoOrg("docGetA");
  const orgB = await taoOrg("docGetB");
  const supplierB = await taoSupplier("docGetB", orgB);
  const pmA = await taoUserOrg("pm", "docGetA", orgA);
  dangNhapOrg(pmA);

  const { GET } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/subcontractors/:id/documents: NTP thuộc tổ chức khác (admin) → 404, không tạo hồ sơ",
  S,
  async () => {
    const orgA = await taoOrg("docPostA");
    const orgB = await taoOrg("docPostB");
    const supplierB = await taoSupplier("docPostB", orgB);
    const admin = await taoUserOrg("admin", "docPostA", orgA);
    dangNhapOrg(admin);

    const form = new FormData();
    form.set(
      "file",
      new File([Buffer.from("%PDF-1.4\n%%EOF")], "a.pdf", { type: "application/pdf" }),
    );
    form.set("title", "Hồ sơ trái phép");
    const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: form }), {
      params: Promise.resolve({ supplierId: String(supplierB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const cnt = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM subcon_documents WHERE supplier_id = ?`,
      supplierB,
    );
    assert.equal(cnt!.count, 0, "không có hồ sơ nào được tạo cho NTP tổ chức khác");
  },
);

test(
  "GET+POST /api/subcontractors/:id/documents: đúng tổ chức của mình (pm) → 200/201",
  S,
  async () => {
    const orgA = await taoOrg("docOkA");
    const supplierA = await taoSupplier("docOkA", orgA);
    const pmA = await taoUserOrg("pm", "docOkA", orgA);
    dangNhapOrg(pmA);

    const { GET } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
    const resGet = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ supplierId: String(supplierA) }),
    });
    assert.equal(resGet.status, 200);

    const form = new FormData();
    form.set(
      "file",
      new File([Buffer.from("%PDF-1.4\n%%EOF")], "a.pdf", { type: "application/pdf" }),
    );
    form.set("title", "Hồ sơ hợp lệ");
    const { POST } = await import("@/app/api/subcontractors/[supplierId]/documents/route");
    const resPost = await POST(
      new NextRequest("http://localhost/x", { method: "POST", body: form }),
      {
        params: Promise.resolve({ supplierId: String(supplierA) }),
      },
    );
    assert.equal(resPost.status, 201);
  },
);

// ----- GET/POST /api/subcontractors/:supplierId/evaluations -----

test("GET /api/subcontractors/:id/evaluations: NTP thuộc tổ chức khác (pm) → 404", S, async () => {
  const orgA = await taoOrg("evalGetA");
  const orgB = await taoOrg("evalGetB");
  const supplierB = await taoSupplier("evalGetB", orgB);
  const pmA = await taoUserOrg("pm", "evalGetA", orgA);
  dangNhapOrg(pmA);

  const { GET } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/subcontractors/:id/evaluations: NTP thuộc tổ chức khác (engineer) → 404, không tạo",
  S,
  async () => {
    const orgA = await taoOrg("evalPostA");
    const orgB = await taoOrg("evalPostB");
    const supplierB = await taoSupplier("evalPostB", orgB);
    const engA = await taoUserOrg("engineer", "evalPostA", orgA);
    dangNhapOrg(engA);

    const { POST } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
    const res = await POST(jreq("/x", { period: "2026-Q3", safetyScore: 4 }, "POST"), {
      params: Promise.resolve({ supplierId: String(supplierB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const cnt = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM subcon_evaluations WHERE supplier_id = ?`,
      supplierB,
    );
    assert.equal(cnt!.count, 0);
  },
);

test(
  "GET+POST /api/subcontractors/:id/evaluations: đúng tổ chức của mình (engineer) → 200/201",
  S,
  async () => {
    const orgA = await taoOrg("evalOkA");
    const supplierA = await taoSupplier("evalOkA", orgA);
    const engA = await taoUserOrg("engineer", "evalOkA", orgA);
    dangNhapOrg(engA);

    const { GET } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
    const resGet = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ supplierId: String(supplierA) }),
    });
    assert.equal(resGet.status, 200);

    const { POST } = await import("@/app/api/subcontractors/[supplierId]/evaluations/route");
    const resPost = await POST(jreq("/x", { period: "2026-Q3", safetyScore: 4 }, "POST"), {
      params: Promise.resolve({ supplierId: String(supplierA) }),
    });
    assert.equal(resPost.status, 201);
  },
);

// ----- PATCH /api/subcontractors/:supplierId/profile -----

test(
  "PATCH /api/subcontractors/:id/profile: NTP thuộc tổ chức khác (admin) → 404, không sửa hồ sơ",
  S,
  async () => {
    const orgA = await taoOrg("profA");
    const orgB = await taoOrg("profB");
    const supplierB = await taoSupplier("profB", orgB);
    const admin = await taoUserOrg("admin", "profA", orgA);
    dangNhapOrg(admin);

    const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
    const res = await PATCH(jreq("/x", { siteRepName: "Trái phép" }, "PATCH"), {
      params: Promise.resolve({ supplierId: String(supplierB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne(
      `SELECT supplier_id FROM subcontractor_profiles WHERE supplier_id = ?`,
      supplierB,
    );
    assert.equal(row, undefined, "không có hồ sơ nào được tạo cho NTP tổ chức khác");
  },
);

test("PATCH /api/subcontractors/:id/profile: đúng tổ chức của mình (pm) → 200", S, async () => {
  const orgA = await taoOrg("profOkA");
  const supplierA = await taoSupplier("profOkA", orgA);
  const pmA = await taoUserOrg("pm", "profOkA", orgA);
  dangNhapOrg(pmA);

  const { PATCH } = await import("@/app/api/subcontractors/[supplierId]/profile/route");
  const res = await PATCH(jreq("/x", { siteRepName: "Người đại diện" }, "PATCH"), {
    params: Promise.resolve({ supplierId: String(supplierA) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ site_rep_name: string }>(
    `SELECT site_rep_name FROM subcontractor_profiles WHERE supplier_id = ?`,
    supplierA,
  );
  assert.equal(row!.site_rep_name, "Người đại diện");
});

// ----- GET/DELETE /api/subcon-documents/:id -----

async function taoSubconDoc(supplierId: number, uploadedBy: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO subcon_documents (supplier_id, title, file_name, original_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, 'Hồ sơ test', 'khong-ton-tai.pdf', 'a.pdf', 'application/pdf', 100, ?)`,
    supplierId,
    uploadedBy,
  );
}

test("GET /api/subcon-documents/:id: hồ sơ thuộc tổ chức khác (pm) → 404", S, async () => {
  const orgA = await taoOrg("docFileA");
  const orgB = await taoOrg("docFileB");
  const supplierB = await taoSupplier("docFileB", orgB);
  const pmB = await taoUserOrg("pm", "docFileBOwner", orgB);
  const docB = await taoSubconDoc(supplierB, pmB.id);
  const pmA = await taoUserOrg("pm", "docFileA", orgA);
  dangNhapOrg(pmA);

  const { GET } = await import("@/app/api/subcon-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/subcon-documents/:id: hồ sơ thuộc tổ chức khác (admin) → 404, hồ sơ vẫn còn",
  S,
  async () => {
    const orgA = await taoOrg("docDelA");
    const orgB = await taoOrg("docDelB");
    const supplierB = await taoSupplier("docDelB", orgB);
    const pmB = await taoUserOrg("pm", "docDelBOwner", orgB);
    const docB = await taoSubconDoc(supplierB, pmB.id);
    const adminA = await taoUserOrg("admin", "docDelA", orgA);
    dangNhapOrg(adminA);

    const { DELETE } = await import("@/app/api/subcon-documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne(`SELECT id FROM subcon_documents WHERE id = ?`, docB);
    assert.ok(row, "hồ sơ tổ chức B vẫn còn");
  },
);

test("GET+DELETE /api/subcon-documents/:id: đúng tổ chức của mình (admin) → 200", S, async () => {
  const orgA = await taoOrg("docOkFileA");
  const supplierA = await taoSupplier("docOkFileA", orgA);
  const adminA = await taoUserOrg("admin", "docOkFileA", orgA);
  const docA = await taoSubconDoc(supplierA, adminA.id);
  dangNhapOrg(adminA);

  // File vật lý không tồn tại trên đĩa test → GET trả 404 "File không còn trên đĩa" (đã qua
  // được lớp org + canViewSubcontractor, đúng cái đang kiểm). DELETE không đọc file trước khi
  // xoá DB nên vẫn xoá được record + gọi storageDelete (best-effort, không throw khi file thiếu
  // trong storage cục bộ test).
  const { GET } = await import("@/app/api/subcon-documents/[id]/route");
  const resGet = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docA) }),
  });
  assert.equal(resGet.status, 404);
  assert.match((await resGet.json()).error, /File không còn trên đĩa/);

  const { DELETE } = await import("@/app/api/subcon-documents/[id]/route");
  const resDel = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docA) }),
  });
  assert.equal(resDel.status, 200);
});

dangXuat();
