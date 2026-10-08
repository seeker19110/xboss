import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// P1-2 (A1-AC03): hoá đơn không được trỏ hợp đồng/phiếu thanh toán của dự án khác, và phiếu
// gắn hợp đồng khác với contractId trong body cũng bị từ chối. Chạy route thật, user thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

const jreq = (url: string, body: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body) });

async function dung() {
  const { insertId, queryOne } = await import("@/lib/db");
  const pA = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("P1-2 A "));
  const pB = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("P1-2 B "));
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('P1-2 PM', ?, 'hash-test-p12', 'pm', 1)`,
    `p12-${uniq("pm")}@test.local`,
  );
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  const hd = async (p: number) =>
    insertId(
      `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
       VALUES (?, 'nhan_thau', 'HĐ P1-2', 'CĐT', 0, 'active', ?)`,
      `HD-${uniq("P12")}`,
      p,
    );
  const bill = async (p: number, c: number | null) =>
    insertId(
      `INSERT INTO payment_bills (responsible, paid_date, project_id, contract_id)
       VALUES ('P1-2', '2026-01-01', ?, ?)`,
      p,
      c,
    );
  const cA = await hd(pA);
  const cA2 = await hd(pA);
  const cB = await hd(pB);
  const bA = await bill(pA, cA);
  const bA2 = await bill(pA, cA2);
  const bB = await bill(pB, null);
  return {
    pA,
    pB,
    pmId,
    pm: { id: pmId, passwordHash: pm!.password_hash },
    cA,
    cA2,
    cB,
    bA,
    bA2,
    bB,
  };
}

type F = Awaited<ReturnType<typeof dung>>;

async function don(f: F) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM invoices WHERE project_id IN (?, ?)`, f.pA, f.pB);
  await run(`DELETE FROM payment_bills WHERE id IN (?, ?, ?)`, f.bA, f.bA2, f.bB);
  await run(`DELETE FROM contracts WHERE id IN (?, ?, ?)`, f.cA, f.cA2, f.cB);
  await run(`DELETE FROM user_projects WHERE user_id = ?`, f.pmId);
  await run(`DELETE FROM users WHERE id = ?`, f.pmId);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, f.pA, f.pB);
}

const base = { direction: "in", netAmount: 1000, vatAmount: 100 };
const SEL = `SELECT contract_id AS c, payment_bill_id AS b FROM invoices WHERE id = ?`;

test("P1-2: POST/PATCH hoá đơn chặn hợp đồng/phiếu khác dự án (A1-AC03)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const f = await dung();
  try {
    await dangNhapDuAn(f.pm, f.pA);
    const { POST } = await import("@/app/api/invoices/route");
    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const dem = async () =>
      (await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM invoices WHERE project_id = ?`,
        f.pA,
      ))!.n;

    // Hợp đồng dự án B → 422, không tạo dòng.
    let r: Response = await POST(jreq("/api/invoices", { ...base, contractId: f.cB }));
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, "Hợp đồng không tồn tại");
    assert.equal(await dem(), 0);

    // Phiếu thanh toán dự án B → 422.
    r = await POST(jreq("/api/invoices", { ...base, paymentBillId: f.bB }));
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, "Phiếu thanh toán không tồn tại");
    assert.equal(await dem(), 0);

    // Phiếu thuộc hợp đồng khác contractId trong body → 422.
    r = await POST(jreq("/api/invoices", { ...base, contractId: f.cA, paymentBillId: f.bA2 }));
    assert.equal(r.status, 422);
    assert.equal(await dem(), 0);

    // Đúng dự án → 201.
    r = await POST(jreq("/api/invoices", { ...base, contractId: f.cA, paymentBillId: f.bA }));
    assert.equal(r.status, 201);
    const { id } = await r.json();
    assert.equal(await dem(), 1);
    const ctx = { params: Promise.resolve({ id: String(id) }) };

    // PATCH đổi contract sang dự án B → 422, dòng không đổi.
    r = await PATCH(jreq(`/api/invoices/${id}`, { contractId: f.cB }, "PATCH"), ctx);
    assert.equal(r.status, 422);
    // PATCH đổi contract sang cA2 trong khi phiếu đang lưu thuộc cA → 422 (nhất quán cặp).
    r = await PATCH(jreq(`/api/invoices/${id}`, { contractId: f.cA2 }, "PATCH"), ctx);
    assert.equal(r.status, 422);
    assert.deepEqual(await queryOne(SEL, id), { c: f.cA, b: f.bA });

    // PATCH hợp lệ (đổi cả cặp trong cùng dự án) → 200.
    r = await PATCH(
      jreq(`/api/invoices/${id}`, { contractId: f.cA2, paymentBillId: f.bA2 }, "PATCH"),
      ctx,
    );
    assert.equal(r.status, 200);
    assert.deepEqual(await queryOne(SEL, id), { c: f.cA2, b: f.bA2 });
  } finally {
    await don(f);
  }
});
