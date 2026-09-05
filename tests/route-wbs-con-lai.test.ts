import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm WORK PACKAGE / TASK (move, copy, comments,
// delay-reason, history) và SYSTEMS — còn CHƯA có test (đã grep tests/*.ts trước khi viết:
// tests/route-tien-do.test.ts chỉ phủ tasks/[id] PATCH/DELETE, approve, progress,
// dimensions/[id], dimensions/batch, approvals). Cùng khuôn với tests/route-tai-chinh.test.ts.
// Route:
//   - app/api/workpackages/route.ts              (POST tạo nhóm)
//   - app/api/workpackages/[id]/route.ts         (PATCH/DELETE nhóm)
//   - app/api/workpackages/[id]/move/route.ts    (PATCH đổi thứ tự nhóm)
//   - app/api/workpackages/[id]/copy/route.ts    (POST copy nhóm)
//   - app/api/tasks/[id]/move/route.ts           (PATCH đổi thứ tự task)
//   - app/api/tasks/[id]/copy/route.ts           (POST copy task)
//   - app/api/tasks/[id]/comments/route.ts       (GET/POST bình luận)
//   - app/api/tasks/[id]/delay-reason/route.ts   (POST gán nguyên nhân trễ)
//   - app/api/tasks/[id]/history/route.ts        (GET lịch sử, CHỈ ĐỌC)
//   - app/api/systems/route.ts                   (GET danh mục hệ)

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

/** Dựng dự án + tháp + sheet — dùng chung cho các ca cần cấu trúc WBS trống. */
async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES (?)`,
    `WBS route ${uniq(ten)}`,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp WBS')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet WBS')`,
    towerId,
    `WBS${uniq(ten)}`,
  );
  return { projectId, towerId, sheetTypeId };
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
    overrides.sortOrder ?? 0,
    overrides.assignedTo ?? null,
  );
}

async function taoTask(
  packageId: number,
  code: string,
  overrides: { sortOrder?: number; assignedTo?: number | null; progress?: number } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, assigned_to, progress_percent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    packageId,
    code,
    `Task ${code}`,
    overrides.sortOrder ?? 0,
    overrides.assignedTo ?? null,
    overrides.progress ?? 0,
  );
}

