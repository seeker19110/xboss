import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S10b/S11 — báo cáo chi phí chuẩn qua ROUTE THẬT (GET /api/costs) + service
// `getCostReport`. Map AC: A4-AC01..AC04, A3-AC01 (tiền lớn exact), A3-FR04 (qty PO float),
// Q-AC04 (DTO string exact), Q-AC05 (payment direct project + mọi parent).
// Ca dùng định dạng legacy (không header) được viết để chạy được cả trên code cũ — bằng chứng đỏ
// trước khi vá ghi trong PROGRESS.md.

const S = { skip: !HAS_TEST_DB };
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };

const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

type Body = Record<string, unknown>;
type Row = {
  key: string;
  label: string;
  systemId: number | null;
  sheetTypeId: number | null;
  floorLabel: string | null;
  unassigned: boolean;
  level: string;
  usagePct: number | null;
  budget: string | number;
  committed: string | number;
  actual: string | number;
};
type Totals = { budget: string | number; committed: string | number; actual: string | number };

const maHe = new Map<number, string>();

async function systemId(code: string): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = ?`, code);
  assert.ok(row, `thiếu hệ ${code}`);
  maHe.set(row.id, code);
  return row.id;
}

/** Dự án đã tạo — after() dọn toàn bộ dữ liệu theo dự án, không để lại hệ/sheet/VO làm lệch
 *  các test tổng hợp toàn cục chạy sau trong cùng database worker (dashboardext, systems). */
const duAnDaTao: number[] = [];

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(`INSERT INTO projects (name) VALUES (?)`, `S11 ${uniq(ten)}`);
  duAnDaTao.push(id);
  return id;
}

const SHEETS_CUA_DU_AN = `SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id
                           WHERE tw.project_id = ?`;
const HOP_DONG_CUA_DU_AN = `SELECT id FROM contracts WHERE project_id = ?`;

/** Bước 1 (chạy cho MỌI dự án trước): thanh toán, kể cả dòng chéo dự án trỏ sheet/HĐ/đợt. */
async function donThanhToan(projectId: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM payment_bills WHERE project_id = ? OR sheet_type_id IN (${SHEETS_CUA_DU_AN})
        OR contract_id IN (${HOP_DONG_CUA_DU_AN})
        OR payment_cert_id IN (SELECT id FROM payment_certs
                                WHERE contract_id IN (${HOP_DONG_CUA_DU_AN}))`,
    projectId,
    projectId,
    projectId,
    projectId,
  );
}

/** Bước 2: phần còn lại của dự án, con trước cha. */
async function donDuAn(projectId: number): Promise<void> {
  const { run } = await import("@/lib/db");
  const sheets = SHEETS_CUA_DU_AN;
  const hopDong = HOP_DONG_CUA_DU_AN;
  await run(
    `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM purchase_orders WHERE project_id = ?`, projectId);
  await run(`DELETE FROM materials WHERE project_id = ?`, projectId);
  await run(`DELETE FROM floor_contracts WHERE sheet_type_id IN (${sheets})`, projectId);
  await run(`DELETE FROM boq_items WHERE project_id = ?`, projectId);
  await run(`DELETE FROM variation_orders WHERE project_id = ?`, projectId);
  await run(`DELETE FROM payment_certs WHERE contract_id IN (${hopDong})`, projectId);
  await run(`DELETE FROM contracts WHERE project_id = ?`, projectId);
  await run(`DELETE FROM sheet_types WHERE id IN (${sheets})`, projectId);
  await run(`DELETE FROM towers WHERE project_id = ?`, projectId);
  await run(`DELETE FROM user_projects WHERE project_id = ?`, projectId);
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
}

async function taoSheet(projectId: number, sysId: number | null, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`,
    projectId,
  );
  return insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, ?, ?)`,
    towerId,
    `S11-${uniq(ten)}`,
    `Sheet ${ten}`,
    sysId,
  );
}

async function taoHopDong(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'giao_thau', ?, 'Đối tác', 1000, 'active', ?)`,
    `S11HD-${uniq(ten)}`,
    `HĐ ${ten}`,
    projectId,
  );
}

async function taoBoq(
  projectId: number,
  sysId: number | null,
  qty: string,
  price: string,
  extra: { voId?: number; qtyApproved?: string } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id, vo_id, qty_approved)
     VALUES (?, 'Dòng BOQ', 'm', ?, ?::numeric, ?::numeric, ?, ?, ?::numeric)`,
    `S11BOQ-${uniq("b")}`,
    sysId,
    qty,
    price,
    projectId,
    extra.voId ?? null,
    extra.qtyApproved ?? null,
  );
}

