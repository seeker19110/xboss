import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateMonitoringInput: tính passed đúng đủ ca biên (đủ 2 giá trị / thiếu 1 → NULL)", async () => {
  const { validateMonitoringInput } = await import("@/lib/environment");

  const base = {
    measuredAt: "2026-07-01",
    category: "nuoc_thai" as const,
    indicator: "pH",
    value: 6.5,
    unit: null,
    threshold: 9,
    location: "Cổng B",
    note: null,
  };

  // Đủ cả 2 giá trị, đạt (value <= threshold).
  let r = validateMonitoringInput(base);
  assert.equal(r.error, null);
  assert.equal(r.passed, true);

  // Đủ cả 2 giá trị, không đạt (value > threshold).
  r = validateMonitoringInput({ ...base, value: 10 });
  assert.equal(r.error, null);
  assert.equal(r.passed, false);

  // value = threshold (biên) → đạt.
  r = validateMonitoringInput({ ...base, value: 9 });
  assert.equal(r.error, null);
  assert.equal(r.passed, true);

  // Thiếu threshold → không đánh giá được.
  r = validateMonitoringInput({ ...base, threshold: null });
  assert.equal(r.error, null);
  assert.equal(r.passed, null);

  // Thiếu value → không đánh giá được.
  r = validateMonitoringInput({ ...base, value: null });
  assert.equal(r.error, null);
  assert.equal(r.passed, null);

  // Thiếu cả hai → vẫn null, không lỗi.
  r = validateMonitoringInput({ ...base, value: null, threshold: null });
  assert.equal(r.error, null);
  assert.equal(r.passed, null);

  // Lỗi validate: ngày sai định dạng.
  r = validateMonitoringInput({ ...base, measuredAt: "01/07/2026" });
  assert.match(r.error!, /ngày quan trắc/i);
  assert.equal(r.passed, null);

  // Lỗi validate: nhóm không hợp lệ.
  r = validateMonitoringInput({ ...base, category: "xxx" as never });
  assert.match(r.error!, /nhóm quan trắc/i);

  // Lỗi validate: thiếu chỉ tiêu.
  r = validateMonitoringInput({ ...base, indicator: "" });
  assert.match(r.error!, /chỉ tiêu/i);
});

test("validateEnvPermitInput: đủ ca hợp lệ/không hợp lệ (bám pattern validateLegalInput)", async () => {
  const { validateEnvPermitInput } = await import("@/lib/environment");

  const base = {
    kind: "giay_phep_mt" as const,
    code: "GPMT-001",
    title: "Giấy phép môi trường test",
    issuedBy: "Sở TN&MT",
    issuedDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "valid" as const,
  };

  assert.equal(validateEnvPermitInput(base), null);
  assert.match(validateEnvPermitInput({ ...base, title: "" })!, /tên hồ sơ/i);
  assert.match(validateEnvPermitInput({ ...base, kind: "xxx" as never })!, /loại hồ sơ/i);
  assert.match(validateEnvPermitInput({ ...base, status: "xxx" as never })!, /trạng thái/i);
  assert.match(
    validateEnvPermitInput({ ...base, issuedDate: "2026-12-31", expiryDate: "2026-01-01" })!,
    /ngày cấp phải trước/i,
  );
  assert.equal(validateEnvPermitInput({ ...base, expiryDate: null }), null);
});

test("validateWasteInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateWasteInput } = await import("@/lib/environment");

  const base = {
    logDate: "2026-07-01",
    wasteType: "ran_xd" as const,
    quantity: 5,
    unit: "tấn",
    disposalMethod: null,
    handler: null,
    note: null,
  };

  assert.equal(validateWasteInput(base), null);
  assert.match(validateWasteInput({ ...base, logDate: "01/07/2026" })!, /ngày ghi nhận/i);
  assert.match(validateWasteInput({ ...base, wasteType: "xxx" as never })!, /loại chất thải/i);
  assert.match(validateWasteInput({ ...base, quantity: -1 })!, /không được âm/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "expiringEnvPermits: xuất hiện đúng khi sắp hết hạn/quá hạn, tự dọn khi gia hạn/đổi status",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { expiringEnvPermits } = await import("@/lib/environment");
    const { todayISO, daysFromTodayISO } = await import("@/lib/date");

    const soonId = await insertId(
      `INSERT INTO env_permits (kind, title, status, expiry_date)
       VALUES ('giay_phep_mt', 'GPMT sắp hết hạn', 'valid', ?)`,
      daysFromTodayISO(10),
    );
    const expiredId = await insertId(
      `INSERT INTO env_permits (kind, title, status, expiry_date)
       VALUES ('giay_phep_mt', 'GPMT đã quá hạn', 'valid', ?)`,
      daysFromTodayISO(-5),
    );
    const farId = await insertId(
      `INSERT INTO env_permits (kind, title, status, expiry_date)
       VALUES ('giay_phep_mt', 'GPMT còn xa hạn', 'valid', ?)`,
      daysFromTodayISO(365),
    );
    const supersededId = await insertId(
      `INSERT INTO env_permits (kind, title, status, expiry_date)
       VALUES ('giay_phep_mt', 'GPMT đã thay thế sắp hết hạn', 'superseded', ?)`,
      daysFromTodayISO(10),
    );

    let list = await expiringEnvPermits(undefined, 30);
    let ids = list.map((d) => d.id);
    assert.ok(ids.includes(soonId));
    assert.ok(ids.includes(expiredId));
    assert.ok(!ids.includes(farId));
    assert.ok(!ids.includes(supersededId)); // không 'valid' → không cảnh báo

    const soon = list.find((d) => d.id === soonId);
    const expired = list.find((d) => d.id === expiredId);
    assert.equal(soon!.expired, false);
    assert.equal(expired!.expired, true);
    assert.ok(expired!.expiryDate < todayISO());

    // Gia hạn → tự dọn khỏi danh sách cảnh báo.
    await run(`UPDATE env_permits SET expiry_date = ? WHERE id = ?`, daysFromTodayISO(365), soonId);
    list = await expiringEnvPermits(undefined, 30);
    ids = list.map((d) => d.id);
    assert.ok(!ids.includes(soonId));

    await run(
      `DELETE FROM env_permits WHERE id IN (?, ?, ?, ?)`,
      soonId,
      expiredId,
      farId,
      supersededId,
    );
  },
);

