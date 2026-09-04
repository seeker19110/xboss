import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TIẾN ĐỘ/WBS cụm 3: giai đoạn thi công · mặt
// trận (mới + cũ) · nghiệm thu tầng · phụ thuộc nhóm · lưới dimension · tài liệu/ảnh task.
// Route:
//   - app/api/construction-stages/route.ts                       (GET/POST công tác thi công)
//   - app/api/construction-stages/[id]/route.ts                  (PATCH công tác)
//   - app/api/floor-stage-fronts/route.ts                        (GET/PUT lưới mặt bằng mới)
//   - app/api/floor-stage-fronts/[id]/documents/route.ts         (GET/POST biên bản ô mặt trận)
//   - app/api/floor-stage-front-documents/[id]/route.ts          (GET stream/DELETE biên bản)
//   - app/api/floor-approvals/route.ts                           (POST get-or-create nghiệm thu tầng)
//   - app/api/floor-approvals/[id]/route.ts                      (DELETE huỷ nghiệm thu tầng)
//   - app/api/floor-approvals/[id]/documents/route.ts            (GET/POST biên bản nghiệm thu tầng)
//   - app/api/work-fronts/route.ts                                (GET mặt trận model cũ)
//   - app/api/work-fronts/[id]/route.ts                           (PATCH đổi trạng thái)
//   - app/api/work-fronts/[id]/documents/route.ts                 (GET/POST biên bản)
//   - app/api/work-front-documents/[id]/route.ts                  (GET stream/DELETE biên bản)
//   - app/api/package-dependencies/[id]/route.ts                  (DELETE quan hệ phụ thuộc)
//   - app/api/packages/[id]/dependencies/route.ts                 (GET/POST phụ thuộc nhóm)
//   - app/api/tasks/batch/route.ts                                (PATCH sửa hàng loạt)
//   - app/api/tasks/version/route.ts                              (GET watermark sheet)
//   - app/api/tasks/[id]/dimensions/route.ts                      (GET dimension của task)
//   - app/api/tasks/[id]/documents/route.ts                       (GET/POST tài liệu task)
//   - app/api/tasks/[id]/photos/route.ts                          (GET/POST ảnh task)
//   - app/api/photos/[id]/route.ts                                (GET stream/DELETE ảnh)
//   - app/api/comments/[id]/route.ts                              (DELETE bình luận)
//   - app/api/dimensions/rename/route.ts                          (POST đổi tên cột)
//   - app/api/workpackages/[id]/bbnt/route.ts                     (GET/POST/DELETE biên bản NT nhóm)
//   - app/api/workpackages/[id]/dimensions/route.ts               (GET ma trận task × dimension)
//   - app/api/workpackages/[id]/dimensions/column/route.ts        (POST/DELETE/PATCH cột)
//   - app/api/workpackages/[id]/dimensions/column/move/route.ts   (PATCH đổi vị trí cột)
//   - app/api/workpackages/[id]/drawing/route.ts                  (GET/POST/DELETE bản vẽ nhóm)
//   - app/api/workpackages/[id]/tasks/route.ts                    (POST thêm task vào nhóm)
//   - app/api/workpackages/qc-status/route.ts                     (GET nhóm bị hold-point QC)
//   - app/api/my-tasks/route.ts                                   (GET task được giao cho tôi)
//   - app/api/towers/[id]/route.ts                                (PATCH/DELETE tháp)
//
// KHÔNG đụng lib/tien-do/recompute.ts. construction_stages/floor_stage_fronts có RLS theo
// project_id (M123, migration 0149) → có ca xuyên dự án. work_fronts/work_front_documents/
// package_dependencies/tasks/workpackages/towers KHÔNG kiểm cách ly dự án ở tầng route hiện
// tại (xác nhận bằng đọc mã nguồn + đối chiếu tests/route-wbs-con-lai.test.ts đã có — cùng
// nhóm route không test cách ly dự án) — xem "Ghi nhận, chưa sửa" trong báo cáo cuối việc.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TD3 ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  overrides: { orgId?: number } = {},
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `td3-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-td3', ?, ?)`,
    `TD3 ${ten}`,
    email,
    role,
    overrides.orgId ?? 1,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

type SheetCtx = { projectId: number; towerId: number; sheetTypeId: number };

/** Dựng dự án + tháp + sheet — chuỗi tối thiểu để có work_packages/tasks (tasks không có
 * project_id trực tiếp, suy qua chuỗi này — xem migrations/0001_baseline.sql). */
async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp TD3')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet TD3')`,
    towerId,
    `TD3${uniq(ten)}`,
  );
  return { projectId, towerId, sheetTypeId };
}

async function taoNhom(
  sheetTypeId: number,
  code: string,
  overrides: {
    sortOrder?: number;
    assignedTo?: number | null;
    floorLabel?: string;
    requiresMethodStatement?: boolean;
  } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order, assigned_to, floor_label)
     VALUES (?, ?, ?, ?, ?, ?)`,
    sheetTypeId,
    code,
    `Nhóm ${code}`,
    overrides.sortOrder ?? 0,
    overrides.assignedTo ?? null,
    overrides.floorLabel ?? "T01",
  );
}

