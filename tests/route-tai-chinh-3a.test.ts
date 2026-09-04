import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TÀI CHÍNH 3a: thanh toán · tạm ứng ·
// hoá đơn · lương · chi phí (vùng rủi ro cao — tiền thật, xem docs/audit.md) — cùng
// khuôn với tests/route-tai-chinh.test.ts / tests/route-to-chuc-thau-phu.test.ts. Route:
//   - app/api/advances/route.ts                      (GET/POST tạm ứng)
//   - app/api/advances/[id]/route.ts                 (GET/PATCH/DELETE 1 tạm ứng)
//   - app/api/cash-transactions/route.ts              (GET/POST sổ quỹ)
//   - app/api/cash-transactions/[id]/route.ts         (GET/PATCH/DELETE 1 giao dịch)
//   - app/api/invoices/route.ts                       (GET/POST hoá đơn VAT)
//   - app/api/invoices/[id]/route.ts                  (GET/PATCH/DELETE 1 hoá đơn — soft-delete)
//   - app/api/invoices/[id]/restore/route.ts          (POST khôi phục hoá đơn đã xoá)
//   - app/api/payments/route.ts                       (GET/PATCH giá trị HĐ theo tầng × hệ)
//   - app/api/payments/bills/route.ts                 (GET/POST mục thanh toán)
//   - app/api/payments/bills/[id]/route.ts            (PATCH/DELETE 1 mục thanh toán)
//   - app/api/payments/floors/route.ts                (GET tầng theo người phụ trách)
//   - app/api/payroll/route.ts                        (GET/POST kỳ lương)
//   - app/api/payroll/[id]/route.ts                   (GET/PATCH/DELETE 1 kỳ lương)
//   - app/api/payment-certs/[id]/submit/route.ts      (POST trình đợt IPC)
//   - app/api/payment-certs/[id]/decide/route.ts      (POST quyết định đợt IPC)
//   - app/api/costs/route.ts                          (GET bảng ngân sách/cam kết/thực chi)
//   - app/api/costs/settings/route.ts                 (GET/PATCH ngưỡng cảnh báo chi phí)
//   - app/api/finance/summary/route.ts                (GET tổng hợp dashboard tài chính)

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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TC3a route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  overrides: { orgId?: number } = {},
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tc3a-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tc3a-route', ?, ?)`,
    `TC3a ${ten}`,
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

async function taoHopDong(
  projectId: number,
  ten: string,
  overrides: { value?: number; advancePct?: number; retentionPct?: number } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', ?, 'CĐT test', ?, ?, ?, 'active', ?)`,
    `HD3A-${uniq(ten)}`,
    `Hợp đồng ${ten}`,
    overrides.value ?? 100000,
    overrides.advancePct ?? 0,
    overrides.retentionPct ?? 0,
    projectId,
  );
}

/** Chèn thẳng 1 đợt IPC (payment_certs) — POST /api/payment-certs đã có test riêng. */
async function taoDotIPC(
  contractId: number,
  ten: string,
  overrides: { periodNo?: number; status?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO payment_certs (code, contract_id, period_no, status)
     VALUES (?, ?, ?, ?)`,
    `IPC3A-${uniq(ten)}`,
    contractId,
    overrides.periodNo ?? 1,
    overrides.status ?? "draft",
  );
}

/** Dựng 1 tháp + sheet_type + work_package có floor_label — cho cụm payments/*. */
async function taoTangHe(
  projectId: number,
  ten: string,
  overrides: { responsible?: string; floorLabel?: string } = {},
): Promise<{ sheetTypeId: number; floorLabel: string }> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, responsible)
     VALUES (?, ?, ?, ?, ?)`,
    towerId,
    `ST-${uniq(ten)}`,
    `Sheet ${ten}`,
    `st-${uniq(ten)}`,
    overrides.responsible ?? "Nguyễn Văn Test",
  );
  const floorLabel = overrides.floorLabel ?? "T1";
  await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label)
     VALUES (?, ?, ?, ?)`,
    sheetTypeId,
    `WP-${uniq(ten)}`,
    `Nhóm ${ten}`,
    floorLabel,
  );
  return { sheetTypeId, floorLabel };
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET/POST /api/advances
// ============================================================================

test("GET /api/advances: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/advances/route");
  const res = await GET(jreq("/api/advances", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/advances: engineer không có quyền xem tạm ứng → 403", S, async () => {
  const projectId = await taoDuAn("adv-403");
  const eng = await taoUser("engineer", "adv-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/advances/route");
  const res = await GET(jreq("/api/advances", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/advances: status không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("adv-badstatus");
  const pm = await taoUser("pm", "adv-badstatus");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/advances/route");
  const res = await GET(jreq("/api/advances?status=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/advances: cách ly dự án — không thấy tạm ứng của dự án khác", S, async () => {
  const projectA = await taoDuAn("adv-isoA");
  const projectB = await taoDuAn("adv-isoB");
  const pmB = await taoUser("pm", "adv-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/advances/route");
  await POST(
    jreq("/api/advances", { amount: 1_000_000, recipient: "Anh B", advanceDate: "2026-09-01" }),
  );
  const pmA = await taoUser("pm", "adv-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/advances/route");
  const res = await GET(jreq("/api/advances", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).advances, []);
});

test("POST /api/advances: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/advances/route");
  const res = await POST(jreq("/api/advances", {}));
  assert.equal(res.status, 401);
});

test("POST /api/advances: bch xem được nhưng không được tạo (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("adv-bch403");
  const bch = await taoUser("bch", "adv-bch403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const res = await POST(
    jreq("/api/advances", { amount: 1000, recipient: "x", advanceDate: "2026-09-01" }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/advances: thiếu người nhận → 422", S, async () => {
  const projectId = await taoDuAn("adv-norecip");
  const pm = await taoUser("pm", "adv-norecip");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const res = await POST(jreq("/api/advances", { amount: 1000, advanceDate: "2026-09-01" }));
  assert.equal(res.status, 422);
});

test("POST /api/advances: số tiền ≤ 0 → 422", S, async () => {
  const projectId = await taoDuAn("adv-badamt");
  const pm = await taoUser("pm", "adv-badamt");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const res = await POST(
    jreq("/api/advances", { amount: 0, recipient: "Anh A", advanceDate: "2026-09-01" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/advances: thành công → project_id do SERVER suy, status mặc định 'open'", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("adv-ok");
  const pm = await taoUser("pm", "adv-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const res = await POST(
    jreq("/api/advances", {
      amount: 5_000_000,
      recipient: "Anh Ok",
      advanceDate: "2026-09-01",
      projectId: 999999,
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number; status: string }>(
    `SELECT project_id, status FROM advances WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
  assert.equal(row?.status, "open");
});

// ============================================================================
// GET/PATCH/DELETE /api/advances/:id
// ============================================================================

