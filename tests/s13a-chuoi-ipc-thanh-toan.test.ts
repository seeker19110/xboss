import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SoFixture,
  jreq,
  P,
  goi,
  uniq,
  TIEN_EXACT,
  type NguoiTest,
} from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S13a — hồi quy CHUỖI khối lượng → IPC → phiếu thanh toán → báo cáo chi phí
// (A5-AC04..AC09, Q-AC06 phần IPC; docs/nang-cap/AUDIT-2026-09-25/A5-BUSINESS-CHAIN.md).
//
// Đường người dùng thật (TRAPS.md §6): kỹ sư tick ô → BOQ map task → KL thực hiện → PM lập đợt
// IPC (POST /api/payment-certs, KL gợi ý) → sửa KL (PATCH) → trình (POST …/submit) → duyệt
// (POST …/decide, sinh payment_bills) → báo cáo chi phí (GET /api/costs = getCostReport). Hợp
// đồng/BOQ/map/tạm ứng tạo qua route thật; chỉ cây WBS và liên kết `boq_items.contract_id`
// (không route nào ghi cột này) là dữ liệu đầu vào chèn SQL.
//
// Tiền so bằng CHUỖI exact (header decimal-string-v1, `::text`) với golden viết tay — không
// cộng/nhân tiền trên float JS (M45). Tỷ lệ tạm ứng/giữ lại lấy từ chính hợp đồng fixture.
//
// Chính sách giữ nguyên (quyết định 2026-09-04): vượt khối lượng hợp đồng là CẢNH BÁO, không
// chặn cứng — không ca nào ở đây đòi hard-cap. Các ca duyệt có cảnh báo gửi kèm
// acknowledged/reason/warningVersion (DATA-CONTRACTS §6) — S13c bắt buộc xác nhận đúng bản
// cảnh báo hiện tại (409 acknowledgement_required / warning_changed).
//
// 5 ca từng là `todo` (lỗi thật S13a tái hiện) đã được S13c vá và chạy xanh thật.

const S = { skip: !HAS_TEST_DB };
const LY_DO_VUOT = "Phụ lục VO bổ sung khối lượng đang chờ ký";

test.after(() => dangXuat());

type Body = Record<string, unknown> | null;

// ── Bước người dùng (route thật) ────────────────────────────────────────────────────────

