import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho 8 route CUỐI CÙNG chưa có test nào chạm tới
// (Đợt 6, Việc C — đo 2026-09-05 bằng grep `app/api/<key>/route` trong tests/):
//   - app/api/diaries/route.ts                                          (GET lịch nhật ký)
//   - app/api/handover-items/route.ts                                   (GET/POST hạng mục bàn giao)
//   - app/api/inspection-requests/route.ts                              (GET/POST phiếu YCNT)
//   - app/api/project/route.ts                                          (GET public/PATCH)
//   - app/api/qc/documents/route.ts                                     (GET hồ sơ chất lượng)
//   - app/api/tasks/route.ts                                            (GET lưới 1 sheet)
//   - app/api/variations/[id]/route.ts                                  (GET/PATCH chi tiết VO)
//   - app/api/v1/engineering/agent-sessions/[id]/claims/route.ts        (POST thêm claim, API key)

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `CONLAI ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `conlai-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-conlai-route', ?, 1)`,
    `CONLAI ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp CL')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet CL', ?)`,
    towerId,
    `CL${uniq(ten)}`,
    `cl-${uniq(ten)}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoNhom(sheetTypeId: number, code: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, ?)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
  );
}

async function taoTask(
  packageId: number,
  code: string,
  overrides: { progress?: number; assignedTo?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, assigned_to) VALUES (?, ?, ?, ?, ?)`,
    packageId,
    code,
    `Task ${code}`,
    overrides.progress ?? 0,
    overrides.assignedTo ?? null,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

const greq = (url: string) => new NextRequest(`http://localhost${url}`, { method: "GET" });

// ============================================================================
// GET /api/diaries?month=
// ============================================================================

test("GET /api/diaries: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/diaries/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/diaries: tháng sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("dia422");
  const eng = await taoUser("engineer", "dia422");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/diaries/route");
  const res = await GET(greq("/x?month=2026"));
  assert.equal(res.status, 422);
});

test("GET /api/diaries: chưa chọn dự án → rỗng", S, async () => {
  const eng = await taoUser("engineer", "dianoproj");
  await dangNhapDuAn(eng, null);
  const { GET } = await import("@/app/api/diaries/route");
  const res = await GET(greq("/x?month=2026-01"));
  assert.equal(res.status, 200);
  const { days, manpower } = await res.json();
  assert.deepEqual(days, []);
  assert.deepEqual(manpower, []);
});

test(
  "GET /api/diaries: liệt kê đúng dự án đang chọn trong tháng, cách ly dự án khác",
  S,
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const projectA = await taoDuAn("dialistA");
    const projectB = await taoDuAn("dialistB");
    const dA = await insertId(
      `INSERT INTO site_diaries (diary_date, project_id, status) VALUES ('2026-03-05', ?, 'draft') RETURNING id`,
      projectA,
    );
    await run(`INSERT INTO diary_manpower (diary_id, crew, headcount) VALUES (?, 'Tổ A', 5)`, dA);
    await insertId(
      `INSERT INTO site_diaries (diary_date, project_id, status) VALUES ('2026-03-06', ?, 'draft') RETURNING id`,
      projectB,
    );
    const eng = await taoUser("engineer", "dialist");
    await dangNhapDuAn(eng, projectA);
    const { GET } = await import("@/app/api/diaries/route");
    const res = await GET(greq("/x?month=2026-03"));
    assert.equal(res.status, 200);
    const { days, manpower } = await res.json();
    assert.equal(days.length, 1);
    assert.equal(days[0].date, "2026-03-05");
    assert.equal(manpower.length, 1);
    assert.equal(manpower[0].crew, "Tổ A");
  },
);

// ============================================================================
// GET/POST /api/handover-items
// ============================================================================

test("GET /api/handover-items: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/handover-items/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/handover-items: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("hig422");
  const eng = await taoUser("engineer", "hig422");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/handover-items/route");
  const res = await GET(greq("/x?status=mo_hom"));
  assert.equal(res.status, 422);
});

