import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  SoFixture,
  jreq,
  P,
  goi,
  uniq,
  TIEN_EXACT,
  type NguoiTest,
} from "./helpers/chuoi-nghiep-vu";
import { todayISO } from "@/lib/nen/date";

// M128 — chứng từ điều chỉnh / huỷ hiệu lực IPC đã duyệt (docs/nang-cap/M128-chung-tu-dieu-chinh-
// ipc.md §4). Mọi bước người dùng đi qua ROUTE HANDLER THẬT (lập/sửa/trình/duyệt IPC + chứng từ
// điều chỉnh, đánh dấu chi, báo cáo chi phí, hộp thư duyệt); luỹ kế hợp đồng đối chiếu ORACLE SQL
// độc lập (Σ KL kỳ của mọi đợt đã duyệt + Σ KL điều chỉnh đã duyệt — khác cách tính "snapshot đợt
// mới nhất" của lib). Tiền so bằng CHUỖI exact.
//
// Ca (2) và (3) đã được thấy ĐỎ trên code cũ: trước M128 các route /adjustments không tồn tại
// (import lỗi), và khi bỏ phần cộng điều chỉnh khỏi SQL luỹ kế (paymentcerts.ts) thì (2)(3) đỏ ở
// assert luỹ kế/cảnh báo vượt HĐ — xem báo cáo M128 + mục mutation trong scripts/mutation-check.mjs.

const S = { skip: !HAS_TEST_DB };
const LY_DO = "Sai khối lượng đo bóc đợt này";

test.after(() => dangXuat());

// ── Bước người dùng (route thật) ────────────────────────────────────────────────────────

async function taoHopDong(value: number, pct: { advancePct?: number; retentionPct?: number } = {}) {
  const { POST } = await import("@/app/api/contracts/route");
  const r = await goi(
    requestRieng(() =>
      POST(
        jreq(`/api/contracts`, {
          code: uniq("HD-M128-"),
          kind: "nhan_thau",
          title: "HĐ M128",
          partyName: "CĐT M128",
          status: "active",
          value,
          advancePct: pct.advancePct ?? 0,
          retentionPct: pct.retentionPct ?? 0,
        }),
      ),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoBoq(contractId: number, unitPrice: string) {
  const { POST } = await import("@/app/api/boq/route");
  const r = await goi(
    requestRieng(() =>
      POST(
        jreq(`/api/boq`, {
          code: uniq("BOQ-M128-"),
          name: "Dòng M128",
          unit: "m",
          qtyContract: 100,
          unitPrice,
        }),
      ),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body!.id as number;
  const { run } = await import("@/lib/db");
  await run(`UPDATE boq_items SET contract_id = ? WHERE id = ?`, contractId, id);
  return id;
}

type Dong = { boqItemId: number; qtyPeriod: number };

async function lapNhapDot(contractId: number, items: Dong[]): Promise<number> {
  const { POST: LAP } = await import("@/app/api/payment-certs/route");
  const lap = await goi(requestRieng(() => LAP(jreq(`/api/payment-certs`, { contractId }))));
  assert.equal(lap.status, 201, JSON.stringify(lap.body));
  const id = lap.body!.id as number;
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const sua = await goi(requestRieng(() => PATCH(jreq(`/x`, { items }, "PATCH"), P(id))));
  assert.equal(sua.status, 200, JSON.stringify(sua.body));
  return id;
}

/** PM đang đăng nhập lập → sửa KL → trình → duyệt (luồng IPC cũ, không engine). */
async function dotDaDuyet(contractId: number, items: Dong[]): Promise<number> {
  const id = await lapNhapDot(contractId, items);
  const { POST: TRINH } = await import("@/app/api/payment-certs/[id]/submit/route");
  assert.equal((await goi(requestRieng(() => TRINH(jreq(`/x`), P(id))))).status, 200);
  const { POST: DUYET } = await import("@/app/api/payment-certs/[id]/decide/route");
  const d = await goi(requestRieng(() => DUYET(jreq(`/x`, { decision: "approved" }), P(id))));
  assert.equal(d.status, 200, JSON.stringify(d.body));
  return id;
}

async function lapDC(certId: number, body: unknown) {
  const { POST } = await import("@/app/api/payment-certs/[id]/adjustments/route");
  return goi(
    requestRieng(() =>
      POST(jreq(`/api/payment-certs/${certId}/adjustments`, body, "POST", TIEN_EXACT), P(certId)),
    ),
  );
}

async function dsDC(certId: number, headers: Record<string, string> | undefined = TIEN_EXACT) {
  const { GET } = await import("@/app/api/payment-certs/[id]/adjustments/route");
  return goi(requestRieng(() => GET(jreq(`/x`, undefined, "GET", headers), P(certId))));
}

async function suaDC(id: number, body: unknown) {
  const { PATCH } = await import("@/app/api/adjustments/[id]/route");
  return goi(requestRieng(() => PATCH(jreq(`/x`, body, "PATCH", TIEN_EXACT), P(id))));
}

async function trinhDC(id: number) {
  const { POST } = await import("@/app/api/adjustments/[id]/submit/route");
  return goi(requestRieng(() => POST(jreq(`/x`), P(id))));
}

async function quyetDC(id: number, body: unknown, key?: string) {
  const { POST } = await import("@/app/api/adjustments/[id]/decide/route");
  return goi(
    requestRieng(() =>
      POST(jreq(`/x`, body, "POST", key ? { "Idempotency-Key": key } : undefined), P(id)),
    ),
  );
}

async function xemDot(certId: number) {
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  return goi(requestRieng(() => GET(jreq(`/x`, undefined, "GET", TIEN_EXACT), P(certId))));
}

async function tongChiPhi() {
  const { GET } = await import("@/app/api/costs/route");
  const r = await goi(
    requestRieng(() => GET(jreq(`/api/costs?groupBy=system`, undefined, "GET", TIEN_EXACT))),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const t = r.body!.projectTotals as Record<string, string>;
  return { actual: t.actual, approvedUnpaid: t.approvedUnpaid };
}

async function phieu(certId: number) {
  const { query } = await import("@/lib/db");
  return query<{ id: number; type: string; amount: string; payStatus: string }>(
    `SELECT id, type, amount::text AS amount, pay_status AS "payStatus"
       FROM payment_bills WHERE payment_cert_id = ? ORDER BY id`,
    certId,
  );
}

async function demBang(sql: string, ...args: unknown[]): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ n: number }>(sql, ...args))!.n;
}

/** Luỹ kế HĐ theo lib (snapshot đợt mới nhất + sổ điều chỉnh) — chuỗi exact. */
async function luyKeLib(contractId: number): Promise<string> {
  const { contractCumulativeValue } = await import("@/lib/tai-chinh/paymentcerts");
  const { moneyToDecimal } = await import("@/lib/nen/money");
  return moneyToDecimal(await contractCumulativeValue(contractId));
}

/** ORACLE độc lập: Σ KL kỳ × giá của MỌI đợt đã duyệt + Σ KL điều chỉnh × giá đã duyệt. */
async function luyKeOracle(contractId: number): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ v: string }>(
    `SELECT ROUND(COALESCE((SELECT SUM(i.qty_period * i.unit_price)
                              FROM payment_cert_items i JOIN payment_certs c ON c.id = i.cert_id
                             WHERE c.contract_id = ? AND c.status = 'approved'), 0)
                + COALESCE((SELECT SUM(ai.qty_delta * ai.unit_price)
                              FROM payment_cert_adjustment_items ai
                              JOIN payment_cert_adjustments a ON a.id = ai.adjustment_id
                             WHERE a.contract_id = ? AND a.status = 'approved'), 0), 2)::text AS v`,
    contractId,
    contractId,
  );
  return r!.v;
}

/** Dự án + PM (lập IPC + chứng từ) + Admin (duyệt chứng từ) + HĐ. */
async function dungDuAn(
  f: SoFixture,
  value: number,
  pct: { advancePct?: number; retentionPct?: number } = {},
) {
  const projectId = await f.duAn("m128");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  await f.vao(pm, projectId);
  const contractId = await taoHopDong(value, pct);
  return { projectId, pm, admin, contractId };
}

/** Lập + trình (PM) rồi duyệt (Admin) một chứng từ — trả id. */
async function dcDaDuyet(
  c: { projectId: number; pm: NguoiTest; admin: NguoiTest },
  certId: number,
  body: unknown,
): Promise<number> {
  await f_vao(c.pm, c.projectId);
  const lap = await lapDC(certId, body);
  assert.equal(lap.status, 201, JSON.stringify(lap.body));
  const id = lap.body!.id as number;
  assert.equal((await trinhDC(id)).status, 200);
  await f_vao(c.admin, c.projectId);
  const d = await quyetDC(id, { decision: "approved" });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal(d.body?.decision, "approved");
  return id;
}

let fHienTai: SoFixture | null = null;

/**
 * Số chốt cho ca "tạm ứng 10% / giữ lại 5%": đợt 10 × 1000. Quyết định 2026-10-09 (M128 §6, mục
 * 11): phiếu sinh từ chứng từ điều chỉnh tính RÒNG cùng ipc-sum-v1 — +2 × 1000 = 2000 gộp → phiếu
 * 2000 − 200 − 100 = 1700; giá trị chứng từ `adjustment` vẫn là KL × giá (gộp). Reversal = −Σ phiếu
 * còn hiệu lực (8500 + 1700). Trước quyết định: phiếu điều chỉnh 2000 (gộp), reversal −10500.
 */
const KY_VONG_TAM_UNG_GIU_LAI = {
  goc: [["bill", "8500.00", "committed"]],
  dieuChinh: "2000.00",
  reversal: "-10200.00",
  truocHuy: [
    ["bill", "8500.00", "committed"],
    ["adjustment", "1700.00", "committed"],
  ],
  sauHuy: [
    ["bill", "8500.00", "void"],
    ["adjustment", "1700.00", "void"],
  ],
};
const f_vao = (u: NguoiTest, projectId: number) => fHienTai!.vao(u, projectId);

// ── (1) chỉ đợt approved ────────────────────────────────────────────────────────────────

test(
  "M128 (1): lập chứng từ cho đợt nháp/đã trình → 409 cert_not_approved; lý do ngắn → 422 reason_too_short; adjustment không dòng → 422 items_required",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1234.56");
      const nhap = await lapNhapDot(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const r = await lapDC(nhap, { kind: "reversal", reason: LY_DO });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body?.code, "cert_not_approved");
      const { POST: TRINH } = await import("@/app/api/payment-certs/[id]/submit/route");
      assert.equal((await goi(requestRieng(() => TRINH(jreq(`/x`), P(nhap))))).status, 200);
      const r2 = await lapDC(nhap, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      assert.equal(r2.status, 409);
      assert.equal(r2.body?.code, "cert_not_approved");

      const ngan = await lapDC(nhap, { kind: "reversal", reason: "  ngắn  " });
      assert.equal(ngan.status, 422);
      assert.equal(ngan.body?.code, "reason_too_short");
      const rong = await lapDC(nhap, { kind: "adjustment", reason: LY_DO, items: [] });
      assert.equal(rong.status, 422);
      assert.equal(rong.body?.code, "items_required");
      assert.equal(
        await demBang(
          `SELECT COUNT(*)::int AS n FROM payment_cert_adjustments WHERE cert_id = ?`,
          nhap,
        ),
        0,
      );
    } finally {
      await f.don();
    }
  },
);

