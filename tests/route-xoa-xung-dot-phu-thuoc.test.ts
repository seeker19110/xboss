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

// Đợt "mọi DELETE còn tham chiếu → 409": bắt 23503 ở tầng route bằng `laLoiKhoaNgoai`.

test("DELETE /api/materials/:id: vật tư còn lịch sử xuất nhập → 409, không xoá", S, async () => {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const projectId = await taoDuAn();
  const admin = await taoUser("admin");
  await dangNhapDuAn(admin, projectId);
  const matId = await insertId(
    `INSERT INTO materials (name, project_id) VALUES ('Vật tư XoaXD', ?)`,
    projectId,
  );
  await insertId(
    `INSERT INTO material_transactions (material_id, delta, qty_after) VALUES (?, 1, 1)`,
    matId,
  );
  const { DELETE } = await import("@/app/api/materials/[id]/route");
  const res = await DELETE(del(), { params: Promise.resolve({ id: String(matId) }) });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "dependency_conflict");
  assert.ok(await queryOne(`SELECT id FROM materials WHERE id = ?`, matId));
  // Dọn: các test khác trong cùng DB xoá cứng theo bảng, FK còn sót sẽ làm chúng đỏ.
  await run(`DELETE FROM material_transactions WHERE material_id = ?`, matId);
  await run(`DELETE FROM materials WHERE id = ?`, matId);
});

test(
  "DELETE /api/purchase-orders/:id: còn phiếu nhập kho → 409, không mất dòng hàng",
  S,
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const projectId = await taoDuAn();
    const admin = await taoUser("admin");
    await dangNhapDuAn(admin, projectId);
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, project_id) VALUES (?, ?)`,
      `PO-XD-${RUN}-${++seq}`,
      projectId,
    );
    const itemId = await insertId(`INSERT INTO po_items (po_id, qty_ordered) VALUES (?, 5)`, poId);
    await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id) VALUES (?, ?)`,
      `RC-XD-${RUN}-${++seq}`,
      poId,
    );
    const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");
    const res = await DELETE(del(), { params: Promise.resolve({ id: String(poId) }) });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, "dependency_conflict");
    assert.ok(await queryOne(`SELECT id FROM purchase_orders WHERE id = ?`, poId));
    // rollback: dòng hàng đã xoá ở bước 1 phải còn nguyên
    assert.ok(await queryOne(`SELECT id FROM po_items WHERE id = ?`, itemId));
    await run(`DELETE FROM warehouse_receipts WHERE po_id = ?`, poId);
    await run(`DELETE FROM po_items WHERE po_id = ?`, poId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
  },
);

test(
  "DELETE /api/workpackages/:id: vật tư của task còn lịch sử → 409, rollback toàn bộ",
  S,
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const projectId = await taoDuAn();
    const admin = await taoUser("admin");
    await dangNhapDuAn(admin, projectId);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp XoaXD')`,
      projectId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'XD', 'Sheet XD')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'XD1', 'Nhóm XD')`,
      sheetId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'XD1,01', 'Task XD')`,
      pkgId,
    );
    const matId = await insertId(
      `INSERT INTO materials (name, task_id, project_id) VALUES ('VT task XD', ?, ?)`,
      taskId,
      projectId,
    );
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after) VALUES (?, 1, 1)`,
      matId,
    );
    await insertId(
      `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, 'bình luận XD')`,
      taskId,
      admin.id,
    );
    const { DELETE } = await import("@/app/api/workpackages/[id]/route");
    const res = await DELETE(del(), { params: Promise.resolve({ id: String(pkgId) }) });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, "dependency_conflict");
    assert.ok(await queryOne(`SELECT id FROM work_packages WHERE id = ?`, pkgId));
    assert.ok(await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskId));
    assert.ok(await queryOne(`SELECT id FROM task_comments WHERE task_id = ?`, taskId));
    await run(`DELETE FROM task_comments WHERE task_id = ?`, taskId);
    await run(`DELETE FROM material_transactions WHERE material_id = ?`, matId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
  },
);
