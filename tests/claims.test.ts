import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateClaimInput: kind='cost' bắt buộc amountRequested, kind='eot' bắt buộc daysRequested", async () => {
  const { validateClaimInput } = await import("@/lib/claims");

  const base = {
    kind: "cost" as const,
    title: "Claim chờ mặt bằng tầng 12",
    contractId: null,
    voId: null,
    noticeDate: "2026-07-01",
    cause: "Chậm bàn giao mặt bằng do CĐT",
    amountRequested: 50_000_000,
    daysRequested: null,
  };

  assert.equal(validateClaimInput(base), null);
  assert.match(validateClaimInput({ ...base, kind: "xxx" as never })!, /loại claim/i);
  assert.match(validateClaimInput({ ...base, title: "" })!, /tiêu đề/i);
  assert.match(validateClaimInput({ ...base, noticeDate: "" })!, /ngày thông báo/i);
  assert.match(validateClaimInput({ ...base, cause: "" })!, /nguyên nhân/i);
  assert.match(validateClaimInput({ ...base, amountRequested: null })!, /giá trị đề xuất/i);
  assert.match(validateClaimInput({ ...base, amountRequested: 0 })!, /giá trị đề xuất/i);

  const eotBase = { ...base, kind: "eot" as const, amountRequested: null, daysRequested: 10 };
  assert.equal(validateClaimInput(eotBase), null);
  assert.match(validateClaimInput({ ...eotBase, daysRequested: null })!, /số ngày đề xuất/i);
  assert.match(validateClaimInput({ ...eotBase, daysRequested: 0 })!, /số ngày đề xuất/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test("nextClaimCode: sinh mã tuần tự CLM-NNNN", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId } = await import("@/lib/db");
  const { nextClaimCode } = await import("@/lib/claims");

  const code1 = await nextClaimCode();
  assert.match(code1, /^CLM-\d{4}$/);
  const id1 = await insertId(
    `INSERT INTO claims (code, kind, title, notice_date, cause, amount_requested)
       VALUES (?, 'cost', 'Claim test 1', '2026-07-01', 'Nguyên nhân test', 1000000)`,
    code1,
  );
  const code2 = await nextClaimCode();
  assert.notEqual(code1, code2);
  const seq1 = parseInt(code1.slice("CLM-".length));
  const seq2 = parseInt(code2.slice("CLM-".length));
  assert.equal(seq2, seq1 + 1);

  await run(`DELETE FROM claims WHERE id = ?`, id1);
});

test(
  "pendingClaims: chỉ xuất hiện claim đang mở quá hạn N ngày, không lẫn dự án khác (M22)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { pendingClaims } = await import("@/lib/claims");
    const { daysFromTodayISO } = await import("@/lib/date");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Dự án claim A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Dự án claim B')`);

    const overdueA = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, amount_requested, status)
       VALUES (?, 'CLM-TEST-OVERDUE', 'cost', 'Claim quá hạn A', ?, 'Nguyên nhân', 1000000, 'notice')`,
      projA,
      daysFromTodayISO(-20),
    );
    const overdueB = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, days_requested, status)
       VALUES (?, 'CLM-TEST-OVERDUE-B', 'eot', 'Claim quá hạn B', ?, 'Nguyên nhân', 5, 'notice')`,
      projB,
      daysFromTodayISO(-20),
    );
    const freshA = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, amount_requested, status)
       VALUES (?, 'CLM-TEST-FRESH', 'cost', 'Claim mới A', ?, 'Nguyên nhân', 1000000, 'notice')`,
      projA,
      daysFromTodayISO(-1),
    );
    const settledA = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, amount_requested, status)
       VALUES (?, 'CLM-TEST-SETTLED', 'cost', 'Claim đã chốt A', ?, 'Nguyên nhân', 1000000, 'settled')`,
      projA,
      daysFromTodayISO(-20),
    );

    const pendingAll = await pendingClaims(14);
    const idsAll = pendingAll.map((c) => c.id);
    assert.ok(idsAll.includes(overdueA));
    assert.ok(idsAll.includes(overdueB));
    assert.ok(!idsAll.includes(freshA));
    assert.ok(!idsAll.includes(settledA));

    // Scoping theo dự án (M22): chỉ thấy claim của projA khi truyền projectId.
    const pendingProjA = await pendingClaims(14, projA);
    const idsProjA = pendingProjA.map((c) => c.id);
    assert.ok(idsProjA.includes(overdueA));
    assert.ok(!idsProjA.includes(overdueB));

    await run(`DELETE FROM claims WHERE id IN (?, ?, ?, ?)`, overdueA, overdueB, freshA, settledA);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
  },
);

test(
  "vòng đời claim: notice→quantified→negotiating→settled/rejected qua settleClaim/rejectClaim",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { settleClaim, rejectClaim } = await import("@/lib/claims");

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM Claim', 'claim-pm@xboss.vn', 'x', 'pm')`,
    );

    const claimId = await insertId(
      `INSERT INTO claims (code, kind, title, notice_date, cause, amount_requested, status)
       VALUES ('CLM-TEST-LIFECYCLE', 'cost', 'Claim vòng đời', '2026-07-01', 'Nguyên nhân', 20000000, 'negotiating')`,
    );

    const settled = await settleClaim({
      claimId,
      amountSettled: 15_000_000,
      daysSettled: null,
      settlementNote: "Thoả thuận 15tr sau đàm phán",
      settledBy: pmId,
    });
    assert.deepEqual(settled, { ok: true });

    const row = await queryOne<{ status: string; amount_settled: number; settled_by: number }>(
      `SELECT status, amount_settled, settled_by FROM claims WHERE id = ?`,
      claimId,
    );
    assert.equal(row?.status, "settled");
    assert.equal(Number(row?.amount_settled), 15_000_000);
    assert.equal(row?.settled_by, pmId);

    // Không chốt/từ chối lại được sau khi đã có quyết định.
    const settleAgain = await settleClaim({
      claimId,
      amountSettled: 10_000_000,
      daysSettled: null,
      settlementNote: null,
      settledBy: pmId,
    });
    assert.ok("error" in settleAgain);

    const claimId2 = await insertId(
      `INSERT INTO claims (code, kind, title, notice_date, cause, days_requested, status)
       VALUES ('CLM-TEST-REJECT', 'eot', 'Claim EOT từ chối', '2026-07-01', 'Nguyên nhân', 7, 'notice')`,
    );
    const rejectNoReason = await rejectClaim({
      claimId: claimId2,
      settlementNote: "",
      settledBy: pmId,
    });
    assert.ok("error" in rejectNoReason);

    const rejected = await rejectClaim({
      claimId: claimId2,
      settlementNote: "Không đủ hồ sơ chứng minh",
      settledBy: pmId,
    });
    assert.deepEqual(rejected, { ok: true });
    const row2 = await queryOne<{ status: string }>(
      `SELECT status FROM claims WHERE id = ?`,
      claimId2,
    );
    assert.equal(row2?.status, "rejected");

    await run(`DELETE FROM claims WHERE id IN (?, ?)`, claimId, claimId2);
    await run(`DELETE FROM users WHERE id = ?`, pmId);
  },
);