async function taoPoItem(
  projectId: number,
  sheetTypeId: number | null,
  qty: number,
  price: string,
  status = "confirmed",
): Promise<void> {
  const { insertId, run } = await import("@/lib/db");
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, project_id, name, unit) VALUES (?, ?, 'VT S11', 'cái')`,
    sheetTypeId,
    projectId,
  );
  const poId = await insertId(
    `INSERT INTO purchase_orders (po_code, status, project_id) VALUES (?, ?, ?)`,
    `S11PO-${uniq("p")}`,
    status,
    projectId,
  );
  await run(
    `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, ?, ?::numeric)`,
    poId,
    matId,
    qty,
    price,
  );
}

async function taoThanhToan(p: {
  projectId: number | null;
  amount: string;
  sheetTypeId?: number | null;
  floorLabel?: string | null;
  contractId?: number | null;
  certId?: number | null;
  type?: string;
}): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, floor_label,
                                project_id, contract_id, payment_cert_id)
     VALUES ('S11', ?, ?::numeric, CURRENT_DATE, ?, ?, ?, ?, ?)`,
    p.type ?? "bill",
    p.amount,
    p.sheetTypeId ?? null,
    p.floorLabel ?? null,
    p.projectId,
    p.contractId ?? null,
    p.certId ?? null,
  );
}

async function taoTangHopDong(sheetTypeId: number, floor: string, value: string): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?::numeric)`,
    sheetTypeId,
    floor,
    value,
  );
}

async function dangNhapPm(projectId: number): Promise<void> {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('PM S11', ?, 'hash-s11', 'pm', 1)`,
    `s11-${uniq("pm")}@test.local`,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
}

async function goiCosts(
  query = "",
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Body; headers: Headers }> {
  const { GET } = await import("@/app/api/costs/route");
  const res = await GET(
    new NextRequest(`http://localhost/api/costs${query}`, { method: "GET", headers }),
  );
  return { status: res.status, body: (await res.json()) as Body, headers: res.headers };
}

const rowsOf = (body: Body) => body.rows as Row[];
// Khớp theo system ID; `key === mã hệ` chỉ để bộ test chạy được trên route cũ (bằng chứng đỏ).
const rowOfSystem = (body: Body, id: number) =>
  rowsOf(body).find(
    (r) => r.systemId === id || (r.systemId === undefined && r.key === maHe.get(id)),
  );

/** Chuỗi canonical → bigint đồng×100 (oracle không qua float). */
async function minor(v: string | number): Promise<bigint> {
  assert.equal(typeof v, "string", "định dạng v1 phải trả chuỗi");
  const { parseFixedDecimalExact } = await import("@/lib/nen/money");
  return parseFixedDecimalExact(v as string, 2);
}

// ─────────────────────────────── A4-AC01 ───────────────────────────────

test(
  "A4-AC01: hai thanh toán cùng số tiền khác id đều được tính; tầng không nhân đôi",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("ac01");
    const st = await taoSheet(p, dien, "ac01");
    await taoTangHopDong(st, "T1", "20000.00");
    await taoThanhToan({ projectId: p, amount: "3000.00", sheetTypeId: st, floorLabel: "T1" });
    await taoThanhToan({ projectId: p, amount: "3000.00", sheetTypeId: st, floorLabel: "T1" });
    await dangNhapPm(p);

    const sys = await goiCosts();
    assert.equal(sys.status, 200);
    const r = rowOfSystem(sys.body, dien)!;
    assert.equal(r.actual, 6000);
    assert.equal(r.committed, 20000);

    const floor = await goiCosts("?groupBy=floor");
    const fr = rowsOf(floor.body).filter((x) => x.label.endsWith("· T1"));
    assert.equal(fr.length, 1, "UNIQUE(sheet_type_id, floor_label) → đúng 1 dòng tầng");
    assert.equal(fr[0].budget, 20000);
    assert.equal(fr[0].committed, 20000);
    assert.equal(fr[0].actual, 6000);
  },
);

