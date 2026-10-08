import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import {
  decimalFromUnscaled,
  moneyToWire,
  moneyWireFormat,
  isMoneyPrecisionError,
  parseFixedDecimalExact,
} from "@/lib/nen/money";
import { certTotalsToWire, certItemsToWire } from "@/lib/tai-chinh/paymentcerts";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";

// QUALITY-FINAL-1 / S10a — DTO tiền opt-in decimal-string-v1 (A3-FR06, A3-AC05) cho
// /api/payment-certs/**: header → chuỗi canonical + moneyFormat; không header → JSON number
// legacy trong biên an toàn, ngoài biên 422 money_precision_unsupported; ID/KL/đếm giữ kiểu;
// API tài chính private,no-store + Vary; Excel ô text khi vượt 15 chữ số có nghĩa; duyệt đợt
// ghi payment_bills.amount exact. Đi đúng đường người dùng: POST lập đợt → PATCH KL → GET/xuất
// Excel/trình/duyệt qua route thật (TRAPS §6).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const HEADER = "X-XBoss-Money-Format";

const jreq = (url: string, body?: unknown, method = "POST", headers?: Record<string, string>) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

type Dong = { unitPrice: string; qtyPeriod: number };
const THUONG: Dong[] = [{ unitPrice: "94.00", qtyPeriod: 1 }]; // 10,25% → tạm ứng 9.64 (nửa xu)
const VUOT_BIEN: Dong[] = [
  { unitPrice: "9007199254740.99", qtyPeriod: 10 },
  { unitPrice: "0.03", qtyPeriod: 1 },
];

type TyLe = { advancePct: string; retentionPct: string };
const TY_LE_MAC_DINH: TyLe = { advancePct: "10.25", retentionPct: "5.00" };

/** Dựng dự án + PM (đã đăng nhập) + hợp đồng theo tỷ lệ + BOQ (qty_contract tuỳ chọn). */
async function dungHopDong(dong: Dong[], tyLe: TyLe = TY_LE_MAC_DINH, qtyContract = 1000) {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10a IPC "));
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10a PM', ?, 'hash-test-s10a', 'pm', 1)`,
    `s10a-${uniq("pm")}@test.local`,
  );
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ S10a', 'CĐT test', 0, ?::numeric, ?::numeric, 'active', ?)`,
    `HD-${uniq("S10a")}`,
    tyLe.advancePct,
    tyLe.retentionPct,
    projectId,
  );
  const boqIds: number[] = [];
  for (const [i, d] of dong.entries()) {
    boqIds.push(
      await insertId(
        `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
         VALUES (?, ?, 'm', ?, ?::numeric, ?)`,
        `BOQ-${uniq("S10a")}`,
        `Dòng ${i + 1}`,
        qtyContract,
        d.unitPrice,
        contractId,
      ),
    );
  }
  const fixture = { projectId, contractId, pmId };
  await dangNhapDuAn({ id: pmId, passwordHash: pm!.password_hash }, projectId);
  return { ...fixture, boqIds };
}

/** Lập đợt mới (POST) cho hợp đồng rồi nhập KL (PATCH) qua route thật; trả id đợt. */
async function lapDot(contractId: number, items: { boqItemId: number; qtyPeriod: number }[]) {
  const { POST } = await import("@/app/api/payment-certs/route");
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const tao = await POST(jreq("/api/payment-certs", { contractId }));
  assert.equal(tao.status, 201);
  const { id } = (await tao.json()) as { id: number };
  const sua = await PATCH(jreq(`/api/payment-certs/${id}`, { items }, "PATCH"), thamSo(id));
  assert.equal(sua.status, 200);
  return id;
}

/** Hợp đồng + đợt 1 với KL `dong`, qua route thật. */
async function dungDot(dong: Dong[], tyLe: TyLe = TY_LE_MAC_DINH) {
  const f = await dungHopDong(dong, tyLe);
  try {
    const certId = await lapDot(
      f.contractId,
      dong.map((d, i) => ({ boqItemId: f.boqIds[i], qtyPeriod: d.qtyPeriod })),
    );
    return { ...f, certId };
  } catch (err) {
    await donDep(f);
    throw err;
  }
}

