import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S10c — tiền exact cho GET /api/finance/summary (A3-AC01/AC05, Q-AC04):
// tổng vượt 2^53 xu không mất xu, PO qty float8 không làm SUM ra float/dạng mũ (500), header
// decimal-string-v1 → chuỗi canonical, legacy ngoài biên → 422 money_precision_unsupported,
// trong biên vẫn number như cũ. Đi qua route handler thật với PM đã gán dự án.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const HEADER = { "X-XBoss-Money-Format": "decimal-string-v1" };
const MAX_DONG = "9999999999999.99"; // trần NUMERIC(15,2) một dòng

const projects: number[] = [];
const users: number[] = [];

async function dungDuAnVaPm() {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10c TC "));
  projects.push(projectId);
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10c PM', ?, 'hash-test-s10c', 'pm', 1)`,
    `s10c-${uniq("pm")}@test.local`,
  );
  users.push(pmId);
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  await dangNhapDuAn({ id: pmId, passwordHash: pm!.password_hash }, projectId);
  return projectId;
}

/** 10 dòng trần NUMERIC(15,2) + 1 dòng 0,03 → 99.999.999.999.999,93 (vượt 2^53 xu). */
async function chenTongLon(sql: string, projectId: number, ...them: unknown[]) {
  const { run } = await import("@/lib/db");
  for (let i = 0; i < 10; i++) await run(sql, projectId, MAX_DONG, uniq("x"), ...them);
  await run(sql, projectId, "0.03", uniq("x"), ...them);
}

async function goiSummary(headers?: Record<string, string>) {
  const { GET } = await import("@/app/api/finance/summary/route");
  return GET(new NextRequest("http://localhost/api/finance/summary", { headers }));
}

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of projects) {
    await run(
      `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM purchase_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM contracts WHERE project_id = ?`, p);
    await run(`DELETE FROM cash_transactions WHERE project_id = ?`, p);
    await run(`DELETE FROM advances WHERE project_id = ?`, p);
    await run(`DELETE FROM invoices WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

test(
  "finance/summary v1: tổng > 2^53 xu exact, PO qty float8 không làm mất xu/500",
  S,
  async () => {
    const { run, insertId, todayISO } = await import("@/lib/db");
    const projectId = await dungDuAnVaPm();
    const homNay = todayISO();

    // Phải thu: 10 HĐ nhận thầu trần + 1 HĐ 0,03. Tham số theo thứ tự (projectId, tiền, mã).
    await chenTongLon(
      `INSERT INTO contracts (project_id, value, code, kind, title, party_name, status)
     VALUES (?, ?::numeric, ?, 'nhan_thau', 'HĐ S10c', 'CĐT', 'active')`,
      projectId,
    );
    // Quỹ: 10 khoản thu trần + 0,03 trong tháng này.
    await chenTongLon(
      `INSERT INTO cash_transactions (project_id, amount, voucher_code, tx_date, direction)
     VALUES (?, ?::numeric, ?, ?, 'in')`,
      projectId,
      homNay,
    );
    // Tạm ứng chưa hoàn.
    await chenTongLon(
      `INSERT INTO advances (project_id, amount, code, recipient) VALUES (?, ?::numeric, ?, 'A')`,
      projectId,
    );
    // VAT đầu ra trong kỳ + 1 hoá đơn đầu vào 0,01.
    await chenTongLon(
      `INSERT INTO invoices (project_id, vat_amount, invoice_no, invoice_date, direction, net_amount)
     VALUES (?, ?::numeric, ?, ?, 'out', 0)`,
      projectId,
      homNay,
    );
    await run(
      `INSERT INTO invoices (project_id, invoice_date, direction, net_amount, vat_amount)
     VALUES (?, ?, 'in', 0, 0.01)`,
      projectId,
      homNay,
    );
    // Phải trả: PO chưa gắn HĐ, qty float8 1000 × trần (×2) + 1 × 0,01 — SUM float8 ra
    // "1.999999999999998e+16" (mất 0,01 và parseMoney throw).
    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES (?)`, uniq("NCC S10c "));
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, supplier_id, status, project_id) VALUES (?, ?, 'draft', ?)`,
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

    const res = await goiSummary(HEADER);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.moneyFormat, "decimal-string-v1");
    assert.equal(body.receivables, "99999999999999.93");
    assert.equal(body.payables, "19999999999999980.01");
    assert.equal(body.advanceOutstanding, "99999999999999.93");
    const thang = (body.cashflow as { month: string; in: unknown; out: unknown }[]).find(
      (m) => m.month === homNay.slice(0, 7),
    );
    assert.deepEqual(thang, { month: homNay.slice(0, 7), in: "99999999999999.93", out: "0.00" });
    assert.deepEqual(body.vat, {
      vatIn: "0.01",
      vatOut: "99999999999999.93",
      netVat: "99999999999999.92",
    });
    assert.equal(typeof body.period, "string");

    // Legacy (không header): không biểu diễn đúng bằng JSON number → 422, không xấp xỉ.
    const legacy = await goiSummary();
    assert.equal(legacy.status, 422);
    assert.equal(((await legacy.json()) as { code: string }).code, "money_precision_unsupported");
    await run(`DELETE FROM po_items WHERE po_id = ?`, poId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);

test(
  "finance/summary legacy trong biên: vẫn JSON number như cũ (không có moneyFormat)",
  S,
  async () => {
    const { run, todayISO } = await import("@/lib/db");
    const projectId = await dungDuAnVaPm();
    const homNay = todayISO();
    await run(
      `INSERT INTO cash_transactions (project_id, tx_date, direction, amount) VALUES (?, ?, 'out', 1234.56)`,
      projectId,
      homNay,
    );
    await run(
      `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ nhỏ', 'CĐT', 100.10, 'active', ?)`,
      uniq("HD-S10c-"),
      projectId,
    );
    const res = await goiSummary();
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.moneyFormat, undefined);
    assert.equal(body.receivables, 100.1);
    assert.equal(body.payables, 0);
    const thang = (body.cashflow as { month: string; in: unknown; out: unknown }[])[0];
    assert.deepEqual(thang, { month: homNay.slice(0, 7), in: 0, out: 1234.56 });

    // v1 cùng dữ liệu: số 0 là "0.00", không phải null/0.
    const v1 = (await (await goiSummary(HEADER)).json()) as Record<string, unknown>;
    assert.equal(v1.payables, "0.00");
    assert.equal(v1.receivables, "100.10");
  },
);
