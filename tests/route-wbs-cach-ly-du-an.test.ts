import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// V9 — vá 4 lỗ hổng ghi/xoá XUYÊN DỰ ÁN ở tầng WBS phát hiện lúc review V3 (Đợt 4 coverage).
// Đường ĐỌC (GET) của các cụm này đã lọc dự án qua visibleProjectIds; đường GHI/XOÁ theo :id
// không kiểm gì — id đoán được là sửa/xoá được dữ liệu dự án khác. File này khoá hành vi VÁ:
// mỗi route có cả ca 404 xuyên dự án (VÀ xác nhận dữ liệu không đổi) lẫn ca vẫn chạy đúng khi
// thao tác trong đúng dự án của mình.
//   - app/api/towers/[id]/route.ts                       (PATCH/DELETE)
//   - app/api/sheets/[id]/route.ts                        (PATCH/DELETE)
//   - app/api/work-fronts/route.ts                        (GET — lọc theo dự án)
//   - app/api/work-fronts/[id]/route.ts                   (PATCH)
//   - app/api/work-fronts/[id]/documents/route.ts         (GET/POST)
//   - app/api/work-front-documents/[id]/route.ts          (GET/DELETE)
//   - app/api/packages/[id]/dependencies/route.ts         (GET/POST)
//   - app/api/package-dependencies/[id]/route.ts          (DELETE)

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `WBSISO ${uniq(ten)}`);
}

async function taoUser(role: string, ten: string): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `wbsiso-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-wbsiso', ?, 1)`,
    `WBSISO ${ten}`,
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

/** Dựng dự án + tháp + sheet — chuỗi tối thiểu để suy project_id cho tower/sheet/package/work_front. */
async function dungSheet(ten: string): Promise<SheetCtx> {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn(ten);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp WBSISO')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet WBSISO', ?)`,
    towerId,
    `WBSISO${uniq(ten)}`,
    `wbsiso-${ten.toLowerCase()}-${uniq("slug")}`,
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

async function taoWorkFront(sheetTypeId: number, floorLabel: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, ?)`,
    sheetTypeId,
    floorLabel,
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
// PATCH/DELETE /api/towers/:id
// ============================================================================

test("PATCH /api/towers/:id: tháp thuộc dự án khác → 404, tên KHÔNG đổi", S, async () => {
  const a = await dungSheet("towerA");
  const b = await dungSheet("towerB");
  const pmA = await taoUser("pm", "towerA");
  await dangNhapDuAn(pmA, a.projectId);

  const { queryOne } = await import("@/lib/db");
  const before = await queryOne<{ name: string }>(
    `SELECT name FROM towers WHERE id = ?`,
    b.towerId,
  );

  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Tên hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(b.towerId) }),
  });
  assert.equal(res.status, 404);

  const after = await queryOne<{ name: string }>(`SELECT name FROM towers WHERE id = ?`, b.towerId);
  assert.equal(after!.name, before!.name, "tên tháp dự án B không được đổi");
});

test("PATCH /api/towers/:id: đúng dự án của mình → 200, đổi tên thành công", S, async () => {
  const a = await dungSheet("towerOk");
  const pmA = await taoUser("pm", "towerOk");
  await dangNhapDuAn(pmA, a.projectId);
  const { PATCH } = await import("@/app/api/towers/[id]/route");
  const newName = `Tên mới ${uniq("tower")}`;
  const res = await PATCH(jreq("/x", { name: newName }, "PATCH"), {
    params: Promise.resolve({ id: String(a.towerId) }),
  });
  assert.equal(res.status, 200);
  const { tower } = await res.json();
  assert.equal(tower.name, newName);
});

test("DELETE /api/towers/:id: tháp thuộc dự án khác → 404, tháp KHÔNG bị xoá", S, async () => {
  const a = await dungSheet("towerDelA");
  const projectB = await taoDuAn("towerDelB");
  const { insertId, queryOne } = await import("@/lib/db");
  const towerB = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp B trống')`,
    projectB,
  );
  const pmA = await taoUser("pm", "towerDelA");
  await dangNhapDuAn(pmA, a.projectId);

  const { DELETE } = await import("@/app/api/towers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(towerB) }),
  });
  assert.equal(res.status, 404);

  const still = await queryOne(`SELECT id FROM towers WHERE id = ?`, towerB);
  assert.ok(still, "tháp dự án B vẫn còn nguyên");
});