const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function donDep(f: { projectId: number; contractId: number; pmId: number }) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM payment_bills WHERE contract_id = ?`, f.contractId);
  // Snapshot quyết định IPC (S13c) tham chiếu đợt — dọn trước (chỉ fixture owner được xoá).
  await run(`DELETE FROM payment_cert_decision_snapshots WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM payment_certs WHERE contract_id = ?`, f.contractId); // cascade dòng KL
  await run(`DELETE FROM boq_items WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM contracts WHERE id = ?`, f.contractId);
  await run(`DELETE FROM user_projects WHERE user_id = ?`, f.pmId);
  await run(`DELETE FROM users WHERE id = ?`, f.pmId);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
}

async function getChiTiet(id: number, headers?: Record<string, string>) {
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  return GET(jreq(`/api/payment-certs/${id}`, undefined, "GET", headers), thamSo(id));
}

function kiemHeaderTaiChinh(res: Response) {
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
}

// ---------- Hàm thuần ----------

test("decimalFromUnscaled: nghịch đảo parseFixedDecimalExact, giữ số 0 đầu và dấu", () => {
  for (const [v, scale] of [
    ["0.00500", 5],
    ["-0.01", 2],
    ["90071992547409.93", 2],
    ["12", 0],
    ["0.000", 3],
  ] as const) {
    assert.equal(decimalFromUnscaled(parseFixedDecimalExact(v, scale), scale), v);
  }
  assert.throws(() => decimalFromUnscaled(1n, 19), RangeError);
});

const DONG_MAU = {
  id: 7,
  boqItemId: 3,
  boqCode: "B1",
  boqName: "Ống",
  boqUnit: "m",
  boqQtyContract: 100,
  qtyPeriod: 0.005,
  qtyCumulative: 1.25,
  unitPrice: 12345.67,
};
const EXACT_MAU = {
  id: 7,
  unitPrice: "12345.67",
  qtyPeriod: "0.005",
  qtyCumulative: "1.250",
  boqQtyContract: "100.000",
};

test("certItemsToWire: v1 chuỗi canonical, legacy number, ngoài biên lỗi precision, thiếu dòng exact throw", () => {
  const [v1] = certItemsToWire([DONG_MAU], [EXACT_MAU], "decimal-string-v1");
  assert.deepEqual(
    [v1.unitPrice, v1.qtyPeriod, v1.qtyCumulative, v1.boqQtyContract, v1.id],
    ["12345.67", "0.005", "1.250", "100.000", 7],
  );
  const [lg] = certItemsToWire([DONG_MAU], [EXACT_MAU], "legacy-number");
  assert.deepEqual(
    [lg.unitPrice, lg.qtyPeriod, lg.qtyCumulative, lg.boqQtyContract],
    [12345.67, 0.005, 1.25, 100],
  );

  // 9007199254740993 đồng×100 > 2^53 — v1 giữ exact, legacy từ chối (không xấp xỉ).
  const lon = [{ ...EXACT_MAU, unitPrice: "90071992547409.93" }];
  assert.equal(
    certItemsToWire([DONG_MAU], lon, "decimal-string-v1")[0].unitPrice,
    "90071992547409.93",
  );
  assert.throws(() => certItemsToWire([DONG_MAU], lon, "legacy-number"), isMoneyPrecisionError);
  assert.throws(() => certItemsToWire([DONG_MAU], [], "decimal-string-v1"), /thiếu dòng exact/);
});

test("certItemsToWire sau stripSensitive: user thiếu viewPayments bị che đơn giá ở cả 2 định dạng", () => {
  const cert = { items: [DONG_MAU] };
  const [masked] = stripSensitive("paymentCert", [cert], { role: "engineer" });
  for (const fmt of ["decimal-string-v1", "legacy-number"] as const) {
    const [it] = certItemsToWire(masked.items, [EXACT_MAU], fmt);
    assert.equal(it.unitPrice, null, `${fmt}: đơn giá phải bị che`);
    assert.notEqual(it.qtyPeriod, null, `${fmt}: KL không bị che`);
  }
});

test("moneyWireFormat: chỉ đúng decimal-string-v1 mới opt-in, giá trị lạ/thiếu = legacy", () => {
  assert.equal(moneyWireFormat("decimal-string-v1"), "decimal-string-v1");
  assert.equal(moneyWireFormat(" decimal-string-v1 "), "decimal-string-v1");
  assert.equal(moneyWireFormat(null), "legacy-number");
  assert.equal(moneyWireFormat("decimal-string-v2"), "legacy-number");
  assert.equal(moneyWireFormat("DECIMAL-STRING-V1"), "legacy-number");
});

test("moneyToWire/certTotalsToWire: legacy ngoài biên throw lỗi precision, trường bị che giữ null", () => {
  assert.equal(moneyToWire(9007199254740993n, "decimal-string-v1"), "90071992547409.93");
  assert.equal(moneyToWire(7966n, "legacy-number"), 79.66);
  assert.throws(
    () => moneyToWire(9007199254740993n, "legacy-number"),
    (err: unknown) => isMoneyPrecisionError(err),
  );
  // Che quyền chạy TRƯỚC adapter: số bị che (null) không gây 422 lộ độ lớn số tiền.
  const che = {
    periodValue: null,
    cumulativeValue: null,
    advanceDeduct: null,
    retentionDeduct: null,
    approvedValue: null,
  };
  assert.deepEqual(certTotalsToWire(che, "legacy-number"), che);
  assert.equal(isMoneyPrecisionError(new RangeError("khác")), false);
});

// ---------- Route GET /api/payment-certs/:id ----------

test(
  "GET đợt IPC: (b) không header → number legacy như cũ; (c) có header → chuỗi + moneyFormat; (d) header cache; (e) ID/KL/đếm không đổi kiểu",
  S,
  async () => {
    const f = await dungDot(THUONG);
    try {
      const legacy = await getChiTiet(f.certId);
      assert.equal(legacy.status, 200);
      kiemHeaderTaiChinh(legacy);
      const lb = (await legacy.json()) as Record<string, unknown> & {
        totals: Record<string, unknown>;
      };
      assert.equal(lb.moneyFormat, undefined, "legacy giữ nguyên hình dạng response cũ");
      assert.deepEqual(lb.totals, {
        periodValue: 94,
        cumulativeValue: 94,
        advanceDeduct: 9.64,
        retentionDeduct: 4.7,
        approvedValue: 79.66,
      });

      // Header lạ = legacy (không moneyFormat).
      const la = await getChiTiet(f.certId, { [HEADER]: "decimal-string-v2" });
      assert.equal(la.status, 200);
      assert.equal(((await la.json()) as { moneyFormat?: string }).moneyFormat, undefined);

      const v1 = await getChiTiet(f.certId, { [HEADER]: "decimal-string-v1" });
      assert.equal(v1.status, 200);
      kiemHeaderTaiChinh(v1);
      const vb = (await v1.json()) as {
        moneyFormat: string;
        totals: Record<string, unknown>;
        cert: {
          id: unknown;
          contractId: unknown;
          periodNo: unknown;
          items: Record<string, unknown>[];
        };
        vuotHopDong: unknown[];
      };
      assert.equal(vb.moneyFormat, "decimal-string-v1");
      assert.deepEqual(vb.totals, {
        periodValue: "94.00",
        cumulativeValue: "94.00",
        advanceDeduct: "9.64",
        retentionDeduct: "4.70",
        approvedValue: "79.66",
      });
      // A3-AC05: ID/số đợt/đếm giữ number; S10a: dòng KL (đơn giá + KL) là chuỗi canonical.
      assert.equal(vb.cert.id, f.certId);
      assert.equal(vb.cert.contractId, f.contractId);
      assert.equal(typeof vb.cert.periodNo, "number");
      assert.equal(vb.cert.items.length, 1);
      for (const k of ["id", "boqItemId"])
        assert.equal(typeof vb.cert.items[0][k], "number", `items[].${k} phải giữ number`);
      assert.equal(vb.cert.items[0].unitPrice, "94.00");
      assert.equal(vb.cert.items[0].qtyPeriod, "1.000");
      assert.equal(vb.cert.items[0].qtyCumulative, "1.000");
      assert.equal(vb.cert.items[0].boqQtyContract, "1000.000");
      const li = (lb as unknown as { cert: { items: Record<string, unknown>[] } }).cert.items[0];
      assert.deepEqual(
        [li.unitPrice, li.qtyPeriod, li.qtyCumulative, li.boqQtyContract],
        [94, 1, 1, 1000],
        "legacy: dòng KL giữ JSON number như cũ",
      );
      assert.ok(Array.isArray(vb.vuotHopDong));
    } finally {
      await donDep(f);
    }
  },
);

test(
  "GET đợt IPC vượt 2^53 đồng×100: (a) không header → 422 money_precision_unsupported, không số xấp xỉ; có header → chuỗi exact",
  S,
  async () => {
    const f = await dungDot(VUOT_BIEN);
    try {
      const legacy = await getChiTiet(f.certId);
      assert.equal(legacy.status, 422);
      kiemHeaderTaiChinh(legacy);
      const loi = (await legacy.json()) as Record<string, unknown>;
      assert.equal(loi.code, "money_precision_unsupported");
      assert.equal(typeof loi.error, "string");
      assert.equal(loi.totals, undefined);
      assert.equal(loi.cert, undefined);
      assert.ok(Array.isArray(loi.vuotHopDong), "422 vẫn kèm cảnh báo vượt KL hợp đồng");

      const v1 = await getChiTiet(f.certId, { [HEADER]: "decimal-string-v1" });
      assert.equal(v1.status, 200);
      const { totals, cert } = (await v1.json()) as {
        totals: Record<string, string>;
        cert: { items: Record<string, unknown>[] };
      };
      assert.equal(totals.periodValue, "90071992547409.93");
      // S10a: đơn giá có xu lẻ, số lớn — chuỗi exact, không bị float làm tròn.
      assert.deepEqual(cert.items.map((it) => it.unitPrice).sort(), ["0.03", "9007199254740.99"]);
      assert.equal(totals.approvedValue, "76336013683929.91");
    } finally {
      await donDep(f);
    }
  },
);

test("GET đợt IPC: lỗi 401 cũng mang Cache-Control private,no-store + Vary", S, async () => {
  dangXuat();
  const res = await getChiTiet(1);
  assert.equal(res.status, 401);
  kiemHeaderTaiChinh(res);
});

// ---------- Export Excel ----------

async function docExcel(id: number) {
  const { GET } = await import("@/app/api/payment-certs/[id]/excel/route");
  const res = await GET(jreq(`/api/payment-certs/${id}/excel`, undefined, "GET"), thamSo(id));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  const ws = wb.worksheets[0];
  const theoNhan = new Map<string, unknown>();
  ws.eachRow((row) => {
    const nhan = row.getCell(6).value;
    if (typeof nhan === "string") theoNhan.set(nhan, row.getCell(7).value);
  });
  return { ws, theoNhan };
}

test("Excel IPC: trong biên giữ ô số, giá trị exact (tạm ứng nửa xu 9.64)", S, async () => {
  const f = await dungDot(THUONG);
  try {
    const { theoNhan } = await docExcel(f.certId);
    assert.equal(theoNhan.get("Giá trị đợt này"), 94);
    assert.equal(theoNhan.get("Trừ tạm ứng"), -9.64);
    assert.equal(theoNhan.get("Trừ giữ lại bảo hành"), -4.7);
    assert.equal(theoNhan.get("GIÁ TRỊ ĐỀ NGHỊ THANH TOÁN"), 79.66);
  } finally {
    await donDep(f);
  }
});

test(
  "Excel IPC: tổng > 15 chữ số có nghĩa → ô text canonical, không ép Number mất xu",
  S,
  async () => {
    const f = await dungDot(VUOT_BIEN);
    try {
      const { ws, theoNhan } = await docExcel(f.certId);
      assert.equal(theoNhan.get("Giá trị đợt này"), "90071992547409.93");
      // L5 (S10a): khối tổng là MỘT nhóm — có giá trị vượt 15 chữ số nên cả nhóm ghi text,
      // kể cả "Trừ tạm ứng" (tự nó vừa 15 chữ số), để =SUM() không lặng lẽ bỏ ô text.
      assert.equal(theoNhan.get("Trừ tạm ứng"), "-9232379236109.52");
      assert.equal(theoNhan.get("GIÁ TRỊ ĐỀ NGHỊ THANH TOÁN"), "76336013683929.91");
      // Thành tiền dòng 10 × 9007199254740.99 = 90071992547409.9 (đúng 15 chữ số có nghĩa) và
      // 1 × 0.03 vẫn là ô số exact; đơn giá NUMERIC(15,2) luôn ≤ 15 chữ số → ô số.
      const thanhTien: unknown[] = [];
      const donGia: unknown[] = [];
      ws.eachRow((row) => {
        if (
          typeof row.getCell(1).value === "string" &&
          String(row.getCell(1).value).startsWith("BOQ-")
        ) {
          donGia.push(row.getCell(4).value);
          thanhTien.push(row.getCell(7).value);
        }
      });
      assert.deepEqual(donGia.sort(), [0.03, 9007199254740.99].sort());
      assert.ok(thanhTien.includes(90071992547409.9));
      assert.ok(thanhTien.includes(0.03));
      // Có nhóm ghi text → kèm dòng ghi chú cảnh báo không SUM trực tiếp.
      const ghiChu: string[] = [];
      ws.eachRow((row) => {
        const v = row.getCell(1).value;
        if (typeof v === "string" && v.startsWith("Lưu ý:")) ghiChu.push(v);
      });
      assert.equal(ghiChu.length, 1);
      assert.match(ghiChu[0], /Giá trị đợt/);
      assert.doesNotMatch(ghiChu[0], /Thành tiền đợt/);
    } finally {
      await donDep(f);
    }
  },
);

// ---------- Duyệt đợt: payment_bills.amount exact ----------

async function trinhVaDuyet(id: number) {
  const { POST: TRINH } = await import("@/app/api/payment-certs/[id]/submit/route");
  const { POST: QUYET } = await import("@/app/api/payment-certs/[id]/decide/route");
  const trinh = await TRINH(jreq(`/api/payment-certs/${id}/submit`, {}), thamSo(id));
  assert.equal(trinh.status, 200);
  return QUYET(jreq(`/api/payment-certs/${id}/decide`, { decision: "approved" }), thamSo(id));
}

test(
  "Duyệt đợt IPC: payment_bills.amount ghi đúng approvedValue ipc-sum-v1 (79.66, không 79.67)",
  S,
  async () => {
    const f = await dungDot(THUONG);
    try {
      const res = await trinhVaDuyet(f.certId);
      assert.equal(res.status, 200);
      const { queryOne } = await import("@/lib/db");
      const bill = await queryOne<{ amount: string }>(
        `SELECT amount::text AS amount FROM payment_bills WHERE payment_cert_id = ?`,
        f.certId,
      );
      assert.equal(bill?.amount, "79.66");
    } finally {
      await donDep(f);
    }
  },
);

test(
  "Trình đợt IPC: giá trị vượt NUMERIC(15,2) → 422 amount_overflow ngay lúc trình, không ghi phiếu, đợt vẫn nháp",
  S,
  async () => {
    // S10a L6: chặn tràn tại nguồn (lúc trình) — nhánh phòng thủ của decide có test riêng ở
    // tests/payment-certs-amount-overflow.test.ts.
    const f = await dungDot(VUOT_BIEN);
    try {
      const { POST: TRINH } = await import("@/app/api/payment-certs/[id]/submit/route");
      const res = await TRINH(jreq(`/api/payment-certs/${f.certId}/submit`, {}), thamSo(f.certId));
      assert.equal(res.status, 422);
      assert.equal((await res.json()).code, "amount_overflow");
      const { queryOne } = await import("@/lib/db");
      const bill = await queryOne(
        `SELECT id FROM payment_bills WHERE payment_cert_id = ?`,
        f.certId,
      );
      assert.equal(bill, undefined);
      const cert = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ?`,
        f.certId,
      );
      assert.equal(cert?.status, "draft");
    } finally {
      await donDep(f);
    }
  },
);

