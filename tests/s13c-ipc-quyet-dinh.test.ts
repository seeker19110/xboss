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
import {
  bamYeuCauQuyetDinh,
  docIdempotencyKey,
  docXacNhanCanhBao,
  kiemXacNhanCanhBao,
} from "@/lib/tai-chinh/ipc-quyet-dinh";
import { docYeuCauXacNhan } from "@/app/payment-certs/_components/chiTietDot";

// QUALITY-FINAL-1 S13c — quyết định IPC (A5-FR06..FR10, DATA-CONTRACTS §6, DATA-MIGRATIONS §7):
// xác nhận cảnh báo theo warningVersion, Idempotency-Key phát lại kết quả bước cũ, snapshot
// quyết định bất biến (cùng transaction, RLS + quyền xboss_app), tuần tự hoá trên khoá HĐ, bước
// giữa của luồng duyệt cũng phải xác nhận và lỗi 409 rollback cả bước. Chuỗi chính (5 ca từng
// là todo) nằm ở tests/s13a-chuoi-ipc-thanh-toan.test.ts — file này phủ phần hợp đồng còn lại.

const S = { skip: !HAS_TEST_DB };
const LY_DO = "Phụ lục VO bổ sung khối lượng đang chờ ký";
const V64 = "a".repeat(64);

test.after(() => dangXuat());

// ── Thuần (không DB) ────────────────────────────────────────────────────────────────────

test("docXacNhanCanhBao: validate kiểu, cắt lý do, warningVersion phải là hex 64", () => {
  assert.deepEqual(docXacNhanCanhBao({}), {
    acknowledged: false,
    reason: null,
    warningVersion: null,
  });
  assert.deepEqual(
    docXacNhanCanhBao({ acknowledged: true, reason: "  x  ", warningVersion: V64 }),
    {
      acknowledged: true,
      reason: "x",
      warningVersion: V64,
    },
  );
  assert.equal(typeof docXacNhanCanhBao({ acknowledged: "true" }), "string");
  assert.equal(typeof docXacNhanCanhBao({ reason: 1 }), "string");
  assert.equal(typeof docXacNhanCanhBao({ warningVersion: "abc" }), "string");
  assert.equal(typeof docXacNhanCanhBao({ reason: "x".repeat(2001) }), "string");
});

test("kiemXacNhanCanhBao: có cảnh báo cần đủ ack + lý do + đúng version; không cảnh báo thì không đòi", () => {
  const coCanhBao = { vuotHopDong: [{} as never], warningVersion: V64 };
  const khong = { vuotHopDong: [], warningVersion: V64 };
  const du = { acknowledged: true, reason: LY_DO, warningVersion: V64 };
  assert.equal(kiemXacNhanCanhBao(coCanhBao, du), null);
  assert.equal(
    kiemXacNhanCanhBao(coCanhBao, { ...du, acknowledged: false })?.code,
    "acknowledgement_required",
  );
  assert.equal(
    kiemXacNhanCanhBao(coCanhBao, { ...du, reason: null })?.code,
    "acknowledgement_required",
  );
  assert.equal(
    kiemXacNhanCanhBao(coCanhBao, { ...du, warningVersion: null })?.code,
    "acknowledgement_required",
  );
  assert.equal(
    kiemXacNhanCanhBao(coCanhBao, { ...du, warningVersion: "b".repeat(64) })?.code,
    "warning_changed",
  );
  assert.equal(
    kiemXacNhanCanhBao(khong, { acknowledged: false, reason: null, warningVersion: null }),
    null,
  );
  // Đã xem bản khác (vd từng có cảnh báo) mà giờ nguồn đổi → vẫn báo đổi, không duyệt mù.
  assert.equal(
    kiemXacNhanCanhBao(khong, { ...du, warningVersion: "b".repeat(64) })?.code,
    "warning_changed",
  );
});