async function taoDim(taskId: number, label: string, sortOrder = 0): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, ?, ?)`,
    taskId,
    label,
    sortOrder,
  );
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `wbs-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-wbs-route', ?, 1)`,
    `WBS ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// POST /api/workpackages
// ============================================================================

test("POST /api/workpackages: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(jreq("/api/workpackages", {}));
  assert.equal(res.status, 401);
});

test("POST /api/workpackages: engineer không được thêm nhóm (chỉ Admin/PM) → 403", S, async () => {
  const { projectId } = await dungSheet("wpp403");
  const eng = await taoUser("engineer", "wpp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(jreq("/api/workpackages", {}));
  assert.equal(res.status, 403);
});

test("POST /api/workpackages: thiếu sheetTypeId/code/name → 400", S, async () => {
  const { projectId } = await dungSheet("wpval");
  const pm = await taoUser("pm", "wpval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(jreq("/api/workpackages", { sheetTypeId: 1 }));
  assert.equal(res.status, 400);
});

test("POST /api/workpackages: trùng code trong cùng sheet → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpdup");
  const pm = await taoUser("pm", "wpdup");
  await taoNhom(sheetTypeId, "DUP1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(
    jreq("/api/workpackages", { sheetTypeId, code: "DUP1", name: "Nhóm trùng" }),
  );
  assert.equal(res.status, 409);
});

test("POST /api/workpackages: mã BOQ đã dùng bởi task khác → 409 (boqTakenBy)", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpboq");
  const pm = await taoUser("pm", "wpboq");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const { run } = await import("@/lib/db");
  const boqCode = `BOQ-${uniq("wpboq")}`;
  await run(
    `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'T1', 'x', ?)`,
    pkgId,
    boqCode,
  );
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/route");
  const res = await POST(
    jreq("/api/workpackages", { sheetTypeId, code: "NEWCODE", name: "Nhóm mới", boqCode }),
  );
  assert.equal(res.status, 409);
});

test(
  "POST /api/workpackages: afterId chèn giữa → sort_order các nhóm sau bị đẩy lên",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpafter");
    const pm = await taoUser("pm", "wpafter");
    const p1 = await taoNhom(sheetTypeId, "A1", { sortOrder: 1 });
    const p2 = await taoNhom(sheetTypeId, "A2", { sortOrder: 2 });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/workpackages/route");
    const res = await POST(
      jreq("/api/workpackages", { sheetTypeId, code: "A15", name: "Chen giữa", afterId: p1 }),
    );
    assert.equal(res.status, 201);
    const { queryOne } = await import("@/lib/db");
    const newRow = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM work_packages WHERE id = ?`,
      (await res.json()).id,
    );
    const p2Row = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM work_packages WHERE id = ?`,
      p2,
    );
    assert.equal(newRow?.sort_order, 2);
    assert.equal(p2Row?.sort_order, 3, "nhóm A2 phải bị đẩy lên sau khi chèn giữa");
  },
);

// ============================================================================
// PATCH/DELETE /api/workpackages/:id
// ============================================================================

test("PATCH /api/workpackages/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/workpackages/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/workpackages/:id: engineer không có quyền sửa cấu trúc → 403", S, async () => {
  const { projectId } = await dungSheet("wpp2");
  const eng = await taoUser("engineer", "wpp2");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test(
  "PATCH /api/workpackages/:id: drawingUrl không phải http/https → 422 (chặn javascript: XSS)",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpxss");
    const pm = await taoUser("pm", "wpxss");
    const pkgId = await taoNhom(sheetTypeId, "X1");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/workpackages/[id]/route");
    const res = await PATCH(jreq("/x", { drawingUrl: "javascript:alert(1)" }, "PATCH"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 422);
  },
);

test("PATCH /api/workpackages/:id: ngày sai định dạng → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpdate");
  const pm = await taoUser("pm", "wpdate");
  const pkgId = await taoNhom(sheetTypeId, "D1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/route");
  const res = await PATCH(jreq("/x", { startDate: "01/01/2026" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/workpackages/:id: mã BOQ trùng với nhóm/task khác → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpboqdup");
  const pm = await taoUser("pm", "wpboqdup");
  const boqCode = `BOQ-${uniq("wpboqdup")}`;
  const pkgOther = await taoNhom(sheetTypeId, "O1");
  const { run } = await import("@/lib/db");
  await run(`UPDATE work_packages SET boq_code = ? WHERE id = ?`, boqCode, pkgOther);
  const pkgId = await taoNhom(sheetTypeId, "O2");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/route");
  const res = await PATCH(jreq("/x", { boqCode }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 409);
});

test("PATCH /api/workpackages/:id: không có trường nào để cập nhật → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpnofield");
  const pm = await taoUser("pm", "wpnofield");
  const pkgId = await taoNhom(sheetTypeId, "N1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/workpackages/:id: sửa thành công + custom field chưa định nghĩa → 422 riêng biệt",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpok");
    const pm = await taoUser("pm", "wpok");
    const pkgId = await taoNhom(sheetTypeId, "K1");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/workpackages/[id]/route");

    const badCustom = await PATCH(jreq("/x", { custom: { chua_dinh_nghia: "x" } }, "PATCH"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(badCustom.status, 422);

    const res = await PATCH(jreq("/x", { name: "Tên mới" }, "PATCH"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ name: string }>(
      `SELECT name FROM work_packages WHERE id = ?`,
      pkgId,
    );
    assert.equal(row?.name, "Tên mới");
  },
);

test("DELETE /api/workpackages/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/workpackages/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/workpackages/:id: engineer không được xoá nhóm → 403", S, async () => {
  const { projectId } = await dungSheet("wpdel403");
  const eng = await taoUser("engineer", "wpdel403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/workpackages/:id: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("wpdel404");
  const pm = await taoUser("pm", "wpdel404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/workpackages/:id: xoá nhóm kéo theo XOÁ SẠCH task + dimension con (không mồ côi)",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpdelcascade");
    const pm = await taoUser("pm", "wpdelcascade");
    const pkgId = await taoNhom(sheetTypeId, "C1");
    const taskId = await taoTask(pkgId, "C1,01");
    await taoDim(taskId, "D1");
    await dangNhapDuAn(pm, projectId);
    const { DELETE } = await import("@/app/api/workpackages/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    assert.equal((await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskId)) ?? null, null);
    assert.equal(
      (await queryOne(`SELECT id FROM progress_dimensions WHERE task_id = ?`, taskId)) ?? null,
      null,
    );
  },
);

// ============================================================================
// PATCH /api/workpackages/:id/move
// ============================================================================

test("PATCH /api/workpackages/:id/move: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/workpackages/:id/move: engineer không được di chuyển → 403", S, async () => {
  const { projectId } = await dungSheet("wpmv403");
  const eng = await taoUser("engineer", "wpmv403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/workpackages/:id/move: direction không hợp lệ → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpmvbad");
  const pm = await taoUser("pm", "wpmvbad");
  const pkgId = await taoNhom(sheetTypeId, "M1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "sideways" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/workpackages/:id/move: đã ở đầu danh sách → ok:false, KHÔNG đổi sort_order ai cả",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpmvtop");
    const pm = await taoUser("pm", "wpmvtop");
    const first = await taoNhom(sheetTypeId, "MT1", { sortOrder: 1 });
    await taoNhom(sheetTypeId, "MT2", { sortOrder: 2 });
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
    const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
      params: Promise.resolve({ id: String(first) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, false);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM work_packages WHERE id = ?`,
      first,
    );
    assert.equal(row?.sort_order, 1, "không có gì để hoán đổi thì sort_order phải giữ nguyên");
  },
);