// ── (2) reversal ────────────────────────────────────────────────────────────────────────

test(
  "M128 (2a): reversal đợt committed — amount = −giá trị đợt exact; duyệt → luỹ kế HĐ về 0 (khớp oracle), hết cảnh báo vượt HĐ, phiếu gốc → void, KHÔNG sinh phiếu âm",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      // HĐ 10.000 đ, đợt 10 × 1234.56 = 12345.60 → vượt giá trị HĐ (cảnh báo cert_over_contract).
      const c = await dungDuAn(f, 10000);
      const a = await taoBoq(c.contractId, "1234.56");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const { overContractCerts } = await import("@/lib/tai-chinh/paymentcerts");
      const vuot = async () =>
        (await overContractCerts(c.projectId)).some((x) => x.contractId === c.contractId);
      assert.equal(await vuot(), true, "trước reversal: vượt HĐ");
      assert.equal(await luyKeLib(c.contractId), "12345.60");

      const lap = await lapDC(cert, { kind: "reversal", reason: LY_DO, items: [{ x: 1 }] });
      assert.equal(lap.status, 201, JSON.stringify(lap.body));
      const adj = lap.body!;
      assert.match(adj.code as string, /^ADJ-\d{4}-\d{4,}$/);
      assert.equal(adj.kind, "reversal");
      assert.equal(adj.status, "draft");
      assert.equal(adj.amount, "-12345.60");
      assert.equal(adj.createdBy, c.pm.id);
      assert.deepEqual(
        (adj.items as Record<string, unknown>[]).map((i) => [i.boqItemId, i.qtyDelta, i.unitPrice]),
        [[a, "-10.000", "1234.56"]],
        "dòng reversal do server sinh = −KL kỳ, items gửi lên bị bỏ qua",
      );
      const id = adj.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      await f.vao(c.admin, c.projectId);
      const d = await quyetDC(id, { decision: "approved" });
      assert.equal(d.status, 200, JSON.stringify(d.body));

      assert.equal(await luyKeLib(c.contractId), "0.00");
      assert.equal(await luyKeLib(c.contractId), await luyKeOracle(c.contractId), "oracle SQL");
      assert.equal(await vuot(), false, "sau reversal: hết cảnh báo vượt HĐ");
      assert.deepEqual(
        (await phieu(cert)).map((p) => [p.type, p.amount, p.payStatus]),
        [["bill", "12345.60", "void"]],
        "phiếu gốc chưa chi → void, không phiếu âm",
      );
      assert.deepEqual(await tongChiPhi(), { actual: "0.00", approvedUnpaid: "0.00" });

      const ds = await dsDC(cert);
      assert.equal(ds.status, 200);
      const sau = (ds.body!.adjustments as Record<string, unknown>[])[0];
      assert.deepEqual(
        [sau.status, sau.billId, sau.decidedBy, sau.decidedAt, sau.amount],
        ["approved", null, c.admin.id, todayISO(), "-12345.60"],
      );
      const xem = await xemDot(cert);
      assert.deepEqual(xem.body!.adjustmentsSummary, {
        open: 0,
        approvedCount: 1,
        reversed: true,
        netAmount: "-12345.60",
      });
      // Không chỉnh sửa lịch sử: dòng KL + trạng thái đợt gốc giữ nguyên; audit có vết.
      const cert0 = (xem.body!.cert as Record<string, unknown>).status;
      assert.equal(cert0, "approved");
      assert.ok(
        (await demBang(
          `SELECT COUNT(*)::int AS n FROM audit_log
            WHERE entity_type = 'payment_cert_adjustments' AND entity_id = ?`,
          id,
        )) >= 3,
        "audit: tạo + trình + duyệt",
      );
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 (2b): reversal đợt ĐÃ CHI → sinh phiếu âm type 'adjustment' committed gắn đợt gốc; phiếu gốc giữ paid; SoD chi phiếu âm theo người duyệt chứng từ",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 10000);
      const a = await taoBoq(c.contractId, "1234.56");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const [goc] = await phieu(cert);
      const { POST: PAY } = await import("@/app/api/payments/bills/[id]/pay/route");
      const chi = (billId: number) =>
        goi(requestRieng(() => PAY(jreq(`/x`, { paidAt: todayISO() }), P(billId))));
      await f.vao(c.admin, c.projectId);
      assert.equal((await chi(goc.id)).status, 200);

      await dcDaDuyet(c, cert, { kind: "reversal", reason: LY_DO });
      const ps = await phieu(cert);
      assert.deepEqual(
        ps.map((p) => [p.type, p.amount, p.payStatus]),
        [
          ["bill", "12345.60", "paid"],
          ["adjustment", "-12345.60", "committed"],
        ],
      );
      const ds = await dsDC(cert);
      assert.equal((ds.body!.adjustments as Record<string, unknown>[])[0].billId, ps[1].id);
      assert.equal(await luyKeLib(c.contractId), await luyKeOracle(c.contractId));
      assert.equal(await luyKeLib(c.contractId), "0.00");
      assert.deepEqual(await tongChiPhi(), { actual: "12345.60", approvedUnpaid: "-12345.60" });

      // Phiếu âm: người duyệt CHỨNG TỪ (admin) không tự đánh dấu chi; admin khác thì được.
      const tuChi = await chi(ps[1].id);
      assert.equal(tuChi.status, 403, JSON.stringify(tuChi.body));
      assert.equal(tuChi.body?.code, "sod_same_actor");
      const admin2 = await f.user("admin");
      await f.vao(admin2, c.projectId);
      assert.equal((await chi(ps[1].id)).status, 200);
      assert.deepEqual(await tongChiPhi(), { actual: "0.00", approvedUnpaid: "0.00" });
    } finally {
      await f.don();
    }
  },
);