test("Idempotency-Key + băm yêu cầu: UUID chuẩn hoá chữ thường, sai dạng bị từ chối; băm ổn định", () => {
  assert.equal(docIdempotencyKey(null), null);
  assert.equal(docIdempotencyKey("  "), null);
  assert.equal(docIdempotencyKey("khong-phai-uuid"), "invalid");
  const k = randomUUID();
  assert.equal(docIdempotencyKey(k.toUpperCase()), k);
  const xn = { acknowledged: true, reason: LY_DO, warningVersion: V64 };
  const a = bamYeuCauQuyetDinh({ certId: 1, decision: "approved", rejectReason: "", xacNhan: xn });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(
    a,
    bamYeuCauQuyetDinh({ certId: 1, decision: "approved", rejectReason: "", xacNhan: { ...xn } }),
  );
  assert.notEqual(
    a,
    bamYeuCauQuyetDinh({
      certId: 1,
      decision: "approved",
      rejectReason: "",
      xacNhan: { ...xn, reason: "khác" },
    }),
  );
});

test("UI docYeuCauXacNhan: chỉ 409 acknowledgement_required/warning_changed mở hộp xác nhận; lỗi khác không bao giờ là 'đã duyệt'", () => {
  const vuot = [
    { boqItemId: 1, code: "B1", name: "Ống", unit: "m", qtyContract: 100, qtyCumulative: 110 },
  ];
  assert.deepEqual(
    docYeuCauXacNhan(409, {
      code: "acknowledgement_required",
      vuotHopDong: vuot,
      warningVersion: V64,
    }),
    { vuotHopDong: vuot, warningVersion: V64, doiNguon: false },
  );
  assert.equal(
    docYeuCauXacNhan(409, { code: "warning_changed", vuotHopDong: vuot, warningVersion: V64 })
      ?.doiNguon,
    true,
  );
  assert.equal(docYeuCauXacNhan(409, { code: "reconciliation_required" }), null);
  assert.equal(docYeuCauXacNhan(403, { code: "acknowledgement_required" }), null);
  assert.equal(docYeuCauXacNhan(409, { code: "warning_changed", vuotHopDong: vuot }), null);
  assert.equal(docYeuCauXacNhan(409, null), null);
});

// ── Route thật ──────────────────────────────────────────────────────────────────────────

