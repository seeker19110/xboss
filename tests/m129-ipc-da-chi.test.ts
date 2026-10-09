import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SoFixture,
  jreq,
  P,
  goi,
  uniq,
  TIEN_EXACT,
  type NguoiTest,
} from "./helpers/chuoi-nghiep-vu";
import { addDaysISO, todayISO } from "@/lib/nen/date";

// M129 — IPC "đã duyệt" ≠ "đã chi" (docs/nang-cap/M129-ipc-da-chi-tach-cam-ket-thuc-chi.md §4).
// Mọi bước đi qua ROUTE HANDLER THẬT (lập/sửa/trình/duyệt IPC, đánh dấu đã chi, báo cáo chi phí,
// danh sách phiếu, thông báo). Tiền so bằng CHUỖI exact (decimal-string-v1), không float.
//
// Ca (1) và (2) đã được thấy ĐỎ trên code cũ (duyệt sinh phiếu 'paid', thực chi tăng ngay; route
// /pay chưa tồn tại) trước khi vá — xem báo cáo M129.

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

// ── Bước người dùng (route thật) ────────────────────────────────────────────────────────

async function taoHopDong() {
  const { POST } = await import("@/app/api/contracts/route");
  const r = await goi(
    POST(
      jreq(`/api/contracts`, {
        code: uniq("HD-M129-"),
        kind: "nhan_thau",
        title: "HĐ M129",
        partyName: "CĐT M129",
        status: "active",
        value: 1000000,
        advancePct: 0,
        retentionPct: 0,
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoBoq(contractId: number) {
  const { POST } = await import("@/app/api/boq/route");
  const r = await goi(
    POST(
      jreq(`/api/boq`, {
        code: uniq("BOQ-M129-"),
        name: "Ống M129",
        unit: "m",
        qtyContract: 100,
        unitPrice: "1234.56",
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body!.id as number;
  const { run } = await import("@/lib/db");
  await run(`UPDATE boq_items SET contract_id = ? WHERE id = ?`, contractId, id);
  return id;
}

async function quyetDinh(certId: number) {
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  return goi(
    requestRieng(() =>
      POST(jreq(`/api/payment-certs/${certId}/decide`, { decision: "approved" }), P(certId)),
    ),
  );
}

/** PM lập → sửa KL 10 → trình → duyệt: giá trị đề nghị golden 10 × 1234.56 = 12345.60. */
async function dotDaDuyet(contractId: number, boqId: number): Promise<number> {
  const { POST: LAP } = await import("@/app/api/payment-certs/route");
  const lap = await goi(requestRieng(() => LAP(jreq(`/api/payment-certs`, { contractId }))));
  assert.equal(lap.status, 201, JSON.stringify(lap.body));
  const id = lap.body!.id as number;
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const sua = await goi(
    PATCH(jreq(`/x`, { items: [{ boqItemId: boqId, qtyPeriod: 10 }] }, "PATCH"), P(id)),
  );
  assert.equal(sua.status, 200, JSON.stringify(sua.body));
  const { POST: TRINH } = await import("@/app/api/payment-certs/[id]/submit/route");
  assert.equal((await goi(TRINH(jreq(`/x`), P(id)))).status, 200);
  const d = await quyetDinh(id);
  assert.equal(d.status, 200, JSON.stringify(d.body));
  return id;
}

async function danhDauChi(billId: number, body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/payments/bills/[id]/pay/route");
  return goi(requestRieng(() => POST(jreq(`/api/payments/bills/${billId}/pay`, body), P(billId))));
}

async function tongChiPhi() {
  const { GET } = await import("@/app/api/costs/route");
  const r = await goi(GET(jreq(`/api/costs?groupBy=system`, undefined, "GET", TIEN_EXACT)));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const t = r.body!.projectTotals as Record<string, string>;
  return { actual: t.actual, approvedUnpaid: t.approvedUnpaid };
}

async function phieuCuaDot(certId: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{
    id: number;
    amount: string;
    payStatus: string;
    paidAt: string | null;
    paidBy: number | null;
  }>(
    `SELECT id, amount::text AS amount, pay_status AS "payStatus", paid_at AS "paidAt",
            paid_by AS "paidBy"
       FROM payment_bills WHERE payment_cert_id = ?`,
    certId,
  );
}

/** Oracle SQL độc lập: thực chi = Σ phiếu 'paid' của dự án (chuỗi decimal exact). */
async function oracleThucChi(projectId: number) {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ s: string }>(
    `SELECT COALESCE(SUM(amount), 0.00)::text AS s
       FROM payment_bills WHERE project_id = ? AND pay_status = 'paid'`,
    projectId,
  );
  return r!.s;
}

/** Dự án + PM (người lập & duyệt IPC) + Admin khác (người chi) + 1 đợt đã duyệt. */
async function dungDot(f: SoFixture) {
  const projectId = await f.duAn("m129");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  await f.vao(pm, projectId);
  const contractId = await taoHopDong();
  const boqId = await taoBoq(contractId);
  const certId = await dotDaDuyet(contractId, boqId);
  const bill = await phieuCuaDot(certId);
  assert.ok(bill, "duyệt phải sinh đúng 1 phiếu");
  return { projectId, pm, admin, contractId, certId, billId: bill.id };
}

// ── (1) duyệt → committed, thực chi không tăng ──────────────────────────────────────────

test(
  "M129 (1): duyệt IPC sinh phiếu committed (paid_at NULL) — thực chi KHÔNG tăng, approvedUnpaid tăng đúng exact",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      const bill = await phieuCuaDot(c.certId);
      assert.deepEqual(
        {
          amount: bill!.amount,
          payStatus: bill!.payStatus,
          paidAt: bill!.paidAt,
          paidBy: bill!.paidBy,
        },
        { amount: "12345.60", payStatus: "committed", paidAt: null, paidBy: null },
      );
      assert.deepEqual(await tongChiPhi(), { actual: "0.00", approvedUnpaid: "12345.60" });
      assert.equal((await tongChiPhi()).actual, await oracleThucChi(c.projectId), "oracle SQL");

      // Hợp đồng API cho UI: đợt mang `bill` + `decidedBy`; danh sách phiếu mang payStatus/paidAt.
      const { GET: XEM } = await import("@/app/api/payment-certs/[id]/route");
      const xem = await goi(XEM(jreq(`/x`, undefined, "GET", TIEN_EXACT), P(c.certId)));
      assert.equal(xem.status, 200);
      const cert = xem.body!.cert as Record<string, unknown>;
      assert.deepEqual(cert.bill, {
        id: c.billId,
        payStatus: "committed",
        paidAt: null,
        paidRef: null,
      });
      assert.equal(cert.decidedBy, c.pm.id);
      const { GET: DS } = await import("@/app/api/payment-certs/route");
      const ds = await goi(
        DS(jreq(`/api/payment-certs?contractId=${c.contractId}`, undefined, "GET")),
      );
      assert.equal(ds.status, 200);
      const dot = (ds.body!.certs as Record<string, unknown>[]).find((x) => x.id === c.certId)!;
      assert.deepEqual(dot.bill, {
        id: c.billId,
        payStatus: "committed",
        paidAt: null,
        paidRef: null,
      });
      assert.equal(dot.decidedBy, c.pm.id);
      const { GET: BILLS } = await import("@/app/api/payments/bills/route");
      const bills = await goi(BILLS(jreq(`/api/payments/bills`, undefined, "GET", TIEN_EXACT)));
      assert.equal(bills.status, 200);
      const b = (bills.body!.bills as Record<string, unknown>[]).find((x) => x.id === c.billId)!;
      assert.equal(b.payStatus, "committed");
      assert.equal(b.paidAt, null);
      assert.equal(b.paymentCertId, c.certId);
    } finally {
      await f.don();
    }
  },
);

// ── (2) /pay bởi Admin khác người duyệt ─────────────────────────────────────────────────

test(
  "M129 (2): Admin khác người duyệt đánh dấu đã chi → paid; thực chi tăng, approvedUnpaid giảm về 0",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      await f.vao(c.admin, c.projectId);
      const hom = todayISO();
      const r = await danhDauChi(c.billId, {
        paidAt: hom,
        paidRef: " UNC-0042 ",
        paidNote: "Chi đợt 1",
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body, {
        id: c.billId,
        payStatus: "paid",
        paidAt: hom,
        paidBy: c.admin.id,
        paidRef: "UNC-0042",
        paidNote: "Chi đợt 1",
      });
      const bill = await phieuCuaDot(c.certId);
      assert.deepEqual(
        { payStatus: bill!.payStatus, paidAt: bill!.paidAt, paidBy: bill!.paidBy },
        { payStatus: "paid", paidAt: hom, paidBy: c.admin.id },
      );
      assert.deepEqual(await tongChiPhi(), { actual: "12345.60", approvedUnpaid: "0.00" });
      assert.equal((await tongChiPhi()).actual, await oracleThucChi(c.projectId), "oracle SQL");

      const { GET: XEM } = await import("@/app/api/payment-certs/[id]/route");
      const xem = await goi(XEM(jreq(`/x`, undefined, "GET"), P(c.certId)));
      assert.deepEqual((xem.body!.cert as Record<string, unknown>).bill, {
        id: c.billId,
        payStatus: "paid",
        paidAt: hom,
        paidRef: "UNC-0042",
      });

      // Vết kiểm toán: trigger audit_payment_bills ghi lần chuyển committed → paid.
      const { queryOne } = await import("@/lib/db");
      const a = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM audit_log
        WHERE entity_type = 'payment_bills' AND entity_id = ? AND action = 'UPDATE'`,
        c.billId,
      );
      assert.equal(a?.n, 1);
    } finally {
      await f.don();
    }
  },
);

// ── (3) SoD ─────────────────────────────────────────────────────────────────────────────

test(
  "M129 (3): chính người duyệt IPC đánh dấu đã chi → 403 sod_same_actor, phiếu giữ committed",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      await f.vao(c.pm, c.projectId);
      const r = await danhDauChi(c.billId, { paidAt: todayISO() });
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(r.body?.code, "sod_same_actor");
      assert.equal((await phieuCuaDot(c.certId))!.payStatus, "committed");
    } finally {
      await f.don();
    }
  },
);

// ── (4) idempotent ──────────────────────────────────────────────────────────────────────

test(
  "M129 (4): đánh dấu chi lặp (tuần tự và đồng thời) → đúng 1 lần chuyển, lần sau 409 already_paid",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      await f.vao(c.admin, c.projectId);
      const hom = todayISO();
      const kq = await Promise.all([
        danhDauChi(c.billId, { paidAt: hom, paidRef: "A" }),
        danhDauChi(c.billId, { paidAt: hom, paidRef: "B" }),
      ]);
      assert.deepEqual(kq.map((r) => r.status).sort(), [200, 409]);
      assert.equal(kq.find((r) => r.status === 409)!.body?.code, "already_paid");
      const lai = await danhDauChi(c.billId, { paidAt: hom });
      assert.equal(lai.status, 409);
      assert.equal(lai.body?.code, "already_paid");
      assert.deepEqual(await tongChiPhi(), { actual: "12345.60", approvedUnpaid: "0.00" });

      // Phiếu void (M128) không chuyển sang paid được.
      const { run } = await import("@/lib/db");
      await run(
        `UPDATE payment_bills SET pay_status = 'void', paid_at = NULL WHERE id = ?`,
        c.billId,
      );
      const huy = await danhDauChi(c.billId, { paidAt: hom });
      assert.equal(huy.status, 409);
      assert.equal(huy.body?.code, "bill_void");
    } finally {
      await f.don();
    }
  },
);

// ── (5) ngày chi ────────────────────────────────────────────────────────────────────────

test(
  "M129 (5): paidAt trước ngày duyệt / sau hôm nay / sai dạng → 422 paid_at_invalid, không ghi",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      await f.vao(c.admin, c.projectId);
      const hom = todayISO();
      for (const paidAt of [
        addDaysISO(hom, -1),
        addDaysISO(hom, 1),
        "2026-02-30",
        "09/10/2026",
        null,
      ]) {
        const r = await danhDauChi(c.billId, { paidAt });
        assert.equal(r.status, 422, `${paidAt}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body?.code, "paid_at_invalid");
      }
      assert.equal((await phieuCuaDot(c.certId))!.payStatus, "committed");
    } finally {
      await f.don();
    }
  },
);

// ── (6) quyền ───────────────────────────────────────────────────────────────────────────

test(
  "M129 (6): viewer/engineer/bch/subcon/cdt không đánh dấu chi được (403); chưa đăng nhập 401",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      for (const role of ["viewer", "engineer", "bch", "subcon", "cdt"] as const) {
        const u: NguoiTest = await f.user(role);
        await f.vao(u, c.projectId);
        const r = await danhDauChi(c.billId, { paidAt: todayISO() });
        assert.equal(r.status, 403, `${role}: ${JSON.stringify(r.body)}`);
      }
      dangXuat();
      assert.equal((await danhDauChi(c.billId, { paidAt: todayISO() })).status, 401);
      assert.equal((await phieuCuaDot(c.certId))!.payStatus, "committed");
    } finally {
      await f.don();
    }
  },
);

// ── (7) phiếu cũ sau migration ──────────────────────────────────────────────────────────

test(
  "M129 (7): phiếu cũ sau backfill 0166 giữ 'paid' + paid_at = paid_date; thực chi trước/sau bằng nhau",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const projectId = await f.duAn("m129-cu");
      const pm = await f.user("pm");
      await f.vao(pm, projectId);
      const { insertId, query, run } = await import("@/lib/db");
      // Phiếu "từ trước 0166": chèn như code cũ (không đụng cột mới) rồi xoá paid_at — đúng trạng
      // thái dòng có sẵn khi ADD COLUMN (DEFAULT 'paid', paid_at NULL).
      const ids: number[] = [];
      for (const [amount, ngay] of [
        ["1000.10", "2026-01-15"],
        ["2500.25", "2026-03-02"],
      ] as const)
        ids.push(
          await insertId(
            `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
           VALUES ('NTP cũ', 'bill', ?::numeric, ?, ?)`,
            amount,
            ngay,
            projectId,
          ),
        );
      await run(`UPDATE payment_bills SET paid_at = NULL WHERE id = ANY(?::int[])`, ids);
      const truoc = await tongChiPhi();
      assert.deepEqual(truoc, { actual: "3500.35", approvedUnpaid: "0.00" });

      // Chạy đúng câu backfill trong file migration (không chép tay câu lệnh).
      const sql = readFileSync(
        join(process.cwd(), "migrations/0166_payment_bills_paid_state.sql"),
        "utf8",
      );
      const backfill = sql.match(/^UPDATE payment_bills[^;]*;/m)?.[0];
      assert.ok(backfill, "migration 0166 phải có câu backfill paid_at");
      await run(backfill);
      await run(backfill); // idempotent

      const rows = await query<{ s: string; ok: boolean }>(
        `SELECT pay_status AS s, paid_at = paid_date AS ok FROM payment_bills
        WHERE id = ANY(?::int[]) ORDER BY id`,
        ids,
      );
      assert.deepEqual(rows, [
        { s: "paid", ok: true },
        { s: "paid", ok: true },
      ]);
      assert.deepEqual(await tongChiPhi(), truoc);
    } finally {
      await f.don();
    }
  },
);