test(
  "DELETE /api/towers/:id: đúng dự án của mình, tháp trống → 200, xoá thành công",
  S,
  async () => {
    const projectId = await taoDuAn("towerDelOk");
    const { insertId, queryOne } = await import("@/lib/db");
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp trống')`,
      projectId,
    );
    const pm = await taoUser("pm", "towerDelOk");
    await dangNhapDuAn(pm, projectId);
    const { DELETE } = await import("@/app/api/towers/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(towerId) }),
    });
    assert.equal(res.status, 200);
    const still = await queryOne(`SELECT id FROM towers WHERE id = ?`, towerId);
    assert.equal(still, undefined);
  },
);

// ============================================================================
// PATCH/DELETE /api/sheets/:id
// ============================================================================

test("PATCH /api/sheets/:id: sheet thuộc dự án khác → 404, tên KHÔNG đổi", S, async () => {
  const a = await dungSheet("sheetA");
  const b = await dungSheet("sheetB");
  const pmA = await taoUser("pm", "sheetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { queryOne } = await import("@/lib/db");
  const before = await queryOne<{ name: string }>(
    `SELECT name FROM sheet_types WHERE id = ?`,
    b.sheetTypeId,
  );

  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Tên hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(b.sheetTypeId) }),
  });
  assert.equal(res.status, 404);

  const after = await queryOne<{ name: string }>(
    `SELECT name FROM sheet_types WHERE id = ?`,
    b.sheetTypeId,
  );
  assert.equal(after!.name, before!.name, "tên sheet dự án B không được đổi");
});

test("PATCH /api/sheets/:id: đúng dự án của mình → 200, đổi tên thành công", S, async () => {
  const a = await dungSheet("sheetOk");
  const pmA = await taoUser("pm", "sheetOk");
  await dangNhapDuAn(pmA, a.projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Sheet đã sửa" }, "PATCH"), {
    params: Promise.resolve({ id: String(a.sheetTypeId) }),
  });
  assert.equal(res.status, 200);
  const { sheet } = await res.json();
  assert.equal(sheet.name, "Sheet đã sửa");
});

test("DELETE /api/sheets/:id: sheet thuộc dự án khác → 404, sheet KHÔNG bị xoá", S, async () => {
  const a = await dungSheet("sheetDelA");
  const b = await dungSheet("sheetDelB");
  const pmA = await taoUser("pm", "sheetDelA");
  await dangNhapDuAn(pmA, a.projectId);

  const { DELETE } = await import("@/app/api/sheets/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(b.sheetTypeId) }),
  });
  assert.equal(res.status, 404);

  const { queryOne } = await import("@/lib/db");
  const still = await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, b.sheetTypeId);
  assert.ok(still, "sheet dự án B vẫn còn nguyên");
});

test("DELETE /api/sheets/:id: đúng dự án của mình → 200, xoá thành công", S, async () => {
  const a = await dungSheet("sheetDelOk");
  const pmA = await taoUser("pm", "sheetDelOk");
  await dangNhapDuAn(pmA, a.projectId);
  const { DELETE } = await import("@/app/api/sheets/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(a.sheetTypeId) }),
  });
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const still = await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, a.sheetTypeId);
  assert.equal(still, undefined);
});

// ============================================================================
// GET /api/work-fronts — lọc theo dự án
// ============================================================================

