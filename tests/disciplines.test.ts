import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

const YESTERDAY = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "getDisciplineSummary: % tiến độ/trễ/chờ nghiệm thu tính đúng theo hệ, không lẫn hệ khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { getDisciplineSummary } = await import("@/lib/disciplines");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'dien'`);
    const nuoc = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'nuoc'`);
    assert.ok(dien && nuoc, "disciplines seed phải có sẵn từ migration 0005_boq.sql");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test discipline')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stDien = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, discipline_id) VALUES (?, 'TESTDIEN', 'Sheet điện', ?)`,
      towerId,
      dien!.id,
    );
    const stNuoc = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, discipline_id) VALUES (?, 'TESTNUOC', 'Sheet nước', ?)`,
      towerId,
      nuoc!.id,
    );
    const pkgDien = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'D1', 'Nhóm điện')`,
      stDien,
    );
    const pkgNuoc = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'N1', 'Nhóm nước')`,
      stNuoc,
    );

    // Hệ điện: 1 task xong 100% (chờ nghiệm thu), 1 task trễ (quá hạn, chưa xong) → avg 50%.
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'D1,01', 'Task điện xong', 1, 'hoan_thanh')`,
      pkgDien,
    );
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, end_date, status) VALUES (?, 'D1,02', 'Task điện trễ', 0, ?, 'tre')`,
      pkgDien,
      YESTERDAY,
    );

    // Hệ nước: 1 task chưa tới hạn, 30% — không được lẫn vào số của hệ điện.
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, end_date) VALUES (?, 'N1,01', 'Task nước', 0.3, ?)`,
      pkgNuoc,
      TOMORROW,
    );

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('Nhà thầu điện Test')`);
    const contractorId = await insertId(
      `INSERT INTO discipline_contractors (discipline_id, supplier_id, floor_labels, is_primary)
       VALUES (?, ?, ARRAY['T1','T2'], true)`,
      dien!.id,
      supplierId,
    );

    const summaryDien = await getDisciplineSummary("dien");
    assert.ok(summaryDien);
    assert.equal(summaryDien!.totalTasks, 2);
    assert.equal(summaryDien!.progressPercent, 0.5);
    assert.equal(summaryDien!.delayedCount, 1);
    // Task 100% nhưng status vẫn là hoan_thanh (chưa qua bước duyệt nghiệm thu 2 bước) → tính là chờ nghiệm thu.
    assert.equal(summaryDien!.waitingApprovalCount, 1);
    assert.equal(summaryDien!.sheets.length, 1);
    assert.equal(summaryDien!.sheets[0].code, "TESTDIEN");
    assert.equal(summaryDien!.contractors.length, 1);
    assert.equal(summaryDien!.contractors[0].supplierName, "Nhà thầu điện Test");
    assert.deepEqual(summaryDien!.contractors[0].floorLabels, ["T1", "T2"]);
    // ncrOpen đã triển khai từ M3 (0 khi hệ chưa có NCR nào) — budget/drawings/floors vẫn
    // null tới khi M2 (withCost) / M8 / M14 hoàn thành (UI ẩn khi null).
    assert.equal(summaryDien!.ncrOpen, 0);
    assert.equal(summaryDien!.budget, null);

    const summaryNuoc = await getDisciplineSummary("nuoc");
    assert.ok(summaryNuoc);
    assert.equal(summaryNuoc!.totalTasks, 1);
    assert.equal(summaryNuoc!.progressPercent, 0.3);
    assert.equal(summaryNuoc!.delayedCount, 0);
    assert.equal(summaryNuoc!.sheets.length, 1);
    assert.equal(summaryNuoc!.contractors.length, 0);

    assert.equal(await getDisciplineSummary("khong-ton-tai"), null);

    // Dọn dữ liệu test.
    await run(`DELETE FROM discipline_contractors WHERE id = ?`, contractorId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
    await run(`DELETE FROM tasks WHERE package_id IN (?, ?)`, pkgDien, pkgNuoc);
    await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, pkgDien, pkgNuoc);
    await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, stDien, stNuoc);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "getDisciplineSummary: task chờ nghiệm thu (progress 100% nhưng chưa duyệt) được đếm riêng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { getDisciplineSummary } = await import("@/lib/disciplines");

    const pccc = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'pccc'`);
    assert.ok(pccc);

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test discipline 2')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, discipline_id) VALUES (?, 'TESTPCCC', 'Sheet PCCC', ?)`,
      towerId,
      pccc!.id,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'P1', 'Nhóm PCCC')`,
      stId,
    );
    await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'P1,01', 'Task 100% chưa duyệt', 1, 'dang_thi_cong')`,
      pkgId,
    );

    const summary = await getDisciplineSummary("pccc");
    assert.equal(summary!.waitingApprovalCount, 1);

    await run(`DELETE FROM tasks WHERE package_id = ?`, pkgId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