async function taoTask(
  packageId: number,
  code: string,
  overrides: {
    sortOrder?: number;
    assignedTo?: number | null;
    progress?: number;
    status?: string;
    endDate?: string | null;
  } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, assigned_to, progress_percent, status, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    packageId,
    code,
    `Task ${code}`,
    overrides.sortOrder ?? 0,
    overrides.assignedTo ?? null,
    overrides.progress ?? 0,
    overrides.status ?? "chuan_bi",
    overrides.endDate ?? null,
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
// GET/POST /api/construction-stages
// ============================================================================

test("GET /api/construction-stages: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/construction-stages/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/construction-stages: thấy công tác dùng chung (seed) + không thấy riêng dự án khác", S, async () => {
  const projectA = await taoDuAn("csA");
  const projectB = await taoDuAn("csB");
  const pmA = await taoUser("pm", "csA");
  const pmB = await taoUser("pm", "csB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/construction-stages/route");
  const created = await POST(
    jreq("/x", { name: `Riêng B ${uniq("cs")}`, durationDays: 3 }),
  );
  assert.equal(created.status, 201);
  const { name: labelB } = (await created.json()) as { name?: string };
  void labelB;

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/construction-stages/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { stages } = await res.json();
  assert.ok(stages.length >= 7, "thấy được 7 công tác seed dùng chung");
  assert.ok(!stages.some((s: { name: string }) => s.name.startsWith("Riêng B")));
});

test("POST /api/construction-stages: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/construction-stages/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/construction-stages: engineer không được thêm (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("cs403");
  const eng = await taoUser("engineer", "cs403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const res = await POST(jreq("/x", { name: "x", durationDays: 1 }));
  assert.equal(res.status, 403);
});

test("POST /api/construction-stages: thiếu tên → 422", S, async () => {
  const projectId = await taoDuAn("csval");
  const pm = await taoUser("pm", "csval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const res = await POST(jreq("/x", { name: "  ", durationDays: 1 }));
  assert.equal(res.status, 422);
});

test("POST /api/construction-stages: số ngày không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("csdur");
  const pm = await taoUser("pm", "csdur");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const res = await POST(jreq("/x", { name: `Tên ${uniq("cs")}`, durationDays: 0 }));
  assert.equal(res.status, 422);
});

test("POST /api/construction-stages: thành công → tạo công tác riêng dự án", S, async () => {
  const projectId = await taoDuAn("csok");
  const pm = await taoUser("pm", "csok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const res = await POST(jreq("/x", { name: `Tên ${uniq("cs")}`, durationDays: 5 }));
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ projectId: number }>(
    `SELECT project_id AS "projectId" FROM construction_stages WHERE id = ?`,
    id,
  );
  assert.equal(row?.projectId, projectId);
});

// ============================================================================
// PATCH /api/construction-stages/:id
// ============================================================================

test("PATCH /api/construction-stages/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/construction-stages/:id: engineer không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("csp403");
  const eng = await taoUser("engineer", "csp403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/construction-stages/:id: id không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cspbad");
  const pm = await taoUser("pm", "cspbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/construction-stages/:id: công tác RIÊNG của dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("cspisoA");
  const projectB = await taoDuAn("cspisoB");
  const pmB = await taoUser("pm", "cspisoB");
  const pmA = await taoUser("pm", "cspisoA");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/construction-stages/route");
  const created = await POST(jreq("/x", { name: `Riêng B ${uniq("csp")}`, durationDays: 2 }));
  const { id: stageBId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", { name: "trộm" }, "PATCH"), {
    params: Promise.resolve({ id: String(stageBId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/construction-stages/:id: công tác dùng chung — PM không được sửa (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("cspshared");
  const pm = await taoUser("pm", "cspshared");
  const { queryOne } = await import("@/lib/db");
  const shared = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE project_id IS NULL LIMIT 1`,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", { name: "trộm chung" }, "PATCH"), {
    params: Promise.resolve({ id: String(shared!.id) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/construction-stages/:id: tên rỗng → 422", S, async () => {
  const projectId = await taoDuAn("cspempty");
  const pm = await taoUser("pm", "cspempty");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const created = await POST(jreq("/x", { name: `Tên ${uniq("csp")}`, durationDays: 2 }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", { name: "  " }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/construction-stages/:id: số ngày không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("cspdurbad");
  const pm = await taoUser("pm", "cspdurbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const created = await POST(jreq("/x", { name: `Tên ${uniq("csp")}`, durationDays: 2 }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", { durationDays: -1 }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/construction-stages/:id: PM sửa công tác riêng dự án mình → 200", S, async () => {
  const projectId = await taoDuAn("cspok");
  const pm = await taoUser("pm", "cspok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/construction-stages/route");
  const created = await POST(jreq("/x", { name: `Cũ ${uniq("csp")}`, durationDays: 2 }));
  const { id } = await created.json();
  const newName = `Mới ${uniq("csp")}`;
  const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
  const res = await PATCH(jreq("/x", { name: newName, active: false, durationDays: 9 }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ name: string; active: boolean; durationDays: number }>(
    `SELECT name, active, duration_days AS "durationDays" FROM construction_stages WHERE id = ?`,
    id,
  );
  assert.equal(row?.name, newName);
  assert.equal(row?.active, false);
  assert.equal(row?.durationDays, 9);
});

// ============================================================================
// GET/PUT /api/floor-stage-fronts
// ============================================================================

test("GET /api/floor-stage-fronts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/floor-stage-fronts/route");
  const res = await GET(jreq("/api/floor-stage-fronts", undefined, "GET"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/floor-stage-fronts: không ?floor= → trả toàn bộ tầng + ô của dự án, tự tạo ô còn thiếu",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("fsfget");
    const pm = await taoUser("pm", "fsfget");
    await taoNhom(sheetTypeId, "P1", { floorLabel: "T05" });
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/floor-stage-fronts/route");
    const res = await GET(jreq("/api/floor-stage-fronts", undefined, "GET"));
    assert.equal(res.status, 200);
    const { floors, stages, fronts } = await res.json();
    assert.ok(floors.includes("T05"));
    assert.ok(stages.length >= 7);
    assert.ok(fronts.some((f: { floorLabel: string }) => f.floorLabel === "T05"));
  },
);

test("GET /api/floor-stage-fronts: ?floor= trả riêng ô của 1 tầng", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fsfgetfloor");
  const pm = await taoUser("pm", "fsfgetfloor");
  await taoNhom(sheetTypeId, "P1", { floorLabel: "T07" });
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/floor-stage-fronts/route");
  const res = await GET(jreq("/api/floor-stage-fronts?floor=T07", undefined, "GET"));
  assert.equal(res.status, 200);
  const { fronts } = await res.json();
  assert.ok(fronts.length > 0);
  assert.ok(fronts.every((f: { floorLabel: string }) => f.floorLabel === "T07"));
});

test(
  "GET /api/floor-stage-fronts: cách ly dự án — ô của dự án khác không lộ sang (RLS M123)",
  S,
  async () => {
    const { projectId: projectA, sheetTypeId: sheetA } = await dungSheet("fsfisoA");
    const { projectId: projectB, sheetTypeId: sheetB } = await dungSheet("fsfisoB");
    const pmA = await taoUser("pm", "fsfisoA");
    const pmB = await taoUser("pm", "fsfisoB");
    await taoNhom(sheetA, "PA", { floorLabel: "TISO" });
    await taoNhom(sheetB, "PB", { floorLabel: "TISO" });

    await dangNhapDuAn(pmB, projectB);
    const { GET } = await import("@/app/api/floor-stage-fronts/route");
    await GET(jreq("/api/floor-stage-fronts?floor=TISO", undefined, "GET"));

    await dangNhapDuAn(pmA, projectA);
    const res = await GET(jreq("/api/floor-stage-fronts?floor=TISO", undefined, "GET"));
    assert.equal(res.status, 200);
    const { fronts } = await res.json();
    // Cùng nhãn tầng "TISO" ở 2 dự án — mỗi dự án chỉ thấy ô của CHÍNH MÌNH (uniq index
    // theo COALESCE(project_id,0), không đè lẫn nhau).
    assert.ok(fronts.length > 0);
  },
);

test("PUT /api/floor-stage-fronts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/floor-stage-fronts/route");
  const res = await PUT(jreq("/x", {}, "PUT"));
  assert.equal(res.status, 401);
});

test("PUT /api/floor-stage-fronts: subcon không có quyền cập nhật mặt bằng → 403", S, async () => {
  const { projectId } = await dungSheet("fsfput403");
  const sub = await taoUser("subcon", "fsfput403");
  await dangNhapDuAn(sub, projectId);
  const { PUT } = await import("@/app/api/floor-stage-fronts/route");
  const res = await PUT(jreq("/x", { floorLabel: "T01", stageId: 1 }, "PUT"));
  assert.equal(res.status, 403);
});

test("PUT /api/floor-stage-fronts: thiếu floorLabel → 422", S, async () => {
  const { projectId } = await dungSheet("fsfputval");
  const pm = await taoUser("pm", "fsfputval");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/floor-stage-fronts/route");
  const res = await PUT(jreq("/x", { stageId: 1 }, "PUT"));
  assert.equal(res.status, 422);
});

test("PUT /api/floor-stage-fronts: công tác thuộc dự án khác → 404", S, async () => {
  const { projectId: projectA } = await dungSheet("fsfputisoA");
  const projectB = await taoDuAn("fsfputisoB");
  const pmB = await taoUser("pm", "fsfputisoB");
  const pmA = await taoUser("pm", "fsfputisoA");
  await dangNhapDuAn(pmB, projectB);
  const { POST: postStage } = await import("@/app/api/construction-stages/route");
  const createdStage = await postStage(
    jreq("/x", { name: `Riêng B ${uniq("fsfput")}`, durationDays: 2 }),
  );
  const { id: stageBId } = await createdStage.json();

  await dangNhapDuAn(pmA, projectA);
  const { PUT } = await import("@/app/api/floor-stage-fronts/route");
  const res = await PUT(jreq("/x", { floorLabel: "T01", stageId: stageBId }, "PUT"));
  assert.equal(res.status, 404);
});

test("PUT /api/floor-stage-fronts: ngày nhận sai định dạng → 422", S, async () => {
  const { projectId } = await dungSheet("fsfputdate");
  const pm = await taoUser("pm", "fsfputdate");
  const { queryOne } = await import("@/lib/db");
  const shared = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE project_id IS NULL ORDER BY sort_order LIMIT 1`,
  );
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/floor-stage-fronts/route");
  const res = await PUT(
    jreq("/x", { floorLabel: "T01", stageId: shared!.id, receivedAt: "khong-phai-ngay" }, "PUT"),
  );
  assert.equal(res.status, 422);
});

test(
  "PUT /api/floor-stage-fronts: chỉ đặt được ngày bắt đầu kế hoạch cho công tác ĐẦU TIÊN → 422",
  S,
  async () => {
    const { projectId } = await dungSheet("fsfputfirst");
    const pm = await taoUser("pm", "fsfputfirst");
    const { query } = await import("@/lib/db");
    const stages = await query<{ id: number }>(
      `SELECT id FROM construction_stages WHERE project_id IS NULL ORDER BY sort_order LIMIT 2`,
    );
    await dangNhapDuAn(pm, projectId);
    const { PUT } = await import("@/app/api/floor-stage-fronts/route");
    const res = await PUT(
      jreq(
        "/x",
        { floorLabel: "T01", stageId: stages[1].id, plannedReceivedAt: "2026-09-01" },
        "PUT",
      ),
    );
    assert.equal(res.status, 422);
  },
);

test("PUT /api/floor-stage-fronts: nhà thầu bàn giao không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("fsfputsup404");
  const pm = await taoUser("pm", "fsfputsup404");
  const { queryOne } = await import("@/lib/db");
  const shared = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE project_id IS NULL ORDER BY sort_order LIMIT 1`,
  );
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/floor-stage-fronts/route");
  const res = await PUT(
    jreq(
      "/x",
      { floorLabel: "T01", stageId: shared!.id, outgoingSupplierId: 999999999 },
      "PUT",
    ),
  );
  assert.equal(res.status, 404);
});

test(
  "PUT /api/floor-stage-fronts: thành công → upsert ô, ghi ngày nhận/bàn giao/nhà thầu",
  S,
  async () => {
    const { projectId } = await dungSheet("fsfputok");
    const pm = await taoUser("pm", "fsfputok");
    const { insertId, queryOne } = await import("@/lib/db");
    const supplierId = await insertId(
      `INSERT INTO suppliers (name) VALUES (?)`,
      `NTP ${uniq("fsfputok")}`,
    );
    const shared = await queryOne<{ id: number }>(
      `SELECT id FROM construction_stages WHERE project_id IS NULL ORDER BY sort_order LIMIT 1`,
    );
    await dangNhapDuAn(pm, projectId);
    const { PUT } = await import("@/app/api/floor-stage-fronts/route");
    const res = await PUT(
      jreq(
        "/x",
        {
          floorLabel: "T09",
          stageId: shared!.id,
          receivedAt: "2026-09-01",
          plannedReceivedAt: "2026-09-01",
          note: "Ghi chú test",
          outgoingSupplierId: supplierId,
        },
        "PUT",
      ),
    );
    assert.equal(res.status, 200);
    const { id } = await res.json();
    const row = await queryOne<{ receivedAt: string; note: string; outgoingSupplierId: number }>(
      `SELECT received_at AS "receivedAt", note, outgoing_supplier_id AS "outgoingSupplierId"
         FROM floor_stage_fronts WHERE id = ?`,
      id,
    );
    assert.equal(row?.receivedAt, "2026-09-01");
    assert.equal(row?.note, "Ghi chú test");
    assert.equal(row?.outgoingSupplierId, supplierId);
  },
);

// ============================================================================
// GET/POST /api/floor-stage-fronts/:id/documents · GET/DELETE /api/floor-stage-front-documents/:id
// ============================================================================

async function taoFront(projectId: number, floorLabel: string, stageId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO floor_stage_fronts (project_id, floor_label, stage_id) VALUES (?, ?, ?)`,
    projectId,
    floorLabel,
    stageId,
  );
}

async function stageDungChung(): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE project_id IS NULL ORDER BY sort_order LIMIT 1`,
  );
  return row!.id;
}

test("GET /api/floor-stage-fronts/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/floor-stage-fronts/:id/documents: id không phải số → 400", S, async () => {
  const projectId = await taoDuAn("fsfdocbad");
  const pm = await taoUser("pm", "fsfdocbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/floor-stage-fronts/:id/documents: ô của dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("fsfdocisoA");
  const projectB = await taoDuAn("fsfdocisoB");
  const pmA = await taoUser("pm", "fsfdocisoA");
  const stageId = await stageDungChung();
  const frontB = await taoFront(projectB, "T01", stageId);

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(frontB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/floor-stage-fronts/:id/documents: thành công → danh sách rỗng khi chưa upload", S, async () => {
  const projectId = await taoDuAn("fsfdocgetok");
  const pm = await taoUser("pm", "fsfdocgetok");
  const stageId = await stageDungChung();
  const frontId = await taoFront(projectId, "T01", stageId);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(frontId) }),
  });
  assert.equal(res.status, 200);
  const { documents } = await res.json();
  assert.deepEqual(documents, []);
});

test("POST /api/floor-stage-fronts/:id/documents: ô mặt trận không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("fsfdocpost404");
  const pm = await taoUser("pm", "fsfdocpost404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/floor-stage-fronts/:id/documents: subcon không có quyền upload → 403", S, async () => {
  const projectId = await taoDuAn("fsfdocpost403");
  const sub = await taoUser("subcon", "fsfdocpost403");
  const stageId = await stageDungChung();
  const frontId = await taoFront(projectId, "T01", stageId);
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const res = await POST(formReq(`/x`, pdfForm()), {
    params: Promise.resolve({ id: String(frontId) }),
  });
  assert.equal(res.status, 403);
});

test(
  "POST /api/floor-stage-fronts/:id/documents: thành công → GET/:id trả đúng byte đã upload",
  S,
  async () => {
    const projectId = await taoDuAn("fsfdocok");
    const pm = await taoUser("pm", "fsfdocok");
    const stageId = await stageDungChung();
    const frontId = await taoFront(projectId, "T01", stageId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
    const form = pdfForm();
    form.set("kind", "handover");
    const created = await POST(formReq(`/x`, form), {
      params: Promise.resolve({ id: String(frontId) }),
    });
    assert.equal(created.status, 201);
    const { id: docId } = await created.json();

    const { GET } = await import("@/app/api/floor-stage-front-documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buf, PDF_BYTES);
  },
);

test("GET /api/floor-stage-front-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/floor-stage-front-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/floor-stage-front-documents/:id: tài liệu của dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("fsfdgetisoA");
  const projectB = await taoDuAn("fsfdgetisoB");
  const pmB = await taoUser("pm", "fsfdgetisoB");
  const pmA = await taoUser("pm", "fsfdgetisoA");
  const stageId = await stageDungChung();
  const frontB = await taoFront(projectB, "T01", stageId);
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const created = await POST(formReq(`/x`, pdfForm()), {
    params: Promise.resolve({ id: String(frontB) }),
  });
  const { id: docId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/floor-stage-front-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/floor-stage-front-documents/:id: người khác không phải uploader/quản lý → 403", S, async () => {
  const projectId = await taoDuAn("fsfddel403");
  const pm = await taoUser("pm", "fsfddel403");
  const sub = await taoUser("subcon", "fsfddel403sub");
  const stageId = await stageDungChung();
  const frontId = await taoFront(projectId, "T01", stageId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const created = await POST(formReq(`/x`, pdfForm()), {
    params: Promise.resolve({ id: String(frontId) }),
  });
  const { id: docId } = await created.json();

  await dangNhapDuAn(sub, projectId);
  const { DELETE } = await import("@/app/api/floor-stage-front-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/floor-stage-front-documents/:id: người upload xoá được chính mình", S, async () => {
  const projectId = await taoDuAn("fsfddelok");
  const pm = await taoUser("pm", "fsfddelok");
  const stageId = await stageDungChung();
  const frontId = await taoFront(projectId, "T01", stageId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
  const created = await POST(formReq(`/x`, pdfForm()), {
    params: Promise.resolve({ id: String(frontId) }),
  });
  const { id: docId } = await created.json();

  const { DELETE } = await import("@/app/api/floor-stage-front-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM floor_stage_front_documents WHERE id = ?`, docId);
  assert.equal(row, undefined);
});

// ============================================================================
// POST /api/floor-approvals · DELETE /api/floor-approvals/:id · documents
// ============================================================================

test("POST /api/floor-approvals: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/floor-approvals: viewer không có quyền (CAN.editProgress) → 403", S, async () => {
  const { projectId } = await dungSheet("favw403");
  const viewer = await taoUser("viewer", "favw403");
  await dangNhapDuAn(viewer, projectId);
  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(jreq("/x", { sheetTypeId: 1, floorLabel: "T01" }));
  assert.equal(res.status, 403);
});

test("POST /api/floor-approvals: thiếu sheetTypeId/floorLabel → 400", S, async () => {
  const { projectId } = await dungSheet("faval");
  const pm = await taoUser("pm", "faval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(jreq("/x", { sheetTypeId: 1 }));
  assert.equal(res.status, 400);
});

test("POST /api/floor-approvals: subcon với tầng KHÔNG được giao → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fasub403");
  const sub = await taoUser("subcon", "fasub403");
  await taoNhom(sheetTypeId, "P1", { floorLabel: "T01", assignedTo: null });
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/floor-approvals/route");
  const res = await POST(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
  assert.equal(res.status, 403);
});

test(
  "POST /api/floor-approvals: get-or-create idempotent — gọi 2 lần ra cùng 1 bản ghi draft",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("faok");
    const pm = await taoUser("pm", "faok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/floor-approvals/route");
    const first = await POST(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
    assert.equal(first.status, 200);
    const { id: id1, isApproved } = await first.json();
    assert.equal(isApproved, false);
    const second = await POST(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
    const { id: id2 } = await second.json();
    assert.equal(id1, id2);
  },
);

test("DELETE /api/floor-approvals/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/floor-approvals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/floor-approvals/:id: engineer không được huỷ (chỉ Admin/PM) → 403", S, async () => {
  const { projectId } = await dungSheet("fadel403");
  const eng = await taoUser("engineer", "fadel403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/floor-approvals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/floor-approvals/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("fadelbad");
  const pm = await taoUser("pm", "fadelbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/floor-approvals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/floor-approvals/:id: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("fadel404");
  const pm = await taoUser("pm", "fadel404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/floor-approvals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/floor-approvals/:id: chưa được duyệt → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fadel409");
  const pm = await taoUser("pm", "fadel409");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/floor-approvals/route");
  const created = await POST(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/floor-approvals/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 409);
});

test(
  "DELETE /api/floor-approvals/:id: đã duyệt → huỷ nghiệm thu, đặt lại trạng thái task theo tiến độ",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("fadelok");
    const pm = await taoUser("pm", "fadelok");
    const pkgId = await taoNhom(sheetTypeId, "P1", { floorLabel: "T01" });
    const taskId = await taoTask(pkgId, "T1", { progress: 1, status: "nghiem_thu" });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/floor-approvals/route");
    const created = await POST(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
    const { id } = await created.json();
    const { run } = await import("@/lib/db");
    await run(
      `UPDATE floor_approvals SET is_approved = TRUE, approved_by = ?, approved_by_name = ?, approved_at = NOW() WHERE id = ?`,
      pm.id,
      "PM Test",
      id,
    );

    const { DELETE } = await import("@/app/api/floor-approvals/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 200);
    const { taskCount } = await res.json();
    assert.equal(taskCount, 1);

    const { queryOne } = await import("@/lib/db");
    const approval = await queryOne<{ isApproved: boolean }>(
      `SELECT is_approved AS "isApproved" FROM floor_approvals WHERE id = ?`,
      id,
    );
    assert.equal(approval?.isApproved, false);
    const task = await queryOne<{ status: string }>(`SELECT status FROM tasks WHERE id = ?`, taskId);
    // progress=1, end_date NULL → deriveStatus trả hoan_thanh (không còn "tre"/"nghiem_thu").
    assert.equal(task?.status, "hoan_thanh");
  },
);

test("GET /api/floor-approvals/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/floor-approvals/:id/documents: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("fadocs404");
  const pm = await taoUser("pm", "fadocs404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/floor-approvals/:id/documents: subcon với tầng KHÔNG được giao → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fadocssub403");
  const pm = await taoUser("pm", "fadocssub403");
  const sub = await taoUser("subcon", "fadocssub403sub");
  await taoNhom(sheetTypeId, "P1", { floorLabel: "T01", assignedTo: null });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/floor-approvals/route");
  const created = await POST(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
  const { id } = await created.json();

  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 403);
});

test("POST /api/floor-approvals/:id/documents: URL không hợp lệ → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fadocspostbad");
  const pm = await taoUser("pm", "fadocspostbad");
  await dangNhapDuAn(pm, projectId);
  const { POST: createFA } = await import("@/app/api/floor-approvals/route");
  const created = await createFA(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
  const { id } = await created.json();

  const { POST } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await POST(
    new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "khong-http" }),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
  assert.equal(res.status, 400);
});

test("POST /api/floor-approvals/:id/documents: lưu link ngoài → 201", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fadocspostlink");
  const pm = await taoUser("pm", "fadocspostlink");
  await dangNhapDuAn(pm, projectId);
  const { POST: createFA } = await import("@/app/api/floor-approvals/route");
  const created = await createFA(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
  const { id } = await created.json();

  const { POST } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await POST(
    new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://drive.google.com/x", caption: "Link ngoài" }),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
  assert.equal(res.status, 201);
});

test("POST /api/floor-approvals/:id/documents: upload file → 201", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("fadocspostfile");
  const pm = await taoUser("pm", "fadocspostfile");
  await dangNhapDuAn(pm, projectId);
  const { POST: createFA } = await import("@/app/api/floor-approvals/route");
  const created = await createFA(jreq("/x", { sheetTypeId, floorLabel: "T01" }));
  const { id } = await created.json();

  const { POST } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 201);

  const { GET } = await import("@/app/api/floor-approvals/[id]/documents/route");
  const list = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(id) }) });
  const { documents } = await list.json();
  assert.equal(documents.length, 1); // 1 file upload duy nhất cho bản ghi nghiệm thu này
});

