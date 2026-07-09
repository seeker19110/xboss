import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateLegalInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateLegalInput } = await import("@/lib/kickoff");

  const base = {
    kind: "giay_phep_xd" as const,
    code: "GP-001",
    title: "Giấy phép xây dựng test",
    issuedBy: "Sở Xây dựng",
    issuedDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "valid" as const,
    note: null,
  };

  assert.equal(validateLegalInput(base), null);
  assert.match(validateLegalInput({ ...base, title: "" })!, /tên hồ sơ/i);
  assert.match(validateLegalInput({ ...base, kind: "xxx" as never })!, /loại hồ sơ/i);
  assert.match(validateLegalInput({ ...base, status: "xxx" as never })!, /trạng thái/i);
  assert.match(validateLegalInput({ ...base, issuedDate: "01/01/2026" })!, /ngày cấp/i);
  assert.match(validateLegalInput({ ...base, expiryDate: "31/12/2026" })!, /ngày hết hạn/i);
  assert.match(
    validateLegalInput({ ...base, issuedDate: "2026-12-31", expiryDate: "2026-01-01" })!,
    /ngày cấp phải trước/i,
  );
  // expiryDate null (không hạn) hợp lệ.
  assert.equal(validateLegalInput({ ...base, expiryDate: null }), null);
});

test("validateMobilizationInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateMobilizationInput } = await import("@/lib/kickoff");

  const base = {
    category: "mat_bang" as const,
    title: "Bàn giao mặt bằng tầng 1",
    status: "pending" as const,
    dueDate: "2026-08-01",
    assignee: null,
    note: null,
  };

  assert.equal(validateMobilizationInput(base), null);
  assert.match(validateMobilizationInput({ ...base, title: "" })!, /tên hạng mục/i);
  assert.match(
    validateMobilizationInput({ ...base, category: "xxx" as never })!,
    /nhóm không hợp lệ/i,
  );
  assert.match(validateMobilizationInput({ ...base, status: "xxx" as never })!, /trạng thái/i);
  assert.match(validateMobilizationInput({ ...base, dueDate: "01/08/2026" })!, /hạn hoàn thành/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "expiringLegalDocs: xuất hiện đúng khi sắp hết hạn/quá hạn, tự dọn khi gia hạn/đổi status",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { expiringLegalDocs } = await import("@/lib/kickoff");
    const { todayISO, daysFromTodayISO } = await import("@/lib/date");

    const soonId = await insertId(
      `INSERT INTO legal_documents (kind, title, status, expiry_date)
       VALUES ('giay_phep_xd', 'GP sắp hết hạn', 'valid', ?)`,
      daysFromTodayISO(10),
    );
    const expiredId = await insertId(
      `INSERT INTO legal_documents (kind, title, status, expiry_date)
       VALUES ('giay_phep_xd', 'GP đã quá hạn', 'valid', ?)`,
      daysFromTodayISO(-5),
    );
    const farId = await insertId(
      `INSERT INTO legal_documents (kind, title, status, expiry_date)
       VALUES ('giay_phep_xd', 'GP còn xa hạn', 'valid', ?)`,
      daysFromTodayISO(365),
    );
    const draftId = await insertId(
      `INSERT INTO legal_documents (kind, title, status, expiry_date)
       VALUES ('giay_phep_xd', 'GP nháp sắp hết hạn', 'draft', ?)`,
      daysFromTodayISO(10),
    );

    let list = await expiringLegalDocs(30);
    let ids = list.map((d) => d.id);
    assert.ok(ids.includes(soonId));
    assert.ok(ids.includes(expiredId));
    assert.ok(!ids.includes(farId));
    assert.ok(!ids.includes(draftId)); // draft không active → không cảnh báo

    const soon = list.find((d) => d.id === soonId);
    const expired = list.find((d) => d.id === expiredId);
    assert.equal(soon!.expired, false);
    assert.equal(expired!.expired, true);
    assert.ok(expired!.expiryDate < todayISO());

    // Gia hạn → tự dọn khỏi danh sách cảnh báo.
    await run(
      `UPDATE legal_documents SET expiry_date = ? WHERE id = ?`,
      daysFromTodayISO(365),
      soonId,
    );
    list = await expiringLegalDocs(30);
    ids = list.map((d) => d.id);
    assert.ok(!ids.includes(soonId));

    // Đổi status (đã thay thế) → tự dọn dù còn expiry_date gần hạn.
    await run(`UPDATE legal_documents SET status = 'superseded' WHERE id = ?`, expiredId);
    list = await expiringLegalDocs(30);
    ids = list.map((d) => d.id);
    assert.ok(!ids.includes(expiredId));

    await run(
      `DELETE FROM legal_documents WHERE id IN (?, ?, ?, ?)`,
      soonId,
      expiredId,
      farId,
      draftId,
    );
  },
);

test(
  "kickoffReadiness: % hoàn thành checklist huy động tính đúng theo dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { kickoffReadiness } = await import("@/lib/kickoff");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Kickoff 1', 'PJT-KO1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Kickoff 2', 'PJT-KO2')`,
    );

    const ids: number[] = [];
    ids.push(
      await insertId(
        `INSERT INTO mobilization_items (project_id, category, title, status) VALUES (?, 'mat_bang', 'Việc 1', 'done')`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO mobilization_items (project_id, category, title, status) VALUES (?, 'khao_sat', 'Việc 2', 'pending')`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO mobilization_items (project_id, category, title, status) VALUES (?, 'trac_dac', 'Việc 3', 'done')`,
        p1,
      ),
    );
    ids.push(
      await insertId(
        `INSERT INTO mobilization_items (project_id, category, title, status) VALUES (?, 'huy_dong', 'Việc P2', 'done')`,
        p2,
      ),
    );

    const r1 = await kickoffReadiness(p1);
    assert.equal(r1.total, 3);
    assert.equal(r1.done, 2);
    assert.equal(r1.percent, 67);

    const r2 = await kickoffReadiness(p2);
    assert.equal(r2.total, 1);
    assert.equal(r2.done, 1);
    assert.equal(r2.percent, 100);

    await run(`DELETE FROM mobilization_items WHERE id = ANY(?)`, ids);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "notification legal_expiry: dedup theo legal_document_id, không trùng khi gọi lại",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { expiringLegalDocs } = await import("@/lib/kickoff");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Notif Legal', 'notiflegal@test.local', 'x', 'admin')`,
    );
    const docId = await insertId(
      `INSERT INTO legal_documents (kind, title, status, expiry_date)
       VALUES ('giay_phep_xd', 'GP test dedup', 'valid', ?)`,
      daysFromTodayISO(5),
    );

    const expiring = await expiringLegalDocs(30);
    assert.ok(expiring.some((d) => d.id === docId));

    const insertOne = async () => {
      const values = expiring.map(() => `(?, ?, 'legal_expiry', ?)`).join(", ");
      const params = expiring.flatMap((d) => [userId, d.id, `test ${d.title}`]);
      await run(
        `INSERT INTO notifications (user_id, legal_document_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, legal_document_id) WHERE legal_document_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne(); // gọi lại lần 2 — không được tạo bản ghi trùng

    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'legal_expiry' AND legal_document_id = ?`,
      userId,
      docId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(`DELETE FROM legal_documents WHERE id = ?`, docId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);
