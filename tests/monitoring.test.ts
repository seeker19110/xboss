import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("computeLevel: đủ ca biên normal/warn/alarm", async () => {
  const { computeLevel } = await import("@/lib/monitoring");

  const point = { warnThreshold: 10, alarmThreshold: 20 };

  // Dưới ngưỡng warn → normal.
  assert.equal(computeLevel(5, null, point), "normal");
  // Đúng bằng ngưỡng warn → ĐẠT warn (>=, không phải >).
  assert.equal(computeLevel(10, null, point), "warn");
  // Giữa warn và alarm → warn.
  assert.equal(computeLevel(15, null, point), "warn");
  // Đúng bằng ngưỡng alarm → ĐẠT alarm.
  assert.equal(computeLevel(20, null, point), "alarm");
  // Vượt hẳn alarm → alarm.
  assert.equal(computeLevel(50, null, point), "alarm");

  // Có cumulative → ưu tiên so cumulative thay vì value.
  assert.equal(computeLevel(5, 25, point), "alarm");
  assert.equal(computeLevel(50, 5, point), "normal");
  assert.equal(computeLevel(50, 10, point), "warn");

  // Thiếu ngưỡng (null) → không bao giờ báo mức đó.
  assert.equal(computeLevel(1000, null, { warnThreshold: null, alarmThreshold: null }), "normal");
  assert.equal(computeLevel(1000, null, { warnThreshold: null, alarmThreshold: 20 }), "alarm");
  assert.equal(computeLevel(15, null, { warnThreshold: 10, alarmThreshold: null }), "warn");
});

test("validateReadingInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateReadingInput } = await import("@/lib/monitoring");

  const base = { measuredAt: "2026-07-01", value: 5, cumulative: 10, note: null };
  assert.equal(validateReadingInput(base), null);
  assert.match(validateReadingInput({ ...base, measuredAt: "01/07/2026" })!, /ngày đo/i);
  assert.match(validateReadingInput({ ...base, value: NaN })!, /giá trị đo/i);
  assert.match(validateReadingInput({ ...base, cumulative: NaN })!, /luỹ kế/i);
  // cumulative null (không nhập) hợp lệ.
  assert.equal(validateReadingInput({ ...base, cumulative: null }), null);
});

test("validatePointInput/validateCommunityCaseInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validatePointInput, validateCommunityCaseInput } = await import("@/lib/monitoring");

  const basePoint = {
    code: "M-01",
    kind: "lun" as const,
    location: null,
    warnThreshold: 10,
    alarmThreshold: 20,
    unit: "mm",
    status: "active" as const,
  };
  assert.equal(validatePointInput(basePoint), null);
  assert.match(validatePointInput({ ...basePoint, code: "" })!, /mã mốc/i);
  assert.match(validatePointInput({ ...basePoint, kind: "xxx" as never })!, /loại quan trắc/i);
  assert.match(
    validatePointInput({ ...basePoint, warnThreshold: 30, alarmThreshold: 20 })!,
    /ngưỡng cảnh báo/i,
  );

  const baseCase = {
    code: null,
    title: "Khiếu nại tiếng ồn",
    source: "dân cư",
    receivedDate: "2026-07-01",
    status: "open" as const,
    resolution: null,
    closedDate: null,
  };
  assert.equal(validateCommunityCaseInput(baseCase), null);
  assert.match(validateCommunityCaseInput({ ...baseCase, title: "" })!, /tiêu đề/i);
  assert.match(
    validateCommunityCaseInput({ ...baseCase, receivedDate: "01/07/2026" })!,
    /ngày tiếp nhận/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "readingsSeries: trả đúng thứ tự theo measured_at (không phải thứ tự chèn)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { readingsSeries } = await import("@/lib/monitoring");

    const pointId = await insertId(
      `INSERT INTO monitoring_points (code, kind, warn_threshold, alarm_threshold, unit)
       VALUES ('M-SERIES', 'lun', 10, 20, 'mm') RETURNING id`,
    );

    // Chèn không theo thứ tự thời gian.
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-05', 5, 5, 'normal')`,
      pointId,
    );
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-01', 2, 2, 'normal')`,
      pointId,
    );
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-03', 3, 3, 'normal')`,
      pointId,
    );

    const series = await readingsSeries(pointId);
    assert.deepEqual(
      series.map((r) => r.measuredAt),
      ["2026-07-01", "2026-07-03", "2026-07-05"],
    );

    await run(`DELETE FROM monitoring_points WHERE id = ?`, pointId);
  },
);

