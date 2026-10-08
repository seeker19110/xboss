import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S10 (phần 2) — ĐẦU VÀO tiền của các route còn lại, qua route handler THẬT:
// claims (+ settle), proposals, insurance-bonds, variations (VO), tender bids, BOQ, báo giá
// đấu thầu kỹ thuật. Bất biến mỗi nhóm: "1.500" → 400 `amount_locale_format` (trước đây
// `Number("1.500")` = 1,5 ghi thẳng DB, hoặc `|| 0` nuốt thành 0); vượt cột → 422
// `amount_overflow` (trước đây Postgres "numeric field overflow" → 500).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const TRAN = "1000000000000000"; // 10^15 > NUMERIC(15,2) (tối đa 13 chữ số nguyên)

const don: { projects: number[]; users: number[] } = { projects: [], users: [] };

async function dungAdmin() {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10b "));
  don.projects.push(projectId);
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10b Admin', ?, 'hash-test-s10b', 'admin', 1)`,
    `s10b-${uniq("ad")}@test.local`,
  );
  don.users.push(id);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
  return { id, projectId };
}

const jreq = (url: string, body: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const loi = async (r: Response) => (await r.json()) as { error?: string; code?: string };

async function kiemLoi(res: Response, status: number, code: string) {
  assert.equal(res.status, status);
  assert.equal((await loi(res)).code, code);
}

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    await run(
      `DELETE FROM tender_bid_prices WHERE bid_id IN (
         SELECT b.id FROM tender_bids b JOIN tender_packages t ON t.id = b.tender_id WHERE t.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM tender_bids WHERE tender_id IN (SELECT id FROM tender_packages WHERE project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM tender_items WHERE tender_id IN (SELECT id FROM tender_packages WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM tender_packages WHERE project_id = ?`, p);
    await run(`DELETE FROM claims WHERE project_id = ?`, p);
    await run(`DELETE FROM proposals WHERE project_id = ?`, p);
    await run(`DELETE FROM insurance_bonds WHERE project_id = ?`, p);
    await run(
      `DELETE FROM boq_items WHERE project_id = ? OR vo_id IN (SELECT id FROM variation_orders WHERE project_id = ?)`,
      p,
      p,
    );
    await run(`DELETE FROM variation_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

const claimCoBan = {
  kind: "cost",
  title: "Claim S10b",
  noticeDate: "2026-10-01",
  cause: "Nguyên nhân",
};

// ===== claims =====

test("POST /api/claims: '1.500' → 400; tràn → 422; chuỗi canonical ghi exact", S, async () => {
  const { projectId } = await dungAdmin();
  const { POST } = await import("@/app/api/claims/route");
  const { queryOne } = await import("@/lib/db");

  await kiemLoi(
    await POST(jreq("/api/claims", { ...claimCoBan, amountRequested: "1.500" })),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await POST(jreq("/api/claims", { ...claimCoBan, amountRequested: TRAN })),
    422,
    "amount_overflow",
  );
  const ok = await POST(jreq("/api/claims", { ...claimCoBan, amountRequested: "1234567.5" }));
  assert.equal(ok.status, 201);
  const row = await queryOne<{ t: string }>(
    `SELECT amount_requested::text AS t FROM claims WHERE project_id = ?`,
    projectId,
  );
  assert.equal(row?.t, "1234567.50");
});

test("POST /api/claims/:id/settle: '1.500' → 400; tràn → 422 (claim vẫn mở)", S, async () => {
  const { projectId } = await dungAdmin();
  const { insertId, queryOne } = await import("@/lib/db");
  const claimId = await insertId(
    `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, amount_requested, status)
     VALUES (?, ?, 'cost', 'Claim chốt', '2026-10-01', 'x', 100, 'negotiating')`,
    projectId,
    uniq("CLM-S10B-"),
  );
  const { POST } = await import("@/app/api/claims/[id]/settle/route");
  await kiemLoi(
    await POST(jreq("/x", { amountSettled: "1.500" }), ctx(claimId)),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await POST(jreq("/x", { amountSettled: TRAN }), ctx(claimId)),
    422,
    "amount_overflow",
  );
  const row = await queryOne<{ status: string }>(`SELECT status FROM claims WHERE id = ?`, claimId);
  assert.equal(row?.status, "negotiating");
  const ok = await POST(jreq("/x", { amountSettled: "90.25" }), ctx(claimId));
  assert.equal(ok.status, 200);
  const sau = await queryOne<{ t: string }>(
    `SELECT amount_settled::text AS t FROM claims WHERE id = ?`,
    claimId,
  );
  assert.equal(sau?.t, "90.25");
});

// ===== proposals =====

test("POST /api/proposals: amount '1.500' → 400; tràn → 422", S, async () => {
  const { projectId } = await dungAdmin();
  const { POST } = await import("@/app/api/proposals/route");
  const { queryOne } = await import("@/lib/db");
  const co = { kind: "payment", title: "Đề xuất S10b" };
  await kiemLoi(
    await POST(jreq("/api/proposals", { ...co, amount: "1.500" })),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await POST(jreq("/api/proposals", { ...co, amount: TRAN })),
    422,
    "amount_overflow",
  );
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM proposals WHERE project_id = ?`,
    projectId,
  );
  assert.equal(n?.n, 0);
  assert.equal((await POST(jreq("/api/proposals", { ...co, amount: "2500.5" }))).status, 201);
});