test("GET /api/work-fronts: không thấy mặt trận của dự án khác", S, async () => {
  const a = await dungSheet("wfListA");
  const b = await dungSheet("wfListB");
  await taoWorkFront(a.sheetTypeId, "T01");
  const frontB = await taoWorkFront(b.sheetTypeId, "T01");
  const pmA = await taoUser("pm", "wfListA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/work-fronts/route");
  const res = await GET(jreq("/api/work-fronts", undefined, "GET"));
  assert.equal(res.status, 200);
  const { workFronts } = await res.json();
  assert.ok(
    workFronts.every((w: { id: number }) => w.id !== frontB),
    "không được lẫn work_front của dự án khác",
  );
});

test("GET /api/work-fronts: vẫn thấy mặt trận của đúng dự án mình", S, async () => {
  const a = await dungSheet("wfListOk");
  const frontA = await taoWorkFront(a.sheetTypeId, "T01");
  const pmA = await taoUser("pm", "wfListOk");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/work-fronts/route");
  const res = await GET(jreq("/api/work-fronts", undefined, "GET"));
  assert.equal(res.status, 200);
  const { workFronts } = await res.json();
  assert.ok(workFronts.some((w: { id: number }) => w.id === frontA));
});

// ============================================================================
// PATCH /api/work-fronts/:id
// ============================================================================

test(
  "PATCH /api/work-fronts/:id: mặt trận thuộc dự án khác → 404, trạng thái KHÔNG đổi",
  S,
  async () => {
    const a = await dungSheet("wfPatchA");
    const b = await dungSheet("wfPatchB");
    const frontB = await taoWorkFront(b.sheetTypeId, "T01");
    const pmA = await taoUser("pm", "wfPatchA");
    await dangNhapDuAn(pmA, a.projectId);

    const { queryOne } = await import("@/lib/db");
    const before = await queryOne<{ status: string }>(
      `SELECT status FROM work_fronts WHERE id = ?`,
      frontB,
    );

    const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
    const res = await PATCH(jreq("/x", { status: "handed_over" }, "PATCH"), {
      params: Promise.resolve({ id: String(frontB) }),
    });
    assert.equal(res.status, 404);

    const after = await queryOne<{ status: string }>(
      `SELECT status FROM work_fronts WHERE id = ?`,
      frontB,
    );
    assert.equal(after!.status, before!.status, "trạng thái mặt trận dự án B không được đổi");
  },
);

test(
  "PATCH /api/work-fronts/:id: đúng dự án của mình → 200, đổi trạng thái thành công",
  S,
  async () => {
    const a = await dungSheet("wfPatchOk");
    const frontA = await taoWorkFront(a.sheetTypeId, "T01");
    const pmA = await taoUser("pm", "wfPatchOk");
    await dangNhapDuAn(pmA, a.projectId);
    const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
    const res = await PATCH(jreq("/x", { status: "handed_over" }, "PATCH"), {
      params: Promise.resolve({ id: String(frontA) }),
    });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const after = await queryOne<{ status: string }>(
      `SELECT status FROM work_fronts WHERE id = ?`,
      frontA,
    );
    assert.equal(after!.status, "handed_over");
  },
);

// ============================================================================
// GET/POST /api/work-fronts/:id/documents · GET/DELETE /api/work-front-documents/:id
// ============================================================================

test("GET /api/work-fronts/:id/documents: mặt trận thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wfDocGetA");
  const b = await dungSheet("wfDocGetB");
  const frontB = await taoWorkFront(b.sheetTypeId, "T01");
  const pmA = await taoUser("pm", "wfDocGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/work-fronts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(frontB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/work-fronts/:id/documents: mặt trận thuộc dự án khác → 404, không tạo tài liệu",
  S,
  async () => {
    const a = await dungSheet("wfDocPostA");
    const b = await dungSheet("wfDocPostB");
    const frontB = await taoWorkFront(b.sheetTypeId, "T01");
    const pmA = await taoUser("pm", "wfDocPostA");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
    const res = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(frontB) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const doc = await queryOne(
      `SELECT id FROM work_front_documents WHERE work_front_id = ?`,
      frontB,
    );
    assert.equal(doc, undefined, "không được tạo tài liệu cho mặt trận dự án khác");
  },
);