test(
  "PATCH /api/workpackages/:id/move: hoán đổi ĐÚNG 2 nhóm liền kề, không đụng nhóm thứ 3",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpmvswap");
    const pm = await taoUser("pm", "wpmvswap");
    const p1 = await taoNhom(sheetTypeId, "S1", { sortOrder: 1 });
    const p2 = await taoNhom(sheetTypeId, "S2", { sortOrder: 2 });
    const p3 = await taoNhom(sheetTypeId, "S3", { sortOrder: 3 });
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
    const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
      params: Promise.resolve({ id: String(p2) }),
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
    const r3 = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM work_packages WHERE id = ?`,
      p3,
    );
    assert.equal(r1?.sort_order, 1, "nhóm không liên quan giữ nguyên");
    assert.equal(r2?.sort_order, 3);
    assert.equal(r3?.sort_order, 2);
  },
);

test(
  "PATCH /api/workpackages/:id/move: KHÔNG nhảy sang nhóm ở sheet KHÁC dù sort_order trùng",
  S,
  async () => {
    // Bất biến di chuyển: neighbor luôn lọc theo sheet_type_id của chính nhóm đang di
    // chuyển — nhóm ở sheet khác dù sort_order thấp hơn cũng không được coi là "liền kề".
    const { projectId, sheetTypeId: sheetA } = await dungSheet("wpmvisoA");
    const { sheetTypeId: sheetB } = await dungSheet("wpmvisoB");
    const pm = await taoUser("pm", "wpmvisoA");
    const onlyInA = await taoNhom(sheetA, "IA1", { sortOrder: 5 });
    await taoNhom(sheetB, "IB1", { sortOrder: 1 }); // sort_order thấp hơn nhưng KHÁC sheet
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
    const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
      params: Promise.resolve({ id: String(onlyInA) }),
    });
    assert.equal(res.status, 200);
    assert.equal(
      (await res.json()).ok,
      false,
      "không có nhóm liền kề CÙNG SHEET nên phải báo hết danh sách",
    );
  },
);

// ============================================================================
// POST /api/workpackages/:id/copy
// ============================================================================

test("POST /api/workpackages/:id/copy: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/workpackages/:id/copy: engineer không được copy → 403", S, async () => {
  const { projectId } = await dungSheet("wpcp403");
  const eng = await taoUser("engineer", "wpcp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/workpackages/:id/copy: nhóm gốc không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("wpcp404");
  const pm = await taoUser("pm", "wpcp404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test("POST /api/workpackages/:id/copy: code copy trùng (đã tồn tại) → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpcpdup");
  const pm = await taoUser("pm", "wpcpdup");
  const src = await taoNhom(sheetTypeId, "CP1");
  await taoNhom(sheetTypeId, "CP1_copy"); // đã có sẵn mã copy mặc định
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(src) }) });
  assert.equal(res.status, 409);
});

test(
  "POST /api/workpackages/:id/copy: copy đủ TASK + DIMENSION, reset installed=0, KHÔNG copy BOQ",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wpcpok");
    const pm = await taoUser("pm", "wpcpok");
    const src = await taoNhom(sheetTypeId, "CPO1");
    const { run } = await import("@/lib/db");
    await run(`UPDATE work_packages SET boq_code = ? WHERE id = ?`, `BOQ-${uniq("wpcpok")}`, src);
    const t1 = await taoTask(src, "CPO1,01");
    await taoDim(t1, "DN15", 0);
    const dimId = await taoDim(t1, "DN20", 1);
    await run(`UPDATE progress_dimensions SET installed = 1 WHERE id = ?`, dimId);

    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
    const res = await POST(jreq("/x", { code: `CPO1_${uniq("copyx")}` }), {
      params: Promise.resolve({ id: String(src) }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.tasks, 1);

    const { query, queryOne } = await import("@/lib/db");
    const newPkg = await queryOne<{ boq_code: string | null }>(
      `SELECT boq_code FROM work_packages WHERE id = ?`,
      body.id,
    );
    assert.equal(
      newPkg?.boq_code,
      null,
      "BOQ phải duy nhất toàn hệ thống — KHÔNG copy sang bản mới",
    );

    const newTasks = await query<{ id: number; code: string }>(
      `SELECT id, code FROM tasks WHERE package_id = ?`,
      body.id,
    );
    assert.equal(newTasks.length, 1);
    const newDims = await query<{ dimension_label: string; installed: number }>(
      `SELECT dimension_label, installed FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`,
      newTasks[0].id,
    );
    assert.deepEqual(
      newDims.map((d) => d.dimension_label),
      ["DN15", "DN20"],
      "cấu trúc cột (dimension) phải giữ nguyên nhãn và thứ tự",
    );
    assert.ok(
      newDims.every((d) => Number(d.installed) === 0),
      "task copy phải reset checkbox về CHƯA tick — không kế thừa tiến độ đã làm",
    );
  },
);

// ============================================================================
// PATCH /api/tasks/:id/move
// ============================================================================

test("PATCH /api/tasks/:id/move: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/tasks/:id/move: subcon (không có editStructure) → 403", S, async () => {
  // editStructure chỉ admin/pm — subcon dù được giao chính task này vẫn không được đổi
  // thứ tự cấu trúc (khác quyền editProgress/canTouchTask dùng cho tick % thi công).
  const { projectId, sheetTypeId } = await dungSheet("tmv403");
  const sub = await taoUser("subcon", "tmv403");
  const pkgId = await taoNhom(sheetTypeId, "TM1");
  const taskId = await taoTask(pkgId, "TM1,01", { assignedTo: sub.id });
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/tasks/:id/move: task không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("tmv404");
  const pm = await taoUser("pm", "tmv404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/tasks/:id/move: KHÔNG hoán đổi với task ở NHÓM KHÁC dù sort_order liền kề",
  S,
  async () => {
    // Bất biến: neighbor lọc theo package_id — task ở nhóm khác dù sort_order kề nhau
    // (vd cùng =1) không được coi là "liền kề" của nhau, tránh nhảy sheet/nhóm trái phép.
    const { projectId, sheetTypeId } = await dungSheet("tmviso");
    const pm = await taoUser("pm", "tmviso");
    const pkgA = await taoNhom(sheetTypeId, "TIA");
    const pkgB = await taoNhom(sheetTypeId, "TIB");
    const taskA = await taoTask(pkgA, "TIA,01", { sortOrder: 1 });
    await taoTask(pkgB, "TIB,01", { sortOrder: 0 }); // sort_order thấp hơn nhưng KHÁC nhóm
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
    const res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
      params: Promise.resolve({ id: String(taskA) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, false);
  },
);

test("PATCH /api/tasks/:id/move: hoán đổi 2 task liền kề đúng nhóm", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tmvok");
  const pm = await taoUser("pm", "tmvok");
  const pkgId = await taoNhom(sheetTypeId, "TOK");
  const t1 = await taoTask(pkgId, "TOK,01", { sortOrder: 1 });
  const t2 = await taoTask(pkgId, "TOK,02", { sortOrder: 2 });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
  const res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
    params: Promise.resolve({ id: String(t1) }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  const { queryOne } = await import("@/lib/db");
  const r1 = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM tasks WHERE id = ?`,
    t1,
  );
  const r2 = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM tasks WHERE id = ?`,
    t2,
  );
  assert.equal(r1?.sort_order, 2);
  assert.equal(r2?.sort_order, 1);
});

// Đợt 6, Việc C — vá nối chuỗi SQL ở app/api/tasks/[id]/move/route.ts (cur.sort_order
// nối thẳng vào câu SQL thay vì dùng placeholder `?`). Ca này dựng 3 task liền kề, di
// chuyển "lên" rồi "xuống" và so khớp TOÀN BỘ thứ tự (3 sort_order) trước/sau — chạy
// xanh y hệt trên cả bản trước và sau khi sửa chứng minh KHÔNG đổi hành vi.
test(
  "PATCH /api/tasks/:id/move: 3 task liền kề — di chuyển lên rồi xuống giữ đúng thứ tự",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("tmv3");
    const pm = await taoUser("pm", "tmv3");
    const pkgId = await taoNhom(sheetTypeId, "T3");
    const a = await taoTask(pkgId, "T3,01", { sortOrder: 10 });
    const b = await taoTask(pkgId, "T3,02", { sortOrder: 20 });
    const c = await taoTask(pkgId, "T3,03", { sortOrder: 30 });
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
    const { query } = await import("@/lib/db");

    const thuTu = async () => {
      const rows = await query<{ id: number; sort_order: number }>(
        `SELECT id, sort_order FROM tasks WHERE package_id = ? ORDER BY sort_order`,
        pkgId,
      );
      return rows.map((r) => r.id);
    };

    assert.deepEqual(await thuTu(), [a, b, c]);

    // b "lên" → hoán đổi với a (10 <-> 20).
    let res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
      params: Promise.resolve({ id: String(b) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.deepEqual(await thuTu(), [b, a, c]);

    // b (giờ sort_order=10) "xuống" → hoán đổi với a (10 <-> 20) — về lại thứ tự gốc.
    res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
      params: Promise.resolve({ id: String(b) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.deepEqual(await thuTu(), [a, b, c]);

    // a (sort_order=10) "lên" → đã ở đầu, không đổi gì.
    res = await PATCH(jreq("/x", { direction: "up" }, "PATCH"), {
      params: Promise.resolve({ id: String(a) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, false);
    assert.deepEqual(await thuTu(), [a, b, c]);

    // c (sort_order=30) "xuống" → đã ở cuối, không đổi gì.
    res = await PATCH(jreq("/x", { direction: "down" }, "PATCH"), {
      params: Promise.resolve({ id: String(c) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, false);
    assert.deepEqual(await thuTu(), [a, b, c]);
  },
);

// ============================================================================
// POST /api/tasks/:id/copy
// ============================================================================

test("POST /api/tasks/:id/copy: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tasks/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/tasks/:id/copy: subcon không được copy (chỉ Admin/PM) → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tcp403");
  const sub = await taoUser("subcon", "tcp403");
  const pkgId = await taoNhom(sheetTypeId, "TC1");
  const taskId = await taoTask(pkgId, "TC1,01", { assignedTo: sub.id });
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(taskId) }) });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/copy: task gốc không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("tcp404");
  const pm = await taoUser("pm", "tcp404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test("POST /api/tasks/:id/copy: mã copy trùng trong cùng nhóm → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tcpdup");
  const pm = await taoUser("pm", "tcpdup");
  const pkgId = await taoNhom(sheetTypeId, "TD1");
  const t1 = await taoTask(pkgId, "TD1,01");
  await taoTask(pkgId, "TD1,01_copy");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/copy/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(t1) }) });
  assert.equal(res.status, 409);
});

test(
  "POST /api/tasks/:id/copy: copy đúng cấu trúc dimension (nhãn + thứ tự), reset installed=0",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("tcpok");
    const pm = await taoUser("pm", "tcpok");
    const pkgId = await taoNhom(sheetTypeId, "TCO1");
    const src = await taoTask(pkgId, "TCO1,01");
    await taoDim(src, "DN15", 0);
    const dimId = await taoDim(src, "DN20", 1);
    const { run, query, queryOne } = await import("@/lib/db");
    await run(`UPDATE progress_dimensions SET installed = 1 WHERE id = ?`, dimId);

    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tasks/[id]/copy/route");
    const res = await POST(jreq("/x", { code: `TCO1,${uniq("cp")}` }), {
      params: Promise.resolve({ id: String(src) }),
    });
    assert.equal(res.status, 201);
    const { id: newTaskId } = await res.json();

    const newDims = await query<{ dimension_label: string; installed: number; sort_order: number }>(
      `SELECT dimension_label, installed, sort_order FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`,
      newTaskId,
    );
    assert.deepEqual(
      newDims.map((d) => d.dimension_label),
      ["DN15", "DN20"],
    );
    assert.deepEqual(
      newDims.map((d) => d.sort_order),
      [0, 1],
    );
    assert.ok(newDims.every((d) => Number(d.installed) === 0));

    // Task copy vẫn thuộc ĐÚNG nhóm nguồn, không tự nhảy sang nhóm khác.
    const newTaskRow = await queryOne<{ package_id: number }>(
      `SELECT package_id FROM tasks WHERE id = ?`,
      newTaskId,
    );
    assert.equal(newTaskRow?.package_id, pkgId);
  },
);

// ============================================================================
// GET/POST /api/tasks/:id/comments
// ============================================================================

test("GET /api/tasks/:id/comments: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tasks/:id/comments: subcon KHÔNG được giao task này → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("cmtg403");
  const sub = await taoUser("subcon", "cmtg403");
  const pkgId = await taoNhom(sheetTypeId, "CG1");
  const taskId = await taoTask(pkgId, "CG1,01"); // không gán cho subcon
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/comments: subcon KHÔNG được giao task này → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("cmtp403");
  const sub = await taoUser("subcon", "cmtp403");
  const pkgId = await taoNhom(sheetTypeId, "CP1");
  const taskId = await taoTask(pkgId, "CP1,01");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await POST(jreq("/x", { body: "xin chào" }), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/comments: task không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("cmt404");
  const pm = await taoUser("pm", "cmt404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await POST(jreq("/x", { body: "x" }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tasks/:id/comments: nội dung rỗng → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("cmtempty");
  const pm = await taoUser("pm", "cmtempty");
  const pkgId = await taoNhom(sheetTypeId, "CE1");
  const taskId = await taoTask(pkgId, "CE1,01");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await POST(jreq("/x", { body: "   " }), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/tasks/:id/comments: nội dung quá 2000 ký tự → 413", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("cmtlong");
  const pm = await taoUser("pm", "cmtlong");
  const pkgId = await taoNhom(sheetTypeId, "CL1");
  const taskId = await taoTask(pkgId, "CL1,01");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/comments/route");
  const res = await POST(jreq("/x", { body: "a".repeat(2001) }), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 413);
});

test(
  "POST rồi GET /api/tasks/:id/comments: subcon ĐƯỢC giao task thì bình luận + đọc lại được",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("cmtok");
    const sub = await taoUser("subcon", "cmtok");
    const pkgId = await taoNhom(sheetTypeId, "CO1");
    const taskId = await taoTask(pkgId, "CO1,01", { assignedTo: sub.id });
    await dangNhapDuAn(sub, projectId);
    const { POST, GET } = await import("@/app/api/tasks/[id]/comments/route");
    const posted = await POST(jreq("/x", { body: "Đã lắp xong" }), {
      params: Promise.resolve({ id: String(taskId) }),
    });
    assert.equal(posted.status, 201);

    const listed = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(taskId) }),
    });
    assert.equal(listed.status, 200);
    const { comments } = await listed.json();
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body, "Đã lắp xong");
    assert.equal(comments[0].userId, sub.id);
  },
);

// ============================================================================
// POST /api/tasks/:id/delay-reason
// ============================================================================

test("POST /api/tasks/:id/delay-reason: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
  const res = await POST(jreq("/x", { reason: "thoi_tiet" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test(
  "POST /api/tasks/:id/delay-reason: vai trò chỉ-xem (cdt) → 403 (CAN.editProgress)",
  S,
  async () => {
    const { projectId } = await dungSheet("drp403");
    const cdt = await taoUser("cdt", "drp403");
    await dangNhapDuAn(cdt, projectId);
    const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
    const res = await POST(jreq("/x", { reason: "thoi_tiet" }), {
      params: Promise.resolve({ id: "1" }),
    });
    assert.equal(res.status, 403);
  },
);

test("POST /api/tasks/:id/delay-reason: task không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("dr404");
  const pm = await taoUser("pm", "dr404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
  const res = await POST(jreq("/x", { reason: "thoi_tiet" }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tasks/:id/delay-reason: subcon KHÔNG được giao task này → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drsub403");
  const sub = await taoUser("subcon", "drsub403");
  const pkgId = await taoNhom(sheetTypeId, "DRS1");
  const taskId = await taoTask(pkgId, "DRS1,01"); // không gán
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
  const res = await POST(jreq("/x", { reason: "thoi_tiet" }), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/delay-reason: reason không hợp lệ → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drbad");
  const pm = await taoUser("pm", "drbad");
  const pkgId = await taoNhom(sheetTypeId, "DRB1");
  const taskId = await taoTask(pkgId, "DRB1,01");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
  const res = await POST(jreq("/x", { reason: "khong_ton_tai" }), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "POST /api/tasks/:id/delay-reason: subcon ĐƯỢC giao task → gán được, reason=null xoá tag",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("drok");
    const sub = await taoUser("subcon", "drok");
    const pkgId = await taoNhom(sheetTypeId, "DRO1");
    const taskId = await taoTask(pkgId, "DRO1,01", { assignedTo: sub.id });
    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");

    const set = await POST(jreq("/x", { reason: "thoi_tiet", note: "Mưa lớn" }), {
      params: Promise.resolve({ id: String(taskId) }),
    });
    assert.equal(set.status, 200);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ delay_reason: string | null; delay_note: string | null }>(
      `SELECT delay_reason, delay_note FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(row?.delay_reason, "thoi_tiet");
    assert.equal(row?.delay_note, "Mưa lớn");

    const cleared = await POST(jreq("/x", { reason: null }), {
      params: Promise.resolve({ id: String(taskId) }),
    });
    assert.equal(cleared.status, 200);
    const row2 = await queryOne<{ delay_reason: string | null; delay_note: string | null }>(
      `SELECT delay_reason, delay_note FROM tasks WHERE id = ?`,
      taskId,
    );
    assert.equal(row2?.delay_reason, null);
    assert.equal(row2?.delay_note, null, "xoá reason phải xoá luôn note đi kèm");
  },
);

