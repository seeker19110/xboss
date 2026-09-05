import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TÀI CHÍNH 3b: hợp đồng · khiếu nại/EOT ·
// VO · đấu thầu · bảo lãnh · NCC (Đợt 4 chiến dịch coverage — Việc V2). Route:
//   - app/api/contracts/[id]/addenda/route.ts               (POST thêm phụ lục HĐ)
//   - app/api/contracts/[id]/addenda/[aid]/route.ts         (DELETE 1 phụ lục HĐ)
//   - app/api/contracts/[id]/documents/route.ts             (GET/POST file đính kèm HĐ)
//   - app/api/contract-documents/[id]/route.ts              (GET/DELETE 1 file HĐ)
//   - app/api/contracts/[id]/restore/route.ts               (POST khôi phục HĐ đã xoá)
//   - app/api/claims/[id]/reject/route.ts                   (POST từ chối claim)
//   - app/api/claims/[id]/restore/route.ts                  (POST khôi phục claim đã xoá)
//   - app/api/claims/[id]/settle/route.ts                   (POST chốt claim)
//   - app/api/claims/[id]/documents/route.ts                (GET/POST hồ sơ claim)
//   - app/api/claim-documents/[id]/route.ts                 (GET/DELETE 1 hồ sơ claim)
//   - app/api/claims/eot-suggestion/route.ts                (GET gợi ý số ngày EOT)
//   - app/api/variations/[id]/submit/route.ts               (POST trình VO)
//   - app/api/variations/[id]/contract-add/route.ts         (POST VO → phụ lục HĐ)
//   - app/api/variations/[id]/documents/route.ts            (GET/POST file đính kèm VO)
//   - app/api/vo-documents/[id]/route.ts                    (GET/DELETE 1 file VO)
//   - app/api/tenders/[id]/bids/route.ts                    (POST báo giá)
//   - app/api/tenders/[id]/bids/[bidId]/route.ts            (PATCH/DELETE 1 báo giá)
//   - app/api/tenders/[id]/bids/[bidId]/file/route.ts       (GET/POST file chào thầu gốc)
//   - app/api/tenders/[id]/award/route.ts                   (POST trao thầu)
//   - app/api/insurance-bonds/[id]/file/route.ts            (GET chứng thư bảo hiểm/bảo lãnh)
//   - app/api/insurance-bonds/[id]/restore/route.ts         (POST khôi phục đã xoá)
//   - app/api/suppliers/[id]/ratings/route.ts               (POST đánh giá NCC)
//   - app/api/suppliers/[id]/summary/route.ts               (GET tổng hợp NCC)

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TC3B route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tc3b-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tc3b-route', ?, ?)`,
    `TC3B ${ten}`,
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

async function taoHopDong(
  projectId: number,
  ten: string,
  overrides: { value?: number; kind?: string; partySupplierId?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contracts (code, kind, title, party_name, party_supplier_id, value, status, project_id)
     VALUES (?, ?, ?, 'CĐT test', ?, ?, 'active', ?)`,
    `HD-${uniq(ten)}`,
    overrides.kind ?? "nhan_thau",
    `Hợp đồng ${ten}`,
    overrides.partySupplierId ?? null,
    overrides.value ?? 0,
    projectId,
  );
}

async function taoNCC(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, `NCC ${uniq(ten)}`, orgId);
}

async function taoOrg(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const slug = `org-${uniq(ten)}`;
  return insertId(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, `Org ${slug}`, slug);
}

// projectId: BẮT BUỘC (Đợt 6, Việc G — POST /api/tenders giờ lọc boq_items.project_id, vá lỗ
// hổng "kiểm tồn tại không lọc dự án"). Dòng BOQ project_id NULL không khớp bất kỳ dự án nào.
async function taoBoqItem(ten: string, projectId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, ?, 'm', 100, 1000, ?)`,
    `BOQ-${uniq(ten)}`,
    `Dòng BOQ ${ten}`,
    projectId,
  );
}

async function taoVatTu(ten: string, projectId: number | null): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO materials (name, unit, boq_code, project_id) VALUES (?, 'cái', ?, ?)`,
    `Vật tư ${uniq(ten)}`,
    `VT-${uniq(ten)}`,
    projectId,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

/** Nội dung PDF tối thiểu nhưng đủ để `sniffMime` nhận diện đúng (magic byte "%PDF-"). */
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");

function formReq(url: string, form: FormData, method = "POST") {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

// ============================================================================
// POST /api/contracts/:id/addenda
// ============================================================================

test("POST /api/contracts/:id/addenda: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/contracts/:id/addenda: engineer không được thêm (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("addn403");
  const eng = await taoUser("engineer", "addn403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/contracts/:id/addenda: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("addnbad");
  const pm = await taoUser("pm", "addnbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/contracts/:id/addenda: hợp đồng thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("addnisoA");
  const projectB = await taoDuAn("addnisoB");
  const pmA = await taoUser("pm", "addnisoA");
  const contractB = await taoHopDong(projectB, "addnisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", { code: "PL01" }), {
    params: Promise.resolve({ id: String(contractB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/contracts/:id/addenda: thiếu số phụ lục → 422", S, async () => {
  const projectId = await taoDuAn("addnval");
  const pm = await taoUser("pm", "addnval");
  const contractId = await taoHopDong(projectId, "addnval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: String(contractId) }) });
  assert.equal(res.status, 422);
});

test("POST /api/contracts/:id/addenda: valueDelta không phải số → 422", S, async () => {
  const projectId = await taoDuAn("addnnum");
  const pm = await taoUser("pm", "addnnum");
  const contractId = await taoHopDong(projectId, "addnnum");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", { code: "PL01", valueDelta: "abc" }), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(res.status, 422);
});

test(
  "POST /api/contracts/:id/addenda: ngày ký sai định dạng (không phải YYYY-MM-DD) → 422",
  S,
  async () => {
    const projectId = await taoDuAn("addndate1");
    const pm = await taoUser("pm", "addndate1");
    const contractId = await taoHopDong(projectId, "addndate1");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
    const res = await POST(jreq("/x", { code: "PL01", signedDate: "31/12/2026" }), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/contracts/:id/addenda: ngày ký đúng hình dạng nhưng KHÔNG PHẢI ngày thật " +
    "(2026-13-40) → 422, không rơi thẳng vào Postgres 500 (BUG THẬT đã vá cùng đợt này — " +
    "route trước đây chỉ kiểm bằng regex hình dạng /^\\d{4}-\\d{2}-\\d{2}$/, không phải " +
    "isValidDateISO như route anh em app/api/insurance-bonds/route.ts đã làm đúng)",
  S,
  async () => {
    const projectId = await taoDuAn("addndate2");
    const pm = await taoUser("pm", "addndate2");
    const contractId = await taoHopDong(projectId, "addndate2");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
    const res = await POST(jreq("/x", { code: "PL01", signedDate: "2026-13-40" }), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /YYYY-MM-DD/);
  },
);

test("POST /api/contracts/:id/addenda: tạo thành công (giá trị âm được phép)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("addnok");
  const pm = await taoUser("pm", "addnok");
  const contractId = await taoHopDong(projectId, "addnok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(
    jreq("/x", { code: "PL01", title: "Giảm khối lượng", valueDelta: -50000, signedDate: "2026-05-01" }),
    { params: Promise.resolve({ id: String(contractId) }) },
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ value_delta: number; contract_id: number }>(
    `SELECT value_delta, contract_id FROM contract_addenda WHERE id = ?`,
    id,
  );
  assert.equal(Number(row?.value_delta), -50000);
  assert.equal(row?.contract_id, contractId);
});

test("POST /api/contracts/:id/addenda: trùng số phụ lục trong cùng HĐ → 409", S, async () => {
  const projectId = await taoDuAn("addndup");
  const pm = await taoUser("pm", "addndup");
  const contractId = await taoHopDong(projectId, "addndup");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const first = await POST(jreq("/x", { code: "PL-DUP" }), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(first.status, 201);
  const second = await POST(jreq("/x", { code: "PL-DUP" }), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(second.status, 409);
});

// ============================================================================
// DELETE /api/contracts/:id/addenda/:aid
// ============================================================================

async function taoPhuLuc(
  pm: { id: number; passwordHash: string },
  projectId: number,
  contractId: number,
  ten: string,
): Promise<number> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/addenda/route");
  const res = await POST(jreq("/x", { code: `PL-${uniq(ten)}` }), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  const { id } = await res.json();
  return id as number;
}

test("DELETE /api/contracts/:id/addenda/:aid: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/contracts/[id]/addenda/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1", aid: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/contracts/:id/addenda/:aid: engineer không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("addd403");
  const eng = await taoUser("engineer", "addd403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/contracts/[id]/addenda/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1", aid: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/contracts/:id/addenda/:aid: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("adddbad");
  const pm = await taoUser("pm", "adddbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/contracts/[id]/addenda/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1", aid: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/contracts/:id/addenda/:aid: phụ lục thuộc HĐ dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("adddisoA");
  const projectB = await taoDuAn("adddisoB");
  const pmA = await taoUser("pm", "adddisoA");
  const pmB = await taoUser("pm", "adddisoB");
  const contractB = await taoHopDong(projectB, "adddisoB");
  const addendaB = await taoPhuLuc(pmB, projectB, contractB, "adddisoB");
  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/contracts/[id]/addenda/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(contractB), aid: String(addendaB) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/contracts/:id/addenda/:aid: xoá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("adddok");
  const pm = await taoUser("pm", "adddok");
  const contractId = await taoHopDong(projectId, "adddok");
  const addendaId = await taoPhuLuc(pm, projectId, contractId, "adddok");
  const { DELETE } = await import("@/app/api/contracts/[id]/addenda/[aid]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(contractId), aid: String(addendaId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM contract_addenda WHERE id = ?`, addendaId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/contracts/:id/documents