async function taoHopDong(opts: { value: number; advancePct: number; retentionPct: number }) {
  const { POST } = await import("@/app/api/contracts/route");
  const r = await goi(
    POST(
      jreq(`/api/contracts`, {
        code: uniq("HD-S13A-"),
        // IPC là đợt nhà thầu trình CĐT/TVGS duyệt (submit/decide) → hợp đồng nhận thầu.
        kind: "nhan_thau",
        title: "HĐ nhận thầu S13a",
        partyName: "CĐT S13a",
        status: "active",
        ...opts,
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

/** Dòng BOQ qua route + gắn vào hợp đồng (dữ liệu đầu vào — không có route ghi contract_id). */
async function taoBoq(opts: {
  contractId: number;
  systemId?: number;
  qtyContract: number;
  unitPrice: number;
}) {
  const { POST } = await import("@/app/api/boq/route");
  const r = await goi(
    POST(
      jreq(`/api/boq`, {
        code: uniq("BOQ-S13A-"),
        name: "Ống thép S13a",
        unit: "m",
        systemId: opts.systemId ?? null,
        qtyContract: opts.qtyContract,
        unitPrice: opts.unitPrice,
      }),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body!.id as number;
  const { run } = await import("@/lib/db");
  await run(`UPDATE boq_items SET contract_id = ? WHERE id = ?`, opts.contractId, id);
  return id;
}

async function mapBoq(boqId: number, taskId: number) {
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  return goi(PUT(jreq(`/api/boq/${boqId}/map`, { map: [{ taskId, weight: 1 }] }, "PUT"), P(boqId)));
}

async function tick(dimId: number) {
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  return goi(PATCH(jreq(`/api/dimensions/${dimId}`, { installed: true }, "PATCH"), P(dimId)));
}

async function lapDot(contractId: number) {
  const { POST } = await import("@/app/api/payment-certs/route");
  return goi(requestRieng(() => POST(jreq(`/api/payment-certs`, { contractId }))));
}

async function suaDot(certId: number, items: { boqItemId: number; qtyPeriod: number }[]) {
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  return goi(PATCH(jreq(`/api/payment-certs/${certId}`, { items }, "PATCH"), P(certId)));
}

async function trinh(certId: number) {
  const { POST } = await import("@/app/api/payment-certs/[id]/submit/route");
  return goi(POST(jreq(`/api/payment-certs/${certId}/submit`), P(certId)));
}

async function quyetDinh(certId: number, body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  return goi(
    requestRieng(() => POST(jreq(`/api/payment-certs/${certId}/decide`, body), P(certId))),
  );
}

async function xemDot(certId: number) {
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  return goi(GET(jreq(`/api/payment-certs/${certId}`, undefined, "GET", TIEN_EXACT), P(certId)));
}

async function baoCaoChiPhi() {
  const { GET } = await import("@/app/api/costs/route");
  return goi(GET(jreq(`/api/costs?groupBy=system`, undefined, "GET", TIEN_EXACT)));
}

/**
 * Duyệt như người có quyền thật: xem đợt trước (đúng cái UI hiển thị), nếu có cảnh báo vượt HĐ
 * thì gửi xác nhận + lý do + warningVersion ĐANG hiện. Không cảnh báo → không gửi xác nhận rỗng.
 */
async function duyetNhuNguoiDung(certId: number) {
  const xem = await xemDot(certId);
  assert.equal(xem.status, 200, JSON.stringify(xem.body));
  const canhBao = (xem.body?.vuotHopDong as unknown[]) ?? [];
  const body: Record<string, unknown> = { decision: "approved" };
  if (canhBao.length > 0)
    Object.assign(body, {
      acknowledged: true,
      reason: LY_DO_VUOT,
      warningVersion: xem.body?.warningVersion,
    });
  return quyetDinh(certId, body);
}

/** Lập → sửa KL → trình → duyệt một đợt qua route (PM đang đăng nhập); trả id đợt. */
async function dotDuyet(contractId: number, boqId: number, qtyPeriod: number): Promise<number> {
  const lap = await lapDot(contractId);
  assert.equal(lap.status, 201, JSON.stringify(lap.body));
  const id = lap.body!.id as number;
  assert.equal((await suaDot(id, [{ boqItemId: boqId, qtyPeriod }])).status, 200);
  assert.equal((await trinh(id)).status, 200);
  const d = await duyetNhuNguoiDung(id);
  assert.equal(d.status, 200, JSON.stringify(d.body));
  return id;
}

// ── Đọc trạng thái (chỉ để kiểm) ────────────────────────────────────────────────────────

async function luyKe(certId: number): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ c: string }>(
    `SELECT qty_cumulative::text AS c FROM payment_cert_items WHERE cert_id = ?`,
    certId,
  ))!.c;
}

async function trangThaiDot(certId: number): Promise<string> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ s: string }>(
    `SELECT status AS s FROM payment_certs WHERE id = ?`,
    certId,
  ))!.s;
}

async function phieuCuaDot(certId: number): Promise<string[]> {
  const { query } = await import("@/lib/db");
  return (
    await query<{ a: string }>(
      `SELECT amount::text AS a FROM payment_bills WHERE payment_cert_id = ? ORDER BY id`,
      certId,
    )
  ).map((r) => r.a);
}

function tongDot(body: Body) {
  const t = body?.totals as Record<string, string>;
  return [t.periodValue, t.advanceDeduct, t.retentionDeduct, t.approvedValue];
}

function dongDau(body: Body) {
  const items = (body?.cert as { items: Record<string, string>[] }).items;
  return items[0];
}

function tongDuAn(body: Body) {
  const t = body?.projectTotals as Record<string, string>;
  return { budget: t.budget, committed: t.committed, actual: t.actual };
}

/** Dự án + PM (đăng nhập) + HĐ + 1 dòng BOQ gắn HĐ. */
async function dungHopDong(
  f: SoFixture,
  hd: { value: number; advancePct: number; retentionPct: number },
  boq: { qtyContract: number; unitPrice: number },
  systemId?: number,
) {
  const projectId = await f.duAn("ipc");
  const pm = await f.user("pm");
  await f.vao(pm, projectId);
  const contractId = await taoHopDong(hd);
  const boqId = await taoBoq({ contractId, systemId, ...boq });
  return { projectId, pm, contractId, boqId };
}

// ── Chuỗi đầy đủ ────────────────────────────────────────────────────────────────────────

test(
  "Chuỗi A5: tick → KL thực hiện → gợi ý IPC → trình → duyệt → phiếu thanh toán exact → báo cáo chi phí; kỳ 2 trừ đúng luỹ kế, trừ tạm ứng theo KỲ",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const he = await f.heThong();
      const c = await dungHopDong(
        f,
        { value: 1000000, advancePct: 10, retentionPct: 5 },
        { qtyContract: 100, unitPrice: 10000 },
        he,
      );
      const cay = await f.wbs(c.projectId, { soO: 4, systemId: he });
      const ks = await f.user("engineer");
      assert.equal((await mapBoq(c.boqId, cay.taskId)).status, 200);

      await f.vao(ks, c.projectId);
      for (const d of cay.dims.slice(0, 2)) assert.equal((await tick(d)).status, 200);

      // Kỳ 1: KL gợi ý = 100 × 50% = 50 (KL thực hiện theo tiến độ — gợi ý, chưa phải nghiệm thu).
      await f.vao(c.pm, c.projectId);
      const lap1 = await lapDot(c.contractId);
      assert.equal(lap1.status, 201, JSON.stringify(lap1.body));
      const dot1 = lap1.body!.id as number;
      const xem1 = await xemDot(dot1);
      assert.equal(xem1.status, 200);
      assert.equal(dongDau(xem1.body).qtyPeriod, "50.000");
      assert.equal(dongDau(xem1.body).qtyCumulative, "50.000");
      assert.equal(dongDau(xem1.body).unitPrice, "10000.00");
      // Golden: 50 × 10000 = 500000.00; tạm ứng 10% = 50000.00; giữ lại 5% = 25000.00.
      assert.deepEqual(tongDot(xem1.body), ["500000.00", "50000.00", "25000.00", "425000.00"]);
      assert.deepEqual(xem1.body?.vuotHopDong, []);

      assert.equal((await trinh(dot1)).status, 200);
      assert.equal((await duyetNhuNguoiDung(dot1)).status, 200);
      assert.equal(await trangThaiDot(dot1), "approved");
      assert.deepEqual(await phieuCuaDot(dot1), ["425000.00"], "đúng 1 phiếu = giá trị đề nghị");

      const cp1 = await baoCaoChiPhi();
      assert.equal(cp1.status, 200, JSON.stringify(cp1.body));
      assert.deepEqual(tongDuAn(cp1.body), {
        budget: "1000000.00",
        committed: "0.00",
        actual: "425000.00",
      });
      const meta = cp1.body?.metadata as { coverage: { reconciled: boolean } };
      assert.equal(meta.coverage.reconciled, true);

      // Thi công nốt → nghiệm thu task → kỳ 2 gợi ý 100 − 50 (luỹ kế đợt approved) = 50.
      await f.vao(ks, c.projectId);
      for (const d of cay.dims.slice(2)) assert.equal((await tick(d)).status, 200);
      await f.vao(c.pm, c.projectId);
      const { POST: NGHIEM_THU } = await import("@/app/api/tasks/[id]/approve/route");
      assert.equal((await NGHIEM_THU(jreq(`/x`, {}), P(cay.taskId))).status, 200);

      const lap2 = await lapDot(c.contractId);
      assert.equal(lap2.status, 201);
      const dot2 = lap2.body!.id as number;
      const xem2 = await xemDot(dot2);
      assert.equal(dongDau(xem2.body).qtyPeriod, "50.000");
      assert.equal(dongDau(xem2.body).qtyCumulative, "100.000");
      // Tạm ứng/giữ lại tính trên giá trị KỲ (500000), không trên luỹ kế (1000000) — không trừ lặp.
      assert.deepEqual(tongDot(xem2.body), ["500000.00", "50000.00", "25000.00", "425000.00"]);
      assert.equal((xem2.body?.totals as Record<string, string>).cumulativeValue, "1000000.00");
      assert.equal((await trinh(dot2)).status, 200);
      assert.equal((await duyetNhuNguoiDung(dot2)).status, 200);

      assert.equal(await luyKe(dot1), "50.000", "snapshot kỳ 1 không bị kỳ 2 sửa");
      assert.deepEqual(await phieuCuaDot(dot2), ["425000.00"]);
      const cp2 = await baoCaoChiPhi();
      assert.deepEqual(tongDuAn(cp2.body), {
        budget: "1000000.00",
        committed: "0.00",
        actual: "850000.00",
      });
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC06: tạm ứng ────────────────────────────────────────────────────────────────────

test(
  "A5-AC06: tạm ứng theo tỷ lệ HĐ ghi nhận KHÔNG cần nghiệm thu; IPC trừ tạm ứng đúng 1 lần; duyệt trùng không ghi phiếu thứ 2; báo cáo = tạm ứng + đề nghị",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 1000000, advancePct: 10, retentionPct: 5 },
        { qtyContract: 100, unitPrice: 10000 },
      );
      const { queryOne } = await import("@/lib/db");
      // Số tiền tạm ứng tính TRONG SQL từ chính điều khoản hợp đồng (không tự đặt tỷ lệ).
      const tamUng = (await queryOne<{ a: string }>(
        `SELECT ROUND(value * advance_pct / 100, 2)::text AS a FROM contracts WHERE id = ?`,
        c.contractId,
      ))!.a;
      assert.equal(tamUng, "100000.00");
      const { POST: TAO_PHIEU } = await import("@/app/api/payments/bills/route");
      const pTamUng = await goi(
        TAO_PHIEU(
          jreq(`/api/payments/bills`, {
            type: "advance",
            responsible: "Thầu phụ S13a",
            amount: Number(tamUng),
            paidDate: "2026-10-01",
            description: "Tạm ứng theo điều khoản HĐ",
          }),
        ),
      );
      assert.equal(pTamUng.status, 200, JSON.stringify(pTamUng.body));

      // Kỳ 1 (chưa có task nào nghiệm thu): KL 30 → 300000.00, trừ tạm ứng 10% = 30000.00.
      const lap = await lapDot(c.contractId);
      assert.equal(lap.status, 201);
      const dot = lap.body!.id as number;
      assert.equal((await suaDot(dot, [{ boqItemId: c.boqId, qtyPeriod: 30 }])).status, 200);
      assert.equal((await trinh(dot)).status, 200);
      const kq = await Promise.all([
        quyetDinh(dot, { decision: "approved" }),
        quyetDinh(dot, { decision: "approved" }),
      ]);
      assert.deepEqual(kq.map((r) => r.status).sort(), [200, 409], "duyệt trùng → 1 lần chuyển");
      assert.deepEqual(await phieuCuaDot(dot), ["255000.00"], "không ghi phiếu/trừ tạm ứng lần 2");
      const xem = await xemDot(dot);
      assert.deepEqual(tongDot(xem.body), ["300000.00", "30000.00", "15000.00", "255000.00"]);

      const cp = await baoCaoChiPhi();
      assert.equal(cp.status, 200);
      assert.equal(tongDuAn(cp.body).actual, "355000.00", "100000.00 tạm ứng + 255000.00 đề nghị");
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC04: vượt khối lượng hợp đồng = cảnh báo ───────────────────────────────────────

test(
  "A5-AC04: HĐ 100, đã duyệt 90, kỳ mới 20 → luỹ kế 110 + cảnh báo từng dòng; nháp/trình được; duyệt có xác nhận không bị hard-cap",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const dot1 = await dotDuyet(c.contractId, c.boqId, 90);
      assert.equal(await luyKe(dot1), "90.000");

      const lap = await lapDot(c.contractId);
      const dot2 = lap.body!.id as number;
      const sua = await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 20 }]);
      assert.equal(sua.status, 200, "nháp vượt HĐ vẫn lưu được");
      const vuot = sua.body?.vuotHopDong as { boqItemId: number; qtyCumulative: number }[];
      assert.equal(vuot.length, 1);
      assert.equal(vuot[0].boqItemId, c.boqId);
      assert.equal(vuot[0].qtyCumulative, 110);

      const xem = await xemDot(dot2);
      assert.equal(dongDau(xem.body).qtyCumulative, "110.000");
      assert.equal((xem.body?.vuotHopDong as unknown[]).length, 1);

      assert.equal((await trinh(dot2)).status, 200, "trình được dù vượt HĐ");
      const d = await duyetNhuNguoiDung(dot2);
      assert.equal(d.status, 200, `không hard-cap 100: ${JSON.stringify(d.body)}`);
      assert.equal(await trangThaiDot(dot2), "approved");
      assert.equal(await luyKe(dot2), "110.000");
      assert.deepEqual(await phieuCuaDot(dot2), ["20000.00"]);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC04: đợt KHÔNG có cảnh báo duyệt không cần xác nhận (không đòi xác nhận rỗng)",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const lap = await lapDot(c.contractId);
      const dot = lap.body!.id as number;
      assert.equal((await suaDot(dot, [{ boqItemId: c.boqId, qtyPeriod: 50 }])).status, 200);
      assert.equal((await trinh(dot)).status, 200);
      const d = await quyetDinh(dot, { decision: "approved" });
      assert.equal(d.status, 200, JSON.stringify(d.body));
      assert.deepEqual(await phieuCuaDot(dot), ["50000.00"]);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC04/FR07: có cảnh báo vượt HĐ mà duyệt KHÔNG xác nhận → 409 acknowledgement_required, đợt giữ 'submitted', không sinh phiếu",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      await dotDuyet(c.contractId, c.boqId, 90);
      const dot2 = (await lapDot(c.contractId)).body!.id as number;
      await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 20 }]);
      assert.equal((await trinh(dot2)).status, 200);

      const d = await quyetDinh(dot2, { decision: "approved" });
      assert.equal(d.status, 409, `duyệt bỏ qua cảnh báo: ${JSON.stringify(d.body)}`);
      assert.equal(d.body?.code, "acknowledgement_required");
      assert.equal(await trangThaiDot(dot2), "submitted");
      assert.deepEqual(await phieuCuaDot(dot2), []);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC05/FR07: cảnh báo đổi sau khi người duyệt xem (warningVersion cũ) → 409 warning_changed; xác nhận bản hiện tại → duyệt được",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      await dotDuyet(c.contractId, c.boqId, 90);
      const dot2 = (await lapDot(c.contractId)).body!.id as number;
      await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 20 }]);
      const v1 = (await xemDot(dot2)).body?.warningVersion;
      assert.equal(typeof v1, "string", "GET phải trả warningVersion khi có cảnh báo");

      await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 25 }]);
      const v2 = (await xemDot(dot2)).body?.warningVersion;
      assert.notEqual(v2, v1, "cảnh báo đổi (110 → 115) phải đổi warningVersion");
      assert.equal((await trinh(dot2)).status, 200);

      const cu = await quyetDinh(dot2, {
        decision: "approved",
        acknowledged: true,
        reason: LY_DO_VUOT,
        warningVersion: v1,
      });
      assert.equal(cu.status, 409);
      assert.equal(cu.body?.code, "warning_changed");
      assert.equal(await trangThaiDot(dot2), "submitted");
      assert.deepEqual(await phieuCuaDot(dot2), []);

      const moi = await quyetDinh(dot2, {
        decision: "approved",
        acknowledged: true,
        reason: LY_DO_VUOT,
        warningVersion: v2,
      });
      assert.equal(moi.status, 200);
      assert.equal(await luyKe(dot2), "115.000");
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC05: tuần tự hoá các kỳ ─────────────────────────────────────────────────────────

