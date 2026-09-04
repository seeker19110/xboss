import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm CHẤT LƯỢNG & ĐỀ XUẤT — cùng khuôn với
// tests/route-tai-chinh.test.ts / tests/route-baselines.test.ts. Route phủ:
//   - app/api/qc/checklists/route.ts             (GET/POST mẫu checklist QAQC)
//   - app/api/qc/checklists/[id]/route.ts        (PATCH/DELETE 1 mẫu checklist)
//   - app/api/qc/inspections/route.ts            (GET/POST lần kiểm tra)
//   - app/api/qc/inspections/[id]/route.ts       (PATCH 1 lần kiểm tra)
//   - app/api/proposals/route.ts                 (GET/POST đề xuất)
//   - app/api/proposals/[id]/route.ts            (GET/PATCH/DELETE 1 đề xuất)
//   - app/api/design-changes/route.ts            (GET/POST thay đổi thiết kế)
//   - app/api/design-changes/[id]/route.ts       (GET/PATCH/DELETE 1 thay đổi thiết kế)
//   - app/api/punch-list/route.ts                (GET/POST tồn tại khi bàn giao)
//   - app/api/punch-list/[id]/route.ts           (GET/PATCH/DELETE 1 tồn tại)
// KHÔNG phủ app/api/handover-items (route.ts + [id]/route.ts): cùng module lib
// (lib/hien-truong/handover.ts) và cùng pattern quyền/scoping với punch-list đã phủ ở
// đây, nhưng PATCH /:id thêm nhánh multipart/form-data (upload biên bản) tốn ngân sách
// test lớn hơn hẳn so với phần bất biến MỚI nó thêm vào — xem BÁO CÁO CUỐI.

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `QC-DX route ${uniq(ten)}`);
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `qcdx-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'hash-test-qcdx', ?)`,
    `QCDX ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Chuỗi Tháp→Sheet→Nhóm→Task đầy đủ (tối thiểu để qc_inspections/design_changes join được). */
async function taoTask(
  projectId: number,
  ten: string,
  overrides: { assignedTo?: number | null } = {},
): Promise<{ taskId: number; packageId: number }> {
  const { insertId } = await import("@/lib/db");
  const code = uniq(ten).toUpperCase();
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${code}`,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, ?)`,
    towerId,
    `ST${code}`,
    `Sheet ${code}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, ?)`,
    sheetId,
    `PKG${code}`,
    `Nhóm ${code}`,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, assigned_to)
     VALUES (?, ?, ?, 0, ?)`,
    packageId,
    `PKG${code},01`,
    `Task ${code}`,
    overrides.assignedTo ?? null,
  );
  return { taskId, packageId };
}

async function taoSystem(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO systems (code, name) VALUES (?, ?)`,
    `SYS-${uniq(ten)}`,
    `Hệ ${ten}`,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET/POST /api/qc/checklists
// ============================================================================

test("GET /api/qc/checklists: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/qc/checklists/route");
  const res = await GET(jreq("/api/qc/checklists", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/qc/checklists: mọi vai trò đăng nhập xem được (viewer)", S, async () => {
  const projectId = await taoDuAn("gl-viewer");
  const viewer = await taoUser("viewer", "gl-viewer");
  await dangNhapDuAn(viewer, projectId);
  const { GET } = await import("@/app/api/qc/checklists/route");
  const res = await GET(jreq("/api/qc/checklists", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).checklists, []);
});

test("GET /api/qc/checklists: cách ly dự án — không thấy mẫu của dự án khác", S, async () => {
  const projectA = await taoDuAn("glisoA");
  const projectB = await taoDuAn("glisoB");
  const pmB = await taoUser("pm", "glisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/qc/checklists/route");
  await POST(jreq("/api/qc/checklists", { name: "Mẫu B", items: [] }));

  const pmA = await taoUser("pm", "glisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/qc/checklists/route");
  const res = await GET(jreq("/api/qc/checklists", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).checklists, []);
});

test("POST /api/qc/checklists: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/qc/checklists/route");
  const res = await POST(jreq("/api/qc/checklists", { name: "x", items: [] }));
  assert.equal(res.status, 401);
});

test("POST /api/qc/checklists: engineer không được tạo (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("cp403");
  const eng = await taoUser("engineer", "cp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const res = await POST(jreq("/api/qc/checklists", { name: "x", items: [] }));
  assert.equal(res.status, 403);
});

test("POST /api/qc/checklists: thiếu tên → 422", S, async () => {
  const projectId = await taoDuAn("cnoname");
  const pm = await taoUser("pm", "cnoname");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const res = await POST(jreq("/api/qc/checklists", { name: "  ", items: [] }));
  assert.equal(res.status, 422);
});

test("POST /api/qc/checklists: items không hợp lệ → 422 (validateChecklistItems)", S, async () => {
  const projectId = await taoDuAn("cbaditems");
  const pm = await taoUser("pm", "cbaditems");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const res = await POST(
    jreq("/api/qc/checklists", { name: "Mẫu lỗi", items: [{ khong_dung: true }] }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/qc/checklists: systemId không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("csysbad");
  const pm = await taoUser("pm", "csysbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const res = await POST(
    jreq("/api/qc/checklists", { name: "Mẫu hệ sai", items: [], systemId: 999999999 }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Hệ không hợp lệ/);
});

test(
  "POST /api/qc/checklists: thành công → project_id do SERVER suy, category fallback 'work'",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("cok");
    const pm = await taoUser("pm", "cok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/qc/checklists/route");
    const res = await POST(
      jreq("/api/qc/checklists", {
        name: "Mẫu hợp lệ",
        items: [{ label: "Kiểm tra 1", type: "pass_fail" }],
        category: "khong_hop_le", // fallback thầm lặng về 'work', không lỗi
        projectId: 999999, // cố tình gửi kèm — route KHÔNG được tin trường này
      }),
    );
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = await queryOne<{ project_id: number; category: string }>(
      `SELECT project_id, category FROM qc_checklists WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
    assert.equal(row?.category, "work");
  },
);

