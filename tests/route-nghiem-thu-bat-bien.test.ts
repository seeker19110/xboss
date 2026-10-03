import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Audit 2026-09-22 (L1 + L2) — bất biến nghiệm thu bị phá qua các route thường: 5 route dưới
// chỉ chặn ĐẶT status = 'nghiem_thu', không chặn khi task ĐANG nghiem_thu. Hệ quả: PATCH task
// hạ trạng thái về hoan_thanh/dang_thi_cong, PATCH progress hạ % xuống <1, bỏ tick ô dimension
// kéo % xuống trong khi status vẫn nghiem_thu ⇒ phá "nghiem_thu ⇒ progress = 1" và né audit
// của /api/tasks/:id/approve. File này ghim: mọi thao tác đổi trạng thái / giảm tiến độ trên
// task đã nghiệm thu bị từ chối, còn thao tác không phá bất biến (sửa tên, tick lại, gửi lại
// progress = 1) vẫn chạy bình thường.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

const LOI = "Task đã nghiệm thu — huỷ nghiệm thu (DELETE /api/tasks/:id/approve) trước khi sửa";

const jreq = (url: string, body?: unknown, method = "PATCH") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

type Ctx = {
  projectId: number;
  towerId: number;
  sheetTypeId: number;
  packageId: number;
  taskId: number;
  dims: number[];
  admin: { id: number; passwordHash: string; orgId: number };
};

async function taoUser(
  role: string,
  ten: string,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-nt', ?, 1)`,
    `NT ${ten}`,
    `nt-${uniq(ten)}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId: 1 };
}

/**
 * Dựng dự án → tháp → sheet → nhóm → task có 2 ô dimension đã tick, % = 1.
 * `status` cho phép dựng cả ca đối chứng (task 100% nhưng CHƯA nghiệm thu).
 */
async function dungTask(ten: string, status: string): Promise<Ctx> {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `NT ${uniq(ten)}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp NT')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet NT', ?)`,
    towerId,
    `NT${uniq(ten)}`,
    `nt-${uniq(ten).toLowerCase()}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES (?, ?, 'Nhóm NT', 1)`,
    sheetTypeId,
    uniq("PK"),
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
       VALUES (?, ?, 'Task NT', 1, 1, ?)`,
    packageId,
    uniq("TK"),
    status,
  );
  const dims: number[] = [];
  for (const nhan of ["D100", "D150"]) {
    dims.push(
      await insertId(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, ?, 1)`,
        taskId,
        nhan,
      ),
    );
  }
  // Ngày thực tế: task đã 100% nên actual_end_date phải có sẵn để AC4 kiểm nó không bị xoá.
  await run(`UPDATE tasks SET actual_end_date = '2026-01-01' WHERE id = ?`, taskId);

  const admin = await taoUser("admin", ten);
  await dangNhapDuAn(admin, projectId);
  return { projectId, towerId, sheetTypeId, packageId, taskId, dims, admin };
}

async function docTask(id: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{
    status: string | null;
    progress: number | null;
    name: string;
    actualEnd: string | null;
  }>(
    `SELECT status, progress_percent AS "progress", name, actual_end_date AS "actualEnd"
       FROM tasks WHERE id = ?`,
    id,
  );
}

async function demHistory(id: number): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM task_history WHERE task_id = ?`,
    id,
  );
  return r!.n;
}

async function demTick(dims: number[]): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM progress_dimensions WHERE id = ANY(?) AND installed = 1`,
    dims,
  );
  return r!.n;
}

/** Dọn sạch — `users` bị test khác DELETE toàn bộ, còn task/nhóm treo là vỡ FK. */
async function don(c: Ctx): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM assignment_log WHERE changed_by = ? OR new_user_id = ?`,
    c.admin.id,
    c.admin.id,
  );
  await run(`DELETE FROM task_history WHERE task_id = ?`, c.taskId);
  await run(`DELETE FROM notifications WHERE task_id = ? OR user_id = ?`, c.taskId, c.admin.id);
  await run(`DELETE FROM progress_dimensions WHERE task_id = ?`, c.taskId);
  await run(`DELETE FROM tasks WHERE id = ?`, c.taskId);
  await run(`DELETE FROM work_packages WHERE id = ?`, c.packageId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, c.sheetTypeId);
  await run(`DELETE FROM towers WHERE id = ?`, c.towerId);
  await run(`DELETE FROM user_projects WHERE project_id = ?`, c.projectId);
  await run(`DELETE FROM projects WHERE id = ?`, c.projectId);
  await run(`DELETE FROM users WHERE id = ?`, c.admin.id);
}

test.after(() => dangXuat());