test(
  "A5-AC05: hai kỳ 20/10 sau 90 — lập kỳ mới khi kỳ trước còn nháp/trình → 409; duyệt đúng thứ tự → luỹ kế 110 rồi 120, snapshot kỳ cũ giữ nguyên",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const dot1 = await dotDuyet(c.contractId, c.boqId, 90);

      const dot2 = (await lapDot(c.contractId)).body!.id as number;
      assert.equal((await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 20 }])).status, 200);
      assert.equal((await lapDot(c.contractId)).status, 409, "kỳ trước đang nháp");
      assert.equal((await trinh(dot2)).status, 200);
      assert.equal((await lapDot(c.contractId)).status, 409, "kỳ trước đang chờ duyệt");
      assert.equal((await duyetNhuNguoiDung(dot2)).status, 200);
      assert.equal(await luyKe(dot2), "110.000");

      const dot3 = (await lapDot(c.contractId)).body!.id as number;
      assert.equal((await suaDot(dot3, [{ boqItemId: c.boqId, qtyPeriod: 10 }])).status, 200);
      const xem3 = await xemDot(dot3);
      assert.equal(dongDau(xem3.body).qtyCumulative, "120.000");
      assert.equal(
        (xem3.body?.vuotHopDong as { qtyCumulative: number }[])[0]?.qtyCumulative,
        120,
        "cảnh báo theo luỹ kế MỚI, không theo luỹ kế cũ",
      );
      assert.equal((await trinh(dot3)).status, 200);
      assert.equal((await duyetNhuNguoiDung(dot3)).status, 200);

      assert.equal(await luyKe(dot1), "90.000");
      assert.equal(await luyKe(dot2), "110.000");
      assert.equal(await luyKe(dot3), "120.000");
      assert.deepEqual(await phieuCuaDot(dot3), ["10000.00"]);
    } finally {
      await f.don();
    }
  },
);