async function taoHopDong() {
  const { POST } = await import("@/app/api/contracts/route");
  const r = await goi(
    POST(
      jreq(`/api/contracts`, {
        code: uniq("HD-S13C-"),
        kind: "nhan_thau",
        title: "HĐ nhận thầu S13c",
        partyName: "CĐT S13c",
        status: "active",
        value: 100000,
        advancePct: 0,
        retentionPct: 0,
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function taoBoq(contractId: number, qtyContract: number) {
  const { POST } = await import("@/app/api/boq/route");
  const r = await goi(
    POST(
      jreq(`/api/boq`, {
        code: uniq("BOQ-S13C-"),
        name: "Ống S13c",
        unit: "m",
        systemId: null,
        qtyContract,
        unitPrice: 1000,
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body!.id as number;
  const { run } = await import("@/lib/db");
  await run(`UPDATE boq_items SET contract_id = ? WHERE id = ?`, contractId, id);
  return id;
}

async function lapDot(contractId: number) {
  const { POST } = await import("@/app/api/payment-certs/route");
  const r = await goi(POST(jreq(`/api/payment-certs`, { contractId })));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

async function suaDot(certId: number, boqItemId: number, qtyPeriod: number) {
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const r = await goi(
    PATCH(
      jreq(`/api/payment-certs/${certId}`, { items: [{ boqItemId, qtyPeriod }] }, "PATCH"),
      P(certId),
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

async function trinh(certId: number) {
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  const r = await goi(POST(jreq(`/api/payment-certs/${certId}/submit`), P(certId)));
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

async function xemDot(certId: number) {
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  return goi(GET(jreq(`/api/payment-certs/${certId}`, undefined, "GET", TIEN_EXACT), P(certId)));
}

async function quyetDinh(certId: number, body: Record<string, unknown>, key?: string) {
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  return goi(
    requestRieng(() =>
      POST(
        jreq(
          `/api/payment-certs/${certId}/decide`,
          body,
          "POST",
          key ? { "Idempotency-Key": key } : undefined,
        ),
        P(certId),
      ),
    ),
  );
}

async function xacNhanHienTai(certId: number) {
  const xem = await xemDot(certId);
  assert.equal(xem.status, 200, JSON.stringify(xem.body));
  return {
    decision: "approved",
    acknowledged: true,
    reason: LY_DO,
    warningVersion: xem.body!.warningVersion as string,
  };
}

async function demBang(sql: string, ...args: unknown[]): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ n: number }>(sql, ...args))!.n;
}

const soPhieu = (certId: number) =>
  demBang(`SELECT COUNT(*)::int AS n FROM payment_bills WHERE payment_cert_id = ?`, certId);
const soSnapshot = (certId: number) =>
  demBang(
    `SELECT COUNT(*)::int AS n FROM payment_cert_decision_snapshots WHERE cert_id = ?`,
    certId,
  );

/** Dự án + PM đăng nhập + HĐ + dòng BOQ (KL HĐ cho trước) + đợt 1 đã duyệt KL `daDuyet`. */
async function dungCoDotDaDuyet(f: SoFixture, qtyContract: number, daDuyet: number) {
  const projectId = await f.duAn("s13c");
  const pm = await f.user("pm");
  await f.vao(pm, projectId);
  const contractId = await taoHopDong();
  const boqId = await taoBoq(contractId, qtyContract);
  const dot1 = await lapDot(contractId);
  await suaDot(dot1, boqId, daDuyet);
  await trinh(dot1);
  const d = await quyetDinh(dot1, { decision: "approved" });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  return { projectId, pm, contractId, boqId, dot1 };
}

test(
  "A5-FR07/FR09: duyệt có cảnh báo ghi snapshot bất biến (KL/giá/tổng exact, cảnh báo, version, xác nhận + lý do, rule) đúng 1 dòng; 409 không ghi gì",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungCoDotDaDuyet(f, 100, 90);
      const dot2 = await lapDot(c.contractId);
      await suaDot(dot2, c.boqId, 20);
      await trinh(dot2);

      const thieu = await quyetDinh(dot2, { decision: "approved" });
      assert.equal(thieu.status, 409);
      assert.equal(thieu.body?.code, "acknowledgement_required");
      // 409 trả cảnh báo HIỆN HÀNH (khối lượng, không tiền) để UI hiển thị lại.
      assert.equal((thieu.body?.vuotHopDong as unknown[]).length, 1);
      assert.match(String(thieu.body?.warningVersion), /^[0-9a-f]{64}$/);
      assert.equal(await soSnapshot(dot2), 0, "409 không ghi snapshot");

      const body = await xacNhanHienTai(dot2);
      const ok = await quyetDinh(dot2, body);
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.match(String(ok.body?.operationId), /^[0-9a-f-]{36}$/);

      const { queryOne } = await import("@/lib/db");
      const snap = await queryOne<{
        resultStatus: string;
        actorId: number;
        projectId: number;
        snapshot: Record<string, unknown>;
      }>(
        `SELECT result_status AS "resultStatus", actor_id AS "actorId", project_id AS "projectId",
                snapshot
           FROM payment_cert_decision_snapshots WHERE cert_id = ?`,
        dot2,
      );
      assert.equal(snap?.resultStatus, "approved");
      assert.equal(snap?.actorId, c.pm.id);
      assert.equal(snap?.projectId, c.projectId);
      const s = snap!.snapshot;
      assert.equal(s.moneyRule, "ipc-sum-v1");
      assert.equal(s.warningVersion, body.warningVersion);
      assert.equal(s.ackWarningVersion, body.warningVersion);
      assert.equal(s.acknowledged, true);
      assert.equal(s.ackReason, LY_DO);
      assert.deepEqual(s.warnings, [
        { boqItemId: c.boqId, qtyContract: "100.000", qtyCumulative: "110.000" },
      ]);
      assert.deepEqual(
        (s.lines as Record<string, unknown>[]).map((l) => [
          l.qtyPeriod,
          l.qtyCumulative,
          l.unitPrice,
        ]),
        [["20.000", "110.000", "1000.00"]],
      );
      assert.deepEqual(s.totals, {
        periodValue: "20000.00",
        cumulativeValue: "110000.00",
        advanceDeduct: "0.00",
        retentionDeduct: "0.00",
        approvedValue: "20000.00",
      });
      assert.equal(typeof s.paymentBillId, "number");
      assert.equal(await soSnapshot(dot2), 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR08: Idempotency-Key — retry cùng key trả kết quả cũ (replayed), không phiếu/snapshot thứ 2; khác payload → 409; key sai dạng → 422; người khác dùng key → 409",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungCoDotDaDuyet(f, 1000, 10);
      const dot2 = await lapDot(c.contractId);
      await suaDot(dot2, c.boqId, 5);
      await trinh(dot2);

      assert.equal(
        (await quyetDinh(dot2, { decision: "approved" }, "khong-phai-uuid")).body?.code,
        "idempotency_key_invalid",
      );

      const key = randomUUID();
      const lan1 = await quyetDinh(dot2, { decision: "approved" }, key);
      assert.equal(lan1.status, 200, JSON.stringify(lan1.body));
      assert.equal(lan1.body?.replayed, undefined);
      const lan2 = await quyetDinh(dot2, { decision: "approved" }, key);
      assert.equal(lan2.status, 200, JSON.stringify(lan2.body));
      assert.equal(lan2.body?.replayed, true);
      assert.equal(lan2.body?.decision, "approved");
      assert.equal(lan2.body?.operationId, key);
      assert.equal(await soPhieu(dot2), 1);
      assert.equal(await soSnapshot(dot2), 1);

      // Không key: retry sau khi đã chốt là quyết định MỚI → 409 trạng thái, không phiếu thêm.
      assert.equal((await quyetDinh(dot2, { decision: "approved" })).status, 409);

      const khacPayload = await quyetDinh(
        dot2,
        { decision: "rejected", rejectReason: "Sai KL" },
        key,
      );
      assert.equal(khacPayload.status, 409);
      assert.equal(khacPayload.body?.code, "idempotency_conflict");

      const pm2: NguoiTest = await f.user("pm");
      await f.vao(pm2, c.projectId);
      const nguoiKhac = await quyetDinh(dot2, { decision: "approved" }, key);
      assert.equal(nguoiKhac.status, 409);
      assert.equal(nguoiKhac.body?.code, "idempotency_conflict");

      // Mất quyền sau khi quyết định: phát lại cũng bị chặn (receipt không bypass quyền).
      const { run } = await import("@/lib/db");
      await run(`UPDATE users SET role = 'viewer' WHERE id = ?`, c.pm.id);
      await f.vao({ ...c.pm, role: "viewer" }, c.projectId);
      assert.equal((await quyetDinh(dot2, { decision: "approved" }, key)).status, 403);
      assert.equal(await soPhieu(dot2), 1);
      assert.equal(await soSnapshot(dot2), 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR07: bước GIỮA của luồng duyệt cũng phải xác nhận cảnh báo; 409 rollback cả bước engine; bước pending ghi snapshot 'pending', đợt giữ submitted",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungCoDotDaDuyet(f, 100, 90);
      // Luồng 2 bước (cấu hình Admin): pm → cdt. Bật SAU đợt 1 để đợt 1 duyệt kiểu cũ.
      const { insertId } = await import("@/lib/db");
      const flowId = await insertId(
        `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'payment_cert', ?)`,
        c.projectId,
        uniq("Luồng IPC S13c "),
      );
      await insertId(
        `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
        flowId,
      );
      await insertId(
        `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'cdt', NULL)`,
        flowId,
      );
      const dot2 = await lapDot(c.contractId); // người lập = pm (SoD: không tự duyệt)
      await suaDot(dot2, c.boqId, 20);
      await trinh(dot2);

      const pmDuyet = await f.user("pm");
      await f.vao(pmDuyet, c.projectId);
      const thieu = await quyetDinh(dot2, { decision: "approved" });
      assert.equal(thieu.status, 409);
      assert.equal(thieu.body?.code, "acknowledgement_required");
      const soBuoc = () =>
        demBang(
          `SELECT COUNT(*)::int AS n FROM approval_actions a JOIN approval_requests r ON r.id = a.request_id
            WHERE r.entity_type = 'payment_cert' AND r.entity_id = ?`,
          dot2,
        );
      assert.equal(await soBuoc(), 0, "409 rollback cả bước engine vừa ghi");

      const buoc1 = await quyetDinh(dot2, await xacNhanHienTai(dot2));
      assert.equal(buoc1.status, 200, JSON.stringify(buoc1.body));
      assert.equal(buoc1.body?.pending, true);
      assert.equal(buoc1.body?.nextRole, "cdt");
      assert.equal(await soBuoc(), 1);
      assert.equal(await soPhieu(dot2), 0);
      const { queryOne } = await import("@/lib/db");
      const st = await queryOne<{ s: string }>(
        `SELECT status AS s FROM payment_certs WHERE id = ?`,
        dot2,
      );
      assert.equal(st?.s, "submitted");
      const snap = await queryOne<{ r: string }>(
        `SELECT result_status AS r FROM payment_cert_decision_snapshots WHERE cert_id = ?`,
        dot2,
      );
      assert.equal(snap?.r, "pending");

      // CĐT duyệt bước cuối KHÔNG có viewPayments (không GET được đợt): 409 trả danh sách cảnh
      // báo (khối lượng, không tiền) + warningVersion để xác nhận — không mở đường xem tiền.
      const cdt = await f.user("cdt");
      await f.vao(cdt, c.projectId);
      assert.equal((await xemDot(dot2)).status, 403);
      const hoi = await quyetDinh(dot2, { decision: "approved" });
      assert.equal(hoi.status, 409);
      assert.equal(hoi.body?.code, "acknowledgement_required");
      assert.ok(!JSON.stringify(hoi.body).includes("20000"), "409 không lộ tiền");
      const cuoi = await quyetDinh(dot2, {
        decision: "approved",
        acknowledged: true,
        reason: LY_DO,
        warningVersion: hoi.body?.warningVersion,
      });
      assert.equal(cuoi.status, 200, JSON.stringify(cuoi.body));
      assert.equal(cuoi.body?.decision, "approved");
      assert.equal(await soPhieu(dot2), 1);
      assert.equal(await soSnapshot(dot2), 2, "mỗi bước 1 snapshot, không UPDATE pending→approved");
    } finally {
      await f.don();
    }
  },
);

/**
 * HĐ 1000 (không cảnh báo) + đợt 1 duyệt 90, đợt 2 KL 20 (route) và đợt 3 LEGACY (trước luật 409
 * lập đợt khi đợt trước còn mở) lưu luỹ kế 90 + 10 = 100 — cả hai đã TRÌNH trước khi đợt 2 được
 * duyệt, nên luỹ kế lưu lúc trình của đợt 3 (100) đã cũ khi tới lượt duyệt nó.
 */
async function haiDotDaTrinh(f: SoFixture) {
  const c = await dungCoDotDaDuyet(f, 1000, 90);
  const dot2 = await lapDot(c.contractId);
  await suaDot(dot2, c.boqId, 20);
  const { insertId, run } = await import("@/lib/db");
  const dot3 = await insertId(
    `INSERT INTO payment_certs (code, contract_id, period_no, status, created_by)
     VALUES (?, ?, 3, 'draft', ?)`,
    uniq("LEGACY-S13C-"),
    c.contractId,
    c.pm.id,
  );
  await run(
    `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
     SELECT ?, id, 10, 100, unit_price FROM boq_items WHERE id = ?`,
    dot3,
    c.boqId,
  );
  await trinh(dot2);
  await trinh(dot3);
  return { ...c, dot2, dot3 };
}

async function luyKe(id: number): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ c: string }>(
    `SELECT qty_cumulative::text AS c FROM payment_cert_items WHERE cert_id = ?`,
    id,
  ))!.c;
}

test(
  "A5-FR06: decide tính lại luỹ kế DƯỚI KHOÁ — đợt đã trình từ trước khi kỳ trước được duyệt vẫn chốt 120, không chốt luỹ kế lưu lúc trình (100)",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await haiDotDaTrinh(f);
      assert.equal(await luyKe(c.dot3), "100.000", "lúc trình kỳ 2 chưa duyệt");
      assert.equal((await quyetDinh(c.dot2, { decision: "approved" })).status, 200);
      const r3 = await quyetDinh(c.dot3, { decision: "approved" });
      assert.equal(r3.status, 200, JSON.stringify(r3.body));
      assert.equal(await luyKe(c.dot2), "110.000");
      assert.equal(await luyKe(c.dot3), "120.000");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC05: hai quyết định ĐỒNG THỜI trên 2 đợt mở của cùng HĐ được tuần tự hoá trên khoá HĐ — không chốt luỹ kế cũ",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await haiDotDaTrinh(f);
      const [r2, r3] = await Promise.all([
        quyetDinh(c.dot2, { decision: "approved" }),
        quyetDinh(c.dot3, { decision: "approved" }),
      ]);
      if (r2.status === 200 && r3.status === 200) {
        // Đợt 2 chốt trước → đợt 3 tính lại DƯỚI KHOÁ sau khi đợt 2 commit.
        assert.equal(await luyKe(c.dot2), "110.000");
        assert.equal(await luyKe(c.dot3), "120.000", "không chốt luỹ kế nháp cũ 100");
      } else {
        // Đợt 3 lấy khoá trước khi đợt 2 chốt → kỳ trước còn chờ duyệt → 409 (IPC tuần tự,
        // quyết định 2026-10-09); đợt 2 vẫn duyệt bình thường, đợt 3 không chốt/không phiếu.
        assert.equal(r2.status, 200, JSON.stringify(r2.body));
        assert.equal(r3.status, 409, JSON.stringify(r3.body));
        assert.equal(r3.body?.code, "previous_period_open");
        assert.equal(await soPhieu(c.dot3), 0);
      }
    } finally {
      await f.don();
    }
  },
);

test(
  "RLS + quyền: snapshot quyết định chỉ đọc đúng org/dự án; ghi phải đúng actor; xboss_app không UPDATE/DELETE được",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungCoDotDaDuyet(f, 1000, 10);
      const { withTransaction, query, run } = await import("@/lib/db");
      const ctx = (projectId: number, userId: number) =>
        run(
          `SELECT set_config('app.org_id', '1', true), set_config('app.project_id', ?, true),
                  set_config('app.user_id', ?, true)`,
          String(projectId),
          String(userId),
        );
      const doc = (projectId: number) =>
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await ctx(projectId, c.pm.id);
          return query(`SELECT id FROM payment_cert_decision_snapshots WHERE cert_id = ?`, c.dot1);
        });
      assert.equal((await doc(c.projectId)).length, 1);
      assert.equal((await doc(c.projectId + 1_000_000)).length, 0, "dự án khác → rỗng");

      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await ctx(c.projectId, c.pm.id);
          await run(
            `UPDATE payment_cert_decision_snapshots SET result_status = 'rejected' WHERE cert_id = ?`,
            c.dot1,
          );
        }),
        /permission denied/,
      );
      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await ctx(c.projectId, c.pm.id);
          await run(`DELETE FROM payment_cert_decision_snapshots WHERE cert_id = ?`, c.dot1);
        }),
        /permission denied/,
      );
      const khac: NguoiTest = await f.user("pm");
      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await ctx(c.projectId, khac.id);
          await run(
            `INSERT INTO payment_cert_decision_snapshots
               (id, cert_id, contract_id, project_id, org_id, actor_id, operation_id, request_hash,
                result_status, snapshot)
             VALUES (?::uuid, ?, ?, ?, 1, ?, ?::uuid, ?, 'approved', '{}'::jsonb)`,
            randomUUID(),
            c.dot1,
            c.contractId,
            c.projectId,
            c.pm.id, // actor ≠ app.user_id
            randomUUID(),
            V64,
          );
        }),
        /row-level security/,
      );
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR10: xoá upstream còn chứng từ hạ nguồn → 409 dependency_conflict (không 500): dòng BOQ trong gói thầu; NCC có hợp đồng; dòng BOQ trống vẫn xoá được",
  S,
  async () => {
    const f = new SoFixture();
    const { insertId, run, queryOne } = await import("@/lib/db");
    let supplierId: number | null = null;
    let tenderId: number | null = null;
    try {
      const projectId = await f.duAn("s13c-xoa");
      const pm = await f.user("pm");
      await f.vao(pm, projectId);
      const contractId = await taoHopDong();
      const boqThau = await taoBoq(contractId, 10);
      const boqTrong = await taoBoq(contractId, 10);
      tenderId = await insertId(
        `INSERT INTO tender_packages (code, name, project_id) VALUES (?, 'Gói S13c', ?)`,
        uniq("GT-S13C-"),
        projectId,
      );
      await run(
        `INSERT INTO tender_items (tender_id, boq_item_id, qty) VALUES (?, ?, 1)`,
        tenderId,
        boqThau,
      );
      const { DELETE: XOA_BOQ } = await import("@/app/api/boq/[id]/route");
      const r = await goi(XOA_BOQ(jreq(`/x`, undefined, "DELETE"), P(boqThau)));
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body?.code, "dependency_conflict");
      assert.match(String(r.body?.error), /1 gói thầu/);
      const trong = await goi(XOA_BOQ(jreq(`/x`, undefined, "DELETE"), P(boqTrong)));
      assert.equal(trong.status, 200, JSON.stringify(trong.body));

      supplierId = await insertId(
        `INSERT INTO suppliers (name, org_id) VALUES (?, 1)`,
        uniq("NCC S13c "),
      );
      await run(`UPDATE contracts SET party_supplier_id = ? WHERE id = ?`, supplierId, contractId);
      const admin = await f.user("admin");
      await f.vao(admin, projectId);
      const { DELETE: XOA_NCC } = await import("@/app/api/suppliers/[id]/route");
      const n = await goi(XOA_NCC(jreq(`/x`, undefined, "DELETE"), P(supplierId)));
      assert.equal(n.status, 409, JSON.stringify(n.body));
      assert.equal(n.body?.code, "dependency_conflict");
      const con = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM suppliers WHERE id = ?`,
        supplierId,
      );
      assert.equal(con?.n, 1);
    } finally {
      if (tenderId != null) {
        await run(`DELETE FROM tender_items WHERE tender_id = ?`, tenderId);
        await run(`DELETE FROM tender_packages WHERE id = ?`, tenderId);
      }
      await f.don();
      if (supplierId != null) await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    }
  },
);