// ============================================================================
// L1 — PATCH /api/tasks/:id, /api/tasks/batch, /api/tasks/:id/progress
// ============================================================================

test("AC1: PATCH /api/tasks/:id status=hoan_thanh trên task đã nghiệm thu → 409", S, async () => {
  const c = await dungTask("ac1", "nghiem_thu");
  try {
    const truoc = await demHistory(c.taskId);

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(jreq(`/api/tasks/${c.taskId}`, { status: "hoan_thanh" }), {
      params: Promise.resolve({ id: String(c.taskId) }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, LOI);

    const t = await docTask(c.taskId);
    assert.equal(t?.status, "nghiem_thu");
    assert.equal(await demHistory(c.taskId), truoc, "không được thêm dòng task_history");
  } finally {
    await don(c);
  }
});

test(
  "AC2: PATCH /api/tasks/:id đổi tên task đã nghiệm thu → 200, status giữ nguyên",
  S,
  async () => {
    const c = await dungTask("ac2", "nghiem_thu");
    try {
      const { PATCH } = await import("@/app/api/tasks/[id]/route");
      const res = await PATCH(jreq(`/api/tasks/${c.taskId}`, { name: "Tên mới" }), {
        params: Promise.resolve({ id: String(c.taskId) }),
      });
      assert.equal(res.status, 200);

      const t = await docTask(c.taskId);
      assert.equal(t?.name, "Tên mới");
      assert.equal(t?.status, "nghiem_thu");
    } finally {
      await don(c);
    }
  },
);

// Batch map MỌI lỗi nghiệp vụ về 422 (regex trong catch của app/api/tasks/batch/route.ts),
// nên ca này chốt 422 thay vì 409 — thông điệp lỗi vẫn là thông điệp chung ở trên.
test(
  "AC3: POST /api/tasks/batch đổi status task đã nghiệm thu → 422, DB không đổi",
  S,
  async () => {
    const c = await dungTask("ac3", "nghiem_thu");
    try {
      const { PATCH } = await import("@/app/api/tasks/batch/route");
      const res = await PATCH(
        jreq(`/api/tasks/batch`, {
          updates: [{ id: c.taskId, patch: { status: "dang_thi_cong" } }],
        }),
      );
      assert.equal(res.status, 422);
      assert.match((await res.json()).error, /đã nghiệm thu/);

      const t = await docTask(c.taskId);
      assert.equal(t?.status, "nghiem_thu");
    } finally {
      await don(c);
    }
  },
);

test(
  "AC4: PATCH progress 0.5 trên task đã nghiệm thu → 409, % và ngày thực tế giữ nguyên",
  S,
  async () => {
    const c = await dungTask("ac4", "nghiem_thu");
    try {
      const truoc = await demHistory(c.taskId);

      const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
      const res = await PATCH(jreq(`/api/tasks/${c.taskId}/progress`, { progress: 0.5 }), {
        params: Promise.resolve({ id: String(c.taskId) }),
      });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, LOI);

      const t = await docTask(c.taskId);
      assert.equal(t?.progress, 1);
      assert.equal(t?.status, "nghiem_thu");
      assert.equal(t?.actualEnd, "2026-01-01", "actual_end_date không được xoá");
      assert.equal(await demHistory(c.taskId), truoc);
    } finally {
      await don(c);
    }
  },
);

test("AC5: PATCH progress 1 trên task đã nghiệm thu → 200, idempotent", S, async () => {
  const c = await dungTask("ac5", "nghiem_thu");
  try {
    const truoc = await demHistory(c.taskId);

    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(jreq(`/api/tasks/${c.taskId}/progress`, { progress: 1 }), {
      params: Promise.resolve({ id: String(c.taskId) }),
    });
    assert.equal(res.status, 200);

    const t = await docTask(c.taskId);
    assert.equal(t?.progress, 1);
    assert.equal(t?.status, "nghiem_thu");
    assert.equal(await demHistory(c.taskId), truoc, "gửi lại cùng giá trị không thêm lịch sử");
  } finally {
    await don(c);
  }
});

// ============================================================================
// L2 — bỏ tick ô dimension của task đã nghiệm thu
// ============================================================================

test(
  "AC6: PATCH /api/dimensions/:id installed=false trên task đã nghiệm thu → 409",
  S,
  async () => {
    const c = await dungTask("ac6", "nghiem_thu");
    try {
      const { PATCH } = await import("@/app/api/dimensions/[id]/route");
      const res = await PATCH(jreq(`/api/dimensions/${c.dims[0]}`, { installed: false }), {
        params: Promise.resolve({ id: String(c.dims[0]) }),
      });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, LOI);

      assert.equal(await demTick(c.dims), 2, "cả 2 ô vẫn phải còn tick");
      const t = await docTask(c.taskId);
      assert.equal(t?.progress, 1);
      assert.equal(t?.status, "nghiem_thu");
    } finally {
      await don(c);
    }
  },
);

