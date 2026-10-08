import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S11 — báo cáo chi phí canonical (A4-FR01..FR07, A4-AC01..AC04, Q-AC05):
// scope trực tiếp payment_bills.project_id + lineage cha nhất quán; unassigned đúng dự án không
// mất tiền; lineage mâu thuẫn là lỗi chất lượng dữ liệu (không vào tổng dự án nào, báo coverage);
// nhóm theo khoá thật (system id / sheet_type_id+floor_label); selectedTotals ≠ projectTotals
// khi xem theo tầng; rows/totals/alerts cùng 1 snapshot. Route thật + PostgreSQL thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };

type Amounts = { budget: string; committed: string; actual: string };
type Row = Amounts & {
  key: string;
  label: string;
  systemId?: number | null;
  sheetTypeId?: number | null;
  floorLabel?: string | null;
  unassigned?: boolean;
};
type Body = {
  rows: Row[];
  totals: Amounts;
  selectedTotals?: Amounts;
  projectTotals?: Amounts;
  alerts: { key: string }[];
  metadata?: Record<string, unknown>;
  coverage?: {
    reconciled: boolean;
    conflicts: Record<string, number>;
    unassigned: Record<string, number>;
  };
};

type DuAn = { projectId: number; towerId: number; sheetId: number };
type Fixture = {
  pmId: number;
  passwordHash: string;
  systemId: number;
  systemCode: string;
  supplierId: number;
  p: DuAn;
  /** Tháp thứ 2 của P, sheet CÙNG mã với p.sheetId (mã sheet chỉ unique theo tháp). */
  p2: DuAn;
  q: DuAn;
  contracts: number[];
};

async function themDuAnTap(projectId: number, systemId: number, sheetCode: string) {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    uniq("Tháp "),
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet S11', ?)`,
    towerId,
    sheetCode,
    systemId,
  );
  return { projectId, towerId, sheetId };
}

async function dung(): Promise<Fixture> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectP = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S11 P "));
  const projectQ = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S11 Q "));
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S11 PM', ?, 'hash-test-s11', 'pm', 1)`,
    `s11-${uniq("pm")}@test.local`,
  );
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  const systemCode = uniq("s11c");
  const systemId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, ?)`,
    systemCode,
    `Hệ ${systemCode}`,
  );
  const sheetCode = uniq("S11ST");
  const p = await themDuAnTap(projectP, systemId, sheetCode);
  const p2 = await themDuAnTap(projectP, systemId, sheetCode);
  const q = await themDuAnTap(projectQ, systemId, uniq("S11SQ"));
  const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES (?)`, uniq("NCC S11 "));
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    pmId,
    projectQ,
  );
  const f: Fixture = {
    pmId,
    passwordHash: pm!.password_hash,
    systemId,
    systemCode,
    supplierId,
    p,
    p2,
    q,
    contracts: [],
  };
  await dangNhapDuAn({ id: pmId, passwordHash: f.passwordHash }, projectP);
  return f;
}

