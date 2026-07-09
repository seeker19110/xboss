import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("warrantyExpiry: tính đúng from + months, đủ ca biên", async () => {
  const { warrantyExpiry } = await import("@/lib/warranty");

  assert.equal(warrantyExpiry({ warrantyFrom: "2026-01-15", warrantyMonths: 12 }), "2027-01-15");
  // tràn năm/tháng
  assert.equal(warrantyExpiry({ warrantyFrom: "2026-11-01", warrantyMonths: 6 }), "2027-05-01");
  // 0 tháng → hạn = ngày bắt đầu
  assert.equal(warrantyExpiry({ warrantyFrom: "2026-07-09", warrantyMonths: 0 }), "2026-07-09");
  // thiếu 1 trong 2 → null
  assert.equal(warrantyExpiry({ warrantyFrom: null, warrantyMonths: 12 }), null);
  assert.equal(warrantyExpiry({ warrantyFrom: "2026-01-01", warrantyMonths: null }), null);
  // ngày sai định dạng → null (không throw)
  assert.equal(warrantyExpiry({ warrantyFrom: "15/01/2026", warrantyMonths: 12 }), null);
});

test("validateWarrantyInput/validateClaimInput: đủ ca biên", async () => {
  const { validateWarrantyInput, validateClaimInput } = await import("@/lib/warranty");

  assert.equal(
    validateWarrantyInput({
      title: "Hệ thống điều hoà tầng 1",
      disciplineId: null,
      handoverItemId: null,
      warrantyFrom: "2026-01-01",
      warrantyMonths: 24,
      guaranteeId: null,
      status: "active",
      note: null,
    }),
    null,
  );
  assert.match(
    validateWarrantyInput({
      title: "",
      disciplineId: null,
      handoverItemId: null,
      warrantyFrom: null,
      warrantyMonths: null,
      guaranteeId: null,
      status: "active",
      note: null,
    })!,
    /tên hạng mục/i,
  );
  assert.match(
    validateWarrantyInput({
      title: "X",
      disciplineId: null,
      handoverItemId: null,
      warrantyFrom: "01/01/2026",
      warrantyMonths: 12,
      guaranteeId: null,
      status: "active",
      note: null,
    })!,
    /ngày bắt đầu/i,
  );
  assert.match(
    validateWarrantyInput({
      title: "X",
      disciplineId: null,
      handoverItemId: null,
      warrantyFrom: null,
      warrantyMonths: null,
      guaranteeId: null,
      status: "xxx" as never,
      note: null,
    })!,
    /trạng thái/i,
  );

  assert.equal(
    validateClaimInput({
      warrantyItemId: null,
      code: null,
      reportedDate: null,
      description: "Rò rỉ nước điều hoà",
      severity: "high",
      status: "open",
      dueDate: null,
      resolution: null,
      closedDate: null,
      assignee: null,
    }),
    null,
  );
  assert.match(
    validateClaimInput({
      warrantyItemId: null,
      code: null,
      reportedDate: null,
      description: "",
      severity: null,
      status: "open",
      dueDate: null,
      resolution: null,
      closedDate: null,
      assignee: null,
    })!,
    /mô tả lỗi/i,
  );
  assert.match(
    validateClaimInput({
      warrantyItemId: null,
      code: null,
      reportedDate: null,
      description: "X",
      severity: "xxx" as never,
      status: "open",
      dueDate: null,
      resolution: null,
      closedDate: null,
      assignee: null,
    })!,
    /mức độ/i,
  );
  assert.match(
    validateClaimInput({
      warrantyItemId: null,
      code: null,
      reportedDate: "09/07/2026",
      description: "X",
      severity: null,
      status: "open",
      dueDate: null,
      resolution: null,
      closedDate: null,
      assignee: null,
    })!,
    /ngày báo lỗi/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "expiringWarranties: xuất hiện đúng khi sắp/đã hết hạn, tự dọn khi gia hạn, không lẫn dự án",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { expiringWarranties } = await import("@/lib/warranty");
    const { daysFromTodayISO } = await import("@/lib/date");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA WR 1', 'PJT-WR1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA WR 2', 'PJT-WR2')`);

    // 12 tháng bắt đầu cách đây 11 tháng + 20 ngày → hết hạn trong ~10 ngày (nằm trong sổ
    // 30 ngày cảnh báo). Dùng warrantyMonths=1 với warrantyFrom cách đây gần 1 tháng để đơn
    // giản hoá: hạn = from + 1 tháng, đặt from = hôm nay - 25 ngày → hạn còn ~5 ngày tới.
    const soonId = await insertId(
      `INSERT INTO warranty_items (project_id, title, warranty_from, warranty_months, status)
       VALUES (?, 'Hạng mục sắp hết hạn', ?, 1, 'active')`,
      p1,
      daysFromTodayISO(-25),
    );
    const expiredId = await insertId(
      `INSERT INTO warranty_items (project_id, title, warranty_from, warranty_months, status)
       VALUES (?, 'Hạng mục đã hết hạn', ?, 1, 'active')`,
      p1,
      daysFromTodayISO(-40),
    );
    const farId = await insertId(
      `INSERT INTO warranty_items (project_id, title, warranty_from, warranty_months, status)
       VALUES (?, 'Hạng mục còn xa hạn', ?, 24, 'active')`,
      p1,
      daysFromTodayISO(-1),
    );
    const otherProjectId = await insertId(
      `INSERT INTO warranty_items (project_id, title, warranty_from, warranty_months, status)
       VALUES (?, 'Hạng mục dự án khác', ?, 1, 'active')`,
      p2,
      daysFromTodayISO(-25),
    );

    let list = await expiringWarranties(30, p1);
    let ids = list.map((w) => w.id);
    assert.ok(ids.includes(soonId));
    assert.ok(ids.includes(expiredId));
    assert.ok(!ids.includes(farId));
    assert.ok(!ids.includes(otherProjectId));
    assert.equal(list.find((w) => w.id === expiredId)?.expired, true);
    assert.equal(list.find((w) => w.id === soonId)?.expired, false);

    // Gia hạn (đổi status='expired' thủ công) → tự dọn khỏi danh sách cảnh báo.
    await run(`UPDATE warranty_items SET status = 'expired' WHERE id = ?`, soonId);
    list = await expiringWarranties(30, p1);
    ids = list.map((w) => w.id);
    assert.ok(!ids.includes(soonId));

    // Dự án khác không lẫn.
    const list2 = await expiringWarranties(30, p2);
    assert.deepEqual(
      list2.map((w) => w.id),
      [otherProjectId],
    );

    await run(
      `DELETE FROM warranty_items WHERE id IN (?, ?, ?, ?)`,
      soonId,
      expiredId,
      farId,
      otherProjectId,
    );
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "overdueClaims: xuất hiện đúng khi quá hạn chưa đóng, tự dọn khi đóng, dedup notification",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { overdueClaims } = await import("@/lib/warranty");
    const { daysFromTodayISO } = await import("@/lib/date");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Warranty User', 'warrantyuser@test.local', 'x', 'engineer')`,
    );

    const overdueId = await insertId(
      `INSERT INTO warranty_claims (description, status, due_date, assignee)
       VALUES ('Claim quá hạn', 'open', ?, ?)`,
      daysFromTodayISO(-3),
      userId,
    );
    const notYetId = await insertId(
      `INSERT INTO warranty_claims (description, status, due_date, assignee)
       VALUES ('Claim còn hạn', 'open', ?, ?)`,
      daysFromTodayISO(5),
      userId,
    );
    const closedOverdueId = await insertId(
      `INSERT INTO warranty_claims (description, status, due_date, assignee)
       VALUES ('Claim quá hạn nhưng đã đóng', 'closed', ?, ?)`,
      daysFromTodayISO(-3),
      userId,
    );

    let list = await overdueClaims(userId);
    let ids = list.map((c) => c.id);
    assert.ok(ids.includes(overdueId));
    assert.ok(!ids.includes(notYetId));
    assert.ok(!ids.includes(closedOverdueId));

    // Đóng claim quá hạn → tự dọn khỏi danh sách cảnh báo.
    await run(`UPDATE warranty_claims SET status = 'closed' WHERE id = ?`, overdueId);
    list = await overdueClaims(userId);
    ids = list.map((c) => c.id);
    assert.ok(!ids.includes(overdueId));

    // notification dedup: chèn 2 lần liên tiếp không tạo bản ghi trùng.
    const reopenedId = await insertId(
      `INSERT INTO warranty_claims (description, status, due_date, assignee)
       VALUES ('Claim quá hạn cho notif', 'open', ?, ?)`,
      daysFromTodayISO(-1),
      userId,
    );
    const insertOne = async () => {
      const rows = await overdueClaims(userId);
      if (rows.length === 0) return;
      const values = rows.map(() => `(?, ?, 'warranty_claim_overdue', ?)`).join(", ");
      const params = rows.flatMap((c) => [userId, c.id, `test ${c.description}`]);
      await run(
        `INSERT INTO notifications (user_id, warranty_claim_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, warranty_claim_id) WHERE warranty_claim_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    };
    await insertOne();
    await insertOne();
    const count = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'warranty_claim_overdue' AND warranty_claim_id = ?`,
      userId,
      reopenedId,
    );
    assert.equal(Number(count?.n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
    await run(
      `DELETE FROM warranty_claims WHERE id IN (?, ?, ?, ?)`,
      overdueId,
      notYetId,
      closedOverdueId,
      reopenedId,
    );
    await run(`DELETE FROM users WHERE id = ?`, userId);
  },
);

test(
  "vòng đời claim open→handling→closed + warranty_item_id nullable",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const wiId = await insertId(
      `INSERT INTO warranty_items (title, status) VALUES ('Hạng mục vòng đời', 'active')`,
    );
    const claimId = await insertId(
      `INSERT INTO warranty_claims (warranty_item_id, description, status)
       VALUES (?, 'Claim vòng đời', 'open')`,
      wiId,
    );
    await run(`UPDATE warranty_claims SET status = 'handling' WHERE id = ?`, claimId);
    let claim = await queryOne<{ status: string }>(
      `SELECT status FROM warranty_claims WHERE id = ?`,
      claimId,
    );
    assert.equal(claim?.status, "handling");
    await run(`UPDATE warranty_claims SET status = 'closed' WHERE id = ?`, claimId);
    claim = await queryOne<{ status: string }>(
      `SELECT status FROM warranty_claims WHERE id = ?`,
      claimId,
    );
    assert.equal(claim?.status, "closed");

    // warranty_item_id nullable — claim không gắn hạng mục cụ thể vẫn tạo được.
    const looseId = await insertId(
      `INSERT INTO warranty_claims (description, status) VALUES ('Claim không gắn hạng mục', 'open')`,
    );
    const loose = await queryOne<{ warrantyItemId: number | null }>(
      `SELECT warranty_item_id AS "warrantyItemId" FROM warranty_claims WHERE id = ?`,
      looseId,
    );
    assert.equal(loose?.warrantyItemId, null);

    await run(`DELETE FROM warranty_claims WHERE id IN (?, ?)`, claimId, looseId);
    await run(`DELETE FROM warranty_items WHERE id = ?`, wiId);
  },
);