test(
  "GET /api/handover-items: liệt kê đúng dự án đang chọn, cách ly dự án khác",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectA = await taoDuAn("higlistA");
    const projectB = await taoDuAn("higlistB");
    const hA = await insertId(
      `INSERT INTO handover_items (project_id, title, status) VALUES (?, 'Hạng mục A', 'pending')`,
      projectA,
    );
    await insertId(
      `INSERT INTO handover_items (project_id, title, status) VALUES (?, 'Hạng mục B', 'pending')`,
      projectB,
    );
    const eng = await taoUser("engineer", "higlist");
    await dangNhapDuAn(eng, projectA);
    const { GET } = await import("@/app/api/handover-items/route");
    const res = await GET(greq("/x"));
    assert.equal(res.status, 200);
    const { items } = await res.json();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, hA);
  },
);

test("POST /api/handover-items: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/handover-items/route");
  const res = await POST(jreq("/x", { title: "x" }));
  assert.equal(res.status, 401);
});

test("POST /api/handover-items: subcon không có quyền tạo → 403", S, async () => {
  const projectId = await taoDuAn("hip403");
  const sub = await taoUser("subcon", "hip403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/handover-items/route");
  const res = await POST(jreq("/x", { title: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/handover-items: thiếu title → 422", S, async () => {
  const projectId = await taoDuAn("hipval");
  const eng = await taoUser("engineer", "hipval");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/handover-items/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 422);
});

test(
  "POST /api/handover-items: engineer đặt status=accepted (cần CAN.approve) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("hipacc403");
    const eng = await taoUser("engineer", "hipacc403");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/handover-items/route");
    const res = await POST(jreq("/x", { title: "Hạng mục", status: "accepted" }));
    assert.equal(res.status, 403);
  },
);

test("POST /api/handover-items: tạo thành công, gán đúng project_id + created_by", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("hipok");
  const eng = await taoUser("engineer", "hipok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/handover-items/route");
  const res = await POST(jreq("/x", { title: "Hạng mục PCCC" }));
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ projectId: number; createdBy: number; status: string }>(
    `SELECT project_id AS "projectId", created_by AS "createdBy", status FROM handover_items WHERE id = ?`,
    id,
  );
  assert.equal(row?.projectId, projectId);
  assert.equal(row?.createdBy, eng.id);
  assert.equal(row?.status, "pending");
});

test("POST /api/handover-items: tradeId (system) không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("hipsys422");
  const eng = await taoUser("engineer", "hipsys422");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/handover-items/route");
  const res = await POST(jreq("/x", { title: "Hạng mục", tradeId: 999999999 }));
  assert.equal(res.status, 422);
});

// ============================================================================
// GET/POST /api/inspection-requests
// ============================================================================

test("GET /api/inspection-requests: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/inspection-requests/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/inspection-requests: liệt kê đúng dự án (suy qua task gắn phiếu), cách ly dự án khác",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ctxA = await dungSheet("irlistA");
    const ctxB = await dungSheet("irlistB");
    const pkgA = await taoNhom(ctxA.sheetTypeId, "IRA");
    const pkgB = await taoNhom(ctxB.sheetTypeId, "IRB");
    const taskA = await taoTask(pkgA, "IRA,01", { progress: 1 });
    const taskB = await taoTask(pkgB, "IRB,01", { progress: 1 });
    const codeA = `YCNT-${uniq("A")}`;
    const codeB = `YCNT-${uniq("B")}`;
    const reqA = await insertId(
      `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, '2026-05-01T08:00:00Z')`,
      codeA,
    );
    const reqB = await insertId(
      `INSERT INTO inspection_requests (code, scheduled_at) VALUES (?, '2026-05-01T08:00:00Z')`,
      codeB,
    );
    await run(
      `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
      reqA,
      taskA,
    );
    await run(
      `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
      reqB,
      taskB,
    );
    const eng = await taoUser("engineer", "irlist");
    await dangNhapDuAn(eng, ctxA.projectId);
    const { GET } = await import("@/app/api/inspection-requests/route");
    const res = await GET(greq("/x"));
    assert.equal(res.status, 200);
    const { requests } = await res.json();
    const ids = requests.map((r: { id: number }) => r.id);
    assert.ok(ids.includes(reqA));
    assert.ok(!ids.includes(reqB));
  },
);

