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
import { certTotalsToWire } from "@/lib/tai-chinh/paymentcerts";

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

/** Dựng dự án + PM + hợp đồng 10,25%/5% + BOQ, rồi lập đợt và nhập KL qua route thật. */
async function dungDot(dong: Dong[]) {
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
     VALUES (?, 'nhan_thau', 'HĐ S10a', 'CĐT test', 0, 10.25, 5.00, 'active', ?)`,
    `HD-${uniq("S10a")}`,
    projectId,
  );
  const boqIds: number[] = [];
  for (const [i, d] of dong.entries()) {
    boqIds.push(
      await insertId(
        `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
         VALUES (?, ?, 'm', 1000, ?::numeric, ?)`,
        `BOQ-${uniq("S10a")}`,
        `Dòng ${i + 1}`,
        d.unitPrice,
        contractId,
      ),
    );
  }
  const fixture = { projectId, contractId, pmId };
  try {
    await dangNhapDuAn({ id: pmId, passwordHash: pm!.password_hash }, projectId);
    const { POST } = await import("@/app/api/payment-certs/route");
    const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
    const tao = await POST(jreq("/api/payment-certs", { contractId }));
    assert.equal(tao.status, 201);
    const { id } = (await tao.json()) as { id: number };
    const items = dong.map((d, i) => ({ boqItemId: boqIds[i], qtyPeriod: d.qtyPeriod }));
    const sua = await PATCH(jreq(`/api/payment-certs/${id}`, { items }, "PATCH"), thamSo(id));
    assert.equal(sua.status, 200);
    return { ...fixture, certId: id };
  } catch (err) {
    await donDep(fixture);
    throw err;
  }
}

const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function donDep(f: { projectId: number; contractId: number; pmId: number }) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM payment_bills WHERE contract_id = ?`, f.contractId);
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
      // A3-AC05: chỉ tiền của certTotals đổi kiểu; ID/số đợt/KL/đếm giữ number.
      assert.equal(vb.cert.id, f.certId);
      assert.equal(vb.cert.contractId, f.contractId);
      assert.equal(typeof vb.cert.periodNo, "number");
      assert.equal(vb.cert.items.length, 1);
      for (const k of ["id", "boqItemId", "qtyPeriod", "qtyCumulative", "boqQtyContract"])
        assert.equal(typeof vb.cert.items[0][k], "number", `items[].${k} phải giữ number`);
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

      const v1 = await getChiTiet(f.certId, { [HEADER]: "decimal-string-v1" });
      assert.equal(v1.status, 200);
      const { totals } = (await v1.json()) as { totals: Record<string, string> };
      assert.equal(totals.periodValue, "90071992547409.93");
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
      // 15 chữ số có nghĩa vẫn round-trip qua double → ô số đúng nguyên giá trị.
      assert.equal(theoNhan.get("Trừ tạm ứng"), -9232379236109.52);
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
  "Duyệt đợt IPC: approvedValue vượt NUMERIC(15,2) → 422, không ghi phiếu, đợt vẫn chờ duyệt",
  S,
  async () => {
    const f = await dungDot(VUOT_BIEN);
    try {
      const res = await trinhVaDuyet(f.certId);
      assert.equal(res.status, 422);
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
      assert.equal(cert?.status, "submitted");
    } finally {
      await donDep(f);
    }
  },
);