async function donDep(f: Fixture) {
  const { run } = await import("@/lib/db");
  const projects = [f.p.projectId, f.q.projectId];
  const sheets = [f.p.sheetId, f.p2.sheetId, f.q.sheetId];
  for (const id of projects) {
    await run(`DELETE FROM payment_bills WHERE project_id = ?`, id);
    await run(
      `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
      id,
    );
    await run(`DELETE FROM purchase_orders WHERE project_id = ?`, id);
    await run(`DELETE FROM boq_items WHERE project_id = ?`, id);
    await run(`DELETE FROM materials WHERE project_id = ?`, id);
  }
  for (const id of sheets) {
    await run(`DELETE FROM payment_bills WHERE sheet_type_id = ?`, id);
    await run(`DELETE FROM floor_contracts WHERE sheet_type_id = ?`, id);
    await run(`DELETE FROM sheet_types WHERE id = ?`, id);
  }
  for (const id of f.contracts) await run(`DELETE FROM contracts WHERE id = ?`, id);
  for (const t of [f.p.towerId, f.p2.towerId, f.q.towerId])
    await run(`DELETE FROM towers WHERE id = ?`, t);
  await run(`DELETE FROM suppliers WHERE id = ?`, f.supplierId);
  await run(`DELETE FROM systems WHERE id = ?`, f.systemId);
  await run(`DELETE FROM user_projects WHERE user_id = ?`, f.pmId);
  await run(`DELETE FROM users WHERE id = ?`, f.pmId);
  for (const id of projects) await run(`DELETE FROM projects WHERE id = ?`, id);
  dangXuat();
}

async function hopDong(f: Fixture, projectId: number) {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'giao_thau', 'HĐ S11', 'NT S11', 0, 'active', ?)`,
    uniq("HD-S11-"),
    projectId,
  );
  f.contracts.push(id);
  return id;
}

async function phieu(
  projectId: number,
  amount: string,
  opts: { sheetId?: number; floor?: string; contractId?: number; type?: string } = {},
) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO payment_bills
            (responsible, type, amount, paid_date, sheet_type_id, floor_label, contract_id, project_id)
     VALUES ('S11', ?, ?::numeric, CURRENT_DATE, ?, ?, ?, ?)`,
    opts.type ?? "bill",
    amount,
    opts.sheetId ?? null,
    opts.floor ?? null,
    opts.contractId ?? null,
    projectId,
  );
}

async function boq(f: Fixture, amount: string, systemId: number | null) {
  const { insertId } = await import("@/lib/db");
  await insertId(
    `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id)
     VALUES (?, 'BOQ S11', 'm', ?, 1, ?::numeric, ?)`,
    uniq("BOQ-S11-"),
    systemId,
    amount,
    f.p.projectId,
  );
}

async function hdTang(sheetId: number, floor: string, value: string) {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?::numeric)`,
    sheetId,
    floor,
    value,
  );
}

async function getCosts(query: string): Promise<{ status: number; body: Body }> {
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(new NextRequest(`http://localhost/api/costs${query}`, { headers: V1 }));
  return { status: res.status, body: (await res.json()) as Body };
}

const tongDong = (rows: Row[], k: keyof Amounts) =>
  rows.reduce((s, r) => s + BigInt(r[k].replace(".", "")), 0n);
const minor = (s: string) => BigInt(s.replace(".", ""));

test(
  "Q-AC05/A4-AC02: phiếu đúng dự án không sheet/không HĐ tầng vẫn ở tổng (unassigned), floor không rơi",
  S,
  async () => {
    const f = await dung();
    try {
      const hd = await hopDong(f, f.p.projectId);
      await phieu(f.p.projectId, "700.00", { contractId: hd }); // kiểu phiếu duyệt IPC: không sheet
      await phieu(f.p.projectId, "300.00", { sheetId: f.p.sheetId, floor: "T1" });
      await phieu(f.p.projectId, "300.00", { sheetId: f.p.sheetId, floor: "T1" }); // cùng tiền khác ID

      const sys = await getCosts("?groupBy=system");
      assert.equal(sys.status, 200);
      assert.equal(sys.body.totals.actual, "1300.00", "totals (legacy) = tổng dự án");
      const chuaPhan = sys.body.rows.find((r) => r.unassigned);
      assert.ok(chuaPhan, "phải có dòng chưa phân hệ");
      assert.equal(chuaPhan.actual, "700.00");
      assert.equal(chuaPhan.systemId, null);
      assert.equal(sys.body.rows.find((r) => r.key === f.systemCode)?.actual, "600.00");
      assert.deepEqual(sys.body.selectedTotals, sys.body.projectTotals);
      assert.equal(sys.body.coverage?.reconciled, true);

      const fl = await getCosts("?groupBy=floor");
      assert.equal(fl.status, 200);
      assert.equal(fl.body.totals.actual, "1300.00");
      assert.equal(fl.body.selectedTotals?.actual, "1300.00");
      assert.equal(tongDong(fl.body.rows, "actual"), 130000n, "rows tầng + unassigned đủ tiền");
      const t1 = fl.body.rows.find((r) => r.sheetTypeId === f.p.sheetId && r.floorLabel === "T1");
      assert.ok(t1, "phiếu có tầng nhưng chưa có HĐ tầng vẫn có dòng");
      assert.equal(t1.actual, "600.00");
      assert.equal(t1.budget, "0.00");
    } finally {
      await donDep(f);
    }
  },
);