test("A5-AC05: hai lượt lập đợt đồng thời trên cùng HĐ → đúng 1 đợt (201 + 409)", S, async () => {
  const f = new SoFixture();
  try {
    const c = await dungHopDong(
      f,
      { value: 100000, advancePct: 0, retentionPct: 0 },
      { qtyContract: 100, unitPrice: 1000 },
    );
    const kq = await Promise.all([lapDot(c.contractId), lapDot(c.contractId)]);
    assert.deepEqual(kq.map((r) => r.status).sort(), [201, 409]);
    const { queryOne } = await import("@/lib/db");
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_certs WHERE contract_id = ?`,
      c.contractId,
    );
    assert.equal(n?.n, 1);
  } finally {
    await f.don();
  }
});

/**
 * Hai đợt cùng mở trên một HĐ: kỳ 2 lập qua route (luỹ kế 90 + 20 = 110), kỳ 3 là dữ liệu
 * LEGACY đúng như `saveCertItems` đã ghi trước quyết định 2026-10-01 (khi chưa chặn lập đợt
 * mới lúc đợt trước còn mở): luỹ kế = đợt approved gần nhất (90) + 10 = 100. Trạng thái này có
 * thật trong production (chính lỗi "trả trùng" sinh ra luật 409), nên quyết định cuối không
 * được tin luỹ kế lưu từ lúc nháp (A5-FR06).
 */
async function haiDotCungMo(f: SoFixture) {
  const c = await dungHopDong(
    f,
    { value: 100000, advancePct: 0, retentionPct: 0 },
    { qtyContract: 100, unitPrice: 1000 },
  );
  await dotDuyet(c.contractId, c.boqId, 90);
  const dot2 = (await lapDot(c.contractId)).body!.id as number;
  assert.equal((await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 20 }])).status, 200);
  const { insertId, run } = await import("@/lib/db");
  const dot3 = await insertId(
    `INSERT INTO payment_certs (code, contract_id, period_no, status, created_by)
     VALUES (?, ?, 3, 'draft', ?)`,
    uniq("LEGACY-S13A-"),
    c.contractId,
    c.pm.id,
  );
  await run(
    `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
     SELECT ?, id, 10, 100, unit_price FROM boq_items WHERE id = ?`,
    dot3,
    c.boqId,
  );
  return { ...c, dot2, dot3 };
}

test(
  "A5-FR06: hai đợt cùng mở (dữ liệu legacy) duyệt đúng thứ tự → luỹ kế kỳ sau tính lại dưới khoá = 120, không dùng luỹ kế nháp cũ 100",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await haiDotCungMo(f);
      assert.equal((await trinh(c.dot2)).status, 200);
      assert.equal((await duyetNhuNguoiDung(c.dot2)).status, 200);
      assert.equal(await luyKe(c.dot2), "110.000");
      assert.equal((await trinh(c.dot3)).status, 200);
      await duyetNhuNguoiDung(c.dot3);
      assert.equal(await luyKe(c.dot3), "120.000", "luỹ kế nháp cũ (100) bị dùng lại");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR06: kỳ SAU đã duyệt thì duyệt kỳ TRƯỚC phải trả conflict (cần đối soát/điều chỉnh), không chốt im lặng",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await haiDotCungMo(f);
      assert.equal((await trinh(c.dot3)).status, 200);
      const r3 = await duyetNhuNguoiDung(c.dot3);
      const luyKe3 = await luyKe(c.dot3);
      assert.equal((await trinh(c.dot2)).status, 200);
      const r2 = await duyetNhuNguoiDung(c.dot2);
      assert.ok(
        !(r3.status === 200 && r2.status === 200),
        "kỳ sau đã approved mà kỳ trước vẫn được duyệt 200 — phải 409 cần đối soát",
      );
      if (r3.status === 200) {
        assert.equal(r2.status, 409);
        assert.equal(r2.body?.code, "reconciliation_required");
        assert.equal(await trangThaiDot(c.dot2), "submitted");
        assert.deepEqual(await phieuCuaDot(c.dot2), []);
      }
      assert.equal(await luyKe(c.dot3), luyKe3, "không âm thầm sửa snapshot kỳ sau");
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC07: snapshot, phụ thuộc, tham chiếu chéo ───────────────────────────────────────

test(
  "A5-AC07/FR09: đổi đơn giá BOQ sau khi duyệt không reprice đợt cũ/phiếu; ngân sách báo cáo theo giá mới",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const dot1 = await dotDuyet(c.contractId, c.boqId, 40);
      const { PATCH: SUA_BOQ } = await import("@/app/api/boq/[id]/route");
      const sua = await goi(
        SUA_BOQ(jreq(`/api/boq/${c.boqId}`, { unitPrice: 2000 }, "PATCH"), P(c.boqId)),
      );
      assert.equal(sua.status, 200, JSON.stringify(sua.body));

      const xem = await xemDot(dot1);
      assert.equal(dongDau(xem.body).unitPrice, "1000.00", "đơn giá đã chốt trong đợt");
      assert.deepEqual(tongDot(xem.body), ["40000.00", "0.00", "0.00", "40000.00"]);
      assert.deepEqual(await phieuCuaDot(dot1), ["40000.00"]);

      const cp = await baoCaoChiPhi();
      assert.deepEqual(tongDuAn(cp.body), {
        budget: "200000.00",
        committed: "0.00",
        actual: "40000.00",
      });

      // Đợt MỚI chụp giá hiện hành.
      const dot2 = (await lapDot(c.contractId)).body!.id as number;
      await suaDot(dot2, [{ boqItemId: c.boqId, qtyPeriod: 10 }]);
      assert.equal(dongDau((await xemDot(dot2)).body).unitPrice, "2000.00");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC07/FR10: downstream đã chốt chặn huỷ upstream — xoá HĐ có đợt đã duyệt → 409; xoá dòng BOQ có dòng IPC → không mất lịch sử",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const dot = await dotDuyet(c.contractId, c.boqId, 40);

      const admin = await f.user("admin");
      await f.vao(admin, c.projectId);
      const { DELETE: XOA_HD } = await import("@/app/api/contracts/[id]/route");
      const xoaHd = await goi(XOA_HD(jreq(`/x`, undefined, "DELETE"), P(c.contractId)));
      assert.equal(xoaHd.status, 409);

      await f.vao(c.pm, c.projectId);
      const { DELETE: XOA_BOQ } = await import("@/app/api/boq/[id]/route");
      let st: number;
      try {
        st = (await goi(XOA_BOQ(jreq(`/x`, undefined, "DELETE"), P(c.boqId)))).status;
      } catch {
        st = 500; // phòng thủ: trước S13c lỗi FK 23503 ném ra ngoài handler
      }
      assert.notEqual(st, 200);

      const { queryOne } = await import("@/lib/db");
      const con = await queryOne<{ hd: string | null; boq: number; dong: number }>(
        `SELECT (SELECT deleted_at::text FROM contracts WHERE id = ?) AS hd,
                (SELECT COUNT(*)::int FROM boq_items WHERE id = ?) AS boq,
                (SELECT COUNT(*)::int FROM payment_cert_items WHERE cert_id = ?) AS dong`,
        c.contractId,
        c.boqId,
        dot,
      );
      assert.deepEqual(con, { hd: null, boq: 1, dong: 1 });
      assert.deepEqual(await phieuCuaDot(dot), ["40000.00"]);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR10: xoá dòng BOQ có dòng IPC đã chốt trả 409 dependency_conflict có kiểm soát",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      await dotDuyet(c.contractId, c.boqId, 40);
      const { DELETE: XOA_BOQ } = await import("@/app/api/boq/[id]/route");
      const r = await goi(XOA_BOQ(jreq(`/x`, undefined, "DELETE"), P(c.boqId)));
      assert.equal(r.status, 409);
      assert.equal(r.body?.code, "dependency_conflict");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC07 cách ly: không tạo được tham chiếu chéo dự án (HĐ/dòng BOQ/task/đợt của dự án khác) — không ghi gì",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const b = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const cayB = await f.wbs(b.projectId, { soO: 1 });
      const dotB = (await lapDot(b.contractId)).body!.id as number;
      await suaDot(dotB, [{ boqItemId: b.boqId, qtyPeriod: 5 }]);

      const a = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const dotA = (await lapDot(a.contractId)).body!.id as number;
      await suaDot(dotA, [{ boqItemId: a.boqId, qtyPeriod: 5 }]);

      // HĐ dự án khác: phản hồi giống hệt id không tồn tại (không xác nhận tồn tại).
      const lapB = await lapDot(b.contractId);
      const lapKhongCo = await lapDot(2147483647);
      assert.equal(lapB.status, lapKhongCo.status);
      assert.deepEqual(lapB.body, lapKhongCo.body);
      assert.notEqual(lapB.status, 201);
      const { GET: DS } = await import("@/app/api/payment-certs/route");
      const ds = await goi(
        DS(jreq(`/api/payment-certs?contractId=${b.contractId}`, undefined, "GET")),
      );
      assert.notEqual(ds.status, 200);

      // Dòng BOQ / task của dự án khác không gắn được vào chứng từ/map của dự án mình.
      const suaCheo = await suaDot(dotA, [{ boqItemId: b.boqId, qtyPeriod: 5 }]);
      assert.equal(suaCheo.status, 422);
      assert.equal(await luyKe(dotA), "5.000");
      assert.equal((await mapBoq(a.boqId, cayB.taskId)).status, 422);

      // Đợt của dự án khác: xem/sửa/trình/duyệt → 404.
      assert.equal((await xemDot(dotB)).status, 404);
      assert.equal((await suaDot(dotB, [{ boqItemId: b.boqId, qtyPeriod: 99 }])).status, 404);
      assert.equal((await trinh(dotB)).status, 404);
      assert.equal((await quyetDinh(dotB, { decision: "approved" })).status, 404);

      const { queryOne } = await import("@/lib/db");
      const n = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM payment_certs WHERE contract_id = ?`,
        b.contractId,
      );
      assert.equal(n?.n, 1, "không đợt nào được lập trên HĐ dự án khác");
      assert.equal(await trangThaiDot(dotB), "draft");
      assert.equal(await luyKe(dotB), "5.000");
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC08 + AC09: vai trò & lộ tiền ───────────────────────────────────────────────────

test(
  "A5-AC08/AC09: kỹ sư/subcon/cdt/viewer không lập/trình/duyệt/xem IPC hay chi phí (kể cả gửi acknowledged); BCH xem được nhưng không duyệt; lỗi không lộ số tiền",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungHopDong(
        f,
        { value: 100000, advancePct: 0, retentionPct: 0 },
        { qtyContract: 100, unitPrice: 1000 },
      );
      const dot = (await lapDot(c.contractId)).body!.id as number;
      await suaDot(dot, [{ boqItemId: c.boqId, qtyPeriod: 37 }]);
      assert.equal((await trinh(dot)).status, 200);
      const tienBiMat = "37000"; // giá trị đợt — không được xuất hiện trong phản hồi lỗi

      const coGang = { decision: "approved", acknowledged: true, reason: LY_DO_VUOT };
      for (const role of ["engineer", "subcon", "cdt", "viewer"] as const) {
        const u: NguoiTest = await f.user(role);
        await f.vao(u, c.projectId);
        const kq = [
          await lapDot(c.contractId),
          await suaDot(dot, [{ boqItemId: c.boqId, qtyPeriod: 1 }]),
          await trinh(dot),
          await quyetDinh(dot, coGang),
          await xemDot(dot),
          await baoCaoChiPhi(),
        ];
        assert.deepEqual(
          kq.map((r) => r.status),
          [403, 403, 403, 403, 403, 403],
          `${role}: ${JSON.stringify(kq.map((r) => r.body))}`,
        );
        for (const r of kq)
          assert.ok(!JSON.stringify(r.body).includes(tienBiMat), `${role} lộ tiền`);
      }

      const bch = await f.user("bch");
      await f.vao(bch, c.projectId);
      const xem = await xemDot(dot);
      assert.equal(xem.status, 200);
      assert.equal((xem.body?.totals as Record<string, string>).periodValue, "37000.00");
      assert.equal((await baoCaoChiPhi()).status, 200);
      assert.equal((await quyetDinh(dot, coGang)).status, 403, "BCH xem tài chính, không duyệt");

      assert.equal(await trangThaiDot(dot), "submitted");
      assert.deepEqual(await phieuCuaDot(dot), []);

      await f.vao(c.pm, c.projectId);
      assert.equal((await duyetNhuNguoiDung(dot)).status, 200);
      assert.deepEqual(await phieuCuaDot(dot), ["37000.00"]);
    } finally {
      await f.don();
    }
  },
);