// ─────────────────────────────── A4-AC02 ───────────────────────────────

test(
  "A4-AC02: nguồn đúng dự án chưa gán hệ/tầng vẫn trong tổng dự án, không rơi mất",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("ac02");
    const st = await taoSheet(p, dien, "ac02");
    await taoBoq(p, dien, "1", "1000.00");
    await taoBoq(p, null, "1", "500.00"); // BOQ chưa gán hệ
    await taoThanhToan({ projectId: p, amount: "700.00" }); // không sheet, không tầng
    await taoThanhToan({ projectId: p, amount: "100.00", sheetTypeId: st }); // có sheet, thiếu tầng
    await taoTangHopDong(st, "T2", "50.00");
    await dangNhapPm(p);

    const sys = await goiCosts();
    assert.equal(sys.status, 200);
    const totals = sys.body.totals as Totals;
    assert.equal(totals.budget, 1500, "BOQ chưa gán hệ vẫn vào ngân sách dự án");
    assert.equal(totals.actual, 800, "thanh toán không sheet vẫn vào thực chi dự án");
    const unassigned = rowsOf(sys.body).find((r) => r.unassigned);
    assert.ok(unassigned, "phải có dòng 'Chưa gán hệ'");
    assert.equal(unassigned.systemId, null);
    assert.equal(unassigned.budget, 500);
    assert.equal(unassigned.actual, 700);

    const floor = await goiCosts("?groupBy=floor");
    const fu = rowsOf(floor.body).find((r) => r.unassigned);
    assert.ok(fu, "nhóm tầng phải có dòng 'Chưa gán tầng'");
    assert.equal(fu.actual, 800);
    assert.equal((floor.body.selectedTotals as Totals).actual, 800);
    assert.equal((floor.body.projectTotals as Totals).actual, 800);
    const meta = floor.body.metadata as { coverage: { unassigned: { payments: number } } };
    assert.equal(meta.coverage.unassigned.payments, 2);
  },
);