test(
  "Q-AC05: lineage mâu thuẫn (sheet/HĐ thuộc dự án khác) không vào tổng P lẫn Q, coverage báo lỗi",
  S,
  async () => {
    const f = await dung();
    try {
      const hdQ = await hopDong(f, f.q.projectId);
      await phieu(f.p.projectId, "50.00", { sheetId: f.q.sheetId, floor: "T1" });
      await phieu(f.p.projectId, "60.00", { contractId: hdQ });
      await phieu(f.p.projectId, "5.00", { sheetId: f.p.sheetId, floor: "T1" });

      const p = await getCosts("?groupBy=system");
      assert.equal(p.status, 200);
      assert.equal(p.body.totals.actual, "5.00", "không chọn lineage thuận tiện để đưa tiền vào");
      assert.equal(p.body.coverage?.reconciled, false);
      assert.equal(p.body.coverage?.conflicts.payments, 2);

      await dangNhapDuAn({ id: f.pmId, passwordHash: f.passwordHash }, f.q.projectId);
      const q = await getCosts("?groupBy=system");
      assert.equal(q.status, 200);
      assert.equal(q.body.totals.actual, "0.00", "phiếu của P không rò sang báo cáo Q qua sheet");
      assert.equal(q.body.coverage?.reconciled, true, "Q không thấy chứng từ của P");
    } finally {
      await donDep(f);
    }
  },
);

test(
  "A4-AC01/FR04: tầng nhóm theo sheet_type_id + floor_label — 2 tháp cùng mã sheet không gộp/trùng key",
  S,
  async () => {
    const f = await dung();
    try {
      await hdTang(f.p.sheetId, "T1", "1000.00");
      await hdTang(f.p2.sheetId, "T1", "2000.00");
      await phieu(f.p.projectId, "100.00", { sheetId: f.p.sheetId, floor: "T1" });
      await phieu(f.p.projectId, "40.00", { sheetId: f.p2.sheetId, floor: "T2" });
      await boq(f, "10.00", f.systemId);

      const fl = await getCosts("?groupBy=floor");
      assert.equal(fl.status, 200);
      const keys = fl.body.rows.map((r) => r.key);
      assert.equal(new Set(keys).size, keys.length, "key dòng tầng phải duy nhất");
      assert.equal(new Set(fl.body.rows.map((r) => r.label)).size, fl.body.rows.length);
      const r1 = fl.body.rows.find((r) => r.sheetTypeId === f.p.sheetId && r.floorLabel === "T1");
      const r2 = fl.body.rows.find((r) => r.sheetTypeId === f.p2.sheetId && r.floorLabel === "T1");
      const r3 = fl.body.rows.find((r) => r.sheetTypeId === f.p2.sheetId && r.floorLabel === "T2");
      assert.equal(r1?.budget, "1000.00");
      assert.equal(r1?.actual, "100.00");
      assert.equal(r2?.budget, "2000.00");
      assert.equal(r2?.actual, "0.00");
      assert.equal(r3?.actual, "40.00");
      // selectedTotals = tổng rows (proxy HĐ tầng); projectTotals giữ ngân sách BOQ của dự án.
      assert.equal(fl.body.selectedTotals?.budget, "3000.00");
      assert.equal(fl.body.projectTotals?.budget, "10.00");
      assert.equal(
        fl.body.totals.budget,
        "10.00",
        "totals legacy = tổng dự án, không đổi theo tab",
      );
      assert.equal(fl.body.metadata?.budgetBasis, "floor-contract-proxy");
      assert.equal(fl.body.metadata?.groupBy, "floor");
      assert.equal(fl.body.metadata?.reportVersion, "cost-report-v1");
      const sys = await getCosts("?groupBy=system");
      assert.equal(sys.body.metadata?.budgetBasis, "boq");
      // Hai HĐ tầng (khác grain) đều là cam kết dự án.
      assert.equal(sys.body.totals.committed, "3000.00");
    } finally {
      await donDep(f);
    }
  },
);