test(
  "POST /api/work-fronts/:id/documents: đúng dự án mình → 201, GET list + stream đúng byte",
  S,
  async () => {
    const a = await dungSheet("wfDocOk");
    const frontA = await taoWorkFront(a.sheetTypeId, "T01");
    const pmA = await taoUser("pm", "wfDocOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
    const created = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(frontA) }),
    });
    assert.equal(created.status, 201);
    const { id: docId } = await created.json();

    const { GET: getList } = await import("@/app/api/work-fronts/[id]/documents/route");
    const list = await getList(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(frontA) }),
    });
    assert.equal(list.status, 200);
    const { documents } = await list.json();
    assert.equal(documents.length, 1);

    const { GET: stream } = await import("@/app/api/work-front-documents/[id]/route");
    const res = await stream(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buf, PDF_BYTES);
  },
);

test("GET /api/work-front-documents/:id: tài liệu thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("wfDocStreamA");
  const b = await dungSheet("wfDocStreamB");
  const frontB = await taoWorkFront(b.sheetTypeId, "T01");
  const pmB = await taoUser("pm", "wfDocStreamBUp");
  await dangNhapDuAn(pmB, b.projectId);
  const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
  const created = await POST(formReq("/x", pdfForm()), {
    params: Promise.resolve({ id: String(frontB) }),
  });
  const { id: docId } = await created.json();

  const pmA = await taoUser("pm", "wfDocStreamA");
  await dangNhapDuAn(pmA, a.projectId);
  const { GET } = await import("@/app/api/work-front-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/work-front-documents/:id: tài liệu thuộc dự án khác → 404, KHÔNG bị xoá",
  S,
  async () => {
    const a = await dungSheet("wfDocDelA");
    const b = await dungSheet("wfDocDelB");
    const frontB = await taoWorkFront(b.sheetTypeId, "T01");
    const pmB = await taoUser("pm", "wfDocDelBUp");
    await dangNhapDuAn(pmB, b.projectId);
    const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
    const created = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(frontB) }),
    });
    const { id: docId } = await created.json();

    const pmA = await taoUser("pm", "wfDocDelA");
    await dangNhapDuAn(pmA, a.projectId);
    const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const still = await queryOne(`SELECT id FROM work_front_documents WHERE id = ?`, docId);
    assert.ok(still, "tài liệu dự án B vẫn còn nguyên");
  },
);

test(
  "DELETE /api/work-front-documents/:id: đúng dự án mình (uploader) → 200, xoá thành công",
  S,
  async () => {
    const a = await dungSheet("wfDocDelOk");
    const frontA = await taoWorkFront(a.sheetTypeId, "T01");
    const pmA = await taoUser("pm", "wfDocDelOk");
    await dangNhapDuAn(pmA, a.projectId);
    const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
    const created = await POST(formReq("/x", pdfForm()), {
      params: Promise.resolve({ id: String(frontA) }),
    });
    const { id: docId } = await created.json();

    const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 200);
  },
);

// ============================================================================
// GET/POST /api/packages/:id/dependencies · DELETE /api/package-dependencies/:id
// ============================================================================