// ---------- PDF: thành tiền dòng + tổng làm tròn đồng bằng bigint (audit S10a M1) ----------

async function getPdf(id: number) {
  const { GET } = await import("@/app/api/payment-certs/[id]/pdf/route");
  return GET(jreq(`/api/payment-certs/${id}/pdf`, undefined, "GET"), thamSo(id));
}

/** Chuỗi hiển thị PDF dựng từ đúng nguồn route PDF dùng (certLinesExact + certTotals). */
async function soHienThiPdf(certId: number) {
  const { certLinesExact, certLineDong, certTotals, formatDongVi } =
    await import("@/lib/tai-chinh/paymentcerts");
  const { mulRatio } = await import("@/lib/nen/money");
  const lines = await certLinesExact(certId);
  const t = await certTotals(certId);
  const tien = (minor: bigint) => formatDongVi(mulRatio(minor, 1n, 100n));
  return {
    dong: lines.map((l) => formatDongVi(certLineDong(l))),
    period: tien(t.periodValue),
    advance: tien(t.advanceDeduct),
    retention: tien(t.retentionDeduct),
    approved: tien(t.approvedValue),
  };
}

test("PDF IPC: 1,005 × 100,00 = 100,5 → 101 đ ở dòng và tổng (float cũ ra 100 đ)", S, async () => {
  // Đường cũ: Math.round(1.005 * 100) — float 100.49999999999999 → 100 (sai 1 đồng).
  assert.equal(Math.round(1.005 * 100), 100);
  const f = await dungDot([{ unitPrice: "100.00", qtyPeriod: 1.005 }]);
  try {
    const so = await soHienThiPdf(f.certId);
    assert.deepEqual(so.dong, ["101 đ"]);
    assert.equal(so.period, "101 đ");
    const res = await getPdf(f.certId);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  } finally {
    await donDep(f);
  }
});