// ============================================================================

test("GET /api/contracts/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/contracts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "GET /api/contracts/:id/documents: subcon không có quyền xem HĐ (viewPayments) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("cdg403");
    const sub = await taoUser("subcon", "cdg403");
    await dangNhapDuAn(sub, projectId);
    const { GET } = await import("@/app/api/contracts/[id]/documents/route");
    const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
    assert.equal(res.status, 403);
  },
);

test("GET /api/contracts/:id/documents: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cdgbad");
  const pm = await taoUser("pm", "cdgbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contracts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/contracts/:id/documents: hợp đồng thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("cdgisoA");
  const projectB = await taoDuAn("cdgisoB");
  const pmA = await taoUser("pm", "cdgisoA");
  const contractB = await taoHopDong(projectB, "cdgisoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/contracts/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(contractB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/contracts/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/contracts/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/contracts/:id/documents: engineer không được upload (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("cdp403");
  const eng = await taoUser("engineer", "cdp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/contracts/:id/documents: hợp đồng thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("cdpisoA");
  const projectB = await taoDuAn("cdpisoB");
  const pmA = await taoUser("pm", "cdpisoA");
  const contractB = await taoHopDong(projectB, "cdpisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/contracts/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(contractB) }) });
  assert.equal(res.status, 404);
});

test("POST /api/contracts/:id/documents: thiếu file → 400", S, async () => {
  const projectId = await taoDuAn("cdpnofile");
  const pm = await taoUser("pm", "cdpnofile");
  const contractId = await taoHopDong(projectId, "cdpnofile");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "POST /api/contracts/:id/documents: upload thành công → GET liệt kê đúng",
  S,
  async () => {
    const projectId = await taoDuAn("cdpok");
    const pm = await taoUser("pm", "cdpok");
    const contractId = await taoHopDong(projectId, "cdpok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/contracts/[id]/documents/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "hd.pdf", { type: "application/pdf" }));
    form.set("caption", "Bản gốc HĐ");
    const res = await POST(formReq("/x", form), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.caption, "Bản gốc HĐ");

    const { GET } = await import("@/app/api/contracts/[id]/documents/route");
    const list = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    const { documents } = await list.json();
    assert.equal(documents.length, 1);
    assert.equal(documents[0].id, body.id);
  },
);

// ============================================================================
// GET/DELETE /api/contract-documents/:id
// ============================================================================

async function uploadHopDongDoc(
  pm: { id: number; passwordHash: string },
  projectId: number,
  contractId: number,
): Promise<number> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "hd.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  const { id } = await res.json();
  return id as number;
}

test("GET /api/contract-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/contract-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/contract-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cddgbad");
  const pm = await taoUser("pm", "cddgbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contract-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/contract-documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("cddgnf");
  const pm = await taoUser("pm", "cddgnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contract-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/contract-documents/:id: thuộc dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("cddgisoA");
  const projectB = await taoDuAn("cddgisoB");
  const pmA = await taoUser("pm", "cddgisoA");
  const pmB = await taoUser("pm", "cddgisoB");
  const contractB = await taoHopDong(projectB, "cddgisoB");
  const docB = await uploadHopDongDoc(pmB, projectB, contractB);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/contract-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docB) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/contract-documents/:id: tải đúng byte đã upload", S, async () => {
  const projectId = await taoDuAn("cddgok");
  const pm = await taoUser("pm", "cddgok");
  const contractId = await taoHopDong(projectId, "cddgok");
  const docId = await uploadHopDongDoc(pm, projectId, contractId);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contract-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test(
  "GET /api/contract-documents/:id: file trên đĩa không khớp hash lưu (bị tráo/hỏng) → 409",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const { storagePut } = await import("@/lib/nen/storage");
    const projectId = await taoDuAn("cddghash");
    const pm = await taoUser("pm", "cddghash");
    const contractId = await taoHopDong(projectId, "cddghash");
    const fileName = `contract-hash-mismatch-${uniq("cddghash")}.pdf`;
    await storagePut(1, fileName, Buffer.from("%PDF-1.4\nNoi dung that\n%%EOF"));
    const docId = await insertId(
      `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, uploaded_by, sha256)
       VALUES (?, ?, 'a.pdf', 'application/pdf', ?, ?)`,
      contractId,
      fileName,
      pm.id,
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/contract-documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 409);
  },
);

test("GET /api/contract-documents/:id: file không còn trên đĩa → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("cddgmiss");
  const pm = await taoUser("pm", "cddgmiss");
  const contractId = await taoHopDong(projectId, "cddgmiss");
  const docId = await insertId(
    `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, uploaded_by)
     VALUES (?, ?, 'a.pdf', 'application/pdf', ?)`,
    contractId,
    "khong-ton-tai-tren-dia.pdf",
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contract-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/contract-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/contract-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("DELETE /api/contract-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cdddbad");
  const pm = await taoUser("pm", "cdddbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/contract-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("DELETE /api/contract-documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("cdddnf");
  const pm = await taoUser("pm", "cdddnf");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/contract-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/contract-documents/:id: không phải người upload, không phải Admin/PM → 403",
  S,
  async () => {
    const projectId = await taoDuAn("cddd403");
    const pm = await taoUser("pm", "cddd403");
    const eng = await taoUser("engineer", "cddd403");
    const contractId = await taoHopDong(projectId, "cddd403");
    const docId = await uploadHopDongDoc(pm, projectId, contractId);
    await dangNhapDuAn(eng, projectId);
    const { DELETE } = await import("@/app/api/contract-documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/contract-documents/:id: Admin/PM xoá được dù không phải người upload", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cdddok");
  const pm = await taoUser("pm", "cdddok");
  const pm2 = await taoUser("pm", "cdddok2");
  const contractId = await taoHopDong(projectId, "cdddok");
  const docId = await uploadHopDongDoc(pm, projectId, contractId);
  await dangNhapDuAn(pm2, projectId);
  const { DELETE } = await import("@/app/api/contract-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM contract_documents WHERE id = ?`, docId);
  assert.equal(row, undefined);
});

// ============================================================================
// POST /api/contracts/:id/restore
// ============================================================================

test("POST /api/contracts/:id/restore: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/contracts/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/contracts/:id/restore: PM không được khôi phục (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("crest403");
  const pm = await taoUser("pm", "crest403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/contracts/:id/restore: hợp đồng chưa xoá → 404", S, async () => {
  const projectId = await taoDuAn("crestnotdel");
  const admin = await taoUser("admin", "crestnotdel");
  const contractId = await taoHopDong(projectId, "crestnotdel");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/contracts/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(contractId) }) });
  assert.equal(res.status, 404);
});

test("POST /api/contracts/:id/restore: hợp đồng đã xoá thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("crestisoA");
  const projectB = await taoDuAn("crestisoB");
  const adminA = await taoUser("admin", "crestisoA");
  const adminB = await taoUser("admin", "crestisoB");
  const contractB = await taoHopDong(projectB, "crestisoB");
  await dangNhapDuAn(adminB, projectB);
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(contractB) }) });

  await dangNhapDuAn(adminA, projectA);
  const { POST } = await import("@/app/api/contracts/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(contractB) }) });
  assert.equal(res.status, 404);
});

test("POST /api/contracts/:id/restore: khôi phục thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("crestok");
  const admin = await taoUser("admin", "crestok");
  const contractId = await taoHopDong(projectId, "crestok");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  const del = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(del.status, 200);

  const { POST } = await import("@/app/api/contracts/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(contractId) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM contracts WHERE id = ?`,
    contractId,
  );
  assert.equal(row?.deleted_at, null);
});

// ============================================================================
// Helpers: claim
// ============================================================================

async function taoClaim(
  nguoiTao: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
  overrides: { kind?: "cost" | "eot"; amountRequested?: number; daysRequested?: number } = {},
): Promise<number> {
  await dangNhapDuAn(nguoiTao, projectId);
  const { POST } = await import("@/app/api/claims/route");
  const kind = overrides.kind ?? "cost";
  const res = await POST(
    jreq("/api/claims", {
      kind,
      title: `Claim ${ten}`,
      noticeDate: "2026-01-15",
      cause: "Điều kiện công trường",
      amountRequested: kind === "cost" ? (overrides.amountRequested ?? 1000) : undefined,
      daysRequested: kind === "eot" ? (overrides.daysRequested ?? 5) : undefined,
    }),
  );
  const json = await res.json();
  assert.equal(res.status, 201, `taoClaim thất bại: ${JSON.stringify(json)}`);
  return json.id as number;
}

// ============================================================================
// POST /api/claims/:id/reject
// ============================================================================

