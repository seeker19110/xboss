import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TIẾN ĐỘ & NGHIỆM THU — cùng khuôn với
// tests/route-baselines.test.ts. Đây là vùng rủi ro cao (docs/audit.md): tick checkbox
// → recomputeTask → deriveStatus, nghiệm thu 2 bước, RBAC theo vai trò + canTouchTask.
// Route:
//   - app/api/tasks/[id]/route.ts            (PATCH task)
//   - app/api/tasks/[id]/approve/route.ts    (POST/DELETE nghiệm thu 2 bước)
//   - app/api/tasks/[id]/progress/route.ts   (PATCH % thủ công)
//   - app/api/dimensions/[id]/route.ts       (PATCH tick 1 ô)
//   - app/api/dimensions/batch/route.ts      (PATCH tick theo lô)
//   - app/api/approvals/route.ts             (GET/POST duyệt theo lô — cả tầng)

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

type Ctx = {
  userId: number;
  pwHash: string;
  projectId: number;
  taskId: number;
  packageId: number;
  sheetTypeId: number;
};

/** Dựng dự án + tháp + sheet + nhóm + task + user với vai trò cho trước.
 *  `progress` (mặc định 0.4) và `floorLabel` (mặc định null) tuỳ biến theo ca test. */
async function dungDuLieu(
  role: string,
  ten: string,
  opts: { progress?: number; floorLabel?: string | null; assignedTo?: number | null } = {},
): Promise<Ctx> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `TD route ${ten}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp TD')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet TD')`,
    towerId,
    `TDR${ten}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'T1', 'Nhóm TD', ?)`,
    stId,
    opts.floorLabel ?? null,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, assigned_to)
     VALUES (?, 'T1,01', 'Task TD', ?, ?)`,
    pkgId,
    opts.progress ?? 0.4,
    opts.assignedTo ?? null,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tiendo-route', ?, 1)`,
    `TD ${ten}`,
    `td-${ten}-${RUN}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return {
    userId,
    pwHash: u!.password_hash,
    projectId,
    taskId,
    packageId: pkgId,
    sheetTypeId: stId,
  };
}

/** Thêm `n` ô dimension cho task, trả về danh sách id theo thứ tự tạo. */
async function themDimensions(taskId: number, n: number): Promise<number[]> {
  const { insertId } = await import("@/lib/db");
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(
      await insertId(
        `INSERT INTO progress_dimensions (task_id, dimension_label) VALUES (?, ?)`,
        taskId,
        `D${i}`,
      ),
    );
  }
  return ids;
}

const req = (url: string, body?: unknown, method = "PATCH") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ---------------------------------------------------------------------------------------
// PATCH /api/tasks/:id
// ---------------------------------------------------------------------------------------

test("PATCH /api/tasks/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req("/api/tasks/1", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/tasks/:id: vai trò engineer không được sửa cấu trúc task → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `eng${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { name: "Đổi tên" }), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 403);
});

test(
  "PATCH /api/tasks/:id: đặt status=nghiem_thu qua route thường → 422 (bắt buộc qua /approve)",
  S,
  async () => {
    // Bất biến: nghiệm thu CHỈ đặt được qua POST /api/tasks/:id/approve (có audit +
    // kiểm 100%) — PATCH task thường phải chặn cứng dù caller đúng vai trò Admin/PM.
    const ctx = await dungDuLieu("pm", `nt${RUN}`);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { status: "nghiem_thu" }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /approve/);
  },
);

test("PATCH /api/tasks/:id: status không nằm trong danh sách hợp lệ → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `badst${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { status: "linh_tinh" }), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/:id: ngày sai định dạng → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `badday${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { startDate: "01/01/2026" }), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/:id: tên rỗng → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `emptyname${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { name: "   " }), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/tasks/:id: link bản vẽ không phải http/https → 422 (chặn javascript: XSS)",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `xss${RUN}`);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      req(`/api/tasks/${ctx.taskId}`, { drawingUrl: "javascript:alert(1)" }),
      { params: Promise.resolve({ id: String(ctx.taskId) }) },
    );
    assert.equal(res.status, 422);
  },
);