test(
  "Hợp đồng 0% + đơn giá có xu (94,50): tạm ứng/giữ lại = 0, cộng exact rồi mới round tổng",
  S,
  async () => {
    // 3 × 94.50 = 283.50; hai dòng 0.001 × 5.00 = 0.005 mỗi dòng → tổng 283.51 (round từng dòng
    // sẽ ra 283.52).
    const f = await dungDot(
      [
        { unitPrice: "94.50", qtyPeriod: 3 },
        { unitPrice: "5.00", qtyPeriod: 0.001 },
        { unitPrice: "5.00", qtyPeriod: 0.001 },
      ],
      { advancePct: "0.00", retentionPct: "0.00" },
    );
    try {
      const v1 = await getChiTiet(f.certId, { [HEADER]: "decimal-string-v1" });
      assert.equal(v1.status, 200);
      assert.deepEqual(((await v1.json()) as { totals: unknown }).totals, {
        periodValue: "283.51",
        cumulativeValue: "283.51",
        advanceDeduct: "0.00",
        retentionDeduct: "0.00",
        approvedValue: "283.51",
      });
      const legacy = (await (await getChiTiet(f.certId)).json()) as {
        totals: { approvedValue: unknown };
      };
      assert.equal(legacy.totals.approvedValue, 283.51);
      const so = await soHienThiPdf(f.certId);
      assert.deepEqual(so.dong, ["284 đ", "0 đ", "0 đ"]); // 283,5 → 284 (ties xa 0)
      assert.equal(so.advance, "0 đ");
      assert.equal(so.approved, "284 đ");
      assert.equal((await getPdf(f.certId)).status, 200);
    } finally {
      await donDep(f);
    }
  },
);

