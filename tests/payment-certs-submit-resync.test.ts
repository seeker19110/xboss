import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S10a nợ HIGH: approval_requests.amount chốt lúc LẬP đợt IPC nháp, PATCH sửa KL không cập nhật
// → bước duyệt có min_amount bị lách (lập nháp nhỏ, sửa tăng, trình, người duyệt bước 1 chốt
// luôn). Đi đúng đường người dùng qua route thật: POST lập → PATCH tăng KL → submit → decide.
// Kèm: PATCH khoá đợt đã trình (409) và lỗi 500 không lộ e.message.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

type Nguoi = { id: number; passwordHash: string };

async function dungNguoi(role: string): Promise<Nguoi> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-test-resync', ?, 1)`,
    `S10a ${role}`,
    `s10a-resync-${uniq(role)}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-test-resync" };
}

/** Dự án + HĐ (1 dòng BOQ đơn giá 500) + flow IPC: bước 1 pm (mọi giá trị), bước 2 cdt (≥ 1000). */
async function dungHienTruong() {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10a resync "));
  const nguoiLap = await dungNguoi("pm");
  const nguoiDuyet = await dungNguoi("pm");
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ resync', 'CĐT test', 0, 0, 0, 'active', ?)`,
    `HD-${uniq("RS")}`,
    projectId,
  );
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
     VALUES (?, 'Dòng 1', 'm', 1000, 500, ?)`,
    `BOQ-${uniq("RS")}`,
    contractId,
  );
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'payment_cert', ?)`,
    projectId,
    uniq("IPC flow "),
  );
  await insertId(
    `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
    flowId,
  );
  await insertId(
    `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 2, 'cdt', 1000)`,
    flowId,
  );
  return { projectId, nguoiLap, nguoiDuyet, contractId, boqId, flowId };
}

async function donDep(f: Awaited<ReturnType<typeof dungHienTruong>>) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM approval_requests WHERE flow_id = ?`, f.flowId);
  await run(`DELETE FROM approval_flows WHERE id = ?`, f.flowId);
  await run(`DELETE FROM payment_bills WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM payment_certs WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM boq_items WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM contracts WHERE id = ?`, f.contractId);
  await run(`DELETE FROM user_projects WHERE user_id = ANY(?)`, [f.nguoiLap.id, f.nguoiDuyet.id]);
  await run(`DELETE FROM users WHERE id = ANY(?)`, [f.nguoiLap.id, f.nguoiDuyet.id]);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
}

test(
  "IPC: lập nháp nhỏ → sửa KL tăng vượt ngưỡng → trình → người duyệt bước 1 KHÔNG chốt luôn (sang cdt)",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      const { POST } = await import("@/app/api/payment-certs/route");
      const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
      const { POST: submit } = await import("@/app/api/payment-certs/[id]/submit/route");
      const { POST: decide } = await import("@/app/api/payment-certs/[id]/decide/route");
      const { queryOne } = await import("@/lib/db");

      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const tao = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
      assert.equal(tao.status, 201);
      const { id } = (await tao.json()) as { id: number };

      // Lúc lập, KL gợi ý = 0 (chưa thi công) → amount của request = 0 < ngưỡng 1000.
      const luc = await queryOne<{ amount: number }>(
        `SELECT amount FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        id,
      );
      assert.equal(Number(luc!.amount), 0);

      // Sửa KL: 10 × 500 = 5000 ≥ 1000 → bước 2 (cdt) phải được áp.
      const sua = await PATCH(
        jreq(
          `/api/payment-certs/${id}`,
          { items: [{ boqItemId: f.boqId, qtyPeriod: 10 }] },
          "PATCH",
        ),
        thamSo(id),
      );
      assert.equal(sua.status, 200);
      const tr = await submit(jreq(`/api/payment-certs/${id}/submit`), thamSo(id));
      assert.equal(tr.status, 200);

      const sau = await queryOne<{ amount: number; status: string }>(
        `SELECT amount, status FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        id,
      );
      assert.equal(Number(sau!.amount), 5000);
      assert.equal(sau!.status, "pending");

      // Người duyệt bước 1 (khác người lập) duyệt → phải chuyển sang cdt, đợt chưa approved.
      await dangNhapDuAn(f.nguoiDuyet, f.projectId);
      const qd = await decide(
        jreq(`/api/payment-certs/${id}/decide`, { decision: "approved" }),
        thamSo(id),
      );
      assert.equal(qd.status, 200);
      const kq = (await qd.json()) as { pending?: boolean; nextRole?: string };
      assert.equal(kq.pending, true);
      assert.equal(kq.nextRole, "cdt");
      const cert = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ?`,
        id,
      );
      assert.equal(cert!.status, "submitted");
      const bills = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM payment_bills WHERE payment_cert_id = ?`,
        id,
      );
      assert.equal(bills!.n, 0);
    } finally {
      dangXuat();
      await donDep(f);
    }
  },
);

test("IPC: PATCH đợt đã trình → 409, dòng KL giữ nguyên", S, async () => {
  const f = await dungHienTruong();
  try {
    const { POST } = await import("@/app/api/payment-certs/route");
    const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
    const { POST: submit } = await import("@/app/api/payment-certs/[id]/submit/route");
    const { queryOne } = await import("@/lib/db");

    await dangNhapDuAn(f.nguoiLap, f.projectId);
    const { id } = (await (
      await POST(jreq("/api/payment-certs", { contractId: f.contractId }))
    ).json()) as { id: number };
    await PATCH(
      jreq(`/api/payment-certs/${id}`, { items: [{ boqItemId: f.boqId, qtyPeriod: 3 }] }, "PATCH"),
      thamSo(id),
    );
    assert.equal((await submit(jreq(`/api/payment-certs/${id}/submit`), thamSo(id))).status, 200);

    const muon = await PATCH(
      jreq(`/api/payment-certs/${id}`, { items: [{ boqItemId: f.boqId, qtyPeriod: 99 }] }, "PATCH"),
      thamSo(id),
    );
    assert.equal(muon.status, 409);
    const dong = await queryOne<{ qty: string }>(
      `SELECT qty_period::text AS qty FROM payment_cert_items WHERE cert_id = ?`,
      id,
    );
    assert.equal(Number(dong!.qty), 3);
  } finally {
    dangXuat();
    await donDep(f);
  }
});

test(
  "IPC: PATCH dòng BOQ không thuộc hợp đồng → 422 và dòng KL cũ KHÔNG bị xoá (atomic)",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      const { POST } = await import("@/app/api/payment-certs/route");
      const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
      const { queryOne } = await import("@/lib/db");

      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const { id } = (await (
        await POST(jreq("/api/payment-certs", { contractId: f.contractId }))
      ).json()) as { id: number };
      const truoc = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM payment_cert_items WHERE cert_id = ?`,
        id,
      );

      const xau = await PATCH(
        jreq(
          `/api/payment-certs/${id}`,
          { items: [{ boqItemId: 999_999_999, qtyPeriod: 1 }] },
          "PATCH",
        ),
        thamSo(id),
      );
      assert.equal(xau.status, 422);
      const sau = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM payment_cert_items WHERE cert_id = ?`,
        id,
      );
      assert.equal(sau!.n, truoc!.n);
      assert.ok(sau!.n > 0);
    } finally {
      dangXuat();
      await donDep(f);
    }
  },
);
