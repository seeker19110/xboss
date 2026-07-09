import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateInsuranceInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateInsuranceInput } = await import("@/lib/insurance");

  const base = {
    contractId: null,
    kind: "car" as const,
    title: "Bảo hiểm công trình test",
    provider: "Bảo Việt",
    code: "BH-001",
    value: 1_000_000_000,
    issuedDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "valid" as const,
    note: null,
  };

  assert.equal(validateInsuranceInput(base), null);
  assert.match(validateInsuranceInput({ ...base, title: "" })!, /tên bảo hiểm/i);
  assert.match(validateInsuranceInput({ ...base, kind: "xxx" as never })!, /loại bảo hiểm/i);
  assert.match(validateInsuranceInput({ ...base, status: "xxx" as never })!, /trạng thái/i);
  assert.match(validateInsuranceInput({ ...base, issuedDate: "01/01/2026" })!, /ngày cấp/i);
  assert.match(validateInsuranceInput({ ...base, expiryDate: "31/12/2026" })!, /ngày hết hạn/i);
  assert.match(
    validateInsuranceInput({ ...base, issuedDate: "2026-12-31", expiryDate: "2026-01-01" })!,
    /ngày cấp phải trước/i,
  );
  assert.match(validateInsuranceInput({ ...base, value: -100 })!, /giá trị/i);
  assert.match(validateInsuranceInput({ ...base, contractId: NaN })!, /hợp đồng gắn/i);
  // expiryDate null (không hạn), value null hợp lệ.
  assert.equal(validateInsuranceInput({ ...base, expiryDate: null, value: null }), null);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "expiringInsuranceBonds: xuất hiện đúng khi sắp hết hiệu lực/quá hạn, tự dọn khi gia hạn/release",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { expiringInsuranceBonds } = await import("@/lib/insurance");
    const { todayISO, daysFromTodayISO } = await import("@/lib/date");

    const soonId = await insertId(
      `INSERT INTO insurance_bonds (kind, title, status, expiry_date)
       VALUES ('bao_lanh_thuc_hien', 'BL sắp hết hạn', 'valid', ?)`,
      daysFromTodayISO(10),
    );
    const expiredId = await insertId(
      `INSERT INTO insurance_bonds (kind, title, status, expiry_date)
       VALUES ('bao_lanh_thuc_hien', 'BL đã quá hạn', 'valid', ?)`,
      daysFromTodayISO(-5),
    );
    const farId = await insertId(
      `INSERT INTO insurance_bonds (kind, title, status, expiry_date)
       VALUES ('car', 'BH còn xa hạn', 'valid', ?)`,
      daysFromTodayISO(365),
    );
    const releasedId = await insertId(
      `INSERT INTO insurance_bonds (kind, title, status, expiry_date)
       VALUES ('bao_lanh_tam_ung', 'BL đã tất toán sắp hết hạn', 'released', ?)`,
      daysFromTodayISO(10),
    );

    let list = await expiringInsuranceBonds(30);
    let ids = list.map((b) => b.id);
    assert.ok(ids.includes(soonId));
    assert.ok(ids.includes(expiredId));
    assert.ok(!ids.includes(farId));
    assert.ok(!ids.includes(releasedId)); // đã tất toán → không cảnh báo

    const soon = list.find((b) => b.id === soonId);
    const expired = list.find((b) => b.id === expiredId);
    assert.equal(soon!.expired, false);
    assert.equal(expired!.expired, true);
    assert.ok(expired!.expiryDate < todayISO());

    // Gia hạn → tự dọn khỏi danh sách cảnh báo.
    await run(
      `UPDATE insurance_bonds SET expiry_date = ? WHERE id = ?`,
      daysFromTodayISO(365),
      soonId,
    );
    list = await expiringInsuranceBonds(30);
    ids = list.map((b) => b.id);
    assert.ok(!ids.includes(soonId));

    // Tất toán/thu hồi → tự dọn dù còn expiry_date gần hạn.
    await run(`UPDATE insurance_bonds SET status = 'released' WHERE id = ?`, expiredId);
    list = await expiringInsuranceBonds(30);
    ids = list.map((b) => b.id);
    assert.ok(!ids.includes(expiredId));

    await run(
      `DELETE FROM insurance_bonds WHERE id IN (?, ?, ?, ?)`,
      soonId,
      expiredId,
      farId,
      releasedId,
    );
  },
);

test(
  "notification insurance_expiry: dedup theo insurance_bond_id, không trùng khi gọi lại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { expiringInsuranceBonds } = await import("@/lib/insurance");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Notif Insurance', 'notifinsurance@test.local', 'x', 'admin')`,
    );
    const bondId = await insertId(
      `INSERT INTO insurance_bonds (kind, title, status, expiry_date)
       VALUES ('tnbt', 'BH test dedup', 'valid', ?)`,
      daysFromTodayISO(5),
    );

    const expiring = await expiringInsuranceBonds(30);
    assert.ok(expiring.some((b) => b.id === bondId));

    const insertOne = async () => {
      const values = expiring.map(() => `(?, ?, 'insurance_expiry', ?)`).join(", ");
      const params = expiring.flatMap((b) => [userId, b.id, `test ${b.title}`]);
      await run(
        `INSERT INTO notifications (user_id, insurance_bond_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, insurance_bond_id) WHERE insurance_bond_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne(); // gọi lại lần 2 — không được tạo bản ghi trùng

    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'insurance_expiry' AND insurance_bond_id = ?`,
      userId,
      bondId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(`DELETE FROM insurance_bonds WHERE id = ?`, bondId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);

test(
  "checkInsuranceContractRef: chặn gán HĐ dự án khác, cho phép HĐ đúng dự án/null",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { checkInsuranceContractRef } = await import("@/lib/insurance");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Insurance 1', 'PJT-INS1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Insurance 2', 'PJT-INS2')`,
    );
    const contractP1 = await insertId(
      `INSERT INTO contracts (project_id, code, kind, title, value) VALUES (?, 'HD-INS-P1', 'nhan_thau', 'HĐ dự án 1', 100)`,
      p1,
    );

    assert.equal(await checkInsuranceContractRef(null, p1), null);
    assert.equal(await checkInsuranceContractRef(contractP1, p1), null);
    assert.match((await checkInsuranceContractRef(contractP1, p2))!, /không thuộc dự án/i);
    assert.match((await checkInsuranceContractRef(999999, p1))!, /không thuộc dự án/i);

    await run(`DELETE FROM contracts WHERE id = ?`, contractP1);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