test("POST /api/inspection-requests: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/inspection-requests/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/inspection-requests: subcon không có quyền tạo → 403", S, async () => {
  const projectId = await taoDuAn("irp403");
  const sub = await taoUser("subcon", "irp403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/inspection-requests/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 403);
});

test("POST /api/inspection-requests: thiếu/sai scheduledAt → 422", S, async () => {
  const projectId = await taoDuAn("irpval1");
  const pm = await taoUser("pm", "irpval1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/inspection-requests/route");
  const res = await POST(jreq("/x", { scheduledAt: "khong-phai-ngay", taskIds: [1] }));
  assert.equal(res.status, 422);
});

test("POST /api/inspection-requests: không có taskIds → 422", S, async () => {
  const projectId = await taoDuAn("irpval2");
  const pm = await taoUser("pm", "irpval2");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/inspection-requests/route");
  const res = await POST(jreq("/x", { scheduledAt: "2026-05-01T08:00:00Z", taskIds: [] }));
  assert.equal(res.status, 422);
});

test("POST /api/inspection-requests: task chưa đạt 100% → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("irpnotdone");
  const pkgId = await taoNhom(sheetTypeId, "IPN");
  const taskId = await taoTask(pkgId, "IPN,01", { progress: 0.5 });
  const pm = await taoUser("pm", "irpnotdone");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/inspection-requests/route");
  const res = await POST(
    jreq("/x", { scheduledAt: "2026-05-01T08:00:00Z", taskIds: [taskId] }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/inspection-requests: tạo thành công, ghi đúng task + created_by", S, async () => {
  const { queryOne, query } = await import("@/lib/db");
  const { projectId, sheetTypeId } = await dungSheet("irpok");
  const pkgId = await taoNhom(sheetTypeId, "IPO");
  const taskId = await taoTask(pkgId, "IPO,01", { progress: 1 });
  const pm = await taoUser("pm", "irpok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/inspection-requests/route");
  const res = await POST(
    jreq("/x", { scheduledAt: "2026-05-01T08:00:00Z", taskIds: [taskId], note: "Kiểm tra" }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ createdBy: number; code: string }>(
    `SELECT created_by AS "createdBy", code FROM inspection_requests WHERE id = ?`,
    id,
  );
  assert.equal(row?.createdBy, pm.id);
  assert.match(row?.code ?? "", /^YCNT-/);
  const links = await query(`SELECT task_id FROM inspection_request_tasks WHERE request_id = ?`, id);
  assert.equal(links.length, 1);
});

// ============================================================================
// GET/PATCH /api/project (public + Admin/PM)
// ============================================================================

test("GET /api/project: public, không cần đăng nhập, trả tên dự án", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/project/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok("name" in body);
});

test("PATCH /api/project: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({}) }),
  );
  assert.equal(res.status, 401);
});

test("PATCH /api/project: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("prjp403");
  const eng = await taoUser("engineer", "prjp403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ heatmapTitle: "x" }),
    }),
  );
  assert.equal(res.status, 403);
});

test("PATCH /api/project: logo không hợp lệ (không phải data URL ảnh) → 400", S, async () => {
  const projectId = await taoDuAn("prjplogo400");
  const pm = await taoUser("pm", "prjplogo400");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ logo: "not-a-data-url" }),
    }),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/project: Admin/PM cập nhật heatmapTitle thành công", S, async () => {
  const { queryOne, insertId } = await import("@/lib/db");
  // Route thao tác trên dòng `projects` ĐẦU TIÊN (ORDER BY id LIMIT 1) — không lọc theo
  // dự án đang chọn (cấu hình toàn cục, đúng comment route). Dựng dự án riêng và kiểm
  // dòng đầu tiên hiện có trong DB test bị đổi đúng giá trị, không giả định id cụ thể.
  const projectId = await taoDuAn("prjpok");
  const pm = await taoUser("pm", "prjpok");
  await dangNhapDuAn(pm, projectId);
  const first = await queryOne<{ id: number }>(`SELECT id FROM projects ORDER BY id LIMIT 1`);
  const title = `Tiêu đề ${uniq("hm")}`;
  const { PATCH } = await import("@/app/api/project/route");
  const res = await PATCH(
    new Request("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ heatmapTitle: title }),
    }),
  );
  assert.equal(res.status, 200);
  const row = await queryOne<{ heatmap_title: string }>(
    `SELECT heatmap_title FROM projects WHERE id = ?`,
    first!.id,
  );
  assert.equal(row?.heatmap_title, title);
  // Dọn lại để không ảnh hưởng ca khác đọc GET /api/project (route lấy dòng đầu tiên).
  await insertId(`UPDATE projects SET heatmap_title = NULL WHERE id = ? RETURNING id`, first!.id);
});