test(
  "AC7: PATCH /api/dimensions/batch installed=false chạm task đã nghiệm thu → 409 cả lô",
  S,
  async () => {
    const c = await dungTask("ac7", "nghiem_thu");
    try {
      const { PATCH } = await import("@/app/api/dimensions/batch/route");
      const res = await PATCH(jreq(`/api/dimensions/batch`, { ids: c.dims, installed: false }));
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, LOI);

      assert.equal(await demTick(c.dims), 2, "không ô nào được ghi");
      const t = await docTask(c.taskId);
      assert.equal(t?.progress, 1);
    } finally {
      await don(c);
    }
  },
);

// ============================================================================
// Đối chứng — không chặn nhầm task chưa/không còn nghiệm thu
// ============================================================================

test("AC8: task hoan_thanh (chưa nghiệm thu) → bỏ tick ô vẫn 200 và % giảm", S, async () => {
  const c = await dungTask("ac8", "hoan_thanh");
  try {
    const { PATCH } = await import("@/app/api/dimensions/[id]/route");
    const res = await PATCH(jreq(`/api/dimensions/${c.dims[0]}`, { installed: false }), {
      params: Promise.resolve({ id: String(c.dims[0]) }),
    });
    assert.equal(res.status, 200);

    const t = await docTask(c.taskId);
    assert.equal(t?.progress, 0.5);
    assert.notEqual(t?.status, "nghiem_thu");
  } finally {
    await don(c);
  }
});

test("AC9: sau DELETE /api/tasks/:id/approve → PATCH progress 0.5 được chấp nhận", S, async () => {
  const c = await dungTask("ac9", "nghiem_thu");
  try {
    const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
    const huy = await DELETE(jreq(`/api/tasks/${c.taskId}/approve`, undefined, "DELETE"), {
      params: Promise.resolve({ id: String(c.taskId) }),
    });
    assert.equal(huy.status, 200);

    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(jreq(`/api/tasks/${c.taskId}/progress`, { progress: 0.5 }), {
      params: Promise.resolve({ id: String(c.taskId) }),
    });
    assert.equal(res.status, 200);

    const t = await docTask(c.taskId);
    assert.equal(t?.progress, 0.5);
    assert.notEqual(t?.status, "nghiem_thu");
  } finally {
    await don(c);
  }
});

// ============================================================================
// Audit 2026-10-01 — các đường KHÁC còn phá bất biến nghiệm thu
// ============================================================================

