import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TỔ CHỨC/THẦU PHỤ/HỌP — cùng khuôn với
// tests/route-tai-chinh.test.ts. Route:
//   - app/api/subcontractors/route.ts             (GET danh sách NTP)
//   - app/api/subcontractors/[supplierId]/route.ts (GET hồ sơ 1 NTP)
//   - app/api/meetings/route.ts                    (GET/POST biên bản họp)
//   - app/api/meetings/[id]/route.ts               (GET/PATCH/DELETE 1 biên bản họp)
//   - app/api/crews/route.ts                       (GET/POST tổ đội)
//   - app/api/crews/[id]/route.ts                  (PATCH/DELETE 1 tổ đội)
//   - app/api/vehicles/route.ts                    (GET/POST xe ra vào công trường)
//   - app/api/vehicles/[id]/route.ts               (PATCH 1 xe — hành động cổng + sửa)
//   - app/api/saved-reports/route.ts               (GET/POST báo cáo đã lưu)
//   - app/api/saved-reports/[id]/route.ts          (PATCH/DELETE 1 báo cáo đã lưu)

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/tên/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TCTP route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  overrides: { supplierId?: number | null; orgId?: number } = {},
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tctp-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id, supplier_id) VALUES (?, ?, 'hash-test-tctp-route', ?, ?, ?)`,
    `TCTP ${ten}`,
    email,
    role,
    overrides.orgId ?? 1,
    overrides.supplierId ?? null,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

async function taoSupplier(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name) VALUES (?)`, `NTP ${uniq(ten)}`);
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET /api/subcontractors
// ============================================================================

test("GET /api/subcontractors: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/subcontractors/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test(
  "GET /api/subcontractors: subcon chỉ thấy đúng NTP của mình, không lộ NTP khác",
  S,
  async () => {
    // Bất biến M15: subcon KHÔNG được liệt kê toàn bộ NTP trong hệ thống — chỉ đúng
    // hồ sơ gắn với users.supplier_id của chính mình.
    const { run, insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("subc-list");
    const supplierMine = await taoSupplier("mine");
    const supplierOther = await taoSupplier("other");
    // system_contractors là điều kiện để listSubcontractors() coi 1 supplier là "NTP".
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ test')`,
      `SYS-${uniq("subc")}`,
    );
    await run(
      `INSERT INTO system_contractors (system_id, supplier_id) VALUES (?, ?), (?, ?)`,
      sysId,
      supplierMine,
      sysId,
      supplierOther,
    );
    const sub = await taoUser("subcon", "subc-list", { supplierId: supplierMine });
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/subcontractors/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const { items } = await res.json();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, supplierMine);
  },
);

test("GET /api/subcontractors: subcon chưa gán supplier_id → danh sách rỗng", S, async () => {
  const projectId = await taoDuAn("subc-norsupp");
  const sub = await taoUser("subcon", "subc-norsupp", { supplierId: null });
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/subcontractors/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, []);
});

test("GET /api/subcontractors: PM/Admin thấy toàn bộ NTP (không bị lọc)", S, async () => {
  const { run, insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("subc-pm");
  const supplierA = await taoSupplier("pmA");
  const supplierB = await taoSupplier("pmB");
  const sysId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ test')`,
    `SYS-${uniq("subcpm")}`,
  );
  await run(
    `INSERT INTO system_contractors (system_id, supplier_id) VALUES (?, ?), (?, ?)`,
    sysId,
    supplierA,
    sysId,
    supplierB,
  );
  const pm = await taoUser("pm", "subc-pm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/subcontractors/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { items } = await res.json();
  const ids = items.map((i: { id: number }) => i.id).sort((a: number, b: number) => a - b);
  assert.ok(ids.includes(supplierA) && ids.includes(supplierB));
});

// ============================================================================
// GET /api/subcontractors/:supplierId
// ============================================================================

test("GET /api/subcontractors/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: "1" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/subcontractors/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("subid-bad");
  const pm = await taoUser("pm", "subid-bad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/subcontractors/:id: subcon xem hồ sơ NTP KHÁC mình → 403", S, async () => {
  // Bất biến cốt lõi M33: subcon không được đọc hồ sơ NTP khác qua đoán ID.
  const projectId = await taoDuAn("subid-403");
  const supplierMine = await taoSupplier("403mine");
  const supplierOther = await taoSupplier("403other");
  const sub = await taoUser("subcon", "subid-403", { supplierId: supplierMine });
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierOther) }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /của mình/);
});

