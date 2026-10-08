import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S10 đuôi (A3): tổng BOQ của GET /api/boq tính exact trong SQL (NUMERIC), không cộng float JS.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };

async function dung(ten: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `S10 boq ${ten}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'T')`,
    projectId,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'S')`,
    towerId,
    `S10B${ten}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'B1', 'N')`,
    sheetId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'B1,01', 'T', 0.5)`,
    pkgId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s10-boq', 'pm', 1)`,
    `S10 ${ten}`,
    `s10boq-${ten}-${RUN}@test.local`,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  await dangNhapDuAn({ id: userId, passwordHash: u!.password_hash }, projectId);
  return { projectId, taskId };
}

async function boq(projectId: number, code: string, qty: string, price: string) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
     VALUES (?, 'x', 'm', ?, ?, ?)`,
    `${code}-${RUN}`,
    qty,
    price,
    projectId,
  );
}

const get = (h?: Record<string, string>) =>
  new NextRequest("http://localhost/api/boq", { headers: h });

test("GET /api/boq v1: tổng exact — số lớn lệch xu + 3 dòng 0.1×0.10", S, async () => {
  const { run } = await import("@/lib/db");
  const { projectId, taskId } = await dung(`v1${RUN}`);
  const big = await boq(projectId, "A", "1000", "9999999999999.99");
  await boq(projectId, "B", "1", "0.01");
  for (const c of ["C1", "C2", "C3"]) await boq(projectId, c, "0.1", "0.10");
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    big,
    taskId,
  );

  const { GET } = await import("@/app/api/boq/route");
  const res = await GET(get(V1));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.moneyFormat, "decimal-string-v1");
  assert.equal(j.totals.contractValue, "9999999999999990.04");
  assert.equal(j.totals.subValue, "0.00");
  assert.equal(j.totals.executedValue, "4999999999999995.00");
  assert.equal(res.headers.get("Vary"), "X-XBoss-Money-Format");
});

test(
  "GET /api/boq legacy: dự án nhỏ trả number đúng (0.1×0.10×3 = 0.03); số lớn → 422",
  S,
  async () => {
    const small = await dung(`lg${RUN}`);
    for (const c of ["D1", "D2", "D3"]) await boq(small.projectId, c, "0.1", "0.10");
    const { GET } = await import("@/app/api/boq/route");
    const ok = await GET(get());
    assert.equal(ok.status, 200);
    const j = await ok.json();
    assert.equal(j.moneyFormat, undefined);
    assert.equal(j.totals.contractValue, 0.03);

    const bigP = await dung(`lb${RUN}`);
    await boq(bigP.projectId, "E1", "1000", "9999999999999.99");
    const res = await GET(get());
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, "money_precision_unsupported");
  },
);