// ── (8) khoá phiếu đã chi có IPC ────────────────────────────────────────────────────────

test(
  "M129 (8): phiếu paid có IPC — xoá → 409, sửa amount → 409 bill_paid_locked; sửa ghi chú vẫn được",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      await f.vao(c.admin, c.projectId);
      assert.equal((await danhDauChi(c.billId, { paidAt: todayISO() })).status, 200);

      const { PATCH, DELETE } = await import("@/app/api/payments/bills/[id]/route");
      const xoa = await goi(DELETE(jreq(`/x`, undefined, "DELETE"), P(c.billId)));
      assert.equal(xoa.status, 409, JSON.stringify(xoa.body));
      assert.equal(xoa.body?.code, "bill_ipc_locked");
      const sua = await goi(PATCH(jreq(`/x`, { amount: "1.00" }, "PATCH"), P(c.billId)));
      assert.equal(sua.status, 409, JSON.stringify(sua.body));
      assert.equal(sua.body?.code, "bill_paid_locked");
      const note = await goi(PATCH(jreq(`/x`, { note: "Đã đối chiếu UNC" }, "PATCH"), P(c.billId)));
      assert.equal(note.status, 200, JSON.stringify(note.body));
      const bill = await phieuCuaDot(c.certId);
      assert.deepEqual([bill!.amount, bill!.payStatus], ["12345.60", "paid"]);
    } finally {
      await f.don();
    }
  },
);

