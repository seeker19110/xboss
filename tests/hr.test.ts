import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validatePersonnelInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validatePersonnelInput } = await import("@/lib/hr");

  const base = {
    code: "NS-001",
    fullName: "Nguyễn Văn A",
    roleTitle: "Thợ điện",
    supplierId: null,
    phone: "0900000000",
    idNumber: "001099001234",
    status: "active" as const,
  };

  assert.equal(validatePersonnelInput(base), null);
  assert.match(validatePersonnelInput({ ...base, fullName: "" })!, /họ tên/i);
  assert.match(validatePersonnelInput({ ...base, status: "xxx" as never })!, /trạng thái/i);
  assert.equal(validatePersonnelInput({ ...base, supplierId: 3 }), null);
});

test("validateCrewInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateCrewInput } = await import("@/lib/hr");

  const base = { name: "Tổ điện 1", disciplineId: null, supplierId: null, leaderId: null };
  assert.equal(validateCrewInput(base), null);
  assert.match(validateCrewInput({ ...base, name: "" })!, /tên tổ đội/i);
});

test("validateAttendanceInput: chấm gộp vs chấm theo người", async () => {
  const { validateAttendanceInput } = await import("@/lib/hr");

  // Thiếu cả tổ đội lẫn nhân sự.
  assert.match(
    validateAttendanceInput({
      workDate: "2026-07-08",
      crewId: null,
      personnelId: null,
      headcount: null,
      present: null,
      hours: null,
      note: null,
    })!,
    /tổ đội hoặc nhân sự/i,
  );

  // Chấm gộp (personnelId null) phải có headcount > 0.
  assert.match(
    validateAttendanceInput({
      workDate: "2026-07-08",
      crewId: 1,
      personnelId: null,
      headcount: 0,
      present: null,
      hours: null,
      note: null,
    })!,
    /số người/i,
  );
  assert.equal(
    validateAttendanceInput({
      workDate: "2026-07-08",
      crewId: 1,
      personnelId: null,
      headcount: 5,
      present: null,
      hours: null,
      note: null,
    }),
    null,
  );

  // Chấm theo người không dùng headcount.
  assert.match(
    validateAttendanceInput({
      workDate: "2026-07-08",
      crewId: null,
      personnelId: 10,
      headcount: 3,
      present: true,
      hours: null,
      note: null,
    })!,
    /không dùng số người gộp/i,
  );
  assert.equal(
    validateAttendanceInput({
      workDate: "2026-07-08",
      crewId: null,
      personnelId: 10,
      headcount: null,
      present: true,
      hours: 8,
      note: null,
    }),
    null,
  );

  // Ngày sai định dạng.
  assert.match(
    validateAttendanceInput({
      workDate: "08/07/2026",
      crewId: 1,
      personnelId: null,
      headcount: 5,
      present: null,
      hours: null,
      note: null,
    })!,
    /ngày chấm công/i,
  );

  // Giờ công ngoài khoảng 0-24.
  assert.match(
    validateAttendanceInput({
      workDate: "2026-07-08",
      crewId: null,
      personnelId: 10,
      headcount: null,
      present: true,
      hours: 30,
      note: null,
    })!,
    /giờ công/i,
  );
});