test(
  "A4-FR04: BOQ thiếu hệ và PO vật tư chưa gắn sheet vẫn vào tổng dự án (unassigned, systemId null)",
  S,
  async () => {
    const f = await dung();
    try {
      const { insertId, run } = await import("@/lib/db");
      await boq(f, "5.00", null);
      await boq(f, "10.00", f.systemId);
      const matId = await insertId(
        `INSERT INTO materials (name, unit, project_id) VALUES ('VT không sheet', 'cái', ?)`,
        f.p.projectId,
      );
      const poId = await insertId(
        `INSERT INTO purchase_orders (supplier_id, status, project_id) VALUES (?, 'confirmed', ?)`,
        f.supplierId,
        f.p.projectId,
      );
      await run(
        `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 2, 1.00)`,
        poId,
        matId,
      );
      const sys = await getCosts("?groupBy=system&includeVo=1");
      assert.equal(sys.status, 200);
      assert.equal(sys.body.totals.budget, "15.00");
      assert.equal(sys.body.totals.committed, "2.00");
      const chuaPhan = sys.body.rows.find((r) => r.unassigned);
      assert.equal(chuaPhan?.budget, "5.00");
      assert.equal(chuaPhan?.committed, "2.00");
      assert.equal(sys.body.coverage?.unassigned.boq, 1);
      assert.equal(sys.body.coverage?.unassigned.purchaseOrders, 1);
    } finally {
      await donDep(f);
    }
  },
);

test(
  "A4-AC04/AC08: commit chen giữa lúc dựng báo cáo không tạo 2 snapshot; 1 câu nghiệp vụ dù nhiều nhóm",
  S,
  async () => {
    const f = await dung();
    const proto = pg.Client.prototype as unknown as {
      query: (...args: unknown[]) => Promise<unknown>;
    };
    const goc = proto.query;
    let chen = false;
    let soCauPhieu = 0;
    try {
      await hdTang(f.p.sheetId, "T1", "1000.00");
      await hdTang(f.p2.sheetId, "T1", "1000.00");
      await phieu(f.p.projectId, "100.00", { sheetId: f.p.sheetId, floor: "T1" });
      const ngoai = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await ngoai.connect();
      proto.query = async function (this: unknown, ...args: unknown[]) {
        const sql = typeof args[0] === "string" ? args[0] : "";
        const kq = await goc.apply(this, args);
        if (this !== ngoai && sql.includes("payment_bills")) {
          soCauPhieu++;
          if (!chen) {
            chen = true;
            // Giao dịch khác COMMIT phiếu mới ngay sau câu đọc đầu tiên của báo cáo.
            await goc.call(
              ngoai,
              `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label, project_id)
               VALUES ('S11 chen', 'bill', 1000, CURRENT_DATE, $1, 'T1', $2)`,
              [f.p.sheetId, f.p.projectId],
            );
          }
        }
        return kq;
      };
      let fl: { status: number; body: Body };
      try {
        fl = await getCosts("?groupBy=floor");
      } finally {
        proto.query = goc;
        await ngoai.end();
      }
      assert.equal(fl.status, 200);
      assert.equal(chen, true);
      assert.equal(soCauPhieu, 1, "rows + totals + alerts đọc trong đúng 1 câu SQL");
      const tongRows = tongDong(fl.body.rows, "actual");
      assert.equal(tongRows, minor(fl.body.totals.actual), "rows và totals cùng snapshot");
      assert.equal(fl.body.totals.actual, "100.00");
    } finally {
      proto.query = goc;
      await donDep(f);
    }
  },
);