test("PATCH /api/tasks/:id: link bản vẽ http hợp lệ → 200, lưu đúng URL", S, async () => {
  const ctx = await dungDuLieu("pm", `okurl${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(
    req(`/api/tasks/${ctx.taskId}`, { drawingUrl: "https://example.com/a.pdf" }),
    { params: Promise.resolve({ id: String(ctx.taskId) }) },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).task.drawingUrl, "https://example.com/a.pdf");
});

test("PATCH /api/tasks/:id: mã BOQ trùng với task khác → 409", S, async () => {
  const ctx = await dungDuLieu("pm", `boqdup${RUN}`);
  const { run } = await import("@/lib/db");
  await run(`UPDATE tasks SET boq_code = ? WHERE id = ?`, `BOQ-${RUN}`, ctx.taskId);
  // Task thứ 2 cùng dự án để thử gán trùng mã.
  const { insertId } = await import("@/lib/db");
  const taskId2 = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, 'T1,02', 'Task 2')`,
    ctx.packageId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/${taskId2}`, { boqCode: `BOQ-${RUN}` }), {
    params: Promise.resolve({ id: String(taskId2) }),
  });
  assert.equal(res.status, 409);
});

test("PATCH /api/tasks/:id: không có trường nào để cập nhật → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `nofield${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, {}), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/tasks/:id: chỉ đổi assignedTo (rẽ nhánh không UPDATE cột thường) → 200",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `assign${RUN}`);
    const { insertId } = await import("@/lib/db");
    const nguoiDuocGan = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Nguoi Duoc Gan', ?, 'x', 'engineer', 1)`,
      `gan-${RUN}@test.local`,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { assignedTo: nguoiDuocGan }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 200);
  },
);