// ── (3) adjustment một phần ─────────────────────────────────────────────────────────────

test(
  "M128 (3): điều chỉnh một phần — amount = ROUND(Σ qty_delta × giá gốc) trong SQL; luỹ kế HĐ + luỹ kế dòng BOQ đổi đúng (oracle); kỳ sau KHÔNG đổi",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1234.56");
      const b = await taoBoq(c.contractId, "1.25");
      const dot1 = await dotDaDuyet(c.contractId, [
        { boqItemId: a, qtyPeriod: 10 },
        { boqItemId: b, qtyPeriod: 10 },
      ]);
      const dot2 = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 5 }]);
      assert.equal(await luyKeLib(c.contractId), "18530.90");
      const { query } = await import("@/lib/db");
      const kySau = () =>
        query(
          `SELECT boq_item_id, qty_period::text, qty_cumulative::text, unit_price::text
             FROM payment_cert_items WHERE cert_id = ? ORDER BY boq_item_id`,
          dot2,
        );
      const kySauTruoc = await kySau();
      const phieuKySauTruoc = await phieu(dot2);

      // −2.5 × 1234.56 = −3086.400 ; 0.004 × 1.25 = 0.005 → Σ = −3086.395 → −3086.40
      // (làm tròn từng dòng rồi cộng sẽ ra −3086.39 — sai quy tắc).
      await f.vao(c.pm, c.projectId);
      const lap = await lapDC(dot1, {
        kind: "adjustment",
        reason: LY_DO,
        items: [
          { boqItemId: a, qtyDelta: "-2.5", note: "Đo lại" },
          { boqItemId: b, qtyDelta: 0.004 },
        ],
      });
      assert.equal(lap.status, 201, JSON.stringify(lap.body));
      assert.equal(lap.body!.amount, "-3086.40");
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      await f.vao(c.admin, c.projectId);
      assert.equal((await quyetDC(id, { decision: "approved" })).status, 200);

      assert.equal(await luyKeLib(c.contractId), "15444.51");
      assert.equal(await luyKeLib(c.contractId), await luyKeOracle(c.contractId), "oracle SQL");
      assert.deepEqual(
        (await phieu(dot1)).map((p) => [p.type, p.amount, p.payStatus]),
        [
          ["bill", "12358.10", "committed"],
          ["adjustment", "-3086.40", "committed"],
        ],
      );
      assert.deepEqual(await kySau(), kySauTruoc, "kỳ sau giữ nguyên dòng KL/luỹ kế/đơn giá");
      assert.deepEqual(await phieu(dot2), phieuKySauTruoc, "phiếu kỳ sau giữ nguyên");

      // Luỹ kế HIỆU LỰC của dòng ở kỳ mới (nháp) = Σ KL đã duyệt + điều chỉnh + KL kỳ này.
      await f.vao(c.pm, c.projectId);
      const dot3 = await lapNhapDot(c.contractId, [{ boqItemId: a, qtyPeriod: 1 }]);
      const { dongLuyKeHieuLuc } = await import("@/lib/tai-chinh/paymentcerts");
      const dong = (await dongLuyKeHieuLuc(dot3)).find((d) => d.boqItemId === a)!;
      const { queryOne } = await import("@/lib/db");
      const oracleDong = await queryOne<{ v: string }>(
        `SELECT (COALESCE((SELECT SUM(i.qty_period) FROM payment_cert_items i
                             JOIN payment_certs pc ON pc.id = i.cert_id
                            WHERE pc.contract_id = ? AND pc.status = 'approved'
                              AND i.boq_item_id = ?), 0)
               + COALESCE((SELECT SUM(ai.qty_delta) FROM payment_cert_adjustment_items ai
                             JOIN payment_cert_adjustments x ON x.id = ai.adjustment_id
                            WHERE x.contract_id = ? AND x.status = 'approved'
                              AND ai.boq_item_id = ?), 0) + 1)::text AS v`,
        c.contractId,
        a,
        c.contractId,
        a,
      );
      assert.equal(dong.qtyCumulative, "13.500");
      assert.equal(dong.qtyCumulative, oracleDong!.v);

      // Giảm quá KL hiện có của dòng trong đợt → 422 qty_below_zero; dòng ngoài đợt → 422.
      const am = await lapDC(dot2, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "-5.001" }],
      });
      assert.equal(am.status, 422, JSON.stringify(am.body));
      assert.equal(am.body?.code, "qty_below_zero");
      const ngoai = await lapDC(dot2, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: b, qtyDelta: "1" }],
      });
      assert.equal(ngoai.status, 422);
      assert.equal(ngoai.body?.code, "item_not_in_cert");

      // Huỷ hiệu lực đợt 1 SAU điều chỉnh: huỷ cả phần điều chỉnh đã duyệt của đợt —
      // dòng = −(KL kỳ + Σ điều chỉnh), amount = −Σ phiếu còn hiệu lực (12358.10 − 3086.40);
      // mọi phiếu của đợt còn committed → void hết, không phiếu âm. Kỳ sau vẫn không đổi.
      const rev = await lapDC(dot1, { kind: "reversal", reason: LY_DO });
      assert.equal(rev.status, 201, JSON.stringify(rev.body));
      assert.equal(rev.body!.amount, "-9271.70");
      assert.deepEqual(
        (rev.body!.items as Record<string, unknown>[]).map((i) => [i.boqItemId, i.qtyDelta]),
        [
          [a, "-7.500"],
          [b, "-10.004"],
        ],
      );
      const revId = rev.body!.id as number;
      assert.equal((await trinhDC(revId)).status, 200);
      await f.vao(c.admin, c.projectId);
      assert.equal((await quyetDC(revId, { decision: "approved" })).status, 200);
      assert.deepEqual(
        (await phieu(dot1)).map((p) => [p.type, p.amount, p.payStatus]),
        [
          ["bill", "12358.10", "void"],
          ["adjustment", "-3086.40", "void"],
        ],
      );
      assert.equal(await luyKeLib(c.contractId), "6172.80");
      assert.equal(await luyKeLib(c.contractId), await luyKeOracle(c.contractId), "oracle SQL");
      assert.deepEqual(await kySau(), kySauTruoc);
      assert.deepEqual(await phieu(dot2), phieuKySauTruoc);
    } finally {
      await f.don();
    }
  },
);

// ── (4) SoD / quyền / dự án ─────────────────────────────────────────────────────────────