// ===== insurance-bonds =====

test("POST /api/insurance-bonds: value '1.500' → 400; tràn → 422", S, async () => {
  await dungAdmin();
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const co = { kind: "car", title: "BH S10b" };
  await kiemLoi(
    await POST(jreq("/api/insurance-bonds", { ...co, value: "1.500" })),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await POST(jreq("/api/insurance-bonds", { ...co, value: TRAN })),
    422,
    "amount_overflow",
  );
  assert.equal((await POST(jreq("/api/insurance-bonds", { ...co, value: "5000" }))).status, 201);
});

// ===== variations (VO) =====

test("POST /api/variations: unitPrice dòng '1.500' → 400; tràn → 422", S, async () => {
  const { projectId } = await dungAdmin();
  const { POST } = await import("@/app/api/variations/route");
  const { queryOne } = await import("@/lib/db");
  const dong = (unitPrice: unknown) => ({
    title: "VO S10b",
    reason: "design_change",
    lines: [{ code: uniq("VOL"), name: "Dòng", unit: "m", qty: 1, unitPrice }],
  });
  await kiemLoi(await POST(jreq("/api/variations", dong("1.500"))), 400, "amount_locale_format");
  await kiemLoi(await POST(jreq("/api/variations", dong(TRAN))), 422, "amount_overflow");
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM variation_orders WHERE project_id = ?`,
    projectId,
  );
  assert.equal(n?.n, 0);
  assert.equal((await POST(jreq("/api/variations", dong("750.5")))).status, 201);
});

// ===== tender bids =====

test("POST /api/tenders/:id/bids: unitPrice/lumpSum '1.500' → 400; tràn → 422", S, async () => {
  const { projectId } = await dungAdmin();
  const { insertId, queryOne, run } = await import("@/lib/db");
  const tenderId = await insertId(
    `INSERT INTO tender_packages (code, name, project_id) VALUES (?, 'Gói S10b', ?)`,
    uniq("GT-S10B-"),
    projectId,
  );
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, project_id) VALUES (?, 'D', 'm', 1, ?)`,
    uniq("S10B-B"),
    projectId,
  );
  await run(
    `INSERT INTO tender_items (tender_id, boq_item_id, qty) VALUES (?, ?, 1)`,
    tenderId,
    boqId,
  );
  const supplierId = await insertId(
    `INSERT INTO suppliers (name, org_id) VALUES (?, 1)`,
    uniq("NCC"),
  );
  const { POST } = await import("@/app/api/tenders/[id]/bids/route");
  const bid = (prices: unknown, lumpSum?: unknown) => ({ supplierId, lumpSum, prices });

  await kiemLoi(
    await POST(jreq("/x", bid([{ boqItemId: boqId, unitPrice: "1.500" }])), ctx(tenderId)),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await POST(jreq("/x", bid([{ boqItemId: boqId, unitPrice: TRAN }])), ctx(tenderId)),
    422,
    "amount_overflow",
  );
  await kiemLoi(
    await POST(jreq("/x", bid([], "1.500")), ctx(tenderId)),
    400,
    "amount_locale_format",
  );
  await kiemLoi(await POST(jreq("/x", bid([], TRAN)), ctx(tenderId)), 422, "amount_overflow");
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM tender_bids WHERE tender_id = ?`,
    tenderId,
  );
  assert.equal(n?.n, 0);
  const ok = await POST(
    jreq("/x", bid([{ boqItemId: boqId, unitPrice: "1234.5" }])),
    ctx(tenderId),
  );
  assert.equal(ok.status, 201);
  const gia = await queryOne<{ t: string }>(
    `SELECT unit_price::text AS t FROM tender_bid_prices WHERE boq_item_id = ?`,
    boqId,
  );
  assert.equal(gia?.t, "1234.50");
});

// ===== BOQ =====

test("POST /api/boq + PATCH /api/boq/:id: đơn giá '1.500' → 400; tràn → 422", S, async () => {
  const { projectId } = await dungAdmin();
  const { POST } = await import("@/app/api/boq/route");
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  const { queryOne } = await import("@/lib/db");
  const co = () => ({ code: uniq("S10B-Q"), name: "Dòng BOQ", unit: "m" });

  await kiemLoi(
    await POST(jreq("/api/boq", { ...co(), unitPrice: "1.500" })),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await POST(jreq("/api/boq", { ...co(), subUnitPrice: TRAN })),
    422,
    "amount_overflow",
  );
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM boq_items WHERE project_id = ?`,
    projectId,
  );
  assert.equal(n?.n, 0, "không ghi dòng BOQ nào");
  const ok = await POST(jreq("/api/boq", { ...co(), unitPrice: "2500.75" }));
  assert.equal(ok.status, 201);
  const { id } = (await ok.json()) as { id: number };

  await kiemLoi(
    await PATCH(jreq("/x", { unitPrice: "1.500" }, "PATCH"), ctx(id)),
    400,
    "amount_locale_format",
  );
  await kiemLoi(
    await PATCH(jreq("/x", { subUnitPrice: TRAN }, "PATCH"), ctx(id)),
    422,
    "amount_overflow",
  );
  const sau = await queryOne<{ t: string }>(
    `SELECT unit_price::text AS t FROM boq_items WHERE id = ?`,
    id,
  );
  assert.equal(sau?.t, "2500.75", "giá không đổi sau PATCH lỗi");
  assert.equal((await PATCH(jreq("/x", { unitPrice: "3000" }, "PATCH"), ctx(id))).status, 200);
});

// ===== báo giá đấu thầu kỹ thuật (BIGINT đồng) =====

test(
  "POST /api/engineering/bidding/quotes: '1.500' → 400; thập phân → 400; tràn → 422",
  S,
  async () => {
    const { projectId } = await dungAdmin();
    const { POST } = await import("@/app/api/engineering/bidding/quotes/route");
    const co = (totalAmountVnd: unknown) => ({
      projectId,
      packageId: "00000000-0000-0000-0000-000000000000",
      vendorName: "NCC S10b",
      totalAmountVnd,
      lineItems: [],
    });
    await kiemLoi(
      await POST(jreq("/api/engineering/bidding/quotes", co("1.500"))),
      400,
      "amount_locale_format",
    );
    await kiemLoi(
      await POST(jreq("/api/engineering/bidding/quotes", co("1500.5"))),
      400,
      "amount_scale",
    );
    await kiemLoi(
      await POST(jreq("/api/engineering/bidding/quotes", co("1000000000000000000"))),
      422,
      "amount_overflow",
    );
  },
);