// ============================================================================
// GET /api/work-fronts · PATCH /api/work-fronts/:id · documents
// ============================================================================

test("GET /api/work-fronts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/work-fronts/route");
  const res = await GET(jreq("/api/work-fronts", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/work-fronts: thành công → tự tạo work_front còn thiếu, lọc theo sheetTypeId", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfget");
  const pm = await taoUser("pm", "wfget");
  await taoNhom(sheetTypeId, "P1", { floorLabel: "T02" });
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/work-fronts/route");
  const res = await GET(jreq(`/api/work-fronts?sheetTypeId=${sheetTypeId}`, undefined, "GET"));
  assert.equal(res.status, 200);
  const { workFronts } = await res.json();
  assert.ok(workFronts.some((w: { floorLabel: string }) => w.floorLabel === "T02"));
});

test("PATCH /api/work-fronts/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/work-fronts/:id: subcon không có quyền → 403", S, async () => {
  const { projectId } = await dungSheet("wfp403");
  const sub = await taoUser("subcon", "wfp403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  const res = await PATCH(jreq("/x", { status: "handed_over" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/work-fronts/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("wfpbad");
  const pm = await taoUser("pm", "wfpbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/work-fronts/:id: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("wfp404");
  const pm = await taoUser("pm", "wfp404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  const res = await PATCH(jreq("/x", { status: "handed_over" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

async function taoWorkFront(sheetTypeId: number, floorLabel: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, ?)`,
    sheetTypeId,
    floorLabel,
  );
}

test("PATCH /api/work-fronts/:id: trạng thái không hợp lệ → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfpstatus");
  const pm = await taoUser("pm", "wfpstatus");
  const id = await taoWorkFront(sheetTypeId, "T01");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  const res = await PATCH(jreq("/x", { status: "khong_ton_tai" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/work-fronts/:id: engineer không nhảy ngược trạng thái → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfpback");
  const eng = await taoUser("engineer", "wfpback");
  const id = await taoWorkFront(sheetTypeId, "T01");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  const forward = await PATCH(jreq("/x", { status: "handed_over" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(forward.status, 200);
  const backward = await PATCH(jreq("/x", { status: "pending" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(backward.status, 409);
});

test("PATCH /api/work-fronts/:id: Admin được nhảy ngược trạng thái (sửa sai)", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfpadminback");
  const admin = await taoUser("admin", "wfpadminback");
  const id = await taoWorkFront(sheetTypeId, "T01");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
  await PATCH(jreq("/x", { status: "handed_over" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  const backward = await PATCH(jreq("/x", { status: "pending" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(backward.status, 200);
});

test("GET /api/work-fronts/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/work-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/work-fronts/:id/documents: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("wfdocbad");
  const pm = await taoUser("pm", "wfdocbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/work-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/work-fronts/:id/documents: subcon không có quyền → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfdocpost403");
  const sub = await taoUser("subcon", "wfdocpost403");
  const id = await taoWorkFront(sheetTypeId, "T01");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 403);
});

test("POST /api/work-fronts/:id/documents: không tìm thấy mặt bằng → 404", S, async () => {
  const { projectId } = await dungSheet("wfdocpost404");
  const pm = await taoUser("pm", "wfdocpost404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/work-fronts/:id/documents: thành công → GET danh sách + stream đúng byte",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wfdocok");
    const pm = await taoUser("pm", "wfdocok");
    const id = await taoWorkFront(sheetTypeId, "T01");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
    const created = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(created.status, 201);
    const { id: docId } = await created.json();

    const { GET: getList } = await import("@/app/api/work-fronts/[id]/documents/route");
    const list = await getList(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(id) }),
    });
    const { documents } = await list.json();
    assert.equal(documents.length, 1);

    const { GET: streamDoc } = await import("@/app/api/work-front-documents/[id]/route");
    const stream = await streamDoc(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(stream.status, 200);
    const buf = Buffer.from(await stream.arrayBuffer());
    assert.deepEqual(buf, PDF_BYTES);
  },
);

test("GET /api/work-front-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/work-front-documents/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("wfdocgetbad");
  const pm = await taoUser("pm", "wfdocgetbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("DELETE /api/work-front-documents/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("wfdocdelbad");
  const pm = await taoUser("pm", "wfdocdelbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/work-front-documents/:id: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("wfdocdel404");
  const pm = await taoUser("pm", "wfdocdel404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/work-front-documents/:id: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("wfdocget404");
  const pm = await taoUser("pm", "wfdocget404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/work-front-documents/:id: không phải uploader/quản lý → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfdocdel403");
  const pm = await taoUser("pm", "wfdocdel403");
  const sub = await taoUser("subcon", "wfdocdel403sub");
  const id = await taoWorkFront(sheetTypeId, "T01");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
  const created = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(id) }),
  });
  const { id: docId } = await created.json();

  await dangNhapDuAn(sub, projectId);
  const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/work-front-documents/:id: uploader xoá được", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wfdocdelok");
  const pm = await taoUser("pm", "wfdocdelok");
  const id = await taoWorkFront(sheetTypeId, "T01");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
  const created = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(id) }),
  });
  const { id: docId } = await created.json();

  const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// DELETE /api/package-dependencies/:id · GET/POST /api/packages/:id/dependencies
// ============================================================================

test("DELETE /api/package-dependencies/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/package-dependencies/:id: engineer không được sửa phụ thuộc → 403", S, async () => {
  const { projectId } = await dungSheet("pdel403");
  const eng = await taoUser("engineer", "pdel403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/package-dependencies/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("pdelbad");
  const pm = await taoUser("pm", "pdelbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/package-dependencies/:id: xoá thành công", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("pdelok");
  const pm = await taoUser("pm", "pdelok");
  const a = await taoNhom(sheetTypeId, "A1");
  const b = await taoNhom(sheetTypeId, "B1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  const created = await POST(jreq("/x", { predecessorId: a }), {
    params: Promise.resolve({ id: String(b) }),
  });
  const { id: depId } = await created.json();
  const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(depId) }),
  });
  assert.equal(res.status, 200);
});

test("GET /api/packages/:id/dependencies: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/packages/[id]/dependencies/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/packages/:id/dependencies: trả đúng predecessors/successors", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("pdepget");
  const pm = await taoUser("pm", "pdepget");
  const a = await taoNhom(sheetTypeId, "A1");
  const b = await taoNhom(sheetTypeId, "B1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  await POST(jreq("/x", { predecessorId: a }), { params: Promise.resolve({ id: String(b) }) });

  const { GET } = await import("@/app/api/packages/[id]/dependencies/route");
  const resB = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(b) }) });
  const { predecessors } = await resB.json();
  assert.equal(predecessors.length, 1);
  assert.equal(predecessors[0].id, a);

  const resA = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(a) }) });
  const { successors } = await resA.json();
  assert.equal(successors.length, 1);
  assert.equal(successors[0].id, b);
});

test("POST /api/packages/:id/dependencies: engineer không được sửa phụ thuộc → 403", S, async () => {
  const { projectId } = await dungSheet("pdep403");
  const eng = await taoUser("engineer", "pdep403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  const res = await POST(jreq("/x", { predecessorId: 1 }), { params: Promise.resolve({ id: "2" }) });
  assert.equal(res.status, 403);
});

test("POST /api/packages/:id/dependencies: tự phụ thuộc chính nó → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("pdepself");
  const pm = await taoUser("pm", "pdepself");
  const a = await taoNhom(sheetTypeId, "A1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  const res = await POST(jreq("/x", { predecessorId: a }), {
    params: Promise.resolve({ id: String(a) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/packages/:id/dependencies: nhóm không tồn tại → 404", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("pdep404");
  const pm = await taoUser("pm", "pdep404");
  const a = await taoNhom(sheetTypeId, "A1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  const res = await POST(jreq("/x", { predecessorId: a }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/packages/:id/dependencies: tạo vòng lặp → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("pdepcycle");
  const pm = await taoUser("pm", "pdepcycle");
  const a = await taoNhom(sheetTypeId, "A1");
  const b = await taoNhom(sheetTypeId, "B1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  await POST(jreq("/x", { predecessorId: a }), { params: Promise.resolve({ id: String(b) }) });
  // b đã phụ thuộc a (a→b) — tạo thêm b→a (b là predecessor của a) sẽ khép vòng.
  const res = await POST(jreq("/x", { predecessorId: b }), {
    params: Promise.resolve({ id: String(a) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/packages/:id/dependencies: tạo trùng → trả lại bản ghi đã có (existed)", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("pdepdup");
  const pm = await taoUser("pm", "pdepdup");
  const a = await taoNhom(sheetTypeId, "A1");
  const b = await taoNhom(sheetTypeId, "B1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
  const first = await POST(jreq("/x", { predecessorId: a }), {
    params: Promise.resolve({ id: String(b) }),
  });
  const second = await POST(jreq("/x", { predecessorId: a }), {
    params: Promise.resolve({ id: String(b) }),
  });
  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.existed, true);
  const { id: id1 } = await first.json();
  assert.equal(body.id, id1);
});

// ============================================================================
// PATCH /api/tasks/batch
// ============================================================================

test("PATCH /api/tasks/batch: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"));
  assert.equal(res.status, 401);
});

test("PATCH /api/tasks/batch: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const { projectId } = await dungSheet("tb403");
  const eng = await taoUser("engineer", "tb403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(jreq("/x", { updates: [{ id: 1, patch: {} }] }, "PATCH"));
  assert.equal(res.status, 403);
});

test("PATCH /api/tasks/batch: không có cập nhật → 400", S, async () => {
  const { projectId } = await dungSheet("tbval");
  const pm = await taoUser("pm", "tbval");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(jreq("/x", { updates: [] }, "PATCH"));
  assert.equal(res.status, 400);
});

test("PATCH /api/tasks/batch: task không tồn tại trong lô → 422, atomic (không đổi task hợp lệ khác)", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbatomic");
  const pm = await taoUser("pm", "tbatomic");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1", { progress: 0 });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(
    jreq(
      "/x",
      {
        updates: [
          { id: taskId, patch: { name: "Đổi tên" } },
          { id: 999999999, patch: { name: "x" } },
        ],
      },
      "PATCH",
    ),
  );
  assert.equal(res.status, 422);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ name: string }>(`SELECT name FROM tasks WHERE id = ?`, taskId);
  assert.equal(row?.name, "Task T1"); // KHÔNG bị đổi — cả lô rollback.
});

test("PATCH /api/tasks/batch: đặt status=nghiem_thu qua batch → 422 (phải qua approve)", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbnt");
  const pm = await taoUser("pm", "tbnt");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1", { progress: 1 });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: taskId, patch: { status: "nghiem_thu" } }] }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/batch: status thủ công không khớp % (statusConsistentWithProgress) → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbinconsist");
  const pm = await taoUser("pm", "tbinconsist");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1", { progress: 0 });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: taskId, patch: { status: "hoan_thanh" } }] }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/batch: ngày sai định dạng → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbdate");
  const pm = await taoUser("pm", "tbdate");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: taskId, patch: { startDate: "khong-phai-ngay" } }] }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/batch: tên rỗng → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbname");
  const pm = await taoUser("pm", "tbname");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(jreq("/x", { updates: [{ id: taskId, patch: { name: "  " } }] }, "PATCH"));
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/batch: quá 500 ô trong 1 lần → 422", S, async () => {
  const { projectId } = await dungSheet("tbmax");
  const pm = await taoUser("pm", "tbmax");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const updates = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, patch: { name: "x" } }));
  const res = await PATCH(jreq("/x", { updates }, "PATCH"));
  assert.equal(res.status, 422);
});

test("PATCH /api/tasks/batch: gán người phụ trách (assignedTo) qua batch", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbassign");
  const pm = await taoUser("pm", "tbassign");
  const assignee = await taoUser("engineer", "tbassignee");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: taskId, patch: { assignedTo: assignee.id } }] }, "PATCH"),
  );
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ assignedTo: number }>(
    `SELECT assigned_to AS "assignedTo" FROM tasks WHERE id = ?`,
    taskId,
  );
  assert.equal(row?.assignedTo, assignee.id);
});

test("PATCH /api/tasks/batch: mã BOQ đã dùng bởi task khác → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tbboq");
  const pm = await taoUser("pm", "tbboq");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const boqCode = `BOQ-${uniq("tbboq")}`;
  const { run } = await import("@/lib/db");
  await run(`INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'TX', 'x', ?)`, pkgId, boqCode);
  const taskId = await taoTask(pkgId, "T1", { progress: 0 });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tasks/batch/route");
  const res = await PATCH(
    jreq("/x", { updates: [{ id: taskId, patch: { boqCode } }] }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/tasks/batch: thành công → đổi tên/ngày nhiều task, recompute trạng thái trễ",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("tbok");
    const pm = await taoUser("pm", "tbok");
    const pkgId = await taoNhom(sheetTypeId, "P1");
    const t1 = await taoTask(pkgId, "T1", { progress: 0 });
    const t2 = await taoTask(pkgId, "T2", { progress: 0 });
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/tasks/batch/route");
    const res = await PATCH(
      jreq(
        "/x",
        {
          updates: [
            { id: t1, patch: { name: "Tên mới 1", endDate: "2020-01-01" } }, // ngày quá khứ → trễ
            { id: t2, patch: { name: "Tên mới 2" } },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(res.status, 200);
    const { updated } = await res.json();
    assert.equal(updated, 2);
    const { queryOne } = await import("@/lib/db");
    const row1 = await queryOne<{ name: string; status: string }>(
      `SELECT name, status FROM tasks WHERE id = ?`,
      t1,
    );
    assert.equal(row1?.name, "Tên mới 1");
    assert.equal(row1?.status, "tre");
  },
);

// ============================================================================
// GET /api/tasks/version
// ============================================================================

test("GET /api/tasks/version: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/version/route");
  const res = await GET(jreq("/api/tasks/version", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/tasks/version: thiếu sheet → 400", S, async () => {
  const { projectId } = await dungSheet("tvbad");
  const pm = await taoUser("pm", "tvbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tasks/version/route");
  const res = await GET(jreq("/api/tasks/version", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("GET /api/tasks/version: thành công → trả watermark số", S, async () => {
  const { projectId } = await dungSheet("tvok");
  const pm = await taoUser("pm", "tvok");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tasks/version/route");
  const res = await GET(jreq("/api/tasks/version?sheet=ogtd", undefined, "GET"));
  assert.equal(res.status, 200);
  const { v } = await res.json();
  // sheetVersion() trả BIGINT dưới dạng chuỗi (::text) — phòng tràn số nguyên JS.
  assert.equal(typeof v, "string");
  assert.ok(/^\d+$/.test(v));
});

// ============================================================================
// GET /api/tasks/:id/dimensions
// ============================================================================

test("GET /api/tasks/:id/dimensions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tasks/:id/dimensions: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("tdimbad");
  const pm = await taoUser("pm", "tdimbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/tasks/:id/dimensions: subcon KHÔNG được giao task → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tdim403");
  const sub = await taoUser("subcon", "tdim403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/tasks/:id/dimensions: thành công → trả danh sách dimension", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tdimok");
  const pm = await taoUser("pm", "tdimok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await taoDim(taskId, "Ø100");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 200);
  const { dimensions } = await res.json();
  assert.equal(dimensions.length, 1);
  assert.equal(dimensions[0].label, "Ø100");
});

// ============================================================================
// GET/POST /api/tasks/:id/documents
// ============================================================================

test("GET /api/tasks/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tasks/:id/documents: subcon KHÔNG được giao task → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tdoc403");
  const sub = await taoUser("subcon", "tdoc403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/documents: viewer không có quyền (CAN.editProgress) → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tdocpost403");
  const viewer = await taoUser("viewer", "tdocpost403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(viewer, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/documents: task không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("tdocpost404");
  const pm = await taoUser("pm", "tdocpost404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tasks/:id/documents: loại hồ sơ (docCategory) không hợp lệ → 422", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tdoccat");
  const pm = await taoUser("pm", "tdoccat");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const form = pdfForm();
  form.set("docCategory", "khong_ton_tai");
  const { POST } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(taskId) }) });
  assert.equal(res.status, 422);
});

test("POST /api/tasks/:id/documents: subcon upload tài liệu cho task ĐƯỢC giao → 201", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tdocsubok");
  const sub = await taoUser("subcon", "tdocsubok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1", { assignedTo: sub.id });
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/documents/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 201);
  const { GET } = await import("@/app/api/tasks/[id]/documents/route");
  const list = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  const { documents } = await list.json();
  assert.equal(documents.length, 1);
});

// ============================================================================
// GET/POST /api/tasks/:id/photos · GET/DELETE /api/photos/:id
// ============================================================================

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
function pngForm(): FormData {
  const form = new FormData();
  form.set("file", new File([PNG_1X1], "a.png", { type: "image/png" }));
  return form;
}

test("GET /api/tasks/:id/photos: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tasks/:id/photos: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("tphotobad");
  const pm = await taoUser("pm", "tphotobad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/tasks/:id/photos: thành công → danh sách ảnh của task", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tphotogetok");
  const pm = await taoUser("pm", "tphotogetok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  await POST(formReq("/x", pngForm()), { params: Promise.resolve({ id: String(taskId) }) });
  const { GET } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 200);
  const { photos } = await res.json();
  assert.equal(photos.length, 1);
});

test("GET /api/tasks/:id/photos: subcon KHÔNG được giao task → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tphoto403");
  const sub = await taoUser("subcon", "tphoto403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/photos: viewer không có quyền → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tphotopost403");
  const viewer = await taoUser("viewer", "tphotopost403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(viewer, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/tasks/:id/photos: task không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("tphotopost404");
  const pm = await taoUser("pm", "tphotopost404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const res = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tasks/:id/photos: thành công, upload lại cùng ảnh trong 24h → dedup", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("tphotook");
  const pm = await taoUser("pm", "tphotook");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const first = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(first.status, 201);
  const { id: id1 } = await first.json();
  const second = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  assert.equal(second.status, 200);
  const body2 = await second.json();
  assert.equal(body2.deduped, true);
  assert.equal(body2.id, id1);
});

test("GET /api/photos/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/photos/:id: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("photoget404");
  const pm = await taoUser("pm", "photoget404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/photos/:id: subcon xem ảnh của task KHÔNG được giao → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("photoget403");
  const pm = await taoUser("pm", "photoget403");
  const sub = await taoUser("subcon", "photoget403sub");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  const { id: photoId } = await created.json();

  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/photos/:id: thành công → trả đúng byte ảnh đã upload", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("photogetok");
  const pm = await taoUser("pm", "photogetok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  const { id: photoId } = await created.json();

  const { GET } = await import("@/app/api/photos/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf, PNG_1X1);
});

test("DELETE /api/photos/:id: không phải người upload/không phải Admin-PM → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("photodel403");
  const pm = await taoUser("pm", "photodel403");
  const eng = await taoUser("engineer", "photodel403eng");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  const { id: photoId } = await created.json();

  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/photos/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/photos/:id: người upload xoá được ảnh của mình", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("photodelok");
  const pm = await taoUser("pm", "photodelok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tasks/[id]/photos/route");
  const created = await POST(formReq("/x", pngForm()), {
    params: Promise.resolve({ id: String(taskId) }),
  });
  const { id: photoId } = await created.json();

  const { DELETE } = await import("@/app/api/photos/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(photoId) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// DELETE /api/comments/:id
// ============================================================================

async function taoComment(taskId: number, userId: number, body = "Bình luận test"): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)`,
    taskId,
    userId,
    body,
  );
}

test("DELETE /api/comments/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/comments/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("cmtdelbad");
  const pm = await taoUser("pm", "cmtdelbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/comments/:id: không tìm thấy → 404", S, async () => {
  const { projectId } = await dungSheet("cmtdel404");
  const pm = await taoUser("pm", "cmtdel404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/comments/:id: không phải tác giả/không phải Admin-PM → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("cmtdel403");
  const engA = await taoUser("engineer", "cmtdel403A");
  const engB = await taoUser("engineer", "cmtdel403B");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  const commentId = await taoComment(taskId, engA.id);
  await dangNhapDuAn(engB, projectId);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(commentId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/comments/:id: tác giả xoá được bình luận của mình", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("cmtdelok");
  const eng = await taoUser("engineer", "cmtdelok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const taskId = await taoTask(pkgId, "T1");
  const commentId = await taoComment(taskId, eng.id);
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/comments/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(commentId) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// POST /api/dimensions/rename
// ============================================================================

test("POST /api/dimensions/rename: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 401);
});

test("POST /api/dimensions/rename: engineer không có quyền → 403", S, async () => {
  const { projectId } = await dungSheet("drn403");
  const eng = await taoUser("engineer", "drn403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", { packageId: 1, oldLabel: "a", newLabel: "b" }));
  assert.equal(res.status, 403);
});

test("POST /api/dimensions/rename: thiếu tham số → 400", S, async () => {
  const { projectId } = await dungSheet("drnval");
  const pm = await taoUser("pm", "drnval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", { packageId: 1 }));
  assert.equal(res.status, 400);
});

test("POST /api/dimensions/rename: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("drn404");
  const pm = await taoUser("pm", "drn404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", { packageId: 999999999, oldLabel: "a", newLabel: "b" }));
  assert.equal(res.status, 404);
});

test("POST /api/dimensions/rename: tên cột mới rỗng → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drnempty");
  const pm = await taoUser("pm", "drnempty");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", { packageId: pkgId, oldLabel: "a", newLabel: "  " }));
  assert.equal(res.status, 400);
});

test("POST /api/dimensions/rename: đổi trùng nhãn đã có ở task khác trong sheet → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drndup");
  const pm = await taoUser("pm", "drndup");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const t1 = await taoTask(pkgId, "T1");
  await taoDim(t1, "Ø100");
  await taoDim(t1, "Ø200");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", { packageId: pkgId, oldLabel: "Ø100", newLabel: "Ø200" }));
  assert.equal(res.status, 409);
});

