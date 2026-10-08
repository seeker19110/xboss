import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S10a L6: đợt có giá trị tràn NUMERIC(15,2) — chặn tại lúc TRÌNH (kể cả không có luồng duyệt),
// và ở decide thì người duyệt không có viewPayments KHÔNG được nhận thông điệp lộ độ lớn giá trị.
// Dữ liệu tràn dựng bằng UPDATE trực tiếp (PATCH đã chặn KL vượt cận).

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
     VALUES (?, ?, 'hash-test-tran', ?, 1)`,
    `S10a ${role}`,
    `s10a-tran-${uniq(role)}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-test-tran" };
}

/** Dự án + HĐ (1 dòng BOQ đơn giá 500) + flow IPC: bước 1 pm (mọi giá trị), bước 2 cdt (≥ 1000). */
/** Dự án + HĐ (1 dòng BOQ đơn giá 500); tuỳ chọn flow IPC 1 bước cdt (mọi giá trị). */
async function dungHienTruong(coFlow: boolean) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10a tran "));
  const nguoiLap = await dungNguoi("pm");
  const nguoiDuyet = await dungNguoi(coFlow ? "cdt" : "pm");
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ tràn', 'CĐT test', 0, 0, 0, 'active', ?)`,
    `HD-${uniq("TR")}`,
    projectId,
  );
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
     VALUES (?, 'Dòng 1', 'm', 1000, 500, ?)`,
    `BOQ-${uniq("TR")}`,
    contractId,
  );
  let flowId: number | null = null;
  if (coFlow) {
    flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'payment_cert', ?)`,
      projectId,
      uniq("IPC flow tràn "),
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'cdt', NULL)`,
      flowId,
    );
  }
  return { projectId, nguoiLap, nguoiDuyet, contractId, boqId, flowId };
}

async function donDep(f: Awaited<ReturnType<typeof dungHienTruong>>) {
  const { run } = await import("@/lib/db");
  if (f.flowId != null) {
    await run(`DELETE FROM approval_requests WHERE flow_id = ?`, f.flowId);
    await run(`DELETE FROM approval_flows WHERE id = ?`, f.flowId);
  }
  await run(`DELETE FROM payment_bills WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM payment_certs WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM boq_items WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM contracts WHERE id = ?`, f.contractId);
  await run(`DELETE FROM user_projects WHERE user_id = ANY(?)`, [f.nguoiLap.id, f.nguoiDuyet.id]);
  await run(`DELETE FROM users WHERE id = ANY(?)`, [f.nguoiLap.id, f.nguoiDuyet.id]);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
}

/** Lập đợt nháp có 1 dòng KL hợp lệ (qty 1) qua route thật, trả id đợt. */
async function lapNhap(f: Awaited<ReturnType<typeof dungHienTruong>>): Promise<number> {
  const { POST } = await import("@/app/api/payment-certs/route");
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  await dangNhapDuAn(f.nguoiLap, f.projectId);
  const tao = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
  assert.equal(tao.status, 201);
  const { id } = (await tao.json()) as { id: number };
  const sua = await PATCH(
    jreq(`/api/payment-certs/${id}`, { items: [{ boqItemId: f.boqId, qtyPeriod: 1 }] }, "PATCH"),
    thamSo(id),
  );
  assert.equal(sua.status, 200);
  return id;
}

/** KL 1e11 × đơn giá 500 = 5e13 đ ≥ 10^13 → tràn NUMERIC(15,2) (qty vẫn vừa NUMERIC(15,3)). */
async function lamTran(id: number) {
  const { run } = await import("@/lib/db");
  await run(`UPDATE payment_cert_items SET qty_period = 100000000000 WHERE cert_id = ?`, id);
}

test(
  "IPC: trình đợt tràn NUMERIC(15,2) KHÔNG có luồng duyệt → 422 amount_overflow, vẫn nháp",
  S,
  async () => {
    const f = await dungHienTruong(false);
    try {
      const { POST: submit } = await import("@/app/api/payment-certs/[id]/submit/route");
      const { queryOne } = await import("@/lib/db");
      const id = await lapNhap(f);
      await lamTran(id);
      const res = await submit(jreq(`/api/payment-certs/${id}/submit`), thamSo(id));
      assert.equal(res.status, 422);
      const kq = (await res.json()) as { code?: string };
      assert.equal(kq.code, "amount_overflow");
      const c = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ?`,
        id,
      );
      assert.equal(c!.status, "draft");
    } finally {
      dangXuat();
      await donDep(f);
    }
  },
);

test(
  "IPC: decide đợt tràn bởi cdt (không viewPayments) → 422 cert_invalid, không lộ giá trị",
  S,
  async () => {
    const f = await dungHienTruong(true);
    try {
      const { POST: submit } = await import("@/app/api/payment-certs/[id]/submit/route");
      const { POST: decide } = await import("@/app/api/payment-certs/[id]/decide/route");
      const { queryOne } = await import("@/lib/db");
      const id = await lapNhap(f);
      assert.equal((await submit(jreq(`/api/payment-certs/${id}/submit`), thamSo(id))).status, 200);
      await lamTran(id); // dữ liệu lạ sau khi trình (lách cổng submit)

      await dangNhapDuAn(f.nguoiDuyet, f.projectId);
      const res = await decide(
        jreq(`/api/payment-certs/${id}/decide`, { decision: "approved" }),
        thamSo(id),
      );
      assert.equal(res.status, 422);
      const text = await res.text();
      const kq = JSON.parse(text) as { code?: string; error?: string };
      assert.equal(kq.code, "cert_invalid");
      assert.doesNotMatch(text, /giới hạn/i);
      assert.doesNotMatch(text, /\d{4,}/); // không chứa số tiền/ngưỡng
      const c = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ?`,
        id,
      );
      assert.equal(c!.status, "submitted");
      const r = await queryOne<{ status: string }>(
        `SELECT status FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        id,
      );
      assert.equal(r!.status, "pending"); // bước duyệt rollback cùng transaction
    } finally {
      dangXuat();
      await donDep(f);
    }
  },
);

test("IPC: decide đợt tràn bởi PM (có viewPayments) → 422 thông điệp cụ thể", S, async () => {
  const f = await dungHienTruong(false);
  try {
    const { POST: submit } = await import("@/app/api/payment-certs/[id]/submit/route");
    const { POST: decide } = await import("@/app/api/payment-certs/[id]/decide/route");
    const id = await lapNhap(f);
    assert.equal((await submit(jreq(`/api/payment-certs/${id}/submit`), thamSo(id))).status, 200);
    await lamTran(id);

    await dangNhapDuAn(f.nguoiDuyet, f.projectId);
    const res = await decide(
      jreq(`/api/payment-certs/${id}/decide`, { decision: "approved" }),
      thamSo(id),
    );
    assert.equal(res.status, 422);
    const kq = (await res.json()) as { code?: string; error?: string };
    assert.equal(kq.code, "amount_overflow");
    assert.match(kq.error ?? "", /vượt giới hạn/);
  } finally {
    dangXuat();
    await donDep(f);
  }
});