test(
  "A4-AC03/FR07: VO theo includeVo, PO huỷ loại, advance tính; ngân sách 0 không sinh cảnh báo",
  S,
  async () => {
    const f = await dung();
    try {
      const { insertId, run } = await import("@/lib/db");
      await boq(f, "1000.00", f.systemId);
      const voOk = await insertId(
        `INSERT INTO variation_orders (code, title, reason, status, project_id)
         VALUES (?, 'VO duyệt', 'other', 'approved', ?)`,
        uniq("VO-S11-"),
        f.p.projectId,
      );
      const voNhap = await insertId(
        `INSERT INTO variation_orders (code, title, reason, status, project_id)
         VALUES (?, 'VO nháp', 'other', 'draft', ?)`,
        uniq("VO-S11-"),
        f.p.projectId,
      );
      for (const [vo, qty] of [
        [voOk, "3.000"],
        [voNhap, "7.000"],
      ] as const) {
        await run(
          `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, qty_approved, unit_price, vo_id, project_id)
           VALUES (?, 'Dòng VO', 'm', ?, ?::numeric, ?::numeric, 10.00, ?, ?)`,
          uniq("BOQ-S11-VO-"),
          f.systemId,
          qty,
          qty,
          vo,
          f.p.projectId,
        );
      }
      const matId = await insertId(
        `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'VT', 'cái', ?)`,
        f.p.sheetId,
        f.p.projectId,
      );
      for (const status of ["confirmed", "cancelled"]) {
        const poId = await insertId(
          `INSERT INTO purchase_orders (supplier_id, status, project_id) VALUES (?, ?, ?)`,
          f.supplierId,
          status,
          f.p.projectId,
        );
        await run(
          `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 1, 950.00)`,
          poId,
          matId,
        );
      }
      await phieu(f.p.projectId, "20.00", { sheetId: f.p.sheetId, floor: "T1", type: "advance" });

      const coVo = await getCosts("?groupBy=system&includeVo=1");
      const r = coVo.body.rows.find((x) => x.key === f.systemCode)!;
      assert.equal(r.budget, "1030.00", "gốc + VO đã duyệt, không VO nháp");
      assert.equal(r.committed, "950.00", "PO huỷ không tính");
      assert.equal(r.actual, "20.00", "tạm ứng tính vào thực chi");
      // 950/1030 = 92,23% ≥ 90% (ngưỡng mặc định) → cảnh báo.
      assert.ok(coVo.body.alerts.some((a) => a.key === f.systemCode));
      const khongVo = await getCosts("?groupBy=system&includeVo=0");
      const r0 = khongVo.body.rows.find((x) => x.key === f.systemCode)!;
      assert.equal(r0.budget, "1000.00");
      // 950/1000 = 95% ≥ 90% (ngưỡng mặc định) → cảnh báo, chưa vượt 100%.
      assert.ok(khongVo.body.alerts.some((a) => a.key === f.systemCode));
      // Ngân sách 0 (hệ rỗng) không sinh cảnh báo Infinity/100% giả.
      assert.ok(khongVo.body.alerts.every((a) => a.key === f.systemCode));
    } finally {
      const { run } = await import("@/lib/db");
      await run(`DELETE FROM boq_items WHERE project_id = ?`, f.p.projectId);
      await run(`DELETE FROM variation_orders WHERE project_id = ?`, f.p.projectId);
      await donDep(f);
    }
  },
);

test(
  "A1-AC06/Q-AC05: role ứng dụng NOBYPASSRLS — cha bị RLS che vẫn là mâu thuẫn, tổng khớp role owner",
  S,
  async () => {
    const f = await dung();
    try {
      const { withTransaction, run } = await import("@/lib/db");
      const { getCostReport } = await import("@/lib/tai-chinh/cost");
      const hdQ = await hopDong(f, f.q.projectId);
      const hdP = await hopDong(f, f.p.projectId);
      await phieu(f.p.projectId, "60.00", { contractId: hdQ }); // HĐ của Q: RLS che khi GUC=P
      await phieu(f.p.projectId, "70.00", { contractId: hdP });
      await phieu(f.p.projectId, "8.00", { sheetId: f.p.sheetId, floor: "T1" });
      await boq(f, "100.00", f.systemId);

      const owner = await getCostReport(f.p.projectId, { groupBy: "system", includeVo: true });
      const app = await withTransaction(async () => {
        await run(`SET LOCAL ROLE xboss_app`);
        return getCostReport(f.p.projectId, { groupBy: "system", includeVo: true });
      });
      for (const r of [owner, app]) {
        assert.equal(r.projectTotals.actual, 7800n);
        assert.equal(r.projectTotals.budget, 10000n);
        assert.equal(r.coverage.conflicts.payments, 1);
        assert.equal(r.coverage.reconciled, false);
      }
      assert.deepEqual(app.rows, owner.rows);
    } finally {
      await donDep(f);
    }
  },
);