test("POST /api/claims/:id/reject: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/claims/:id/reject: engineer không được từ chối (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("crj403");
  const eng = await taoUser("engineer", "crj403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/claims/:id/reject: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("crjbad");
  const pm = await taoUser("pm", "crjbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/claims/:id/reject: claim thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("crjisoA");
  const projectB = await taoDuAn("crjisoB");
  const pmA = await taoUser("pm", "crjisoA");
  const pmB = await taoUser("pm", "crjisoB");
  const claimB = await taoClaim(pmB, projectB, "crjisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const res = await POST(jreq("/x", { settlementNote: "Không đủ căn cứ" }), {
    params: Promise.resolve({ id: String(claimB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/claims/:id/reject: thiếu lý do → 422", S, async () => {
  const projectId = await taoDuAn("crjnote");
  const pm = await taoUser("pm", "crjnote");
  const claimId = await taoClaim(pm, projectId, "crjnote");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const res = await POST(jreq("/x", { settlementNote: "  " }), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/claims/:id/reject: từ chối thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("crjok");
  const pm = await taoUser("pm", "crjok");
  const claimId = await taoClaim(pm, projectId, "crjok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const res = await POST(jreq("/x", { settlementNote: "Không đủ căn cứ" }), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM claims WHERE id = ?`, claimId);
  assert.equal(row?.status, "rejected");
});

test("POST /api/claims/:id/reject: claim đã có quyết định trước đó → 409", S, async () => {
  const projectId = await taoDuAn("crjtwice");
  const pm = await taoUser("pm", "crjtwice");
  const claimId = await taoClaim(pm, projectId, "crjtwice");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/reject/route");
  const first = await POST(jreq("/x", { settlementNote: "Lần 1" }), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(first.status, 200);
  const second = await POST(jreq("/x", { settlementNote: "Lần 2" }), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(second.status, 409);
});

// ============================================================================
// POST /api/claims/:id/settle
// ============================================================================

test("POST /api/claims/:id/settle: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/claims/:id/settle: engineer không được chốt (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("cst403");
  const eng = await taoUser("engineer", "cst403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/claims/:id/settle: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cstbad");
  const pm = await taoUser("pm", "cstbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/claims/:id/settle: claim thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("cstisoA");
  const projectB = await taoDuAn("cstisoB");
  const pmA = await taoUser("pm", "cstisoA");
  const pmB = await taoUser("pm", "cstisoB");
  const claimB = await taoClaim(pmB, projectB, "cstisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  const res = await POST(jreq("/x", { amountSettled: 500 }), {
    params: Promise.resolve({ id: String(claimB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/claims/:id/settle: chốt thành công, ghi amountSettled/daysSettled", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cstok");
  const pm = await taoUser("pm", "cstok");
  const claimId = await taoClaim(pm, projectId, "cstok", { kind: "cost", amountRequested: 1000 });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  const res = await POST(
    jreq("/x", { amountSettled: 800, settlementNote: "Thống nhất 80%" }),
    { params: Promise.resolve({ id: String(claimId) }) },
  );
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string; amount_settled: number }>(
    `SELECT status, amount_settled FROM claims WHERE id = ?`,
    claimId,
  );
  assert.equal(row?.status, "settled");
  assert.equal(Number(row?.amount_settled), 800);
});

test("POST /api/claims/:id/settle: chốt 2 lần không ghi đè (idempotency ranh giới)", S, async () => {
  const projectId = await taoDuAn("csttwice");
  const pm = await taoUser("pm", "csttwice");
  const claimId = await taoClaim(pm, projectId, "csttwice");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  const first = await POST(jreq("/x", { amountSettled: 500 }), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(first.status, 200);
  const second = await POST(jreq("/x", { amountSettled: 999 }), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(second.status, 409);

  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ amount_settled: number }>(
    `SELECT amount_settled FROM claims WHERE id = ?`,
    claimId,
  );
  assert.equal(Number(row?.amount_settled), 500, "quyết định lần 2 không được đè lên lần 1");
});

// ============================================================================
// GET/POST /api/claims/:id/documents
// ============================================================================

test("GET /api/claims/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/claims/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/claims/:id/documents: subcon không có quyền xem claim → 403", S, async () => {
  const projectId = await taoDuAn("cldg403");
  const sub = await taoUser("subcon", "cldg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/claims/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/claims/:id/documents: claim thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("cldgisoA");
  const projectB = await taoDuAn("cldgisoB");
  const pmA = await taoUser("pm", "cldgisoA");
  const pmB = await taoUser("pm", "cldgisoB");
  const claimB = await taoClaim(pmB, projectB, "cldgisoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/claims/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(claimB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/claims/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/claims/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/claims/:id/documents: bch có viewClaims nhưng KHÔNG manageClaims → 403", S, async () => {
  const projectId = await taoDuAn("clp403");
  const bch = await taoUser("bch", "clp403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/claims/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test(
  "POST /api/claims/:id/documents: upload thành công → GET liệt kê đúng",
  S,
  async () => {
    const projectId = await taoDuAn("clpok");
    const pm = await taoUser("pm", "clpok");
    const claimId = await taoClaim(pm, projectId, "clpok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/claims/[id]/documents/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "hoso.pdf", { type: "application/pdf" }));
    form.set("title", "Biên bản định lượng");
    const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(claimId) }) });
    assert.equal(res.status, 201);
    const { id } = await res.json();

    const { GET } = await import("@/app/api/claims/[id]/documents/route");
    const list = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(claimId) }),
    });
    const { documents } = await list.json();
    assert.equal(documents.length, 1);
    assert.equal(documents[0].id, id);
  },
);

// ============================================================================
// GET/DELETE /api/claim-documents/:id
// ============================================================================

async function uploadClaimDoc(
  nguoiUpload: { id: number; passwordHash: string },
  projectId: number,
  claimId: number,
): Promise<number> {
  await dangNhapDuAn(nguoiUpload, projectId);
  const { POST } = await import("@/app/api/claims/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "hoso.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(claimId) }) });
  const { id } = await res.json();
  return id as number;
}

test("GET /api/claim-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/claim-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/claim-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cldocbad");
  const pm = await taoUser("pm", "cldocbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/claim-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/claim-documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("cldocgnf");
  const pm = await taoUser("pm", "cldocgnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/claim-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test("GET /api/claim-documents/:id: thuộc dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("cldocisoA");
  const projectB = await taoDuAn("cldocisoB");
  const pmA = await taoUser("pm", "cldocisoA");
  const pmB = await taoUser("pm", "cldocisoB");
  const claimB = await taoClaim(pmB, projectB, "cldocisoB");
  const docB = await uploadClaimDoc(pmB, projectB, claimB);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/claim-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(docB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/claim-documents/:id: tải đúng byte đã upload", S, async () => {
  const projectId = await taoDuAn("cldocok");
  const pm = await taoUser("pm", "cldocok");
  const claimId = await taoClaim(pm, projectId, "cldocok");
  const docId = await uploadClaimDoc(pm, projectId, claimId);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/claim-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test(
  "GET /api/claim-documents/:id: file trên đĩa không khớp hash lưu (bị tráo/hỏng) → 409",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const { storagePut } = await import("@/lib/nen/storage");
    const projectId = await taoDuAn("cldochash");
    const pm = await taoUser("pm", "cldochash");
    const claimId = await taoClaim(pm, projectId, "cldochash");
    const fileName = `claim-hash-mismatch-${uniq("cldochash")}.pdf`;
    await storagePut(1, fileName, Buffer.from("%PDF-1.4\nNoi dung that\n%%EOF"));
    const docId = await insertId(
      `INSERT INTO claim_documents (claim_id, file_name, original_name, mime_type, uploaded_by, sha256)
       VALUES (?, ?, 'a.pdf', 'application/pdf', ?, ?)`,
      claimId,
      fileName,
      pm.id,
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/claim-documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 409);
  },
);

test("GET /api/claim-documents/:id: file không còn trên đĩa → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("cldocmiss");
  const pm = await taoUser("pm", "cldocmiss");
  const claimId = await taoClaim(pm, projectId, "cldocmiss");
  const docId = await insertId(
    `INSERT INTO claim_documents (claim_id, file_name, original_name, mime_type, uploaded_by)
     VALUES (?, ?, 'a.pdf', 'application/pdf', ?)`,
    claimId,
    "khong-ton-tai-tren-dia.pdf",
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/claim-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/claim-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/claim-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("DELETE /api/claim-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("cldocdbad");
  const pm = await taoUser("pm", "cldocdbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/claim-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("DELETE /api/claim-documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("cldocdnf");
  const pm = await taoUser("pm", "cldocdnf");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/claim-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/claim-documents/:id: không phải người upload, không phải Admin/PM → 403",
  S,
  async () => {
    const projectId = await taoDuAn("cldocd403");
    const pm = await taoUser("pm", "cldocd403");
    const eng = await taoUser("engineer", "cldocd403");
    const eng2 = await taoUser("engineer", "cldocd403b");
    const claimId = await taoClaim(pm, projectId, "cldocd403");
    const docId = await uploadClaimDoc(eng, projectId, claimId);
    await dangNhapDuAn(eng2, projectId);
    const { DELETE } = await import("@/app/api/claim-documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/claim-documents/:id: chính người upload xoá được", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cldocdok");
  const eng = await taoUser("engineer", "cldocdok");
  const claimId = await taoClaim(eng, projectId, "cldocdok");
  const docId = await uploadClaimDoc(eng, projectId, claimId);
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/claim-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM claim_documents WHERE id = ?`, docId);
  assert.equal(row, undefined);
});

// ============================================================================
// POST /api/claims/:id/restore
// ============================================================================

test("POST /api/claims/:id/restore: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/claims/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/claims/:id/restore: PM không được khôi phục (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("clrest403");
  const pm = await taoUser("pm", "clrest403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/claims/:id/restore: claim chưa xoá → 404", S, async () => {
  const projectId = await taoDuAn("clrestnotdel");
  const admin = await taoUser("admin", "clrestnotdel");
  const claimId = await taoClaim(admin, projectId, "clrestnotdel");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/claims/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(claimId) }) });
  assert.equal(res.status, 404);
});

test("POST /api/claims/:id/restore: khôi phục thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("clrestok");
  const admin = await taoUser("admin", "clrestok");
  const claimId = await taoClaim(admin, projectId, "clrestok");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/claims/[id]/route");
  const del = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(del.status, 200);

  const { POST } = await import("@/app/api/claims/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(claimId) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM claims WHERE id = ?`,
    claimId,
  );
  assert.equal(row?.deleted_at, null);
});

// ============================================================================
// GET /api/claims/eot-suggestion
// ============================================================================

test("GET /api/claims/eot-suggestion: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/claims/eot-suggestion/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/claims/eot-suggestion: subcon không có quyền xem claim → 403", S, async () => {
  const projectId = await taoDuAn("eot403");
  const sub = await taoUser("subcon", "eot403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/claims/eot-suggestion/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test(
  "GET /api/claims/eot-suggestion: dự án không có tầng nào đang chờ mặt bằng → 0 ngày, 0 tầng",
  S,
  async () => {
    const projectId = await taoDuAn("eotzero");
    const pm = await taoUser("pm", "eotzero");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/claims/eot-suggestion/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.suggestedDays, 0);
    assert.equal(body.waitingFloors, 0);
  },
);

// ============================================================================
// POST /api/variations/:id/submit
// ============================================================================

async function taoVoNhap(
  nguoiTao: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
): Promise<{ id: number; code: string }> {
  await dangNhapDuAn(nguoiTao, projectId);
  const { POST } = await import("@/app/api/variations/route");
  const res = await POST(
    jreq("/api/variations", {
      title: `VO ${ten}`,
      reason: "other",
      lines: [{ code: `VO3B-${uniq(ten)}`, name: "Dòng", unit: "m", qty: 5, unitPrice: 10000 }],
    }),
  );
  const json = await res.json();
  assert.equal(res.status, 201, `taoVoNhap thất bại: ${JSON.stringify(json)}`);
  return json;
}

async function trinhVo(id: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `UPDATE variation_orders SET status = 'submitted', submitted_at = current_date WHERE id = ?`,
    id,
  );
}

async function duyetVo(id: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `UPDATE variation_orders SET status = 'approved', decided_at = current_date WHERE id = ?`,
    id,
  );
  await run(`UPDATE boq_items SET qty_approved = qty_contract WHERE vo_id = ?`, id);
}

test("POST /api/variations/:id/submit: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/variations/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/variations/:id/submit: engineer không được trình (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("vsub403");
  const eng = await taoUser("engineer", "vsub403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/variations/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/variations/:id/submit: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("vsubbad");
  const pm = await taoUser("pm", "vsubbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/variations/:id/submit: VO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("vsubisoA");
  const projectB = await taoDuAn("vsubisoB");
  const pmA = await taoUser("pm", "vsubisoA");
  const pmB = await taoUser("pm", "vsubisoB");
  const vo = await taoVoNhap(pmB, projectB, "vsubisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/variations/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(vo.id) }) });
  assert.equal(res.status, 404);
});

test("POST /api/variations/:id/submit: trình thành công (draft → submitted)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("vsubok");
  const pm = await taoUser("pm", "vsubok");
  const vo = await taoVoNhap(pm, projectId, "vsubok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/submit/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(vo.id) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM variation_orders WHERE id = ?`,
    vo.id,
  );
  assert.equal(row?.status, "submitted");
});

test("POST /api/variations/:id/submit: VO không còn ở trạng thái nháp → 409", S, async () => {
  const projectId = await taoDuAn("vsubtwice");
  const pm = await taoUser("pm", "vsubtwice");
  const vo = await taoVoNhap(pm, projectId, "vsubtwice");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/submit/route");
  const first = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(vo.id) }) });
  assert.equal(first.status, 200);
  const second = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(vo.id) }) });
  assert.equal(second.status, 409);
});

// ============================================================================
// POST /api/variations/:id/contract-add
// ============================================================================

test("POST /api/variations/:id/contract-add: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/variations/:id/contract-add: engineer không được (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("vca403");
  const eng = await taoUser("engineer", "vca403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/variations/:id/contract-add: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("vcabad");
  const pm = await taoUser("pm", "vcabad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/variations/:id/contract-add: thiếu contractId → 422", S, async () => {
  const projectId = await taoDuAn("vcanoc");
  const pm = await taoUser("pm", "vcanoc");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(jreq("/x", { addendaCode: "PL01" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/variations/:id/contract-add: thiếu addendaCode → 422", S, async () => {
  const projectId = await taoDuAn("vcanoac");
  const pm = await taoUser("pm", "vcanoac");
  const contractId = await taoHopDong(projectId, "vcanoac");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(jreq("/x", { contractId }), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 422);
});

test(
  "POST /api/variations/:id/contract-add: ngày ký không phải ngày thật (2026-02-30) → 422 " +
    "(cùng lớp bug DATE_RE đã vá ở addenda — route này TRƯỚC ĐÓ không validate ngày chút nào)",
  S,
  async () => {
    const projectId = await taoDuAn("vcadate");
    const pm = await taoUser("pm", "vcadate");
    const contractId = await taoHopDong(projectId, "vcadate");
    const vo = await taoVoNhap(pm, projectId, "vcadate");
    await trinhVo(vo.id);
    await duyetVo(vo.id);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
    const res = await POST(
      jreq("/x", { contractId, addendaCode: "PL01", signedDate: "2026-02-30" }),
      { params: Promise.resolve({ id: String(vo.id) }) },
    );
    assert.equal(res.status, 422);
  },
);

test("POST /api/variations/:id/contract-add: VO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("vcaisoA");
  const projectB = await taoDuAn("vcaisoB");
  const pmA = await taoUser("pm", "vcaisoA");
  const pmB = await taoUser("pm", "vcaisoB");
  const contractA = await taoHopDong(projectA, "vcaisoA");
  const vo = await taoVoNhap(pmB, projectB, "vcaisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(
    jreq("/x", { contractId: contractA, addendaCode: "PL01" }),
    { params: Promise.resolve({ id: String(vo.id) }) },
  );
  assert.equal(res.status, 404);
});

test("POST /api/variations/:id/contract-add: VO chưa duyệt (còn draft/submitted) → 409", S, async () => {
  const projectId = await taoDuAn("vca409");
  const pm = await taoUser("pm", "vca409");
  const contractId = await taoHopDong(projectId, "vca409");
  const vo = await taoVoNhap(pm, projectId, "vca409");
  await trinhVo(vo.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(
    jreq("/x", { contractId, addendaCode: "PL01" }),
    { params: Promise.resolve({ id: String(vo.id) }) },
  );
  assert.equal(res.status, 409);
});

test("POST /api/variations/:id/contract-add: hợp đồng đích không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("vcanoexist");
  const pm = await taoUser("pm", "vcanoexist");
  const vo = await taoVoNhap(pm, projectId, "vcanoexist");
  await trinhVo(vo.id);
  await duyetVo(vo.id);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  const res = await POST(
    jreq("/x", { contractId: 999999999, addendaCode: "PL01" }),
    { params: Promise.resolve({ id: String(vo.id) }) },
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/variations/:id/contract-add: thành công → sinh phụ lục, VO chuyển 'contract_added'",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("vcaok");
    const pm = await taoUser("pm", "vcaok");
    const contractId = await taoHopDong(projectId, "vcaok");
    const vo = await taoVoNhap(pm, projectId, "vcaok");
    await trinhVo(vo.id);
    await duyetVo(vo.id);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
    const res = await POST(
      jreq("/x", { contractId, addendaCode: "PL-VCA", signedDate: "2026-06-01" }),
      { params: Promise.resolve({ id: String(vo.id) }) },
    );
    assert.equal(res.status, 201);
    const voRow = await queryOne<{ status: string; contract_id: number }>(
      `SELECT status, contract_id FROM variation_orders WHERE id = ?`,
      vo.id,
    );
    assert.equal(voRow?.status, "contract_added");
    assert.equal(voRow?.contract_id, contractId);
    const { addendaId } = await res.json();
    const addRow = await queryOne<{ contract_id: number }>(
      `SELECT contract_id FROM contract_addenda WHERE id = ?`,
      addendaId,
    );
    assert.equal(addRow?.contract_id, contractId);
  },
);

// ============================================================================
// GET/POST /api/variations/:id/documents
// ============================================================================

test("GET /api/variations/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/variations/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/variations/:id/documents: subcon không có quyền xem VO → 403", S, async () => {
  const projectId = await taoDuAn("vdg403");
  const sub = await taoUser("subcon", "vdg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/variations/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/variations/:id/documents: VO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("vdgisoA");
  const projectB = await taoDuAn("vdgisoB");
  const pmA = await taoUser("pm", "vdgisoA");
  const pmB = await taoUser("pm", "vdgisoB");
  const vo = await taoVoNhap(pmB, projectB, "vdgisoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/variations/[id]/documents/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(vo.id) }) });
  assert.equal(res.status, 404);
});

test("POST /api/variations/:id/documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/variations/[id]/documents/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/variations/:id/documents: VO không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("vdpisoA");
  const projectB = await taoDuAn("vdpisoB");
  const pmA = await taoUser("pm", "vdpisoA");
  const pmB = await taoUser("pm", "vdpisoB");
  const vo = await taoVoNhap(pmB, projectB, "vdpisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/variations/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(vo.id) }) });
  assert.equal(res.status, 404);
});

test(
  "POST /api/variations/:id/documents: VO đã có quyết định (canEditVo khoá) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("vdplock");
    const pm = await taoUser("pm", "vdplock");
    const vo = await taoVoNhap(pm, projectId, "vdplock");
    await trinhVo(vo.id);
    await duyetVo(vo.id);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/[id]/documents/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
    const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(vo.id) }) });
    assert.equal(res.status, 403);
  },
);

test(
  "POST /api/variations/:id/documents: upload thành công khi còn nháp → GET liệt kê đúng",
  S,
  async () => {
    const projectId = await taoDuAn("vdpok");
    const pm = await taoUser("pm", "vdpok");
    const vo = await taoVoNhap(pm, projectId, "vdpok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/[id]/documents/route");
    const form = new FormData();
    form.set("file", new File([PDF_BYTES], "trinh.pdf", { type: "application/pdf" }));
    const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(vo.id) }) });
    assert.equal(res.status, 201);
    const { id } = await res.json();

    const { GET } = await import("@/app/api/variations/[id]/documents/route");
    const list = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    const { documents } = await list.json();
    assert.equal(documents.length, 1);
    assert.equal(documents[0].id, id);
  },
);

// ============================================================================
// GET/DELETE /api/vo-documents/:id
// ============================================================================

async function uploadVoDoc(
  nguoiUpload: { id: number; passwordHash: string },
  projectId: number,
  voId: number,
): Promise<number> {
  await dangNhapDuAn(nguoiUpload, projectId);
  const { POST } = await import("@/app/api/variations/[id]/documents/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "vo.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: String(voId) }) });
  const { id } = await res.json();
  return id as number;
}