// ── (9) khoá xoá phiếu committed gắn IPC ────────────────────────────────────────────────

test(
  "M129 (9): người duyệt xoá phiếu committed của IPC → 409 bill_ipc_locked; phiếu + tổng giữ nguyên",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      const truoc = await tongChiPhi();
      const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
      const xoa = await goi(DELETE(jreq(`/x`, undefined, "DELETE"), P(c.billId)));
      assert.equal(xoa.status, 409, JSON.stringify(xoa.body));
      assert.equal(xoa.body?.code, "bill_ipc_locked");
      const bill = await phieuCuaDot(c.certId);
      assert.equal(bill?.payStatus, "committed");
      assert.deepEqual(await tongChiPhi(), truoc);
      assert.equal(truoc.approvedUnpaid, "12345.60");
    } finally {
      await f.don();
    }
  },
);

// ── (10) POST phiếu paid nhập tay: ngày chi không sau hôm nay ──────────────────────────

test(
  "M129 (10): POST phiếu paid ngày mai → 422 paid_at_invalid; committed ngày tương lai → 200",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const projectId = await f.duAn("m129-post");
      const pm = await f.user("pm");
      await f.vao(pm, projectId);
      const { POST } = await import("@/app/api/payments/bills/route");
      const mai = addDaysISO(todayISO(), 1);
      const than = { responsible: "NTP M129", type: "advance", amount: "1000.00", paidDate: mai };
      const loi = await goi(POST(jreq(`/api/payments/bills`, { ...than, payStatus: "paid" })));
      assert.equal(loi.status, 422, JSON.stringify(loi.body));
      assert.equal(loi.body?.code, "paid_at_invalid");
      const macDinh = await goi(POST(jreq(`/api/payments/bills`, than)));
      assert.equal(macDinh.status, 422, "mặc định là paid");
      const ok = await goi(POST(jreq(`/api/payments/bills`, { ...than, payStatus: "committed" })));
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      const { queryOne } = await import("@/lib/db");
      const n = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM payment_bills WHERE project_id = ?`,
        projectId,
      );
      assert.equal(n?.n, 1);
    } finally {
      await f.don();
    }
  },
);

// ── Thông báo bill_unpaid ───────────────────────────────────────────────────────────────

test(
  "M129: phiếu committed quá 30 ngày → thông báo bill_unpaid cho Admin/PM (dedup); đã chi → tự dọn",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDot(f);
      const { run, query } = await import("@/lib/db");
      // Biên: phiếu đúng 30 ngày chưa "quá 30 ngày" → chưa báo.
      await run(
        `UPDATE payment_bills SET paid_date = ? WHERE id = ?`,
        addDaysISO(todayISO(), -30),
        c.billId,
      );
      const { unpaidBillsOverdue } = await import("@/lib/tai-chinh/payment-bills");
      assert.deepEqual(await unpaidBillsOverdue(30, c.projectId), []);
      // Phiếu duyệt 31 ngày trước (ngày lập phiếu = ngày duyệt).
      await run(
        `UPDATE payment_bills SET paid_date = ? WHERE id = ?`,
        addDaysISO(todayISO(), -31),
        c.billId,
      );
      await f.vao(c.admin, c.projectId);
      const { GET } = await import("@/app/api/notifications/route");
      const thongBao = async () => {
        const r = await goi(GET(jreq(`/api/notifications`, undefined, "GET")));
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM notifications
          WHERE user_id = ? AND type = 'bill_unpaid' AND payment_bill_id = ?`,
          c.admin.id,
          c.billId,
        );
      };
      assert.deepEqual(await thongBao(), [{ n: 1 }]);
      assert.deepEqual(await thongBao(), [{ n: 1 }], "đồng bộ lại không nhân bản");
      assert.equal((await danhDauChi(c.billId, { paidAt: todayISO() })).status, 200);
      assert.deepEqual(await thongBao(), [{ n: 0 }], "đã chi → dọn thông báo chưa đọc");
    } finally {
      await f.don();
    }
  },
);
