import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp CHECK constraints (M45 PR2): chèn/ cập nhật giá trị vi phạm miền
// (tiền âm, tiến độ ngoài [0,1]) → Postgres trả lỗi 23514 (check_violation).
// Cần TEST_DATABASE_URL.

// Mã lỗi Postgres cho check_violation.
const CHECK_VIOLATION = "23514";

async function expectCheckViolation(fn: () => Promise<unknown>) {
  await assert.rejects(fn, (err: unknown) => {
    const code = (err as { code?: string }).code;
    assert.equal(code, CHECK_VIOLATION, `mong đợi 23514 nhưng nhận ${code}`);
    return true;
  });
}

test("advances.amount âm → 23514", { skip: !HAS_TEST_DB }, async () => {
  const { run } = await import("@/lib/db");
  await expectCheckViolation(() =>
    run(`INSERT INTO advances (project_id, amount) VALUES (NULL, ?)`, -1),
  );
});

test("invoices.vat_amount âm → 23514", { skip: !HAS_TEST_DB }, async () => {
  const { run } = await import("@/lib/db");
  await expectCheckViolation(() =>
    run(`INSERT INTO invoices (direction, net_amount, vat_amount) VALUES ('in', ?, ?)`, 100, -5),
  );
});

test("cash_transactions.amount âm → 23514", { skip: !HAS_TEST_DB }, async () => {
  const { run } = await import("@/lib/db");
  await expectCheckViolation(() =>
    run(
      `INSERT INTO cash_transactions (tx_date, direction, amount) VALUES (CURRENT_DATE, 'in', ?)`,
      -100,
    ),
  );
});

test("materials.qty_used âm → 23514", { skip: !HAS_TEST_DB }, async () => {
  const { run } = await import("@/lib/db");
  await expectCheckViolation(() =>
    run(
      `INSERT INTO materials (sheet_type_id, name, qty_used) VALUES (NULL, ?, ?)`,
      "Vật tư test CHECK",
      -1,
    ),
  );
});

test("tasks.progress_percent ngoài [0,1] → 23514", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId } = await import("@/lib/db");
  // Cần 1 task hợp lệ trước rồi UPDATE ra ngoài miền (INSERT vướng nhiều NOT NULL khác).
  const S = Date.now().toString(36);
  const pkgId = await insertId(
    `INSERT INTO work_packages (code, name, progress) VALUES (?, ?, 0)`,
    `chkwp-${S}`,
    "WP test CHECK",
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, ?, 0.5)`,
    pkgId,
    `chkt-${S}`,
    "Task test CHECK",
  );
  await expectCheckViolation(() =>
    run(`UPDATE tasks SET progress_percent = ? WHERE id = ?`, 2, taskId),
  );
});