test("GET /api/vo-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/vo-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/vo-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("vodocbad");
  const pm = await taoUser("pm", "vodocbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/vo-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/vo-documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("vodocgnf");
  const pm = await taoUser("pm", "vodocgnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/vo-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test(
  "GET /api/vo-documents/:id: PM dự án A KHÔNG tải được file VO của dự án B dù biết id " +
    "(BUG THẬT đã vá cùng đợt này — route trước đây chỉ `WHERE id = ?`, không so dự án, " +
    "cùng lớp lỗ hổng đã vá ở /api/documents/:id và khác hẳn contract-documents/claim-documents " +
    "vốn đã lọc đúng)",
  S,
  async () => {
    const projectA = await taoDuAn("vodocisoA");
    const projectB = await taoDuAn("vodocisoB");
    const pmA = await taoUser("pm", "vodocisoA");
    const pmB = await taoUser("pm", "vodocisoB");
    const voB = await taoVoNhap(pmB, projectB, "vodocisoB");
    const docB = await uploadVoDoc(pmB, projectB, voB.id);

    await dangNhapDuAn(pmA, projectA);
    const { GET, DELETE } = await import("@/app/api/vo-documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docB) }),
    });
    assert.equal(res.status, 404, "file VO của dự án khác phải như không tồn tại");

    const xoa = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docB) }),
    });
    assert.equal(xoa.status, 404, "xoá xuyên dự án cũng phải bị chặn");
    const { queryOne } = await import("@/lib/db");
    assert.ok(
      await queryOne(`SELECT id FROM vo_documents WHERE id = ?`, docB),
      "file của dự án B phải còn nguyên",
    );

    // Chủ thật vẫn dùng bình thường — bản vá không được chặn nhầm người đúng.
    await dangNhapDuAn(pmB, projectB);
    const cuaMinh = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docB) }),
    });
    assert.equal(cuaMinh.status, 200);
  },
);

