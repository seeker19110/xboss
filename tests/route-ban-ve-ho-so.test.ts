import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm BẢN VẼ & HỒ SƠ. Route:
//   - app/api/drawings/route.ts                      (GET/POST bản vẽ)
//   - app/api/drawings/[id]/route.ts                  (GET/PATCH 1 bản vẽ)
//   - app/api/drawings/[id]/revisions/route.ts        (POST upload revision)
//   - app/api/drawings/revisions/[id]/route.ts        (PATCH duyệt/từ chối revision)
//   - app/api/documents/[id]/route.ts                 (GET/DELETE tài liệu đính kèm)
//   - app/api/correspondences/route.ts                (GET/POST công văn/RFI)
//   - app/api/correspondences/[id]/route.ts           (GET/PATCH 1 công văn)
//   - app/api/correspondences/[id]/reply/route.ts     (POST trả lời công văn)
// Loại trừ mọi route CAD/BIM/AutoCAD/Revit (app/api/engineering/cad, /bim, plugin) —
// ngoài phạm vi việc này.

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `BVHS ${uniq(ten)}`);
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `bvhs-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'hash-test-bvhs', ?)`,
    `BVHS ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Chuỗi Tower → SheetType → WorkPackage → Task đầy đủ thuộc 1 dự án (tasks không có
 * project_id trực tiếp — suy qua chuỗi này, xem migrations/0001_baseline.sql). */
async function taoTask(
  projectId: number,
  ten: string,
  overrides: { assignedTo?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${uniq(ten)}`,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, ?)`,
    towerId,
    `SH-${uniq(ten)}`,
    `Sheet ${ten}`,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, ?, 'T01')`,
    sheetId,
    `WP-${uniq(ten)}`,
    `Nhóm ${ten}`,
  );
  return insertId(
    `INSERT INTO tasks (package_id, code, name, assigned_to) VALUES (?, ?, ?, ?)`,
    wpId,
    `WP-${uniq(ten)}A,01`,
    `Task ${ten}`,
    overrides.assignedTo ?? null,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Nội dung PDF tối thiểu nhưng đủ để `sniffMime` nhận diện đúng (magic byte "%PDF-"). */
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");

function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

// ============================================================================
// GET/POST /api/drawings
// ============================================================================

test("GET /api/drawings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/drawings/route");
  const res = await GET(jreq("/api/drawings", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/drawings: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("gkind");
  const pm = await taoUser("pm", "gkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/drawings/route");
  const res = await GET(jreq("/api/drawings?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/drawings: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("gstatus");
  const pm = await taoUser("pm", "gstatus");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/drawings/route");
  const res = await GET(jreq("/api/drawings?status=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test(
  "GET /api/drawings: subcon vẫn xem được (mọi vai trò đăng nhập đều xem bản vẽ)",
  S,
  async () => {
    // Bất biến nghiệp vụ ghi rõ trong route.ts: subcon cần bản vẽ để thi công hiện trường.
    const projectId = await taoDuAn("gsub");
    const sub = await taoUser("subcon", "gsub");
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/drawings/route");
    const res = await GET(jreq("/api/drawings", undefined, "GET"));
    assert.equal(res.status, 200);
  },
);

test("GET /api/drawings: cách ly dự án — không thấy bản vẽ dự án khác", S, async () => {
  const projectA = await taoDuAn("gisoA");
  const projectB = await taoDuAn("gisoB");
  const pmA = await taoUser("pm", "gisoA");
  const pmB = await taoUser("pm", "gisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/drawings/route");
  await POST(
    jreq("/api/drawings", { code: `DWG-${uniq("gisoB")}`, name: "Bản vẽ B", kind: "shop" }),
  );
  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/drawings", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).drawings, []);
});

test("POST /api/drawings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/drawings/route");
  const res = await POST(jreq("/api/drawings", {}));
  assert.equal(res.status, 401);
});

test("POST /api/drawings: subcon không được tạo bản vẽ → 403", S, async () => {
  const projectId = await taoDuAn("psub");
  const sub = await taoUser("subcon", "psub");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/drawings/route");
  const res = await POST(jreq("/api/drawings", {}));
  assert.equal(res.status, 403);
});

test("POST /api/drawings: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("pnoproj");
  const pm = await taoUser("pm", "pnoproj");
  const other = await taoUser("pm", "pnoprojOther");
  // Gán dự án cho NGƯỜI KHÁC (bảng user_projects khác rỗng) → pm hiện tại không thấy
  // dự án nào (cùng kỹ thuật với route-tai-chinh.test.ts / route-baselines.test.ts).
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/drawings/route");
    const res = await POST(jreq("/api/drawings", {}));
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/drawings: body rỗng → 400", S, async () => {
  const projectId = await taoDuAn("pbody");
  const pm = await taoUser("pm", "pbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/route");
  const res = await POST(
    new NextRequest("http://localhost/api/drawings", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/drawings: thiếu số bản vẽ → 422 (validateDrawingInput)", S, async () => {
  const projectId = await taoDuAn("pval");
  const pm = await taoUser("pm", "pval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/route");
  const res = await POST(jreq("/api/drawings", { name: "Thiếu mã", kind: "shop" }));
  assert.equal(res.status, 422);
});

test("POST /api/drawings: work_package không tồn tại → 422 (checkDrawingRefs)", S, async () => {
  const projectId = await taoDuAn("pref");
  const pm = await taoUser("pm", "pref");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/route");
  const res = await POST(
    jreq("/api/drawings", {
      code: `DWG-${uniq("pref")}`,
      name: "Bản vẽ",
      kind: "shop",
      workPackageId: 999999999,
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Nhóm công việc/);
});

test("POST /api/drawings: thành công → project_id do SERVER suy (dự án đang chọn)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pok");
  const eng = await taoUser("engineer", "pok");
  await dangNhapDuAn(eng, projectId);
  const code = `DWG-${uniq("pok")}`;
  const { POST } = await import("@/app/api/drawings/route");
  const res = await POST(jreq("/api/drawings", { code, name: "Bản vẽ hợp lệ", kind: "design" }));
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM drawings WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

test("POST /api/drawings: trùng số bản vẽ → 409", S, async () => {
  const projectId = await taoDuAn("pdup");
  const pm = await taoUser("pm", "pdup");
  await dangNhapDuAn(pm, projectId);
  const code = `DWG-${uniq("pdup")}`;
  const { POST } = await import("@/app/api/drawings/route");
  const first = await POST(jreq("/api/drawings", { code, name: "A", kind: "shop" }));
  assert.equal(first.status, 201);
  const second = await POST(jreq("/api/drawings", { code, name: "B", kind: "shop" }));
  assert.equal(second.status, 409);
});

// ============================================================================
// GET/PATCH /api/drawings/[id]
// ============================================================================

test("GET /api/drawings/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/drawings/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/drawings/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("gidbad");
  const pm = await taoUser("pm", "gidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/drawings/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/drawings/:id: bản vẽ của dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("gidisoA");
  const projectB = await taoDuAn("gidisoB");
  const pmA = await taoUser("pm", "gidisoA");
  const pmB = await taoUser("pm", "gidisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/drawings/route");
  const created = await POST(
    jreq("/api/drawings", { code: `DWG-${uniq("gidisoB")}`, name: "B", kind: "shop" }),
  );
  const { id: drawingB } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/drawings/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(drawingB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/drawings/:id: canWithdraw đúng — chỉ true cho chính người upload còn ở trạng thái chưa quyết",
  S,
  async () => {
    const projectId = await taoDuAn("gwd");
    const eng = await taoUser("engineer", "gwd");
    const eng2 = await taoUser("engineer", "gwd2");
    await dangNhapDuAn(eng, projectId);
    const { POST: POSTD } = await import("@/app/api/drawings/route");
    const created = await POSTD(
      jreq("/api/drawings", { code: `DWG-${uniq("gwd")}`, name: "WD", kind: "shop" }),
    );
    const { id: drawingId } = await created.json();

    const { POST: POSTR } = await import("@/app/api/drawings/[id]/revisions/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
    form.set("rev", "R0");
    await POSTR(formReq(`/api/drawings/${drawingId}/revisions`, form), {
      params: Promise.resolve({ id: String(drawingId) }),
    });

    const { GET } = await import("@/app/api/drawings/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(drawingId) }),
    });
    const { revisions } = await res.json();
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].canWithdraw, true, "chính người upload, còn 'submitted' → true");

    await dangNhapDuAn(eng2, projectId);
    const res2 = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(drawingId) }),
    });
    const { revisions: rev2 } = await res2.json();
    assert.equal(rev2[0].canWithdraw, false, "người khác không phải chủ rev → false");
  },
);

test("PATCH /api/drawings/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/drawings/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/drawings/:id: subcon không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("pidsub");
  const sub = await taoUser("subcon", "pidsub");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/drawings/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/drawings/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("pidbad");
  const pm = await taoUser("pm", "pidbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/drawings/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/drawings/:id: bản vẽ dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("pidisoA");
  const projectB = await taoDuAn("pidisoB");
  const pmA = await taoUser("pm", "pidisoA");
  const pmB = await taoUser("pm", "pidisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/drawings/route");
  const created = await POST(
    jreq("/api/drawings", { code: `DWG-${uniq("pidisoB")}`, name: "B", kind: "shop" }),
  );
  const { id: drawingB } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/drawings/[id]/route");
  const res = await PATCH(jreq("/x", { name: "hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(drawingB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/drawings/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("pidbody");
  const pm = await taoUser("pm", "pidbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/route");
  const created = await POST(
    jreq("/api/drawings", { code: `DWG-${uniq("pidbody")}`, name: "A", kind: "shop" }),
  );
  const { id: drawingId } = await created.json();
  const { PATCH } = await import("@/app/api/drawings/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/drawings/:id: sửa thành công (merge — field không gửi giữ nguyên)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("pidok");
    const pm = await taoUser("pm", "pidok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/drawings/route");
    const created = await POST(
      jreq("/api/drawings", { code: `DWG-${uniq("pidok")}`, name: "Tên gốc", kind: "shop" }),
    );
    const { id: drawingId } = await created.json();

    const { PATCH } = await import("@/app/api/drawings/[id]/route");
    const res = await PATCH(jreq("/x", { name: "Tên mới" }, "PATCH"), {
      params: Promise.resolve({ id: String(drawingId) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ name: string; kind: string }>(
      `SELECT name, kind FROM drawings WHERE id = ?`,
      drawingId,
    );
    assert.equal(row?.name, "Tên mới");
    assert.equal(row?.kind, "shop"); // field không gửi giữ nguyên
  },
);

test("PATCH /api/drawings/:id: đổi số bản vẽ trùng số khác → 409", S, async () => {
  const projectId = await taoDuAn("piddup");
  const pm = await taoUser("pm", "piddup");
  await dangNhapDuAn(pm, projectId);
  const codeA = `DWG-${uniq("piddupA")}`;
  const codeB = `DWG-${uniq("piddupB")}`;
  const { POST } = await import("@/app/api/drawings/route");
  const createdA = await POST(jreq("/api/drawings", { code: codeA, name: "A", kind: "shop" }));
  const { id: drawingA } = await createdA.json();
  await POST(jreq("/api/drawings", { code: codeB, name: "B", kind: "shop" }));

  const { PATCH } = await import("@/app/api/drawings/[id]/route");
  const res = await PATCH(jreq("/x", { code: codeB }, "PATCH"), {
    params: Promise.resolve({ id: String(drawingA) }),
  });
  assert.equal(res.status, 409);
});

// ============================================================================
// POST /api/drawings/[id]/revisions — upload rev
// ============================================================================

async function taoBanVe(pm: { id: number; passwordHash: string }, projectId: number, ten: string) {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/drawings/route");
  const created = await POST(
    jreq("/api/drawings", { code: `DWG-${uniq(ten)}`, name: `Bản vẽ ${ten}`, kind: "shop" }),
  );
  const { id } = await created.json();
  return id as number;
}

test("POST /api/drawings/:id/revisions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  const res = await POST(formReq("/api/drawings/1/revisions", form), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/drawings/:id/revisions: subcon không có quyền upload → 403", S, async () => {
  const projectId = await taoDuAn("rvsub");
  const sub = await taoUser("subcon", "rvsub");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  const res = await POST(formReq("/api/drawings/1/revisions", form), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/drawings/:id/revisions: bản vẽ dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("rvisoA");
  const projectB = await taoDuAn("rvisoB");
  const pmB = await taoUser("pm", "rvisoB");
  const drawingB = await taoBanVe(pmB, projectB, "rvisoB");

  const pmA = await taoUser("pm", "rvisoA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  form.set("rev", "R0");
  const res = await POST(formReq(`/api/drawings/${drawingB}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/drawings/:id/revisions: thiếu file → 400", S, async () => {
  const projectId = await taoDuAn("rvnofile");
  const pm = await taoUser("pm", "rvnofile");
  const drawingId = await taoBanVe(pm, projectId, "rvnofile");
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  form.set("rev", "R0");
  const res = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/drawings/:id/revisions: mime không hợp lệ → 415", S, async () => {
  const projectId = await taoDuAn("rvmime");
  const pm = await taoUser("pm", "rvmime");
  const drawingId = await taoBanVe(pm, projectId, "rvmime");
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  form.set("file", new File(["nội dung"], "a.exe", { type: "application/x-msdownload" }));
  form.set("rev", "R0");
  const res = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(res.status, 415);
});

test("POST /api/drawings/:id/revisions: quá kích thước (>50MB) → 413", S, async () => {
  const projectId = await taoDuAn("rvbig");
  const pm = await taoUser("pm", "rvbig");
  const drawingId = await taoBanVe(pm, projectId, "rvbig");
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  // Nội dung không cần đúng magic byte PDF — kiểm size xảy ra TRƯỚC bước sniff mime.
  const big = Buffer.alloc(50 * 1024 * 1024 + 10);
  form.set("file", new File([big], "big.pdf", { type: "application/pdf" }));
  form.set("rev", "R0");
  const res = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(res.status, 413);
});

test("POST /api/drawings/:id/revisions: thiếu số rev → 400", S, async () => {
  const projectId = await taoDuAn("rvnorev");
  const pm = await taoUser("pm", "rvnorev");
  const drawingId = await taoBanVe(pm, projectId, "rvnorev");
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const res = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/drawings/:id/revisions: rev trùng cho cùng bản vẽ → 409", S, async () => {
  const projectId = await taoDuAn("rvdup");
  const pm = await taoUser("pm", "rvdup");
  const drawingId = await taoBanVe(pm, projectId, "rvdup");
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form1 = new FormData();
  form1.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  form1.set("rev", "R0");
  const first = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form1), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(first.status, 201);

  const form2 = new FormData();
  form2.set("file", new File([PDF_BYTES], "b.pdf", { type: "application/pdf" }));
  form2.set("rev", "R0");
  const second = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form2), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(second.status, 409);
});

test("POST /api/drawings/:id/revisions: upload thành công → 201", S, async () => {
  const projectId = await taoDuAn("rvok");
  const pm = await taoUser("pm", "rvok");
  const drawingId = await taoBanVe(pm, projectId, "rvok");
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  form.set("rev", "R1");
  const res = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.rev, "R1");
  assert.equal(body.drawingId, drawingId);
});

// ============================================================================
// PATCH /api/drawings/revisions/[id] — duyệt/từ chối revision
// ============================================================================

async function taoRevision(
  pm: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
  rev = "R0",
): Promise<{ drawingId: number; revisionId: number }> {
  const drawingId = await taoBanVe(pm, projectId, ten);
  const { POST } = await import("@/app/api/drawings/[id]/revisions/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  form.set("rev", rev);
  const res = await POST(formReq(`/api/drawings/${drawingId}/revisions`, form), {
    params: Promise.resolve({ id: String(drawingId) }),
  });
  const { id } = await res.json();
  return { drawingId, revisionId: id };
}

test("PATCH /api/drawings/revisions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
  const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/drawings/revisions/:id: engineer không được duyệt (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("rvd403");
    const eng = await taoUser("engineer", "rvd403");
    await dangNhapDuAn(eng, projectId);
    const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
    const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
      params: Promise.resolve({ id: "1" }),
    });
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/drawings/revisions/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("rvdbad");
  const pm = await taoUser("pm", "rvdbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
  const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/drawings/revisions/:id: revision thuộc bản vẽ dự án khác → 404 (cách ly dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("rvdisoA");
    const projectB = await taoDuAn("rvdisoB");
    const pmB = await taoUser("pm", "rvdisoB");
    const { revisionId } = await taoRevision(pmB, projectB, "rvdisoB");

    const pmA = await taoUser("pm", "rvdisoA");
    await dangNhapDuAn(pmA, projectA);
    const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
    const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
      params: Promise.resolve({ id: String(revisionId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/drawings/revisions/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("rvdbody");
  const pm = await taoUser("pm", "rvdbody");
  const { revisionId } = await taoRevision(pm, projectId, "rvdbody");
  const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(revisionId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/drawings/revisions/:id: từ chối rev → ghi notification cho người upload " +
    "(khác người quyết định), không ghi khi chính người upload tự duyệt rev của mình",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("rvnotify");
    const pm = await taoUser("pm", "rvnotify");
    const eng = await taoUser("engineer", "rvnotify");
    const drawingId = await taoBanVe(pm, projectId, "rvnotify");

    // Engineer (khác PM) upload rev — PM từ chối → phải có notification cho engineer.
    await dangNhapDuAn(eng, projectId);
    const { POST: POSTR } = await import("@/app/api/drawings/[id]/revisions/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
    form.set("rev", "R0");
    const created = await POSTR(formReq(`/api/drawings/${drawingId}/revisions`, form), {
      params: Promise.resolve({ id: String(drawingId) }),
    });
    const { id: revisionId } = await created.json();

    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
    const res = await PATCH(
      jreq("/x", { status: "rejected", decisionNote: "Sai kích thước" }, "PATCH"),
      {
        params: Promise.resolve({ id: String(revisionId) }),
      },
    );
    assert.equal(res.status, 200);

    const noti = await queryOne<{ message: string }>(
      `SELECT message FROM notifications WHERE user_id = ? AND drawing_revision_id = ?`,
      eng.id,
      revisionId,
    );
    assert.ok(noti, "engineer (người upload) phải nhận được notification từ chối");
    assert.match(noti!.message, /Sai kích thước/);

    // Trường hợp còn lại: chính PM tự upload rồi tự duyệt rev của mình — recipients rỗng
    // (loại actingUserId), KHÔNG được ghi notification nào (tránh tự thông báo cho chính mình).
    await dangNhapDuAn(pm, projectId);
    const drawing2 = await taoBanVe(pm, projectId, "rvnotifySelf");
    const form2 = new FormData();
    form2.set("file", new File([PDF_BYTES], "b.pdf", { type: "application/pdf" }));
    form2.set("rev", "R0");
    const created2 = await POSTR(formReq(`/api/drawings/${drawing2}/revisions`, form2), {
      params: Promise.resolve({ id: String(drawing2) }),
    });
    const { id: revision2 } = await created2.json();
    await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
      params: Promise.resolve({ id: String(revision2) }),
    });
    const noti2 = await queryOne(
      `SELECT id FROM notifications WHERE drawing_revision_id = ?`,
      revision2,
    );
    assert.equal(noti2, undefined);
  },
);

test("PATCH /api/drawings/revisions/:id: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("rvdstatus");
  const pm = await taoUser("pm", "rvdstatus");
  const { revisionId } = await taoRevision(pm, projectId, "rvdstatus");
  const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
  const res = await PATCH(jreq("/x", { status: "khong_hop_le" }, "PATCH"), {
    params: Promise.resolve({ id: String(revisionId) }),
  });
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/drawings/revisions/:id: duyệt rev mới tự 'supersede' rev cũ đang hiệu lực",
  S,
  async () => {
    // Bất biến lõi của lib/ky-thuat/drawings.ts::setRevisionStatus: chỉ 1 rev "đang hiệu
    // lực" (approved/approved_with_comments) mỗi bản vẽ tại 1 thời điểm.
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("rvsup");
    const pm = await taoUser("pm", "rvsup");
    const { drawingId, revisionId: rev0 } = await taoRevision(pm, projectId, "rvsup", "R0");

    const { PATCH } = await import("@/app/api/drawings/revisions/[id]/route");
    const approve0 = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
      params: Promise.resolve({ id: String(rev0) }),
    });
    assert.equal(approve0.status, 200);

    const { POST: POSTR } = await import("@/app/api/drawings/[id]/revisions/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "b.pdf", { type: "application/pdf" }));
    form.set("rev", "R1");
    const createdR1 = await POSTR(formReq(`/api/drawings/${drawingId}/revisions`, form), {
      params: Promise.resolve({ id: String(drawingId) }),
    });
    const { id: rev1 } = await createdR1.json();

    const approve1 = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
      params: Promise.resolve({ id: String(rev1) }),
    });
    assert.equal(approve1.status, 200);

    const row0 = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      rev0,
    );
    assert.equal(row0?.status, "superseded", "R0 phải bị thay thế khi R1 được duyệt");
    const row1 = await queryOne<{ status: string }>(
      `SELECT status FROM drawing_revisions WHERE id = ?`,
      rev1,
    );
    assert.equal(row1?.status, "approved");
  },
);

// ============================================================================
// GET/DELETE /api/documents/[id]
// ============================================================================

async function taoTaiLieu(
  taskId: number,
  uploadedBy: number,
  overrides: { fileName?: string; mime?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    taskId,
    overrides.fileName ?? "",
    "bbnt.pdf",
    overrides.mime ?? "application/pdf",
    uploadedBy,
  );
}

test("GET /api/documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("dgbad");
  const pm = await taoUser("pm", "dgbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/documents/:id: không tìm thấy tài liệu → 404", S, async () => {
  const projectId = await taoDuAn("dgnf");
  const pm = await taoUser("pm", "dgnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/documents/:id: subcon không được xem tài liệu của task KHÔNG giao cho mình → 403",
  S,
  async () => {
    const projectId = await taoDuAn("dgsub");
    const sub = await taoUser("subcon", "dgsub");
    const pm = await taoUser("pm", "dgsubPm");
    const taskId = await taoTask(projectId, "dgsub"); // không gán cho subcon
    const docId = await taoTaiLieu(taskId, pm.id);
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 403);
  },
);

test(
  "GET /api/documents/:id: subcon xem được tài liệu của task ĐƯỢC giao cho mình",
  S,
  async () => {
    const projectId = await taoDuAn("dgsubok");
    const sub = await taoUser("subcon", "dgsubok");
    const pm = await taoUser("pm", "dgsubokPm");
    const taskId = await taoTask(projectId, "dgsubok", { assignedTo: sub.id });
    // link document (không có file vật lý) — tránh phải mock storageGet.
    const { insertId } = await import("@/lib/db");
    const docId = await insertId(
      `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by, link_url)
       VALUES (?, '', null, null, ?, 'https://vidu.vn/ho-so.pdf')`,
      taskId,
      pm.id,
    );
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://vidu.vn/ho-so.pdf");
  },
);

test(
  "GET /api/documents/:id: tài liệu gắn floor_approval — subcon KHÔNG được giao tầng đó → 403",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("dgfloor");
    const sub = await taoUser("subcon", "dgfloor");
    const pm = await taoUser("pm", "dgfloorPm");
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
      projectId,
      `Tháp ${uniq("dgfloor")}`,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet')`,
      towerId,
      `SH-${uniq("dgfloor")}`,
    );
    const floorApprovalId = await insertId(
      `INSERT INTO floor_approvals (sheet_type_id, floor_label) VALUES (?, 'T09')`,
      sheetId,
    );
    const docId = await insertId(
      `INSERT INTO task_documents (floor_approval_id, file_name, original_name, mime_type, uploaded_by)
       VALUES (?, '', null, null, ?)`,
      floorApprovalId,
      pm.id,
    );
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("GET /api/documents/:id: file không còn trên đĩa → 404", S, async () => {
  const projectId = await taoDuAn("dgmissing");
  const pm = await taoUser("pm", "dgmissing");
  const taskId = await taoTask(projectId, "dgmissing");
  const docId = await taoTaiLieu(taskId, pm.id, { fileName: "khong-ton-tai-tren-dia.pdf" });
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/documents/:id: file trên đĩa không khớp hash lưu (bị tráo/hỏng) → 409",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const { storagePut } = await import("@/lib/nen/storage");
    const projectId = await taoDuAn("dghash");
    const pm = await taoUser("pm", "dghash");
    const taskId = await taoTask(projectId, "dghash");
    const fileName = `hash-mismatch-${uniq("dghash")}.pdf`;
    await storagePut(1, fileName, Buffer.from("%PDF-1.4\nNoi dung that\n%%EOF"));
    // sha256 lưu trong DB cố tình SAI (giả lập file bị tráo sau khi upload).
    const docId = await insertId(
      `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by, sha256)
       VALUES (?, ?, 'a.pdf', 'application/pdf', ?, ?)`,
      taskId,
      fileName,
      pm.id,
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 409);
  },
);

test("GET /api/documents/:id: link_url scheme lạ (javascript:) → 400", S, async () => {
  const projectId = await taoDuAn("dgxss");
  const pm = await taoUser("pm", "dgxss");
  const taskId = await taoTask(projectId, "dgxss");
  const { insertId } = await import("@/lib/db");
  const docId = await insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by, link_url)
     VALUES (?, '', null, null, ?, 'javascript:alert(1)')`,
    taskId,
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "GET /api/documents/:id: PM dự án A KHÔNG tải được tài liệu của dự án B dù biết id",
  S,
  async () => {
    // LỖ HỔNG THẬT đã vá cùng đợt này. Route chỉ `SELECT ... FROM task_documents WHERE id = ?`
    // rồi xét quyền qua canTouchTask(user, doc.task_id) — nhưng canTouchTask chỉ trả lời câu
    // "subcon này có được giao task không" và trả `true` NGAY cho MỌI vai trò khác, không hề
    // so dự án. Nên bất kỳ user không phải subcon (pm/engineer/admin/bch/cdt/viewer) ở dự án A
    // chỉ cần biết id một tài liệu của dự án B là TẢI ĐƯỢC NGUYÊN VĂN FILE. Id là số nguyên
    // tăng dần nên đoán được — không cần biết trước.
    //
    // Ca này dựng đúng kịch bản đó với nội dung file nhận dạng được, và đòi 404 (không phải
    // 403 — 403 vẫn xác nhận tài liệu tồn tại).
    const { storagePut } = await import("@/lib/nen/storage");
    const projectA = await taoDuAn("dgcrossA");
    const projectB = await taoDuAn("dgcrossB");
    const pmA = await taoUser("pm", "dgcrossA");
    const pmB = await taoUser("pm", "dgcrossB");
    const taskB = await taoTask(projectB, "dgcrossB");
    const noiDungBiMat = Buffer.from("%PDF-1.4\nNOI DUNG MAT CUA DU AN B\n%%EOF");
    const fileName = `cross-project-${uniq("dgcross")}.pdf`;
    await storagePut(1, fileName, noiDungBiMat);
    const docId = await taoTaiLieu(taskB, pmB.id, { fileName });

    await dangNhapDuAn(pmA, projectA);
    const { GET, DELETE } = await import("@/app/api/documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 404, "tài liệu dự án khác phải như không tồn tại");
    const body = await res.text();
    assert.equal(
      body.includes("NOI DUNG MAT CUA DU AN B"),
      false,
      "không được lộ một byte nào của nội dung",
    );

    // Xoá cũng phải bị chặn — rò rỉ đọc đã tệ, xoá dữ liệu dự án khác còn tệ hơn.
    const xoa = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(xoa.status, 404);
    const { queryOne } = await import("@/lib/db");
    assert.ok(
      await queryOne(`SELECT id FROM task_documents WHERE id = ?`, docId),
      "tài liệu của dự án B phải còn nguyên",
    );

    // Và chủ thật của nó vẫn dùng được bình thường — bản vá không được chặn nhầm người đúng.
    await dangNhapDuAn(pmB, projectB);
    const cuaMinh = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(cuaMinh.status, 200);
    assert.ok(Buffer.from(await cuaMinh.arrayBuffer()).includes("NOI DUNG MAT CUA DU AN B"));
  },
);

test("DELETE /api/documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("ddbad");
  const pm = await taoUser("pm", "ddbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("ddnf");
  const pm = await taoUser("pm", "ddnf");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/documents/:id: không phải người upload và không phải Admin/PM → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ddforbid");
    const eng = await taoUser("engineer", "ddforbid");
    const other = await taoUser("engineer", "ddforbidOther");
    const taskId = await taoTask(projectId, "ddforbid");
    const docId = await taoTaiLieu(taskId, other.id);
    await dangNhapDuAn(eng, projectId);
    const { DELETE } = await import("@/app/api/documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 403);
  },
);

test(
  "DELETE /api/documents/:id: chính người upload xoá được (dù không phải Admin/PM)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("ddself");
    const eng = await taoUser("engineer", "ddself");
    const taskId = await taoTask(projectId, "ddself");
    const docId = await taoTaiLieu(taskId, eng.id);
    await dangNhapDuAn(eng, projectId);
    const { DELETE } = await import("@/app/api/documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne(`SELECT id FROM task_documents WHERE id = ?`, docId);
    assert.equal(row, undefined);
  },
);

test(
  "DELETE /api/documents/:id: có file vật lý thật trên đĩa → xoá luôn file (storageDelete)",
  S,
  async () => {
    const { storagePut, storageGet } = await import("@/lib/nen/storage");
    const projectId = await taoDuAn("ddphysical");
    const eng = await taoUser("engineer", "ddphysical");
    const taskId = await taoTask(projectId, "ddphysical");
    const fileName = `delete-real-${uniq("ddphysical")}.pdf`;
    await storagePut(1, fileName, PDF_BYTES);
    const docId = await taoTaiLieu(taskId, eng.id, { fileName });
    await dangNhapDuAn(eng, projectId);
    const { DELETE } = await import("@/app/api/documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 200);
    const conLai = await storageGet(1, fileName);
    assert.equal(conLai, null, "file vật lý phải bị xoá khỏi kho lưu trữ");
  },
);

test("DELETE /api/documents/:id: Admin/PM xoá được dù không phải người upload", S, async () => {
  const projectId = await taoDuAn("ddadmin");
  const eng = await taoUser("engineer", "ddadmin");
  const pm = await taoUser("pm", "ddadminPm");
  const taskId = await taoTask(projectId, "ddadmin");
  const docId = await taoTaiLieu(taskId, eng.id);
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
});

// ============================================================================
// GET/POST /api/correspondences
// ============================================================================

test("GET /api/correspondences: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/correspondences/route");
  const res = await GET(jreq("/api/correspondences", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/correspondences: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("cgsub");
  const sub = await taoUser("subcon", "cgsub");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/correspondences/route");
  const res = await GET(jreq("/api/correspondences", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/correspondences: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("cgstatus");
  const pm = await taoUser("pm", "cgstatus");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/correspondences/route");
  const res = await GET(jreq("/api/correspondences?status=khong_hop_le", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/correspondences: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("cgkind");
  const pm = await taoUser("pm", "cgkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/correspondences/route");
  const res = await GET(jreq("/api/correspondences?kind=khong_hop_le", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/correspondences: cách ly dự án — không thấy công văn dự án khác", S, async () => {
  const projectA = await taoDuAn("cgisoA");
  const projectB = await taoDuAn("cgisoB");
  const pmA = await taoUser("pm", "cgisoA");
  const pmB = await taoUser("pm", "cgisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/correspondences/route");
  await POST(
    jreq("/api/correspondences", {
      code: `CV-${uniq("cgisoB")}`,
      counterparty: "CĐT",
      subject: "Văn bản B",
    }),
  );
  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/correspondences", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).correspondences, []);
});

test("POST /api/correspondences: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/correspondences/route");
  const res = await POST(jreq("/api/correspondences", {}));
  assert.equal(res.status, 401);
});

test("POST /api/correspondences: bch xem được công văn nhưng KHÔNG được tạo → 403", S, async () => {
  const projectId = await taoDuAn("cp403");
  const bch = await taoUser("bch", "cp403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/correspondences/route");
  const res = await POST(jreq("/api/correspondences", {}));
  assert.equal(res.status, 403);
});

test("POST /api/correspondences: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("cnoproj");
  const pm = await taoUser("pm", "cnoproj");
  const other = await taoUser("pm", "cnoprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/correspondences/route");
    const res = await POST(jreq("/api/correspondences", {}));
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/correspondences: body rỗng → 400", S, async () => {
  const projectId = await taoDuAn("cbody");
  const pm = await taoUser("pm", "cbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/correspondences/route");
  const res = await POST(
    new NextRequest("http://localhost/api/correspondences", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test(
  "POST /api/correspondences: thiếu số văn bản → 422 (validateCorrespondenceInput)",
  S,
  async () => {
    const projectId = await taoDuAn("cval");
    const pm = await taoUser("pm", "cval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/correspondences/route");
    const res = await POST(
      jreq("/api/correspondences", { counterparty: "CĐT", subject: "Thiếu số" }),
    );
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/correspondences: task tham chiếu không tồn tại → 422 (checkCorrespondenceRefs)",
  S,
  async () => {
    const projectId = await taoDuAn("cref");
    const pm = await taoUser("pm", "cref");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/correspondences/route");
    const res = await POST(
      jreq("/api/correspondences", {
        code: `CV-${uniq("cref")}`,
        counterparty: "CĐT",
        subject: "Ref hỏng",
        taskId: 999999999,
      }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /Công việc/);
  },
);

test("POST /api/correspondences: hạn phản hồi trước ngày gửi → 422", S, async () => {
  const projectId = await taoDuAn("cdate");
  const pm = await taoUser("pm", "cdate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/correspondences/route");
  const res = await POST(
    jreq("/api/correspondences", {
      code: `CV-${uniq("cdate")}`,
      counterparty: "CĐT",
      subject: "Ngày sai",
      sentDate: "2026-09-10",
      dueDate: "2026-09-01",
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/correspondences: thành công → project_id do SERVER suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cok");
  const eng = await taoUser("engineer", "cok");
  await dangNhapDuAn(eng, projectId);
  const code = `CV-${uniq("cok")}`;
  const { POST } = await import("@/app/api/correspondences/route");
  const res = await POST(
    jreq("/api/correspondences", { code, counterparty: "TVGS", subject: "Hợp lệ" }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM correspondences WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH /api/correspondences/[id]
// ============================================================================

async function taoCongVan(
  pm: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
): Promise<number> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/correspondences/route");
  const created = await POST(
    jreq("/api/correspondences", {
      code: `CV-${uniq(ten)}`,
      counterparty: "CĐT",
      subject: `Văn bản ${ten}`,
    }),
  );
  const { id } = await created.json();
  return id as number;
}

test("GET /api/correspondences/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/correspondences/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/correspondences/:id: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cgid403");
  const sub = await taoUser("subcon", "cgid403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/correspondences/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/correspondences/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cgidbad");
  const pm = await taoUser("pm", "cgidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/correspondences/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/correspondences/:id: văn bản của dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("cgidisoA");
  const projectB = await taoDuAn("cgidisoB");
  const pmB = await taoUser("pm", "cgidisoB");
  const cvB = await taoCongVan(pmB, projectB, "cgidisoB");

  const pmA = await taoUser("pm", "cgidisoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/correspondences/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(cvB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/correspondences/:id: trả kèm chuỗi hỏi-đáp (thread) đúng gốc", S, async () => {
  const projectId = await taoDuAn("cthread");
  const pm = await taoUser("pm", "cthread");
  const goc = await taoCongVan(pm, projectId, "cthread");

  const { POST: POSTREPLY } = await import("@/app/api/correspondences/[id]/reply/route");
  const reply = await POSTREPLY(
    jreq(
      "/x",
      { code: `CV-${uniq("cthreadReply")}`, counterparty: "CĐT", subject: "Trả lời" },
      "POST",
    ),
    { params: Promise.resolve({ id: String(goc) }) },
  );
  assert.equal(reply.status, 201);

  const { GET } = await import("@/app/api/correspondences/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(goc) }),
  });
  assert.equal(res.status, 200);
  const { thread, correspondence } = await res.json();
  assert.equal(correspondence.status, "replied");
  assert.equal(thread.length, 2);
});

test("PATCH /api/correspondences/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/correspondences/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/correspondences/:id: bch không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("cpid403");
  const bch = await taoUser("bch", "cpid403");
  await dangNhapDuAn(bch, projectId);
  const { PATCH } = await import("@/app/api/correspondences/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/correspondences/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cpidbad");
  const pm = await taoUser("pm", "cpidbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/correspondences/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/correspondences/:id: văn bản dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("cpidisoA");
  const projectB = await taoDuAn("cpidisoB");
  const pmB = await taoUser("pm", "cpidisoB");
  const cvB = await taoCongVan(pmB, projectB, "cpidisoB");

  const pmA = await taoUser("pm", "cpidisoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/correspondences/[id]/route");
  const res = await PATCH(jreq("/x", { subject: "hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(cvB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/correspondences/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("cpidbody");
  const pm = await taoUser("pm", "cpidbody");
  const cv = await taoCongVan(pm, projectId, "cpidbody");
  const { PATCH } = await import("@/app/api/correspondences/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(cv) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/correspondences/:id: sửa thành công (merge — field không gửi giữ nguyên)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("cpidok");
    const pm = await taoUser("pm", "cpidok");
    const cv = await taoCongVan(pm, projectId, "cpidok");
    const { PATCH } = await import("@/app/api/correspondences/[id]/route");
    const res = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
      params: Promise.resolve({ id: String(cv) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string; counterparty: string }>(
      `SELECT status, counterparty FROM correspondences WHERE id = ?`,
      cv,
    );
    assert.equal(row?.status, "closed");
    assert.equal(row?.counterparty, "CĐT"); // field không gửi giữ nguyên
  },
);

// ============================================================================
// POST /api/correspondences/[id]/reply
// ============================================================================

test("POST /api/correspondences/:id/reply: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
  const res = await POST(jreq("/x", {}, "POST"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/correspondences/:id/reply: bch không có quyền trả lời → 403", S, async () => {
  const projectId = await taoDuAn("crp403");
  const bch = await taoUser("bch", "crp403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
  const res = await POST(jreq("/x", {}, "POST"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/correspondences/:id/reply: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("crpbad");
  const pm = await taoUser("pm", "crpbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
  const res = await POST(jreq("/x", {}, "POST"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test(
  "POST /api/correspondences/:id/reply: văn bản gốc thuộc dự án khác → 404 (cách ly dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("crpisoA");
    const projectB = await taoDuAn("crpisoB");
    const pmB = await taoUser("pm", "crpisoB");
    const cvB = await taoCongVan(pmB, projectB, "crpisoB");

    const pmA = await taoUser("pm", "crpisoA");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
    const res = await POST(
      jreq("/x", { code: `CV-${uniq("crpiso")}`, counterparty: "CĐT", subject: "Trả lời chéo" }),
      { params: Promise.resolve({ id: String(cvB) }) },
    );
    assert.equal(res.status, 404);
  },
);

test("POST /api/correspondences/:id/reply: body rỗng → 400", S, async () => {
  const projectId = await taoDuAn("crpbody");
  const pm = await taoUser("pm", "crpbody");
  const cv = await taoCongVan(pm, projectId, "crpbody");
  const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
  const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "x" }), {
    params: Promise.resolve({ id: String(cv) }),
  });
  assert.equal(res.status, 400);
});

test(
  "POST /api/correspondences/:id/reply: thành công → direction='out', gốc chuyển 'replied'",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("crpok");
    const pm = await taoUser("pm", "crpok");
    const goc = await taoCongVan(pm, projectId, "crpok");

    const { POST } = await import("@/app/api/correspondences/[id]/reply/route");
    const res = await POST(
      jreq("/x", {
        code: `CV-${uniq("crpokReply")}`,
        counterparty: "CĐT",
        subject: "Đã trả lời",
        direction: "in", // route PHẢI ép về 'out' — không tin client
      }),
      { params: Promise.resolve({ id: String(goc) }) },
    );
    assert.equal(res.status, 201);
    const { id: replyId } = await res.json();

    const replyRow = await queryOne<{ direction: string; reply_id: number }>(
      `SELECT direction, reply_id FROM correspondences WHERE id = ?`,
      replyId,
    );
    assert.equal(replyRow?.direction, "out");
    assert.equal(replyRow?.reply_id, goc);

    const gocRow = await queryOne<{ status: string }>(
      `SELECT status FROM correspondences WHERE id = ?`,
      goc,
    );
    assert.equal(gocRow?.status, "replied");
  },
);