test(
  "exceededMonitoring: chỉ lấy kỳ passed=FALSE gần nhất mỗi tổ hợp (category,indicator,location), tự dọn khi kỳ mới đạt",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { exceededMonitoring } = await import("@/lib/environment");
    const { daysFromTodayISO } = await import("@/lib/date");

    // Cùng tổ hợp (nuoc_thai, pH, Cổng B): kỳ cũ vượt ngưỡng, kỳ mới đạt → không còn cảnh báo.
    const oldFailId = await insertId(
      `INSERT INTO env_monitoring (measured_at, category, indicator, value, threshold, passed, location)
       VALUES (?, 'nuoc_thai', 'pH', 10, 9, FALSE, 'Cổng B')`,
      daysFromTodayISO(-10),
    );
    const newPassId = await insertId(
      `INSERT INTO env_monitoring (measured_at, category, indicator, value, threshold, passed, location)
       VALUES (?, 'nuoc_thai', 'pH', 8, 9, TRUE, 'Cổng B')`,
      daysFromTodayISO(-1),
    );

    // Tổ hợp khác (khi_bui, Bụi, Khu A): kỳ gần nhất vượt ngưỡng → phải xuất hiện.
    const dustFailId = await insertId(
      `INSERT INTO env_monitoring (measured_at, category, indicator, value, threshold, passed, location)
       VALUES (?, 'khi_bui', 'Bụi', 500, 300, FALSE, 'Khu A')`,
      daysFromTodayISO(-2),
    );

    let list = await exceededMonitoring();
    let ids = list.map((m) => m.id);
    assert.ok(!ids.includes(oldFailId)); // kỳ cũ bị kỳ mới (đạt) che — không còn cảnh báo
    assert.ok(!ids.includes(newPassId)); // kỳ mới đạt, không nằm trong danh sách vượt ngưỡng
    assert.ok(ids.includes(dustFailId));

    // Ghi kỳ mới hơn cho tổ hợp Bụi/Khu A với kết quả đạt → tự dọn.
    await insertId(
      `INSERT INTO env_monitoring (measured_at, category, indicator, value, threshold, passed, location)
       VALUES (?, 'khi_bui', 'Bụi', 200, 300, TRUE, 'Khu A')`,
      daysFromTodayISO(0),
    );
    list = await exceededMonitoring();
    ids = list.map((m) => m.id);
    assert.ok(!ids.includes(dustFailId));

    await run(
      `DELETE FROM env_monitoring WHERE category IN ('nuoc_thai', 'khi_bui') AND indicator IN ('pH', 'Bụi')`,
    );
  },
);

test(
  "notification env_permit_expiry: dedup theo env_permit_id, không trùng khi gọi lại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { expiringEnvPermits } = await import("@/lib/environment");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Notif Env', 'notifenv@test.local', 'x', 'admin')`,
    );
    const permitId = await insertId(
      `INSERT INTO env_permits (kind, title, status, expiry_date)
       VALUES ('giay_phep_mt', 'GPMT test dedup', 'valid', ?)`,
      daysFromTodayISO(5),
    );

    const expiring = await expiringEnvPermits(undefined, 30);
    assert.ok(expiring.some((d) => d.id === permitId));

    const insertOne = async () => {
      const values = expiring.map(() => `(?, ?, 'env_permit_expiry', ?)`).join(", ");
      const params = expiring.flatMap((d) => [userId, d.id, `test ${d.title}`]);
      await run(
        `INSERT INTO notifications (user_id, env_permit_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, env_permit_id) WHERE env_permit_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne(); // gọi lại lần 2 — không được tạo bản ghi trùng

    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'env_permit_expiry' AND env_permit_id = ?`,
      userId,
      permitId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(`DELETE FROM env_permits WHERE id = ?`, permitId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);

test(
  "notification env_monitoring_over: dedup theo env_monitoring_id, không trùng khi gọi lại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { exceededMonitoring } = await import("@/lib/environment");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Notif Mon', 'notifmon@test.local', 'x', 'admin')`,
    );
    const monId = await insertId(
      `INSERT INTO env_monitoring (measured_at, category, indicator, value, threshold, passed, location)
       VALUES (?, 'on_rung', 'độ ồn dBA', 90, 70, FALSE, 'Khu C')`,
      daysFromTodayISO(-1),
    );

    const exceeded = await exceededMonitoring();
    assert.ok(exceeded.some((m) => m.id === monId));

    const insertOne = async () => {
      const values = exceeded.map(() => `(?, ?, 'env_monitoring_over', ?)`).join(", ");
      const params = exceeded.flatMap((m) => [userId, m.id, `test ${m.indicator}`]);
      await run(
        `INSERT INTO notifications (user_id, env_monitoring_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, env_monitoring_id) WHERE env_monitoring_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne();

    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'env_monitoring_over' AND env_monitoring_id = ?`,
      userId,
      monId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(`DELETE FROM env_monitoring WHERE id = ?`, monId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);