test("GET /api/vo-documents/:id: tải đúng byte đã upload", S, async () => {
  const projectId = await taoDuAn("vodocok");
  const pm = await taoUser("pm", "vodocok");
  const vo = await taoVoNhap(pm, projectId, "vodocok");
  const docId = await uploadVoDoc(pm, projectId, vo.id);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/vo-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(docId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
});

test(
  "GET /api/vo-documents/:id: file trên đĩa không khớp hash lưu (bị tráo/hỏng) → 409",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const { storagePut } = await import("@/lib/nen/storage");
    const projectId = await taoDuAn("vodochash");
    const pm = await taoUser("pm", "vodochash");
    const vo = await taoVoNhap(pm, projectId, "vodochash");
    const fileName = `vo-hash-mismatch-${uniq("vodochash")}.pdf`;
    await storagePut(1, fileName, Buffer.from("%PDF-1.4\nNoi dung that\n%%EOF"));
    const docId = await insertId(
      `INSERT INTO vo_documents (vo_id, file_name, original_name, mime_type, uploaded_by, sha256)
       VALUES (?, ?, 'a.pdf', 'application/pdf', ?, ?)`,
      vo.id,
      fileName,
      pm.id,
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/vo-documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 409);
  },
);

test("GET /api/vo-documents/:id: file không còn trên đĩa → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("vodocmiss");
  const pm = await taoUser("pm", "vodocmiss");
  const vo = await taoVoNhap(pm, projectId, "vodocmiss");
  const docId = await insertId(
    `INSERT INTO vo_documents (vo_id, file_name, original_name, mime_type, uploaded_by)
     VALUES (?, ?, 'a.pdf', 'application/pdf', ?)`,
    vo.id,
    "khong-ton-tai-tren-dia.pdf",
    pm.id,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/vo-documents/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/vo-documents/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/vo-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("DELETE /api/vo-documents/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("vodocdbad");
  const pm = await taoUser("pm", "vodocdbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/vo-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("DELETE /api/vo-documents/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("vodocdnf");
  const pm = await taoUser("pm", "vodocdnf");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/vo-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/vo-documents/:id: không phải người upload, không phải Admin/PM → 403",
  S,
  async () => {
    const projectId = await taoDuAn("vodocd403");
    const eng = await taoUser("engineer", "vodocd403");
    const eng2 = await taoUser("engineer", "vodocd403b");
    // VO tạo bởi chính eng (đang nháp) — canEditVo cho phép người tạo upload file
    // trong lúc nháp; eng2 (không phải người upload, không phải Admin/PM) phải bị 403.
    const vo = await taoVoNhap(eng, projectId, "vodocd403");
    const docId = await uploadVoDoc(eng, projectId, vo.id);
    await dangNhapDuAn(eng2, projectId);
    const { DELETE } = await import("@/app/api/vo-documents/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/vo-documents/:id: chính người upload xoá được", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("vodocdok");
  const eng = await taoUser("engineer", "vodocdok");
  const vo = await taoVoNhap(eng, projectId, "vodocdok");
  const docId = await uploadVoDoc(eng, projectId, vo.id);
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/vo-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM vo_documents WHERE id = ?`, docId);
  assert.equal(row, undefined);
});

// ============================================================================
// Helpers: tender
// ============================================================================

async function taoGoiThau(
  pm: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
  boqId: number,
  qty = 10,
): Promise<{ id: number; code: string }> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(
    jreq("/api/tenders", { name: `Gói thầu ${ten}`, items: [{ boqItemId: boqId, qty }] }),
  );
  const json = await res.json();
  assert.equal(res.status, 201, `taoGoiThau thất bại: ${JSON.stringify(json)}`);
  return json;
}

// ============================================================================
// POST /api/tenders/:id/bids
// ============================================================================

test("POST /api/tenders/:id/bids: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/tenders/:id/bids: engineer không được nhập giá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("bid403");
  const eng = await taoUser("engineer", "bid403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/tenders/:id/bids: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("bidbad");
  const pm = await taoUser("pm", "bidbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/tenders/:id/bids: gói thầu thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("bidisoA");
  const projectB = await taoDuAn("bidisoB");
  const pmA = await taoUser("pm", "bidisoA");
  const pmB = await taoUser("pm", "bidisoB");
  const boqId = await taoBoqItem("bidisoB", projectB);
  const tender = await taoGoiThau(pmB, projectB, "bidisoB", boqId);
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { supplierId: 1, lumpSum: 100 }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tenders/:id/bids: thiếu nhà thầu (supplierId) → 422", S, async () => {
  const projectId = await taoDuAn("bidnosupp");
  const pm = await taoUser("pm", "bidnosupp");
  const boqId = await taoBoqItem("bidnosupp", projectId);
  const tender = await taoGoiThau(pm, projectId, "bidnosupp", boqId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { lumpSum: 100 }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/tenders/:id/bids: nhà thầu không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("bidsuppbad");
  const pm = await taoUser("pm", "bidsuppbad");
  const boqId = await taoBoqItem("bidsuppbad", projectId);
  const tender = await taoGoiThau(pm, projectId, "bidsuppbad", boqId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { supplierId: 999999999, lumpSum: 100 }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/tenders/:id/bids: thiếu cả lumpSum lẫn dòng giá → 422", S, async () => {
  const projectId = await taoDuAn("bidempty");
  const pm = await taoUser("pm", "bidempty");
  const boqId = await taoBoqItem("bidempty", projectId);
  const supplierId = await taoNCC("bidempty");
  const tender = await taoGoiThau(pm, projectId, "bidempty", boqId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { supplierId }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/tenders/:id/bids: dòng giá không thuộc phạm vi mời thầu → 422", S, async () => {
  const projectId = await taoDuAn("bidoutscope");
  const pm = await taoUser("pm", "bidoutscope");
  const boqId = await taoBoqItem("bidoutscope", projectId);
  const boqNgoai = await taoBoqItem("bidoutscopeX", projectId);
  const supplierId = await taoNCC("bidoutscope");
  const tender = await taoGoiThau(pm, projectId, "bidoutscope", boqId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(
    jreq("/x", { supplierId, prices: [{ boqItemId: boqNgoai, unitPrice: 100 }] }),
    { params: Promise.resolve({ id: String(tender.id) }) },
  );
  assert.equal(res.status, 422);
});

test("POST /api/tenders/:id/bids: nhập báo giá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("bidok");
  const pm = await taoUser("pm", "bidok");
  const boqId = await taoBoqItem("bidok", projectId);
  const supplierId = await taoNCC("bidok");
  const tender = await taoGoiThau(pm, projectId, "bidok", boqId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(
    jreq("/x", { supplierId, prices: [{ boqItemId: boqId, unitPrice: 950 }] }),
    { params: Promise.resolve({ id: String(tender.id) }) },
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ tender_id: number; supplier_id: number }>(
    `SELECT tender_id, supplier_id FROM tender_bids WHERE id = ?`,
    id,
  );
  assert.equal(row?.tender_id, tender.id);
  assert.equal(row?.supplier_id, supplierId);
});

test("POST /api/tenders/:id/bids: NCC đã có báo giá cho gói thầu này → 409", S, async () => {
  const projectId = await taoDuAn("biddup");
  const pm = await taoUser("pm", "biddup");
  const boqId = await taoBoqItem("biddup", projectId);
  const supplierId = await taoNCC("biddup");
  const tender = await taoGoiThau(pm, projectId, "biddup", boqId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const first = await POST(jreq("/x", { supplierId, lumpSum: 1000 }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(first.status, 201);
  const second = await POST(jreq("/x", { supplierId, lumpSum: 2000 }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(second.status, 409);
});

test("POST /api/tenders/:id/bids: gói thầu đã trao thầu → 409", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("bidawarded");
  const pm = await taoUser("pm", "bidawarded");
  const boqId = await taoBoqItem("bidawarded", projectId);
  const supplierId = await taoNCC("bidawarded");
  const tender = await taoGoiThau(pm, projectId, "bidawarded", boqId);
  await run(`UPDATE tender_packages SET status = 'awarded' WHERE id = ?`, tender.id);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const res = await POST(jreq("/x", { supplierId, lumpSum: 1000 }), {
    params: Promise.resolve({ id: String(tender.id) }),
  });
  assert.equal(res.status, 409);
});

// ============================================================================
// PATCH/DELETE /api/tenders/:id/bids/:bidId
// ============================================================================

async function taoBaoGia(
  pm: { id: number; passwordHash: string },
  projectId: number,
  tenderId: number,
  supplierId: number,
  overrides: { lumpSum?: number; boqId?: number; unitPrice?: number } = {},
): Promise<number> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const body: Record<string, unknown> =
    overrides.boqId != null
      ? { supplierId, prices: [{ boqItemId: overrides.boqId, unitPrice: overrides.unitPrice ?? 100 }] }
      : { supplierId, lumpSum: overrides.lumpSum ?? 1000 };
  const res = await POST(jreq("/x", body), { params: Promise.resolve({ id: String(tenderId) }) });
  const json = await res.json();
  assert.equal(res.status, 201, `taoBaoGia thất bại: ${JSON.stringify(json)}`);
  return json.id as number;
}

test("PATCH /api/tenders/:id/bids/:bidId: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: "1", bidId: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/tenders/:id/bids/:bidId: engineer không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("bidp403");
  const eng = await taoUser("engineer", "bidp403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: "1", bidId: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/tenders/:id/bids/:bidId: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("bidpbad");
  const pm = await taoUser("pm", "bidpbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: "1", bidId: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/tenders/:id/bids/:bidId: báo giá thuộc gói thầu dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("bidpisoA");
  const projectB = await taoDuAn("bidpisoB");
  const pmA = await taoUser("pm", "bidpisoA");
  const pmB = await taoUser("pm", "bidpisoB");
  const boqId = await taoBoqItem("bidpisoB", projectB);
  const supplierId = await taoNCC("bidpisoB");
  const tender = await taoGoiThau(pmB, projectB, "bidpisoB", boqId);
  const bidId = await taoBaoGia(pmB, projectB, tender.id, supplierId);
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(jreq("/x", { lumpSum: 2000 }, "PATCH"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/tenders/:id/bids/:bidId: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("bidpbody");
  const pm = await taoUser("pm", "bidpbody");
  const boqId = await taoBoqItem("bidpbody", projectId);
  const supplierId = await taoNCC("bidpbody");
  const tender = await taoGoiThau(pm, projectId, "bidpbody", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/tenders/:id/bids/:bidId: sửa giá chào thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("bidpok");
  const pm = await taoUser("pm", "bidpok");
  const boqId = await taoBoqItem("bidpok", projectId);
  const supplierId = await taoNCC("bidpok");
  const tender = await taoGoiThau(pm, projectId, "bidpok", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId, { lumpSum: 1000 });
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(jreq("/x", { lumpSum: 1500, note: "Đã đàm phán" }, "PATCH"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ lump_sum: number; note: string }>(
    `SELECT lump_sum, note FROM tender_bids WHERE id = ?`,
    bidId,
  );
  assert.equal(Number(row?.lump_sum), 1500);
  assert.equal(row?.note, "Đã đàm phán");
});

test("PATCH /api/tenders/:id/bids/:bidId: gói thầu đã trao thầu → 409 (khoá sửa)", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("bidplock");
  const pm = await taoUser("pm", "bidplock");
  const boqId = await taoBoqItem("bidplock", projectId);
  const supplierId = await taoNCC("bidplock");
  const tender = await taoGoiThau(pm, projectId, "bidplock", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
  await run(`UPDATE tender_packages SET status = 'awarded' WHERE id = ?`, tender.id);
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await PATCH(jreq("/x", { lumpSum: 999 }, "PATCH"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/tenders/:id/bids/:bidId: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1", bidId: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/tenders/:id/bids/:bidId: engineer không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("bidd403");
  const eng = await taoUser("engineer", "bidd403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1", bidId: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/tenders/:id/bids/:bidId: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("biddbad");
  const pm = await taoUser("pm", "biddbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1", bidId: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/tenders/:id/bids/:bidId: báo giá thuộc gói thầu dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("bidddisoA");
  const projectB = await taoDuAn("bidddisoB");
  const pmA = await taoUser("pm", "bidddisoA");
  const pmB = await taoUser("pm", "bidddisoB");
  const boqId = await taoBoqItem("bidddisoB", projectB);
  const supplierId = await taoNCC("bidddisoB");
  const tender = await taoGoiThau(pmB, projectB, "bidddisoB", boqId);
  const bidId = await taoBaoGia(pmB, projectB, tender.id, supplierId);
  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/tenders/:id/bids/:bidId: gói thầu đã trao thầu → 409 (khoá sửa)", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("biddlock");
  const pm = await taoUser("pm", "biddlock");
  const boqId = await taoBoqItem("biddlock", projectId);
  const supplierId = await taoNCC("biddlock");
  const tender = await taoGoiThau(pm, projectId, "biddlock", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
  await run(`UPDATE tender_packages SET status = 'awarded' WHERE id = ?`, tender.id);
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/tenders/:id/bids/:bidId: xoá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("biddok");
  const pm = await taoUser("pm", "biddok");
  const boqId = await taoBoqItem("biddok", projectId);
  const supplierId = await taoNCC("biddok");
  const tender = await taoGoiThau(pm, projectId, "biddok", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/tenders/[id]/bids/[bidId]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM tender_bids WHERE id = ?`, bidId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/tenders/:id/bids/:bidId/file
// ============================================================================

test("GET /api/tenders/:id/bids/:bidId/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "1", bidId: "1" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/tenders/:id/bids/:bidId/file: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("bidf403");
  const sub = await taoUser("subcon", "bidf403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "1", bidId: "1" }),
  });
  assert.equal(res.status, 403);
});

test("GET /api/tenders/:id/bids/:bidId/file: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("bidfbad");
  const pm = await taoUser("pm", "bidfbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "1", bidId: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/tenders/:id/bids/:bidId/file: chưa có file đính kèm → 404", S, async () => {
  const projectId = await taoDuAn("bidfnone");
  const pm = await taoUser("pm", "bidfnone");
  const boqId = await taoBoqItem("bidfnone", projectId);
  const supplierId = await taoNCC("bidfnone");
  const tender = await taoGoiThau(pm, projectId, "bidfnone", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/tenders/:id/bids/:bidId/file: báo giá thuộc gói thầu dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("bidfgisoA");
  const projectB = await taoDuAn("bidfgisoB");
  const pmA = await taoUser("pm", "bidfgisoA");
  const pmB = await taoUser("pm", "bidfgisoB");
  const boqId = await taoBoqItem("bidfgisoB", projectB);
  const supplierId = await taoNCC("bidfgisoB");
  const tender = await taoGoiThau(pmB, projectB, "bidfgisoB", boqId);
  const bidId = await taoBaoGia(pmB, projectB, tender.id, supplierId);
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/tenders/:id/bids/:bidId/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1", bidId: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/tenders/:id/bids/:bidId/file: engineer không được upload → 403", S, async () => {
  const projectId = await taoDuAn("bidfp403");
  const eng = await taoUser("engineer", "bidfp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const form = new FormData();
  const res = await POST(formReq("/x", form), { params: Promise.resolve({ id: "1", bidId: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/tenders/:id/bids/:bidId/file: báo giá không tồn tại (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("bidfisoA");
  const projectB = await taoDuAn("bidfisoB");
  const pmA = await taoUser("pm", "bidfisoA");
  const pmB = await taoUser("pm", "bidfisoB");
  const boqId = await taoBoqItem("bidfisoB", projectB);
  const supplierId = await taoNCC("bidfisoB");
  const tender = await taoGoiThau(pmB, projectB, "bidfisoB", boqId);
  const bidId = await taoBaoGia(pmB, projectB, tender.id, supplierId);
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  const form = new FormData();
  form.set("file", new File([PDF_BYTES], "a.pdf", { type: "application/pdf" }));
  const res = await POST(formReq("/x", form), {
    params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/tenders/:id/bids/:bidId/file: upload thành công → GET tải đúng byte, upload lần 2 thay thế file cũ",
  S,
  async () => {
    const projectId = await taoDuAn("bidfok");
    const pm = await taoUser("pm", "bidfok");
    const boqId = await taoBoqItem("bidfok", projectId);
    const supplierId = await taoNCC("bidfok");
    const tender = await taoGoiThau(pm, projectId, "bidfok", boqId);
    const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
    const form1 = new FormData();
    form1.set("file", new File([PDF_BYTES], "chao1.pdf", { type: "application/pdf" }));
    const up1 = await POST(formReq("/x", form1), {
      params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
    });
    assert.equal(up1.status, 201);

    const { GET } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
    const get1 = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
    });
    assert.equal(get1.status, 200);
    assert.ok(Buffer.from(await get1.arrayBuffer()).equals(PDF_BYTES));

    // Upload lần 2 với nội dung khác — file cũ phải bị thay, không cộng dồn.
    const PDF_BYTES_2 = Buffer.from("%PDF-1.4\nBan sua\n%%EOF");
    const form2 = new FormData();
    form2.set("file", new File([PDF_BYTES_2], "chao2.pdf", { type: "application/pdf" }));
    const up2 = await POST(formReq("/x", form2), {
      params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
    });
    assert.equal(up2.status, 201);
    const get2 = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(tender.id), bidId: String(bidId) }),
    });
    assert.ok(Buffer.from(await get2.arrayBuffer()).equals(PDF_BYTES_2));
  },
);

// ============================================================================
// POST /api/tenders/:id/award
// ============================================================================

test("POST /api/tenders/:id/award: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/tenders/:id/award: engineer không được trao thầu (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("aw403");
  const eng = await taoUser("engineer", "aw403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/tenders/:id/award: thiếu bidId → 422", S, async () => {
  const projectId = await taoDuAn("awnobid");
  const pm = await taoUser("pm", "awnobid");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 422);
});

test("POST /api/tenders/:id/award: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("awbad");
  const pm = await taoUser("pm", "awbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const res = await POST(jreq("/x", { bidId: 1 }), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/tenders/:id/award: chưa chọn dự án nào → 404", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("awnoprojOwner");
  const pm = await taoUser("pm", "awnoproj");
  const other = await taoUser("pm", "awnoprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/tenders/[id]/award/route");
    const res = await POST(jreq("/x", { bidId: 1 }), { params: Promise.resolve({ id: "1" }) });
    assert.equal(res.status, 404);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/tenders/:id/award: gói thầu thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("awisoA");
  const projectB = await taoDuAn("awisoB");
  const pmA = await taoUser("pm", "awisoA");
  const pmB = await taoUser("pm", "awisoB");
  const boqId = await taoBoqItem("awisoB", projectB);
  const supplierId = await taoNCC("awisoB");
  const tender = await taoGoiThau(pmB, projectB, "awisoB", boqId);
  const bidId = await taoBaoGia(pmB, projectB, tender.id, supplierId);
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const res = await POST(jreq("/x", { bidId }), { params: Promise.resolve({ id: String(tender.id) }) });
  assert.equal(res.status, 404);
});

test("POST /api/tenders/:id/award: báo giá không thuộc gói thầu này → 422", S, async () => {
  const projectId = await taoDuAn("awbidwrong");
  const pm = await taoUser("pm", "awbidwrong");
  const boqId1 = await taoBoqItem("awbidwrong1", projectId);
  const boqId2 = await taoBoqItem("awbidwrong2", projectId);
  const supplierId = await taoNCC("awbidwrong");
  const tender1 = await taoGoiThau(pm, projectId, "awbidwrong1", boqId1);
  const tender2 = await taoGoiThau(pm, projectId, "awbidwrong2", boqId2);
  const bidOfTender2 = await taoBaoGia(pm, projectId, tender2.id, supplierId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const res = await POST(jreq("/x", { bidId: bidOfTender2 }), {
    params: Promise.resolve({ id: String(tender1.id) }),
  });
  assert.equal(res.status, 422);
});

test(
  "POST /api/tenders/:id/award: trao thầu thành công → sinh hợp đồng giao_thầu, khoá gói thầu",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("awok");
    const pm = await taoUser("pm", "awok");
    const boqId = await taoBoqItem("awok", projectId);
    const supplierId = await taoNCC("awok");
    const tender = await taoGoiThau(pm, projectId, "awok", boqId);
    const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId, {
      boqId,
      unitPrice: 950,
    });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/[id]/award/route");
    const res = await POST(jreq("/x", { bidId }), {
      params: Promise.resolve({ id: String(tender.id) }),
    });
    assert.equal(res.status, 200);
    const { contractId } = await res.json();
    const contract = await queryOne<{ kind: string; project_id: number; party_supplier_id: number }>(
      `SELECT kind, project_id, party_supplier_id FROM contracts WHERE id = ?`,
      contractId,
    );
    assert.equal(contract?.kind, "giao_thau");
    assert.equal(contract?.project_id, projectId);
    assert.equal(contract?.party_supplier_id, supplierId);
    const tenderRow = await queryOne<{ status: string; awarded_bid_id: number }>(
      `SELECT status, awarded_bid_id FROM tender_packages WHERE id = ?`,
      tender.id,
    );
    assert.equal(tenderRow?.status, "awarded");
    assert.equal(tenderRow?.awarded_bid_id, bidId);
  },
);

test("POST /api/tenders/:id/award: gói thầu đã trao thầu rồi → 409, không trao lại", S, async () => {
  const projectId = await taoDuAn("awtwice");
  const pm = await taoUser("pm", "awtwice");
  const boqId = await taoBoqItem("awtwice", projectId);
  const supplierId = await taoNCC("awtwice");
  const tender = await taoGoiThau(pm, projectId, "awtwice", boqId);
  const bidId = await taoBaoGia(pm, projectId, tender.id, supplierId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const first = await POST(jreq("/x", { bidId }), { params: Promise.resolve({ id: String(tender.id) }) });
  assert.equal(first.status, 200);
  const second = await POST(jreq("/x", { bidId }), { params: Promise.resolve({ id: String(tender.id) }) });
  assert.equal(second.status, 409);
});

// ============================================================================
// Helpers: insurance-bonds
// ============================================================================

async function taoBaoHiem(
  pm: { id: number; passwordHash: string },
  projectId: number,
  ten: string,
): Promise<number> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const res = await POST(jreq("/x", { kind: "car", title: `Bảo hiểm ${ten}` }));
  const json = await res.json();
  assert.equal(res.status, 201, `taoBaoHiem thất bại: ${JSON.stringify(json)}`);
  return json.id as number;
}

// ============================================================================
// GET /api/insurance-bonds/:id/file
// ============================================================================

test("GET /api/insurance-bonds/:id/file: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/insurance-bonds/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/insurance-bonds/:id/file: engineer không có quyền xem (viewPayments) → 403", S, async () => {
  const projectId = await taoDuAn("ibf403");
  const eng = await taoUser("engineer", "ibf403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/insurance-bonds/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/insurance-bonds/:id/file: chưa có file đính kèm → 404", S, async () => {
  const projectId = await taoDuAn("ibfnone");
  const pm = await taoUser("pm", "ibfnone");
  const bondId = await taoBaoHiem(pm, projectId, "ibfnone");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/insurance-bonds/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(bondId) }) });
  assert.equal(res.status, 404);
});

test("GET /api/insurance-bonds/:id/file: thuộc dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("ibfisoA");
  const projectB = await taoDuAn("ibfisoB");
  const pmA = await taoUser("pm", "ibfisoA");
  const pmB = await taoUser("pm", "ibfisoB");
  const bondB = await taoBaoHiem(pmB, projectB, "ibfisoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/insurance-bonds/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(bondB) }) });
  assert.equal(res.status, 404);
});

test("GET /api/insurance-bonds/:id/file: tải đúng byte đã lưu trên đĩa", S, async () => {
  const { run, insertId } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const projectId = await taoDuAn("ibfok");
  const pm = await taoUser("pm", "ibfok");
  const fileName = `insurance-${uniq("ibfok")}.pdf`;
  await storagePut(1, fileName, PDF_BYTES);
  const bondId = await insertId(
    `INSERT INTO insurance_bonds (project_id, kind, title, file_name, mime_type, original_name)
     VALUES (?, 'car', 'Bảo hiểm có file', ?, 'application/pdf', 'a.pdf')`,
    projectId,
    fileName,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/insurance-bonds/[id]/file/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: String(bondId) }) });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(PDF_BYTES));
  void run;
});

// ============================================================================
// POST /api/insurance-bonds/:id/restore
// ============================================================================

test("POST /api/insurance-bonds/:id/restore: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/insurance-bonds/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/insurance-bonds/:id/restore: PM không được khôi phục (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("ibrest403");
  const pm = await taoUser("pm", "ibrest403");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/insurance-bonds/:id/restore: chưa xoá → 404", S, async () => {
  const projectId = await taoDuAn("ibrestnotdel");
  const admin = await taoUser("admin", "ibrestnotdel");
  const bondId = await taoBaoHiem(admin, projectId, "ibrestnotdel");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(bondId) }) });
  assert.equal(res.status, 404);
});

