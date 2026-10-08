import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S10c — tiền exact cho hợp đồng (/api/contracts, /api/contracts/:id) — A3-FR06,
// A3-AC01/AC05. Σ phụ lục / Σ đã thanh toán / Σ PO gắn HĐ vượt 2^53 xu có xu lẻ → v1 chuỗi
// canonical đọc `::text` (không qua parser float); legacy ngoài biên → 422 (không xấp xỉ âm thầm);
// legacy trong biên vẫn number; trường đã che giữ null. Route handler thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
const MAX_DONG = "9999999999999.99"; // trần NUMERIC(15,2)

const don: { projects: number[]; users: number[]; suppliers: number[] } = {
  projects: [],
  users: [],
  suppliers: [],
};

async function dungDuAn() {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10c HĐ "));
  don.projects.push(projectId);
  return projectId;
}

async function dangNhapVaiTro(role: string, projectId: number) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10c user', ?, 'hash-test-s10c', ?, 1)`,
    `s10c-hd-${uniq(role)}@test.local`,
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

async function taoHopDong(projectId: number, value: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'giao_thau', 'HĐ S10c', 'Đối tác S10c', ?::numeric, 'active', ?)`,
    uniq("HD-S10c-"),
    value,
    projectId,
  );
}

/**
 * HĐ "lớn": value = trần, 11 phụ lục Σ = 99.999.999.999.999,93 đ (vượt 2^53 xu), 2 phiếu thanh
 * toán Σ = 19.999.999.999.999,99 đ, PO gắn HĐ qty float8 1000×trần ×2 + 1×0,01.
 */
async function dungHopDongLon(projectId: number) {
  const { run, insertId } = await import("@/lib/db");
  const contractId = await taoHopDong(projectId, MAX_DONG);
  const phuLuc = [...Array<string>(10).fill(MAX_DONG), "0.03"];
  for (const v of phuLuc)
    await run(
      `INSERT INTO contract_addenda (contract_id, code, title, value_delta) VALUES (?, ?, 'PL', ?::numeric)`,
      contractId,
      uniq("PL-"),
      v,
    );
  for (const v of [MAX_DONG, "0.01", MAX_DONG])
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id, project_id)
       VALUES ('S10c', 'bill', ?::numeric, '2026-10-01', ?, ?)`,
      v,
      contractId,
      projectId,
    );
  const supplierId = await insertId(
    `INSERT INTO suppliers (name, org_id) VALUES (?, 1)`,
    uniq("NCC S10c HĐ "),
  );
  don.suppliers.push(supplierId);
  const poId = await insertId(
    `INSERT INTO purchase_orders (po_code, supplier_id, status, project_id, contract_id)
     VALUES (?, ?, 'sent', ?, ?)`,
    uniq("PO-S10c-HD-"),
    supplierId,
    projectId,
    contractId,
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
  return contractId;
}

const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const req = (url: string, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost${url}`, { headers });

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    await run(
      `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM purchase_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM payment_bills WHERE project_id = ?`, p);
    await run(
      `DELETE FROM contract_addenda WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM contracts WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
  }
  for (const s of don.suppliers) await run(`DELETE FROM suppliers WHERE id = ?`, s);
  for (const p of don.projects) await run(`DELETE FROM projects WHERE id = ?`, p);
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

test(
  "GET /api/contracts v1: Σ phụ lục/đã TT/PO vượt 2^53 xu → chuỗi exact, không lệch xu",
  S,
  async () => {
    const { GET } = await import("@/app/api/contracts/route");
    const projectId = await dungDuAn();
    const contractId = await dungHopDongLon(projectId);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req("/api/contracts", V1));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
    const body = await res.json();
    assert.equal(body.moneyFormat, "decimal-string-v1");
    const c = body.contracts.find((x: { id: number }) => x.id === contractId);
    assert.ok(c, "HĐ phải có trong danh sách");
    assert.equal(c.value, MAX_DONG);
    assert.equal(c.addendaTotal, "99999999999999.93");
    assert.equal(c.paid, "19999999999999.99");
    // qty_ordered float8 × NUMERIC: SUM float8 cũ mất xu (…980,00 thay vì …980,01).
    assert.equal(c.poCommitted, "19999999999999980.01");
  },
);

