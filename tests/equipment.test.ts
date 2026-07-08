import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateEquipmentInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateEquipmentInput } = await import("@/lib/equipment");

  const base = {
    code: "TB-0001",
    name: "Máy hàn",
    kind: "May han",
    serial: null,
    condition: "good" as const,
    calibrationDue: "2026-12-31",
    currentLocation: null,
    currentCrew: null,
    note: null,
  };

  assert.equal(validateEquipmentInput(base), null);
  assert.match(validateEquipmentInput({ ...base, code: "" })!, /mã thiết bị/i);
  assert.match(validateEquipmentInput({ ...base, name: "" })!, /tên thiết bị/i);
  assert.match(validateEquipmentInput({ ...base, kind: "" })!, /loại thiết bị/i);
  assert.match(validateEquipmentInput({ ...base, condition: "xxx" as never })!, /tình trạng/i);
  assert.match(
    validateEquipmentInput({ ...base, calibrationDue: "31/12/2026" })!,
    /hạn kiểm định/i,
  );
});

test("validateEquipmentLogInput: issue/move cần vị trí hoặc tổ đội", async () => {
  const { validateEquipmentLogInput } = await import("@/lib/equipment");

  assert.match(
    validateEquipmentLogInput({ action: "issue", toLocation: null, toCrew: null, note: null })!,
    /vị trí hoặc tổ đội/i,
  );
  assert.equal(
    validateEquipmentLogInput({ action: "issue", toLocation: null, toCrew: "Tổ A", note: null }),
    null,
  );
  assert.equal(
    validateEquipmentLogInput({ action: "return", toLocation: null, toCrew: null, note: null }),
    null,
  );
  assert.match(
    validateEquipmentLogInput({
      action: "xxx" as never,
      toLocation: null,
      toCrew: null,
      note: null,
    })!,
    /hành động/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "addEquipmentLog: issue/return/maintain/calibrate cập nhật đúng trạng thái hiện hành",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { addEquipmentLog } = await import("@/lib/equipment");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('EQ Test', 'eq-test@xboss.vn', 'x', 'admin')`,
    );
    const eqId = await insertId(
      `INSERT INTO equipment (code, name, kind) VALUES ('TB-TEST-001', 'Máy khoan test', 'May khoan')`,
    );

    await addEquipmentLog(
      eqId,
      { action: "issue", toLocation: "Tầng 5", toCrew: "Tổ điện", note: null },
      userId,
    );
    let row = await queryOne<{ currentLocation: string | null; currentCrew: string | null }>(
      `SELECT current_location AS "currentLocation", current_crew AS "currentCrew" FROM equipment WHERE id = ?`,
      eqId,
    );
    assert.equal(row!.currentLocation, "Tầng 5");
    assert.equal(row!.currentCrew, "Tổ điện");

    await addEquipmentLog(
      eqId,
      { action: "return", toLocation: null, toCrew: null, note: null },
      userId,
    );
    row = await queryOne(
      `SELECT current_location AS "currentLocation", current_crew AS "currentCrew" FROM equipment WHERE id = ?`,
      eqId,
    );
    assert.equal(row!.currentCrew, null);

    await addEquipmentLog(
      eqId,
      { action: "maintain", toLocation: null, toCrew: null, note: null },
      userId,
    );
    let cond = await queryOne<{ condition: string }>(
      `SELECT condition FROM equipment WHERE id = ?`,
      eqId,
    );
    assert.equal(cond!.condition, "maintenance");

    await addEquipmentLog(
      eqId,
      { action: "calibrate", toLocation: null, toCrew: null, note: null },
      userId,
    );
    cond = await queryOne<{ condition: string }>(
      `SELECT condition FROM equipment WHERE id = ?`,
      eqId,
    );
    assert.equal(cond!.condition, "good");

    const logCount = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM equipment_logs WHERE equipment_id = ?`,
      eqId,
    );
    assert.equal(Number(logCount!.n), 4);

    await run(`DELETE FROM equipment WHERE id = ?`, eqId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);

test(
  "calibrationDueList: xuất hiện khi sắp/đã hết hạn, không xuất hiện khi còn xa hoặc đã ngừng dùng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { calibrationDueList } = await import("@/lib/equipment");
    const { daysFromTodayISO } = await import("@/lib/date");

    const soonId = await insertId(
      `INSERT INTO equipment (code, name, kind, calibration_due) VALUES ('TB-TEST-SOON', 'Thiết bị sắp hết hạn', 'May do', ?)`,
      daysFromTodayISO(10),
    );
    const farId = await insertId(
      `INSERT INTO equipment (code, name, kind, calibration_due) VALUES ('TB-TEST-FAR', 'Thiết bị còn xa hạn', 'May do', ?)`,
      daysFromTodayISO(365),
    );
    const retiredId = await insertId(
      `INSERT INTO equipment (code, name, kind, calibration_due, condition)
       VALUES ('TB-TEST-RETIRED', 'Thiết bị ngừng dùng', 'May do', ?, 'retired')`,
      daysFromTodayISO(1),
    );

    const list = await calibrationDueList();
    const ids = list.map((e) => e.id);
    assert.ok(ids.includes(soonId));
    assert.ok(!ids.includes(farId));
    assert.ok(!ids.includes(retiredId));

    await run(`DELETE FROM equipment WHERE id IN (?, ?, ?)`, soonId, farId, retiredId);
  },
);

test(
  "listEquipment: scoped đúng theo project_id (M22), không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listEquipment } = await import("@/lib/equipment");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Thiết bị 1', 'PJT-EQ1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Thiết bị 2', 'PJT-EQ2')`,
    );
    const eq1 = await insertId(
      `INSERT INTO equipment (code, name, kind, project_id) VALUES ('TB-SCOPE-1', 'Thiết bị DA1', 'May do', ?)`,
      p1,
    );
    await insertId(
      `INSERT INTO equipment (code, name, kind, project_id) VALUES ('TB-SCOPE-2', 'Thiết bị DA2', 'May do', ?)`,
      p2,
    );

    const list1 = await listEquipment({ projectId: p1 });
    assert.ok(list1.some((e) => e.id === eq1));
    assert.equal(list1.length, 1);

    await run(`DELETE FROM equipment WHERE code IN ('TB-SCOPE-1', 'TB-SCOPE-2')`);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
