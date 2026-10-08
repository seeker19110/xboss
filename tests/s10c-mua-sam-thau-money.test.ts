import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S10c — tiền exact cho công nợ NCC (/api/suppliers/:id/summary), so sánh/trao
// thầu (/api/tenders/:id, /award) và công nợ nhà thầu phụ (/api/subcontractors[/:id]) — A3-AC01/
// AC05, Q-AC04. Mỗi ca: giá trị ≥ 10^13 đồng có xu lẻ → v1 chuỗi canonical không lệch xu; legacy
// ngoài biên → 422; legacy trong biên vẫn number; khối tiền bị che giữ null. Route handler thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
const MAX_DONG = "9999999999999.99"; // trần NUMERIC(15,2)

const don: { projects: number[]; users: number[]; suppliers: number[]; systems: number[] } = {
  projects: [],
  users: [],
  suppliers: [],
  systems: [],
};

async function dungDuAn() {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10c MS "));
  don.projects.push(projectId);
  return projectId;
}

async function dangNhapVaiTro(role: string, projectId: number) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10c user', ?, 'hash-test-s10c', ?, 1)`,
    `s10c-${uniq(role)}@test.local`,
    role,
  );
  don.users.push(id);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
  return id;
}

async function taoNcc() {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO suppliers (name, org_id) VALUES (?, 1)`,
    uniq("NCC S10c "),
  );
  don.suppliers.push(id);
  return id;
}

const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const req = (url: string, headers?: Record<string, string>, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    await run(`DELETE FROM tender_packages WHERE project_id = ?`, p); // cascade items/bids/prices
    await run(
      `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM purchase_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM payment_bills WHERE project_id = ?`, p);
    await run(`DELETE FROM contracts WHERE project_id = ?`, p);
    await run(`DELETE FROM boq_items WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
  }
  for (const s of don.suppliers) {
    await run(`DELETE FROM contracts WHERE party_supplier_id = ?`, s);
    await run(`DELETE FROM system_contractors WHERE supplier_id = ?`, s);
    await run(`DELETE FROM suppliers WHERE id = ?`, s);
  }
  for (const s of don.systems) await run(`DELETE FROM systems WHERE id = ?`, s);
  for (const p of don.projects) await run(`DELETE FROM projects WHERE id = ?`, p);
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

// ===== Công nợ NCC =====

test(
  "suppliers/:id/summary: PO qty float8 lớn → công nợ exact (v1), legacy 422, bị che giữ null",
  S,
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { GET } = await import("@/app/api/suppliers/[id]/summary/route");
    const projectId = await dungDuAn();
    const supplierId = await taoNcc();
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, supplier_id, status, project_id) VALUES (?, ?, 'sent', ?)`,
      uniq("PO-S10c-"),
      supplierId,
      projectId,
    );
    for (const [qty, gia] of [
      [1000, MAX_DONG],
      [1000, MAX_DONG],
      [1, "0.01"],
    ] as const)
      await run(
        `INSERT INTO po_items (po_id, qty_ordered, unit_price) VALUES (?, ?, ?::numeric)`,
        poId,
        qty,
        gia,
      );
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, responsible_supplier_id, project_id)
     VALUES ('NCC', 'bill', 0.01, CURRENT_DATE, ?, ?)`,
      supplierId,
      projectId,
    );

    await dangNhapVaiTro("pm", projectId);
    const res = await GET(req(`/api/suppliers/${supplierId}/summary`, V1), thamSo(supplierId));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.moneyFormat, "decimal-string-v1");
    // Σ = 2 × 1000 × 9.999.999.999.999,99 + 0,01 = 19.999.999.999.999.980,01 (SUM float8 cũ in
    // "1.999999999999998e+16" → parseMoney throw → 500).
    assert.equal(body.totalOrdered, "19999999999999980.01");
    assert.equal(body.totalPaid, "0.01");
    assert.equal(body.debt, "19999999999999980.00");
    assert.equal(typeof body.ratingsCount, "number");

    const legacy = await GET(req(`/api/suppliers/${supplierId}/summary`), thamSo(supplierId));
    assert.equal(legacy.status, 422);
    assert.equal(((await legacy.json()) as { code: string }).code, "money_precision_unsupported");

    // Vai trò không có viewPayments: khối tiền null ở cả 2 định dạng — không 422 lộ độ lớn.
    await dangNhapVaiTro("viewer", projectId);
    const keem = await GET(req(`/api/suppliers/${supplierId}/summary`), thamSo(supplierId));
    assert.equal(keem.status, 200);
    const keemBody = (await keem.json()) as Record<string, unknown>;
    assert.equal(keemBody.totalOrdered, null);
    assert.equal(keemBody.debt, null);
  },
);