test(
  "A4-AC02/Q-AC05: lineage lệch dự án bị loại khỏi tổng và báo đối soát, không lộ chéo",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("qac05-p");
    const q = await taoDuAn("qac05-q");
    const stP = await taoSheet(p, dien, "qac05-p");
    const stQ = await taoSheet(q, dien, "qac05-q");
    const hdQ = await taoHopDong(q, "qac05");
    const { insertId } = await import("@/lib/db");
    const certQ = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status) VALUES (?, ?, 1, 'approved')`,
      `S11IPC-${uniq("c")}`,
      hdQ,
    );
    await taoThanhToan({ projectId: p, amount: "1000.00", sheetTypeId: stP, floorLabel: "T1" }); // hợp lệ
    // (a) project P nhưng hợp đồng thuộc Q; (b) project Q nhưng sheet thuộc P;
    // (c) project P nhưng đợt IPC của hợp đồng Q; (d) project P nhưng sheet thuộc Q.
    await taoThanhToan({ projectId: p, amount: "11.00", sheetTypeId: stP, contractId: hdQ });
    await taoThanhToan({ projectId: q, amount: "22.00", sheetTypeId: stP, floorLabel: "T1" });
    await taoThanhToan({ projectId: p, amount: "33.00", sheetTypeId: stP, certId: certQ });
    await taoThanhToan({ projectId: p, amount: "44.00", sheetTypeId: stQ, floorLabel: "T1" });
    await dangNhapPm(p);

    const res = await goiCosts();
    assert.equal(res.status, 200);
    assert.equal((res.body.totals as Totals).actual, 1000, "chỉ thanh toán có lineage nhất quán");
    assert.equal(rowOfSystem(res.body, dien)!.actual, 1000);
    const cov = (res.body.metadata as { coverage: Record<string, unknown> }).coverage as {
      reconciled: boolean;
      invalidScope: { payments: number };
    };
    assert.equal(cov.reconciled, false, "có dòng lệch phạm vi → báo cáo cần đối soát");
    assert.equal(cov.invalidScope.payments, 4);
    // Không lộ số tiền của dòng lệch phạm vi ở bất kỳ đâu trong response.
    const raw = JSON.stringify(res.body);
    for (const leak of ["11", "22", "33", "44"]) {
      assert.ok(!new RegExp(`"(budget|committed|actual)":${leak}[,}]`).test(raw));
    }

    // Dự án Q cũng không nhận tiền của P qua sheet/hợp đồng chéo.
    await dangNhapPm(q);
    const resQ = await goiCosts();
    assert.equal((resQ.body.totals as Totals).actual, 0);
  },
);

// ─────────────────────────────── A4-AC03 ───────────────────────────────

test(
  "A4-AC03: includeVo/VO status/PO huỷ/advance giữ semantics; qty PO float nhân exact",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("ac03");
    const st = await taoSheet(p, dien, "ac03");
    const { insertId } = await import("@/lib/db");
    const voOk = await insertId(
      `INSERT INTO variation_orders (code, title, reason, system_id, status, project_id)
     VALUES (?, 'VO duyệt', 'other', ?, 'approved', ?)`,
      `S11VO-${uniq("ok")}`,
      dien,
      p,
    );
    const voDraft = await insertId(
      `INSERT INTO variation_orders (code, title, reason, system_id, status, project_id)
     VALUES (?, 'VO nháp', 'other', ?, 'draft', ?)`,
      `S11VO-${uniq("draft")}`,
      dien,
      p,
    );
    await taoBoq(p, dien, "100", "1000.00");
    await taoBoq(p, dien, "10", "500.00", { voId: voOk, qtyApproved: "10" });
    await taoBoq(p, dien, "10", "999.00", { voId: voDraft, qtyApproved: "10" });
    // 3 dòng PO qty 0.1 × 3.00 — float cũ ra 0.9000000000000001; PO huỷ không tính.
    await taoPoItem(p, st, 0.1, "3.00");
    await taoPoItem(p, st, 0.1, "3.00");
    await taoPoItem(p, st, 0.1, "3.00");
    await taoPoItem(p, st, 10, "999.00", "cancelled");
    await taoThanhToan({ projectId: p, amount: "300.00", sheetTypeId: st, type: "bill" });
    await taoThanhToan({ projectId: p, amount: "100.00", sheetTypeId: st, type: "advance" });
    await dangNhapPm(p);

    const withVo = rowOfSystem((await goiCosts("?includeVo=1")).body, dien)!;
    assert.equal(withVo.budget, 105000);
    assert.equal(withVo.committed, 0.9, "qty float8 nhân bằng numeric, không cộng float");
    assert.equal(withVo.actual, 400, "advance tính vào thực chi");
    const noVo = rowOfSystem((await goiCosts("?includeVo=0")).body, dien)!;
    assert.equal(noVo.budget, 100000);
  },
);

// ─────────────────────────────── A4-AC04 ───────────────────────────────

test(
  "A4-AC04: thanh toán + BOQ chèn đồng thời không cho hai snapshot trong một báo cáo",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("ac04");
    const st = await taoSheet(p, dien, "ac04");
    await taoBoq(p, dien, "1", "100.00");
    await taoThanhToan({ projectId: p, amount: "10.00", sheetTypeId: st });
    await dangNhapPm(p);

    // Nạp sẵn route (biên dịch lần đầu có thể lâu) để vòng chờ khoá chỉ đo câu SQL.
    await import("@/app/api/costs/route");
    const { getPool } = await import("@/lib/db");
    const locker = await getPool().connect();
    let pending: Promise<{ status: number; body: Body }> | undefined;
    try {
      await locker.query("BEGIN");
      // Báo cáo đọc payment_bills SAU các nguồn khác → bị chặn ở đó, khi snapshot đã mở.
      await locker.query("LOCK TABLE payment_bills IN ACCESS EXCLUSIVE MODE");
      pending = goiCosts();
      let waiting = 0;
      for (let i = 0; i < 600 && waiting === 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const r = await locker.query<{ n: string }>(
          `SELECT COUNT(*) AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query ILIKE '%JOIN payment_bills pb%'`,
        );
        waiting = Number(r.rows[0].n);
      }
      assert.equal(waiting, 1, "báo cáo phải đang chờ khoá ở câu đọc thanh toán");
      await locker.query(
        `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id)
       VALUES ($1, 'BOQ chen', 'm', $2, 1, 5000, $3)`,
        [`S11BOQ-${uniq("race")}`, dien, p],
      );
      await locker.query(
        `INSERT INTO payment_bills (responsible, type, amount, paid_date, sheet_type_id, project_id)
       VALUES ('S11', 'bill', 7000, CURRENT_DATE, $1, $2)`,
        [st, p],
      );
      await locker.query("COMMIT");
    } finally {
      locker.release();
    }
    const during = await pending!;
    assert.equal(during.status, 200);
    const t = during.body.totals as Totals;
    assert.equal(t.budget, 100, "BOQ chèn sau snapshot không thấy");
    assert.equal(t.actual, 10, "thanh toán chèn sau snapshot cũng không thấy — cùng một snapshot");
    const after = (await goiCosts()).body.totals as Totals;
    assert.equal(after.budget, 5100);
    assert.equal(after.actual, 7010);
  },
);

// ─────────────── A4-FR07 cảnh báo / A4 §3 totals + metadata (decimal-string-v1) ───────────────

test(
  "A4-FR07: ngân sách 0 + cam kết dương = chưa có ngân sách; ngưỡng so bằng nhân chéo exact",
  S,
  async (t) => {
    // Ngưỡng theo tổ chức (S02e); dự án test thuộc tổ chức mặc định 1 — chốt ngưỡng của ca này
    // rồi trả lại như cũ.
    const { getCostSettings, updateCostSettings } = await import("@/lib/tai-chinh/cost");
    const truoc = await getCostSettings(1);
    await updateCostSettings(1, { warnPct: 90, overPct: 100 });
    t.after(() => updateCostSettings(1, truoc));
    const dien = await systemId("dien");
    const nuoc = await systemId("nuoc");
    const acmv = await systemId("acmv");
    const p = await taoDuAn("fr07");
    const stDien = await taoSheet(p, dien, "fr07-dien");
    const stNuoc = await taoSheet(p, nuoc, "fr07-nuoc");
    const stAcmv = await taoSheet(p, acmv, "fr07-acmv");
    await taoPoItem(p, stDien, 1, "50.00"); // dien: chưa có BOQ
    await taoBoq(p, nuoc, "1", "100.00");
    await taoPoItem(p, stNuoc, 1, "90.00"); // đúng 90% → warn
    await taoBoq(p, acmv, "3", "1.00");
    await taoPoItem(p, stAcmv, 1, "2.69"); // 89.67% → không cảnh báo
    await dangNhapPm(p);

    const res = await goiCosts("", V1);
    assert.equal(res.status, 200);
    const rDien = rowOfSystem(res.body, dien)!;
    assert.equal(rDien.level, "no_budget");
    assert.equal(rDien.usagePct, null);
    assert.equal(rowOfSystem(res.body, nuoc)!.level, "warn");
    assert.equal(rowOfSystem(res.body, nuoc)!.usagePct, 90);
    assert.equal(rowOfSystem(res.body, acmv)!.level, "none");
    const alerts = res.body.alerts as { key: string; level: string; pct: number | null }[];
    const aDien = alerts.find((a) => a.key === rDien.key);
    assert.ok(aDien, "cam kết không ngân sách phải được cảnh báo");
    assert.equal(aDien.pct, null, "không Infinity/100% giả");
    assert.ok(!JSON.stringify(res.body).includes("Infinity"));

    // Legacy giữ hợp đồng cũ: alerts chỉ nhóm có ngân sách, pct là number.
    const legacy = await goiCosts();
    for (const a of legacy.body.alerts as { pct: unknown }[]) assert.equal(typeof a.pct, "number");
  },
);

test(
  "A4 §3: selectedTotals = Σ rows, projectTotals cơ sở BOQ, totals legacy = projectTotals",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("sel");
    const st = await taoSheet(p, dien, "sel");
    await taoBoq(p, dien, "100", "1000.00");
    await taoTangHopDong(st, "T1", "20000.00");
    await taoTangHopDong(st, "T2", "0.10");
    await taoThanhToan({ projectId: p, amount: "0.20", sheetTypeId: st, floorLabel: "T9" }); // tầng chưa có HĐ
    await dangNhapPm(p);

    const floor = await goiCosts("?groupBy=floor&includeVo=0", V1);
    assert.equal(floor.status, 200);
    assert.equal(floor.body.moneyFormat, "decimal-string-v1");
    assert.equal(floor.headers.get("Cache-Control"), "private, no-store");
    assert.match(floor.headers.get("Vary") ?? "", /X-XBoss-Money-Format/);
    const rows = rowsOf(floor.body);
    assert.ok(
      rows.some((r) => r.label.endsWith("· T9") && r.actual === "0.20"),
      "giữ thanh toán không có HĐ tầng",
    );
    const sel = floor.body.selectedTotals as Totals;
    const proj = floor.body.projectTotals as Totals;
    let budget = 0n;
    let actual = 0n;
    for (const r of rows) {
      budget += await minor(r.budget);
      actual += await minor(r.actual);
    }
    assert.equal(await minor(sel.budget), budget);
    assert.equal(await minor(sel.actual), actual);
    assert.equal(sel.budget, "20000.10", "ngân sách tầng = proxy hợp đồng tầng");
    assert.equal(proj.budget, "100000.00", "tổng dự án không bị ép bằng proxy tầng");
    assert.deepEqual(floor.body.totals, proj);
    const meta = floor.body.metadata as Record<string, unknown>;
    assert.equal(meta.projectId, p);
    assert.equal(meta.groupBy, "floor");
    assert.equal(meta.includeVo, false);
    assert.equal(meta.reportVersion, "cost-report-v1");
    assert.equal(meta.currency, "VND");
    assert.equal(meta.moneyFormat, "decimal-string-v1");
    assert.equal(meta.budgetBasis, "floor-contract-proxy");
    assert.ok(!Number.isNaN(Date.parse(String(meta.computedAt))));

    const sys = await goiCosts("", V1);
    assert.deepEqual(sys.body.selectedTotals, sys.body.projectTotals);
    assert.equal((sys.body.metadata as Record<string, unknown>).budgetBasis, "boq");
    assert.equal(
      (sys.body.metadata as { coverage: { reconciled: boolean } }).coverage.reconciled,
      true,
    );
  },
);

// ─────────────────────────────── A3-AC01 / Q-AC04 ───────────────────────────────

test(
  "A3-AC01: tổng lớn 90071992547409.92 exact ở v1; legacy ngoài biên → 422, không xấp xỉ",
  S,
  async () => {
    const dien = await systemId("dien");
    const p = await taoDuAn("big");
    const st = await taoSheet(p, dien, "big");
    for (let i = 0; i < 9; i++)
      await taoThanhToan({ projectId: p, amount: "9000000000000.00", sheetTypeId: st });
    await taoThanhToan({ projectId: p, amount: "9071992547409.91", sheetTypeId: st });
    await taoThanhToan({ projectId: p, amount: "0.01", sheetTypeId: st });
    // BOQ tích qty(15,3) × đơn giá(15,2) lớn — cộng rồi mới làm tròn 2 số lẻ.
    await taoBoq(p, dien, "1234567.891", "9876543.21");
    await taoBoq(p, dien, "0.001", "0.05");
    await dangNhapPm(p);

    const res = await goiCosts("", V1);
    assert.equal(res.status, 200);
    const r = rowOfSystem(res.body, dien)!;
    assert.equal(r.actual, "90071992547409.92");
    assert.equal((res.body.projectTotals as Totals).actual, "90071992547409.92");
    const { mulRatio, moneyToDecimal } = await import("@/lib/nen/money");
    const expected = mulRatio(1234567891n * 987654321n + 1n * 5n, 1n, 1000n);
    assert.equal(r.budget, moneyToDecimal(expected));

    const legacy = await goiCosts();
    assert.equal(legacy.status, 422);
    assert.equal(legacy.body.code, "money_precision_unsupported");
  },
);

test("getCostReport: phạm vi không hợp lệ bị chặn trước mọi query", async () => {
  const { getCostReport } = await import("@/lib/tai-chinh/cost");
  for (const projectId of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      getCostReport({ kind: "project", projectId }, { groupBy: "system", includeVo: true }),
      /cost_report_scope_invalid/,
    );
  }
});

test.after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  // Thanh toán chéo dự án (ca Q-AC05) trỏ sheet/hợp đồng/đợt của dự án kia → dọn thanh toán
  // của mọi dự án trước, rồi mới xoá cha.
  for (const id of duAnDaTao) await donThanhToan(id);
  for (const id of duAnDaTao) await donDuAn(id);
});
