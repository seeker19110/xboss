import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateCorrespondenceInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateCorrespondenceInput } = await import("@/lib/correspondence");

  const base = {
    code: "CV-001",
    direction: "in" as const,
    kind: "rfi" as const,
    counterparty: "TVGS",
    subject: "Hỏi về chi tiết lắp đặt ống gió tầng 5",
    sentDate: "2026-07-01",
    dueDate: "2026-07-08",
    status: "awaiting" as const,
    taskId: null,
    workPackageId: null,
    drawingId: null,
    note: null,
  };

  assert.equal(validateCorrespondenceInput(base), null);
  assert.match(validateCorrespondenceInput({ ...base, code: "" })!, /số văn bản/i);
  assert.match(validateCorrespondenceInput({ ...base, direction: "xxx" as never })!, /chiều/i);
  assert.match(validateCorrespondenceInput({ ...base, kind: "xxx" as never })!, /loại văn bản/i);
  assert.match(validateCorrespondenceInput({ ...base, counterparty: "" })!, /đối tác/i);
  assert.match(validateCorrespondenceInput({ ...base, subject: "" })!, /trích yếu/i);
  assert.match(validateCorrespondenceInput({ ...base, sentDate: "01/07/2026" })!, /ngày gửi/i);
  assert.match(validateCorrespondenceInput({ ...base, dueDate: "07-08-2026" })!, /hạn phản hồi/i);
  assert.match(
    validateCorrespondenceInput({ ...base, dueDate: "2026-06-01" })!,
    /hạn phản hồi phải sau/i,
  );
  assert.match(validateCorrespondenceInput({ ...base, status: "xxx" as never })!, /trạng thái/i);
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "createReply: nối reply_id đúng + tự chuyển văn bản gốc sang 'replied'",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { createReply, getReplyChain } = await import("@/lib/correspondence");

    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Admin CV', 'admincv-test@test.local', 'x', 'admin')`,
    );
    const originalId = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, due_date, status, created_by)
       VALUES ('RFI-TEST-001', 'in', 'rfi', 'TVGS', 'Hỏi chi tiết lắp đặt', '2026-07-01', '2026-07-08', 'awaiting', ?)`,
      adminId,
    );

    const result = await createReply(
      originalId,
      {
        code: "CV-TEST-REPLY-001",
        direction: "in", // cố ý sai — route/lib phải luôn ép 'out'
        kind: "letter",
        counterparty: "TVGS",
        subject: "Trả lời RFI-TEST-001",
        sentDate: "2026-07-03",
        dueDate: null,
        status: "closed",
        taskId: null,
        workPackageId: null,
        drawingId: null,
        note: null,
      },
      adminId,
    );
    assert.ok("id" in result);
    const replyId = (result as { id: number }).id;

    const reply = await queryOne<{ direction: string; replyId: number; status: string }>(
      `SELECT direction, reply_id AS "replyId", status FROM correspondences WHERE id = ?`,
      replyId,
    );
    assert.equal(reply!.direction, "out"); // luôn 'out' bất kể input truyền gì
    assert.equal(reply!.replyId, originalId);

    const original = await queryOne<{ status: string }>(
      `SELECT status FROM correspondences WHERE id = ?`,
      originalId,
    );
    assert.equal(original!.status, "replied");

    const chain = await getReplyChain(replyId);
    const ids = chain.map((c) => c.id);
    assert.ok(ids.includes(originalId));
    assert.ok(ids.includes(replyId));
    assert.equal(chain.length, 2);

    // Reply vào văn bản không tồn tại → lỗi rõ ràng, không throw.
    const errResult = await createReply(
      999_999_999,
      {
        code: "CV-TEST-NOPE",
        direction: "in",
        kind: "letter",
        counterparty: "TVGS",
        subject: "x",
        sentDate: "2026-07-03",
        dueDate: null,
        status: "awaiting",
        taskId: null,
        workPackageId: null,
        drawingId: null,
        note: null,
      },
      adminId,
    );
    assert.ok("error" in errResult);

    await run(`DELETE FROM correspondences WHERE id = ?`, replyId);
    await run(`DELETE FROM correspondences WHERE id = ?`, originalId);
    await run(`DELETE FROM users WHERE id = ?`, adminId);
  },
);

test(
  "dueCorrespondences: chỉ xuất hiện văn bản 'awaiting' quá hạn phản hồi, tự dọn khi hết điều kiện",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { dueCorrespondences } = await import("@/lib/correspondence");
    const { daysFromTodayISO } = await import("@/lib/date");

    const overdueId = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, due_date, status)
       VALUES ('RFI-TEST-OVERDUE', 'in', 'rfi', 'CĐT', 'RFI quá hạn', ?, ?, 'awaiting')`,
      daysFromTodayISO(-10),
      daysFromTodayISO(-3),
    );
    const notYetId = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, due_date, status)
       VALUES ('RFI-TEST-NOTYET', 'in', 'rfi', 'CĐT', 'RFI chưa tới hạn', ?, ?, 'awaiting')`,
      daysFromTodayISO(-1),
      daysFromTodayISO(5),
    );
    const repliedId = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, due_date, status)
       VALUES ('RFI-TEST-REPLIED', 'in', 'rfi', 'CĐT', 'RFI đã trả lời dù quá hạn', ?, ?, 'replied')`,
      daysFromTodayISO(-10),
      daysFromTodayISO(-3),
    );

    const list = await dueCorrespondences();
    const ids = list.map((c) => c.id);
    assert.ok(ids.includes(overdueId));
    assert.ok(!ids.includes(notYetId));
    assert.ok(!ids.includes(repliedId));

    await run(`UPDATE correspondences SET status = 'replied' WHERE id = ?`, overdueId);
    const listAfter = await dueCorrespondences();
    assert.ok(!listAfter.map((c) => c.id).includes(overdueId));

    await run(`DELETE FROM correspondences WHERE id IN (?, ?, ?)`, overdueId, notYetId, repliedId);
  },
);

