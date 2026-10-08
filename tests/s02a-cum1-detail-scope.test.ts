import { HAS_TEST_DB } from "./setup";
import { dangNhap, dangNhapDuAn } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S02a cụm 1 (A1-AC02/AC03): 6 route GET chi tiết tài chính phải fail-closed
// khi user không có dự án khả kiến, và trả 404 cho bản ghi thuộc dự án khác cùng org.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let seq = 0;

async function taoDuAn(ten: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `S02a ${RUN} ${ten}`);
}

async function taoUser() {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-s02a', 'pm', 1)`,
    `S02a ${RUN}`,
    `s02a-${RUN}-${++seq}@test.local`,
  );
  const row = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: row!.password_hash };
}

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

type Ca = {
  ten: string;
  tao: (projectId: number) => Promise<number>;
  load: () => Promise<{ GET: Handler }>;
  marker: string;
};

const CAC_ROUTE: Ca[] = [
  {
    ten: "advances",
    marker: `TU-${RUN}`,
    tao: async (p) => {
      const { insertId } = await import("@/lib/db");
      return insertId(
        `INSERT INTO advances (project_id, code, advance_date, amount, recipient)
         VALUES (?, ?, CURRENT_DATE, 1000, 'NV test')`,
        p,
        `TU-${RUN}-${++seq}`,
      );
    },
    load: () => import("@/app/api/advances/[id]/route"),
  },
  {
    ten: "cash-transactions",
    marker: `PC-${RUN}`,
    tao: async (p) => {
      const { insertId } = await import("@/lib/db");
      return insertId(
        `INSERT INTO cash_transactions (project_id, tx_date, direction, amount, voucher_code)
         VALUES (?, CURRENT_DATE, 'out', 500, ?)`,
        p,
        `PC-${RUN}-${++seq}`,
      );
    },
    load: () => import("@/app/api/cash-transactions/[id]/route"),
  },
  {
    ten: "invoices",
    marker: `HD-${RUN}`,
    tao: async (p) => {
      const { insertId } = await import("@/lib/db");
      return insertId(
        `INSERT INTO invoices (project_id, invoice_no, invoice_date, direction, net_amount, vat_amount)
         VALUES (?, ?, CURRENT_DATE, 'in', 1000, 100)`,
        p,
        `HD-${RUN}-${++seq}`,
      );
    },
    load: () => import("@/app/api/invoices/[id]/route"),
  },
  {
    ten: "payroll",
    marker: `2099-01`,
    tao: async (p) => {
      const { insertId } = await import("@/lib/db");
      return insertId(
        `INSERT INTO payroll (project_id, period, workdays, rate, gross, net)
         VALUES (?, '2099-01', 10, 100, 1000, 1000)`,
        p,
      );
    },
    load: () => import("@/app/api/payroll/[id]/route"),
  },
  {
    ten: "purchase-orders",
    marker: `PO-${RUN}`,
    tao: async (p) => {
      const { insertId } = await import("@/lib/db");
      return insertId(
        `INSERT INTO purchase_orders (po_code, status, project_id) VALUES (?, 'draft', ?)`,
        `PO-${RUN}-${++seq}`,
        p,
      );
    },
    load: () => import("@/app/api/purchase-orders/[id]/route"),
  },
  {
    ten: "tenders",
    marker: `GT-${RUN}`,
    tao: async (p) => {
      const { insertId } = await import("@/lib/db");
      return insertId(
        `INSERT INTO tender_packages (code, name, project_id) VALUES (?, 'Gói test', ?)`,
        `GT-${RUN}-${++seq}`,
        p,
      );
    },
    load: () => import("@/app/api/tenders/[id]/route"),
  },
];

async function goi(ca: Ca, id: number) {
  const { GET } = await ca.load();
  const res = await GET(new NextRequest(`http://localhost/api/${ca.ten}/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });
  return { status: res.status, text: await res.text() };
}

for (const ca of CAC_ROUTE) {
  test(`GET /api/${ca.ten}/:id — fail-closed theo dự án`, S, async () => {
    const projectA = await taoDuAn(`${ca.ten}-a`);
    const projectB = await taoDuAn(`${ca.ten}-b`);
    const idA = await ca.tao(projectA);
    const idB = await ca.tao(projectB);

    // (c) đúng dự án → 200 như cũ (đồng thời làm user_projects khác rỗng).
    const owner = await taoUser();
    await dangNhapDuAn(owner, projectA);
    const ok = await goi(ca, idA);
    assert.equal(ok.status, 200, ok.text);
    assert.ok(ok.text.includes(ca.marker), ok.text);

    // (b) id thuộc dự án khác cùng org → 404, không lộ dữ liệu.
    const khac = await goi(ca, idB);
    assert.equal(khac.status, 404, khac.text);
    assert.ok(!khac.text.includes(ca.marker), khac.text);

    // (a) user không được gán dự án nào (user_projects không rỗng) → projectId null → 404.
    const lac = await taoUser();
    dangNhap(lac, projectA);
    for (const id of [idA, idB]) {
      const r = await goi(ca, id);
      assert.equal(r.status, 404, r.text);
      assert.ok(!r.text.includes(ca.marker), r.text);
    }
  });
}