// ============================================================================
// PATCH/DELETE /api/qc/checklists/[id]
// ============================================================================

test("PATCH /api/qc/checklists/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/qc/checklists/:id: engineer không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("pp403");
  const eng = await taoUser("engineer", "pp403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/qc/checklists/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("ppbad");
  const pm = await taoUser("pm", "ppbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/qc/checklists/:id: mẫu thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("ppisoA");
  const projectB = await taoDuAn("ppisoB");
  const pmA = await taoUser("pm", "ppisoA");
  const pmB = await taoUser("pm", "ppisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const created = await POST(jreq("/api/qc/checklists", { name: "Của B", items: [] }));
  const { id } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Cố sửa" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/qc/checklists/:id: category không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("pcatbad");
  const pm = await taoUser("pm", "pcatbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const created = await POST(jreq("/api/qc/checklists", { name: "Mẫu", items: [] }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await PATCH(jreq("/x", { category: "khong_ton_tai" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/qc/checklists/:id: sửa tên thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pok");
  const pm = await taoUser("pm", "pok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/qc/checklists/route");
  const created = await POST(jreq("/api/qc/checklists", { name: "Cũ", items: [] }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Mới" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ name: string }>(`SELECT name FROM qc_checklists WHERE id = ?`, id);
  assert.equal(row?.name, "Mới");
});

test("DELETE /api/qc/checklists/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/qc/checklists/:id: engineer không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("dp403");
  const eng = await taoUser("engineer", "dp403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/qc/checklists/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("d404");
  const pm = await taoUser("pm", "d404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/qc/checklists/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/qc/checklists/:id: đã có lần kiểm tra dùng mẫu → 409, không mất dấu vết QAQC",
  S,
  async () => {
    const projectId = await taoDuAn("dlinked");
    const pm = await taoUser("pm", "dlinked");
    await dangNhapDuAn(pm, projectId);
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    const created = await postChecklist(
      jreq("/api/qc/checklists", { name: "Dùng rồi", items: [] }),
    );
    const { id: checklistId } = await created.json();

    const { taskId } = await taoTask(projectId, "dlinked");
    const { POST: postInspection } = await import("@/app/api/qc/inspections/route");
    await postInspection(jreq("/api/qc/inspections", { checklistId, taskId, results: [] }));

    const { DELETE } = await import("@/app/api/qc/checklists/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(checklistId) }),
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /đã có lần kiểm tra dùng mẫu/);
  },
);

// ============================================================================
// GET/POST /api/qc/inspections
// ============================================================================

test("GET /api/qc/inspections: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/qc/inspections/route");
  const res = await GET(jreq("/api/qc/inspections", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/qc/inspections: cách ly dự án — không thấy lần kiểm của dự án khác", S, async () => {
  const projectA = await taoDuAn("iisoA");
  const projectB = await taoDuAn("iisoB");
  const pmB = await taoUser("pm", "iisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
  const cl = await (
    await postChecklist(jreq("/api/qc/checklists", { name: "B", items: [] }))
  ).json();
  const { taskId } = await taoTask(projectB, "iisoB");
  const { POST: postInspection } = await import("@/app/api/qc/inspections/route");
  await postInspection(jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [] }));

  const pmA = await taoUser("pm", "iisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/qc/inspections/route");
  const res = await GET(jreq("/api/qc/inspections", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).inspections, []);
});

test("POST /api/qc/inspections: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/qc/inspections/route");
  const res = await POST(jreq("/api/qc/inspections", { checklistId: 1, taskId: 1 }));
  assert.equal(res.status, 401);
});

test("POST /api/qc/inspections: thiếu checklist → 422", S, async () => {
  const projectId = await taoDuAn("inochk");
  const pm = await taoUser("pm", "inochk");
  await dangNhapDuAn(pm, projectId);
  const { taskId } = await taoTask(projectId, "inochk");
  const { POST } = await import("@/app/api/qc/inspections/route");
  const res = await POST(jreq("/api/qc/inspections", { taskId }));
  assert.equal(res.status, 422);
});

test("POST /api/qc/inspections: thiếu cả task lẫn nhóm công việc → 422", S, async () => {
  const projectId = await taoDuAn("inotarget");
  const pm = await taoUser("pm", "inotarget");
  await dangNhapDuAn(pm, projectId);
  const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
  const cl = await (
    await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
  ).json();
  const { POST } = await import("@/app/api/qc/inspections/route");
  const res = await POST(jreq("/api/qc/inspections", { checklistId: cl.id }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/qc/inspections: subcon KHÔNG được gán → task người khác được giao → 403 (canTouchTask)",
  S,
  async () => {
    const projectId = await taoDuAn("isub403");
    const sub = await taoUser("subcon", "isub403");
    const otherEng = await taoUser("engineer", "isub403other");
    await dangNhapDuAn(sub, projectId);
    const { taskId } = await taoTask(projectId, "isub403", { assignedTo: otherEng.id });
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    // Chuyển sang PM để tạo checklist (subcon không có quyền editStructure).
    const pm = await taoUser("pm", "isub403pm");
    await dangNhapDuAn(pm, projectId);
    const cl = await (
      await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
    ).json();

    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/qc/inspections/route");
    const res = await POST(
      jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [] }),
    );
    assert.equal(res.status, 403);
  },
);

test(
  "POST /api/qc/inspections: task thuộc dự án KHÁC dự án đang chọn → 422 (cách ly dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("icrossA");
    const projectB = await taoDuAn("icrossB");
    const pmA = await taoUser("pm", "icrossA");
    await dangNhapDuAn(pmA, projectA);
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    const cl = await (
      await postChecklist(jreq("/api/qc/checklists", { name: "A", items: [] }))
    ).json();
    const { taskId: taskB } = await taoTask(projectB, "icrossB");

    const { POST } = await import("@/app/api/qc/inspections/route");
    const res = await POST(
      jreq("/api/qc/inspections", { checklistId: cl.id, taskId: taskB, results: [] }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /không thuộc dự án đang chọn/);
  },
);

test("POST /api/qc/inspections: checklist không tồn tại trong dự án → 404", S, async () => {
  const projectId = await taoDuAn("i404");
  const pm = await taoUser("pm", "i404");
  await dangNhapDuAn(pm, projectId);
  const { taskId } = await taoTask(projectId, "i404");
  const { POST } = await import("@/app/api/qc/inspections/route");
  const res = await POST(
    jreq("/api/qc/inspections", { checklistId: 999999999, taskId, results: [] }),
  );
  assert.equal(res.status, 404);
});

test("POST /api/qc/inspections: results không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("iresbad");
  const pm = await taoUser("pm", "iresbad");
  await dangNhapDuAn(pm, projectId);
  const { taskId } = await taoTask(projectId, "iresbad");
  const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
  const cl = await (
    await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
  ).json();
  const { POST } = await import("@/app/api/qc/inspections/route");
  const res = await POST(
    jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [{ x: 1 }] }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/qc/inspections: subcon tự kiểm ĐÚNG task được giao → 201 thành công",
  S,
  async () => {
    const projectId = await taoDuAn("iok");
    const pm = await taoUser("pm", "iok");
    const sub = await taoUser("subcon", "iok");
    await dangNhapDuAn(pm, projectId);
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    const cl = await (
      await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
    ).json();
    const { taskId } = await taoTask(projectId, "iok", { assignedTo: sub.id });

    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/qc/inspections/route");
    const res = await POST(
      jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [] }),
    );
    assert.equal(res.status, 201);
  },
);

// ============================================================================
// PATCH /api/qc/inspections/[id]
// ============================================================================

test("PATCH /api/qc/inspections/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/qc/inspections/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("pinbad");
  const pm = await taoUser("pm", "pinbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/qc/inspections/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("pin404");
  const pm = await taoUser("pm", "pin404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
  const res = await PATCH(jreq("/x", { status: "submitted" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/qc/inspections/:id: đổi sang 'passed' cần CAN.approve — engineer bị chặn 403",
  S,
  async () => {
    // Hold-point QAQC: engineer/subcon KHÔNG được tự chốt đạt/không đạt, chỉ Admin/PM.
    const projectId = await taoDuAn("papprove403");
    const pm = await taoUser("pm", "papprove403");
    const eng = await taoUser("engineer", "papprove403eng");
    await dangNhapDuAn(pm, projectId);
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    const cl = await (
      await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
    ).json();
    const { taskId } = await taoTask(projectId, "papprove403");
    const { POST: postInspection } = await import("@/app/api/qc/inspections/route");
    const insp = await (
      await postInspection(jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [] }))
    ).json();

    await dangNhapDuAn(eng, projectId);
    const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
    const res = await PATCH(jreq("/x", { status: "passed" }, "PATCH"), {
      params: Promise.resolve({ id: String(insp.id) }),
    });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /Chỉ Admin\/PM/);
  },
);

test(
  "PATCH /api/qc/inspections/:id: subcon không được sửa lần kiểm tra của task người khác → 403",
  S,
  async () => {
    const projectId = await taoDuAn("psub403");
    const pm = await taoUser("pm", "psub403");
    const owner = await taoUser("subcon", "psub403owner");
    const other = await taoUser("subcon", "psub403other");
    await dangNhapDuAn(pm, projectId);
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    const cl = await (
      await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
    ).json();
    const { taskId } = await taoTask(projectId, "psub403", { assignedTo: owner.id });
    const { POST: postInspection } = await import("@/app/api/qc/inspections/route");
    await dangNhapDuAn(owner, projectId);
    const insp = await (
      await postInspection(jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [] }))
    ).json();

    await dangNhapDuAn(other, projectId);
    const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
    const res = await PATCH(jreq("/x", { status: "submitted" }, "PATCH"), {
      params: Promise.resolve({ id: String(insp.id) }),
    });
    assert.equal(res.status, 403);
  },
);

test(
  "PATCH /api/qc/inspections/:id: Admin duyệt 'passed' thành công, ghi approved_by",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("padminok");
    const pm = await taoUser("pm", "padminok");
    const admin = await taoUser("admin", "padminok");
    await dangNhapDuAn(pm, projectId);
    const { POST: postChecklist } = await import("@/app/api/qc/checklists/route");
    const cl = await (
      await postChecklist(jreq("/api/qc/checklists", { name: "x", items: [] }))
    ).json();
    const { taskId } = await taoTask(projectId, "padminok");
    const { POST: postInspection } = await import("@/app/api/qc/inspections/route");
    const insp = await (
      await postInspection(jreq("/api/qc/inspections", { checklistId: cl.id, taskId, results: [] }))
    ).json();

    await dangNhapDuAn(admin, projectId);
    const { PATCH } = await import("@/app/api/qc/inspections/[id]/route");
    const res = await PATCH(jreq("/x", { status: "passed" }, "PATCH"), {
      params: Promise.resolve({ id: String(insp.id) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string; approved_by: number }>(
      `SELECT status, approved_by FROM qc_inspections WHERE id = ?`,
      insp.id,
    );
    assert.equal(row?.status, "passed");
    assert.equal(row?.approved_by, admin.id);
  },
);

// ============================================================================
// GET/POST /api/proposals
// ============================================================================

test("GET /api/proposals: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/proposals/route");
  const res = await GET(jreq("/api/proposals", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/proposals: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("pxkind");
  const pm = await taoUser("pm", "pxkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/proposals/route");
  const res = await GET(jreq("/api/proposals?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/proposals: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("pxstatus");
  const pm = await taoUser("pm", "pxstatus");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/proposals/route");
  const res = await GET(jreq("/api/proposals?status=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test(
  "GET /api/proposals: engineer chỉ thấy đề xuất MÌNH tạo, không thấy của người khác",
  S,
  async () => {
    const projectId = await taoDuAn("pxmine");
    const eng1 = await taoUser("engineer", "pxmine1");
    const eng2 = await taoUser("engineer", "pxmine2");
    await dangNhapDuAn(eng1, projectId);
    const { POST } = await import("@/app/api/proposals/route");
    await POST(jreq("/api/proposals", { kind: "other", title: "Của eng1" }));

    await dangNhapDuAn(eng2, projectId);
    const { GET } = await import("@/app/api/proposals/route");
    const res = await GET(jreq("/api/proposals", undefined, "GET"));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).proposals, []);
  },
);

test("GET /api/proposals: PM/BCH thấy TẤT CẢ đề xuất (canSeeAllProposals)", S, async () => {
  const projectId = await taoDuAn("pxall");
  const eng = await taoUser("engineer", "pxall");
  const bch = await taoUser("bch", "pxall");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/route");
  await POST(jreq("/api/proposals", { kind: "other", title: "Của eng" }));

  await dangNhapDuAn(bch, projectId);
  const { GET } = await import("@/app/api/proposals/route");
  const res = await GET(jreq("/api/proposals", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).proposals.length, 1);
});

test("POST /api/proposals: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/proposals/route");
  const res = await POST(jreq("/api/proposals", { kind: "other", title: "x" }));
  assert.equal(res.status, 401);
});

test(
  "POST /api/proposals: bch không được tạo đề xuất (chỉ thao tác/quản lý) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("pxp403");
    const bch = await taoUser("bch", "pxp403");
    await dangNhapDuAn(bch, projectId);
    const { POST } = await import("@/app/api/proposals/route");
    const res = await POST(jreq("/api/proposals", { kind: "other", title: "x" }));
    assert.equal(res.status, 403);
  },
);

test("POST /api/proposals: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("pxbody");
  const pm = await taoUser("pm", "pxbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/route");
  const res = await POST(
    new NextRequest("http://localhost/api/proposals", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/proposals: thiếu tiêu đề → 422 (validateProposalInput)", S, async () => {
  const projectId = await taoDuAn("pxval");
  const pm = await taoUser("pm", "pxval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/proposals/route");
  const res = await POST(jreq("/api/proposals", { kind: "other", title: "" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/proposals: hợp đồng gắn kèm không tồn tại → 422 (checkProposalRefs)",
  S,
  async () => {
    const projectId = await taoDuAn("pxref");
    const pm = await taoUser("pm", "pxref");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/proposals/route");
    const res = await POST(
      jreq("/api/proposals", { kind: "payment", title: "x", contractId: 999999999 }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /Hợp đồng/);
  },
);

test(
  "POST /api/proposals: thành công → mã DX-000N tự sinh, project_id do SERVER suy",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("pxok");
    const pm = await taoUser("pm", "pxok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/proposals/route");
    const res = await POST(
      jreq("/api/proposals", { kind: "advance", title: "Đề xuất hợp lệ", amount: 1000000 }),
    );
    assert.equal(res.status, 201);
    const { id, code } = await res.json();
    assert.match(code, /^DX-/);
    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM proposals WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
  },
);

// ============================================================================
// GET/PATCH/DELETE /api/proposals/[id]
// ============================================================================

test("GET /api/proposals/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/proposals/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/proposals/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("gpxbad");
  const pm = await taoUser("pm", "gpxbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/proposals/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/proposals/:id: đề xuất thuộc dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("gpxisoA");
  const projectB = await taoDuAn("gpxisoB");
  const pmB = await taoUser("pm", "gpxisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/proposals/route");
  const created = await POST(jreq("/api/proposals", { kind: "other", title: "Của B" }));
  const { id } = await created.json();

  const pmA = await taoUser("pm", "gpxisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/proposals/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/proposals/:id: người KHÁC không phải creator/canSeeAll → 403", S, async () => {
  const projectId = await taoDuAn("gpx403");
  const eng1 = await taoUser("engineer", "gpx4031");
  const eng2 = await taoUser("engineer", "gpx4032");
  await dangNhapDuAn(eng1, projectId);
  const { POST } = await import("@/app/api/proposals/route");
  const created = await POST(jreq("/api/proposals", { kind: "other", title: "Của eng1" }));
  const { id } = await created.json();

  await dangNhapDuAn(eng2, projectId);
  const { GET } = await import("@/app/api/proposals/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/proposals/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/proposals/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/proposals/:id: đề xuất đã trình (submitted) — không sửa được nữa → 403",
  S,
  async () => {
    // Bất biến vòng đời: canEditProposal chỉ cho sửa khi còn 'draft'.
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("psub403x");
    const pm = await taoUser("pm", "psub403x");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/proposals/route");
    const created = await POST(jreq("/api/proposals", { kind: "other", title: "x" }));
    const { id } = await created.json();
    await run(`UPDATE proposals SET status = 'submitted' WHERE id = ?`, id);

    const { PATCH } = await import("@/app/api/proposals/[id]/route");
    const res = await PATCH(jreq("/x", { kind: "other", title: "Sửa chui" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/proposals/:id: người tạo sửa được khi còn nháp", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pokedit");
  const eng = await taoUser("engineer", "pokedit");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/route");
  const created = await POST(jreq("/api/proposals", { kind: "other", title: "Cũ" }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/proposals/[id]/route");
  const res = await PATCH(jreq("/x", { kind: "other", title: "Mới" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ title: string }>(`SELECT title FROM proposals WHERE id = ?`, id);
  assert.equal(row?.title, "Mới");
});

test("DELETE /api/proposals/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/proposals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test(
  "DELETE /api/proposals/:id: đề xuất đã trình (không phải nháp của mình) → 403 với người không phải admin",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("pdel403");
    const eng = await taoUser("engineer", "pdel403");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/proposals/route");
    const created = await POST(jreq("/api/proposals", { kind: "other", title: "x" }));
    const { id } = await created.json();
    await run(`UPDATE proposals SET status = 'submitted' WHERE id = ?`, id);

    const { DELETE } = await import("@/app/api/proposals/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/proposals/:id: admin xoá được kể cả đã trình", S, async () => {
  const { run, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pdeladmin");
  const eng = await taoUser("engineer", "pdeladmin");
  const admin = await taoUser("admin", "pdeladmin");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/proposals/route");
  const created = await POST(jreq("/api/proposals", { kind: "other", title: "x" }));
  const { id } = await created.json();
  await run(`UPDATE proposals SET status = 'submitted' WHERE id = ?`, id);

  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/proposals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM proposals WHERE id = ?`, id);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/design-changes
// ============================================================================

test("GET /api/design-changes: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/design-changes/route");
  const res = await GET(jreq("/api/design-changes", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/design-changes: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("dcstatus");
  const pm = await taoUser("pm", "dcstatus");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/design-changes/route");
  const res = await GET(jreq("/api/design-changes?status=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/design-changes: cách ly dự án — không thấy DC của dự án khác", S, async () => {
  const projectA = await taoDuAn("dcisoA");
  const projectB = await taoDuAn("dcisoB");
  const pmB = await taoUser("pm", "dcisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/design-changes/route");
  await POST(jreq("/api/design-changes", { title: "DC của B", reason: "Sai bản vẽ" }));

  const pmA = await taoUser("pm", "dcisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/design-changes/route");
  const res = await GET(jreq("/api/design-changes", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, []);
});

test("POST /api/design-changes: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/design-changes/route");
  const res = await POST(jreq("/api/design-changes", {}));
  assert.equal(res.status, 401);
});

test("POST /api/design-changes: subcon không được tạo (chỉ Admin/PM/kỹ sư) → 403", S, async () => {
  const projectId = await taoDuAn("dcp403");
  const sub = await taoUser("subcon", "dcp403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/design-changes/route");
  const res = await POST(jreq("/api/design-changes", { title: "x", reason: "y" }));
  assert.equal(res.status, 403);
});

test("POST /api/design-changes: body rỗng → 400", S, async () => {
  const projectId = await taoDuAn("dcbody");
  const pm = await taoUser("pm", "dcbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/route");
  const res = await POST(
    new NextRequest("http://localhost/api/design-changes", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test(
  "POST /api/design-changes: thiếu lý do thay đổi → 422 (validateDesignChangeInput)",
  S,
  async () => {
    const projectId = await taoDuAn("dcval");
    const pm = await taoUser("pm", "dcval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/design-changes/route");
    const res = await POST(jreq("/api/design-changes", { title: "Thiếu lý do", reason: "" }));
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/design-changes: systemId không hợp lệ → 422 (checkDesignChangeRefs)",
  S,
  async () => {
    const projectId = await taoDuAn("dcsysbad");
    const pm = await taoUser("pm", "dcsysbad");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/design-changes/route");
    const res = await POST(
      jreq("/api/design-changes", { title: "x", reason: "y", systemId: 999999999 }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /Hệ không hợp lệ/);
  },
);

test("POST /api/design-changes: thành công → mã DC-000N, project_id do SERVER suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("dcok");
  const eng = await taoUser("engineer", "dcok");
  const system = await taoSystem("dcok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/design-changes/route");
  const res = await POST(
    jreq("/api/design-changes", { title: "DC hợp lệ", reason: "Sai kích thước", systemId: system }),
  );
  assert.equal(res.status, 201);
  const { id, code } = await res.json();
  assert.match(code, /^DC-/);
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM design_changes WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/design-changes/[id]
// ============================================================================

test("GET /api/design-changes/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/design-changes/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/design-changes/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("gdcbad");
  const pm = await taoUser("pm", "gdcbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/design-changes/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/design-changes/:id: DC thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("gdcisoA");
  const projectB = await taoDuAn("gdcisoB");
  const pmB = await taoUser("pm", "gdcisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/design-changes/route");
  const created = await POST(jreq("/api/design-changes", { title: "DC B", reason: "Lý do" }));
  const { id } = await created.json();

  const pmA = await taoUser("pm", "gdcisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/design-changes/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/design-changes/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/design-changes/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/design-changes/:id: subcon không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("pdcsub403");
  const sub = await taoUser("subcon", "pdcsub403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/design-changes/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test(
  "PATCH /api/design-changes/:id: markDrawingUpdated khi CHƯA duyệt → 409 (không nhảy cóc trạng thái)",
  S,
  async () => {
    const projectId = await taoDuAn("dcnotapproved");
    const pm = await taoUser("pm", "dcnotapproved");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/design-changes/route");
    const created = await POST(jreq("/api/design-changes", { title: "x", reason: "y" }));
    const { id } = await created.json();

    const { PATCH } = await import("@/app/api/design-changes/[id]/route");
    const res = await PATCH(jreq("/x", { markDrawingUpdated: true }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 409);
  },
);

test(
  "PATCH /api/design-changes/:id: markDrawingUpdated sau khi ĐÃ duyệt → 200, status drawing_updated",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("dcapproved");
    const pm = await taoUser("pm", "dcapproved");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/design-changes/route");
    const created = await POST(jreq("/api/design-changes", { title: "x", reason: "y" }));
    const { id } = await created.json();
    await run(`UPDATE design_changes SET status = 'approved' WHERE id = ?`, id);

    const { PATCH } = await import("@/app/api/design-changes/[id]/route");
    const res = await PATCH(jreq("/x", { markDrawingUpdated: true }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "drawing_updated");
  },
);

test(
  "PATCH /api/design-changes/:id: đã có quyết định (approved) — không sửa metadata được nữa → 409",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("dcnoedit");
    const pm = await taoUser("pm", "dcnoedit");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/design-changes/route");
    const created = await POST(jreq("/api/design-changes", { title: "x", reason: "y" }));
    const { id } = await created.json();
    await run(`UPDATE design_changes SET status = 'approved' WHERE id = ?`, id);

    const { PATCH } = await import("@/app/api/design-changes/[id]/route");
    const res = await PATCH(jreq("/x", { title: "Sửa chui" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 409);
  },
);

test("PATCH /api/design-changes/:id: sửa metadata thành công khi còn 'submitted'", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("dcokedit");
  const pm = await taoUser("pm", "dcokedit");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/route");
  const created = await POST(jreq("/api/design-changes", { title: "Cũ", reason: "y" }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/design-changes/[id]/route");
  const res = await PATCH(jreq("/x", { title: "Mới", status: "assessing" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ title: string; status: string }>(
    `SELECT title, status FROM design_changes WHERE id = ?`,
    id,
  );
  assert.equal(row?.title, "Mới");
  assert.equal(row?.status, "assessing");
});

test("DELETE /api/design-changes/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/design-changes/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test(
  "DELETE /api/design-changes/:id: PM xoá DC đã có quyết định → 403 (chỉ Admin xoá được)",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("dcdel403");
    const pm = await taoUser("pm", "dcdel403");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/design-changes/route");
    const created = await POST(jreq("/api/design-changes", { title: "x", reason: "y" }));
    const { id } = await created.json();
    await run(`UPDATE design_changes SET status = 'approved' WHERE id = ?`, id);

    const { DELETE } = await import("@/app/api/design-changes/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/design-changes/:id: Admin xoá được dù đã có quyết định", S, async () => {
  const { run, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("dcdeladmin");
  const pm = await taoUser("pm", "dcdeladmin");
  const admin = await taoUser("admin", "dcdeladmin");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/design-changes/route");
  const created = await POST(jreq("/api/design-changes", { title: "x", reason: "y" }));
  const { id } = await created.json();
  await run(`UPDATE design_changes SET status = 'approved' WHERE id = ?`, id);

  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/design-changes/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM design_changes WHERE id = ?`, id);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/punch-list
// ============================================================================

test("GET /api/punch-list: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/punch-list/route");
  const res = await GET(jreq("/api/punch-list", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/punch-list: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("plstatus");
  const pm = await taoUser("pm", "plstatus");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/punch-list/route");
  const res = await GET(jreq("/api/punch-list?status=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/punch-list: severity không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("plsev");
  const pm = await taoUser("pm", "plsev");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/punch-list/route");
  const res = await GET(jreq("/api/punch-list?severity=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/punch-list: cách ly dự án — không thấy tồn tại của dự án khác", S, async () => {
  const projectA = await taoDuAn("plisoA");
  const projectB = await taoDuAn("plisoB");
  const pmB = await taoUser("pm", "plisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/punch-list/route");
  await POST(jreq("/api/punch-list", { description: "Tồn tại B", severity: "low" }));

  const pmA = await taoUser("pm", "plisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/punch-list/route");
  const res = await GET(jreq("/api/punch-list", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, []);
});

test("POST /api/punch-list: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/punch-list/route");
  const res = await POST(jreq("/api/punch-list", {}));
  assert.equal(res.status, 401);
});

test("POST /api/punch-list: subcon không được tạo (chỉ Admin/PM/kỹ sư) → 403", S, async () => {
  const projectId = await taoDuAn("plp403");
  const sub = await taoUser("subcon", "plp403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/punch-list/route");
  const res = await POST(jreq("/api/punch-list", { description: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/punch-list: handoverItemId thuộc dự án khác/không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("plhinvalid");
  const pm = await taoUser("pm", "plhinvalid");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/punch-list/route");
  const res = await POST(jreq("/api/punch-list", { description: "x", handoverItemId: 999999999 }));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Hạng mục bàn giao không tồn tại/);
});

test("POST /api/punch-list: assignee không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("plassignee");
  const pm = await taoUser("pm", "plassignee");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/punch-list/route");
  const res = await POST(jreq("/api/punch-list", { description: "x", assignee: 999999999 }));
  assert.equal(res.status, 422);
});

test("POST /api/punch-list: thành công → project_id do SERVER suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("plok");
  const eng = await taoUser("engineer", "plok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/punch-list/route");
  const res = await POST(
    jreq("/api/punch-list", { description: "Vết nứt tường", severity: "medium" }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM punch_list WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/punch-list/[id]
// ============================================================================

test("GET /api/punch-list/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/punch-list/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/punch-list/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("plgisoA");
  const projectB = await taoDuAn("plgisoB");
  const pmB = await taoUser("pm", "plgisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/punch-list/route");
  const created = await POST(jreq("/api/punch-list", { description: "Của B" }));
  const { id } = await created.json();

  const pmA = await taoUser("pm", "plgisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/punch-list/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/punch-list/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/punch-list/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/punch-list/:id: subcon không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("plpatch403");
  const sub = await taoUser("subcon", "plpatch403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/punch-list/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/punch-list/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("plpatch404");
  const pm = await taoUser("pm", "plpatch404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/punch-list/[id]/route");
  const res = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/punch-list/:id: đóng ('closed') rồi mở lại ('open') — route KHÔNG chặn (không có state machine khoá chiều ngược)",
  S,
  async () => {
    // Đọc lib/hien-truong/handover.ts + route: PATCH chỉ validate input, không có luật
    // cấm quay lại trạng thái trước đó (khác VO/PO có gate tuần tự) — khoá đúng hành vi
    // HIỆN TẠI để không hồi quy nếu sau này thêm luật mà quên chỗ khác.
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("plreopen");
    const pm = await taoUser("pm", "plreopen");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/punch-list/route");
    const created = await POST(jreq("/api/punch-list", { description: "x", status: "open" }));
    const { id } = await created.json();

    const { PATCH } = await import("@/app/api/punch-list/[id]/route");
    const close = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(close.status, 200);

    const reopen = await PATCH(jreq("/x", { status: "open" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(reopen.status, 200);
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM punch_list WHERE id = ?`,
      id,
    );
    assert.equal(row?.status, "open");
  },
);

test("DELETE /api/punch-list/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/punch-list/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/punch-list/:id: subcon không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("pldel403");
  const sub = await taoUser("subcon", "pldel403");
  await dangNhapDuAn(sub, projectId);
  const { DELETE } = await import("@/app/api/punch-list/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/punch-list/:id: thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pldelok");
  const pm = await taoUser("pm", "pldelok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/punch-list/route");
  const created = await POST(jreq("/api/punch-list", { description: "x" }));
  const { id } = await created.json();

  const { DELETE } = await import("@/app/api/punch-list/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM punch_list WHERE id = ?`, id);
  assert.equal(row, undefined);
});