async function demO(taskId: number): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM progress_dimensions WHERE task_id = ?`,
    taskId,
  );
  return r!.n;
}

const LOI_COT = /đã nghiệm thu.*huỷ nghiệm thu trước khi thêm cột/;

test(
  "AC10: POST /api/workpackages/:id/dimensions/column trên nhóm có task đã nghiệm thu → 409, không ghi gì",
  S,
  async () => {
    // Trước đây cột mới (ô chưa tick) được thêm vào task đã nghiệm thu: % tụt về 2/3 trong khi
    // status vẫn nghiem_thu, actual_end_date bị xoá — cùng lớp lỗi L1/L2.
    const c = await dungTask("ac10", "nghiem_thu");
    try {
      const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
      const res = await POST(jreq(`/x`, { label: "D200", afterLabel: "D100" }, "POST"), {
        params: Promise.resolve({ id: String(c.packageId) }),
      });
      assert.equal(res.status, 409);
      assert.match((await res.json()).error, LOI_COT);

      assert.equal(await demO(c.taskId), 2, "không tạo ô mới");
      const t = await docTask(c.taskId);
      assert.equal(t?.progress, 1);
      assert.equal(t?.status, "nghiem_thu");
      assert.equal(t?.actualEnd, "2026-01-01");
    } finally {
      await don(c);
    }
  },
);

test(
  "AC11: PATCH /api/workpackages/:id/dimensions/column (copy cột) trên task đã nghiệm thu → 409",
  S,
  async () => {
    const c = await dungTask("ac11", "nghiem_thu");
    try {
      const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
      const res = await PATCH(
        jreq(`/x`, { action: "copy", label: "D100", newLabel: "D100-copy" }),
        { params: Promise.resolve({ id: String(c.packageId) }) },
      );
      assert.equal(res.status, 409);
      assert.match((await res.json()).error, LOI_COT);
      assert.equal(await demO(c.taskId), 2);
      assert.equal((await docTask(c.taskId))?.progress, 1);
    } finally {
      await don(c);
    }
  },
);

test(
  "AC12: đối chứng — thêm cột vào task hoan_thanh (chưa nghiệm thu) vẫn 201, % giảm",
  S,
  async () => {
    const c = await dungTask("ac12", "hoan_thanh");
    try {
      const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
      const res = await POST(jreq(`/x`, { label: "D200" }, "POST"), {
        params: Promise.resolve({ id: String(c.packageId) }),
      });
      assert.equal(res.status, 201);
      assert.equal(await demO(c.taskId), 3);
      const t = await docTask(c.taskId);
      assert.equal(t?.progress, 0.67);
      assert.equal(t?.status, "dang_thi_cong");
    } finally {
      await don(c);
    }
  },
);

test(
  "AC13: duyệt tầng không ghi đè task đã nghiệm thu RIÊNG LẺ — huỷ tầng không hạ task đó",
  S,
  async () => {
    // Trước đây POST /api/approvals đặt approval_source='floor' cho MỌI task trong tầng, kể cả
    // task đã duyệt riêng qua /api/tasks/:id/approve → huỷ nghiệm thu tầng hạ luôn task đó
    // (đúng lỗi cột approval_source — migration 0151 — sinh ra để chặn), kèm 1 dòng
    // task_history "nghiệm thu" thừa.
    const { insertId, run, queryOne } = await import("@/lib/db");
    const c = await dungTask("ac13", "hoan_thanh");
    await run(`UPDATE work_packages SET floor_label = 'T13' WHERE id = ?`, c.packageId);
    const taskTang = await insertId(
      `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
         VALUES (?, ?, 'Task tầng', 2, 1, 'hoan_thanh')`,
      c.packageId,
      uniq("TK"),
    );
    let approvalId: number | null = null;
    try {
      const { POST: DUYET_TASK } = await import("@/app/api/tasks/[id]/approve/route");
      const r1 = await DUYET_TASK(jreq(`/x`, {}, "POST"), {
        params: Promise.resolve({ id: String(c.taskId) }),
      });
      assert.equal(r1.status, 200);
      const lichSuSauDuyetRieng = await demHistory(c.taskId);

      const { POST: DUYET_TANG } = await import("@/app/api/approvals/route");
      const r2 = await DUYET_TANG(
        jreq(`/x`, { sheetTypeId: c.sheetTypeId, floorLabel: "T13" }, "POST"),
      );
      assert.equal(r2.status, 200);
      const j2 = await r2.json();
      approvalId = j2.approvalId;
      assert.equal(j2.taskCount, 1, "chỉ task CHƯA nghiệm thu được duyệt theo tầng");
      assert.equal(await demHistory(c.taskId), lichSuSauDuyetRieng, "không thêm audit trùng");
      const src = (id: number) =>
        queryOne<{ status: string; src: string | null }>(
          `SELECT status, approval_source AS "src" FROM tasks WHERE id = ?`,
          id,
        );
      assert.equal((await src(c.taskId))?.src, "task");
      assert.equal((await src(taskTang))?.src, "floor");

      const { DELETE: HUY_TANG } = await import("@/app/api/floor-approvals/[id]/route");
      const r3 = await HUY_TANG(jreq(`/x`, undefined, "DELETE"), {
        params: Promise.resolve({ id: String(approvalId) }),
      });
      assert.equal(r3.status, 200);
      assert.equal((await src(c.taskId))?.status, "nghiem_thu", "task duyệt riêng giữ nguyên");
      assert.equal((await src(taskTang))?.status, "hoan_thanh", "task duyệt theo tầng bị hạ");
    } finally {
      await run(`DELETE FROM floor_approvals WHERE sheet_type_id = ?`, c.sheetTypeId);
      await run(`DELETE FROM task_history WHERE task_id = ?`, taskTang);
      await run(`DELETE FROM tasks WHERE id = ?`, taskTang);
      await don(c);
    }
  },
);

test("AC14: PATCH progress null → 400, không âm thầm hạ tiến độ về 0%", S, async () => {
  // Number(null) = 0: trước đây body { progress: null } được hiểu là "đặt 0%".
  const c = await dungTask("ac14", "hoan_thanh");
  try {
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    for (const progress of [null, "", false]) {
      const res = await PATCH(jreq(`/x`, { progress }), {
        params: Promise.resolve({ id: String(c.taskId) }),
      });
      assert.equal(res.status, 400, `progress=${JSON.stringify(progress)}`);
    }
    assert.equal((await docTask(c.taskId))?.progress, 1);
  } finally {
    await don(c);
  }
});
