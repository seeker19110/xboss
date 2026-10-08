import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S10 miền chi phí (A3-FR03/FR04/FR06, A3-AC01/AC05, Q-AC04): GET /api/costs
// cộng tiền exact trong SQL (kể cả PO có số lượng float8), DTO opt-in decimal-string-v1, legacy
// number chỉ trong biên round-trip an toàn (ngoài biên 422 money_precision_unsupported), header
// private,no-store + Vary. Đi đúng đường người dùng: phiên thật → route thật → PostgreSQL thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const HEADER = "X-XBoss-Money-Format";

type Fixture = {
  projectId: number;
  pmId: number;
  systemId: number;
  systemCode: string;
  towerId: number;
  sheetId: number;
  supplierId: number;
};

/** Dự án + PM đã đăng nhập + hệ riêng + tháp/sheet thuộc hệ (không phụ thuộc seed 'dien'). */
async function dungDuAn(): Promise<Fixture> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10 cost "));
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10 cost PM', ?, 'hash-test-s10-cost', 'pm', 1)`,
    `s10cost-${uniq("pm")}@test.local`,
  );
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  const systemCode = uniq("s10c");
  const systemId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, ?)`,
    systemCode,
    `Hệ ${systemCode}`,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S10')`,
    projectId,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet S10', ?)`,
    towerId,
    uniq("S10ST"),
    systemId,
  );
  const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES (?)`, uniq("NCC S10 "));
  await dangNhapDuAn({ id: pmId, passwordHash: pm!.password_hash }, projectId);
  return { projectId, pmId, systemId, systemCode, towerId, sheetId, supplierId };
}

async function donDep(f: Fixture) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM payment_bills WHERE project_id = ?`, f.projectId);
  await run(`DELETE FROM floor_contracts WHERE sheet_type_id = ?`, f.sheetId);
  await run(
    `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
    f.projectId,
  );
  await run(`DELETE FROM purchase_orders WHERE project_id = ?`, f.projectId);
  await run(`DELETE FROM materials WHERE sheet_type_id = ?`, f.sheetId);
  await run(`DELETE FROM boq_items WHERE project_id = ?`, f.projectId);
  await run(`DELETE FROM suppliers WHERE id = ?`, f.supplierId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, f.sheetId);
  await run(`DELETE FROM towers WHERE id = ?`, f.towerId);
  await run(`DELETE FROM systems WHERE id = ?`, f.systemId);
  await run(`DELETE FROM user_projects WHERE user_id = ?`, f.pmId);
  await run(`DELETE FROM users WHERE id = ?`, f.pmId);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
  dangXuat();
}

async function themBoq(f: Fixture, qty: string, price: string) {
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id)
     VALUES (?, 'Dòng BOQ S10', 'm', ?, ?::numeric, ?::numeric, ?)`,
    uniq("BOQ-S10-"),
    f.systemId,
    qty,
    price,
    f.projectId,
  );
}

/** PO còn hiệu lực, 1 dòng — qty_ordered là float8 (cột thật), đơn giá numeric(15,2). */
async function themPo(f: Fixture, qty: number, price: string) {
  const { insertId, run } = await import("@/lib/db");
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'VT S10', 'cái', ?)`,
    f.sheetId,
    f.projectId,
  );
  const poId = await insertId(
    `INSERT INTO purchase_orders (supplier_id, status, project_id) VALUES (?, 'confirmed', ?)`,
    f.supplierId,
    f.projectId,
  );
  await run(
    `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, ?, ?::numeric)`,
    poId,
    matId,
    qty,
    price,
  );
}

async function themPhieu(f: Fixture, amount: string, type = "bill") {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
     VALUES ('S10', ?, ?::numeric, CURRENT_DATE, ?, 'T1', ?)`,
    type,
    amount,
    f.sheetId,
    f.projectId,
  );
}

async function getCosts(query = "", headers?: Record<string, string>) {
  const { GET } = await import("@/app/api/costs/route");
  return GET(new NextRequest(`http://localhost/api/costs${query}`, { headers }));
}

function kiemHeaderTaiChinh(res: Response) {
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
}

type Body = {
  moneyFormat?: string;
  rows: { key: string; budget: unknown; committed: unknown; actual: unknown }[];
  totals: { budget: unknown; committed: unknown; actual: unknown };
  code?: string;
};

