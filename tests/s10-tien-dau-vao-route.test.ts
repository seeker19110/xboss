import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S10 — ĐẦU VÀO tiền (A3-FR01/FR02): route ghi tiền đọc body qua
// `parseMoneyInput` (lib/nen/money.ts). Bất biến được canh ở đây, qua route handler THẬT:
//   - chuỗi kiểu vi-VN "1.500"/"1.234.567"/"1234,5" bị từ chối 400 `amount_locale_format`
//     (trước đây `Number("1.500")` = 1,5 đ được ghi thẳng vào DB);
//   - giá trị vượt NUMERIC(15,2) → 422 `amount_overflow` (trước đây lỗi tràn của PG → 500);
//   - chuỗi canonical được ghi exact (không qua float);
//   - bill theo tầng: Σ % kỳ ≤ 100% so bằng NUMERIC trong SQL, khoá dòng, chỉ sheet của dự án
//     đang chọn (trước đây so float có dung sai 0,0001, không khoá, không kiểm dự án).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const NGUOI = "Phụ trách S10 đầu vào";

const don: { projects: number[]; users: number[] } = { projects: [], users: [] };

async function taoPm(projectId: number) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10 input PM', ?, 'hash-test-s10-input', 'pm', 1)`,
    `s10-input-${uniq("pm")}@test.local`,
  );
  don.users.push(id);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
  return id;
}