// ============================================================================
// GET /api/tasks/:id/history — CHỈ ĐỌC
// ============================================================================

test(
  "history/route.ts: module CHỈ export GET — không có cách nào sửa lịch sử qua route này",
  S,
  async () => {
    // Bất biến toàn vẹn dữ liệu: task_history là NHẬT KÝ, phải bất biến qua API. Route
    // không được có PATCH/POST/DELETE — nếu ai đó lỡ thêm sau này, ca test này phải đỏ.
    const mod = await import("@/app/api/tasks/[id]/history/route");
    assert.equal(typeof mod.GET, "function");
    assert.equal((mod as Record<string, unknown>).POST, undefined);
    assert.equal((mod as Record<string, unknown>).PATCH, undefined);
    assert.equal((mod as Record<string, unknown>).DELETE, undefined);
  },
);

test("GET /api/tasks/:id/history: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/[id]/history/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tasks/:id/history: subcon KHÔNG được giao task này → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("hist403");
  const sub = await taoUser("subcon", "hist403");
  const pkgId = await taoNhom(sheetTypeId, "H1");
  const taskId = await taoTask(pkgId, "H1,01");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/history/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/tasks/:id/history: task không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("hist404");
  const pm = await taoUser("pm", "hist404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/history/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/tasks/:id/history: liệt kê đúng lịch sử của task này, mới nhất trước, không lẫn task khác",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("histok");
    const pm = await taoUser("pm", "histok");
    const pkgId = await taoNhom(sheetTypeId, "HO1");
    const taskId = await taoTask(pkgId, "HO1,01");
    const otherTaskId = await taoTask(pkgId, "HO1,02");
    const { insertId } = await import("@/lib/db");
    await insertId(
      `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, 0, 0.3, 'dang_thi_cong', 'lần 1', 'PM')`,
      taskId,
    );
    await insertId(
      `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, 0.3, 0.6, 'dang_thi_cong', 'lần 2', 'PM')`,
      taskId,
    );
    await insertId(
      `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, 0, 0.1, 'dang_thi_cong', 'task khác', 'PM')`,
      otherTaskId,
    );
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/tasks/[id]/history/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(taskId) }),
    });
    assert.equal(res.status, 200);
    const { history } = await res.json();
    assert.equal(history.length, 2, "không được lẫn lịch sử của task khác");
    assert.equal(history[0].note, "lần 2", "mới nhất phải đứng đầu");
    assert.equal(history[1].note, "lần 1");
  },
);

// ============================================================================
// GET /api/systems
// ============================================================================

test("GET /api/systems: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/systems/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/systems: mọi vai trò đăng nhập đều xem được (kể cả subcon)", S, async () => {
  const { projectId } = await dungSheet("sysok");
  const sub = await taoUser("subcon", "sysok");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/systems/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { systems } = await res.json();
  assert.ok(Array.isArray(systems));
});
