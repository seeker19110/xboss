import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// P1-2b (A1-AC03): giao dịch quỹ / đơn hàng / claim không được trỏ id cha (hợp đồng, VO, NCC,
// vật tư, PR) của dự án/tổ chức khác; GET /api/systems/:code/summary chỉ tính dự án đang chọn.
// Chạy route thật, user thật.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

const jreq = (url: string, body: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body) });
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

async function dung() {
  const { insertId, queryOne } = await import("@/lib/db");
  const pA = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("P1-2b A "));
  const pB = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("P1-2b B "));
  const orgB = await insertId(
    `INSERT INTO organizations (name, slug) VALUES ('Org P1-2b B', ?)`,
    uniq("p12b-org-"),
  );
  const pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('P1-2b PM', ?, 'hash-test-p12b', 'pm', 1)`,
    `p12b-${uniq("pm")}@test.local`,
  );
  const pm = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    pmId,
  );
  const hd = (p: number) =>
    insertId(
      `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
       VALUES (?, 'nhan_thau', 'HĐ P1-2b', 'CĐT', 0, 'active', ?)`,
      `HD-${uniq("P12B")}`,
      p,
    );
  const vo = (p: number, c: number | null) =>
    insertId(
      `INSERT INTO variation_orders (code, title, reason, status, project_id, contract_id)
       VALUES (?, 'VO P1-2b', 'other', 'draft', ?, ?)`,
      `VO-${uniq("P12B")}`,
      p,
      c,
    );
  const ncc = (org: number) =>
    insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, uniq("NCC P1-2b "), org);
  const vt = (p: number) =>
    insertId(`INSERT INTO materials (project_id, name, unit) VALUES (?, ?, 'm')`, p, uniq("VT "));
  const cA = await hd(pA);
  const cA2 = await hd(pA);
  const cB = await hd(pB);
  const vA = await vo(pA, cA);
  const vB = await vo(pB, null);
  const sA = await ncc(1);
  const sB = await ncc(orgB);
  const mA = await vt(pA);
  const mB = await vt(pB);
  const prB = await insertId(
    `INSERT INTO purchase_requests (material_id, qty_requested, project_id, requested_by)
     VALUES (?, 1, ?, ?)`,
    mB,
    pB,
    pmId,
  );
  return {
    pA,
    pB,
    orgB,
    pmId,
    pm: { id: pmId, passwordHash: pm!.password_hash },
    cA,
    cA2,
    cB,
    vA,
    vB,
    sA,
    sB,
    mA,
    mB,
    prB,
  };
}

type F = Awaited<ReturnType<typeof dung>>;

async function don(f: F) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM cash_transactions WHERE project_id IN (?, ?)`, f.pA, f.pB);
  await run(`DELETE FROM claims WHERE project_id IN (?, ?)`, f.pA, f.pB);
  await run(
    `DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE project_id IN (?, ?))`,
    f.pA,
    f.pB,
  );
  await run(`DELETE FROM purchase_orders WHERE project_id IN (?, ?)`, f.pA, f.pB);
  await run(`DELETE FROM purchase_requests WHERE id = ?`, f.prB);
  await run(`DELETE FROM materials WHERE id IN (?, ?)`, f.mA, f.mB);
  await run(`DELETE FROM variation_orders WHERE id IN (?, ?)`, f.vA, f.vB);
  await run(`DELETE FROM contracts WHERE id IN (?, ?, ?)`, f.cA, f.cA2, f.cB);
  await run(`DELETE FROM suppliers WHERE id IN (?, ?)`, f.sA, f.sB);
  await run(`DELETE FROM user_projects WHERE user_id = ?`, f.pmId);
  await run(`DELETE FROM users WHERE id = ?`, f.pmId);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, f.pA, f.pB);
  await run(`DELETE FROM organizations WHERE id = ?`, f.orgB);
}