test("GET /api/packages/:id/dependencies: nhóm việc thuộc dự án khác → 404", S, async () => {
  const a = await dungSheet("pdepGetA");
  const b = await dungSheet("pdepGetB");
  const pkgB = await taoNhom(b.sheetTypeId, "B1");
  const pmA = await taoUser("pm", "pdepGetA");
  await dangNhapDuAn(pmA, a.projectId);

  const { GET } = await import("@/app/api/packages/[id]/dependencies/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(pkgB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/packages/:id/dependencies: predecessor ở dự án khác → 404, KHÔNG tạo quan hệ",
  S,
  async () => {
    const a = await dungSheet("pdepPostA");
    const b = await dungSheet("pdepPostB");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const pmA = await taoUser("pm", "pdepPostA");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
    const res = await POST(jreq("/x", { predecessorId: pkgB }), {
      params: Promise.resolve({ id: String(pkgA) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const dep = await queryOne(
      `SELECT id FROM package_dependencies WHERE predecessor_id = ? AND successor_id = ?`,
      pkgB,
      pkgA,
    );
    assert.equal(dep, undefined, "không được tạo quan hệ phụ thuộc xuyên dự án");
  },
);

test(
  "POST /api/packages/:id/dependencies: successor thuộc dự án khác → 404 (id trong URL đoán được)",
  S,
  async () => {
    const a = await dungSheet("pdepPostSuccA");
    const b = await dungSheet("pdepPostSuccB");
    const pkgA = await taoNhom(a.sheetTypeId, "A1");
    const pkgB = await taoNhom(b.sheetTypeId, "B1");
    const pmA = await taoUser("pm", "pdepPostSuccA");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
    // pmA đang ở dự án A nhưng đoán id nhóm việc B trong URL — cả predecessor lẫn successor
    // đều phải nằm trong dự án nhìn thấy được.
    const res = await POST(jreq("/x", { predecessorId: pkgA }), {
      params: Promise.resolve({ id: String(pkgB) }),
    });
    assert.equal(res.status, 404);
  },
);

test(
  "GET+POST /api/packages/:id/dependencies: đúng dự án của mình → hoạt động bình thường",
  S,
  async () => {
    const a = await dungSheet("pdepOk");
    const pkgA1 = await taoNhom(a.sheetTypeId, "A1");
    const pkgA2 = await taoNhom(a.sheetTypeId, "A2");
    const pmA = await taoUser("pm", "pdepOk");
    await dangNhapDuAn(pmA, a.projectId);

    const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
    const created = await POST(jreq("/x", { predecessorId: pkgA1 }), {
      params: Promise.resolve({ id: String(pkgA2) }),
    });
    assert.equal(created.status, 201);

    const { GET } = await import("@/app/api/packages/[id]/dependencies/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(pkgA2) }),
    });
    assert.equal(res.status, 200);
    const { predecessors } = await res.json();
    assert.equal(predecessors.length, 1);
    assert.equal(predecessors[0].id, pkgA1);
  },
);

test(
  "DELETE /api/package-dependencies/:id: quan hệ thuộc dự án khác → 404, KHÔNG bị xoá",
  S,
  async () => {
    const a = await dungSheet("pdelIsoA");
    const b = await dungSheet("pdelIsoB");
    const pkgB1 = await taoNhom(b.sheetTypeId, "B1");
    const pkgB2 = await taoNhom(b.sheetTypeId, "B2");
    const pmB = await taoUser("pm", "pdelIsoBOwn");
    await dangNhapDuAn(pmB, b.projectId);
    const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
    const created = await POST(jreq("/x", { predecessorId: pkgB1 }), {
      params: Promise.resolve({ id: String(pkgB2) }),
    });
    const { id: depId } = await created.json();

    const pmA = await taoUser("pm", "pdelIsoA");
    await dangNhapDuAn(pmA, a.projectId);
    const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(depId) }),
    });
    assert.equal(res.status, 404);

    const { queryOne } = await import("@/lib/db");
    const still = await queryOne(`SELECT id FROM package_dependencies WHERE id = ?`, depId);
    assert.ok(still, "quan hệ phụ thuộc dự án B vẫn còn nguyên");
  },
);

test(
  "DELETE /api/package-dependencies/:id: đúng dự án của mình → 200, xoá thành công",
  S,
  async () => {
    const a = await dungSheet("pdelIsoOk");
    const pkgA1 = await taoNhom(a.sheetTypeId, "A1");
    const pkgA2 = await taoNhom(a.sheetTypeId, "A2");
    const pmA = await taoUser("pm", "pdelIsoOk");
    await dangNhapDuAn(pmA, a.projectId);
    const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
    const created = await POST(jreq("/x", { predecessorId: pkgA1 }), {
      params: Promise.resolve({ id: String(pkgA2) }),
    });
    const { id: depId } = await created.json();

    const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(depId) }),
    });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const still = await queryOne(`SELECT id FROM package_dependencies WHERE id = ?`, depId);
    assert.equal(still, undefined);
  },
);
