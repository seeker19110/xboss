import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  safeTabName,
  fill,
  buildTrackingTab,
  STATUS_FILL,
  type TrackTask,
  type DimRow,
} from "@/lib/excel-tracking";
import { STATUS_LABEL } from "@/lib/status";

// Hàm dựng nhanh 1 task hợp lệ, override field cần thiết cho từng ca.
function makeTask(overrides: Partial<TrackTask> = {}): TrackTask {
  return {
    taskId: 1,
    boqCode: "BOQ-01",
    code: "A1,01",
    name: "Lắp ống thoát nước",
    status: "hoan_thanh",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    progressPercent: 0.5,
    assignee: "Nguyễn Văn A",
    // wpId=0 khớp giá trị khởi tạo lastWp bên trong buildTrackingTab → mặc định
    // KHÔNG chèn hàng nhóm, để các test không liên quan tới hàng nhóm chỉ cần đọc thẳng hàng 2.
    wpId: 0,
    wpCode: "A1",
    wpName: "Hệ thống thoát nước",
    floorLabel: "T1",
    sheetCode: "ogtd",
    ...overrides,
  };
}

test("safeTabName: loại bỏ ký tự cấm và cắt tối đa 31 ký tự", () => {
  assert.equal(safeTabName("OG/TĐ\\Test?*[Sheet]"), "OG-TĐ-Test---Sheet-");
  const dai = "A".repeat(40);
  assert.equal(safeTabName(dai).length, 31);
  assert.equal(safeTabName(dai), "A".repeat(31));
});

test("fill: trả về đúng cấu trúc pattern fill dùng chung", () => {
  assert.deepEqual(fill("FFABCDEF"), {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFABCDEF" },
  });
});

test("buildTrackingTab: hàng header có 9 cột cố định + cột dimension theo thứ tự xuất hiện lần đầu (không sort)", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  const tasks: TrackTask[] = [makeTask({ taskId: 1 })];
  // Cố ý cho nhãn xuất hiện KHÔNG theo alphabet để phân biệt với việc lỡ sort.
  const dims: DimRow[] = [
    { taskId: 1, label: "DN100", installed: 1 },
    { taskId: 1, label: "DN50", installed: 0 },
    { taskId: 1, label: "DN80", installed: 1 },
  ];
  buildTrackingTab(ws, tasks, dims);

  const header = ws.getRow(1);
  const expectedFixed = [
    "BOQCODE",
    "Mã",
    "Chi tiết công việc",
    "Tầng",
    "Người phụ trách",
    "Bắt đầu",
    "Kết thúc",
    "% Tiến độ",
    "Trạng thái",
  ];
  for (let i = 0; i < expectedFixed.length; i++) {
    assert.equal(header.getCell(i + 1).value, expectedFixed[i]);
  }
  // Đúng thứ tự xuất hiện lần đầu trong mảng dims: DN100, DN50, DN80.
  assert.equal(header.getCell(10).value, "DN100");
  assert.equal(header.getCell(11).value, "DN50");
  assert.equal(header.getCell(12).value, "DN80");
});

test("buildTrackingTab: ws.views đóng băng đúng header + 3 cột đầu", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  buildTrackingTab(ws, [makeTask()], []);
  assert.deepEqual(ws.views, [{ state: "frozen", xSplit: 3, ySplit: 1 }]);
});

test("buildTrackingTab: autoFilter trải từ cột 1 tới (9 + số cột dimension) trên hàng 1", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  const dims: DimRow[] = [
    { taskId: 1, label: "DN100", installed: 1 },
    { taskId: 1, label: "DN50", installed: 0 },
  ];
  buildTrackingTab(ws, [makeTask()], dims);
  assert.deepEqual(ws.autoFilter, {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 11 }, // 9 cột cố định + 2 cột dimension
  });
});