const dem = async (bang: string, p: number) => {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ${bang} WHERE project_id = ?`,
    p,
  ))!.n;
};

test(
  "P1-2b: POST/PATCH cash-transactions chặn hợp đồng khác dự án, NCC khác tổ chức",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const f = await dung();
    try {
      await dangNhapDuAn(f.pm, f.pA);
      const { POST } = await import("@/app/api/cash-transactions/route");
      const { PATCH } = await import("@/app/api/cash-transactions/[id]/route");
      const base = { txDate: "2026-01-01", direction: "out", amount: 1000 };

      let r: Response = await POST(jreq("/api/cash-transactions", { ...base, contractId: f.cB }));
      assert.equal(r.status, 422);
      assert.equal((await r.json()).error, "Hợp đồng không tồn tại");
      r = await POST(jreq("/api/cash-transactions", { ...base, supplierId: f.sB }));
      assert.equal(r.status, 422);
      assert.equal(await dem("cash_transactions", f.pA), 0);

      r = await POST(
        jreq("/api/cash-transactions", { ...base, contractId: f.cA, supplierId: f.sA }),
      );
      assert.equal(r.status, 201);
      const { id } = await r.json();

      const SEL = `SELECT contract_id AS c, supplier_id AS s FROM cash_transactions WHERE id = ?`;
      r = await PATCH(jreq(`/api/cash-transactions/${id}`, { contractId: f.cB }, "PATCH"), ctx(id));
      assert.equal(r.status, 422);
      r = await PATCH(jreq(`/api/cash-transactions/${id}`, { supplierId: f.sB }, "PATCH"), ctx(id));
      assert.equal(r.status, 422);
      assert.deepEqual(await queryOne(SEL, id), { c: f.cA, s: f.sA });

      r = await PATCH(
        jreq(`/api/cash-transactions/${id}`, { contractId: f.cA2 }, "PATCH"),
        ctx(id),
      );
      assert.equal(r.status, 200);
      assert.deepEqual(await queryOne(SEL, id), { c: f.cA2, s: f.sA });
    } finally {
      await don(f);
    }
  },
);

test("P1-2b: POST purchase-orders chặn NCC/hợp đồng/vật tư/PR ngoài phạm vi", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const f = await dung();
  try {
    await dangNhapDuAn(f.pm, f.pA);
    const { POST } = await import("@/app/api/purchase-orders/route");
    const item = { materialId: f.mA, qtyOrdered: 1 };

    const sai: Record<string, unknown>[] = [
      { contractId: f.cB, items: [item] },
      { supplierId: f.sB, items: [item] },
      { items: [{ materialId: f.mB, qtyOrdered: 1 }] },
      { items: [{ ...item, prId: f.prB }] },
    ];
    for (const body of sai) {
      const r = await POST(jreq("/api/purchase-orders", body));
      assert.equal(r.status, 422, JSON.stringify(body));
    }
    assert.equal(await dem("purchase_orders", f.pA), 0);
    // PR dự án B không bị chuyển sang 'ordered'.
    assert.equal(
      (await queryOne<{ s: string }>(
        `SELECT status AS s FROM purchase_requests WHERE id = ?`,
        f.prB,
      ))!.s,
      "pending",
    );

    const r = await POST(
      jreq("/api/purchase-orders", { contractId: f.cA, supplierId: f.sA, items: [item] }),
    );
    assert.equal(r.status, 201);
    assert.equal(await dem("purchase_orders", f.pA), 1);
  } finally {
    await don(f);
  }
});

test("P1-2b: POST/PATCH claims chặn hợp đồng/VO khác dự án và VO lệch hợp đồng", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const f = await dung();
  try {
    await dangNhapDuAn(f.pm, f.pA);
    const { POST } = await import("@/app/api/claims/route");
    const { PATCH } = await import("@/app/api/claims/[id]/route");
    const base = {
      kind: "cost",
      title: "Claim P1-2b",
      noticeDate: "2026-01-01",
      cause: "Chờ mặt bằng",
      amountRequested: 1000,
    };

    let r: Response = await POST(jreq("/api/claims", { ...base, contractId: f.cB }));
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, "Hợp đồng không tồn tại");
    r = await POST(jreq("/api/claims", { ...base, voId: f.vB }));
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, "Phát sinh (VO) không tồn tại");
    // VO gắn cA nhưng body nói cA2 → 422.
    r = await POST(jreq("/api/claims", { ...base, contractId: f.cA2, voId: f.vA }));
    assert.equal(r.status, 422);
    assert.equal(await dem("claims", f.pA), 0);

    r = await POST(jreq("/api/claims", { ...base, contractId: f.cA, voId: f.vA }));
    assert.equal(r.status, 201);
    const { id } = await r.json();

    const SEL = `SELECT contract_id AS c, vo_id AS v FROM claims WHERE id = ?`;
    r = await PATCH(jreq(`/api/claims/${id}`, { contractId: f.cB }, "PATCH"), ctx(id));
    assert.equal(r.status, 422);
    r = await PATCH(jreq(`/api/claims/${id}`, { voId: f.vB }, "PATCH"), ctx(id));
    assert.equal(r.status, 422);
    // Đổi hợp đồng sang cA2 trong khi VO đang lưu thuộc cA → 422 (kiểm cặp sau merge).
    r = await PATCH(jreq(`/api/claims/${id}`, { contractId: f.cA2 }, "PATCH"), ctx(id));
    assert.equal(r.status, 422);
    assert.deepEqual(await queryOne(SEL, id), { c: f.cA, v: f.vA });

    r = await PATCH(jreq(`/api/claims/${id}`, { contractId: f.cA2, voId: null }, "PATCH"), ctx(id));
    assert.equal(r.status, 200);
    assert.deepEqual(await queryOne(SEL, id), { c: f.cA2, v: null });
  } finally {
    await don(f);
  }
});

test("P1-2b: GET /api/systems/:code/summary chỉ tính dự án đang chọn", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const f = await dung();
  const ids: { tw: number[]; st: number[]; wp: number[] } = { tw: [], st: [], wp: [] };
  try {
    const sysCode = `p12b${RUN}`.slice(0, 30);
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ P1-2b')`,
      sysCode,
    );
    // Nhà thầu của hệ: 1 NCC cùng org dự án A, 1 NCC org B — chỉ NCC cùng org được hiện.
    const nccA = await insertId(
      `INSERT INTO suppliers (name, org_id) VALUES (?, (SELECT org_id FROM projects WHERE id = ?))`,
      `NCC A ${uniq("ncc")}`,
      f.pA,
    );
    const nccB = await insertId(
      `INSERT INTO suppliers (name, org_id) VALUES (?, ?)`,
      `NCC B ${uniq("ncc")}`,
      f.orgB,
    );
    for (const ncc of [nccA, nccB])
      await insertId(
        `INSERT INTO system_contractors (system_id, supplier_id, zone) VALUES (?, ?, 'Z')`,
        sysId,
        ncc,
      );
    // Dự án A: 1 task 20%; dự án B: 3 task 100% — B không được lẫn vào A.
    for (const [p, n, pct] of [
      [f.pA, 1, 0.2],
      [f.pB, 3, 1],
    ] as const) {
      const tw = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'T')`, p);
      const st = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet', ?)`,
        tw,
        uniq("ST"),
        sysId,
      );
      const wp = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'G1', 'Nhóm')`,
        st,
      );
      ids.tw.push(tw);
      ids.st.push(st);
      ids.wp.push(wp);
      for (let i = 1; i <= n; i++)
        await insertId(
          `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, 'Task', ?)`,
          wp,
          `G1,0${i}`,
          pct,
        );
    }

    const { GET } = await import("@/app/api/systems/[code]/summary/route");
    const sctx = { params: Promise.resolve({ code: sysCode }) };
    await dangNhapDuAn(f.pm, f.pA);
    let r = await GET(new Request("http://localhost/x"), sctx);
    assert.equal(r.status, 200);
    const sum = await r.json();
    assert.equal(sum.totalTasks, 1);
    assert.equal(sum.progressPercent, 0.2);
    assert.equal(sum.waitingApprovalCount, 0);
    assert.equal(sum.sheets.length, 1);
    assert.deepEqual(
      (sum.contractors as { supplierId: number }[]).map((c) => c.supplierId),
      [nccA],
    );

    // Không có dự án khả kiến (tổ chức B chưa có dự án nào) → 404 (fail-closed).
    const pmB = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id)
       VALUES ('P1-2b PM B', ?, 'hash-test-p12b', 'pm', ?)`,
      `p12b-${uniq("pmb")}@test.local`,
      f.orgB,
    );
    try {
      await dangNhapDuAn({ id: pmB, passwordHash: "hash-test-p12b", orgId: f.orgB }, null);
      r = await GET(new Request("http://localhost/x"), sctx);
      assert.equal(r.status, 404);
    } finally {
      await run(`DELETE FROM users WHERE id = ?`, pmB);
    }

    await run(`DELETE FROM tasks WHERE package_id IN (?, ?)`, ids.wp[0], ids.wp[1]);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, ids.wp[0], ids.wp[1]);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, ids.st[0], ids.st[1]);
    await run(`DELETE FROM towers WHERE id IN (?, ?)`, ids.tw[0], ids.tw[1]);
    await run(`DELETE FROM systems WHERE id = ?`, sysId);
    await run(`DELETE FROM suppliers WHERE id IN (?, ?)`, nccA, nccB);
  } finally {
    await don(f);
  }
});
