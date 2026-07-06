import "./setup"; // phải đứng đầu: trỏ DB sang :memory: trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { toISO, analyzeWorkbook } from "@/lib/import";

// Dựng workbook giả lập đúng layout cột file WBS tracking gốc (HEADER_ROW=2,
// DATA_START=5): [0]=mã, [1]=STT, [2]=tên, [3]=ghi chú/trạng thái, [4]=ngày BĐ,
// [5]=số ngày, [6]=ngày KT, [7]=% tiến độ, [8+]=cột dimension (bỏ trống ở đây,
// không phải trọng tâm của các test này).
function fakeTrackingWorkbook(dataRows: unknown[][]): XLSX.WorkBook {
  const aoa: unknown[][] = [[], [], [], [], [], ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return { SheetNames: ["TRACKING OGTĐ"], Sheets: { "TRACKING OGTĐ": ws } };
}

test("toISO: serial Excel → ISO date", () => {
  // 45292 = 2024-01-01 (epoch Excel 1900)
  assert.equal(toISO(45292), "2024-01-01");
});

test("toISO: Date object và chuỗi ngày", () => {
  assert.equal(toISO(new Date(Date.UTC(2026, 5, 10))), "2026-06-10");
  assert.equal(toISO("2026-06-10"), "2026-06-10");
});

test("toISO: giá trị rỗng/không hợp lệ → null", () => {
  assert.equal(toISO(null), null);
  assert.equal(toISO(""), null);
  assert.equal(toISO("không phải ngày"), null);
});

// ===== Nhận diện hàng nhóm vs sub-task theo pattern mã (A1 vs A1,01) =====

test("analyzeWorkbook: nhận diện đúng đề mục nhóm (top group) → bỏ qua, không tính nhóm/task", () => {
  const wb = fakeTrackingWorkbook([
    ["", "A", "PHẦN HẦM"], // STT chữ cái thuần + không có mã dạng chữ+số → đề mục nhóm lớn, bỏ qua
    ["A1", "1", "Nhóm A1", "", "2026-01-01", 10, "2026-01-10"],
  ]);
  const preview = analyzeWorkbook(wb);
  const sp = preview.sheets[0];
  assert.equal(sp.packages, 1); // chỉ "Nhóm A1" được tính, "PHẦN HẦM" bị bỏ qua
  assert.equal(sp.tasks, 0);
});

test("analyzeWorkbook: mã có dấu phẩy (A1,01) → nhận diện là sub-task của nhóm trước đó, không phải nhóm mới", () => {
  const wb = fakeTrackingWorkbook([
    ["A1", "1", "Nhóm A1", "", "2026-01-01", 10, "2026-01-10"],
    ["A1,01", "01", "Task con có mã đầy đủ", "", "2026-01-01", 5, "2026-01-05"],
    ["", "02", "Task con không có mã (chỉ có STT)", "", "2026-01-06", 5, "2026-01-10"],
  ]);
  const preview = analyzeWorkbook(wb);
  const sp = preview.sheets[0];
  assert.equal(sp.packages, 1);
  assert.equal(sp.tasks, 2);
});

test("analyzeWorkbook: nhiều nhóm liên tiếp — mỗi nhóm mã không dấu phẩy + STT số nguyên đều được tính", () => {
  const wb = fakeTrackingWorkbook([
    ["A1", "1", "Nhóm A1", "", "2026-01-01", 10, "2026-01-10"],
    ["A1,01", "01", "Task A1", "", "2026-01-01", 5, "2026-01-05"],
    ["A2", "2", "Nhóm A2", "", "2026-01-11", 10, "2026-01-20"],
    ["A2,01", "01", "Task A2", "", "2026-01-11", 5, "2026-01-15"],
  ]);
  const preview = analyzeWorkbook(wb);
  const sp = preview.sheets[0];
  assert.equal(sp.packages, 2);
  assert.equal(sp.tasks, 2);
});

test("analyzeWorkbook: task đứng trước nhóm đầu tiên → cảnh báo, không tính vào task", () => {
  const wb = fakeTrackingWorkbook([
    ["B1,01", "01", "Task đứng trước nhóm đầu tiên", "", "2026-01-01", 5, "2026-01-05"],
  ]);
  const preview = analyzeWorkbook(wb);
  const sp = preview.sheets[0];
  assert.equal(sp.packages, 0);
  assert.equal(sp.tasks, 0);
  assert.ok(sp.warnings.some((w) => w.includes("đứng trước nhóm đầu tiên")));
});