test("buildTrackingTab: chèn hàng nhóm khi wpId đổi giữa 2 task liên tiếp, không thừa hàng nhóm", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  const tasks: TrackTask[] = [
    makeTask({ taskId: 1, wpId: 1, wpCode: "A1", wpName: "Nhóm A1" }),
    makeTask({ taskId: 2, wpId: 1, wpCode: "A1", wpName: "Nhóm A1" }), // cùng wpId → không thêm hàng nhóm
    makeTask({ taskId: 3, wpId: 2, wpCode: "A2", wpName: "Nhóm A2" }), // đổi wpId → thêm hàng nhóm mới
  ];
  buildTrackingTab(ws, tasks, []);

  // Tổng số hàng: header(1) + nhóm A1(1) + task1 + task2 + nhóm A2(1) + task3 = 6
  assert.equal(ws.rowCount, 6);
  assert.equal(ws.getRow(2).getCell(1).value, "— A1"); // hàng nhóm A1
  assert.equal(ws.getRow(2).getCell(3).value, "Nhóm A1");
  assert.equal(ws.getRow(3).getCell(2).value, "A1,01"); // task 1
  assert.equal(ws.getRow(4).getCell(2).value, "A1,01"); // task 2 (không có hàng nhóm chen giữa)
  assert.equal(ws.getRow(5).getCell(1).value, "— A2"); // hàng nhóm A2 mới
  assert.equal(ws.getRow(5).getCell(3).value, "Nhóm A2");
  assert.equal(ws.getRow(6).getCell(2).value, "A1,01"); // task 3
});

test("buildTrackingTab: cột % Tiến độ là số thật, định dạng 0% và căn phải", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  buildTrackingTab(ws, [makeTask({ progressPercent: 0.5 })], []);
  const cell = ws.getRow(2).getCell(8);
  assert.equal(cell.value, 0.5);
  assert.equal(typeof cell.value, "number");
  assert.equal(cell.numFmt, "0%");
  assert.equal(cell.alignment?.horizontal, "right");
});

test("buildTrackingTab: cột Trạng thái tô màu và hiển thị nhãn đúng theo STATUS_FILL/STATUS_LABEL", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  buildTrackingTab(ws, [makeTask({ status: "hoan_thanh" })], []);
  const cell = ws.getRow(2).getCell(9);
  const expected = STATUS_FILL.hoan_thanh;
  assert.deepEqual(cell.fill, fill(expected.bg));
  assert.equal((cell.font as ExcelJS.Font)?.color?.argb, expected.fg);
  assert.equal(cell.value, STATUS_LABEL.hoan_thanh);
});

test("buildTrackingTab: status rác (không thuộc StatusSlug) không throw, không tô màu, giữ nguyên chuỗi gốc", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  assert.doesNotThrow(() => {
    buildTrackingTab(ws, [makeTask({ status: "trang_thai_khong_ton_tai" })], []);
  });
  const cell = ws.getRow(2).getCell(9);
  assert.equal(cell.value, "trang_thai_khong_ton_tai");
  // Không có style tô màu nào được gán vì STATUS_FILL[status] là undefined.
  assert.equal(cell.fill, undefined);
});

test("buildTrackingTab: cột dimension — rỗng khi thiếu nhãn, ○ khi installed=0, x khi installed khác 0", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  const tasks: TrackTask[] = [
    makeTask({ taskId: 1 }), // không có dimension nào cho task 1 (thiếu nhãn DN80)
  ];
  const dims: DimRow[] = [
    { taskId: 1, label: "DN50", installed: 0 },
    { taskId: 1, label: "DN100", installed: 1 },
    // DN80 xuất hiện ở task khác để nằm trong danh sách cột nhưng task 1 không có
    { taskId: 2, label: "DN80", installed: 1 },
  ];
  buildTrackingTab(ws, tasks, dims);

  const row = ws.getRow(2);
  // Thứ tự cột dimension theo thứ tự xuất hiện lần đầu: DN50(10), DN100(11), DN80(12)
  assert.equal(row.getCell(10).value, "○"); // installed = 0
  assert.equal(row.getCell(11).value, "x"); // installed != 0
  assert.equal(row.getCell(12).value, ""); // task 1 thiếu nhãn DN80
});

test("buildTrackingTab: mọi cell dimension căn giữa", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("test");
  const dims: DimRow[] = [
    { taskId: 1, label: "DN50", installed: 0 },
    { taskId: 1, label: "DN100", installed: 1 },
  ];
  buildTrackingTab(ws, [makeTask({ taskId: 1 })], dims);
  const row = ws.getRow(2);
  assert.equal(row.getCell(10).alignment?.horizontal, "center");
  assert.equal(row.getCell(11).alignment?.horizontal, "center");
});