test(
  "PATCH /api/tasks/:id: đổi status thủ công không khớp % hiện có (hoàn thành khi progress<100%) → 422",
  S,
  async () => {
    // Bất biến statusConsistentWithProgress: route KHÔNG sửa progress_percent nên đổi
    // status='hoan_thanh' thủ công khi % còn dở phải bị chặn — nếu không, dashboard đếm
    // "hoàn thành" sai số so với % thật.
    const ctx = await dungDuLieu("pm", `mismatch${RUN}`, { progress: 0.5 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { status: "hoan_thanh" }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "PATCH /api/tasks/:id: đổi status hợp lệ (dang_thi_cong) ghi vào task_history",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `histst${RUN}`, { progress: 0.5 });
    const { run } = await import("@/lib/db");
    await run(`UPDATE tasks SET status = 'chuan_bi' WHERE id = ?`, ctx.taskId);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { status: "dang_thi_cong" }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const h = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM task_history WHERE task_id = ? AND note = 'Đổi trạng thái thủ công'`,
      ctx.taskId,
    );
    assert.equal(h!.count, 1);
  },
);

test(
  "PATCH /api/tasks/:id: đổi endDate → gọi recomputeTask, có thể chuyển sang 'tre'",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `deadline${RUN}`, { progress: 0.5 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { endDate: "2000-01-01" }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).task.status, "tre");
  },
);

test("PATCH /api/tasks/:id: task không tồn tại → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `notfound${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/999999999`, { name: "x" }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/tasks/:id: ID không hợp lệ → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `badid${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  const res = await PATCH(req(`/api/tasks/abc`, { name: "x" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/tasks/:id: trường custom tuỳ biến hợp lệ merge shallow vào cột custom",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `custom${RUN}`);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}`, { custom: { hang_muc: "ống nước" } }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    // Không có custom field nào được định nghĩa cho dự án này nên validateCustom có thể
    // từ chối hoặc chấp nhận rỗng tuỳ cấu hình — chỉ cần route KHÔNG lỗi 500 khi field lạ.
    assert.ok([200, 400, 422].includes(res.status));
  },
);

test("DELETE /api/tasks/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/tasks/[id]/route");
  const res = await DELETE(req("/api/tasks/1", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/tasks/:id: engineer không được xoá task → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `delteng${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/route");
  const res = await DELETE(req(`/api/tasks/${ctx.taskId}`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/tasks/:id: ID không hợp lệ → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `deltbadid${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/route");
  const res = await DELETE(req(`/api/tasks/abc`, undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/tasks/:id: task không tồn tại → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `deltnf${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/route");
  const res = await DELETE(req(`/api/tasks/999999993`, undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999993" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/tasks/:id: xoá task xoá sạch dữ liệu liên quan (dimension, history...) trong 1 transaction",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `deltok${RUN}`);
    await themDimensions(ctx.taskId, 2);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(req(`/api/tasks/${ctx.taskId}`, undefined, "DELETE"), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).deleted, ctx.taskId);
    const { queryOne } = await import("@/lib/db");
    const t = await queryOne(`SELECT id FROM tasks WHERE id = ?`, ctx.taskId);
    assert.equal(t, undefined);
    const dims = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM progress_dimensions WHERE task_id = ?`,
      ctx.taskId,
    );
    assert.equal(dims!.count, 0);
  },
);

// ---------------------------------------------------------------------------------------
// POST /api/tasks/:id/approve  &  DELETE /api/tasks/:id/approve
// ---------------------------------------------------------------------------------------

test("POST /api/tasks/:id/approve: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(req("/api/tasks/1/approve", {}, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/tasks/:id/approve: engineer không được duyệt nghiệm thu → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `appreng${RUN}`, { progress: 1 });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(req(`/api/tasks/${ctx.taskId}/approve`, {}, "POST"), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 403);
});

test(
  "POST /api/tasks/:id/approve: task chưa đạt 100% thì không nghiệm thu được → 422",
  S,
  async () => {
    // Bất biến lõi của nghiệm thu 2 bước: KHÔNG một vai trò nào (kể cả Admin/PM) được
    // đặt nghiem_thu khi tiến độ thi công thật còn dở — đây là chốt chặn quan trọng nhất
    // của toàn hệ thống nghiệm thu.
    const ctx = await dungDuLieu("pm", `chua100${RUN}`, { progress: 0.9 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    const res = await POST(req(`/api/tasks/${ctx.taskId}/approve`, {}, "POST"), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /100%/);
  },
);

test(
  "POST /api/tasks/:id/approve: đạt 100% → PM nghiệm thu được, ghi task_history",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `du100${RUN}`, { progress: 1 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/tasks/[id]/approve/route");
    const res = await POST(req(`/api/tasks/${ctx.taskId}/approve`, {}, "POST"), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "nghiem_thu");
    const { queryOne } = await import("@/lib/db");
    const t = await queryOne<{ status: string }>(
      `SELECT status FROM tasks WHERE id = ?`,
      ctx.taskId,
    );
    assert.equal(t!.status, "nghiem_thu");
    const h = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM task_history WHERE task_id = ? AND status = 'nghiem_thu'`,
      ctx.taskId,
    );
    assert.equal(h!.count, 1);
  },
);

test("POST /api/tasks/:id/approve: task đã nghiệm thu rồi → 409 (không duyệt lại)", S, async () => {
  const ctx = await dungDuLieu("pm", `dupapprove${RUN}`, { progress: 1 });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const p1 = { params: Promise.resolve({ id: String(ctx.taskId) }) };
  assert.equal((await POST(req(`/api/tasks/${ctx.taskId}/approve`, {}, "POST"), p1)).status, 200);
  const res2 = await POST(req(`/api/tasks/${ctx.taskId}/approve`, {}, "POST"), p1);
  assert.equal(res2.status, 409);
});

test("POST /api/tasks/:id/approve: task không tồn tại → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `apnf${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(req(`/api/tasks/999999998/approve`, {}, "POST"), {
    params: Promise.resolve({ id: "999999998" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tasks/:id/approve: ID không hợp lệ → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `apbadid${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(req(`/api/tasks/abc/approve`, {}, "POST"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/tasks/:id/approve: decision=reject không có yêu cầu chờ → 409", S, async () => {
  const ctx = await dungDuLieu("pm", `reject${RUN}`, { progress: 1 });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(
    req(`/api/tasks/${ctx.taskId}/approve`, { decision: "reject", note: "sai" }, "POST"),
    { params: Promise.resolve({ id: String(ctx.taskId) }) },
  );
  assert.equal(res.status, 409);
});

test("POST /api/tasks/:id/approve: decision=reject thiếu note → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `rejectnote${RUN}`, { progress: 1 });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await POST(req(`/api/tasks/${ctx.taskId}/approve`, { decision: "reject" }, "POST"), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 422);
});

test("DELETE /api/tasks/:id/approve: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await DELETE(req("/api/tasks/1/approve", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/tasks/:id/approve: engineer không được huỷ nghiệm thu → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `delappreng${RUN}`, { progress: 1 });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await DELETE(req(`/api/tasks/${ctx.taskId}/approve`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/tasks/:id/approve: task chưa nghiệm thu → 409", S, async () => {
  const ctx = await dungDuLieu("pm", `delnotap${RUN}`, { progress: 0.5 });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await DELETE(req(`/api/tasks/${ctx.taskId}/approve`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 409);
});

test(
  "DELETE /api/tasks/:id/approve: huỷ nghiệm thu → status suy lại từ progress (không giữ nghiem_thu)",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `delok${RUN}`, { progress: 1 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST, DELETE } = await import("@/app/api/tasks/[id]/approve/route");
    const p = { params: Promise.resolve({ id: String(ctx.taskId) }) };
    assert.equal((await POST(req(`/api/tasks/${ctx.taskId}/approve`, {}, "POST"), p)).status, 200);
    const res = await DELETE(req(`/api/tasks/${ctx.taskId}/approve`, undefined, "DELETE"), p);
    assert.equal(res.status, 200);
    // progress vẫn = 1 nên deriveStatus(1, ..., null) = hoan_thanh, KHÔNG còn nghiem_thu.
    assert.equal((await res.json()).status, "hoan_thanh");
  },
);

test("DELETE /api/tasks/:id/approve: task không tồn tại → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `delnf${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await DELETE(req(`/api/tasks/999999997/approve`, undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999997" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/tasks/:id/approve: ID không hợp lệ → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `delbadid${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
  const res = await DELETE(req(`/api/tasks/abc/approve`, undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------------------
// PATCH /api/tasks/:id/progress
// ---------------------------------------------------------------------------------------

test("PATCH /api/tasks/:id/progress: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(req("/api/tasks/1/progress", { progress: 0.5 }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/tasks/:id/progress: vai trò chỉ-xem (viewer) không được sửa tiến độ → 403",
  S,
  async () => {
    const ctx = await dungDuLieu("viewer", `viewerprog${RUN}`);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, { progress: 0.5 }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 403);
  },
);

test(
  "PATCH /api/tasks/:id/progress: subcon không được giao task → 403 (canTouchTask)",
  S,
  async () => {
    const ctx = await dungDuLieu("subcon", `subconkhac${RUN}`); // task KHÔNG gán cho subcon này
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, { progress: 0.5 }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/tasks/:id/progress: subcon được giao task → cập nhật được", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `giaoowner${RUN}`);
  const subconId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Subcon giao', ?, 'hash-test-tiendo-route', 'subcon', 1)`,
    `subcon-giao-${RUN}@test.local`,
  );
  await (
    await import("@/lib/db")
  ).run(`UPDATE tasks SET assigned_to = ? WHERE id = ?`, subconId, ctx.taskId);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    subconId,
  );
  dangNhap({ id: subconId, passwordHash: u!.password_hash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, { progress: 0.7 }), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).progressPercent, 0.7);
});

test("PATCH /api/tasks/:id/progress: thiếu progress → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `noprog${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, {}), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/tasks/:id/progress: progress ngoài khoảng bị ghim về [0,1]", S, async () => {
  const ctx = await dungDuLieu("pm", `clamp${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, { progress: 5 }), {
    params: Promise.resolve({ id: String(ctx.taskId) }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).progressPercent, 1);
});

test(
  "PATCH /api/tasks/:id/progress: client gửi status=nghiem_thu → 422 (chỉ /approve mới nghiệm thu được)",
  S,
  async () => {
    // Chốt chặn thứ 2 của cùng bất biến: nếu route progress cho qua status='nghiem_thu'
    // thì subcon/engineer (được phép sửa tiến độ) sẽ tự nghiệm thu được, bỏ qua toàn bộ
    // gate CAN.approve + kiểm 100% + audit riêng của /approve.
    const ctx = await dungDuLieu("engineer", `progappr${RUN}`, { progress: 1 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(
      req(`/api/tasks/${ctx.taskId}/progress`, { progress: 1, status: "nghiem_thu" }),
      { params: Promise.resolve({ id: String(ctx.taskId) }) },
    );
    assert.equal(res.status, 422);
  },
);

test(
  "PATCH /api/tasks/:id/progress: status client gửi không khớp % (progress=1 nhưng status khác hoàn thành) → 422",
  S,
  async () => {
    const ctx = await dungDuLieu("engineer", `progmismatch${RUN}`);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(
      req(`/api/tasks/${ctx.taskId}/progress`, { progress: 1, status: "dang_thi_cong" }),
      { params: Promise.resolve({ id: String(ctx.taskId) }) },
    );
    assert.equal(res.status, 422);
  },
);

test("PATCH /api/tasks/:id/progress: task không tồn tại → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `prognf${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
  const res = await PATCH(req(`/api/tasks/999999996/progress`, { progress: 0.5 }), {
    params: Promise.resolve({ id: "999999996" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/tasks/:id/progress: progress=1 → status tự suy 'hoan_thanh' và ghi actual_end_date",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `full${RUN}`, { progress: 0.5 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const res = await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, { progress: 1 }), {
      params: Promise.resolve({ id: String(ctx.taskId) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "hoan_thanh");
    const { queryOne } = await import("@/lib/db");
    const t = await queryOne<{ actual_end_date: string | null }>(
      `SELECT actual_end_date FROM tasks WHERE id = ?`,
      ctx.taskId,
    );
    assert.ok(t!.actual_end_date, "actual_end_date phải được đặt khi progress đạt 100%");
  },
);

test(
  "PATCH /api/tasks/:id/progress: gửi lại đúng % cũ (double-submit/offline retry) → không nhân bản task_history",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `dup${RUN}`, { progress: 0.4 });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
    const p = { params: Promise.resolve({ id: String(ctx.taskId) }) };
    await PATCH(req(`/api/tasks/${ctx.taskId}/progress`, { progress: 0.4 }), p);
    const { queryOne } = await import("@/lib/db");
    const h = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM task_history WHERE task_id = ?`,
      ctx.taskId,
    );
    assert.equal(h!.count, 0, "% không đổi thì không ghi thêm dòng lịch sử");
  },
);

// ---------------------------------------------------------------------------------------
// PATCH /api/dimensions/:id
// ---------------------------------------------------------------------------------------

test("PATCH /api/dimensions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(req("/api/dimensions/1", { installed: true }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/dimensions/:id: vai trò chỉ-xem (bch) không được tick → 403", S, async () => {
  const ctx = await dungDuLieu("bch", `bchdim${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(req(`/api/dimensions/1`, { installed: true }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/dimensions/:id: dimension không tồn tại → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `dimnf${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(req(`/api/dimensions/999999995`, { installed: true }), {
    params: Promise.resolve({ id: "999999995" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/dimensions/:id: ghi chú quá dài → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `notelen${RUN}`);
  const [dimId] = await themDimensions(ctx.taskId, 1);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(
    req(`/api/dimensions/${dimId}`, { installed: true, note: "x".repeat(501) }),
    { params: Promise.resolve({ id: String(dimId) }) },
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/dimensions/:id: subcon không được giao task chứa ô này → 403", S, async () => {
  const ctx = await dungDuLieu("subcon", `dimsubkhac${RUN}`);
  const [dimId] = await themDimensions(ctx.taskId, 1);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  const res = await PATCH(req(`/api/dimensions/${dimId}`, { installed: true }), {
    params: Promise.resolve({ id: String(dimId) }),
  });
  assert.equal(res.status, 403);
});

test(
  "PATCH /api/dimensions/:id: tick 1/2 ô → % task = 0.5, KHÔNG bao giờ = 1 khi còn ô chưa tick",
  S,
  async () => {
    // Bất biến progressFromChecks: chỉ = 1 (100%) khi TẤT CẢ ô đã tick — ghim trần 0.99
    // cho mọi ca chưa đủ, tránh mở khoá nghiệm thu sai khi làm tròn 199/200 lên 1.00.
    const ctx = await dungDuLieu("pm", `half${RUN}`, { progress: 0 });
    const [d1] = await themDimensions(ctx.taskId, 2);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/dimensions/[id]/route");
    const res = await PATCH(req(`/api/dimensions/${d1}`, { installed: true, note: "ghi chú" }), {
      params: Promise.resolve({ id: String(d1) }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.task.progress, 0.5);
    assert.notEqual(json.task.status, "hoan_thanh");
  },
);

test(
  "PATCH /api/dimensions/:id: tick hết toàn bộ ô → % task = 1 và status = 'hoan_thanh'",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `allticked${RUN}`, { progress: 0 });
    const [d1] = await themDimensions(ctx.taskId, 1);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/dimensions/[id]/route");
    const res = await PATCH(req(`/api/dimensions/${d1}`, { installed: true }), {
      params: Promise.resolve({ id: String(d1) }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.task.progress, 1);
    assert.equal(json.task.status, "hoan_thanh");
  },
);

test(
  "PATCH /api/dimensions/:id: bỏ tick → xoá cả ghi chú (bất biến installed=0 ⇒ note/installed_at/by đều NULL)",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `untick${RUN}`, { progress: 0 });
    const [d1] = await themDimensions(ctx.taskId, 1);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/dimensions/[id]/route");
    const p = { params: Promise.resolve({ id: String(d1) }) };
    await PATCH(req(`/api/dimensions/${d1}`, { installed: true, note: "sẽ bị xoá" }), p);
    const res = await PATCH(req(`/api/dimensions/${d1}`, { installed: false }), p);
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const dim = await queryOne<{ note: string | null; installed_at: string | null }>(
      `SELECT note, installed_at FROM progress_dimensions WHERE id = ?`,
      d1,
    );
    assert.equal(dim!.note, null);
    assert.equal(dim!.installed_at, null);
  },
);

// ---------------------------------------------------------------------------------------
// PATCH /api/dimensions/batch
// ---------------------------------------------------------------------------------------

test("PATCH /api/dimensions/batch: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(req("/api/dimensions/batch", { ids: [1], installed: true }));
  assert.equal(res.status, 401);
});

test("PATCH /api/dimensions/batch: vai trò chỉ-xem (cdt) không được tick → 403", S, async () => {
  const ctx = await dungDuLieu("cdt", `cdtbatch${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(req("/api/dimensions/batch", { ids: [1], installed: true }));
  assert.equal(res.status, 403);
});

test("PATCH /api/dimensions/batch: thiếu ids → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `nobatch${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(req("/api/dimensions/batch", { ids: [], installed: true }));
  assert.equal(res.status, 400);
});

test("PATCH /api/dimensions/batch: quá 1000 ô mỗi lần → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `toomany${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
  const res = await PATCH(req("/api/dimensions/batch", { ids, installed: true }));
  assert.equal(res.status, 422);
});

test("PATCH /api/dimensions/batch: không tìm thấy dimension nào → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `nonefound${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(req("/api/dimensions/batch", { ids: [999999994], installed: true }));
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/dimensions/batch: subcon không được giao 1 trong các task liên quan → 403",
  S,
  async () => {
    const ctx = await dungDuLieu("subcon", `batchsubkhac${RUN}`);
    const dimIds = await themDimensions(ctx.taskId, 2);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/dimensions/batch/route");
    const res = await PATCH(req("/api/dimensions/batch", { ids: dimIds, installed: true }));
    assert.equal(res.status, 403);
  },
);

test(
  "PATCH /api/dimensions/batch: tick nguyên tử theo lô, recompute gộp 1 lần mỗi task",
  S,
  async () => {
    // Bất biến "nguyên tử + gộp recompute 1 lần mỗi task": tick cả 3 ô cùng lúc phải cho
    // % task = 1 ngay sau 1 lệnh PATCH — không có trạng thái nửa vời giữa chừng quan sát
    // được từ bên ngoài (mọi ghi đều trong 1 transaction).
    const ctx = await dungDuLieu("pm", `atomic${RUN}`, { progress: 0 });
    const dimIds = await themDimensions(ctx.taskId, 3);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/dimensions/batch/route");
    const res = await PATCH(req("/api/dimensions/batch", { ids: dimIds, installed: true }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.updated, 3);
    const { queryOne } = await import("@/lib/db");
    const t = await queryOne<{ progress_percent: number; status: string }>(
      `SELECT progress_percent, status FROM tasks WHERE id = ?`,
      ctx.taskId,
    );
    assert.equal(t!.progress_percent, 1);
    assert.equal(t!.status, "hoan_thanh");
    // Chỉ đúng 1 dòng lịch sử được ghi (không phải 3 — mỗi tick 1 dòng nếu recompute
    // không gộp), vì % chỉ thực sự đổi 1 lần (0 → 1) trong toàn bộ giao dịch batch.
    const h = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM task_history WHERE task_id = ?`,
      ctx.taskId,
    );
    assert.equal(h!.count, 1);
  },
);

test("PATCH /api/dimensions/batch: id trùng lặp trong body chỉ tính 1 lần (dedup)", S, async () => {
  const ctx = await dungDuLieu("pm", `dedupbatch${RUN}`, { progress: 0 });
  const [d1] = await themDimensions(ctx.taskId, 1);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  const res = await PATCH(req("/api/dimensions/batch", { ids: [d1, d1, d1], installed: true }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).updated, 1);
});

// ---------------------------------------------------------------------------------------
// GET/POST /api/approvals — duyệt nghiệm thu theo lô (cả tầng)
// ---------------------------------------------------------------------------------------

test("GET /api/approvals: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/approvals/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/approvals: liệt kê tầng chờ duyệt, canApprove theo vai trò", S, async () => {
  const ctx = await dungDuLieu("engineer", `getappr${RUN}`, { progress: 1, floorLabel: "T5" });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { GET } = await import("@/app/api/approvals/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.canApprove, false, "engineer không được duyệt nghiệm thu");
  assert.ok(json.pending.some((g: { floorLabel: string }) => g.floorLabel === "T5"));
});

test("POST /api/approvals: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/approvals/route");
  const res = await POST(req("/api/approvals", { sheetTypeId: 1, floorLabel: "T5" }, "POST"));
  assert.equal(res.status, 401);
});

test("POST /api/approvals: engineer không được duyệt nghiệm thu theo lô → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `postappreng${RUN}`, { progress: 1, floorLabel: "T5" });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/approvals/route");
  const res = await POST(
    req("/api/approvals", { sheetTypeId: ctx.sheetTypeId, floorLabel: "T5" }, "POST"),
  );
  assert.equal(res.status, 403);
});

test("POST /api/approvals: thiếu sheetTypeId/floorLabel → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `postmissing${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/approvals/route");
  const res = await POST(req("/api/approvals", { sheetTypeId: null, floorLabel: "" }, "POST"));
  assert.equal(res.status, 400);
});

test("POST /api/approvals: tầng không có task nào → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `emptyfloor${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/approvals/route");
  const res = await POST(
    req(
      "/api/approvals",
      { sheetTypeId: ctx.sheetTypeId, floorLabel: "TANG-KHONG-TON-TAI" },
      "POST",
    ),
  );
  assert.equal(res.status, 404);
});

test(
  "POST /api/approvals: còn task chưa đạt 100% trong tầng → 422, không nghiệm thu cả tầng",
  S,
  async () => {
    // Bất biến duyệt theo lô: 1 task dở dang cũng đủ chặn TOÀN BỘ tầng — không được
    // nghiệm thu "gần đủ", tránh lọt task chưa xong vào trạng thái nghiem_thu.
    const ctx = await dungDuLieu("pm", `floorpartial${RUN}`, { progress: 0.5, floorLabel: "T9" });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/approvals/route");
    const res = await POST(
      req("/api/approvals", { sheetTypeId: ctx.sheetTypeId, floorLabel: "T9" }, "POST"),
    );
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/approvals: mọi task trong tầng đạt 100% → PM duyệt cả tầng, mọi task chuyển nghiem_thu",
  S,
  async () => {
    const ctx = await dungDuLieu("pm", `floorok${RUN}`, { progress: 1, floorLabel: "T10" });
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/approvals/route");
    const res = await POST(
      req("/api/approvals", { sheetTypeId: ctx.sheetTypeId, floorLabel: "T10" }, "POST"),
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.taskCount, 1);
    const { queryOne } = await import("@/lib/db");
    const t = await queryOne<{ status: string }>(
      `SELECT status FROM tasks WHERE id = ?`,
      ctx.taskId,
    );
    assert.equal(t!.status, "nghiem_thu");
  },
);

test("POST /api/approvals: tầng đã nghiệm thu rồi → 409 (không duyệt lại)", S, async () => {
  const ctx = await dungDuLieu("pm", `floordup${RUN}`, { progress: 1, floorLabel: "T11" });
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/approvals/route");
  const body = { sheetTypeId: ctx.sheetTypeId, floorLabel: "T11" };
  assert.equal((await POST(req("/api/approvals", body, "POST"))).status, 200);
  const res2 = await POST(req("/api/approvals", body, "POST"));
  assert.equal(res2.status, 409);
});