test("GET /api/advances/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/advances/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/advances/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("advid-bad");
  const pm = await taoUser("pm", "advid-bad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/advances/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/advances/:id: tạm ứng thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("advid-isoA");
  const projectB = await taoDuAn("advid-isoB");
  const pmB = await taoUser("pm", "advid-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/advances/route");
  const created = await POST(
    jreq("/api/advances", { amount: 1000, recipient: "B", advanceDate: "2026-09-01" }),
  );
  const { id: advId } = await created.json();

  const pmA = await taoUser("pm", "advid-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/advances/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(advId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/advances/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/advances/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/advances/:id: action=settle vượt quá số tiền còn lại → 422",
  S,
  async () => {
    const projectId = await taoDuAn("advid-settleover");
    const pm = await taoUser("pm", "advid-settleover");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/advances/route");
    const created = await POST(
      jreq("/api/advances", { amount: 1000, recipient: "x", advanceDate: "2026-09-01" }),
    );
    const { id: advId } = await created.json();

    const { PATCH } = await import("@/app/api/advances/[id]/route");
    const res = await PATCH(jreq("/x", { action: "settle", settleAmount: 2000 }, "PATCH"), {
      params: Promise.resolve({ id: String(advId) }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "PATCH /api/advances/:id: action=settle từng phần → status 'partially_settled', hoàn hết → 'settled', hoàn tiếp → 409",
  S,
  async () => {
    const projectId = await taoDuAn("advid-settleflow");
    const pm = await taoUser("pm", "advid-settleflow");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/advances/route");
    const created = await POST(
      jreq("/api/advances", { amount: 1000, recipient: "x", advanceDate: "2026-09-01" }),
    );
    const { id: advId } = await created.json();

    const { PATCH } = await import("@/app/api/advances/[id]/route");
    const partial = await PATCH(jreq("/x", { action: "settle", settleAmount: 400 }, "PATCH"), {
      params: Promise.resolve({ id: String(advId) }),
    });
    assert.equal(partial.status, 200);
    assert.equal((await partial.json()).status, "partially_settled");

    const full = await PATCH(jreq("/x", { action: "settle", settleAmount: 600 }, "PATCH"), {
      params: Promise.resolve({ id: String(advId) }),
    });
    assert.equal(full.status, 200);
    assert.equal((await full.json()).status, "settled");

    const again = await PATCH(jreq("/x", { action: "settle", settleAmount: 1 }, "PATCH"), {
      params: Promise.resolve({ id: String(advId) }),
    });
    assert.equal(again.status, 409);
  },
);

test("PATCH /api/advances/:id: sửa thông tin thường (không action) → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("advid-edit");
  const pm = await taoUser("pm", "advid-edit");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const created = await POST(
    jreq("/api/advances", { amount: 1000, recipient: "Cũ", advanceDate: "2026-09-01" }),
  );
  const { id: advId } = await created.json();

  const { PATCH } = await import("@/app/api/advances/[id]/route");
  const res = await PATCH(jreq("/x", { recipient: "Mới" }, "PATCH"), {
    params: Promise.resolve({ id: String(advId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ recipient: string }>(
    `SELECT recipient FROM advances WHERE id = ?`,
    advId,
  );
  assert.equal(row?.recipient, "Mới");
});

test("DELETE /api/advances/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/advances/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/advances/:id: đã hoàn ứng (status khác 'open') → 409", S, async () => {
  const projectId = await taoDuAn("advid-delused");
  const pm = await taoUser("pm", "advid-delused");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const created = await POST(
    jreq("/api/advances", { amount: 1000, recipient: "x", advanceDate: "2026-09-01" }),
  );
  const { id: advId } = await created.json();
  const { PATCH } = await import("@/app/api/advances/[id]/route");
  await PATCH(jreq("/x", { action: "settle", settleAmount: 500 }, "PATCH"), {
    params: Promise.resolve({ id: String(advId) }),
  });

  const { DELETE } = await import("@/app/api/advances/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(advId) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/advances/:id: 'open' → xoá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("advid-delok");
  const pm = await taoUser("pm", "advid-delok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/advances/route");
  const created = await POST(
    jreq("/api/advances", { amount: 1000, recipient: "x", advanceDate: "2026-09-01" }),
  );
  const { id: advId } = await created.json();

  const { DELETE } = await import("@/app/api/advances/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(advId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM advances WHERE id = ?`, advId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/cash-transactions
// ============================================================================

test("GET /api/cash-transactions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/cash-transactions/route");
  const res = await GET(jreq("/api/cash-transactions", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/cash-transactions: subcon không có quyền xem dòng tiền → 403", S, async () => {
  const projectId = await taoDuAn("ct-403");
  const sub = await taoUser("subcon", "ct-403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/cash-transactions/route");
  const res = await GET(jreq("/api/cash-transactions", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/cash-transactions: direction không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("ct-baddir");
  const pm = await taoUser("pm", "ct-baddir");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/cash-transactions/route");
  const res = await GET(jreq("/api/cash-transactions?direction=x", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/cash-transactions: cách ly dự án — không thấy giao dịch dự án khác", S, async () => {
  const projectA = await taoDuAn("ct-isoA");
  const projectB = await taoDuAn("ct-isoB");
  const pmB = await taoUser("pm", "ct-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/cash-transactions/route");
  await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const pmA = await taoUser("pm", "ct-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/cash-transactions/route");
  const res = await GET(jreq("/api/cash-transactions", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).transactions, []);
});

test("POST /api/cash-transactions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/cash-transactions/route");
  const res = await POST(jreq("/api/cash-transactions", {}));
  assert.equal(res.status, 401);
});

test("POST /api/cash-transactions: engineer không được ghi quỹ (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("ct-eng403");
  const eng = await taoUser("engineer", "ct-eng403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const res = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/cash-transactions: ngày sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("ct-badate");
  const pm = await taoUser("pm", "ct-badate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const res = await POST(
    jreq("/api/cash-transactions", {
      txDate: "khong-phai-ngay",
      direction: "in",
      amount: 1000,
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/cash-transactions: chiều giao dịch sai → 422", S, async () => {
  const projectId = await taoDuAn("ct-baddir2");
  const pm = await taoUser("pm", "ct-baddir2");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const res = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "sideways", amount: 1000 }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/cash-transactions: thành công → project_id do SERVER suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ct-ok");
  const pm = await taoUser("pm", "ct-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const res = await POST(
    jreq("/api/cash-transactions", {
      txDate: "2026-09-01",
      direction: "out",
      amount: 250_000,
      category: "vật tư",
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM cash_transactions WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/cash-transactions/:id
// ============================================================================

test("GET /api/cash-transactions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/cash-transactions/:id: giao dịch thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("ctid-isoA");
  const projectB = await taoDuAn("ctid-isoB");
  const pmB = await taoUser("pm", "ctid-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();

  const pmA = await taoUser("pm", "ctid-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(ctId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/cash-transactions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/cash-transactions/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("ctid-eng403");
  const eng = await taoUser("engineer", "ctid-eng403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/cash-transactions/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("ctid-bad");
  const pm = await taoUser("pm", "ctid-bad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/cash-transactions/:id: giao dịch thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("ctid-patchisoA");
  const projectB = await taoDuAn("ctid-patchisoB");
  const pmB = await taoUser("pm", "ctid-patchisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();

  const pmA = await taoUser("pm", "ctid-patchisoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(jreq("/x", { direction: "in" }, "PATCH"), {
    params: Promise.resolve({ id: String(ctId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/cash-transactions/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("ctid-badbody");
  const pm = await taoUser("pm", "ctid-badbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();
  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(
    new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }),
    { params: Promise.resolve({ id: String(ctId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/cash-transactions/:id: chiều giao dịch sai sau khi merge → 422", S, async () => {
  const projectId = await taoDuAn("ctid-badinput");
  const pm = await taoUser("pm", "ctid-badinput");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();
  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(jreq("/x", { direction: "sideways" }, "PATCH"), {
    params: Promise.resolve({ id: String(ctId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/cash-transactions/:id: sửa thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ctid-edit");
  const pm = await taoUser("pm", "ctid-edit");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();

  const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await PATCH(
    jreq("/x", { txDate: "2026-09-02", direction: "in", amount: 2000 }, "PATCH"),
    { params: Promise.resolve({ id: String(ctId) }) },
  );
  assert.equal(res.status, 200);
  const row = await queryOne<{ amount: number }>(
    `SELECT amount FROM cash_transactions WHERE id = ?`,
    ctId,
  );
  assert.equal(Number(row?.amount), 2000);
});

test("DELETE /api/cash-transactions/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/cash-transactions/:id: engineer không được xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("ctid-deleng403");
  const eng = await taoUser("engineer", "ctid-deleng403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/cash-transactions/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("ctid-delbad");
  const pm = await taoUser("pm", "ctid-delbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/cash-transactions/:id: giao dịch thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("ctid-delisoA");
  const projectB = await taoDuAn("ctid-delisoB");
  const pmB = await taoUser("pm", "ctid-delisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();

  const pmA = await taoUser("pm", "ctid-delisoA");
  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ctId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/cash-transactions/:id: xoá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ctid-del");
  const pm = await taoUser("pm", "ctid-del");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/cash-transactions/route");
  const created = await POST(
    jreq("/api/cash-transactions", { txDate: "2026-09-01", direction: "in", amount: 1000 }),
  );
  const { id: ctId } = await created.json();

  const { DELETE } = await import("@/app/api/cash-transactions/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ctId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM cash_transactions WHERE id = ?`, ctId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/invoices
// ============================================================================

test("GET /api/invoices: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/invoices/route");
  const res = await GET(jreq("/api/invoices", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/invoices: engineer không có quyền xem hoá đơn → 403", S, async () => {
  const projectId = await taoDuAn("inv-403");
  const eng = await taoUser("engineer", "inv-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/invoices/route");
  const res = await GET(jreq("/api/invoices", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/invoices: direction không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("inv-baddir");
  const pm = await taoUser("pm", "inv-baddir");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/invoices/route");
  const res = await GET(jreq("/api/invoices?direction=x", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/invoices: cách ly dự án — không thấy hoá đơn dự án khác", S, async () => {
  const projectA = await taoDuAn("inv-isoA");
  const projectB = await taoDuAn("inv-isoB");
  const pmB = await taoUser("pm", "inv-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/invoices/route");
  await POST(jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }));
  const pmA = await taoUser("pm", "inv-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/invoices/route");
  const res = await GET(jreq("/api/invoices", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).invoices, []);
});

test("GET /api/invoices: mặc định chỉ thấy hoá đơn còn sống, không thấy đã xoá mềm", S, async () => {
  const projectId = await taoDuAn("inv-nodel");
  const pm = await taoUser("pm", "inv-nodel");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(invId) }) });

  const { GET } = await import("@/app/api/invoices/route");
  const res = await GET(jreq("/api/invoices", undefined, "GET"));
  const { invoices } = await res.json();
  assert.ok(!invoices.some((i: { id: number }) => i.id === invId));
});

test("POST /api/invoices: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/invoices/route");
  const res = await POST(jreq("/api/invoices", {}));
  assert.equal(res.status, 401);
});

test("POST /api/invoices: chiều hoá đơn sai → 422", S, async () => {
  const projectId = await taoDuAn("inv-baddir2");
  const pm = await taoUser("pm", "inv-baddir2");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const res = await POST(
    jreq("/api/invoices", { direction: "sideways", netAmount: 1000, vatAmount: 100 }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/invoices: thuế suất VAT ngoài 0–100 → 422", S, async () => {
  const projectId = await taoDuAn("inv-badvat");
  const pm = await taoUser("pm", "inv-badvat");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const res = await POST(
    jreq("/api/invoices", {
      direction: "out",
      netAmount: 1000,
      vatAmount: 100,
      vatRate: 150,
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/invoices: thành công → project_id do SERVER suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("inv-ok");
  const pm = await taoUser("pm", "inv-ok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const res = await POST(
    jreq("/api/invoices", {
      direction: "out",
      netAmount: 10_000_000,
      vatAmount: 1_000_000,
      vatRate: 10,
      invoiceNo: `HD${uniq("inv")}`,
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM invoices WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/invoices/:id + POST /api/invoices/:id/restore
// ============================================================================

test("GET /api/invoices/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/invoices/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/invoices/:id: hoá đơn thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("invid-isoA");
  const projectB = await taoDuAn("invid-isoB");
  const pmB = await taoUser("pm", "invid-isoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();

  const pmA = await taoUser("pm", "invid-isoA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/invoices/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/invoices/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/invoices/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("invid-eng403");
  const eng = await taoUser("engineer", "invid-eng403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/invoices/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("invid-bad");
  const pm = await taoUser("pm", "invid-bad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/invoices/:id: hoá đơn thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("invid-patchisoA");
  const projectB = await taoDuAn("invid-patchisoB");
  const pmB = await taoUser("pm", "invid-patchisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();

  const pmA = await taoUser("pm", "invid-patchisoA");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(jreq("/x", { direction: "out" }, "PATCH"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/invoices/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("invid-badbody");
  const pm = await taoUser("pm", "invid-badbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(
    new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }),
    { params: Promise.resolve({ id: String(invId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/invoices/:id: chiều hoá đơn sai sau khi merge → 422", S, async () => {
  const projectId = await taoDuAn("invid-badinput");
  const pm = await taoUser("pm", "invid-badinput");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(jreq("/x", { direction: "sideways" }, "PATCH"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/invoices/:id: sửa thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("invid-edit");
  const pm = await taoUser("pm", "invid-edit");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();
  const { PATCH } = await import("@/app/api/invoices/[id]/route");
  const res = await PATCH(
    jreq("/x", { direction: "out", netAmount: 2000, vatAmount: 200 }, "PATCH"),
    { params: Promise.resolve({ id: String(invId) }) },
  );
  assert.equal(res.status, 200);
  const row = await queryOne<{ net_amount: number }>(
    `SELECT net_amount FROM invoices WHERE id = ?`,
    invId,
  );
  assert.equal(Number(row?.net_amount), 2000);
});

test("DELETE /api/invoices/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/invoices/:id: engineer không được xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("invid-deleng403");
  const eng = await taoUser("engineer", "invid-deleng403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/invoices/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("invid-delbad");
  const pm = await taoUser("pm", "invid-delbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/invoices/:id: hoá đơn thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("invid-delisoA");
  const projectB = await taoDuAn("invid-delisoB");
  const pmB = await taoUser("pm", "invid-delisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();

  const pmA = await taoUser("pm", "invid-delisoA");
  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/invoices/:id: xoá mềm — deleted_at được set, bản ghi vẫn còn trong DB", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("invid-del");
  const pm = await taoUser("pm", "invid-del");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();

  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM invoices WHERE id = ?`,
    invId,
  );
  assert.ok(row?.deleted_at != null);
});

test("POST /api/invoices/:id/restore: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/invoices/[id]/restore/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/invoices/:id/restore: PM (không phải Admin) → 403", S, async () => {
  const projectId = await taoDuAn("invid-restore403");
  const pm = await taoUser("pm", "invid-restore403");
  await dangNhapDuAn(pm, projectId);
  const { POST: restorePOST } = await import("@/app/api/invoices/[id]/restore/route");
  const res = await restorePOST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/invoices/:id/restore: hoá đơn chưa xoá → 404 (chỉ khôi phục bản đã xoá)", S, async () => {
  const projectId = await taoDuAn("invid-restorenodel");
  const pm = await taoUser("pm", "invid-restorenodel");
  const admin = await taoUser("admin", "invid-restorenodelA");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();

  await dangNhapDuAn(admin, projectId);
  const { POST: restorePOST } = await import("@/app/api/invoices/[id]/restore/route");
  const res = await restorePOST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/invoices/:id/restore: hoá đơn dự án khác đã xoá → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("invid-restoreisoA");
  const projectB = await taoDuAn("invid-restoreisoB");
  const pmB = await taoUser("pm", "invid-restoreisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(invId) }) });

  const adminA = await taoUser("admin", "invid-restoreisoA");
  await dangNhapDuAn(adminA, projectA);
  const { POST: restorePOST } = await import("@/app/api/invoices/[id]/restore/route");
  const res = await restorePOST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/invoices/:id/restore: Admin khôi phục hoá đơn đã xoá đúng dự án → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("invid-restoreok");
  const pm = await taoUser("pm", "invid-restoreok");
  const admin = await taoUser("admin", "invid-restoreokA");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/invoices/route");
  const created = await POST(
    jreq("/api/invoices", { direction: "out", netAmount: 1000, vatAmount: 100 }),
  );
  const { id: invId } = await created.json();
  const { DELETE } = await import("@/app/api/invoices/[id]/route");
  await DELETE(jreq("/x", undefined, "DELETE"), { params: Promise.resolve({ id: String(invId) }) });

  await dangNhapDuAn(admin, projectId);
  const { POST: restorePOST } = await import("@/app/api/invoices/[id]/restore/route");
  const res = await restorePOST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: String(invId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM invoices WHERE id = ?`,
    invId,
  );
  assert.equal(row?.deleted_at, null);
});

// ============================================================================
// GET/PATCH /api/payments (giá trị HĐ theo tầng × hệ)
// ============================================================================

test("GET /api/payments: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payments/route");
  const res = await GET(jreq("/api/payments", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/payments: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("pay-403");
  const sub = await taoUser("subcon", "pay-403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/payments/route");
  const res = await GET(jreq("/api/payments", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/payments: trả đúng tầng × hệ + giá trị HĐ theo dự án đang chọn", S, async () => {
  const projectId = await taoDuAn("pay-ok");
  const pm = await taoUser("pm", "pay-ok");
  const { sheetTypeId, floorLabel } = await taoTangHe(projectId, "payok");
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?)`,
    sheetTypeId,
    floorLabel,
    500_000,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payments/route");
  const res = await GET(jreq("/api/payments", undefined, "GET"));
  assert.equal(res.status, 200);
  const { rows } = await res.json();
  const row = rows.find((r: { sheetTypeId: number }) => r.sheetTypeId === sheetTypeId);
  assert.equal(Number(row?.contractValue), 500_000);
});

test("PATCH /api/payments: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/payments/route");
  const res = await PATCH(jreq("/api/payments", { updates: [] }));
  assert.equal(res.status, 401);
});

test("PATCH /api/payments: engineer không được sửa giá trị HĐ (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("pay-patch403");
  const eng = await taoUser("engineer", "pay-patch403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/payments/route");
  const res = await PATCH(jreq("/api/payments", { updates: [] }));
  assert.equal(res.status, 403);
});

test("PATCH /api/payments: upsert giá trị HĐ theo tầng × hệ thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pay-patchok");
  const pm = await taoUser("pm", "pay-patchok");
  const { sheetTypeId, floorLabel } = await taoTangHe(projectId, "paypatchok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payments/route");
  const res = await PATCH(
    jreq("/api/payments", { updates: [{ sheetTypeId, floorLabel, contractValue: 777_000 }] }),
  );
  assert.equal(res.status, 200);
  const row = await queryOne<{ contract_value: number }>(
    `SELECT contract_value FROM floor_contracts WHERE sheet_type_id = ? AND floor_label = ?`,
    sheetTypeId,
    floorLabel,
  );
  assert.equal(Number(row?.contract_value), 777_000);
});

// ============================================================================
// GET/POST /api/payments/bills
// ============================================================================

test("GET /api/payments/bills: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payments/bills/route");
  const res = await GET(jreq("/api/payments/bills", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/payments/bills: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("bill-403");
  const eng = await taoUser("engineer", "bill-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/payments/bills/route");
  const res = await GET(jreq("/api/payments/bills", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/payments/bills: trả đúng danh sách bill đã ghi (kèm dữ liệu tầng/hệ)", S, async () => {
  const projectId = await taoDuAn("bill-getok");
  const pm = await taoUser("pm", "bill-getok");
  const { sheetTypeId, floorLabel } = await taoTangHe(projectId, "billgetok");
  const { insertId } = await import("@/lib/db");
  const billId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
     VALUES ('Anh Get', 'advance', 5000, CURRENT_DATE, ?, ?, ?)`,
    sheetTypeId,
    floorLabel,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payments/bills/route");
  const res = await GET(jreq("/api/payments/bills", undefined, "GET"));
  assert.equal(res.status, 200);
  const { bills } = await res.json();
  const row = bills.find((b: { id: number }) => b.id === billId);
  assert.ok(row != null, "phải thấy bill vừa tạo");
  assert.equal(Number(row?.amount), 5000);
  assert.ok(row?.workPackageName?.startsWith("Nhóm"), "phải JOIN đúng tên work package theo tầng/hệ");
});

test("POST /api/payments/bills: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/payments/bills/route");
  const res = await POST(jreq("/api/payments/bills", {}));
  assert.equal(res.status, 401);
});

test("POST /api/payments/bills: thiếu người phụ trách → 400", S, async () => {
  const projectId = await taoDuAn("bill-norep");
  const pm = await taoUser("pm", "bill-norep");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payments/bills/route");
  const res = await POST(
    jreq("/api/payments/bills", { type: "advance", amount: 1000, paidDate: "2026-09-01" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/payments/bills: type=bill gắn tầng vượt quá 100% đã thanh toán → 400", S, async () => {
  const projectId = await taoDuAn("bill-over100");
  const pm = await taoUser("pm", "bill-over100");
  const { sheetTypeId, floorLabel } = await taoTangHe(projectId, "billover100");
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?)`,
    sheetTypeId,
    floorLabel,
    1_000_000,
  );
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payments/bills/route");
  const first = await POST(
    jreq("/api/payments/bills", {
      responsible: "Anh A",
      type: "bill",
      paidDate: "2026-09-01",
      sheetTypeId,
      floorLabel,
      pctThisPeriod: 0.7,
    }),
  );
  assert.equal(first.status, 200);
  const second = await POST(
    jreq("/api/payments/bills", {
      responsible: "Anh A",
      type: "bill",
      paidDate: "2026-09-02",
      sheetTypeId,
      floorLabel,
      pctThisPeriod: 0.5,
    }),
  );
  assert.equal(second.status, 400);
});

test("POST /api/payments/bills: type=bill tính amount = contractValue × pct, ghi project_id", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("bill-calc");
  const pm = await taoUser("pm", "bill-calc");
  const { sheetTypeId, floorLabel } = await taoTangHe(projectId, "billcalc");
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?)`,
    sheetTypeId,
    floorLabel,
    1_000_000,
  );
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payments/bills/route");
  const res = await POST(
    jreq("/api/payments/bills", {
      responsible: "Anh B",
      type: "bill",
      paidDate: "2026-09-01",
      sheetTypeId,
      floorLabel,
      pctThisPeriod: 0.3,
    }),
  );
  assert.equal(res.status, 200);
  const { id, amount } = await res.json();
  assert.equal(Number(amount), 300_000);
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM payment_bills WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// PATCH/DELETE /api/payments/bills/:id
// ============================================================================

test("PATCH /api/payments/bills/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/payments/bills/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("billid-eng403");
  const eng = await taoUser("engineer", "billid-eng403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/payments/bills/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("billid-bad");
  const pm = await taoUser("pm", "billid-bad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/payments/bills/:id: body không phải object → 400", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("billid-badbody");
  const pm = await taoUser("pm", "billid-badbody");
  const billId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Anh A', 'advance', 1000, CURRENT_DATE, ?)`,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(
    new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }),
    { params: Promise.resolve({ id: String(billId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/payments/bills/:id: bill thuộc dự án khác → 404 (cách ly)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("billid-isoA");
  const projectB = await taoDuAn("billid-isoB");
  const pmA = await taoUser("pm", "billid-isoA");
  const billBId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Anh B', 'advance', 1000, CURRENT_DATE, ?)`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(jreq("/x", { note: "x" }, "PATCH"), {
    params: Promise.resolve({ id: String(billBId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/payments/bills/:id: không có gì để sửa → 400", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("billid-nothing");
  const pm = await taoUser("pm", "billid-nothing");
  const billId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Anh A', 'advance', 1000, CURRENT_DATE, ?)`,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: String(billId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/payments/bills/:id: sửa ghi chú/khối lượng thành công", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("billid-edit");
  const pm = await taoUser("pm", "billid-edit");
  const billId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Anh A', 'advance', 1000, CURRENT_DATE, ?)`,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
  const res = await PATCH(jreq("/x", { note: "Ghi chú mới", quantity: 5 }, "PATCH"), {
    params: Promise.resolve({ id: String(billId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ note: string; quantity: number }>(
    `SELECT note, quantity FROM payment_bills WHERE id = ?`,
    billId,
  );
  assert.equal(row?.note, "Ghi chú mới");
  assert.equal(Number(row?.quantity), 5);
});

test("DELETE /api/payments/bills/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/payments/bills/:id: engineer không được xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("billid-deleng403");
  const eng = await taoUser("engineer", "billid-deleng403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/payments/bills/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("billid-delbad");
  const pm = await taoUser("pm", "billid-delbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/payments/bills/:id: bill thuộc dự án khác → 404 (cách ly)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("billid-delisoA");
  const projectB = await taoDuAn("billid-delisoB");
  const pmA = await taoUser("pm", "billid-delisoA");
  const billBId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Anh B', 'advance', 1000, CURRENT_DATE, ?)`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(billBId) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/payments/bills/:id: xoá thành công", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("billid-del");
  const pm = await taoUser("pm", "billid-del");
  const billId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Anh A', 'advance', 1000, CURRENT_DATE, ?)`,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(billId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM payment_bills WHERE id = ?`, billId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET /api/payments/floors
// ============================================================================

test("GET /api/payments/floors: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payments/floors/route");
  const res = await GET(jreq("/api/payments/floors?person=x", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/payments/floors: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("floors-403");
  const eng = await taoUser("engineer", "floors-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/payments/floors/route");
  const res = await GET(jreq("/api/payments/floors?person=x", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/payments/floors: thiếu person → trả rỗng", S, async () => {
  const projectId = await taoDuAn("floors-noperson");
  const pm = await taoUser("pm", "floors-noperson");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payments/floors/route");
  const res = await GET(jreq("/api/payments/floors", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).floors, []);
});

test("GET /api/payments/floors: trả tầng × hệ kèm lịch sử thanh toán của người phụ trách", S, async () => {
  const projectId = await taoDuAn("floors-ok");
  const pm = await taoUser("pm", "floors-ok");
  const responsible = `Người ${uniq("floorsok")}`;
  const { sheetTypeId, floorLabel } = await taoTangHe(projectId, "floorsok", { responsible });
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?)`,
    sheetTypeId,
    floorLabel,
    1_000_000,
  );
  await run(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, pct_this_period, project_id)
     VALUES (?, 'bill', 300000, CURRENT_DATE, ?, ?, 0.3, ?)`,
    responsible,
    sheetTypeId,
    floorLabel,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payments/floors/route");
  const res = await GET(
    jreq(`/api/payments/floors?person=${encodeURIComponent(responsible)}`, undefined, "GET"),
  );
  assert.equal(res.status, 200);
  const { floors } = await res.json();
  assert.equal(floors.length, 1);
  assert.equal(floors[0].history.length, 1);
  assert.equal(floors[0].pctPaid, 0.3);
});

// ============================================================================
// GET/POST /api/payroll
// ============================================================================

test("GET /api/payroll: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payroll/route");
  const res = await GET(jreq("/api/payroll", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/payroll: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("pr-403");
  const eng = await taoUser("engineer", "pr-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/payroll/route");
  const res = await GET(jreq("/api/payroll", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/payroll: kỳ lương không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("pr-badperiod");
  const pm = await taoUser("pm", "pr-badperiod");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payroll/route");
  const res = await GET(jreq("/api/payroll?period=khong-hop-le", undefined, "GET"));
  assert.equal(res.status, 422);
});

test(
  "GET /api/payroll: bch xem được trang lương nhưng SỐ TIỀN bị che (viewPayroll loại bch)",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("pr-mask");
    const bch = await taoUser("bch", "pr-mask");
    const period = "2026-09";
    await insertId(
      `INSERT INTO payroll (project_id, period, workdays, rate, gross, deductions, net, status)
       VALUES (?, ?, 20, 300000, 6000000, 100000, 5900000, 'draft')`,
      projectId,
      period,
    );
    await dangNhapDuAn(bch, projectId);
    const { GET } = await import("@/app/api/payroll/route");
    const res = await GET(jreq(`/api/payroll?period=${period}`, undefined, "GET"));
    assert.equal(res.status, 200);
    const { payroll } = await res.json();
    assert.equal(payroll.length, 1);
    assert.equal(payroll[0].rate, null);
    assert.equal(payroll[0].gross, null);
    assert.equal(payroll[0].net, null);
  },
);

test("GET /api/payroll: PM xem đầy đủ số tiền lương (không bị che)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("pr-nomask");
  const pm = await taoUser("pm", "pr-nomask");
  const period = "2026-09";
  await insertId(
    `INSERT INTO payroll (project_id, period, workdays, rate, gross, deductions, net, status)
     VALUES (?, ?, 20, 300000, 6000000, 100000, 5900000, 'draft')`,
    projectId,
    period,
  );
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payroll/route");
  const res = await GET(jreq(`/api/payroll?period=${period}`, undefined, "GET"));
  const { payroll } = await res.json();
  assert.equal(Number(payroll[0].net), 5900000);
});

test("POST /api/payroll: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(jreq("/api/payroll", {}));
  assert.equal(res.status, 401);
});

test("POST /api/payroll: engineer không được tạo kỳ lương (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("pr-eng403");
  const eng = await taoUser("engineer", "pr-eng403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(jreq("/api/payroll", { period: "2026-09", personnelId: 1 }));
  assert.equal(res.status, 403);
});

test("POST /api/payroll: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("pr-badbody");
  const pm = await taoUser("pm", "pr-badbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(
    new NextRequest("http://localhost/api/payroll", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/payroll: tổ đội không tồn tại trong dự án → 422", S, async () => {
  const projectId = await taoDuAn("pr-badcrew");
  const pm = await taoUser("pm", "pr-badcrew");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(jreq("/api/payroll", { period: "2026-09", crewId: 999999999 }));
  assert.equal(res.status, 422);
});

test("POST /api/payroll: kỳ lương sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("pr-badformat");
  const pm = await taoUser("pm", "pr-badformat");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(jreq("/api/payroll", { period: "2026", personnelId: 1 }));
  assert.equal(res.status, 422);
});

test("POST /api/payroll: không gắn tổ đội lẫn nhân sự → 422", S, async () => {
  const projectId = await taoDuAn("pr-nolink");
  const pm = await taoUser("pm", "pr-nolink");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(jreq("/api/payroll", { period: "2026-09" }));
  assert.equal(res.status, 422);
});

test("POST /api/payroll: chưa có dự án nào để tạo kỳ lương → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("pr-noproj");
  const pm = await taoUser("pm", "pr-noproj");
  const other = await taoUser("pm", "pr-noprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/payroll/route");
    const res = await POST(jreq("/api/payroll", { period: "2026-09", personnelId: 1 }));
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/payroll: nhân sự không tồn tại trong dự án → 422", S, async () => {
  const projectId = await taoDuAn("pr-badpers");
  const pm = await taoUser("pm", "pr-badpers");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(jreq("/api/payroll", { period: "2026-09", personnelId: 999999999 }));
  assert.equal(res.status, 422);
});

test("POST /api/payroll: thành công gắn nhân sự trong dự án → project_id do SERVER suy", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pr-ok");
  const pm = await taoUser("pm", "pr-ok");
  const personnelId = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NV ${uniq("prok")}`,
  );
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payroll/route");
  const res = await POST(
    jreq("/api/payroll", {
      period: "2026-09",
      personnelId,
      workdays: 22,
      rate: 300000,
      gross: 6_600_000,
      net: 6_600_000,
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM payroll WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/payroll/:id
// ============================================================================

test("GET /api/payroll/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payroll/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/payroll/:id: kỳ lương thuộc dự án khác → 404 (cách ly)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("prid-isoA");
  const projectB = await taoDuAn("prid-isoB");
  const pmA = await taoUser("pm", "prid-isoA");
  const prB = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id) VALUES (?, '2026-09', NULL)`,
    projectB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/payroll/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(prB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/payroll/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/payroll/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("prid-eng403");
  const eng = await taoUser("engineer", "prid-eng403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/payroll/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("prid-bad");
  const pm = await taoUser("pm", "prid-bad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/payroll/:id: kỳ lương thuộc dự án khác → 404 (cách ly)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("prid-patchisoA");
  const projectB = await taoDuAn("prid-patchisoB");
  const pmA = await taoUser("pm", "prid-patchisoA");
  const personnelB = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectB,
    `NV ${uniq("pridpatchisoB")}`,
  );
  const prB = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id) VALUES (?, '2026-09', ?)`,
    projectB,
    personnelB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
    params: Promise.resolve({ id: String(prB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/payroll/:id: body không phải object → 400", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("prid-badbody");
  const pm = await taoUser("pm", "prid-badbody");
  const personnelId = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NV ${uniq("pridbadbody")}`,
  );
  const prId = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id) VALUES (?, '2026-09', ?)`,
    projectId,
    personnelId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(
    new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }),
    { params: Promise.resolve({ id: String(prId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/payroll/:id: đổi sang tổ đội không tồn tại trong dự án → 422", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("prid-badcrew");
  const pm = await taoUser("pm", "prid-badcrew");
  const personnelId = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NV ${uniq("pridbadcrew")}`,
  );
  const prId = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id) VALUES (?, '2026-09', ?)`,
    projectId,
    personnelId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(jreq("/x", { crewId: 999999999, personnelId: null }, "PATCH"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/payroll/:id: PATCH giữ nguyên kỳ lương không gắn crew/personnel → 422 (bất biến payroll)",
  S,
  async () => {
    // Kỳ lương cũ (loadExisting) không gắn crew/personnel → merge với body PATCH vẫn
    // thiếu cả hai → validatePayrollInput chặn, đúng bất biến "phải gắn tổ đội/nhân sự".
    const { queryOne, insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("prid-status");
    const pm = await taoUser("pm", "prid-status");
    const prId = await insertId(
      `INSERT INTO payroll (project_id, period, personnel_id, status) VALUES (?, '2026-09', NULL, 'draft')`,
      projectId,
    );
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/payroll/[id]/route");
    const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
      params: Promise.resolve({ id: String(prId) }),
    });
    assert.equal(res.status, 422);
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM payroll WHERE id = ?`,
      prId,
    );
    assert.equal(row?.status, "draft");
  },
);

test("PATCH /api/payroll/:id: đổi trạng thái draft → approved thành công", S, async () => {
  const { queryOne, insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("prid-statusok");
  const pm = await taoUser("pm", "prid-statusok");
  const personnelId = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NV ${uniq("pridstatusok")}`,
  );
  const prId = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id, status) VALUES (?, '2026-09', ?, 'draft')`,
    projectId,
    personnelId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payroll/[id]/route");
  const res = await PATCH(jreq("/x", { status: "approved" }, "PATCH"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(`SELECT status FROM payroll WHERE id = ?`, prId);
  assert.equal(row?.status, "approved");
});

test("DELETE /api/payroll/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/payroll/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/payroll/:id: engineer không được xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("prid-deleng403");
  const eng = await taoUser("engineer", "prid-deleng403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/payroll/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/payroll/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("prid-delbad");
  const pm = await taoUser("pm", "prid-delbad");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/payroll/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/payroll/:id: kỳ lương thuộc dự án khác → 404 (cách ly)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectA = await taoDuAn("prid-delisoA");
  const projectB = await taoDuAn("prid-delisoB");
  const pmA = await taoUser("pm", "prid-delisoA");
  const personnelB = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectB,
    `NV ${uniq("pridelisoB")}`,
  );
  const prB = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id) VALUES (?, '2026-09', ?)`,
    projectB,
    personnelB,
  );
  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/payroll/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(prB) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/payroll/:id: kỳ lương đã 'paid' → 409 (giữ dấu vết)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await taoDuAn("prid-delpaid");
  const pm = await taoUser("pm", "prid-delpaid");
  const personnelId = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NV ${uniq("pridelpaid")}`,
  );
  const prId = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id, status) VALUES (?, '2026-09', ?, 'paid')`,
    projectId,
    personnelId,
  );
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/payroll/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/payroll/:id: kỳ lương 'draft' → xoá thành công", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("prid-deldraft");
  const pm = await taoUser("pm", "prid-deldraft");
  const personnelId = await insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `NV ${uniq("prideldraft")}`,
  );
  const prId = await insertId(
    `INSERT INTO payroll (project_id, period, personnel_id, status) VALUES (?, '2026-09', ?, 'draft')`,
    projectId,
    personnelId,
  );
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/payroll/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(prId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM payroll WHERE id = ?`, prId);
  assert.equal(row, undefined);
});

// ============================================================================
// POST /api/payment-certs/:id/submit
// ============================================================================

test("POST /api/payment-certs/:id/submit: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  const res = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("POST /api/payment-certs/:id/submit: engineer không được trình (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("submit-403");
  const eng = await taoUser("engineer", "submit-403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  const res = await POST(jreq("/x", undefined, "POST"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("POST /api/payment-certs/:id/submit: đợt thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("submit-isoA");
  const projectB = await taoDuAn("submit-isoB");
  const pmA = await taoUser("pm", "submit-isoA");
  const contractB = await taoHopDong(projectB, "submitisoB");
  const certB = await taoDotIPC(contractB, "submitisoB");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: String(certB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/payment-certs/:id/submit: đợt không ở trạng thái 'draft' → 409", S, async () => {
  const projectId = await taoDuAn("submit-notdraft");
  const pm = await taoUser("pm", "submit-notdraft");
  const contractId = await taoHopDong(projectId, "submitnotdraft");
  const certId = await taoDotIPC(contractId, "submitnotdraft", { status: "submitted" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 409);
});

test("POST /api/payment-certs/:id/submit: draft → submitted thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("submit-ok");
  const pm = await taoUser("pm", "submit-ok");
  const contractId = await taoHopDong(projectId, "submitok");
  const certId = await taoDotIPC(contractId, "submitok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM payment_certs WHERE id = ?`,
    certId,
  );
  assert.equal(row?.status, "submitted");
});

// ============================================================================
// POST /api/payment-certs/:id/decide
// ============================================================================

test("POST /api/payment-certs/:id/decide: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/payment-certs/:id/decide: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("decide-baddec");
  const pm = await taoUser("pm", "decide-baddec");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "x" }, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/payment-certs/:id/decide: reject thiếu lý do → 422", S, async () => {
  const projectId = await taoDuAn("decide-noreason");
  const pm = await taoUser("pm", "decide-noreason");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "rejected" }, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/payment-certs/:id/decide: engineer không được duyệt (không có flow SoD) → 403", S, async () => {
  const projectId = await taoDuAn("decide-403");
  const eng = await taoUser("engineer", "decide-403");
  const contractId = await taoHopDong(projectId, "decide403");
  const certId = await taoDotIPC(contractId, "decide403", { status: "submitted" });
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }, "POST"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/payment-certs/:id/decide: đợt thuộc dự án khác → 404 (cách ly)", S, async () => {
  const projectA = await taoDuAn("decide-isoA");
  const projectB = await taoDuAn("decide-isoB");
  const pmA = await taoUser("pm", "decide-isoA");
  const contractB = await taoHopDong(projectB, "decideisoB");
  const certB = await taoDotIPC(contractB, "decideisoB", { status: "submitted" });
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }, "POST"), {
    params: Promise.resolve({ id: String(certB) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/payment-certs/:id/decide: đợt chưa trình (không ở trạng thái 'submitted') → 409", S, async () => {
  const projectId = await taoDuAn("decide-notsub");
  const pm = await taoUser("pm", "decide-notsub");
  const contractId = await taoHopDong(projectId, "decidenotsub");
  const certId = await taoDotIPC(contractId, "decidenotsub", { status: "draft" });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }, "POST"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 409);
});

test(
  "POST /api/payment-certs/:id/decide: reject thành công → status 'rejected', KHÔNG sinh payment_bills",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("decide-reject");
    const pm = await taoUser("pm", "decide-reject");
    const contractId = await taoHopDong(projectId, "decidereject");
    const certId = await taoDotIPC(contractId, "decidereject", { status: "submitted" });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
    const res = await POST(
      jreq("/x", { decision: "rejected", rejectReason: "Thiếu hồ sơ" }, "POST"),
      { params: Promise.resolve({ id: String(certId) }) },
    );
    assert.equal(res.status, 200);
    const cert = await queryOne<{ status: string }>(
      `SELECT status FROM payment_certs WHERE id = ?`,
      certId,
    );
    assert.equal(cert?.status, "rejected");
    const bill = await queryOne(`SELECT id FROM payment_bills WHERE payment_cert_id = ?`, certId);
    assert.equal(bill, undefined);
  },
);

test(
  "POST /api/payment-certs/:id/decide: approve thành công → status 'approved', sinh đúng 1 payment_bills",
  S,
  async () => {
    const { queryOne, run, insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("decide-approve");
    const pm = await taoUser("pm", "decide-approve");
    const contractId = await taoHopDong(projectId, "decideapprove", {
      value: 100_000,
      advancePct: 10,
      retentionPct: 5,
    });
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
       VALUES (?, 'Dòng', 'm', 100, 1000, ?)`,
      `BOQ3A-${uniq("decideapprove")}`,
      contractId,
    );
    const certId = await taoDotIPC(contractId, "decideapprove", { status: "submitted" });
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, 10, 10, 1000)`,
      certId,
      boqId,
    );
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "approved" }, "POST"), {
      params: Promise.resolve({ id: String(certId) }),
    });
    assert.equal(res.status, 200);
    const cert = await queryOne<{ status: string }>(
      `SELECT status FROM payment_certs WHERE id = ?`,
      certId,
    );
    assert.equal(cert?.status, "approved");
    const bill = await queryOne<{ amount: number; project_id: number }>(
      `SELECT amount, project_id FROM payment_bills WHERE payment_cert_id = ?`,
      certId,
    );
    // periodValue = 10*1000 = 10,000; advance 10% = 1,000; retention 5% = 500.
    assert.equal(Number(bill?.amount), 10_000 - 1_000 - 500);
    assert.equal(bill?.project_id, projectId);
  },
);

test("POST /api/payment-certs/:id/decide: quyết định lại đợt đã 'approved' → 409, không ghi đè", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await taoDuAn("decide-twice");
  const pm = await taoUser("pm", "decide-twice");
  const contractId = await taoHopDong(projectId, "decidetwice");
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
     VALUES (?, 'Dòng', 'm', 100, 1000, ?)`,
    `BOQ3A-${uniq("decidetwice")}`,
    contractId,
  );
  const certId = await taoDotIPC(contractId, "decidetwice", { status: "submitted" });
  await run(
    `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
     VALUES (?, ?, 10, 10, 1000)`,
    certId,
    boqId,
  );
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  const first = await POST(jreq("/x", { decision: "approved" }, "POST"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(first.status, 200);
  const second = await POST(jreq("/x", { decision: "approved" }, "POST"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(second.status, 409);
  const { queryOne } = await import("@/lib/db");
  const bills = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM payment_bills WHERE payment_cert_id = ?`,
    certId,
  );
  assert.equal(bills?.count, 1);
});

// ============================================================================
// GET /api/costs
// ============================================================================

test("GET /api/costs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(jreq("/api/costs", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/costs: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("costs-403");
  const sub = await taoUser("subcon", "costs-403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(jreq("/api/costs", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/costs: bch xem được (viewPayments gồm bch) → 200, trả đủ trường", S, async () => {
  const projectId = await taoDuAn("costs-ok");
  const bch = await taoUser("bch", "costs-ok");
  await dangNhapDuAn(bch, projectId);
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(jreq("/api/costs", undefined, "GET"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.rows));
  assert.ok(body.totals);
  assert.ok(body.settings);
  assert.equal(body.groupBy, "system");
});

test("GET /api/costs: groupBy=floor trả nhóm theo tầng", S, async () => {
  const projectId = await taoDuAn("costs-floor");
  const pm = await taoUser("pm", "costs-floor");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(jreq("/api/costs?groupBy=floor", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).groupBy, "floor");
});

// ============================================================================
// GET/PATCH /api/costs/settings
// ============================================================================

test("GET /api/costs/settings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/costs/settings/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/costs/settings: subcon không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("costset-403");
  const sub = await taoUser("subcon", "costset-403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/costs/settings/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/costs/settings: trả ngưỡng mặc định khi chưa cấu hình", S, async () => {
  const projectId = await taoDuAn("costset-default");
  const pm = await taoUser("pm", "costset-default");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/costs/settings/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.warnPct, "number");
  assert.equal(typeof body.overPct, "number");
});

test("PATCH /api/costs/settings: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/costs/settings/route");
  const res = await PATCH(jreq("/api/costs/settings", { warnPct: 90, overPct: 100 }));
  assert.equal(res.status, 401);
});

test("PATCH /api/costs/settings: bch không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("costset-403b");
  const bch = await taoUser("bch", "costset-403b");
  await dangNhapDuAn(bch, projectId);
  const { PATCH } = await import("@/app/api/costs/settings/route");
  const res = await PATCH(jreq("/api/costs/settings", { warnPct: 90, overPct: 100 }));
  assert.equal(res.status, 403);
});

test("PATCH /api/costs/settings: ngưỡng vượt (overPct) nhỏ hơn cảnh báo (warnPct) → 422", S, async () => {
  const projectId = await taoDuAn("costset-badrange");
  const pm = await taoUser("pm", "costset-badrange");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/costs/settings/route");
  const res = await PATCH(jreq("/api/costs/settings", { warnPct: 90, overPct: 50 }));
  assert.equal(res.status, 422);
});

test("PATCH /api/costs/settings: cập nhật thành công", S, async () => {
  const projectId = await taoDuAn("costset-ok");
  const pm = await taoUser("pm", "costset-ok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/costs/settings/route");
  const res = await PATCH(jreq("/api/costs/settings", { warnPct: 85, overPct: 105 }));
  assert.equal(res.status, 200);
  const { GET } = await import("@/app/api/costs/settings/route");
  const check = await GET();
  const body = await check.json();
  assert.equal(body.warnPct, 85);
  assert.equal(body.overPct, 105);
});

// ============================================================================
// GET /api/finance/summary
// ============================================================================

test("GET /api/finance/summary: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/finance/summary/route");
  const res = await GET(jreq("/api/finance/summary", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/finance/summary: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("fsum-403");
  const eng = await taoUser("engineer", "fsum-403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/finance/summary/route");
  const res = await GET(jreq("/api/finance/summary", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/finance/summary: kỳ không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("fsum-badperiod");
  const pm = await taoUser("pm", "fsum-badperiod");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/finance/summary/route");
  const res = await GET(jreq("/api/finance/summary?period=abc", undefined, "GET"));
  assert.equal(res.status, 422);
});

test(
  "GET /api/finance/summary: gộp đúng công nợ/tạm ứng/VAT theo dự án đang chọn (cách ly dự án khác)",
  S,
  async () => {
    const projectA = await taoDuAn("fsum-isoA");
    const projectB = await taoDuAn("fsum-isoB");
    const pmB = await taoUser("pm", "fsum-isoB");
    // Hợp đồng nhận thầu ở dự án B: 200,000, chưa thanh toán → receivables(B) = 200,000.
    await taoHopDong(projectB, "fsumisoB", { value: 200_000 });
    const { insertId } = await import("@/lib/db");
    await insertId(
      `INSERT INTO advances (project_id, amount, recipient, status) VALUES (?, ?, 'x', 'open')`,
      projectB,
      50_000,
    );

    const pmA = await taoUser("pm", "fsum-isoA");
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/finance/summary/route");
    const resA = await GET(jreq("/api/finance/summary", undefined, "GET"));
    const bodyA = await resA.json();
    assert.equal(bodyA.receivables, 0);
    assert.equal(bodyA.advanceOutstanding, 0);

    await dangNhapDuAn(pmB, projectB);
    const resB = await GET(jreq("/api/finance/summary", undefined, "GET"));
    const bodyB = await resB.json();
    assert.equal(bodyB.receivables, 200_000);
    assert.equal(bodyB.advanceOutstanding, 50_000);
  },
);
