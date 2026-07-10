import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====
// Seed 2 hệ (dùng danh mục disciplines đã seed sẵn: ket_cau/xay_to) × 1 sheet mỗi hệ ×
// vài nhóm việc/task + 1 dependency tạo đường găng — kiểm `?he=` lọc đúng, critical/float
// khớp computeCpm chạy tay, delayed/delayPareto đếm đúng theo delay_reason.

test(
  "getScheduleControlData: lọc theo hệ, đường găng khớp computeCpm, đếm trễ/Pareto đúng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne, daysFromTodayISO } = await import("@/lib/db");
    const { computeCpm } = await import("@/lib/cpm");
    const { getScheduleControlData } = await import("@/lib/schedule-control");

    const ketCau = await queryOne<{ id: number }>(
      `SELECT id FROM disciplines WHERE code = 'ket_cau'`,
    );
    const xayTo = await queryOne<{ id: number }>(
      `SELECT id FROM disciplines WHERE code = 'xay_to'`,
    );
    assert.ok(ketCau && xayTo, "cần disciplines seed sẵn ket_cau/xay_to");

    // Hệ A (ket_cau): sheet + 3 nhóm việc nối chuỗi A→B→C tạo đường găng.
    const sheetAId = await insertId(
      `INSERT INTO sheet_types (code, name, slug, discipline_id) VALUES ('SC-A', 'Sheet SC hệ A', 'sc-a', ?)`,
      ketCau!.id,
    );
    const wpAId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('SC-A-1', 'Nhóm A1', ?, '1F', ?, ?, 0.5)`,
      sheetAId,
      daysFromTodayISO(-10),
      daysFromTodayISO(-5),
    );
    const wpBId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('SC-A-2', 'Nhóm A2', ?, '1F', ?, ?, 0.2)`,
      sheetAId,
      daysFromTodayISO(-5),
      daysFromTodayISO(2),
    );
    const wpCId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('SC-A-3', 'Nhóm A3', ?, '1F', ?, ?, 0)`,
      sheetAId,
      daysFromTodayISO(2),
      daysFromTodayISO(6),
    );
    // Nhóm rời (không phụ thuộc) — không nằm trên đường găng. Ngày nằm gọn trong khoảng
    // chuỗi A→B→C (không kéo dài hơn) để không làm lệch "mốc cuối dự án" (projectEnd)
    // dùng chung cho backward pass của computeCpm — xem ghi chú ở lib/cpm.ts: nút cô lập
    // vẫn tham gia forward/backward pass toàn đồ thị dù không thuộc cùng chuỗi phụ thuộc.
    const wpDId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('SC-A-4', 'Nhóm A4 rời', ?, '1F', ?, ?, 0)`,
      sheetAId,
      daysFromTodayISO(-10),
      daysFromTodayISO(-10),
    );
    const dep1 = await insertId(
      `INSERT INTO package_dependencies (predecessor_id, successor_id) VALUES (?, ?)`,
      wpAId,
      wpBId,
    );
    const dep2 = await insertId(
      `INSERT INTO package_dependencies (predecessor_id, successor_id) VALUES (?, ?)`,
      wpBId,
      wpCId,
    );

    // Hệ B (xay_to): sheet + 1 nhóm riêng, không liên quan gì đến hệ A.
    const sheetBId = await insertId(
      `INSERT INTO sheet_types (code, name, slug, discipline_id) VALUES ('SC-B', 'Sheet SC hệ B', 'sc-b', ?)`,
      xayTo!.id,
    );
    const wpEId = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('SC-B-1', 'Nhóm B1', ?, '2F', ?, ?, 0.3)`,
      sheetBId,
      daysFromTodayISO(-10),
      daysFromTodayISO(-3),
    );

    // Task trễ: 2 task hệ A (lý do khác nhau), 1 task hệ B (không lọt khi lọc he=ket_cau).
    const taskA1 = await insertId(
      `INSERT INTO tasks (code, name, package_id, status, start_date, end_date, progress_percent, delay_reason)
       VALUES ('SC-T-A1', 'Task trễ A1', ?, 'dang_thi_cong', ?, ?, 0.3, 'thieu_vat_tu')`,
      wpAId,
      daysFromTodayISO(-10),
      daysFromTodayISO(-2),
    );
    const taskA2 = await insertId(
      `INSERT INTO tasks (code, name, package_id, status, start_date, end_date, progress_percent, delay_reason)
       VALUES ('SC-T-A2', 'Task trễ A2', ?, 'dang_thi_cong', ?, ?, 0.1, 'thieu_vat_tu')`,
      wpBId,
      daysFromTodayISO(-8),
      daysFromTodayISO(-1),
    );
    const taskA3 = await insertId(
      `INSERT INTO tasks (code, name, package_id, status, start_date, end_date, progress_percent, delay_reason)
       VALUES ('SC-T-A3', 'Task trễ A3 chưa gán lý do', ?, 'dang_thi_cong', ?, ?, 0, NULL)`,
      wpCId,
      daysFromTodayISO(-6),
      daysFromTodayISO(-1),
    );
    const taskB1 = await insertId(
      `INSERT INTO tasks (code, name, package_id, status, start_date, end_date, progress_percent, delay_reason)
       VALUES ('SC-T-B1', 'Task trễ B1', ?, 'dang_thi_cong', ?, ?, 0.2, 'doi_thiet_ke')`,
      wpEId,
      daysFromTodayISO(-6),
      daysFromTodayISO(-1),
    );

    try {
      // ── Không lọc: cả 2 hệ đều xuất hiện ──
      const all = await getScheduleControlData(null);
      const allDelayedCodes = all.delayed.map((t) => t.code);
      assert.ok(allDelayedCodes.includes("SC-T-A1"));
      assert.ok(allDelayedCodes.includes("SC-T-B1"));

      // ── Lọc hệ A (ket_cau): task hệ B không lọt kết quả ──
      const filtered = await getScheduleControlData(ketCau!.id);
      const filteredCodes = filtered.delayed.map((t) => t.code);
      assert.ok(filteredCodes.includes("SC-T-A1"));
      assert.ok(filteredCodes.includes("SC-T-A2"));
      assert.ok(filteredCodes.includes("SC-T-A3"));
      assert.ok(!filteredCodes.includes("SC-T-B1"));

      // ── Đường găng/float khớp computeCpm chạy tay trên cùng input (chuỗi A→B→C) ──
      const manual = computeCpm(
        [
          { id: wpAId, duration: 6 },
          { id: wpBId, duration: 8 },
          { id: wpCId, duration: 5 },
          { id: wpDId, duration: 1 },
        ],
        [
          { id: dep1, predecessorId: wpAId, successorId: wpBId },
          { id: dep2, predecessorId: wpBId, successorId: wpCId },
        ],
      );
      const criticalIds = filtered.critical.map((c) => c.id).sort();
      assert.deepEqual(criticalIds, [...manual.criticalNodes].sort());
      assert.ok(criticalIds.includes(wpAId) && criticalIds.includes(wpBId) && criticalIds.includes(wpCId));
      assert.ok(!criticalIds.includes(wpDId)); // nhóm rời không có phụ thuộc → không trên đường găng
      const rowA = filtered.critical.find((c) => c.id === wpAId);
      assert.equal(rowA?.float, manual.float.get(wpAId));

      // ── Pareto: thieu_vat_tu = 2, chưa gán lý do = 1, giảm dần rồi tới "chưa gán" ──
      const vatTuRow = filtered.delayPareto.find((r) => r.slug === "thieu_vat_tu");
      assert.equal(vatTuRow?.count, 2);
      const noneRow = filtered.delayPareto.find((r) => r.slug === null);
      assert.equal(noneRow?.count, 1);
      assert.equal(noneRow, filtered.delayPareto[filtered.delayPareto.length - 1]);

      // ── he không tồn tại → resolveDisciplineId trả -1 → rỗng, không lỗi ──
      const empty = await getScheduleControlData(-1);
      assert.equal(empty.critical.length, 0);
      assert.equal(empty.delayed.length, 0);
    } finally {
      await run(`DELETE FROM tasks WHERE id IN (?, ?, ?, ?)`, taskA1, taskA2, taskA3, taskB1);
      await run(`DELETE FROM package_dependencies WHERE id IN (?, ?)`, dep1, dep2);
      await run(`DELETE FROM work_packages WHERE id IN (?, ?, ?, ?, ?)`, wpAId, wpBId, wpCId, wpDId, wpEId);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, sheetAId, sheetBId);
    }
  },
);