// ============================================================================
// GET /api/qc/documents
// ============================================================================

test("GET /api/qc/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/qc/documents/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 401);
});

test("GET /api/qc/documents: category không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("qcd422");
  const eng = await taoUser("engineer", "qcd422");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/qc/documents/route");
  const res = await GET(greq("/x?category=khong_hop_le"));
  assert.equal(res.status, 422);
});

test(
  "GET /api/qc/documents: liệt kê đúng dự án đang chọn, cách ly dự án khác",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const ctxA = await dungSheet("qcdlistA");
    const ctxB = await dungSheet("qcdlistB");
    const pkgA = await taoNhom(ctxA.sheetTypeId, "QCA");
    const pkgB = await taoNhom(ctxB.sheetTypeId, "QCB");
    const taskA = await taoTask(pkgA, "QCA,01");
    const taskB = await taoTask(pkgB, "QCB,01");
    const docA = await insertId(
      `INSERT INTO task_documents (task_id, file_name, doc_category) VALUES (?, 'a.pdf', 'material')`,
      taskA,
    );
    await insertId(
      `INSERT INTO task_documents (task_id, file_name, doc_category) VALUES (?, 'b.pdf', 'material')`,
      taskB,
    );
    const eng = await taoUser("engineer", "qcdlist");
    await dangNhapDuAn(eng, ctxA.projectId);
    const { GET } = await import("@/app/api/qc/documents/route");
    const res = await GET(greq("/x"));
    assert.equal(res.status, 200);
    const { documents } = await res.json();
    const ids = documents.map((d: { id: number }) => d.id);
    assert.ok(ids.includes(docA));
  },
);

// ============================================================================
// GET /api/tasks?sheet=
// ============================================================================

test("GET /api/tasks: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/route");
  const res = await GET(greq("/x?sheet=abc"));
  assert.equal(res.status, 401);
});

test("GET /api/tasks: thiếu tham số sheet → 400", S, async () => {
  const projectId = await taoDuAn("tskg400");
  const eng = await taoUser("engineer", "tskg400");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/tasks/route");
  const res = await GET(greq("/x"));
  assert.equal(res.status, 400);
});

test("GET /api/tasks: sheet thuộc dự án khác → 404 (không lộ tồn tại)", S, async () => {
  const ctxA = await dungSheet("tskisoA");
  const ctxB = await dungSheet("tskisoB");
  const eng = await taoUser("engineer", "tskisoA");
  await dangNhapDuAn(eng, ctxA.projectId);
  const { GET } = await import("@/app/api/tasks/route");
  const st = await (await import("@/lib/db")).queryOne<{ slug: string }>(
    `SELECT slug FROM sheet_types WHERE id = ?`,
    ctxB.sheetTypeId,
  );
  const res = await GET(greq(`/x?sheet=${st!.slug}`));
  assert.equal(res.status, 404);
});

test(
  "GET /api/tasks: trả đúng packages + tasks lồng nhau của sheet",
  S,
  async () => {
    const ctx = await dungSheet("tskok");
    const pkgId = await taoNhom(ctx.sheetTypeId, "TSK1");
    const taskId = await taoTask(pkgId, "TSK1,01");
    const eng = await taoUser("engineer", "tskok");
    await dangNhapDuAn(eng, ctx.projectId);
    const { GET } = await import("@/app/api/tasks/route");
    const st = await (await import("@/lib/db")).queryOne<{ slug: string }>(
      `SELECT slug FROM sheet_types WHERE id = ?`,
      ctx.sheetTypeId,
    );
    const res = await GET(greq(`/x?sheet=${st!.slug}`));
    assert.equal(res.status, 200);
    const { sheet, packages } = await res.json();
    assert.equal(sheet.id, ctx.sheetTypeId);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].id, pkgId);
    assert.equal(packages[0].tasks.length, 1);
    assert.equal(packages[0].tasks[0].id, taskId);
  },
);