test("POST /api/insurance-bonds/:id/restore: khôi phục thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ibrestok");
  const admin = await taoUser("admin", "ibrestok");
  const bondId = await taoBaoHiem(admin, projectId, "ibrestok");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/insurance-bonds/[id]/route");
  const del = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(bondId) }),
  });
  assert.equal(del.status, 200);

  const { POST } = await import("@/app/api/insurance-bonds/[id]/restore/route");
  const res = await POST(jreq("/x", undefined), { params: Promise.resolve({ id: String(bondId) }) });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM insurance_bonds WHERE id = ?`,
    bondId,
  );
  assert.equal(row?.deleted_at, null);
});

// ============================================================================
// Helpers: purchase order (dùng cho ratings)
// ============================================================================

async function taoPO(
  pm: { id: number; passwordHash: string },
  projectId: number,
  materialId: number,
  supplierId: number,
): Promise<number> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(
    jreq("/api/purchase-orders", {
      supplierId,
      items: [{ materialId, qtyOrdered: 10, unitPrice: 100000 }],
    }),
  );
  const json = await res.json();
  assert.equal(res.status, 201, `taoPO thất bại: ${JSON.stringify(json)}`);
  return json.id as number;
}

// ============================================================================
// POST /api/suppliers/:id/ratings
// ============================================================================

test("POST /api/suppliers/:id/ratings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/suppliers/:id/ratings: subcon không được đánh giá NCC → 403", S, async () => {
  const projectId = await taoDuAn("rate403");
  const sub = await taoUser("subcon", "rate403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/suppliers/:id/ratings: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("ratebad");
  const pm = await taoUser("pm", "ratebad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", {}), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("POST /api/suppliers/:id/ratings: NCC không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("ratenf");
  const pm = await taoUser("pm", "ratenf");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { poId: 1 }), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test(
  "POST /api/suppliers/:id/ratings: NCC thuộc tổ chức KHÁC → 404, không lộ ghi được đánh giá " +
    "(BUG THẬT đã vá cùng đợt này — route trước đây chỉ `WHERE id = ?`, không so org_id, khác " +
    "hẳn GET /api/suppliers gốc vốn đã lọc `s.org_id = ?` đúng)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const orgA = await taoOrg("rateorgA");
    const orgB = await taoOrg("rateorgB");
    const projectId = await taoDuAn("rateorg");
    const pmA = await taoUser("pm", "rateorgA", orgA);
    const supplierB = await taoNCC("rateorgB", orgB);
    await dangNhapDuAn(pmA, projectId);
    const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
    const res = await POST(jreq("/x", { poId: 1, quality: 5 }), {
      params: Promise.resolve({ id: String(supplierB) }),
    });
    assert.equal(res.status, 404);
    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM supplier_ratings WHERE supplier_id = ?`,
      supplierB,
    );
    assert.equal(count?.n, 0, "không được ghi thêm đánh giá nào cho NCC tổ chức khác");
  },
);