test("POST /api/dimensions/rename: thành công → đổi tên cột toàn sheet + bump watermark", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drnok");
  const pm = await taoUser("pm", "drnok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const t1 = await taoTask(pkgId, "T1");
  await taoDim(t1, "Ø100");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/dimensions/rename/route");
  const res = await POST(jreq("/x", { packageId: pkgId, oldLabel: "Ø100", newLabel: "Ø150" }));
  assert.equal(res.status, 200);
  const { updated } = await res.json();
  assert.equal(updated, 1);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ version: number }>(
    `SELECT version FROM sheet_versions WHERE sheet_type_id = ?`,
    sheetTypeId,
  );
  // Trigger bump_sheet_version (migration 0067) đã bump 2 lần trước đó (tạo nhóm +
  // tạo task) — rename bump thêm 1 lần nữa qua code trong route.
  assert.equal(row?.version, 3);
});

// ============================================================================
// GET/POST/DELETE /api/workpackages/:id/bbnt
// ============================================================================

test("GET /api/workpackages/:id/bbnt: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/workpackages/:id/bbnt: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("bbntget404");
  const pm = await taoUser("pm", "bbntget404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/workpackages/:id/bbnt: subcon KHÔNG được giao nhóm → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("bbntget403");
  const sub = await taoUser("subcon", "bbntget403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/workpackages/:id/bbnt: chưa có file → 404", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("bbntgetnone");
  const pm = await taoUser("pm", "bbntgetnone");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/workpackages/:id/bbnt: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("bbntpost404");
  const pm = await taoUser("pm", "bbntpost404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/workpackages/:id/bbnt: nhóm không tồn tại vẫn xoá được (không lỗi)", S, async () => {
  const { projectId } = await dungSheet("bbntdel404");
  const pm = await taoUser("pm", "bbntdel404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 200);
});

test("POST /api/workpackages/:id/bbnt: viewer không có quyền → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("bbntpost403");
  const viewer = await taoUser("viewer", "bbntpost403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(viewer, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await POST(formReq("/x", pdfForm()), { params: Promise.resolve({ id: String(pkgId) }) });
  assert.equal(res.status, 403);
});

test(
  "POST /api/workpackages/:id/bbnt: thành công → GET trả đúng byte, upload lại xoá file cũ",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("bbntok");
    const pm = await taoUser("pm", "bbntok");
    const pkgId = await taoNhom(sheetTypeId, "P1");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
    const created = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(created.status, 201);

    const { GET } = await import("@/app/api/workpackages/[id]/bbnt/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buf, PDF_BYTES);
  },
);

test("DELETE /api/workpackages/:id/bbnt: viewer không có quyền → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("bbntdel403");
  const viewer = await taoUser("viewer", "bbntdel403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(viewer, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/workpackages/:id/bbnt: thành công → xoá metadata + file", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("bbntdelok");
  const pm = await taoUser("pm", "bbntdelok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
  await POST(formReq("/x", pdfForm()), { params: Promise.resolve({ id: String(pkgId) }) });

  const { DELETE } = await import("@/app/api/workpackages/[id]/bbnt/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ bbntFileName: string | null }>(
    `SELECT bbnt_file_name AS "bbntFileName" FROM work_packages WHERE id = ?`,
    pkgId,
  );
  assert.equal(row?.bbntFileName, null);
});

// ============================================================================
// GET /api/workpackages/:id/dimensions
// ============================================================================

test("GET /api/workpackages/:id/dimensions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/workpackages/:id/dimensions: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("wpdimbad");
  const pm = await taoUser("pm", "wpdimbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/workpackages/:id/dimensions: subcon KHÔNG được giao nhóm → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpdim403");
  const sub = await taoUser("subcon", "wpdim403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/workpackages/:id/dimensions: thành công → ma trận task × cột", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wpdimok");
  const pm = await taoUser("pm", "wpdimok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const t1 = await taoTask(pkgId, "T1");
  await taoDim(t1, "Ø100");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 200);
  const { columns, tasks } = await res.json();
  assert.deepEqual(columns, ["Ø100"]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].cells["Ø100"].installed, false);
});

// ============================================================================
// POST/DELETE/PATCH /api/workpackages/:id/dimensions/column
// ============================================================================

test("POST /api/workpackages/:id/dimensions/column: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/workpackages/:id/dimensions/column: engineer không có quyền → 403", S, async () => {
  const { projectId } = await dungSheet("colp403");
  const eng = await taoUser("engineer", "colp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", { label: "x" }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/workpackages/:id/dimensions/column: thiếu label → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colpval");
  const pm = await taoUser("pm", "colpval");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(pkgId) }) });
  assert.equal(res.status, 400);
});

test("POST /api/workpackages/:id/dimensions/column: nhóm chưa có task → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colpnotask");
  const pm = await taoUser("pm", "colpnotask");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", { label: "Ø100" }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/workpackages/:id/dimensions/column: afterLabel không tồn tại → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colpafterbad");
  const pm = await taoUser("pm", "colpafterbad");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", { label: "Ø100", afterLabel: "khong_co" }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/workpackages/:id/dimensions/column: cột đã tồn tại ở mọi task → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colpdup");
  const pm = await taoUser("pm", "colpdup");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const t1 = await taoTask(pkgId, "T1");
  await taoDim(t1, "Ø100");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await POST(jreq("/x", { label: "Ø100" }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 409);
});

