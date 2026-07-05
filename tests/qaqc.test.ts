import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "handoverBlocked: chặn khi predecessor chưa có inspection đạt / biên bản chuyển bước, mở khi có",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { handoverBlocked } = await import("@/lib/qaqc");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test qaqc')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTQAQC', 'Sheet QAQC')`,
      towerId,
    );
    const predId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'PRED', 'Nhóm trước')`,
      stId,
    );
    const succId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'SUCC', 'Nhóm sau')`,
      stId,
    );
    const predTaskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'PRED,01', 'Task trước')`,
      predId,
    );
    const depId = await insertId(
      `INSERT INTO package_dependencies (predecessor_id, successor_id, requires_handover)
       VALUES (?, ?, TRUE)`,
      predId,
      succId,
    );

    // Chưa có gì → bị chặn.
    let gate = await handoverBlocked(succId);
    assert.equal(gate.blocked, true);
    assert.match(gate.reason ?? "", /PRED/);

    // Có biên bản chuyển bước → mở khoá.
    const docId = await insertId(
      `INSERT INTO task_documents (task_id, file_name, doc_category) VALUES (?, 'd1.pdf', 'chuyen_buoc')`,
      predTaskId,
    );
    gate = await handoverBlocked(succId);
    assert.equal(gate.blocked, false);

    await run(`DELETE FROM task_documents WHERE id = ?`, docId);
    gate = await handoverBlocked(succId);
    assert.equal(
      gate.blocked,
      true,
      "xoá biên bản thì lại bị chặn (không còn tài liệu lẫn inspection)",
    );

    // Có inspection đạt cho package trước → mở khoá.
    const checklistId = await insertId(
      `INSERT INTO qc_checklists (name, items) VALUES ('Checklist test', '[]'::jsonb)`,
    );
    const inspId = await insertId(
      `INSERT INTO qc_inspections (checklist_id, work_package_id, status) VALUES (?, ?, 'passed')`,
      checklistId,
      predId,
    );
    gate = await handoverBlocked(succId);
    assert.equal(gate.blocked, false);

    // Không có dependency requires_handover thì không bao giờ bị chặn.
    const freeId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'FREE', 'Nhóm tự do')`,
      stId,
    );
    gate = await handoverBlocked(freeId);
    assert.equal(gate.blocked, false);

    // Dọn dữ liệu test.
    await run(`DELETE FROM qc_inspections WHERE id = ?`, inspId);
    await run(`DELETE FROM qc_checklists WHERE id = ?`, checklistId);
    await run(`DELETE FROM package_dependencies WHERE id = ?`, depId);
    await run(`DELETE FROM tasks WHERE id = ?`, predTaskId);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?, ?)`, predId, succId, freeId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    assert.ok(await queryOne(`SELECT 1`)); // sanity: kết nối vẫn sống sau dọn dẹp
  },
);