test(
  "POST /api/suppliers/:id/ratings: NCC CÙNG tổ chức vẫn đánh giá được bình thường (đối chứng)",
  S,
  async () => {
    // Dùng org mặc định (1) cho cả user lẫn NCC — dự án tạo bằng taoDuAn() không gán
    // org_id nên chỉ khớp org của user khi user cũng ở org mặc định (getCurrentProjectId
    // đối chiếu project.org_id === user.orgId, xem lib/ha-tang/projects.ts).
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("rateorgok");
    const pmA = await taoUser("pm", "rateorgokA");
    const supplierA = await taoNCC("rateorgokA");
    const matId = await taoVatTu("rateorgok", projectId);
    const poId = await taoPO(pmA, projectId, matId, supplierA);
    await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
    await dangNhapDuAn(pmA, projectId);
    const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
    const res = await POST(jreq("/x", { poId, quality: 5 }), {
      params: Promise.resolve({ id: String(supplierA) }),
    });
    assert.equal(res.status, 201);
  },
);

test("POST /api/suppliers/:id/ratings: thiếu poId → 400", S, async () => {
  const projectId = await taoDuAn("ratenopo");
  const pm = await taoUser("pm", "ratenopo");
  const supplierId = await taoNCC("ratenopo");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { quality: 5 }), { params: Promise.resolve({ id: String(supplierId) }) });
  assert.equal(res.status, 400);
});