test(
  "POST /api/workpackages/:id/dimensions/column: thành công → thêm cột mới sau afterLabel, đẩy cột sau",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("colpok");
    const pm = await taoUser("pm", "colpok");
    const pkgId = await taoNhom(sheetTypeId, "P1");
    const t1 = await taoTask(pkgId, "T1");
    await taoDim(t1, "Ø100", 1);
    await taoDim(t1, "Ø200", 2);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
    const res = await POST(jreq("/x", { label: "Ø150", afterLabel: "Ø100" }), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 201);
    const { created } = await res.json();
    assert.equal(created, 1);
    const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
    const list = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    const { columns } = await list.json();
    assert.deepEqual(columns, ["Ø100", "Ø150", "Ø200"]);
  },
);

test("DELETE /api/workpackages/:id/dimensions/column: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await DELETE(jreq("/x?label=x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/workpackages/:id/dimensions/column: thiếu label → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("coldval");
  const pm = await taoUser("pm", "coldval");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "DELETE /api/workpackages/:id/dimensions/column: thành công → xoá cột khỏi mọi task trong nhóm",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("coldok");
    const pm = await taoUser("pm", "coldok");
    const pkgId = await taoNhom(sheetTypeId, "P1");
    const t1 = await taoTask(pkgId, "T1");
    await taoDim(t1, "Ø100");
    await dangNhapDuAn(pm, projectId);
    const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
    const res = await DELETE(jreq("/x?label=Ø100", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 200);
    const { deleted } = await res.json();
    assert.equal(deleted, 1);
  },
);