test("GET /api/subcontractors/:id: subcon xem đúng NTP của mình → 200", S, async () => {
  const projectId = await taoDuAn("subid-ok");
  const supplierMine = await taoSupplier("okmine");
  const sub = await taoUser("subcon", "subid-ok", { supplierId: supplierMine });
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: String(supplierMine) }),
  });
  assert.equal(res.status, 200);
  const { item } = await res.json();
  assert.equal(item.id, supplierMine);
  assert.ok(item.debt);
});

test("GET /api/subcontractors/:id: không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("subid-404");
  const pm = await taoUser("pm", "subid-404");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/subcontractors/[supplierId]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ supplierId: "999999999" }),
  });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET/POST /api/meetings
// ============================================================================

test("GET /api/meetings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/meetings/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/meetings: cách ly dự án — không thấy họp của dự án khác", S, async () => {
  const projectA = await taoDuAn("mtg-isoA");
  const projectB = await taoDuAn("mtg-isoB");
  const pmA = await taoUser("pm", "mtg-isoA");
  const pmB = await taoUser("pm", "mtg-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/meetings/route");
  await POST(jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly", title: "Họp B" }));
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/meetings/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).meetings, []);
});

test("POST /api/meetings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/meetings/route");
  const res = await POST(jreq("/api/meetings", {}));
  assert.equal(res.status, 401);
});

test("POST /api/meetings: subcon không được tạo biên bản họp → 403", S, async () => {
  const projectId = await taoDuAn("mtg-403");
  const sub = await taoUser("subcon", "mtg-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/meetings/route");
  const res = await POST(jreq("/api/meetings", {}));
  assert.equal(res.status, 403);
});

test("POST /api/meetings: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("mtg-noproj");
  const pm = await taoUser("pm", "mtg-noproj");
  const other = await taoUser("pm", "mtg-noprojOther");
  // Gán dự án cho NGƯỜI KHÁC (bảng user_projects khác rỗng) → pm hiện tại không thấy
  // dự án nào — cùng kỹ thuật tests/route-tai-chinh.test.ts.
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/meetings/route");
    const res = await POST(
      jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly", title: "x" }),
    );
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/meetings: thiếu tiêu đề → 422", S, async () => {
  const projectId = await taoDuAn("mtg-val");
  const pm = await taoUser("pm", "mtg-val");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/meetings/route");
  const res = await POST(jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly" }));
  assert.equal(res.status, 422);
});