test(
  "listCorrespondences: filter status/kind/q hoạt động đúng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listCorrespondences } = await import("@/lib/correspondence");

    const rfiId = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, status)
       VALUES ('RFI-TEST-FILTER', 'in', 'rfi', 'TVGS', 'Yêu cầu làm rõ bản vẽ điện', '2026-07-01', 'awaiting')`,
    );
    const letterId = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, status)
       VALUES ('CV-TEST-FILTER', 'out', 'letter', 'Tổng thầu', 'Thông báo tiến độ tuần', '2026-07-02', 'closed')`,
    );

    const rfiOnly = await listCorrespondences({ kind: "rfi" });
    assert.ok(rfiOnly.some((c) => c.id === rfiId));
    assert.ok(!rfiOnly.some((c) => c.id === letterId));

    const awaitingOnly = await listCorrespondences({ status: "awaiting" });
    assert.ok(awaitingOnly.some((c) => c.id === rfiId));
    assert.ok(!awaitingOnly.some((c) => c.id === letterId));

    const searched = await listCorrespondences({ q: "bản vẽ điện" });
    assert.ok(searched.some((c) => c.id === rfiId));
    assert.ok(!searched.some((c) => c.id === letterId));

    await run(`DELETE FROM correspondences WHERE id IN (?, ?)`, rfiId, letterId);
  },
);

test(
  "listCorrespondences/getCorrespondence/createReply: scoped đúng theo project_id (M22), không lẫn dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listCorrespondences, getCorrespondence, createReply } =
      await import("@/lib/correspondence");

    const p1 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA CV 1', 'PJT-CV1')`);
    const p2 = await insertId(`INSERT INTO projects (name, code) VALUES ('DA CV 2', 'PJT-CV2')`);
    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('CV Scope', 'cv-scope@xboss.vn', 'x', 'admin')`,
    );
    const cv1 = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, status, project_id)
       VALUES ('RFI-SCOPE-1', 'in', 'rfi', 'TVGS', 'RFI DA1', '2026-07-01', 'awaiting', ?)`,
      p1,
    );
    const cv2 = await insertId(
      `INSERT INTO correspondences (code, direction, kind, counterparty, subject, sent_date, status, project_id)
       VALUES ('RFI-SCOPE-2', 'in', 'rfi', 'TVGS', 'RFI DA2', '2026-07-01', 'awaiting', ?)`,
      p2,
    );

    const list1 = await listCorrespondences({ projectId: p1 });
    assert.ok(list1.some((c) => c.id === cv1));
    assert.ok(!list1.some((c) => c.id === cv2));

    assert.ok((await getCorrespondence(cv1, p1)) != null);
    assert.equal(await getCorrespondence(cv2, p1), undefined); // sai dự án → không thấy

    // Reply vào văn bản không thuộc dự án đang chọn → lỗi, không tạo được.
    const wrongProjectReply = await createReply(
      cv2,
      {
        code: "CV-SCOPE-REPLY",
        direction: "in",
        kind: "letter",
        counterparty: "TVGS",
        subject: "Trả lời sai dự án",
        sentDate: "2026-07-03",
        dueDate: null,
        status: "awaiting",
        taskId: null,
        workPackageId: null,
        drawingId: null,
        note: null,
      },
      adminId,
      p1,
    );
    assert.ok("error" in wrongProjectReply);

    // Reply đúng dự án → thành công, kế thừa project_id từ văn bản gốc.
    const okReply = await createReply(
      cv1,
      {
        code: "CV-SCOPE-REPLY-OK",
        direction: "in",
        kind: "letter",
        counterparty: "TVGS",
        subject: "Trả lời đúng dự án",
        sentDate: "2026-07-03",
        dueDate: null,
        status: "awaiting",
        taskId: null,
        workPackageId: null,
        drawingId: null,
        note: null,
      },
      adminId,
      p1,
    );
    assert.ok("id" in okReply);
    const replyId = (okReply as { id: number }).id;

    await run(`DELETE FROM correspondences WHERE id IN (?, ?, ?)`, cv1, cv2, replyId);
    await run(`DELETE FROM users WHERE id = ?`, adminId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
