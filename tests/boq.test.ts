import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { makeBoq } from "@/lib/boq";
import { parseBoqWorkbook } from "@/lib/boq-import";

// Dựng workbook giả lập đúng cấu trúc file "Bảng khối lượng thanh toán" thật (3 dòng
// tiêu đề gộp ô, cột STT phân cấp La Mã/chữ/số, không có cột mã riêng) — không dùng
// file khách hàng thật để tránh đưa số liệu hợp đồng vào git.
function fakeBoqWorkbook(): XLSX.WorkBook {
  const aoa: unknown[][] = [
    ["BẢNG KHỐI LƯỢNG THANH TOÁN"],
    ["Công trình: Test"],
    ["Gói thầu: THI CÔNG HỆ THỐNG ĐIỀU HÒA KHÔNG KHÍ VÀ THÔNG GIÓ"],
    [],
    [],
    [
      "STT",
      "DIỄN GIẢI",
      "ĐVT",
      "Khối lượng",
      null,
      null,
      "VẬT TƯ",
      "NHÂN CÔNG",
      "ĐƠN GIÁ TỔNG",
      "THÀNH TIỀN THÁP A",
    ],
    [null, null, null, "Tháp A", "Tháp B", "Tổng"],
    [],
    ["I", "HẠNG MỤC THEO HỢP ĐỒNG/PLHĐ"],
    ["A", "PHẦN HẦM"],
    [1, "Quạt thông gió"],
    [null, "Quạt hút khói EAF-01", "Bộ", 2, 0, 2, 500000, 500000, 1000000, 2000000],
    [null, "Quạt hút khói EAF-02 (chỉ Tháp B)", "Bộ", 0, 2, 2, 500000, 500000, 1000000, 0],
    [null, "Quạt cấp khí FAF-01", "Bộ", 3, 0, 3, 400000, 400000, 800000, 2400000],
    ["II", "HẠNG MỤC NGOÀI HỢP ĐỒNG/PLHĐ ĐÃ KÝ"],
    [1, "Đợt phát sinh 1"],
    [null, "Dây điện phát sinh", "Mét", 100, 0, 100, 5000, 0, 5000, 500000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return { SheetNames: ["BOQ"], Sheets: { BOQ: ws } };
}

test("makeBoq: sheet có mapping tĩnh → prefix là slug viết hoa", () => {
  assert.equal(makeBoq("OGTĐ", "A1"), "OGTD-A1");
  assert.equal(makeBoq("ODNN Zone 1", "A1"), "ODNN1-A1");
});

test("makeBoq: mã hàng có dấu phẩy → đổi thành gạch nối", () => {
  assert.equal(makeBoq("OGCH", "OGCH4,06"), "OGCH-OGCH4-06");
  assert.equal(makeBoq("ODNN Zone 1", "A1,r7"), "ODNN1-A1-r7");
});

test("makeBoq: sheet không có mapping tĩnh → giữ nguyên mã sheet viết hoa", () => {
  assert.equal(makeBoq("dientu", "B2"), "DIENTU-B2");
});

test("parseBoqWorkbook: chỉ lấy dòng hạng mục phần I, KL Tháp A, dừng ở ranh giới phần II", () => {
  const result = parseBoqWorkbook(fakeBoqWorkbook());

  assert.equal(result.detectedDisciplineCode, "acmv");
  assert.equal(result.skippedTowerBOnly, 1); // "EAF-02 (chỉ Tháp B)"
  assert.equal(result.rows.length, 2); // EAF-01 + FAF-01, không lấy dòng phát sinh ở phần II

  assert.equal(result.rows[0].name, "Quạt hút khói EAF-01");
  assert.equal(result.rows[0].unit, "Bộ");
  assert.equal(result.rows[0].qtyContract, 2);
  assert.equal(result.rows[0].unitPrice, 1000000);

  assert.equal(result.rows[1].name, "Quạt cấp khí FAF-01");
  assert.equal(result.rows[1].qtyContract, 3);
  assert.equal(result.rows[1].unitPrice, 800000);

  assert.ok(!result.rows.some((r) => r.name.includes("phát sinh")));
});

test("parseBoqWorkbook: không tìm thấy dòng tiêu đề STT/DIỄN GIẢI → báo warning, rows rỗng", () => {
  const ws = XLSX.utils.aoa_to_sheet([["không phải file BOQ"], ["dòng khác"]]);
  const result = parseBoqWorkbook({ SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } });
  assert.equal(result.rows.length, 0);
  assert.match(result.warnings[0], /STT\/DIỄN GIẢI/);
});

// ===== Test tích hợp import BOQ (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "previewBoqImport/commitBoqImport: sinh mã tuần tự theo hệ, phát hiện trùng mã, ghi đúng KL/đơn giá",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query, queryOne, insertId } = await import("@/lib/db");
    const { previewBoqImport, commitBoqImport } = await import("@/lib/boq-import");

    const discipline = await queryOne<{ id: number }>(
      `SELECT id FROM disciplines WHERE code = 'acmv'`,
    );
    const disciplineId = discipline!.id;

    const parsed = parseBoqWorkbook(fakeBoqWorkbook());
    assert.equal(parsed.rows.length, 2);

    // Chèn sẵn 1 dòng để mã tuần tự phải tiếp nối từ đây (không bắt đầu lại từ 0001).
    const existingId = await insertId(
      `INSERT INTO boq_items (code, name, unit) VALUES ('ACMV-0001', 'Đã có sẵn', 'm')`,
    );

    const preview = await previewBoqImport(parsed.rows, "acmv");
    assert.equal(preview.length, 2);
    assert.equal(preview[0].code, "ACMV-0002");
    assert.equal(preview[1].code, "ACMV-0003");
    assert.ok(preview.every((p) => p.action === "add"));

    const result = await commitBoqImport(parsed.rows, disciplineId, "acmv");
    assert.equal(result.inserted, 2);
    assert.equal(result.skipped, 0);

    const rows = await query<{ code: string; qty_contract: number; unit_price: number }>(
      `SELECT code, qty_contract, unit_price FROM boq_items WHERE code IN ('ACMV-0002', 'ACMV-0003') ORDER BY code`,
    );
    assert.equal(rows.length, 2);
    assert.equal(Number(rows[0].qty_contract), 2);
    assert.equal(Number(rows[0].unit_price), 1000000);
    assert.equal(Number(rows[1].qty_contract), 3);
    assert.equal(Number(rows[1].unit_price), 800000);

    // Mã kế tiếp dự kiến (ACMV-0004) trùng BOQCODE của 1 task khác bảng → previewBoqImport
    // báo lỗi thay vì âm thầm ghi đè (boqTakenBy xuyên toàn hệ thống, không chỉ boq_items).
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test boq import')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTBOQIMPORT', 'Sheet test')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'X1', 'Nhóm test')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'X1,01', 'Task chiếm chỗ', 'ACMV-0004')`,
      pkgId,
    );

    const preview2 = await previewBoqImport(parsed.rows.slice(0, 1), "acmv");
    assert.equal(preview2[0].code, "ACMV-0004");
    assert.equal(preview2[0].action, "error");
    assert.match(preview2[0].reason ?? "", /đã được dùng/);

    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM boq_items WHERE id = ?`, existingId);
    await run(`DELETE FROM boq_items WHERE code IN ('ACMV-0002', 'ACMV-0003')`);
  },
);

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "boqTakenBy: mã trùng ở tasks/work_packages/materials đều bị phát hiện xuyên bảng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqTakenBy } = await import("@/lib/boq");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test boq')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTBOQ', 'Sheet test boq')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, boq_code) VALUES (?, 'B1', 'Nhóm test', 'BOQ-PKG-01')`,
      stId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'B1,01', 'Task test', 'BOQ-TASK-01')`,
      pkgId,
    );
    const materialId = await insertId(
      `INSERT INTO materials (name, boq_code) VALUES ('Vật tư test', 'BOQ-MAT-01')`,
    );

    // Chưa ai dùng → null.
    assert.equal(await boqTakenBy("BOQ-CHUA-DUNG"), null);

    // Trùng với task ở bảng khác (work_packages) → phát hiện.
    const takenByTask = await boqTakenBy("BOQ-TASK-01");
    assert.match(takenByTask ?? "", /task .*Task test/);

    const takenByPkg = await boqTakenBy("BOQ-PKG-01");
    assert.match(takenByPkg ?? "", /nhóm .*Nhóm test/);

    const takenByMaterial = await boqTakenBy("BOQ-MAT-01");
    assert.match(takenByMaterial ?? "", /vật tư .*Vật tư test/);

    // Loại trừ chính bản ghi đang sửa → không báo trùng với chính nó.
    assert.equal(await boqTakenBy("BOQ-TASK-01", { table: "tasks", id: taskId }), null);
    assert.equal(await boqTakenBy("BOQ-PKG-01", { table: "work_packages", id: pkgId }), null);
    assert.equal(await boqTakenBy("BOQ-MAT-01", { table: "materials", id: materialId }), null);

    // exclude không khớp record đang trùng → vẫn báo trùng như thường.
    assert.match(
      (await boqTakenBy("BOQ-TASK-01", { table: "tasks", id: taskId + 999 })) ?? "",
      /task/,
    );

    // Dọn dữ liệu test.
    await run(`DELETE FROM materials WHERE id = ?`, materialId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "boqTakenBy: mã trùng với dòng boq_items cũng bị phát hiện + loại trừ chính nó khi sửa",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqTakenBy } = await import("@/lib/boq");

    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit) VALUES ('BOQ-ITEM-01', 'Ống gió D200', 'm')`,
    );

    const takenBy = await boqTakenBy("BOQ-ITEM-01");
    assert.match(takenBy ?? "", /dòng BOQ .*Ống gió D200/);
    assert.equal(await boqTakenBy("BOQ-ITEM-01", { table: "boq_items", id: boqId }), null);

    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
  },
);

test(
  "boqExecutedQty: qty_contract × Σ(weight × progress) qua task đã map, weight không cần = 1",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqExecutedQty } = await import("@/lib/boq");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test boq exec')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTBOQEXEC', 'Sheet test')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'E1', 'Nhóm test')`,
      stId,
    );
    const taskA = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'E1,01', 'Task A', 1)`,
      pkgId,
    );
    const taskB = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'E1,02', 'Task B', 0.5)`,
      pkgId,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract) VALUES ('BOQ-EXEC-01', 'Ống gió D200', 'm', 100)`,
    );

    // Chưa map task nào → KL thực hiện = 0.
    assert.equal(await boqExecutedQty(boqId), 0);

    // Map 60% khối lượng vào task A (100% xong) + 40% vào task B (50% xong).
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 0.6), (?, ?, 0.4)`,
      boqId,
      taskA,
      boqId,
      taskB,
    );
    // 100 × (0.6×1 + 0.4×0.5) = 100 × 0.8 = 80
    assert.equal(await boqExecutedQty(boqId), 80);

    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, boqId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, taskA, taskB);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