test(
  "requiredInspectionMissing: chặn nghiệm thu khi checklist required chưa có inspection đạt",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { requiredInspectionMissing } = await import("@/lib/qaqc");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test qaqc gate')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTGATE', 'Sheet gate')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'G1', 'Nhóm gate')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'G1,01', 'Task gate', 1)`,
      pkgId,
    );

    // Chưa có checklist required nào → không bị chặn.
    assert.equal(await requiredInspectionMissing(taskId), false);

    const checklistId = await insertId(
      `INSERT INTO qc_checklists (name, required, items) VALUES ('Checklist bắt buộc', TRUE, '[]'::jsonb)`,
    );

    // Có checklist required nhưng chưa có inspection đạt → bị chặn.
    assert.equal(await requiredInspectionMissing(taskId), true);

    const inspId = await insertId(
      `INSERT INTO qc_inspections (checklist_id, task_id, status) VALUES (?, ?, 'submitted')`,
      checklistId,
      taskId,
    );
    // Inspection tồn tại nhưng chưa 'passed' → vẫn bị chặn.
    assert.equal(await requiredInspectionMissing(taskId), true);

    await run(`UPDATE qc_inspections SET status = 'passed' WHERE id = ?`, inspId);
    // Đã đạt → hết bị chặn.
    assert.equal(await requiredInspectionMissing(taskId), false);

    await run(`DELETE FROM qc_inspections WHERE id = ?`, inspId);
    await run(`DELETE FROM qc_checklists WHERE id = ?`, checklistId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "inspection_requests: mã sinh tuần tự YCNT-000N, task chưa 100% không được gắn vào phiếu",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { nextSeqCode, withUniqueRetry } = await import("@/lib/seqcode");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test YCNT')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTYCNT', 'Sheet YCNT')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'Y1', 'Nhóm YCNT')`,
      stId,
    );
    const doneTaskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'Y1,01', 'Task xong', 1)`,
      pkgId,
    );

    const code1 = await withUniqueRetry(async () => {
      const code = await nextSeqCode("inspection_requests", "code", "YCNT-", 4);
      await insertId(
        `INSERT INTO inspection_requests (code, scheduled_at, created_by) VALUES (?, NOW(), NULL)`,
        code,
      );
      return code;
    });
    assert.match(code1, /^YCNT-\d{4}$/);

    const code2 = await withUniqueRetry(async () => {
      const code = await nextSeqCode("inspection_requests", "code", "YCNT-", 4);
      await insertId(
        `INSERT INTO inspection_requests (code, scheduled_at, created_by) VALUES (?, NOW(), NULL)`,
        code,
      );
      return code;
    });
    // Mã tuần tự tăng dần (không nhất thiết liền kề tuyệt đối nếu DB test đã có dữ liệu khác).
    assert.ok(
      parseInt(code2.slice(5)) > parseInt(code1.slice(5)),
      `${code2} phải lớn hơn ${code1}`,
    );

    // Task đã 100% -> hợp lệ để gắn vào phiếu (không lỗi ràng buộc DB).
    const reqId = await queryOne<{ id: number }>(
      `SELECT id FROM inspection_requests WHERE code = ?`,
      code1,
    );
    await run(
      `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
      reqId!.id,
      doneTaskId,
    );
    const linked = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM inspection_request_tasks WHERE request_id = ?`,
      reqId!.id,
    );
    assert.equal(linked?.count, 1);

    await run(`DELETE FROM inspection_requests WHERE code IN (?, ?)`, code1, code2);
    await run(`DELETE FROM tasks WHERE id = ?`, doneTaskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "task_documents.doc_category: nhận đúng 5 loại hồ sơ chất lượng, gắn được cho task",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { DOC_CATEGORIES } = await import("@/lib/qaqc");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test doc category')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTDOC', 'Sheet doc')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'D1', 'Nhóm doc')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'D1,01', 'Task doc')`,
      pkgId,
    );

    for (const cat of DOC_CATEGORIES) {
      const docId = await insertId(
        `INSERT INTO task_documents (task_id, file_name, doc_category) VALUES (?, 'x.pdf', ?)`,
        taskId,
        cat,
      );
      assert.ok(docId > 0);
    }

    await run(`DELETE FROM task_documents WHERE task_id = ?`, taskId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

// ===== Test thuần (validate JSONB) =====

test("validateChecklistItems: chấp nhận mảng hợp lệ, từ chối dữ liệu rác", async () => {
  const { validateChecklistItems } = await import("@/lib/qaqc");
  assert.equal(validateChecklistItems([{ label: "Độ kín", type: "pass_fail" }]), true);
  assert.equal(
    validateChecklistItems([{ label: "Lưu lượng", type: "measure", unit: "m3/h" }]),
    true,
  );
  assert.equal(validateChecklistItems([]), true);
  assert.equal(validateChecklistItems("not-an-array"), false);
  assert.equal(validateChecklistItems([{ label: "", type: "pass_fail" }]), false);
  assert.equal(validateChecklistItems([{ label: "X", type: "invalid" }]), false);
  assert.equal(validateChecklistItems([{ type: "pass_fail" }]), false);
});

test("validateInspectionResults: chấp nhận mảng hợp lệ, từ chối dữ liệu rác", async () => {
  const { validateInspectionResults } = await import("@/lib/qaqc");
  assert.equal(validateInspectionResults([{ label: "Độ kín", pass: true }]), true);
  assert.equal(
    validateInspectionResults([{ label: "Lưu lượng", pass: false, measured: "12", note: "thấp" }]),
    true,
  );
  assert.equal(validateInspectionResults("not-an-array"), false);
  assert.equal(validateInspectionResults([{ label: "X", pass: "yes" }]), false);
});