test("POST /api/suppliers/:id/ratings: PO không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("rateponf");
  const pm = await taoUser("pm", "rateponf");
  const supplierId = await taoNCC("rateponf");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { poId: 999999999, quality: 5 }), {
    params: Promise.resolve({ id: String(supplierId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/suppliers/:id/ratings: PO không thuộc NCC này → 400", S, async () => {
  const projectId = await taoDuAn("ratewrong");
  const pm = await taoUser("pm", "ratewrong");
  const supplierA = await taoNCC("ratewrongA");
  const supplierB = await taoNCC("ratewrongB");
  const matA = await taoVatTu("ratewrong", projectId);
  const poId = await taoPO(pm, projectId, matA, supplierA);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { poId, quality: 5 }), {
    params: Promise.resolve({ id: String(supplierB) }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/suppliers/:id/ratings: PO còn nháp (draft) → 409", S, async () => {
  const projectId = await taoDuAn("ratedraft");
  const pm = await taoUser("pm", "ratedraft");
  const supplierId = await taoNCC("ratedraft");
  const matId = await taoVatTu("ratedraft", projectId);
  const poId = await taoPO(pm, projectId, matId, supplierId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { poId, quality: 5 }), {
    params: Promise.resolve({ id: String(supplierId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/suppliers/:id/ratings: thiếu cả 3 tiêu chí (không sao nào) → 400", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("ratenocrit");
  const pm = await taoUser("pm", "ratenocrit");
  const supplierId = await taoNCC("ratenocrit");
  const matId = await taoVatTu("ratenocrit", projectId);
  const poId = await taoPO(pm, projectId, matId, supplierId);
  await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { poId }), { params: Promise.resolve({ id: String(supplierId) }) });
  assert.equal(res.status, 400);
});

test("POST /api/suppliers/:id/ratings: đánh giá thành công", S, async () => {
  const { run, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("rateok");
  const pm = await taoUser("pm", "rateok");
  const supplierId = await taoNCC("rateok");
  const matId = await taoVatTu("rateok", projectId);
  const poId = await taoPO(pm, projectId, matId, supplierId);
  await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const res = await POST(jreq("/x", { poId, quality: 5, delivery: 4, price: 3, note: "Tốt" }), {
    params: Promise.resolve({ id: String(supplierId) }),
  });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ quality: number; delivery: number; price: number }>(
    `SELECT quality, delivery, price FROM supplier_ratings WHERE id = ?`,
    id,
  );
  assert.equal(row?.quality, 5);
  assert.equal(row?.delivery, 4);
  assert.equal(row?.price, 3);
});

test("POST /api/suppliers/:id/ratings: PO đã được đánh giá rồi → 409 (1 đánh giá/PO)", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("ratetwice");
  const pm = await taoUser("pm", "ratetwice");
  const supplierId = await taoNCC("ratetwice");
  const matId = await taoVatTu("ratetwice", projectId);
  const poId = await taoPO(pm, projectId, matId, supplierId);
  await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
  const first = await POST(jreq("/x", { poId, quality: 5 }), {
    params: Promise.resolve({ id: String(supplierId) }),
  });
  assert.equal(first.status, 201);
  const second = await POST(jreq("/x", { poId, quality: 4 }), {
    params: Promise.resolve({ id: String(supplierId) }),
  });
  assert.equal(second.status, 409);
});

// ============================================================================
// GET /api/suppliers/:id/summary
// ============================================================================

test("GET /api/suppliers/:id/summary: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/suppliers/:id/summary: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("sumbad");
  const pm = await taoUser("pm", "sumbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/suppliers/:id/summary: NCC không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("sumnf");
  const pm = await taoUser("pm", "sumnf");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "999999999" }) });
  assert.equal(res.status, 404);
});

test(
  "GET /api/suppliers/:id/summary: NCC thuộc tổ chức KHÁC → 404, không lộ điểm/công nợ " +
    "(BUG THẬT đã vá cùng đợt này — cùng lớp lỗi org_id như POST ratings)",
  S,
  async () => {
    const orgA = await taoOrg("sumorgA");
    const orgB = await taoOrg("sumorgB");
    const projectId = await taoDuAn("sumorg");
    const pmA = await taoUser("pm", "sumorgA", orgA);
    const supplierB = await taoNCC("sumorgB", orgB);
    await dangNhapDuAn(pmA, projectId);
    const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(supplierB) }),
    });
    assert.equal(res.status, 404);
  },
);

test(
  "GET /api/suppliers/:id/summary: NCC CÙNG tổ chức vẫn xem được bình thường (đối chứng)",
  S,
  async () => {
    const orgA = await taoOrg("sumorgokA");
    const projectId = await taoDuAn("sumorgok");
    const pmA = await taoUser("pm", "sumorgokA", orgA);
    const supplierA = await taoNCC("sumorgokA", orgA);
    await dangNhapDuAn(pmA, projectId);
    const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(supplierA) }),
    });
    assert.equal(res.status, 200);
  },
);

test(
  "GET /api/suppliers/:id/summary: tổng hợp đúng điểm TB + tổng đã đặt hàng sau khi có đánh giá",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("sumok");
    const pm = await taoUser("pm", "sumok");
    const supplierId = await taoNCC("sumok");
    const matId = await taoVatTu("sumok", projectId);
    const poId = await taoPO(pm, projectId, matId, supplierId);
    await run(`UPDATE purchase_orders SET status = 'confirmed' WHERE id = ?`, poId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/suppliers/[id]/ratings/route");
    await POST(jreq("/x", { poId, quality: 5, delivery: 5, price: 5 }), {
      params: Promise.resolve({ id: String(supplierId) }),
    });

    const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(supplierId) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ratingsCount, 1);
    assert.equal(Number(body.avgQuality), 5);
    assert.equal(Number(body.totalOrdered), 10 * 100000);
  },
);