test("maskIdNumber: ẩn CCCD khi không phải admin/pm", async () => {
  const { maskIdNumber } = await import("@/lib/hr");

  const rows = [{ id: 1, idNumber: "001099001234" }];
  assert.equal(maskIdNumber(rows, true)[0].idNumber, "001099001234");
  assert.equal(maskIdNumber(rows, false)[0].idNumber, null);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "attendanceByDate: gộp đúng headcount (chấm gộp + chấm theo người) theo ngày × tổ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { attendanceByDate } = await import("@/lib/hr");

    const projectId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA HR Attendance', 'PJT-HR1')`,
    );
    const crewId = await insertId(
      `INSERT INTO crews (project_id, name) VALUES (?, 'Tổ test attendance')`,
      projectId,
    );
    const p1 = await insertId(
      `INSERT INTO personnel (project_id, full_name) VALUES (?, 'NV Test 1')`,
      projectId,
    );
    const p2 = await insertId(
      `INSERT INTO personnel (project_id, full_name) VALUES (?, 'NV Test 2')`,
      projectId,
    );

    const attIds: number[] = [];
    // Chấm gộp: 5 người ngày 1.
    attIds.push(
      await insertId(
        `INSERT INTO attendance (project_id, work_date, crew_id, headcount) VALUES (?, '2026-07-01', ?, 5)`,
        projectId,
        crewId,
      ),
    );
    // Chấm theo người: 2 người có mặt ngày 1 (cùng tổ) → cộng thêm 2.
    attIds.push(
      await insertId(
        `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, present)
         VALUES (?, '2026-07-01', ?, ?, true)`,
        projectId,
        crewId,
        p1,
      ),
    );
    attIds.push(
      await insertId(
        `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, present)
         VALUES (?, '2026-07-01', ?, ?, true)`,
        projectId,
        crewId,
        p2,
      ),
    );
    // Nhân sự vắng → không cộng.
    attIds.push(
      await insertId(
        `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, present)
         VALUES (?, '2026-07-01', ?, ?, false)`,
        projectId,
        crewId,
        p1,
      ),
    );

    const rows = await attendanceByDate(projectId, "2026-07-01", "2026-07-31");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].workDate, "2026-07-01");
    assert.equal(rows[0].crewId, crewId);
    // 5 (gộp) + 1 (p1 có mặt) + 1 (p2 có mặt) + 0 (p1 vắng lần 2) = 7.
    assert.equal(rows[0].totalHeadcount, 7);

    await run(`DELETE FROM attendance WHERE id = ANY(?)`, attIds);
    await run(`DELETE FROM personnel WHERE id IN (?, ?)`, p1, p2);
    await run(`DELETE FROM crews WHERE id = ?`, crewId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "expiringCertifications: xuất hiện đúng khi sắp/đã hết hạn, tự dọn khi gia hạn (dedup notification)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { expiringCertifications } = await import("@/lib/hr");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Notif Cert', 'notifcert@test.local', 'x', 'admin')`,
    );
    const soonId = await insertId(
      `INSERT INTO certifications (kind, expiry_date) VALUES ('Thẻ an toàn', ?)`,
      daysFromTodayISO(10),
    );
    const expiredId = await insertId(
      `INSERT INTO certifications (kind, expiry_date) VALUES ('Chứng chỉ nghề', ?)`,
      daysFromTodayISO(-5),
    );
    const farId = await insertId(
      `INSERT INTO certifications (kind, expiry_date) VALUES ('Chứng chỉ vận hành', ?)`,
      daysFromTodayISO(365),
    );

    let list = await expiringCertifications(undefined, 30);
    let ids = list.map((c) => c.id);
    assert.ok(ids.includes(soonId));
    assert.ok(ids.includes(expiredId));
    assert.ok(!ids.includes(farId));

    const soon = list.find((c) => c.id === soonId);
    const expired = list.find((c) => c.id === expiredId);
    assert.equal(soon!.expired, false);
    assert.equal(expired!.expired, true);

    // Dedup notification cert_expiry.
    const insertOne = async () => {
      const values = list.map(() => `(?, ?, 'cert_expiry', ?)`).join(", ");
      const params = list.flatMap((c) => [userId, c.id, `test ${c.kind}`]);
      await run(
        `INSERT INTO notifications (user_id, certification_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, certification_id) WHERE certification_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne(); // gọi lại lần 2 — không được tạo bản ghi trùng
    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'cert_expiry' AND certification_id = ?`,
      userId,
      soonId,
    );
    assert.equal(Number(count?.n), 1);

    // Gia hạn → tự dọn khỏi danh sách cảnh báo.
    await run(
      `UPDATE certifications SET expiry_date = ? WHERE id = ?`,
      daysFromTodayISO(365),
      soonId,
    );
    list = await expiringCertifications(undefined, 30);
    ids = list.map((c) => c.id);
    assert.ok(!ids.includes(soonId));

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(`DELETE FROM certifications WHERE id IN (?, ?, ?)`, soonId, expiredId, farId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);

test(
  "UNIQUE(project_id, name) crews: không cho tạo 2 tổ đội trùng tên trong cùng dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");

    const projectId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA HR Crew Unique', 'PJT-HR2')`,
    );
    const crewId = await insertId(
      `INSERT INTO crews (project_id, name) VALUES (?, 'Tổ trùng tên')`,
      projectId,
    );

    await assert.rejects(
      insertId(`INSERT INTO crews (project_id, name) VALUES (?, 'Tổ trùng tên')`, projectId),
    );

    // Dự án khác được phép trùng tên (UNIQUE theo cặp project_id+name).
    const projectId2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA HR Crew Unique 2', 'PJT-HR3')`,
    );
    const crewId2 = await insertId(
      `INSERT INTO crews (project_id, name) VALUES (?, 'Tổ trùng tên')`,
      projectId2,
    );

    await run(`DELETE FROM crews WHERE id IN (?, ?)`, crewId, crewId2);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projectId, projectId2);
  },
);
