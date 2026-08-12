import "./setup"; // phải đứng đầu: trỏ DB sang :memory: trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { toISO, analyzeWorkbook, isChecked } from "@/lib/import";

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

// ===== Mẫu số quy lưới checkbox → % (ImportOptions.dimDenominator) =====
// Dựng workbook CÓ cột lưới: header ở HEADER_ROW=2, dimension từ cột 9, cột "Link" đóng dải.
function gridWorkbook(dimHeaders: (string | null)[], dataRows: unknown[][]): XLSX.WorkBook {
  const header = [
    "CODE",
    "STT",
    "CHI TIẾT",
    "GHI CHÚ",
    "NGÀY BĐ",
    "SỐ NGÀY",
    "NGÀY KT",
    "% Tiến độ",
    "Lắp đặt",
    ...dimHeaders,
    "Link Bản vẽ BBNT",
  ];
  const aoa: unknown[][] = [[], [], header, [], [], ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return { SheetNames: ["TRACKING OGTĐ"], Sheets: { "TRACKING OGTĐ": ws } };
}

test("analyzeWorkbook: cảnh báo khi % trong file lệch % tính từ lưới (hàng chỉ dùng một phần cột)", () => {
  // 4 cột lưới, hàng chỉ có dữ liệu ở 2 cột đầu và tick cả 2 → file ghi 100%, XBoss tính 50%.
  const wb = gridWorkbook(
    ["D1", "D2", "D3", "D4"],
    [
      ["A1", "1", "Nhóm A1", "", "2026-01-01", 10, "2026-01-10", 0],
      ["A1,01", "01", "Task một phần", "", "2026-01-01", 5, "2026-01-05", 1, null, true, true],
    ],
  );
  const sp = analyzeWorkbook(wb).sheets[0];
  assert.equal(sp.dimColumns, 4);
  assert.ok(
    sp.warnings.some((w) => w.includes("khác % tính từ lưới") && w.includes("row-nonempty")),
    `cảnh báo thiếu: ${JSON.stringify(sp.warnings)}`,
  );
});

test("analyzeWorkbook: không cảnh báo khi % trong file khớp % tính từ lưới", () => {
  const wb = gridWorkbook(
    ["D1", "D2", "D3", "D4"],
    [
      ["A1", "1", "Nhóm A1", "", "2026-01-01", 10, "2026-01-10", 0],
      [
        "A1,01",
        "01",
        "Task đủ ô",
        "",
        "2026-01-01",
        5,
        "2026-01-05",
        0.5,
        null,
        true,
        true,
        false,
        false,
      ],
    ],
  );
  const sp = analyzeWorkbook(wb).sheets[0];
  assert.deepEqual(sp.warnings, []);
});

// ===== Giá trị biên của các hằng số trong lib/import.ts =====
// Hằng số: HEADER_ROW=2, DATA_START=5, DIM_START=9, mốc serial Excel 25569 (1970-01-01).

test("toISO: biên mốc serial Excel", () => {
  assert.equal(toISO(25569), "1970-01-01"); // đúng mốc quy đổi
  assert.equal(toISO(25568), "1969-12-31"); // ngay dưới
  assert.equal(toISO(25570), "1970-01-02"); // ngay trên
  assert.equal(toISO(1), "1899-12-31"); // serial nhỏ nhất dùng thật
  assert.equal(toISO(0), "1899-12-30"); // mốc 0 của Excel
  assert.equal(toISO(-1), "1899-12-29"); // âm vẫn ra ngày, không throw
});

test("toISO: serial có phần lẻ giờ vẫn lấy đúng ngày", () => {
  assert.equal(toISO(45292.0), "2024-01-01");
  assert.equal(toISO(45292.25), "2024-01-01"); // 6h sáng
  assert.equal(toISO(45292.99), "2024-01-01"); // gần cuối ngày
});

test("analyzeWorkbook: cột 8 ('Lắp đặt') KHÔNG được tính là cột lưới (DIM_START=9)", () => {
  const wb = gridWorkbook(
    ["D1", "D2"],
    [
      ["A1", "1", "Nhóm A1", "", "2026-01-01", 10, "2026-01-10", 0],
      ["A1,01", "01", "Task", "", "2026-01-01", 5, "2026-01-05", 1, true, true, true],
    ],
  );
  const sp = analyzeWorkbook(wb).sheets[0];
  assert.equal(sp.dimColumns, 2); // chỉ D1, D2 — không gồm cột "Lắp đặt"
  assert.deepEqual(sp.warnings, []); // 2/2 ô tick = 100%, khớp % trong file
});

test("analyzeWorkbook: hàng ngay trước DATA_START bị bỏ, hàng đúng DATA_START được đọc", () => {
  // fakeTrackingWorkbook chèn đúng 5 hàng rỗng nên phần tử đầu của dataRows nằm ở index 5.
  const wb = fakeTrackingWorkbook([["A1", "1", "Nhóm ở đúng DATA_START"]]);
  assert.equal(analyzeWorkbook(wb).sheets[0].packages, 1);
});

// ===== Không gian giá trị của ô lưới checkbox (điểm quyết định % tiến độ) =====

test("isChecked: mọi biến thể ĐÃ LẮP mà file có thể chứa", () => {
  for (const v of [true, 1, "x", "X", " x ", "1", "true", "TRUE", "✓", "đã lắp", "Đã Lắp"])
    assert.equal(isChecked(v), true, `giá trị ${JSON.stringify(v)}`);
});

test("isChecked: mọi biến thể CHƯA LẮP — không được đếm nhầm thành đã lắp", () => {
  for (const v of [false, 0, null, undefined, "", "  ", "○", "o", "0", "false", "no", {}, []])
    assert.equal(isChecked(v), false, `giá trị ${JSON.stringify(v)}`);
});

test("isChecked: biên số — chỉ đúng số 1, không phải mọi số khác 0", () => {
  assert.equal(isChecked(1), true);
  assert.equal(isChecked(2), false);
  assert.equal(isChecked(0.999), false);
  assert.equal(isChecked(-1), false);
});

test("parseDimDefs: header gộp ô (OGHL) — mỗi cột con vẫn là 1 ô lưới riêng", () => {
  // Header gộp ô: chỉ cột đầu của nhóm có chữ, các cột sau là null (xem TRACKING OGHL).
  const wb = gridWorkbook(
    ["TRỤC 1300X700", null, null, "TRỤC 1350X550", null],
    [
      ["H1", "1", "Nhóm H1", "", "2026-01-01", 10, "2026-01-10", 0],
      [
        "H1,01",
        "01",
        "Task",
        "",
        "2026-01-01",
        5,
        "2026-01-05",
        0.4,
        null,
        true,
        true,
        false,
        false,
        false,
      ],
    ],
  );
  const sp = analyzeWorkbook(wb).sheets[0];
  assert.equal(sp.dimColumns, 5); // 5 cột con, không phải 2 nhóm
  assert.deepEqual(sp.warnings, []); // 2/5 = 40%, khớp % trong file
});

test("analyzeWorkbook: sheet lạ có chữ TRACKING được nêu tên, sheet khác bị bỏ im lặng", () => {
  const wb = fakeTrackingWorkbook([["A1", "1", "Nhóm A1"]]);
  const ws = XLSX.utils.aoa_to_sheet([["x"]]);
  wb.SheetNames.push("TRACKING LẠ", "DashBoard");
  wb.Sheets["TRACKING LẠ"] = ws;
  wb.Sheets["DashBoard"] = ws;
  const preview = analyzeWorkbook(wb);
  assert.deepEqual(preview.unknownSheets, ["TRACKING LẠ"]);
});