// ===== So sánh / trao thầu =====

async function dungGoiThau(projectId: number, dong: { qty: string; gia: string }[]) {
  const { run, insertId } = await import("@/lib/db");
  const tenderId = await insertId(
    `INSERT INTO tender_packages (code, name, status, project_id) VALUES (?, 'Gói S10c', 'open', ?)`,
    uniq("GT-S10c-"),
    projectId,
  );
  const supplierId = await taoNcc();
  const bidId = await insertId(
    `INSERT INTO tender_bids (tender_id, supplier_id) VALUES (?, ?)`,
    tenderId,
    supplierId,
  );
  for (const d of dong) {
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
       VALUES (?, 'Dòng S10c', 'm', 0, 0, ?)`,
      uniq("BOQ-S10c-"),
      projectId,
    );
    await run(
      `INSERT INTO tender_items (tender_id, boq_item_id, qty) VALUES (?, ?, ?::numeric)`,
      tenderId,
      boqId,
      d.qty,
    );
    await run(
      `INSERT INTO tender_bid_prices (bid_id, boq_item_id, unit_price) VALUES (?, ?, ?::numeric)`,
      bidId,
      boqId,
      d.gia,
    );
  }
  return { tenderId, bidId };
}

test(
  "tenders/:id: tổng chào ≥ 10^15 có nửa xu → v1 exact, legacy 422, giá dòng là chuỗi",
  S,
  async () => {
    const { GET } = await import("@/app/api/tenders/[id]/route");
    const projectId = await dungDuAn();
    // 1000 × 9.999.999.999.999,99 + 0,001 × 5,00 = 9.999.999.999.999.990,005 → làm tròn ,01.
    const { tenderId, bidId } = await dungGoiThau(projectId, [
      { qty: "1000.000", gia: MAX_DONG },
      { qty: "0.001", gia: "5.00" },
    ]);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req(`/api/tenders/${tenderId}`, V1), thamSo(tenderId));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
    const body = (await res.json()) as {
      moneyFormat?: string;
      bids: { bidId: number; total: unknown; lumpSum: unknown; prices: Record<string, unknown> }[];
    };
    assert.equal(body.moneyFormat, "decimal-string-v1");
    const bid = body.bids.find((b) => b.bidId === bidId)!;
    assert.equal(bid.total, "9999999999999990.01");
    assert.equal(bid.lumpSum, null);
    assert.ok(Object.values(bid.prices).includes(MAX_DONG));
    assert.ok(Object.values(bid.prices).includes("5.00"));

    const legacy = await GET(req(`/api/tenders/${tenderId}`), thamSo(tenderId));
    assert.equal(legacy.status, 422);
    assert.equal(((await legacy.json()) as { code: string }).code, "money_precision_unsupported");
  },
);

test("tenders/:id legacy trong biên: number như cũ, không có moneyFormat", S, async () => {
  const { GET } = await import("@/app/api/tenders/[id]/route");
  const projectId = await dungDuAn();
  const { tenderId, bidId } = await dungGoiThau(projectId, [{ qty: "3.000", gia: "1000.10" }]);
  await dangNhapVaiTro("pm", projectId);
  const body = (await (await GET(req(`/api/tenders/${tenderId}`), thamSo(tenderId))).json()) as {
    moneyFormat?: string;
    bids: { bidId: number; total: unknown }[];
  };
  assert.equal(body.moneyFormat, undefined);
  assert.equal(body.bids.find((b) => b.bidId === bidId)!.total, 3000.3);
});

test(
  "tenders/:id/award: tổng chào vượt NUMERIC(15,2) → 422 amount_overflow, gói không bị trao",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { POST } = await import("@/app/api/tenders/[id]/award/route");
    const projectId = await dungDuAn();
    const { tenderId, bidId } = await dungGoiThau(projectId, [{ qty: "2.000", gia: MAX_DONG }]);
    await dangNhapVaiTro("pm", projectId);
    const res = await POST(
      req(`/api/tenders/${tenderId}/award`, undefined, { bidId }),
      thamSo(tenderId),
    );
    assert.equal(res.status, 422);
    assert.equal(((await res.json()) as { code?: string }).code, "amount_overflow");
    const t = await queryOne<{ status: string; awarded: number | null }>(
      `SELECT status, awarded_contract_id AS awarded FROM tender_packages WHERE id = ?`,
      tenderId,
    );
    assert.equal(t?.status, "open");
    assert.equal(t?.awarded, null);
  },
);

test("tenders/:id/award: giá trị HĐ ghi exact từ tổng chào có nửa xu", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const { POST } = await import("@/app/api/tenders/[id]/award/route");
  const projectId = await dungDuAn();
  // 1 × 9.999.999.999.990,00 + 0,001 × 5,00 = 9.999.999.999.990,005 → 9.999.999.999.990,01.
  const { tenderId, bidId } = await dungGoiThau(projectId, [
    { qty: "1.000", gia: "9999999999990.00" },
    { qty: "0.001", gia: "5.00" },
  ]);
  await dangNhapVaiTro("pm", projectId);
  const res = await POST(
    req(`/api/tenders/${tenderId}/award`, undefined, { bidId }),
    thamSo(tenderId),
  );
  assert.equal(res.status, 200);
  const { contractId } = (await res.json()) as { contractId: number };
  const c = await queryOne<{ value: string }>(
    `SELECT value::text AS value FROM contracts WHERE id = ?`,
    contractId,
  );
  assert.equal(c?.value, "9999999999990.01");
});

// ===== Công nợ nhà thầu phụ =====

test(
  "subcontractors: công nợ 11 HĐ > 2^53 xu exact ở danh sách + chi tiết (v1), legacy 422",
  S,
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { GET: LIST } = await import("@/app/api/subcontractors/route");
    const { GET: CHI_TIET } = await import("@/app/api/subcontractors/[supplierId]/route");
    const projectId = await dungDuAn();
    const supplierId = await taoNcc();
    const systemId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ S10c')`,
      uniq("S10C").slice(0, 20),
    );
    don.systems.push(systemId);
    await run(
      `INSERT INTO system_contractors (system_id, supplier_id) VALUES (?, ?)`,
      systemId,
      supplierId,
    );
    for (let i = 0; i < 11; i++)
      await run(
        `INSERT INTO contracts (code, kind, title, party_supplier_id, value, status, project_id)
       VALUES (?, 'giao_thau', 'HĐ NTP S10c', ?, ?::numeric, 'active', ?)`,
        uniq("HD-NTP-"),
        supplierId,
        i < 10 ? MAX_DONG : "0.03",
        projectId,
      );
    await dangNhapVaiTro("pm", projectId);

    const list = await LIST(req("/api/subcontractors", V1));
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as {
      moneyFormat?: string;
      items: { id: number; outstanding: unknown }[];
    };
    assert.equal(listBody.moneyFormat, "decimal-string-v1");
    assert.equal(listBody.items.find((i) => i.id === supplierId)?.outstanding, "99999999999999.93");
    assert.equal((await LIST(req("/api/subcontractors"))).status, 422);

    const thamSoNtp = { params: Promise.resolve({ supplierId: String(supplierId) }) };
    const ct = await CHI_TIET(req(`/api/subcontractors/${supplierId}`, V1), thamSoNtp);
    assert.equal(ct.status, 200);
    const debt = ((await ct.json()) as { item: { debt: Record<string, unknown> } }).item.debt;
    assert.equal(debt.contractValue, "99999999999999.93");
    assert.equal(debt.paid, "0.00");
    assert.equal(debt.outstanding, "99999999999999.93");
    const hopDong = debt.contracts as { value: unknown; addendaTotal: unknown }[];
    assert.equal(hopDong.length, 11);
    assert.ok(hopDong.every((c) => typeof c.value === "string" && c.addendaTotal === "0.00"));
    const legacy = await CHI_TIET(req(`/api/subcontractors/${supplierId}`), thamSoNtp);
    assert.equal(legacy.status, 422);
  },
);
