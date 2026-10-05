import { HAS_TEST_DB } from "./setup";
import { dangNhap, dangNhapDuAn, dangXuat, datCookie } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

async function taoDuAn(ten: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, 1)`,
    `Payment read ${RUN} ${ten}`,
  );
}

async function taoUser(role: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-payment-read-test', ?, 1)`,
    `Payment read ${RUN}`,
    `payment-read-${RUN}@test.local`,
    role,
  );
  const row = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: row!.password_hash };
}

async function taoBill(
  projectId: number | null,
  parents: {
    contractId?: number | null;
    paymentCertId?: number | null;
    sheetTypeId?: number | null;
  } = {},
) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO payment_bills
       (responsible, type, amount, paid_date, project_id, contract_id, payment_cert_id, sheet_type_id)
     VALUES ('Nhà thầu test', 'bill', 1200, CURRENT_DATE, ?, ?, ?, ?)`,
    projectId,
    parents.contractId ?? null,
    parents.paymentCertId ?? null,
    parents.sheetTypeId ?? null,
  );
}

const request = () => new NextRequest("http://localhost/api/payments/bills", { method: "GET" });

test(
  "GET /api/payments/bills: chỉ trả bill cùng project có mọi parent cùng project/org",
  S,
  async () => {
    const projectA = await taoDuAn("a");
    const projectB = await taoDuAn("b");
    const user = await taoUser("pm");
    const { insertId } = await import("@/lib/db");
    const contractA = await insertId(
      `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'nhan_thau', 'Hợp đồng A', 'CĐT', 10000, 'active', ?)`,
      `HD-PAY-${RUN}-A`,
      projectA,
    );
    const contractB = await insertId(
      `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'nhan_thau', 'Hợp đồng B', 'CĐT', 10000, 'active', ?)`,
      `HD-PAY-${RUN}-B`,
      projectB,
    );
    const certB = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
     VALUES (?, ?, 1, 'draft')`,
      `IPC-PAY-${RUN}-B`,
      contractB,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
      projectB,
      `Tháp ${RUN}`,
    );
    const sheetB = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, ?, ?)`,
      towerB,
      `ST-${RUN}`,
      `Sheet ${RUN}`,
      `st-${RUN}`,
    );

    const valid = await taoBill(projectA, { contractId: contractA });
    const unclassified = await taoBill(projectA);
    await taoBill(null);
    await taoBill(projectB);
    await taoBill(projectA, { contractId: contractB });
    await taoBill(projectA, { paymentCertId: certB });
    await taoBill(projectA, { sheetTypeId: sheetB });

    await dangNhapDuAn(user, projectA);
    const { GET } = await import("@/app/api/payments/bills/route");
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const { bills } = await response.json();
    assert.deepEqual(
      bills.map((bill: { id: number }) => bill.id).sort((a: number, b: number) => a - b),
      [valid, unclassified].sort((a, b) => a - b),
    );
  },
);

test(
  "GET /api/payments/bills: cookie project sai hoặc thiếu lựa chọn khi có nhiều project → 404",
  S,
  async () => {
    const projectA = await taoDuAn("invalid-a");
    await taoDuAn("invalid-b");
    const user = await taoUser("admin");
    const { GET } = await import("@/app/api/payments/bills/route");

    dangNhap(user, projectA);
    datCookie("xboss_project", "01");
    const invalid = await GET(request());
    assert.equal(invalid.status, 404);
    assert.equal(invalid.headers.get("cache-control"), "private, no-store");

    dangNhap(user);
    const absent = await GET(request());
    assert.equal(absent.status, 404);
  },
);

test("GET /api/payments/bills: unauthenticated response is not cacheable", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payments/bills/route");
  const response = await GET(request());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