test(
  "M128 (4): người lập tự duyệt → 403 sod_same_actor; viewer/bch → 403; dự án khác → 404; người khác trình → 403",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const lap = await lapDC(cert, { kind: "reversal", reason: LY_DO });
      const id = lap.body!.id as number;

      const pm2 = await f.user("pm");
      await f.vao(pm2, c.projectId);
      const trinhKhac = await trinhDC(id);
      assert.equal(trinhKhac.status, 403, "chỉ người lập được trình");
      await f.vao(c.pm, c.projectId);
      assert.equal((await trinhDC(id)).status, 200);

      const tuDuyet = await quyetDC(id, { decision: "approved" });
      assert.equal(tuDuyet.status, 403, JSON.stringify(tuDuyet.body));
      assert.equal(tuDuyet.body?.code, "sod_same_actor");
      const tuTuChoi = await quyetDC(id, { decision: "rejected", rejectReason: "x" });
      assert.equal(tuTuChoi.body?.code, "sod_same_actor");

      for (const role of ["viewer", "bch", "engineer", "subcon"] as const) {
        const u = await f.user(role);
        await f.vao(u, c.projectId);
        const r = await quyetDC(id, { decision: "approved" });
        assert.equal(r.status, 403, `${role}: ${JSON.stringify(r.body)}`);
      }
      const viewer = await f.user("viewer");
      await f.vao(viewer, c.projectId);
      assert.equal((await dsDC(cert)).status, 403, "viewer không xem chứng từ tiền");
      const bch = await f.user("bch");
      await f.vao(bch, c.projectId);
      assert.equal((await dsDC(cert)).status, 200, "bch xem được (PAYMENT_VIEW_ROLES)");
      assert.equal((await lapDC(cert, { kind: "reversal", reason: LY_DO })).status, 403);

      // Admin của dự án KHÁC: mọi đường → 404, không lộ tồn tại.
      const duAnKhac = await f.duAn("m128-khac");
      const adminKhac = await f.user("admin");
      await f.vao(adminKhac, duAnKhac);
      assert.equal((await dsDC(cert)).status, 404);
      assert.equal((await quyetDC(id, { decision: "approved" })).status, 404);
      assert.equal((await suaDC(id, { reason: LY_DO + " sửa" })).status, 404);
      assert.equal((await lapDC(cert, { kind: "reversal", reason: LY_DO })).status, 404);
      dangXuat();
      assert.equal((await quyetDC(id, { decision: "approved" })).status, 401);

      const { queryOne } = await import("@/lib/db");
      const st = await queryOne<{ s: string }>(
        `SELECT status AS s FROM payment_cert_adjustments WHERE id = ?`,
        id,
      );
      assert.equal(st?.s, "submitted");
      assert.equal((await phieu(cert)).length, 1);
    } finally {
      await f.don();
    }
  },
);

// ── (5) một chứng từ mở / đợt ───────────────────────────────────────────────────────────

test(
  "M128 (5): 2 chứng từ mở cùng đợt → 409 adjustment_open_exists; từ chối xong lập lại được; reversal nháp chỉ sửa lý do",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const lap = await lapDC(cert, { kind: "reversal", reason: LY_DO });
      assert.equal(lap.status, 201);
      const id = lap.body!.id as number;

      const sua = await suaDC(id, { items: [{ boqItemId: a, qtyDelta: "-1" }] });
      assert.equal(sua.status, 422);
      assert.equal(sua.body?.code, "reversal_items_fixed");
      const suaLyDo = await suaDC(id, { reason: "Huỷ đợt vì lập nhầm hợp đồng" });
      assert.equal(suaLyDo.status, 200, JSON.stringify(suaLyDo.body));
      assert.equal(suaLyDo.body?.reason, "Huỷ đợt vì lập nhầm hợp đồng");

      const hai = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      assert.equal(hai.status, 409);
      assert.equal(hai.body?.code, "adjustment_open_exists");
      assert.equal((await trinhDC(id)).status, 200);
      assert.equal(
        (await lapDC(cert, { kind: "reversal", reason: LY_DO })).body?.code,
        "adjustment_open_exists",
      );

      await f.vao(c.admin, c.projectId);
      assert.equal(
        (await quyetDC(id, { decision: "rejected", rejectReason: "Chưa đủ hồ sơ" })).status,
        200,
      );
      await f.vao(c.pm, c.projectId);
      const lai = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      assert.equal(lai.status, 201, JSON.stringify(lai.body));
      // Nháp xoá được; chứng từ đã quyết định thì không (lịch sử giữ nguyên).
      const { DELETE } = await import("@/app/api/adjustments/[id]/route");
      const xoa = (x: number) =>
        goi(requestRieng(() => DELETE(jreq(`/x`, undefined, "DELETE"), P(x))));
      assert.equal((await xoa(lai.body!.id as number)).status, 200);
      const xoaCu = await xoa(id);
      assert.equal(xoaCu.status, 409);
      assert.equal(xoaCu.body?.code, "adjustment_not_draft");
      assert.equal((await phieu(cert)).length, 1, "từ chối không sinh phiếu");
    } finally {
      await f.don();
    }
  },
);

// ── (6) Idempotency-Key ─────────────────────────────────────────────────────────────────

test(
  "M128 (6): Idempotency-Key lặp → replayed, không sinh phiếu thứ 2; cùng key khác payload → 409",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const lap = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "2" }],
      });
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      await f.vao(c.admin, c.projectId);
      const key = randomUUID();
      const r1 = await quyetDC(id, { decision: "approved" }, key);
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(r1.body?.operationId, key);
      const r2 = await quyetDC(id, { decision: "approved" }, key);
      assert.equal(r2.status, 200, JSON.stringify(r2.body));
      assert.equal(r2.body?.replayed, true);
      assert.equal(r2.body?.decision, "approved");
      const khac = await quyetDC(id, { decision: "rejected", rejectReason: "khác" }, key);
      assert.equal(khac.status, 409);
      assert.equal(khac.body?.code, "idempotency_conflict");
      const khongKey = await quyetDC(id, { decision: "approved" });
      assert.equal(khongKey.status, 409);
      assert.equal(khongKey.body?.code, "adjustment_not_submitted");
      const ps = await phieu(cert);
      assert.deepEqual(
        ps.map((p) => [p.type, p.amount]),
        [
          ["bill", "10000.00"],
          ["adjustment", "2000.00"],
        ],
      );
      assert.equal(
        await demBang(
          `SELECT COUNT(*)::int AS n FROM payment_cert_adjustment_decisions WHERE adjustment_id = ?`,
          id,
        ),
        1,
      );
      assert.equal((await quyetDC(id, {}, "khong-phai-uuid")).status, 422);
    } finally {
      await f.don();
    }
  },
);

// ── (7) sau reversal ────────────────────────────────────────────────────────────────────

test(
  "M128 (7): sau reversal đã duyệt không lập thêm chứng từ nào → 409 cert_reversed",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      await dcDaDuyet(c, cert, { kind: "reversal", reason: LY_DO });
      await f.vao(c.pm, c.projectId);
      for (const body of [
        { kind: "reversal", reason: LY_DO },
        { kind: "adjustment", reason: LY_DO, items: [{ boqItemId: a, qtyDelta: "1" }] },
      ]) {
        const r = await lapDC(cert, body);
        assert.equal(r.status, 409, JSON.stringify(r.body));
        assert.equal(r.body?.code, "cert_reversed");
      }
    } finally {
      await f.don();
    }
  },
);

// ── (8) RLS ─────────────────────────────────────────────────────────────────────────────