test(
  "GET /api/costs decimal-string-v1: tổng vượt 2^53 đồng×100 exact tới xu (A3-AC01, Q-AC04)",
  S,
  async () => {
    const f = await dungDuAn();
    try {
      // 1000 × 9.007.199.254.740,99 + 1 × 0,01 = 9.007.199.254.740.990,01 (> 2^53 đồng×100).
      await themBoq(f, "1000.000", "9007199254740.99");
      await themBoq(f, "1.000", "0.01");
      // Hai phiếu cùng số tiền khác ID đều phải được tính; advance tính vào thực chi.
      await themPhieu(f, "9999999999999.99");
      await themPhieu(f, "9999999999999.99", "advance");

      const res = await getCosts("?groupBy=system&includeVo=1", { [HEADER]: "decimal-string-v1" });
      assert.equal(res.status, 200);
      kiemHeaderTaiChinh(res);
      const body = (await res.json()) as Body;
      assert.equal(body.moneyFormat, "decimal-string-v1");
      const row = body.rows.find((r) => r.key === f.systemCode);
      assert.ok(row, "phải có dòng của hệ test");
      assert.equal(row.budget, "9007199254740990.01");
      assert.equal(row.committed, "0.00");
      assert.equal(row.actual, "19999999999999.98");
      assert.equal(body.totals.budget, "9007199254740990.01");
      assert.equal(body.totals.actual, "19999999999999.98");
      // Hệ không có dữ liệu: chuỗi canonical "0.00", không null/number.
      for (const r of body.rows) {
        for (const k of ["budget", "committed", "actual"] as const)
          assert.ok(
            typeof r[k] === "string" && /^-?(0|[1-9]\d*)\.\d{2}$/.test(r[k]),
            `${r.key}.${k} phải là chuỗi canonical`,
          );
      }
    } finally {
      await donDep(f);
    }
  },
);

test(
  "GET /api/costs legacy (không header): ngoài biên an toàn → 422 money_precision_unsupported",
  S,
  async () => {
    const f = await dungDuAn();
    try {
      await themBoq(f, "1000.000", "9007199254740.99");
      await themBoq(f, "1.000", "0.01");
      const res = await getCosts();
      assert.equal(res.status, 422);
      kiemHeaderTaiChinh(res);
      const body = (await res.json()) as Body & { error?: string };
      assert.equal(body.code, "money_precision_unsupported");
      assert.equal(typeof body.error, "string");
      assert.equal(body.rows, undefined, "không trả số xấp xỉ");
      assert.equal(body.totals, undefined);
    } finally {
      await donDep(f);
    }
  },
);

test(
  "GET /api/costs: cam kết PO số lượng float8 nhân đơn giá exact (0,3 × 0,05 = 0,015 → 0,02)",
  S,
  async () => {
    const f = await dungDuAn();
    try {
      // float8 0.3 × numeric 0.05 trong PostgreSQL ra float 0.01499999… → làm tròn 0,01 (sai);
      // đường exact đọc biểu diễn float đã lưu (0.3) rồi nhân numeric: 0,015 → 0,02.
      await themPo(f, 0.3, "0.05");
      await themBoq(f, "1.000", "1.00");
      const res = await getCosts("", { [HEADER]: "decimal-string-v1" });
      assert.equal(res.status, 200);
      const body = (await res.json()) as Body;
      const row = body.rows.find((r) => r.key === f.systemCode);
      assert.ok(row);
      assert.equal(row.committed, "0.02");
      assert.equal(body.totals.committed, "0.02");
    } finally {
      await donDep(f);
    }
  },
);

test(
  "GET /api/costs legacy trong biên: vẫn JSON number như cũ, không moneyFormat (A3-AC05)",
  S,
  async () => {
    const f = await dungDuAn();
    try {
      await themBoq(f, "100.000", "1000.00");
      await themPhieu(f, "3000.00");
      await themPhieu(f, "1000.50", "advance");
      const res = await getCosts("?groupBy=system");
      assert.equal(res.status, 200);
      kiemHeaderTaiChinh(res);
      const body = (await res.json()) as Body;
      assert.equal(body.moneyFormat, undefined);
      const row = body.rows.find((r) => r.key === f.systemCode);
      assert.ok(row);
      assert.equal(row.budget, 100000);
      assert.equal(row.actual, 4000.5);
      assert.equal(body.totals.actual, 4000.5);
      // Header lạ = legacy.
      const la = await getCosts("", { [HEADER]: "decimal-string-v2" });
      assert.equal(((await la.json()) as Body).moneyFormat, undefined);
    } finally {
      await donDep(f);
    }
  },
);

test("GET /api/costs: 401 cũng mang Cache-Control private,no-store + Vary", S, async () => {
  dangXuat();
  const res = await getCosts();
  assert.equal(res.status, 401);
  kiemHeaderTaiChinh(res);
});
