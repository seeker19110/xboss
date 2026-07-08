import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateProposalInput: kind hợp lệ, title bắt buộc, amount ≥ 0", async () => {
  const { validateProposalInput } = await import("@/lib/proposals");

  const base = {
    kind: "advance" as const,
    title: "Tạm ứng đợt 2 thầu phụ điện",
    amount: 50_000_000,
    contractId: null,
    materialId: null,
    reason: null,
  };

  assert.equal(validateProposalInput(base), null);
  assert.equal(validateProposalInput({ ...base, amount: null }), null);
  assert.equal(validateProposalInput({ ...base, kind: "other", amount: null }), null);
  assert.match(validateProposalInput({ ...base, kind: "xxx" as never })!, /loại đề xuất/i);
  assert.match(validateProposalInput({ ...base, title: "" })!, /tiêu đề/i);
  assert.match(validateProposalInput({ ...base, amount: -1 })!, /giá trị/i);
  assert.match(validateProposalInput({ ...base, amount: NaN })!, /giá trị/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "proposals: vòng đời draft→submitted→approved/rejected, tạo payment_bills đúng theo checkbox, pendingProposalsOver",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne, query } = await import("@/lib/db");
    const { decideProposal, pendingProposalsOver, nextProposalCode } =
      await import("@/lib/proposals");
    const { daysFromTodayISO, todayISO } = await import("@/lib/date");

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM Proposal', 'proposal-pm@xboss.vn', 'x', 'pm')`,
    );
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, party_name, value) VALUES ('HD-DX-01', 'giao_thau', 'HĐ test đề xuất', 'Thầu phụ A', 100000000)`,
    );

    const code1 = await nextProposalCode();
    assert.match(code1, /^DX-\d{4}$/);

    // Đề xuất tạm ứng gắn HĐ, đã trình quá 5 ngày → xuất hiện trong pendingProposalsOver.
    const p1 = await insertId(
      `INSERT INTO proposals (code, kind, title, amount, contract_id, status, submitted_at, requested_by)
       VALUES (?, 'advance', 'Tạm ứng test', 30000000, ?, 'submitted', ?, ?)`,
      code1,
      contractId,
      daysFromTodayISO(-6),
      pmId,
    );
    const pending = await pendingProposalsOver();
    assert.ok(pending.some((x) => x.id === p1));

    // Duyệt kèm createBill=true → tạo payment_bills gắn đúng HĐ, type='advance'.
    const r1 = await decideProposal({
      proposalId: p1,
      decision: "approved",
      createBill: true,
      decidedBy: pmId,
    });
    assert.ok(typeof r1 !== "string");
    assert.ok(r1.billId != null);
    const bill = await queryOne<{
      type: string;
      amount: number;
      contract_id: number;
      responsible: string;
    }>(`SELECT type, amount, contract_id, responsible FROM payment_bills WHERE id = ?`, r1.billId);
    assert.equal(bill?.type, "advance");
    assert.equal(Number(bill?.amount), 30000000);
    assert.equal(bill?.contract_id, contractId);
    assert.equal(bill?.responsible, "Thầu phụ A");

    const p1Row = await queryOne<{ status: string; decided_by: number }>(
      `SELECT status, decided_by FROM proposals WHERE id = ?`,
      p1,
    );
    assert.equal(p1Row?.status, "approved");
    assert.equal(p1Row?.decided_by, pmId);

    // Đã quyết → biến khỏi pendingProposalsOver; quyết lại lần nữa bị chặn.
    assert.ok(!(await pendingProposalsOver()).some((x) => x.id === p1));
    const again = await decideProposal({
      proposalId: p1,
      decision: "approved",
      decidedBy: pmId,
    });
    assert.equal(typeof again, "string");

    // Duyệt KHÔNG tick createBill → không tạo phiếu.
    const p2 = await insertId(
      `INSERT INTO proposals (code, kind, title, amount, contract_id, status, submitted_at, requested_by)
       VALUES ('DX-9998', 'payment', 'Thanh toán test', 20000000, ?, 'submitted', ?, ?)`,
      contractId,
      todayISO(),
      pmId,
    );
    const billsBefore = await query(
      `SELECT id FROM payment_bills WHERE contract_id = ?`,
      contractId,
    );
    const r2 = await decideProposal({
      proposalId: p2,
      decision: "approved",
      createBill: false,
      decidedBy: pmId,
    });
    assert.ok(typeof r2 !== "string" && r2.billId == null);
    const billsAfter = await query(
      `SELECT id FROM payment_bills WHERE contract_id = ?`,
      contractId,
    );
    assert.equal(billsAfter.length, billsBefore.length);

    // Từ chối bắt buộc có lý do; có lý do thì ghi reject_reason.
    const p3 = await insertId(
      `INSERT INTO proposals (code, kind, title, status, submitted_at, requested_by)
       VALUES ('DX-9999', 'other', 'Đề xuất khác', 'submitted', ?, ?)`,
      todayISO(),
      pmId,
    );
    const noReason = await decideProposal({
      proposalId: p3,
      decision: "rejected",
      decidedBy: pmId,
    });
    assert.equal(typeof noReason, "string");
    const r3 = await decideProposal({
      proposalId: p3,
      decision: "rejected",
      rejectReason: "Chưa đủ hồ sơ",
      decidedBy: pmId,
    });
    assert.ok(typeof r3 !== "string");
    const p3Row = await queryOne<{ status: string; reject_reason: string }>(
      `SELECT status, reject_reason FROM proposals WHERE id = ?`,
      p3,
    );
    assert.equal(p3Row?.status, "rejected");
    assert.equal(p3Row?.reject_reason, "Chưa đủ hồ sơ");

    await run(`DELETE FROM payment_bills WHERE contract_id = ?`, contractId);
    await run(`DELETE FROM proposals WHERE id IN (?, ?, ?)`, p1, p2, p3);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
    await run(`DELETE FROM users WHERE id = ?`, pmId);
  },
);

test(
  "listProposals/getProposal: scoped đúng theo project_id (M22), không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listProposals, getProposal } = await import("@/lib/proposals");

    const p1 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Đề xuất 1', 'PJT-DX1')`,
    );
    const p2 = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Đề xuất 2', 'PJT-DX2')`,
    );
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Proposal Scope', 'proposal-scope@xboss.vn', 'x', 'engineer')`,
    );
    const dx1 = await insertId(
      `INSERT INTO proposals (code, kind, title, requested_by, project_id) VALUES ('DX-8001', 'other', 'Đề xuất DA1', ?, ?)`,
      userId,
      p1,
    );
    const dx2 = await insertId(
      `INSERT INTO proposals (code, kind, title, requested_by, project_id) VALUES ('DX-8002', 'other', 'Đề xuất DA2', ?, ?)`,
      userId,
      p2,
    );

    const list1 = await listProposals({ projectId: p1 });
    assert.ok(list1.some((p) => p.id === dx1));
    assert.ok(!list1.some((p) => p.id === dx2));

    assert.ok((await getProposal(dx1, p1)) != null);
    assert.equal(await getProposal(dx2, p1), undefined); // sai dự án → không thấy

    await run(`DELETE FROM proposals WHERE id IN (?, ?)`, dx1, dx2);
    await run(`DELETE FROM users WHERE id = ?`, userId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