test(
  "alarmingPoints: xuất hiện khi kỳ đo gần nhất alarm, tự dọn khi về normal",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { alarmingPoints } = await import("@/lib/monitoring");

    const pointId = await insertId(
      `INSERT INTO monitoring_points (code, kind, warn_threshold, alarm_threshold, unit)
       VALUES ('M-ALARM', 'lun', 10, 20, 'mm') RETURNING id`,
    );

    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-01', 5, 5, 'normal')`,
      pointId,
    );
    let alarming = await alarmingPoints();
    assert.ok(!alarming.some((p) => p.id === pointId));

    // Kỳ đo mới nhất vượt alarm → xuất hiện trong danh sách.
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-10', 25, 25, 'alarm')`,
      pointId,
    );
    alarming = await alarmingPoints();
    assert.ok(alarming.some((p) => p.id === pointId));

    // Kỳ đo mới hơn về normal → tự dọn khỏi danh sách (dùng kỳ đo GẦN NHẤT, không phải
    // "đã từng alarm").
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-15', 5, 5, 'normal')`,
      pointId,
    );
    alarming = await alarmingPoints();
    assert.ok(!alarming.some((p) => p.id === pointId));

    await run(`DELETE FROM monitoring_points WHERE id = ?`, pointId);
  },
);

test(
  "UNIQUE(point_id, measured_at): chặn trùng ngày đo cho cùng 1 mốc",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const pointId = await insertId(
      `INSERT INTO monitoring_points (code, kind) VALUES ('M-UNIQ', 'lun') RETURNING id`,
    );
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, level) VALUES (?, '2026-07-01', 1, 'normal')`,
      pointId,
    );

    await assert.rejects(
      run(
        `INSERT INTO monitoring_readings (point_id, measured_at, value, level) VALUES (?, '2026-07-01', 2, 'normal')`,
        pointId,
      ),
    );

    await run(`DELETE FROM monitoring_points WHERE id = ?`, pointId);
  },
);

test(
  "notification monitoring_alarm: dedup theo monitoring_point_id, không trùng khi gọi lại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { alarmingPoints } = await import("@/lib/monitoring");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Notif Mon', 'notifmon@test.local', 'x', 'admin')`,
    );
    const pointId = await insertId(
      `INSERT INTO monitoring_points (code, kind, warn_threshold, alarm_threshold)
       VALUES ('M-NOTIF', 'lun', 10, 20) RETURNING id`,
    );
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level) VALUES (?, '2026-07-01', 25, 25, 'alarm')`,
      pointId,
    );

    const alarming = await alarmingPoints();
    assert.ok(alarming.some((p) => p.id === pointId));

    const insertOne = async () => {
      const values = alarming.map(() => `(?, ?, 'monitoring_alarm', ?)`).join(", ");
      const params = alarming.flatMap((p) => [userId, p.id, `test ${p.code}`]);
      await run(
        `INSERT INTO notifications (user_id, monitoring_point_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, monitoring_point_id) WHERE monitoring_point_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne(); // gọi lại lần 2 — không được tạo bản ghi trùng

    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'monitoring_alarm' AND monitoring_point_id = ?`,
      userId,
      pointId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(`DELETE FROM monitoring_points WHERE id = ?`, pointId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);