test(
  "M128 (8): RLS — role xboss_app với GUC dự án khác không thấy chứng từ/dòng/snapshot; không ghi chéo dự án",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const id = await dcDaDuyet(c, cert, { kind: "reversal", reason: LY_DO });
      const { withTransaction, query, run } = await import("@/lib/db");
      const doc = (projectId: string) =>
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await run(
            `SELECT set_config('app.org_id', '1', true), set_config('app.project_id', ?, true)`,
            projectId,
          );
          return [
            (await query(`SELECT id FROM payment_cert_adjustments WHERE id = ?`, id)).length,
            (
              await query(
                `SELECT id FROM payment_cert_adjustment_items WHERE adjustment_id = ?`,
                id,
              )
            ).length,
            (
              await query(
                `SELECT id FROM payment_cert_adjustment_decisions WHERE adjustment_id = ?`,
                id,
              )
            ).length,
          ];
        });
      assert.deepEqual(await doc(String(c.projectId)), [1, 1, 1]);
      assert.deepEqual(await doc(String(c.projectId + 1_000_000)), [0, 0, 0], "dự án khác → rỗng");
      assert.deepEqual(await doc(""), [0, 0, 0], "thiếu GUC → rỗng (không nhánh GUC rỗng)");
      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await run(
            `SELECT set_config('app.project_id', ?, true)`,
            String(c.projectId + 1_000_000),
          );
          await run(
            `INSERT INTO payment_cert_adjustments
               (code, cert_id, contract_id, project_id, kind, reason, amount, created_by)
             VALUES (?, ?, ?, ?, 'reversal', ?, 0, ?)`,
            uniq("ADJ-RLS-"),
            cert,
            c.contractId,
            c.projectId,
            LY_DO,
            c.pm.id,
          );
        }),
        /row-level security/,
      );
      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await run(
            `SELECT set_config('app.org_id', '1', true), set_config('app.project_id', ?, true)`,
            String(c.projectId),
          );
          await run(`DELETE FROM payment_cert_adjustment_decisions WHERE adjustment_id = ?`, id);
        }),
        /permission denied/,
      );
    } finally {
      await f.don();
    }
  },
);

// ── Hộp thư duyệt + engine ──────────────────────────────────────────────────────────────

