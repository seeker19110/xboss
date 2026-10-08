import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S13c — DELETE users/bills còn bị tham chiếu → 409 dependency_conflict (trước đây 500 do FK 23503).

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let seq = 0;

async function taoDuAn() {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `XoaXD ${RUN} ${++seq}`);
}

async function taoUser(role: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-xoa-xd', ?, 1)`,
    `XoaXD ${RUN}`,
    `xoaxd-${RUN}-${++seq}@test.local`,
    role,
  );
  const r = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: r!.password_hash };
}

const del = () => new NextRequest("http://localhost/x", { method: "DELETE" });

test("DELETE /api/users/:id: user còn được hoá đơn tham chiếu → 409, không xoá", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn();
  const admin = await taoUser("admin");
  const target = await taoUser("engineer");
  await dangNhapDuAn(admin, projectId);
  await insertId(
    `INSERT INTO invoices (project_id, direction, created_by) VALUES (?, 'in', ?)`,
    projectId,
    target.id,
  );
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(del(), { params: Promise.resolve({ id: String(target.id) }) });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, "dependency_conflict");
  assert.ok(typeof body.error === "string" && body.error.length > 0);
  assert.ok(await queryOne(`SELECT id FROM users WHERE id = ?`, target.id));
});

test("DELETE /api/users/:id: user không tham chiếu → 200", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn();
  const admin = await taoUser("admin");
  const target = await taoUser("engineer");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(del(), { params: Promise.resolve({ id: String(target.id) }) });
  assert.equal(res.status, 200);
  assert.equal(await queryOne(`SELECT id FROM users WHERE id = ?`, target.id), undefined);
});

test(
  "DELETE /api/payments/bills/:id: còn hoá đơn tham chiếu → 409; hết tham chiếu → 200",
  S,
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn();
    const pm = await taoUser("pm");
    await dangNhapDuAn(pm, projectId);
    const billId = await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, project_id)
     VALUES ('Nhà thầu test', 'bill', 1200, CURRENT_DATE, ?)`,
      projectId,
    );
    const invId = await insertId(
      `INSERT INTO invoices (project_id, direction, payment_bill_id) VALUES (?, 'in', ?)`,
      projectId,
      billId,
    );
    const { DELETE } = await import("@/app/api/payments/bills/[id]/route");
    const res = await DELETE(del(), { params: Promise.resolve({ id: String(billId) }) });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, "dependency_conflict");
    assert.ok(await queryOne(`SELECT id FROM payment_bills WHERE id = ?`, billId));

    await run(`DELETE FROM invoices WHERE id = ?`, invId);
    const ok = await DELETE(del(), { params: Promise.resolve({ id: String(billId) }) });
    assert.equal(ok.status, 200);
  },
);