test(
  "GET /api/contracts legacy: tổng ngoài biên round-trip → 422 money_precision_unsupported",
  S,
  async () => {
    const { GET } = await import("@/app/api/contracts/route");
    const projectId = await dungDuAn();
    await dungHopDongLon(projectId);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req("/api/contracts"));
    assert.equal(res.status, 422);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await res.json();
    assert.equal(body.code, "money_precision_unsupported");
  },
);

test(
  "GET /api/contracts legacy trong biên: vẫn trả number như cũ (tương thích client cũ)",
  S,
  async () => {
    const { GET } = await import("@/app/api/contracts/route");
    const projectId = await dungDuAn();
    const contractId = await taoHopDong(projectId, "1234567.89");
    await dangNhapVaiTro("admin", projectId);

    const res = await GET(req("/api/contracts"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.moneyFormat, undefined);
    const c = body.contracts.find((x: { id: number }) => x.id === contractId);
    assert.equal(c.value, 1234567.89);
    assert.equal(c.addendaTotal, 0);
    assert.equal(c.paid, 0);
    assert.equal(c.poCommitted, 0);
  },
);

test(
  "GET /api/contracts/:id v1: HĐ + phụ lục + phiếu TT là chuỗi exact; legacy ngoài biên 422",
  S,
  async () => {
    const { GET } = await import("@/app/api/contracts/[id]/route");
    const projectId = await dungDuAn();
    const contractId = await dungHopDongLon(projectId);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req(`/api/contracts/${contractId}`, V1), thamSo(contractId));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await res.json();
    assert.equal(body.moneyFormat, "decimal-string-v1");
    assert.equal(body.contract.addendaTotal, "99999999999999.93");
    assert.equal(body.contract.poCommitted, "19999999999999980.01");
    assert.equal(body.addenda.length, 11);
    assert.ok(body.addenda.every((a: { valueDelta: unknown }) => typeof a.valueDelta === "string"));
    assert.deepEqual(
      body.bills.map((b: { amount: string }) => b.amount).sort(),
      ["0.01", MAX_DONG, MAX_DONG].sort(),
    );

    const legacy = await GET(req(`/api/contracts/${contractId}`), thamSo(contractId));
    assert.equal(legacy.status, 422);
    assert.equal((await legacy.json()).code, "money_precision_unsupported");
  },
);

test("contractsToWire: trường bị che (stripSensitive) giữ null ở cả v1 lẫn legacy", async () => {
  const { contractsToWire } = await import("@/lib/tai-chinh/contracts");
  const { stripSensitive } = await import("@/lib/bao-mat/sensitive-fields");
  type Row = Parameters<typeof contractsToWire>[0][number];
  const row = {
    id: 1,
    value: 99999999999999.93,
    addendaTotal: 0,
    paid: 0,
    poCommitted: 0,
    valueText: "99999999999999.93",
    addendaTotalText: "0.00",
    paidText: "0.00",
    poCommittedText: "0.00",
  } as unknown as Row;
  const [masked] = stripSensitive("contract", [row], { role: "engineer" });
  for (const f of ["decimal-string-v1", "legacy-number"] as const) {
    const [w] = contractsToWire([masked], f);
    assert.equal(w.value, null, f);
    assert.equal(w.addendaTotal, null, f);
    assert.equal(w.paid, null, f);
    assert.equal(w.poCommitted, null, f);
    assert.equal((w as Record<string, unknown>).poCommittedText ?? null, null, f);
  }
  // Không che: v1 lấy từ bản ::text (exact), không từ number float.
  const [v1] = contractsToWire([row], "decimal-string-v1");
  assert.equal(v1.value, "99999999999999.93");
});

test("mSumTien/mSubTien (UI hợp đồng): cộng/trừ bigint exact, bị che lan truyền null", async () => {
  const { mSumTien, mSubTien } = await import("@/app/lib/masked");
  // 90.071.992.547.409,91 + 0,01 = …,92 (A3-AC01) — float cộng ra …,91/…,93.
  assert.equal(mSumTien("90071992547409.91", "0.01"), 9007199254740992n);
  assert.equal(mSumTien("1.00", null), null);
  assert.equal(mSumTien(), 0n);
  assert.equal(mSubTien("99999999999999.93", 1n), 9999999999999992n);
  assert.equal(mSubTien(undefined, "1.00"), null);
});