test(
  "M128 hộp thư: chứng từ đã trình xuất hiện ở /api/approvals/inbox (kind 'adjustment') cho người duyệt được, không cho người lập; GET legacy trả number",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const lap = await lapDC(cert, { kind: "reversal", reason: LY_DO });
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      const { GET: INBOX } = await import("@/app/api/approvals/inbox/route");
      const hop = async () =>
        ((await goi(requestRieng(() => INBOX()))).body!.items as Record<string, unknown>[]).filter(
          (x) => x.kind === "adjustment",
        );
      assert.deepEqual(await hop(), [], "người lập không thấy (SoD)");
      await f.vao(c.admin, c.projectId);
      const [it] = await hop();
      const { queryOne } = await import("@/lib/db");
      const ma = await queryOne<{ adj: string; dot: string }>(
        `SELECT a.code AS adj, pc.code AS dot FROM payment_cert_adjustments a
           JOIN payment_certs pc ON pc.id = a.cert_id WHERE a.id = ?`,
        id,
      );
      assert.equal(it.entityId, id);
      assert.equal(it.entityType, "payment_cert_adjustment");
      assert.equal(it.label, `Điều chỉnh IPC ${ma!.adj} — đợt ${ma!.dot}`);
      assert.equal(it.linkUrl, `/payment-certs?contractId=${c.contractId}&id=${cert}`);
      assert.equal(it.amount, -10000);
      assert.equal(it.adjustmentKind, "reversal", "UI chỉ cảnh báo nguy hiểm cho reversal");
      assert.ok((it.id as number) < 0, "id âm — không trùng id approval_request");
      const legacy = await dsDC(cert, {});
      assert.equal((legacy.body!.adjustments as Record<string, unknown>[])[0].amount, -10000);
      assert.equal(
        (
          (legacy.body!.adjustments as Record<string, unknown>[])[0].items as Record<
            string,
            unknown
          >[]
        )[0].unitPrice,
        1000,
      );

      // Từ chối reversal → lập chứng từ điều chỉnh thường: hộp thư báo adjustmentKind 'adjustment'.
      assert.equal(
        (await quyetDC(id, { decision: "rejected", rejectReason: "Chưa đủ hồ sơ" })).status,
        200,
      );
      await f.vao(c.pm, c.projectId);
      const dc = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      assert.equal(dc.status, 201, JSON.stringify(dc.body));
      assert.equal((await trinhDC(dc.body!.id as number)).status, 200);
      await f.vao(c.admin, c.projectId);
      const [it2] = await hop();
      assert.deepEqual([it2.entityId, it2.adjustmentKind], [dc.body!.id, "adjustment"]);
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 engine: đợt gốc đi luồng duyệt → chứng từ mở request theo flow 'payment_cert', bước pending không sinh phiếu, bước cuối duyệt",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const { insertId } = await import("@/lib/db");
      const flowId = await insertId(
        `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'payment_cert', ?)`,
        c.projectId,
        uniq("Luồng IPC M128 "),
      );
      await insertId(
        `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
        flowId,
      );
      await insertId(
        `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'admin', NULL)`,
        flowId,
      );
      // Đợt gốc qua engine: PM lập/trình; PM khác duyệt bước 1, Admin bước cuối.
      const cert = await lapNhapDot(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const { POST: TRINH } = await import("@/app/api/payment-certs/[id]/submit/route");
      assert.equal((await goi(requestRieng(() => TRINH(jreq(`/x`), P(cert))))).status, 200);
      const { POST: DUYET } = await import("@/app/api/payment-certs/[id]/decide/route");
      const pm2 = await f.user("pm");
      await f.vao(pm2, c.projectId);
      const b1 = await goi(
        requestRieng(() => DUYET(jreq(`/x`, { decision: "approved" }), P(cert))),
      );
      assert.equal(b1.body?.pending, true, JSON.stringify(b1.body));
      await f.vao(c.admin, c.projectId);
      const b2 = await goi(
        requestRieng(() => DUYET(jreq(`/x`, { decision: "approved" }), P(cert))),
      );
      assert.equal(b2.body?.decision, "approved", JSON.stringify(b2.body));

      await f.vao(c.pm, c.projectId);
      const lap = await lapDC(cert, { kind: "reversal", reason: LY_DO });
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      assert.equal(
        await demBang(
          `SELECT COUNT(*)::int AS n FROM approval_requests
            WHERE entity_type = 'payment_cert_adjustment' AND entity_id = ? AND flow_id = ?
              AND status = 'pending' AND amount = 10000`,
          id,
          flowId,
        ),
        1,
        "request theo flow payment_cert, ngưỡng so |amount|",
      );
      await f.vao(pm2, c.projectId);
      const { GET: INBOX } = await import("@/app/api/approvals/inbox/route");
      const items = (await goi(requestRieng(() => INBOX()))).body!.items as Record<
        string,
        unknown
      >[];
      const hop = items.filter((x) => x.entityType === "payment_cert_adjustment");
      assert.equal(hop.length, 1, "không lặp phần tử engine + phần tử điều chỉnh");
      assert.deepEqual(
        [hop[0].kind, hop[0].adjustmentKind, hop[0].stepRole, hop[0].currentSeq],
        ["adjustment", "reversal", "pm", 1],
      );
      const p1 = await quyetDC(id, { decision: "approved" });
      assert.equal(p1.body?.pending, true, JSON.stringify(p1.body));
      assert.equal((await phieu(cert)).length, 1, "bước pending không đụng phiếu");
      await f.vao(c.admin, c.projectId);
      const p2 = await quyetDC(id, { decision: "approved" });
      assert.equal(p2.body?.decision, "approved", JSON.stringify(p2.body));
      assert.deepEqual(
        (await phieu(cert)).map((p) => [p.type, p.payStatus]),
        [["bill", "void"]],
      );
    } finally {
      await f.don();
    }
  },
);

// ── Huỷ upstream ────────────────────────────────────────────────────────────────────────

test(
  "M128 upstream: xoá dòng BOQ (kể cả dòng VO) đã nằm trong IPC đã duyệt → 409 adjustment_required kèm link đợt",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const { DELETE } = await import("@/app/api/boq/[id]/route");
      const r = await goi(requestRieng(() => DELETE(jreq(`/x`, undefined, "DELETE"), P(a))));
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body?.code, "adjustment_required");
      assert.match(r.body?.error as string, /chứng từ điều chỉnh/);
      assert.equal(r.body?.linkUrl, `/payment-certs?contractId=${c.contractId}&id=${cert}`);
    } finally {
      await f.don();
    }
  },
);

// ── Hồi quy audit M128 (các ca dưới đã được thấy ĐỎ trên code trước bản vá, xem báo cáo) ──

test(
  "M128 fix SoD nháp: Admin KHÔNG sửa được nháp của PM (403) — chỉ xoá được; chỉ người lập sửa nháp",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const lap = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      assert.equal(lap.status, 201, JSON.stringify(lap.body));
      const id = lap.body!.id as number;

      // Admin sửa nháp của PM rồi tự duyệt = lách SoD (người duyệt ≠ người lập) → chặn ngay ở sửa.
      await f.vao(c.admin, c.projectId);
      const suaLyDo = await suaDC(id, { reason: "Admin sửa lý do của PM" });
      assert.equal(suaLyDo.status, 403, JSON.stringify(suaLyDo.body));
      assert.match(suaLyDo.body?.error as string, /người lập/);
      const suaDong = await suaDC(id, { items: [{ boqItemId: a, qtyDelta: "5" }] });
      assert.equal(suaDong.status, 403, JSON.stringify(suaDong.body));
      const { queryOne } = await import("@/lib/db");
      assert.deepEqual(
        await queryOne(
          `SELECT reason, amount::text AS amount FROM payment_cert_adjustments WHERE id = ?`,
          id,
        ),
        { reason: LY_DO, amount: "1000.00" },
        "nháp giữ nguyên",
      );
      const pm2 = await f.user("pm");
      await f.vao(pm2, c.projectId);
      assert.equal((await suaDC(id, { reason: "PM khác sửa nháp" })).status, 403);

      await f.vao(c.pm, c.projectId);
      assert.equal((await suaDC(id, { reason: LY_DO + " (người lập sửa)" })).status, 200);

      const { DELETE } = await import("@/app/api/adjustments/[id]/route");
      const xoa = () => goi(requestRieng(() => DELETE(jreq(`/x`, undefined, "DELETE"), P(id))));
      await f.vao(pm2, c.projectId);
      assert.equal((await xoa()).status, 403, "PM khác không xoá nháp người khác");
      await f.vao(c.admin, c.projectId);
      assert.equal((await xoa()).status, 200, "Admin vẫn xoá được nháp người khác (dọn rác)");
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 fix SoD report: chứng từ điều chỉnh cùng người lập + quyết định → create_and_approve bắt được",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      // Chứng từ hợp lệ: PM lập, Admin duyệt → không bị bắt.
      const hopLe = await dcDaDuyet(c, cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      // Vi phạm (dữ liệu lọt qua đường ngoài route — route chặn sod_same_actor): cùng người.
      await f.vao(c.pm, c.projectId);
      const lap = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      const { run, queryOne } = await import("@/lib/db");
      await run(
        `UPDATE payment_cert_adjustments
            SET status = 'approved', decided_by = created_by, decided_at = ?
          WHERE id = ?`,
        todayISO(),
        id,
      );
      const org = await queryOne<{ o: number }>(
        `SELECT org_id AS o FROM projects WHERE id = ?`,
        c.projectId,
      );
      const { buildSodReport } = await import("@/lib/bao-mat/sod");
      const rule = (await buildSodReport(90, org!.o)).find((r) => r.rule === "create_and_approve");
      const cuaDieuChinh = rule!.violations.filter((v) => v.source === "payment_cert_adjustment");
      const v = cuaDieuChinh.find((x) => x.entityId === id);
      assert.ok(v, JSON.stringify(cuaDieuChinh));
      assert.equal(v!.entityType, "payment_cert_adjustment");
      assert.equal(v!.userId, c.pm.id);
      assert.ok(!cuaDieuChinh.some((x) => x.entityId === hopLe), "không bắt nhầm cặp hợp lệ");
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 fix DB: chứng từ đã duyệt/từ chối bất biến — trigger chặn UPDATE/DELETE chứng từ + dòng; nháp/trình đi đúng luồng",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const id = await dcDaDuyet(c, cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      const { run, withTransaction } = await import("@/lib/db");
      const CHOT = /đã chốt/;
      await assert.rejects(
        run(`UPDATE payment_cert_adjustments SET reason = ? WHERE id = ?`, LY_DO + " sửa lén", id),
        CHOT,
      );
      await assert.rejects(
        run(`UPDATE payment_cert_adjustments SET amount = 0 WHERE id = ?`, id),
        CHOT,
      );
      await assert.rejects(run(`DELETE FROM payment_cert_adjustments WHERE id = ?`, id), CHOT);
      await assert.rejects(
        run(`UPDATE payment_cert_adjustment_items SET qty_delta = 99 WHERE adjustment_id = ?`, id),
        CHOT,
      );
      await assert.rejects(
        run(`DELETE FROM payment_cert_adjustment_items WHERE adjustment_id = ?`, id),
        CHOT,
      );
      await assert.rejects(
        run(
          `INSERT INTO payment_cert_adjustment_items
             (adjustment_id, project_id, boq_item_id, qty_delta, unit_price)
           VALUES (?, ?, ?, 1, 1)`,
          id,
          c.projectId,
          await taoBoq(c.contractId, "1"),
        ),
        CHOT,
      );

      // Đã từ chối cũng là hồ sơ chốt.
      await f.vao(c.pm, c.projectId);
      const lap = await lapDC(cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "1" }],
      });
      const tc = lap.body!.id as number;
      // Nháp không được nhảy thẳng sang đã duyệt (bỏ bước trình/quyết định).
      await assert.rejects(
        run(`UPDATE payment_cert_adjustments SET status = 'approved' WHERE id = ?`, tc),
        /không hợp lệ/,
      );
      assert.equal((await trinhDC(tc)).status, 200);
      await f.vao(c.admin, c.projectId);
      assert.equal(
        (await quyetDC(tc, { decision: "rejected", rejectReason: "Chưa đủ hồ sơ" })).status,
        200,
      );
      await assert.rejects(
        run(`UPDATE payment_cert_adjustments SET reject_reason = 'khác' WHERE id = ?`, tc),
        CHOT,
      );
      await assert.rejects(
        run(`UPDATE payment_cert_adjustments SET status = 'submitted' WHERE id = ?`, tc),
        CHOT,
      );

      // Cờ bảo trì chỉ có tác dụng với role owner — role ứng dụng xboss_app đặt cờ vẫn bị chặn.
      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await run(
            `SELECT set_config('app.org_id', '1', true), set_config('app.project_id', ?, true),
                    set_config('xboss.bao_tri_chung_tu', 'on', true)`,
            String(c.projectId),
          );
          await run(`DELETE FROM payment_cert_adjustments WHERE id = ?`, id);
        }),
        CHOT,
      );
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 fix (MEDIUM-3): reversal đợt lẫn trạng thái — phiếu gốc 9000 đã chi + phiếu điều chỉnh +2000 chưa chi → void phiếu committed, phiếu âm = −Σ phiếu đã chi",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 9 }]);
      const [goc] = await phieu(cert);
      assert.equal(goc.amount, "9000.00");
      const { POST: PAY } = await import("@/app/api/payments/bills/[id]/pay/route");
      await f.vao(c.admin, c.projectId);
      const chi = await goi(requestRieng(() => PAY(jreq(`/x`, { paidAt: todayISO() }), P(goc.id))));
      assert.equal(chi.status, 200, JSON.stringify(chi.body));

      await dcDaDuyet(c, cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "2" }],
      });
      assert.deepEqual(
        (await phieu(cert)).map((p) => [p.type, p.amount, p.payStatus]),
        [
          ["bill", "9000.00", "paid"],
          ["adjustment", "2000.00", "committed"],
        ],
      );

      const revId = await dcDaDuyet(c, cert, { kind: "reversal", reason: LY_DO });
      const ps = await phieu(cert);
      assert.ok(
        !ps.some((p) => p.payStatus === "committed" && !p.amount.startsWith("-")),
        `không còn phiếu committed dương của đợt: ${JSON.stringify(ps)}`,
      );
      assert.deepEqual(
        ps.map((p) => [p.type, p.amount, p.payStatus]),
        [
          ["bill", "9000.00", "paid"],
          ["adjustment", "2000.00", "void"],
          ["adjustment", "-9000.00", "committed"],
        ],
      );
      const ds = await dsDC(cert);
      const rev = (ds.body!.adjustments as Record<string, unknown>[]).find((x) => x.id === revId)!;
      assert.equal(rev.billId, ps[2].id, "chứng từ reversal gắn phiếu âm");
      assert.deepEqual(await tongChiPhi(), { actual: "9000.00", approvedUnpaid: "-9000.00" });
      assert.equal(await luyKeLib(c.contractId), "0.00");
      assert.equal(await luyKeLib(c.contractId), await luyKeOracle(c.contractId), "oracle SQL");
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 fix: 2 POST lập chứng từ song song cùng đợt → đúng 1 thành công (201), 1 bị 409 adjustment_open_exists",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const kq = await Promise.all([
        lapDC(cert, { kind: "reversal", reason: LY_DO }),
        lapDC(cert, {
          kind: "adjustment",
          reason: LY_DO,
          items: [{ boqItemId: a, qtyDelta: "1" }],
        }),
      ]);
      assert.deepEqual(
        kq.map((r) => r.status).sort(),
        [201, 409],
        JSON.stringify(kq.map((r) => r.body)),
      );
      assert.equal(kq.find((r) => r.status === 409)!.body?.code, "adjustment_open_exists");
      assert.equal(
        await demBang(
          `SELECT COUNT(*)::int AS n FROM payment_cert_adjustments WHERE cert_id = ?`,
          cert,
        ),
        1,
      );
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 fix: HĐ có tạm ứng/giữ lại ≠ 0 — phiếu gốc ròng, phiếu điều chỉnh RÒNG (ipc-sum-v1), reversal = −Σ phiếu",
  S,
  async () => {
    // Chốt số theo quyết định 2026-10-09 (phiếu điều chỉnh ròng) — đổi công thức thì đổi ca này.
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000, { advancePct: 10, retentionPct: 5 });
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const goc = (await phieu(cert)).map((p) => [p.type, p.amount, p.payStatus]);
      const dc = await dcDaDuyet(c, cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "2" }],
      });
      await f.vao(c.pm, c.projectId);
      const rev = await lapDC(cert, { kind: "reversal", reason: LY_DO });
      assert.equal(rev.status, 201, JSON.stringify(rev.body));
      const ds = await dsDC(cert);
      const amounts = Object.fromEntries(
        (ds.body!.adjustments as Record<string, unknown>[]).map((x) => [x.id, x.amount]),
      );
      const truocHuy = (await phieu(cert)).map((p) => [p.type, p.amount, p.payStatus]);
      assert.equal((await trinhDC(rev.body!.id as number)).status, 200);
      await f.vao(c.admin, c.projectId);
      assert.equal((await quyetDC(rev.body!.id as number, { decision: "approved" })).status, 200);
      const thucTe = {
        goc,
        dieuChinh: amounts[dc],
        reversal: amounts[rev.body!.id as number],
        truocHuy,
        sauHuy: (await phieu(cert)).map((p) => [p.type, p.amount, p.payStatus]),
      };
      assert.deepEqual(thucTe, KY_VONG_TAM_UNG_GIU_LAI, JSON.stringify(thucTe));
    } finally {
      await f.don();
    }
  },
);

test("M128 fix: hộp thư — giá trị vượt độ chính xác KHÔNG bị nuốt thành null: ném lỗi 422 có mã", async () => {
  const { tienHopThuDieuChinh } = await import("@/lib/dich-vu/dieu-chinh-ipc");
  assert.equal(tienHopThuDieuChinh("-10000.00", 1), -10000);
  assert.throws(
    () => tienHopThuDieuChinh("90071992547409.93", 7),
    (e: Error & { status?: number; code?: string }) =>
      e.status === 422 && e.code === "money_precision_unsupported",
  );
});

test(
  "M128 fix: xoá dòng BOQ thuộc đợt ĐÃ huỷ hiệu lực → 409 nêu rõ hồ sơ lưu trữ, không vòng về 'lập chứng từ điều chỉnh'",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      await dcDaDuyet(c, cert, { kind: "reversal", reason: LY_DO });
      const { DELETE } = await import("@/app/api/boq/[id]/route");
      const r = await goi(requestRieng(() => DELETE(jreq(`/x`, undefined, "DELETE"), P(a))));
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.notEqual(r.body?.code, "adjustment_required");
      assert.equal(r.body?.code, "dependency_conflict");
      assert.match(r.body?.error as string, /huỷ hiệu lực/);
      assert.doesNotMatch(r.body?.error as string, /Lập chứng từ điều chỉnh/);
      assert.equal(r.body?.linkUrl, undefined);
    } finally {
      await f.don();
    }
  },
);

// ── Quyết định nghiệp vụ bổ sung 2026-10-09 (spec M128 §6) ─────────────────────────────

/** ORACLE độc lập luỹ kế hiệu lực của MỘT đợt kỳ N: Σ dòng của đợt × giá đợt, với KL dòng =
 *  Σ KL kỳ của các đợt đã duyệt kỳ ≤ N (+ chính đợt nếu còn mở) + Σ KL điều chỉnh đã duyệt gắn
 *  đợt kỳ ≤ N — không dùng qty_cumulative lưu. */
async function luyKeDotOracle(certId: number): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ v: string }>(
    `SELECT ROUND(COALESCE(SUM((
              (SELECT COALESCE(SUM(i2.qty_period), 0) FROM payment_cert_items i2
                 JOIN payment_certs c2 ON c2.id = i2.cert_id
                WHERE c2.contract_id = c.contract_id AND i2.boq_item_id = i.boq_item_id
                  AND c2.period_no <= c.period_no AND (c2.status = 'approved' OR c2.id = c.id))
            + (SELECT COALESCE(SUM(ai.qty_delta), 0) FROM payment_cert_adjustment_items ai
                 JOIN payment_cert_adjustments a ON a.id = ai.adjustment_id
                 JOIN payment_certs c3 ON c3.id = a.cert_id
                WHERE a.status = 'approved' AND c3.contract_id = c.contract_id
                  AND c3.period_no <= c.period_no AND ai.boq_item_id = i.boq_item_id)
            ) * i.unit_price), 0), 2)::text AS v
       FROM payment_cert_items i JOIN payment_certs c ON c.id = i.cert_id
      WHERE c.id = ?`,
    certId,
  );
  return r!.v;
}

/** Luỹ kế đợt theo các đường ĐỌC thật: tổng chi tiết đợt, dòng chi tiết, danh sách HĐ, export. */
async function luyKeDotQuaRoute(certId: number, contractId: number, boqItemId: number) {
  const xem = await xemDot(certId);
  assert.equal(xem.status, 200, JSON.stringify(xem.body));
  const cert = xem.body!.cert as { items: Record<string, unknown>[] };
  const { GET: DS } = await import("@/app/api/payment-certs/route");
  const ds = await goi(
    requestRieng(() =>
      DS(jreq(`/api/payment-certs?contractId=${contractId}`, undefined, "GET", TIEN_EXACT)),
    ),
  );
  const dsCert = (ds.body!.certs as { id: number; items: Record<string, unknown>[] }[]).find(
    (x) => x.id === certId,
  )!;
  const { certLinesExact, dongLuyKeHieuLuc } = await import("@/lib/tai-chinh/paymentcerts");
  return {
    tong: (xem.body!.totals as Record<string, string>).cumulativeValue,
    dong: cert.items.find((x) => x.boqItemId === boqItemId)!.qtyCumulative,
    danhSach: dsCert.items.find((x) => x.boqItemId === boqItemId)!.qtyCumulative,
    xuat: (await certLinesExact(certId))[0].qtyCumulative,
    canhBao: (await dongLuyKeHieuLuc(certId)).find((d) => d.boqItemId === boqItemId)!.qtyCumulative,
  };
}

test(
  "M128 §6 (10): luỹ kế HIỆU LỰC — điều chỉnh −2 đã duyệt của đợt 1 làm luỹ kế đợt 1 (đã duyệt) và đợt 2 (mở) cùng giảm 2 × giá; trước duyệt không đổi (oracle SQL)",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1234.56");
      const dot1 = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      const dot2 = await lapNhapDot(c.contractId, [{ boqItemId: a, qtyPeriod: 5 }]);
      const truoc1 = {
        tong: "12345.60",
        dong: "10.000",
        danhSach: "10.000",
        xuat: "10.000",
        canhBao: "10.000",
      };
      const truoc2 = {
        tong: "18518.40",
        dong: "15.000",
        danhSach: "15.000",
        xuat: "15.000",
        canhBao: "15.000",
      };
      assert.deepEqual(await luyKeDotQuaRoute(dot1, c.contractId, a), truoc1);
      assert.deepEqual(await luyKeDotQuaRoute(dot2, c.contractId, a), truoc2);

      // Lập + trình (chưa duyệt) → luỹ kế chưa đổi.
      const lap = await lapDC(dot1, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "-2" }],
      });
      assert.equal(lap.status, 201, JSON.stringify(lap.body));
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      assert.deepEqual(await luyKeDotQuaRoute(dot1, c.contractId, a), truoc1);
      assert.deepEqual(await luyKeDotQuaRoute(dot2, c.contractId, a), truoc2);

      await f.vao(c.admin, c.projectId);
      assert.equal((await quyetDC(id, { decision: "approved" })).status, 200);
      // −2 × 1234.56 = −2469.12 ở CẢ đợt 1 (đã duyệt) và đợt 2 (mở).
      assert.deepEqual(await luyKeDotQuaRoute(dot1, c.contractId, a), {
        tong: "9876.48",
        dong: "8.000",
        danhSach: "8.000",
        xuat: "8.000",
        canhBao: "8.000",
      });
      assert.deepEqual(await luyKeDotQuaRoute(dot2, c.contractId, a), {
        tong: "16049.28",
        dong: "13.000",
        danhSach: "13.000",
        xuat: "13.000",
        canhBao: "13.000",
      });
      assert.equal(await luyKeDotOracle(dot1), "9876.48", "oracle đợt 1");
      assert.equal(await luyKeDotOracle(dot2), "16049.28", "oracle đợt 2");
      // KL lưu của đợt vẫn là chuỗi IPC thuần (không ghi đè snapshot) — chỉ cách ĐỌC đổi.
      assert.equal(
        await demBang(
          `SELECT COUNT(*)::int AS n FROM payment_cert_items
            WHERE cert_id = ? AND qty_cumulative = 10`,
          dot1,
        ),
        1,
      );
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 §6 (11): phiếu điều chỉnh RÒNG theo ipc-sum-v1 — −toàn bộ KL đợt (tạm ứng 10.25%, giữ lại 3.33%) = −đúng giá trị phiếu gốc",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000, { advancePct: 10.25, retentionPct: 3.33 });
      const a = await taoBoq(c.contractId, "1234.56");
      const cert = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      // 12345.60 − round(1265.424) − round(411.10848) = 12345.60 − 1265.42 − 411.11 = 10669.07
      const [goc] = await phieu(cert);
      assert.equal(goc.amount, "10669.07");
      const { POST: PAY } = await import("@/app/api/payments/bills/[id]/pay/route");
      await f.vao(c.admin, c.projectId);
      assert.equal(
        (await goi(requestRieng(() => PAY(jreq(`/x`, { paidAt: todayISO() }), P(goc.id))))).status,
        200,
      );
      const id = await dcDaDuyet(c, cert, {
        kind: "adjustment",
        reason: LY_DO,
        items: [{ boqItemId: a, qtyDelta: "-10" }],
      });
      const ds = await dsDC(cert);
      const adj = (ds.body!.adjustments as Record<string, unknown>[]).find((x) => x.id === id)!;
      assert.equal(adj.amount, "-12345.60", "giá trị chứng từ = KL × giá (gộp)");
      assert.deepEqual(
        (await phieu(cert)).map((p) => [p.type, p.amount, p.payStatus]),
        [
          ["bill", "10669.07", "paid"],
          ["adjustment", "-10669.07", "committed"],
        ],
        "phiếu ròng: −toàn bộ KL = −đúng phiếu gốc",
      );
      assert.equal(await luyKeLib(c.contractId), "0.00", "luỹ kế KL (gộp) về 0");
    } finally {
      await f.don();
    }
  },
);

test(
  "M128 §6 (12): đợt đã duyệt KHÔNG có phiếu gốc (legacy) → lập chứng từ 409 ipc_no_bill; phiếu mất sau khi lập → duyệt cũng 409 ipc_no_bill",
  S,
  async () => {
    const f = (fHienTai = new SoFixture());
    try {
      const c = await dungDuAn(f, 1000000);
      const a = await taoBoq(c.contractId, "1000");
      const { run } = await import("@/lib/db");
      const legacy = await dotDaDuyet(c.contractId, [{ boqItemId: a, qtyPeriod: 10 }]);
      await run(`DELETE FROM payment_bills WHERE payment_cert_id = ?`, legacy);
      for (const body of [
        { kind: "reversal", reason: LY_DO },
        { kind: "adjustment", reason: LY_DO, items: [{ boqItemId: a, qtyDelta: "1" }] },
      ]) {
        const r = await lapDC(legacy, body);
        assert.equal(r.status, 409, JSON.stringify(r.body));
        assert.equal(r.body?.code, "ipc_no_bill");
        assert.match(r.body?.error as string, /phiếu/);
      }

      // Có phiếu lúc lập, mất phiếu trước khi duyệt → kiểm lại dưới khoá lúc decide.
      const b = await taoBoq(c.contractId, "1000");
      const dot = await dotDaDuyet(c.contractId, [{ boqItemId: b, qtyPeriod: 10 }]);
      const lap = await lapDC(dot, { kind: "reversal", reason: LY_DO });
      assert.equal(lap.status, 201, JSON.stringify(lap.body));
      const id = lap.body!.id as number;
      assert.equal((await trinhDC(id)).status, 200);
      await run(`DELETE FROM payment_bills WHERE payment_cert_id = ?`, dot);
      await f.vao(c.admin, c.projectId);
      const d = await quyetDC(id, { decision: "approved" });
      assert.equal(d.status, 409, JSON.stringify(d.body));
      assert.equal(d.body?.code, "ipc_no_bill");
      assert.equal(
        await demBang(
          `SELECT COUNT(*)::int AS n FROM payment_cert_adjustments WHERE id = ? AND status = 'submitted'`,
          id,
        ),
        1,
        "chứng từ vẫn chờ duyệt",
      );
      assert.equal((await phieu(dot)).length, 0, "không sinh phiếu");
    } finally {
      await f.don();
    }
  },
);
