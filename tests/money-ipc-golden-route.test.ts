import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { ipcSumV1, moneyToDecimal, parseMoneyExact, type IpcLineV1 } from "@/lib/nen/money";

// QUALITY-FINAL-1 / S09 — golden đối chiếu ipc-sum-v1 với ĐƯỜNG IPC THẬT người dùng đi
// (TRAPS §6): PM lập đợt (POST /api/payment-certs) → sửa KL (PATCH /api/payment-certs/:id) →
// xem chi tiết (GET /api/payment-certs/:id, object `totals` do certTotals tính). Hợp đồng/BOQ
// dựng bằng SQL vì đó là dữ liệu đầu vào. Kỳ vọng = golden viết tay VÀ ipcSumV1 trên chính dữ
// liệu DB (::text) — hai nguồn phải khớp nhau trước, rồi route mới được so.
//
// Ca route còn lệch ipc-sum-v1 được đánh dấu `todo` kèm số liệu: sửa certTotals là việc của
// S10/S13 (ngoài phạm vi S09), không sửa ở đây. Khi S10 xong, bỏ `todo` để ca thành cổng chặn.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

type Ca = {
  ten: string;
  advancePct: string;
  retentionPct: string;
  /** Dòng BOQ: đơn giá hợp đồng và KL đợt nhập qua PATCH (số JSON như UI gửi). */
  dong: { unitPrice: string; qtyPeriod: number }[];
  /** Golden ipc-sum-v1: [periodValue, advanceDeduct, retentionDeduct, approvedValue]. */
  golden: [string, string, string, string];
  /** Lý do route còn lệch (todo) — undefined = route phải khớp ngay. */
  lech?: string;
};

const CAC_CA: Ca[] = [
  {
    ten: "cơ bản 10% / 5%",
    advancePct: "10.00",
    retentionPct: "5.00",
    dong: [
      { unitPrice: "1000.00", qtyPeriod: 10 },
      { unitPrice: "2000.00", qtyPeriod: 5 },
    ],
    golden: ["20000.00", "2000.00", "1000.00", "17000.00"],
  },
  {
    ten: "Q-AC06: hai dòng 0.001 × 5.00 cộng trước rồi round → 0.01",
    advancePct: "0.00",
    retentionPct: "0.00",
    dong: [
      { unitPrice: "5.00", qtyPeriod: 0.001 },
      { unitPrice: "5.00", qtyPeriod: 0.001 },
    ],
    golden: ["0.01", "0.00", "0.00", "0.01"],
  },
  {
    ten: "periodValue round trước khi nhân tỷ lệ 10,25%",
    advancePct: "10.25",
    retentionPct: "5.00",
    dong: [{ unitPrice: "100.00", qtyPeriod: 1.005 }],
    golden: ["100.50", "10.30", "5.03", "85.17"],
  },
  {
    ten: "tạm ứng 10,25% rơi đúng nửa xu (94.00 × 10,25% = 9.635)",
    advancePct: "10.25",
    retentionPct: "5.00",
    dong: [{ unitPrice: "94.00", qtyPeriod: 1 }],
    golden: ["94.00", "9.64", "4.70", "79.66"],
    lech:
      "certTotals nhân tỷ lệ bằng float (mulRate(period, 10.25/100)): 9400 × 0.1025 = 963.4999… " +
      "→ advanceDeduct 9.63 (đúng 9.64), approvedValue 79.67 (đúng 79.66). Sửa ở S10/S13.",
  },
  {
    ten: "tổng vượt 2^53 đồng×100 (A3-AC01 qua route)",
    advancePct: "10.25",
    retentionPct: "5.00",
    dong: [
      { unitPrice: "9007199254740.99", qtyPeriod: 10 },
      { unitPrice: "0.03", qtyPeriod: 1 },
    ],
    golden: ["90071992547409.93", "9232379236109.52", "4503599627370.50", "76336013683929.91"],
    lech:
      "certTotals đổi bigint đúng sang JSON number (moneyToNumber = Number(bigint)/100): periodValue " +
      "90071992547409.92 (đúng .93), approvedValue 76336013683929.90 (đúng .91). Sửa ở S10.",
  },
];