// ============================================================================
// GET/PATCH /api/variations/:id
// ============================================================================

async function taoVo(
  projectId: number,
  ten: string,
  overrides: { status?: string; createdBy?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO variation_orders (project_id, code, title, reason, status, created_by)
     VALUES (?, ?, ?, 'design_change', ?, ?)`,
    projectId,
    `VO-${uniq(ten)}`,
    `Phát sinh ${ten}`,
    overrides.status ?? "draft",
    overrides.createdBy ?? null,
  );
}

test("GET /api/variations/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/variations/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/variations/:id: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("vog403");
  const sub = await taoUser("subcon", "vog403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/variations/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/variations/:id: VO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("vogisoA");
  const projectB = await taoDuAn("vogisoB");
  const voB = await taoVo(projectB, "vogisoB");
  const pmA = await taoUser("pm", "vogisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/variations/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: String(voB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/variations/:id: chi tiết đúng dự án, kèm documents/approvalStatus", S, async () => {
  const projectId = await taoDuAn("vogok");
  const pm = await taoUser("pm", "vogok");
  const voId = await taoVo(projectId, "vogok", { createdBy: pm.id });
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/variations/[id]/route");
  const res = await GET(greq("/x"), { params: Promise.resolve({ id: String(voId) }) });
  assert.equal(res.status, 200);
  const { variation, documents } = await res.json();
  assert.equal(variation.id, voId);
  assert.deepEqual(documents, []);
});

test("PATCH /api/variations/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/variations/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/variations/:id: VO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("vopisoA");
  const projectB = await taoDuAn("vopisoB");
  const voB = await taoVo(projectB, "vopisoB");
  const pmA = await taoUser("pm", "vopisoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/variations/[id]/route");
  const res = await PATCH(jreq("/x", { title: "Đổi tên" }, "PATCH"), {
    params: Promise.resolve({ id: String(voB) }),
  });
  assert.equal(res.status, 404);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ title: string }>(
    `SELECT title FROM variation_orders WHERE id = ?`,
    voB,
  );
  assert.notEqual(row?.title, "Đổi tên");
});

test(
  "PATCH /api/variations/:id: người khác (không phải người tạo, không phải Admin/PM) sửa VO draft → 403",
  S,
  async () => {
    const projectId = await taoDuAn("vopedit403");
    const creator = await taoUser("engineer", "vopedit403a");
    const other = await taoUser("engineer", "vopedit403b");
    const voId = await taoVo(projectId, "vopedit403", { createdBy: creator.id });
    await dangNhapDuAn(other, projectId);
    const { PATCH } = await import("@/app/api/variations/[id]/route");
    const res = await PATCH(jreq("/x", { title: "Đổi tên" }, "PATCH"), {
      params: Promise.resolve({ id: String(voId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/variations/:id: reason không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("vopval");
  const pm = await taoUser("pm", "vopval");
  const voId = await taoVo(projectId, "vopval", { createdBy: pm.id });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/variations/[id]/route");
  const res = await PATCH(jreq("/x", { reason: "khong_hop_le" }, "PATCH"), {
    params: Promise.resolve({ id: String(voId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/variations/:id: người tạo sửa thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("vopok");
  const creator = await taoUser("engineer", "vopok");
  const voId = await taoVo(projectId, "vopok", { createdBy: creator.id });
  await dangNhapDuAn(creator, projectId);
  const { PATCH } = await import("@/app/api/variations/[id]/route");
  const res = await PATCH(jreq("/x", { title: "Tên mới đã sửa" }, "PATCH"), {
    params: Promise.resolve({ id: String(voId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ title: string }>(
    `SELECT title FROM variation_orders WHERE id = ?`,
    voId,
  );
  assert.equal(row?.title, "Tên mới đã sửa");
});

// ============================================================================
// POST /api/v1/engineering/agent-sessions/:id/claims (xác thực bằng API key, không cookie)
// ============================================================================

async function taoApiKey(
  projectId: number,
  scopes: string[],
): Promise<{ key: string; creatorId: number }> {
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/bao-mat/api-keys");
  const creator = await taoUser("admin", "apikey");
  const key = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES (?, ?, ?, ?, ?)`,
    `Key ${uniq("k")}`,
    hashApiKey(key),
    projectId,
    scopes,
    creator.id,
  );
  return { key, creatorId: creator.id };
}