test("POST /api/meetings: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("mtg-body");
  const pm = await taoUser("pm", "mtg-body");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/meetings/route");
  const res = await POST(
    new NextRequest("http://localhost/api/meetings", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/meetings: thành công → project_id do SERVER suy, không tin client", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("mtg-ok");
  const pm = await taoUser("pm", "mtg-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/meetings/route");
  const res = await POST(
    jreq("/api/meetings", {
      meetingDate: "2026-09-01",
      kind: "weekly",
      title: "Họp tuần",
      projectId: 999999,
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM meetings WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/meetings/:id
// ============================================================================

test("GET /api/meetings/:id: dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("mtgid-isoA");
  const projectB = await taoDuAn("mtgid-isoB");
  const pmB = await taoUser("pm", "mtgid-isoB");
  const pmA = await taoUser("pm", "mtgid-isoA");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/meetings/route");
  const created = await POST(
    jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly", title: "Họp B" }),
  );
  const { id: meetingId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/meetings/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(meetingId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/meetings/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/meetings/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/meetings/:id: kỹ sư KHÁC (không phải người tạo, không phải Admin/PM) → 403",
  S,
  async () => {
    // Bất biến: engineer nằm trong manageMeetings (được TẠO) nhưng SỬA biên bản của
    // người khác thì phải bị chặn — chỉ người tạo hoặc Admin/PM mới sửa được.
    const projectId = await taoDuAn("mtgid-403");
    const engA = await taoUser("engineer", "mtgid-403A");
    const engB = await taoUser("engineer", "mtgid-403B");
    await dangNhapDuAn(engA, projectId);
    const { POST } = await import("@/app/api/meetings/route");
    const created = await POST(
      jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly", title: "Họp A" }),
    );
    const { id: meetingId } = await created.json();

    await dangNhapDuAn(engB, projectId);
    const { PATCH } = await import("@/app/api/meetings/[id]/route");
    const res = await PATCH(
      jreq("/x", { meetingDate: "2026-09-02", kind: "weekly", title: "Sửa trộm" }, "PATCH"),
      { params: Promise.resolve({ id: String(meetingId) }) },
    );
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /người tạo hoặc Admin\/PM/);
  },
);

test("PATCH /api/meetings/:id: chính người tạo (engineer) sửa được", S, async () => {
  const projectId = await taoDuAn("mtgid-owner");
  const eng = await taoUser("engineer", "mtgid-owner");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/meetings/route");
  const created = await POST(
    jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly", title: "Bản gốc" }),
  );
  const { id: meetingId } = await created.json();

  const { PATCH } = await import("@/app/api/meetings/[id]/route");
  const res = await PATCH(
    jreq("/x", { meetingDate: "2026-09-01", kind: "weekly", title: "Bản sửa" }, "PATCH"),
    { params: Promise.resolve({ id: String(meetingId) }) },
  );
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ title: string }>(
    `SELECT title FROM meetings WHERE id = ?`,
    meetingId,
  );
  assert.equal(row?.title, "Bản sửa");
});

test("PATCH /api/meetings/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("mtgid-bad");
  const pm = await taoUser("pm", "mtgid-bad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/meetings/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("DELETE /api/meetings/:id: chỉ Admin/PM được xoá — engineer bị 403", S, async () => {
  const projectId = await taoDuAn("mtgid-del403");
  const eng = await taoUser("engineer", "mtgid-del403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/meetings/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Chỉ Admin\/PM/);
});

test("DELETE /api/meetings/:id: PM xoá thành công", S, async () => {
  const projectId = await taoDuAn("mtgid-delok");
  const pm = await taoUser("pm", "mtgid-delok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/meetings/route");
  const created = await POST(
    jreq("/api/meetings", { meetingDate: "2026-09-01", kind: "weekly", title: "Xoá tôi" }),
  );
  const { id: meetingId } = await created.json();

  const { DELETE } = await import("@/app/api/meetings/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(meetingId) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM meetings WHERE id = ?`, meetingId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/crews
// ============================================================================

test("GET /api/crews: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/crews/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/crews: cách ly dự án — không thấy tổ đội của dự án khác", S, async () => {
  const { run } = await import("@/lib/db");
  const projectA = await taoDuAn("crew-isoA");
  const projectB = await taoDuAn("crew-isoB");
  const pmA = await taoUser("pm", "crew-isoA");
  await run(`INSERT INTO crews (project_id, name) VALUES (?, ?)`, projectB, `Tổ ${uniq("crewB")}`);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/crews/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).crews, []);
});

test("POST /api/crews: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/crews/route");
  const res = await POST(jreq("/api/crews", {}));
  assert.equal(res.status, 401);
});

test("POST /api/crews: engineer không được tạo tổ đội (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("crew-403");
  const eng = await taoUser("engineer", "crew-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/crews/route");
  const res = await POST(jreq("/api/crews", { name: "Tổ x" }));
  assert.equal(res.status, 403);
});

test("POST /api/crews: thiếu tên → 422", S, async () => {
  const projectId = await taoDuAn("crew-val");
  const pm = await taoUser("pm", "crew-val");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/route");
  const res = await POST(jreq("/api/crews", { name: "" }));
  assert.equal(res.status, 422);
});

test("POST /api/crews: trùng tên tổ đội trong cùng dự án → 409", S, async () => {
  const projectId = await taoDuAn("crew-dup");
  const pm = await taoUser("pm", "crew-dup");
  const name = `Tổ ${uniq("crewdup")}`;
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/route");
  const first = await POST(jreq("/api/crews", { name }));
  assert.equal(first.status, 201);
  const second = await POST(jreq("/api/crews", { name }));
  assert.equal(second.status, 409);
});

test("POST /api/crews: hệ thi công không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("crew-sysbad");
  const pm = await taoUser("pm", "crew-sysbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/route");
  const res = await POST(
    jreq("/api/crews", { name: `Tổ ${uniq("crewsysbad")}`, systemId: 999999999 }),
  );
  assert.equal(res.status, 422);
});

// ============================================================================
// PATCH/DELETE /api/crews/:id
// ============================================================================

test("PATCH /api/crews/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/crews/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/crews/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("crewid-403");
  const eng = await taoUser("engineer", "crewid-403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/crews/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/crews/:id: tổ đội thuộc dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("crewid-isoA");
  const projectB = await taoDuAn("crewid-isoB");
  const pmA = await taoUser("pm", "crewid-isoA");
  const crewBId = await insertId(
    `INSERT INTO crews (project_id, name) VALUES (?, ?)`,
    projectB,
    `Tổ ${uniq("crewidiso")}`,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/crews/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: String(crewBId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/crews/:id: đổi tên trùng tổ khác trong dự án → 409", S, async () => {
  const projectId = await taoDuAn("crewid-dup");
  const pm = await taoUser("pm", "crewid-dup");
  const nameA = `Tổ ${uniq("crewidA")}`;
  const nameB = `Tổ ${uniq("crewidB")}`;
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/route");
  const a = await POST(jreq("/api/crews", { name: nameA }));
  const { id: idA } = await a.json();
  await POST(jreq("/api/crews", { name: nameB }));

  const { PATCH } = await import("@/app/api/crews/[id]/route");
  const res = await PATCH(jreq("/x", { name: nameB }, "PATCH"), {
    params: Promise.resolve({ id: String(idA) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/crews/:id: engineer không được xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("crewid-del403");
  const eng = await taoUser("engineer", "crewid-del403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/crews/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/crews/:id: PM xoá thành công", S, async () => {
  const projectId = await taoDuAn("crewid-delok");
  const pm = await taoUser("pm", "crewid-delok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/crews/route");
  const created = await POST(jreq("/api/crews", { name: `Tổ ${uniq("crewiddelok")}` }));
  const { id: crewId } = await created.json();

  const { DELETE } = await import("@/app/api/crews/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(crewId) }),
  });
  assert.equal(res.status, 200);
});

test(
  "DELETE /api/crews/:id: tổ đội đã có dữ liệu chấm công → 409, không mất dấu vết công",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("crewid-delused");
    const pm = await taoUser("pm", "crewid-delused");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/crews/route");
    const created = await POST(jreq("/api/crews", { name: `Tổ ${uniq("crewiddelused")}` }));
    const { id: crewId } = await created.json();
    await run(
      `INSERT INTO attendance (work_date, crew_id, headcount) VALUES (?, ?, ?)`,
      "2026-09-01",
      crewId,
      5,
    );

    const { DELETE } = await import("@/app/api/crews/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(crewId) }),
    });
    assert.equal(res.status, 409);
  },
);

// ============================================================================
// GET/POST /api/vehicles
// ============================================================================

test("GET /api/vehicles: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/vehicles/route");
  const res = await GET(jreq("/api/vehicles", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/vehicles: cách ly dự án — không thấy xe của dự án khác", S, async () => {
  const { run } = await import("@/lib/db");
  const projectA = await taoDuAn("veh-isoA");
  const projectB = await taoDuAn("veh-isoB");
  const pmA = await taoUser("pm", "veh-isoA");
  await run(
    `INSERT INTO vehicle_logs (plate, expected_at, project_id) VALUES (?, NOW(), ?)`,
    `XE-${uniq("vehiso")}`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/vehicles/route");
  const res = await GET(jreq("/api/vehicles", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).vehicles, []);
});

test("POST /api/vehicles: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/vehicles/route");
  const res = await POST(jreq("/api/vehicles", {}));
  assert.equal(res.status, 401);
});

test("POST /api/vehicles: subcon không được tự đăng ký xe → 403", S, async () => {
  // Đăng ký xe chỉ dành Admin/PM/Kỹ sư (canCreate) — subcon chỉ được thao tác cổng
  // (enter/exit) trên xe đã đăng ký sẵn của mình, xem PATCH bên dưới.
  const projectId = await taoDuAn("veh-403");
  const sub = await taoUser("subcon", "veh-403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/vehicles/route");
  const res = await POST(jreq("/api/vehicles", { plate: "51A-12345", expectedAt: "2026-09-05" }));
  assert.equal(res.status, 403);
});

test("POST /api/vehicles: thiếu biển số → 400", S, async () => {
  const projectId = await taoDuAn("veh-noplate");
  const pm = await taoUser("pm", "veh-noplate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/vehicles/route");
  const res = await POST(jreq("/api/vehicles", { expectedAt: "2026-09-05" }));
  assert.equal(res.status, 400);
});

test("POST /api/vehicles: giờ dự kiến không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("veh-badtime");
  const pm = await taoUser("pm", "veh-badtime");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/vehicles/route");
  const res = await POST(
    jreq("/api/vehicles", { plate: "51A-12345", expectedAt: "khong-phai-ngay" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/vehicles: thành công → project_id do SERVER suy (dự án đang chọn)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("veh-ok");
  const pm = await taoUser("pm", "veh-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/vehicles/route");
  const res = await POST(
    jreq("/api/vehicles", { plate: `XE-${uniq("vehok")}`, expectedAt: "2026-09-05T08:00:00Z" }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number; status: string }>(
    `SELECT project_id, status FROM vehicle_logs WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
  assert.equal(row?.status, "registered");
});

// ============================================================================
// PATCH /api/vehicles/:id
// ============================================================================

test("PATCH /api/vehicles/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/vehicles/[id]/route");
  const res = await PATCH(jreq("/x", { action: "enter" }, "PATCH"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/vehicles/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("vehid-bad");
  const pm = await taoUser("pm", "vehid-bad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/vehicles/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/vehicles/:id: xe thuộc dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("vehid-isoA");
  const projectB = await taoDuAn("vehid-isoB");
  const pmA = await taoUser("pm", "vehid-isoA");
  const vehId = await insertId(
    `INSERT INTO vehicle_logs (plate, expected_at, project_id) VALUES (?, NOW(), ?)`,
    `XE-${uniq("vehidiso")}`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/vehicles/[id]/route");
  const res = await PATCH(jreq("/x", { action: "enter" }, "PATCH"), {
    params: Promise.resolve({ id: String(vehId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/vehicles/:id: subcon check-in xe của NCC KHÁC → 403 (canTouchVehicle, 2 thầu phụ khác nhau)",
  S,
  async () => {
    // Bất biến bảo mật quan trọng nhất của cụm xe: NCC A không được động vào xe của NCC B,
    // dù cả hai đều dùng vai trò subcon và cùng chung 1 dự án.
    const projectId = await taoDuAn("vehid-crosssub");
    const supplierA = await taoSupplier("crossA");
    const supplierB = await taoSupplier("crossB");
    const subA = await taoUser("subcon", "vehid-crosssubA", { supplierId: supplierA });
    const pm = await taoUser("pm", "vehid-crosssubPm");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/vehicles/route");
    const created = await POST(
      jreq("/api/vehicles", {
        plate: `XE-${uniq("vehidcross")}`,
        expectedAt: "2026-09-05T08:00:00Z",
        supplierId: supplierB,
      }),
    );
    const { id: vehId } = await created.json();

    await dangNhapDuAn(subA, projectId);
    const { PATCH } = await import("@/app/api/vehicles/[id]/route");
    const res = await PATCH(jreq("/x", { action: "enter" }, "PATCH"), {
      params: Promise.resolve({ id: String(vehId) }),
    });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /không thuộc nhà cung cấp/);
  },
);

test(
  "PATCH /api/vehicles/:id: subcon check-in ĐÚNG xe của NCC mình → 200, ghi entered_at",
  S,
  async () => {
    const projectId = await taoDuAn("vehid-ownok");
    const supplierA = await taoSupplier("ownok");
    const subA = await taoUser("subcon", "vehid-ownokA", { supplierId: supplierA });
    const pm = await taoUser("pm", "vehid-ownokPm");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/vehicles/route");
    const created = await POST(
      jreq("/api/vehicles", {
        plate: `XE-${uniq("vehidownok")}`,
        expectedAt: "2026-09-05T08:00:00Z",
        supplierId: supplierA,
      }),
    );
    const { id: vehId } = await created.json();

    await dangNhapDuAn(subA, projectId);
    const { PATCH } = await import("@/app/api/vehicles/[id]/route");
    const res = await PATCH(jreq("/x", { action: "enter" }, "PATCH"), {
      params: Promise.resolve({ id: String(vehId) }),
    });
    assert.equal(res.status, 200);
    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ status: string; entered_at: string | null }>(
      `SELECT status, entered_at FROM vehicle_logs WHERE id = ?`,
      vehId,
    );
    assert.equal(row?.status, "entered");
    assert.ok(row?.entered_at != null);
  },
);

test(
  "PATCH /api/vehicles/:id: subcon (đúng NCC) không được 'approve'/'cancel' — chỉ enter/exit",
  S,
  async () => {
    const projectId = await taoDuAn("vehid-actlimit");
    const supplierA = await taoSupplier("actlimit");
    const subA = await taoUser("subcon", "vehid-actlimitA", { supplierId: supplierA });
    const pm = await taoUser("pm", "vehid-actlimitPm");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/vehicles/route");
    const created = await POST(
      jreq("/api/vehicles", {
        plate: `XE-${uniq("vehidactlimit")}`,
        expectedAt: "2026-09-05T08:00:00Z",
        supplierId: supplierA,
      }),
    );
    const { id: vehId } = await created.json();

    await dangNhapDuAn(subA, projectId);
    const { PATCH } = await import("@/app/api/vehicles/[id]/route");
    const res = await PATCH(jreq("/x", { action: "approve" }, "PATCH"), {
      params: Promise.resolve({ id: String(vehId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/vehicles/:id: hành động sai thứ tự (exit khi chưa enter) → 409", S, async () => {
  const projectId = await taoDuAn("vehid-order");
  const pm = await taoUser("pm", "vehid-order");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/vehicles/route");
  const created = await POST(
    jreq("/api/vehicles", {
      plate: `XE-${uniq("vehidorder")}`,
      expectedAt: "2026-09-05T08:00:00Z",
    }),
  );
  const { id: vehId } = await created.json();

  const { PATCH } = await import("@/app/api/vehicles/[id]/route");
  const res = await PATCH(jreq("/x", { action: "exit" }, "PATCH"), {
    params: Promise.resolve({ id: String(vehId) }),
  });
  assert.equal(res.status, 409);
});

test(
  "PATCH /api/vehicles/:id: hành động lặp lại (đã ở đích) → idempotent, vẫn 200",
  S,
  async () => {
    const projectId = await taoDuAn("vehid-idem");
    const pm = await taoUser("pm", "vehid-idem");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/vehicles/route");
    const created = await POST(
      jreq("/api/vehicles", {
        plate: `XE-${uniq("vehididem")}`,
        expectedAt: "2026-09-05T08:00:00Z",
      }),
    );
    const { id: vehId } = await created.json();

    const { PATCH } = await import("@/app/api/vehicles/[id]/route");
    const first = await PATCH(jreq("/x", { action: "enter" }, "PATCH"), {
      params: Promise.resolve({ id: String(vehId) }),
    });
    assert.equal(first.status, 200);
    const second = await PATCH(jreq("/x", { action: "enter" }, "PATCH"), {
      params: Promise.resolve({ id: String(vehId) }),
    });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).status, "entered");
  },
);

test(
  "PATCH /api/vehicles/:id: subcon không được sửa thông tin xe (chỉ Admin/PM/KS) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("vehid-editperm");
    const supplierA = await taoSupplier("editperm");
    const subA = await taoUser("subcon", "vehid-editpermA", { supplierId: supplierA });
    const pm = await taoUser("pm", "vehid-editpermPm");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/vehicles/route");
    const created = await POST(
      jreq("/api/vehicles", {
        plate: `XE-${uniq("vehideditperm")}`,
        expectedAt: "2026-09-05T08:00:00Z",
        supplierId: supplierA,
      }),
    );
    const { id: vehId } = await created.json();

    await dangNhapDuAn(subA, projectId);
    const { PATCH } = await import("@/app/api/vehicles/[id]/route");
    const res = await PATCH(jreq("/x", { plate: "51A-99999" }, "PATCH"), {
      params: Promise.resolve({ id: String(vehId) }),
    });
    assert.equal(res.status, 403);
  },
);

// ============================================================================
// GET/POST /api/saved-reports
// ============================================================================

test("GET /api/saved-reports: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/saved-reports/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test(
  "GET /api/saved-reports: chỉ thấy báo cáo của mình hoặc shared, KHÔNG thấy báo cáo riêng của người khác",
  S,
  async () => {
    const projectId = await taoDuAn("sr-visib");
    const pmA = await taoUser("pm", "sr-visibA");
    const pmB = await taoUser("pm", "sr-visibB");
    await dangNhapDuAn(pmB, projectId);
    const { POST } = await import("@/app/api/saved-reports/route");
    const privateB = await POST(
      jreq("/api/saved-reports", { name: `Riêng B ${uniq("sr")}`, source: "late_tasks" }),
    );
    assert.equal(privateB.status, 201);
    const sharedB = await POST(
      jreq("/api/saved-reports", {
        name: `Chia sẻ B ${uniq("sr")}`,
        source: "late_tasks",
        shared: true,
      }),
    );
    assert.equal(sharedB.status, 201);

    await dangNhapDuAn(pmA, projectId);
    const { GET } = await import("@/app/api/saved-reports/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const { reports } = await res.json();
    const names = reports.map((r: { name: string }) => r.name);
    assert.ok(!names.includes((await privateB.json()).name), "không thấy báo cáo riêng của B");
  },
);

test("POST /api/saved-reports: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/saved-reports/route");
  const res = await POST(jreq("/api/saved-reports", {}));
  assert.equal(res.status, 401);
});

test("POST /api/saved-reports: nguồn không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("sr-badsrc");
  const pm = await taoUser("pm", "sr-badsrc");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const res = await POST(jreq("/api/saved-reports", { name: "x", source: "khong_ton_tai" }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/saved-reports: engineer không có quyền xem tài chính không được lưu nguồn 'cost_by_month' → 403",
  S,
  async () => {
    // Bất biến: PAYMENT_VIEW_ROLES kiểm ở tầng lưu báo cáo, không chỉ lúc chạy — nếu
    // không, engineer có thể lưu cấu hình rồi nhờ người khác chạy hộ để lách quyền xem tiền.
    const projectId = await taoDuAn("sr-403");
    const eng = await taoUser("engineer", "sr-403");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/saved-reports/route");
    const res = await POST(
      jreq("/api/saved-reports", { name: "Chi phí", source: "cost_by_month" }),
    );
    assert.equal(res.status, 403);
  },
);

test("POST /api/saved-reports: filter key không thuộc whitelist của nguồn → 422", S, async () => {
  const projectId = await taoDuAn("sr-badfilter");
  const pm = await taoUser("pm", "sr-badfilter");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const res = await POST(
    jreq("/api/saved-reports", {
      name: "x",
      source: "late_tasks",
      config: { filters: { khong_ton_tai: "x" } },
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/saved-reports: thành công → project_id gán theo dự án đang chọn", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("sr-ok");
  const pm = await taoUser("pm", "sr-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const res = await POST(
    jreq("/api/saved-reports", {
      name: `Báo cáo ${uniq("srok")}`,
      source: "late_tasks",
      config: { filters: { system: "OGTĐ" } },
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number; owner_id: number }>(
    `SELECT project_id, owner_id FROM saved_reports WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
  assert.equal(row?.owner_id, pm.id);
});

// ============================================================================
// PATCH/DELETE /api/saved-reports/:id
// ============================================================================

test("PATCH /api/saved-reports/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/saved-reports/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/saved-reports/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("srid-404");
  const pm = await taoUser("pm", "srid-404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/saved-reports/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/saved-reports/:id: không phải chủ sở hữu, không phải admin → 403", S, async () => {
  const projectId = await taoDuAn("srid-403");
  const pmA = await taoUser("pm", "srid-403A");
  const pmB = await taoUser("pm", "srid-403B");
  await dangNhapDuAn(pmA, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const created = await POST(
    jreq("/api/saved-reports", { name: `Của A ${uniq("srid")}`, source: "late_tasks" }),
  );
  const { id: reportId } = await created.json();

  await dangNhapDuAn(pmB, projectId);
  const { PATCH } = await import("@/app/api/saved-reports/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Sửa trộm" }, "PATCH"), {
    params: Promise.resolve({ id: String(reportId) }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /chủ sở hữu hoặc admin/);
});

test("PATCH /api/saved-reports/:id: chủ sở hữu sửa tên thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("srid-ok");
  const pm = await taoUser("pm", "srid-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const created = await POST(
    jreq("/api/saved-reports", { name: `Cũ ${uniq("sridok")}`, source: "late_tasks" }),
  );
  const { id: reportId } = await created.json();

  const { PATCH } = await import("@/app/api/saved-reports/[id]/route");
  const newName = `Mới ${uniq("sridok")}`;
  const res = await PATCH(jreq("/x", { name: newName }, "PATCH"), {
    params: Promise.resolve({ id: String(reportId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ name: string }>(
    `SELECT name FROM saved_reports WHERE id = ?`,
    reportId,
  );
  assert.equal(row?.name, newName);
});

test("PATCH /api/saved-reports/:id: admin sửa được báo cáo của người khác", S, async () => {
  const projectId = await taoDuAn("srid-admin");
  const pm = await taoUser("pm", "srid-admin");
  const admin = await taoUser("admin", "srid-adminA");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const created = await POST(
    jreq("/api/saved-reports", { name: `PM ${uniq("sridadmin")}`, source: "late_tasks" }),
  );
  const { id: reportId } = await created.json();

  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/saved-reports/[id]/route");
  const res = await PATCH(jreq("/x", { shared: true }, "PATCH"), {
    params: Promise.resolve({ id: String(reportId) }),
  });
  assert.equal(res.status, 200);
});

test("DELETE /api/saved-reports/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/saved-reports/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/saved-reports/:id: không phải chủ sở hữu → 403", S, async () => {
  const projectId = await taoDuAn("srid-del403");
  const pmA = await taoUser("pm", "srid-del403A");
  const pmB = await taoUser("pm", "srid-del403B");
  await dangNhapDuAn(pmA, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const created = await POST(
    jreq("/api/saved-reports", { name: `Của A ${uniq("sriddel")}`, source: "late_tasks" }),
  );
  const { id: reportId } = await created.json();

  await dangNhapDuAn(pmB, projectId);
  const { DELETE } = await import("@/app/api/saved-reports/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(reportId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/saved-reports/:id: chủ sở hữu xoá thành công", S, async () => {
  const projectId = await taoDuAn("srid-delok");
  const pm = await taoUser("pm", "srid-delok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/saved-reports/route");
  const created = await POST(
    jreq("/api/saved-reports", { name: `Xoá tôi ${uniq("sriddelok")}`, source: "late_tasks" }),
  );
  const { id: reportId } = await created.json();

  const { DELETE } = await import("@/app/api/saved-reports/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(reportId) }),
  });
  assert.equal(res.status, 200);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne(`SELECT id FROM saved_reports WHERE id = ?`, reportId);
  assert.equal(row, undefined);
});