async function dungHopDong(ca: Ca) {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S09 IPC "));
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S09 PM', ?, 'hash-test-s09', 'pm', 1)`,
    `s09-${uniq("pm")}@test.local`,
  );
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ S09 golden', 'CĐT test', 0, ?::numeric, ?::numeric, 'active', ?)`,
    `HD-${uniq("S09")}`,
    ca.advancePct,
    ca.retentionPct,
    projectId,
  );
  const boqIds: number[] = [];
  for (const [i, d] of ca.dong.entries()) {
    boqIds.push(
      await insertId(
        `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
         VALUES (?, ?, 'm', 1000, ?::numeric, ?)`,
        `BOQ-${uniq("S09")}`,
        `Dòng ${i + 1}`,
        d.unitPrice,
        contractId,
      ),
    );
  }
  return { projectId, contractId, boqIds, pm: { id: pmId, passwordHash: pm!.password_hash } };
}

/**
 * Dọn fixture của một ca (kể cả khi assert fail): để lại payment_certs.created_by trỏ user test
 * làm `DELETE FROM users` của tests/auth.test.ts vỡ FK khi chạy chung một DB.
 */
async function donDep(f: { projectId: number; contractId: number; pmId: number }) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM payment_certs WHERE contract_id = ?`, f.contractId); // cascade dòng KL
  await run(`DELETE FROM boq_items WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM contracts WHERE id = ?`, f.contractId);
  await run(`DELETE FROM user_projects WHERE user_id = ?`, f.pmId);
  await run(`DELETE FROM users WHERE id = ?`, f.pmId);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
}

for (const ca of CAC_CA) {
  test(
    `ipc-sum-v1 golden qua route GET /api/payment-certs/:id — ${ca.ten}`,
    { ...S, todo: ca.lech },
    async () => {
      const { query, queryOne } = await import("@/lib/db");
      const { projectId, contractId, boqIds, pm } = await dungHopDong(ca);
      try {
        await dangNhapDuAn(pm, projectId);

        const { POST } = await import("@/app/api/payment-certs/route");
        const { GET, PATCH } = await import("@/app/api/payment-certs/[id]/route");
        const tao = await POST(jreq("/api/payment-certs", { contractId }));
        assert.equal(tao.status, 201);
        const { id } = (await tao.json()) as { id: number };
        const p = { params: Promise.resolve({ id: String(id) }) };

        const items = ca.dong.map((d, i) => ({ boqItemId: boqIds[i], qtyPeriod: d.qtyPeriod }));
        const sua = await PATCH(jreq(`/api/payment-certs/${id}`, { items }, "PATCH"), p);
        assert.equal(sua.status, 200);

        // Kỳ vọng: ipcSumV1 trên đúng dữ liệu đã lưu (::text exact) phải bằng golden viết tay.
        const lines = await query<IpcLineV1>(
          `SELECT qty_period::text AS "qtyPeriod", unit_price::text AS "unitPrice"
           FROM payment_cert_items WHERE cert_id = ? ORDER BY id`,
          id,
        );
        const rates = await queryOne<{ advancePct: string; retentionPct: string }>(
          `SELECT advance_pct::text AS "advancePct", retention_pct::text AS "retentionPct"
           FROM contracts WHERE id = ?`,
          contractId,
        );
        const v1 = ipcSumV1(lines, rates!);
        const kyVong = [v1.periodValue, v1.advanceDeduct, v1.retentionDeduct, v1.approvedValue].map(
          moneyToDecimal,
        );
        assert.deepEqual(kyVong, ca.golden, "ipcSumV1 trên dữ liệu DB lệch golden viết tay");

        // Thực tế: totals của route người dùng xem (JSON number hiện tại → canonical để so).
        const res = await GET(jreq(`/api/payment-certs/${id}`, undefined, "GET"), p);
        assert.equal(res.status, 200);
        const { totals } = (await res.json()) as { totals: Record<string, number> };
        const thucTe = ["periodValue", "advanceDeduct", "retentionDeduct", "approvedValue"].map(
          (k) => moneyToDecimal(parseMoneyExact(String(totals[k]))),
        );
        assert.deepEqual(thucTe, ca.golden, `route lệch ipc-sum-v1: ${JSON.stringify(totals)}`);
      } finally {
        await donDep({ projectId, contractId, pmId: pm.id });
      }
    },
  );
}