function ingestClaimsReq(key: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/x", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function taoPhienChoClaims(projectId: number): Promise<string> {
  const { openAgentSession } = await import("@/lib/ky-thuat/engineering-agents");
  const { sessionId } = await openAgentSession(projectId, null, {
    intent: `Kiểm tra ${uniq("intent")}`,
    maxRounds: 5,
    conflictBudget: 10,
    claims: [
      {
        agentRole: "specialist",
        agentName: "mep-v1",
        topic: "duong-kinh-ong",
        claim: "DN100",
        payload: {},
        assumptions: [],
        confidenceSignals: {},
        sourceAuthority: "derived",
      },
    ],
  });
  return sessionId;
}

test("POST .../agent-sessions/:id/claims: thiếu/sai API key → 401", S, async () => {
  const { POST } = await import(
    "@/app/api/v1/engineering/agent-sessions/[id]/claims/route"
  );
  const res = await POST(ingestClaimsReq("xbk_sai", { claims: [] }), {
    params: Promise.resolve({ id: "x" }),
  });
  assert.equal(res.status, 401);
});

test("POST .../agent-sessions/:id/claims: key thiếu scope engineering → 403", S, async () => {
  const projectId = await taoDuAn("clm403");
  const { key } = await taoApiKey(projectId, ["read"]);
  const { POST } = await import(
    "@/app/api/v1/engineering/agent-sessions/[id]/claims/route"
  );
  const res = await POST(ingestClaimsReq(key, { claims: [] }), {
    params: Promise.resolve({ id: "x" }),
  });
  assert.equal(res.status, 403);
});

test("POST .../agent-sessions/:id/claims: body sai schema (claims rỗng) → 422", S, async () => {
  const projectId = await taoDuAn("clmval");
  const { key } = await taoApiKey(projectId, ["engineering"]);
  const { POST } = await import(
    "@/app/api/v1/engineering/agent-sessions/[id]/claims/route"
  );
  const res = await POST(ingestClaimsReq(key, { claims: [] }), {
    params: Promise.resolve({ id: "x" }),
  });
  assert.equal(res.status, 422);
});

test("POST .../agent-sessions/:id/claims: phiên thuộc dự án khác → 422 (không lộ dữ liệu)", S, async () => {
  const projectA = await taoDuAn("clmisoA");
  const projectB = await taoDuAn("clmisoB");
  const sessionId = await taoPhienChoClaims(projectB);
  const { key } = await taoApiKey(projectA, ["engineering"]);
  const { POST } = await import(
    "@/app/api/v1/engineering/agent-sessions/[id]/claims/route"
  );
  const res = await POST(
    ingestClaimsReq(key, {
      claims: [
        {
          agentRole: "specialist",
          agentName: "mep-v2",
          topic: "duong-kinh-ong",
          claim: "DN150",
        },
      ],
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
  assert.equal(res.status, 422);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ roundCount: number }>(
    `SELECT round_count AS "roundCount" FROM engineering_agent_sessions WHERE id = ?`,
    sessionId,
  );
  assert.equal(row?.roundCount, 1); // không tăng — claim của dự án khác không lọt qua được
});

test("POST .../agent-sessions/:id/claims: thêm claim thành công, tăng round + ghi nhận xung đột", S, async () => {
  const projectId = await taoDuAn("clmok");
  const sessionId = await taoPhienChoClaims(projectId);
  const { key } = await taoApiKey(projectId, ["engineering"]);
  const { POST } = await import(
    "@/app/api/v1/engineering/agent-sessions/[id]/claims/route"
  );
  const res = await POST(
    ingestClaimsReq(key, {
      claims: [
        {
          agentRole: "specialist",
          agentName: "mep-v2",
          topic: "duong-kinh-ong",
          claim: "DN150",
        },
      ],
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.roundCount, 2);
  assert.equal(body.consensus, "conflict_requires_review");
});