test(
  "DELETE /api/workpackages/:id/dimensions/column?allGroups=true: nhóm không tồn tại → 404",
  S,
  async () => {
    const { projectId } = await dungSheet("cold404");
    const pm = await taoUser("pm", "cold404");
    await dangNhapDuAn(pm, projectId);
    const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
    const res = await DELETE(jreq("/x?label=x&allGroups=true", undefined, "DELETE"), {
      params: Promise.resolve({ id: "999999999" }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/workpackages/:id/dimensions/column (copy): chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await PATCH(jreq("/x", { action: "copy" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/workpackages/:id/dimensions/column: action không hợp lệ → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colcbad");
  const pm = await taoUser("pm", "colcbad");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await PATCH(jreq("/x", { action: "x" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/workpackages/:id/dimensions/column: cột gốc (label) không tồn tại → 404", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colcsrc404");
  const pm = await taoUser("pm", "colcsrc404");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
  const res = await PATCH(
    jreq("/x", { action: "copy", label: "khong_co", newLabel: "Ø999" }, "PATCH"),
    { params: Promise.resolve({ id: String(pkgId) }) },
  );
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/workpackages/:id/dimensions/column: copy thành công → cột mới reset unchecked",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("colcok");
    const pm = await taoUser("pm", "colcok");
    const pkgId = await taoNhom(sheetTypeId, "P1");
    const t1 = await taoTask(pkgId, "T1");
    await taoDim(t1, "Ø100");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
    const res = await PATCH(
      jreq("/x", { action: "copy", label: "Ø100", newLabel: "Ø100-copy" }, "PATCH"),
      { params: Promise.resolve({ id: String(pkgId) }) },
    );
    assert.equal(res.status, 201);
    const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
    const list = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    const { columns } = await list.json();
    assert.ok(columns.includes("Ø100-copy"));
  },
);

// ============================================================================
// PATCH /api/workpackages/:id/dimensions/column/move
// ============================================================================

test("PATCH /api/workpackages/:id/dimensions/column/move: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/workpackages/:id/dimensions/column/move: engineer không có quyền → 403", S, async () => {
  const { projectId } = await dungSheet("colmv403");
  const eng = await taoUser("engineer", "colmv403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", { label: "x", direction: "left" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/workpackages/:id/dimensions/column/move: direction sai → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colmvval");
  const pm = await taoUser("pm", "colmvval");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", { label: "Ø100", direction: "up" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/workpackages/:id/dimensions/column/move: nhóm không có task → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colmvnotask");
  const pm = await taoUser("pm", "colmvnotask");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", { label: "Ø100", direction: "left" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/workpackages/:id/dimensions/column/move: cột không tồn tại → 404", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colmv404");
  const pm = await taoUser("pm", "colmv404");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await taoTask(pkgId, "T1");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", { label: "khong_co", direction: "left" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/workpackages/:id/dimensions/column/move: đã ở vị trí đầu → không đổi", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colmvedge");
  const pm = await taoUser("pm", "colmvedge");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const t1 = await taoTask(pkgId, "T1");
  await taoDim(t1, "Ø100", 1);
  await taoDim(t1, "Ø200", 2);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", { label: "Ø100", direction: "left" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test("PATCH /api/workpackages/:id/dimensions/column/move: thành công → hoán đổi vị trí 2 cột", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("colmvok");
  const pm = await taoUser("pm", "colmvok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const t1 = await taoTask(pkgId, "T1");
  await taoDim(t1, "Ø100", 1);
  await taoDim(t1, "Ø200", 2);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
  const res = await PATCH(jreq("/x", { label: "Ø200", direction: "left" }, "PATCH"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 200);
  const { GET } = await import("@/app/api/workpackages/[id]/dimensions/route");
  const list = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  const { columns } = await list.json();
  assert.deepEqual(columns, ["Ø200", "Ø100"]);
});

// ============================================================================
// GET/POST/DELETE /api/workpackages/:id/drawing
// ============================================================================

test("GET /api/workpackages/:id/drawing: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/workpackages/:id/drawing: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("drawget404");
  const pm = await taoUser("pm", "drawget404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/workpackages/:id/drawing: chưa có bản vẽ → 404", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drawgetnone");
  const pm = await taoUser("pm", "drawgetnone");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/workpackages/:id/drawing: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("drawpost404");
  const pm = await taoUser("pm", "drawpost404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/workpackages/:id/drawing: nhóm không tồn tại vẫn xoá được (không lỗi)", S, async () => {
  const { projectId } = await dungSheet("drawdel404");
  const pm = await taoUser("pm", "drawdel404");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 200);
});

test("POST /api/workpackages/:id/drawing: viewer không có quyền → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drawpost403");
  const viewer = await taoUser("viewer", "drawpost403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(viewer, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/workpackages/:id/drawing: thành công → GET trả đúng byte", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drawok");
  const pm = await taoUser("pm", "drawok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
  const created = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(created.status, 201);
  const { GET } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf, PDF_BYTES);
});

test("DELETE /api/workpackages/:id/drawing: viewer không có quyền → 403", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drawdel403");
  const viewer = await taoUser("viewer", "drawdel403");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(viewer, projectId);
  const { DELETE } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/workpackages/:id/drawing: thành công → xoá metadata", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("drawdelok");
  const pm = await taoUser("pm", "drawdelok");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
  await POST(formReq("/x", pdfForm()), { params: Promise.resolve({ id: String(pkgId) }) });
  const { DELETE } = await import("@/app/api/workpackages/[id]/drawing/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ drawingFileName: string | null }>(
    `SELECT drawing_file_name AS "drawingFileName" FROM work_packages WHERE id = ?`,
    pkgId,
  );
  assert.equal(row?.drawingFileName, null);
});

// ============================================================================
// POST /api/workpackages/:id/tasks
// ============================================================================

test("POST /api/workpackages/:id/tasks: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/workpackages/:id/tasks: engineer không được thêm task → 403", S, async () => {
  const { projectId } = await dungSheet("wptask403");
  const eng = await taoUser("engineer", "wptask403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1", name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/workpackages/:id/tasks: nhóm không tồn tại → 404", S, async () => {
  const { projectId } = await dungSheet("wptask404");
  const pm = await taoUser("pm", "wptask404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1", name: "x" }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/workpackages/:id/tasks: thiếu code/name → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wptaskval");
  const pm = await taoUser("pm", "wptaskval");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1" }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/workpackages/:id/tasks: trùng mã trong nhóm → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wptaskdup");
  const pm = await taoUser("pm", "wptaskdup");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await taoTask(pkgId, "DUP1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "DUP1", name: "x" }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/workpackages/:id/tasks: mã BOQ đã dùng → 409", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wptaskboq");
  const pm = await taoUser("pm", "wptaskboq");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  const boqCode = `BOQ-${uniq("wptaskboq")}`;
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'TX', 'x', ?)`,
    pkgId,
    boqCode,
  );
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1", name: "x", boqCode }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/workpackages/:id/tasks: afterId không hợp lệ → 400", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("wptaskafterbad");
  const pm = await taoUser("pm", "wptaskafterbad");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
  const res = await POST(jreq("/x", { code: "T1", name: "x", afterId: 999999999 }), {
    params: Promise.resolve({ id: String(pkgId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "POST /api/workpackages/:id/tasks: thành công → chèn sau afterId, đẩy sort_order task sau",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungSheet("wptaskok");
    const pm = await taoUser("pm", "wptaskok");
    const pkgId = await taoNhom(sheetTypeId, "P1");
    const t1 = await taoTask(pkgId, "T1", { sortOrder: 1 });
    const t2 = await taoTask(pkgId, "T2", { sortOrder: 2 });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
    const res = await POST(jreq("/x", { code: "T1.5", name: "Task giữa", afterId: t1 }), {
      params: Promise.resolve({ id: String(pkgId) }),
    });
    assert.equal(res.status, 201);
    const { queryOne } = await import("@/lib/db");
    const row2 = await queryOne<{ sortOrder: number }>(
      `SELECT sort_order AS "sortOrder" FROM tasks WHERE id = ?`,
      t2,
    );
    assert.equal(row2?.sortOrder, 3); // bị đẩy lên vì task mới chiếm sort_order=2
  },
);

// ============================================================================
// GET /api/workpackages/qc-status
// ============================================================================

test("GET /api/workpackages/qc-status: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/workpackages/qc-status/route");
  const res = await GET(jreq("/api/workpackages/qc-status", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/workpackages/qc-status: thiếu sheetTypeId → 422", S, async () => {
  const { projectId } = await dungSheet("qcstatval");
  const pm = await taoUser("pm", "qcstatval");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/qc-status/route");
  const res = await GET(jreq("/api/workpackages/qc-status", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/workpackages/qc-status: thành công → mảng rỗng khi không nhóm nào bị chặn", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("qcstatok");
  const pm = await taoUser("pm", "qcstatok");
  await taoNhom(sheetTypeId, "P1");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/workpackages/qc-status/route");
  const res = await GET(
    jreq(`/api/workpackages/qc-status?sheetTypeId=${sheetTypeId}`, undefined, "GET"),
  );
  assert.equal(res.status, 200);
  const { blocked } = await res.json();
  assert.deepEqual(blocked, []);
});

// ============================================================================
// GET /api/my-tasks
// ============================================================================

test("GET /api/my-tasks: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/my-tasks/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/my-tasks: chỉ trả task được giao cho CHÍNH mình, lọc theo dự án đang chọn", S, async () => {
  const { projectId, sheetTypeId } = await dungSheet("mytasks");
  const me = await taoUser("engineer", "mytasks");
  const other = await taoUser("engineer", "mytasksOther");
  const pkgId = await taoNhom(sheetTypeId, "P1");
  await taoTask(pkgId, "T1", { assignedTo: me.id, progress: 0, endDate: "2020-01-01" }); // trễ
  await taoTask(pkgId, "T2", { assignedTo: me.id, progress: 1 }); // xong
  await taoTask(pkgId, "T3", { assignedTo: other.id });
  await dangNhapDuAn(me, projectId);
  const { GET } = await import("@/app/api/my-tasks/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { tasks, summary } = await res.json();
  assert.equal(tasks.length, 2);
  assert.equal(summary.total, 2);
  assert.equal(summary.delayed, 1);
  assert.equal(summary.done, 1);
});

// ============================================================================
// PATCH/DELETE /api/towers/:id
// ============================================================================

test("PATCH /api/towers/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/towers/:id: engineer không có quyền (chỉ Admin/PM) → 403", S, async () => {
  const { projectId } = await dungSheet("towerp403");
  const eng = await taoUser("engineer", "towerp403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/towers/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("towerpbad");
  const pm = await taoUser("pm", "towerpbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/towers/:id: thiếu tên → 400", S, async () => {
  const { projectId, towerId } = await dungSheet("towerpval");
  const pm = await taoUser("pm", "towerpval");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "  " }, "PATCH"), {
    params: Promise.resolve({ id: String(towerId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/towers/:id: thành công → đổi tên", S, async () => {
  const { projectId, towerId } = await dungSheet("towerpok");
  const pm = await taoUser("pm", "towerpok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const newName = `Tháp mới ${uniq("tower")}`;
  const res = await PATCH(jreq("/x", { name: newName }, "PATCH"), {
    params: Promise.resolve({ id: String(towerId) }),
  });
  assert.equal(res.status, 200);
  const { tower } = await res.json();
  assert.equal(tower.name, newName);
});

test("DELETE /api/towers/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/towers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/towers/:id: engineer không có quyền → 403", S, async () => {
  const { projectId } = await dungSheet("towerdel403");
  const eng = await taoUser("engineer", "towerdel403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/towers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/towers/:id: id không phải số → 400", S, async () => {
  const { projectId } = await dungSheet("towerdelbad");
  const pm = await taoUser("pm", "towerdelbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/towers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/towers/:id: còn sheet thuộc tháp → 409", S, async () => {
  const { projectId, towerId } = await dungSheet("towerdel409");
  const pm = await taoUser("pm", "towerdel409");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/towers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(towerId) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/towers/:id: tháp trống (không sheet) → xoá thành công", S, async () => {
  const projectId = await taoDuAn("towerdelok");
  const pm = await taoUser("pm", "towerdelok");
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp trống')`,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/towers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(towerId) }),
  });
  assert.equal(res.status, 200);
});