// ---------- Luỹ kế nửa xu qua 2 đợt (L2) ----------

test("cumulativeValue: luỹ kế 0,003 × 5,00 = 0,015 → 0.02 (round tổng, ties xa 0)", S, async () => {
  const f = await dungDot([{ unitPrice: "5.00", qtyPeriod: 0.001 }], {
    advancePct: "0.00",
    retentionPct: "0.00",
  });
  try {
    assert.equal((await trinhVaDuyet(f.certId)).status, 200);
    const dot2 = await lapDot(f.contractId, [{ boqItemId: f.boqIds[0], qtyPeriod: 0.002 }]);
    const v1 = await getChiTiet(dot2, { [HEADER]: "decimal-string-v1" });
    const { totals } = (await v1.json()) as { totals: Record<string, string> };
    assert.equal(totals.periodValue, "0.01"); // 0.010
    assert.equal(totals.cumulativeValue, "0.02"); // 0.015 → 0.02
  } finally {
    await donDep(f);
  }
});

// ---------- POST lập đợt: amount phê duyệt ngoài biên (L2) ----------

test(
  "POST lập đợt: KL gợi ý cho tổng vượt biên JSON number → 422 money_precision_unsupported, không tạo đợt",
  S,
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    // 11 × 9007199254740.99 = 99079191802150.89 → 9907919180215089 đồng×100 > 2^53.
    const f = await dungHopDong(
      [{ unitPrice: "9007199254740.99", qtyPeriod: 0 }],
      TY_LE_MAC_DINH,
      11,
    );
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S10a')`,
      f.projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet S10a')`,
      towerId,
      uniq("S10A"),
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'S1', 'Nhóm S10a')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'S1,01', 'Task S10a', 1)`,
      pkgId,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
      f.boqIds[0],
      taskId,
    );
    try {
      const { POST } = await import("@/app/api/payment-certs/route");
      const res = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
      assert.equal(res.status, 422);
      assert.equal(((await res.json()) as { code?: string }).code, "money_precision_unsupported");
      const dot = await queryOne(
        `SELECT id FROM payment_certs WHERE contract_id = ?`,
        f.contractId,
      );
      assert.equal(dot, undefined, "422 phải rollback, không để lại đợt nháp");
    } finally {
      await run(`DELETE FROM boq_task_map WHERE task_id = ?`, taskId);
      await run(`DELETE FROM tasks WHERE id = ?`, taskId);
      await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
      await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
      await run(`DELETE FROM towers WHERE id = ?`, towerId);
      await donDep(f);
    }
  },
);

// ---------- certTotals không lặng lẽ coi 0% khi không đọc được hợp đồng (L3) ----------

test(
  "certTotals: hợp đồng bị RLS che (đọc khác dự án) → throw, không trả tạm ứng/giữ lại 0",
  S,
  async () => {
    const f = await dungDot(THUONG);
    try {
      const { withTransaction, run } = await import("@/lib/db");
      const { certTotals } = await import("@/lib/tai-chinh/paymentcerts");
      // Role ứng dụng (không bypass RLS) + GUC dự án khác: contracts bị lọc, payment_certs thì không.
      await assert.rejects(
        withTransaction(async () => {
          await run(`SET LOCAL ROLE xboss_app`);
          await run(
            `SELECT set_config('app.project_id', ?, true)`,
            String(f.projectId + 1_000_000),
          );
          await certTotals(f.certId);
        }),
        /thiếu dòng hợp đồng/,
      );
    } finally {
      await donDep(f);
    }
  },
);