/** Dự án 1 tháp, 1 hệ, các tầng có giá trị HĐ tầng cho trước. */
async function dungDuAn(tang: { label: string; value: string }[] = []) {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10 input "));
  don.projects.push(projectId);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S10')`,
    projectId,
  );
  const code = uniq("DV");
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, responsible) VALUES (?, ?, 'Hệ S10', ?, ?)`,
    towerId,
    code,
    code.toLowerCase(),
    NGUOI,
  );
  for (const t of tang)
    await run(
      `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?::numeric)`,
      sheetTypeId,
      t.label,
      t.value,
    );
  return { projectId, sheetTypeId };
}

const jreq = (url: string, body: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function docLoi(res: Response) {
  return (await res.json()) as { error?: string; code?: string };
}

const billCoBan = {
  responsible: NGUOI,
  paidDate: "2026-10-08",
  progressSnapshot: 0.5,
};

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    await run(`DELETE FROM payment_bills WHERE project_id = ?`, p);
    await run(
      `DELETE FROM payment_bills WHERE sheet_type_id IN (
         SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM floor_contracts WHERE sheet_type_id IN (
         SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM towers WHERE project_id = ?`, p);
    await run(`DELETE FROM advances WHERE project_id = ?`, p);
    await run(`DELETE FROM cash_transactions WHERE project_id = ?`, p);
    await run(`DELETE FROM invoices WHERE project_id = ?`, p);
    await run(
      `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM purchase_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM materials WHERE project_id = ?`, p);
    await run(
      `DELETE FROM contract_addenda WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM contracts WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

// ===== /api/payments/bills =====

test(
  "POST /api/payments/bills: số tiền kiểu vi-VN '1.500' → 400 amount_locale_format, không ghi 1,5 đ",
  S,
  async () => {
    const { projectId } = await dungDuAn();
    await taoPm(projectId);
    const { POST } = await import("@/app/api/payments/bills/route");
    const { queryOne } = await import("@/lib/db");

    const res = await POST(
      jreq("/api/payments/bills", {
        ...billCoBan,
        type: "item",
        description: "PS",
        amount: "1.500",
      }),
    );
    assert.equal(res.status, 400);
    const loi = await docLoi(res);
    assert.equal(loi.code, "amount_locale_format");
    assert.match(loi.error ?? "", /hàng nghìn/);
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_bills WHERE project_id = ?`,
      projectId,
    );
    assert.equal(n?.n, 0, "không được ghi bill nào");
  },
);

test(
  "POST /api/payments/bills: chuỗi canonical ghi exact; nhân công vượt NUMERIC(15,2) → 422",
  S,
  async () => {
    const { projectId } = await dungDuAn();
    await taoPm(projectId);
    const { POST } = await import("@/app/api/payments/bills/route");
    const { queryOne } = await import("@/lib/db");

    const ok = await POST(
      jreq("/api/payments/bills", {
        ...billCoBan,
        type: "item",
        description: "PS",
        amount: "9999999999999.99",
        labor: "1234567.5",
      }),
    );
    assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
    const { id } = (await ok.json()) as { id: number };
    const row = await queryOne<{ amount: string; labor: string }>(
      `SELECT amount::text AS amount, labor::text AS labor FROM payment_bills WHERE id = ?`,
      id,
    );
    assert.deepEqual(row, { amount: "9999999999999.99", labor: "1234567.50" });

    const tran = await POST(
      jreq("/api/payments/bills", {
        ...billCoBan,
        type: "item",
        description: "PS",
        amount: "1000",
        labor: "10000000000000",
      }),
    );
    assert.equal(tran.status, 422);
    assert.equal((await docLoi(tran)).code, "amount_overflow");
  },
);

test(
  "PATCH /api/payments/bills/:id: nhân công tràn → 422 amount_overflow; '1.234' → 400; giữ giá trị cũ",
  S,
  async () => {
    const { projectId } = await dungDuAn();
    await taoPm(projectId);
    const { POST } = await import("@/app/api/payments/bills/route");
    const { PATCH } = await import("@/app/api/payments/bills/[id]/route");
    const { queryOne } = await import("@/lib/db");

    const tao = await POST(
      jreq("/api/payments/bills", {
        ...billCoBan,
        type: "item",
        description: "PS",
        amount: 1000,
        labor: 500,
      }),
    );
    assert.equal(tao.status, 200);
    const { id } = (await tao.json()) as { id: number };

    const tran = await PATCH(jreq(`/api/payments/bills/${id}`, { labor: 1e14 }, "PATCH"), ctx(id));
    assert.equal(tran.status, 422);
    assert.equal((await docLoi(tran)).code, "amount_overflow");

    const vi = await PATCH(jreq(`/api/payments/bills/${id}`, { labor: "1.234" }, "PATCH"), ctx(id));
    assert.equal(vi.status, 400);
    assert.equal((await docLoi(vi)).code, "amount_locale_format");

    const am = await PATCH(jreq(`/api/payments/bills/${id}`, { labor: -5 }, "PATCH"), ctx(id));
    assert.equal(am.status, 400, "nhân công âm bị từ chối rõ ràng, không lặng lẽ xoá");

    const row = await queryOne<{ labor: string }>(
      `SELECT labor::text AS labor FROM payment_bills WHERE id = ?`,
      id,
    );
    assert.equal(row?.labor, "500.00");

    const ok = await PATCH(
      jreq(`/api/payments/bills/${id}`, { labor: "750.25" }, "PATCH"),
      ctx(id),
    );
    assert.equal(ok.status, 200);
    const sau = await queryOne<{ labor: string }>(
      `SELECT labor::text AS labor FROM payment_bills WHERE id = ?`,
      id,
    );
    assert.equal(sau?.labor, "750.25");
  },
);

test(
  "POST /api/payments/bills theo tầng: Σ % so NUMERIC — 3×33,33% + 0,01% = 100% được, thêm 0,01% bị chặn",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungDuAn([{ label: "T1", value: "1000000" }]);
    await taoPm(projectId);
    const { POST } = await import("@/app/api/payments/bills/route");
    const { queryOne } = await import("@/lib/db");
    const bill = (pct: number) =>
      POST(
        jreq("/api/payments/bills", {
          ...billCoBan,
          type: "bill",
          amount: 0,
          sheetTypeId,
          floorLabel: "T1",
          pctThisPeriod: pct,
        }),
      );

    for (let i = 0; i < 3; i++) assert.equal((await bill(0.3333)).status, 200);
    assert.equal((await bill(0.0001)).status, 200, "đúng 100,00% vẫn hợp lệ");
    const vuot = await bill(0.0001);
    assert.equal(vuot.status, 400, "100,01% phải bị chặn (bản float cũ cho qua nhờ dung sai)");
    assert.match((await docLoi(vuot)).error ?? "", /vượt 100%/);

    const tong = await queryOne<{ pct: string }>(
      `SELECT SUM(pct_this_period)::text AS pct FROM payment_bills
        WHERE sheet_type_id = ? AND floor_label = 'T1'`,
      sheetTypeId,
    );
    assert.equal(tong?.pct, "1.0000");
  },
);

test(
  "POST /api/payments/bills theo tầng: 2 lượt đồng thời 60% + 60% → đúng 1 lượt được ghi (khoá dòng)",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungDuAn([{ label: "T2", value: "5000000" }]);
    await taoPm(projectId);
    const { POST } = await import("@/app/api/payments/bills/route");
    const { queryOne } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    // Mỗi lượt một ngữ cảnh request riêng — như hai request HTTP thật chạy song song.
    const bill = () =>
      runWithRequestContext({}, () =>
        POST(
          jreq("/api/payments/bills", {
            ...billCoBan,
            type: "bill",
            amount: 0,
            sheetTypeId,
            floorLabel: "T2",
            pctThisPeriod: 0.6,
          }),
        ),
      );

    const kq = await Promise.all([bill(), bill(), bill()]);
    const trangThai = kq.map((r) => r.status).sort();
    assert.deepEqual(trangThai, [200, 400, 400]);
    const tong = await queryOne<{ pct: string; n: number }>(
      `SELECT SUM(pct_this_period)::text AS pct, COUNT(*)::int AS n FROM payment_bills
        WHERE sheet_type_id = ? AND floor_label = 'T2'`,
      sheetTypeId,
    );
    assert.deepEqual(tong, { pct: "0.6000", n: 1 });
  },
);

test(
  "POST /api/payments/bills: sheet của dự án KHÁC → 404, không đọc giá trị HĐ tầng của dự án đó",
  S,
  async () => {
    const khac = await dungDuAn([{ label: "T9", value: "7000000" }]);
    const { projectId } = await dungDuAn();
    await taoPm(projectId);
    const { POST } = await import("@/app/api/payments/bills/route");
    const { queryOne } = await import("@/lib/db");

    const res = await POST(
      jreq("/api/payments/bills", {
        ...billCoBan,
        type: "bill",
        amount: 0,
        sheetTypeId: khac.sheetTypeId,
        floorLabel: "T9",
        pctThisPeriod: 0.5,
      }),
    );
    assert.equal(res.status, 404);
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_bills WHERE sheet_type_id = ?`,
      khac.sheetTypeId,
    );
    assert.equal(n?.n, 0);
  },
);

// ===== /api/payments (giá trị HĐ tầng) =====

test(
  "PATCH /api/payments: contractValue chuỗi canonical ghi exact; '1.234.567' → 400 amount_locale_format",
  S,
  async () => {
    const { projectId, sheetTypeId } = await dungDuAn([{ label: "T1", value: "1" }]);
    await taoPm(projectId);
    const { PATCH } = await import("@/app/api/payments/route");
    const { queryOne } = await import("@/lib/db");

    const ok = await PATCH(
      jreq(
        "/api/payments",
        { updates: [{ sheetTypeId, floorLabel: "T1", contractValue: "9999999999999.99" }] },
        "PATCH",
      ),
    );
    assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
    const row = await queryOne<{ v: string }>(
      `SELECT contract_value::text AS v FROM floor_contracts WHERE sheet_type_id = ? AND floor_label = 'T1'`,
      sheetTypeId,
    );
    assert.equal(row?.v, "9999999999999.99");

    const vi = await PATCH(
      jreq(
        "/api/payments",
        { updates: [{ sheetTypeId, floorLabel: "T1", contractValue: "1.234.567" }] },
        "PATCH",
      ),
    );
    assert.equal(vi.status, 400);
    assert.equal((await docLoi(vi)).code, "amount_locale_format");
  },
);

// ===== Hợp đồng / phụ lục =====

test(
  "POST /api/contracts: '1.500' → 400; tràn → 422 amount_overflow; trần NUMERIC(15,2) ghi exact",
  S,
  async () => {
    const { projectId } = await dungDuAn();
    await taoPm(projectId);
    const { POST } = await import("@/app/api/contracts/route");
    const { queryOne } = await import("@/lib/db");
    const hd = (value: unknown) =>
      POST(
        jreq("/api/contracts", {
          code: uniq("HD-S10-"),
          kind: "nhan_thau",
          title: "HĐ S10 đầu vào",
          partyName: "CĐT",
          value,
        }),
      );

    const vi = await hd("1.500");
    assert.equal(vi.status, 400);
    assert.equal((await docLoi(vi)).code, "amount_locale_format");

    const tran = await hd("10000000000000");
    assert.equal(tran.status, 422);
    assert.equal((await docLoi(tran)).code, "amount_overflow");

    const ok = await hd("9999999999999.99");
    assert.equal(ok.status, 201);
    const { id } = (await ok.json()) as { id: number };
    const row = await queryOne<{ v: string }>(
      `SELECT value::text AS v FROM contracts WHERE id = ?`,
      id,
    );
    assert.equal(row?.v, "9999999999999.99");

    // Phụ lục: giá trị tăng/giảm (được âm) — vẫn từ chối kiểu vi-VN.
    const { POST: POST_PL } = await import("@/app/api/contracts/[id]/addenda/route");
    const pl = await POST_PL(
      jreq(`/api/contracts/${id}/addenda`, { code: uniq("PL"), valueDelta: "-1.500" }),
      ctx(id),
    );
    assert.equal(pl.status, 400);
    const plOk = await POST_PL(
      jreq(`/api/contracts/${id}/addenda`, { code: uniq("PL"), valueDelta: "-1500.5" }),
      ctx(id),
    );
    assert.equal(plOk.status, 201);
    const { id: plId } = (await plOk.json()) as { id: number };
    const plRow = await queryOne<{ v: string }>(
      `SELECT value_delta::text AS v FROM contract_addenda WHERE id = ?`,
      plId,
    );
    assert.equal(plRow?.v, "-1500.50");
  },
);

// ===== Quỹ / tạm ứng / hoá đơn =====

test(
  "Tạm ứng/quỹ/hoá đơn: '2.000' → 400, tràn → 422, hoàn ứng '1.000' → 400 (không hoàn 1 đ)",
  S,
  async () => {
    const { projectId } = await dungDuAn();
    await taoPm(projectId);
    const { POST: POST_TU } = await import("@/app/api/advances/route");
    const { PATCH: PATCH_TU } = await import("@/app/api/advances/[id]/route");
    const { POST: POST_QUY } = await import("@/app/api/cash-transactions/route");
    const { POST: POST_HD } = await import("@/app/api/invoices/route");
    const { queryOne } = await import("@/lib/db");

    const tuVi = await POST_TU(jreq("/api/advances", { amount: "2.000", recipient: "Tổ đội A" }));
    assert.equal(tuVi.status, 400);
    assert.equal((await docLoi(tuVi)).code, "amount_locale_format");

    const tu = await POST_TU(jreq("/api/advances", { amount: "2000000.5", recipient: "Tổ đội A" }));
    assert.equal(tu.status, 201);
    const { id: tuId } = (await tu.json()) as { id: number };
    const tuRow = await queryOne<{ v: string }>(
      `SELECT amount::text AS v FROM advances WHERE id = ?`,
      tuId,
    );
    assert.equal(tuRow?.v, "2000000.50");

    const hoan = await PATCH_TU(
      jreq(`/api/advances/${tuId}`, { action: "settle", settleAmount: "1.000" }, "PATCH"),
      ctx(tuId),
    );
    assert.equal(hoan.status, 400);
    const sauHoan = await queryOne<{ v: string }>(
      `SELECT settled_amount::text AS v FROM advances WHERE id = ?`,
      tuId,
    );
    assert.equal(sauHoan?.v, "0.00");

    const quy = await POST_QUY(
      jreq("/api/cash-transactions", { txDate: "2026-10-08", direction: "out", amount: 1e13 }),
    );
    assert.equal(quy.status, 422);
    assert.equal((await docLoi(quy)).code, "amount_overflow");

    const hdVat = await POST_HD(
      jreq("/api/invoices", { direction: "in", netAmount: "5.000", vatAmount: 500 }),
    );
    assert.equal(hdVat.status, 400);
    assert.equal((await docLoi(hdVat)).code, "amount_locale_format");
  },
);

// ===== Mua sắm (PO) =====

test("POST /api/purchase-orders: đơn giá '1.500' → 400, không tạo đơn 1,5 đ", S, async () => {
  const { projectId } = await dungDuAn();
  await taoPm(projectId);
  const { insertId, queryOne } = await import("@/lib/db");
  const materialId = await insertId(
    `INSERT INTO materials (name, unit, boq_code, project_id) VALUES (?, 'cái', ?, ?)`,
    uniq("VT S10 "),
    uniq("VT-S10-"),
    projectId,
  );
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(
    jreq("/api/purchase-orders", { items: [{ materialId, qtyOrdered: 2, unitPrice: "1.500" }] }),
  );
  assert.equal(res.status, 400);
  assert.equal((await docLoi(res)).code, "amount_locale_format");
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM purchase_orders WHERE project_id = ?`,
    projectId,
  );
  assert.equal(n?.n, 0);

  const ok = await POST(
    jreq("/api/purchase-orders", {
      items: [{ materialId, qtyOrdered: 2, unitPrice: "1234567.89" }],
    }),
  );
  assert.equal(ok.status, 201);
  const { id } = (await ok.json()) as { id: number };
  const gia = await queryOne<{ v: string }>(
    `SELECT unit_price::text AS v FROM po_items WHERE po_id = ?`,
    id,
  );
  assert.equal(gia?.v, "1234567.89");
});
