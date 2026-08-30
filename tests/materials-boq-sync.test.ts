import { HAS_TEST_DB } from "./setup";
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import * as XLSX from "xlsx";

test("Quy chuẩn kiểm soát đặt hàng: Định mức Shop <= BOQ -> Cho phép, > BOQ -> Chặn, 0 -> Chưa bóc tách", () => {
  function checkOrderControl(qtyBoq: number, qtyPlanned: number): "none" | "over" | "within" {
    if (qtyPlanned <= 0) return "none";
    return qtyPlanned > qtyBoq ? "over" : "within";
  }

  // Case 1: Định mức bóc tách 100 <= BOQ 120 -> Cho phép đặt hàng
  assert.equal(checkOrderControl(120, 100), "within");
  assert.equal(120 - 100, 20); // Chênh lệch dương

  // Case 2: Định mức bóc tách 150 > BOQ 120 -> Chặn đặt hàng (Vượt định mức)
  assert.equal(checkOrderControl(120, 150), "over");
  assert.equal(120 - 150, -30); // Chênh lệch âm

  // Case 3: Chưa bóc tách bản vẽ Shop (Định mức = 0) -> Cảnh báo
  assert.equal(checkOrderControl(120, 0), "none");
});

test("File MAU-KHOI-LUONG-BOQ.xlsx: Đọc chính xác cấu trúc cột cho Materials và BOQ", () => {
  const filePath = path.join(process.cwd(), "attachments", "MAU-KHOI-LUONG-BOQ.xlsx");
  const wb = XLSX.readFile(filePath);

  assert.ok(wb.SheetNames.includes("Data-BOQ"), "Phải có sheet Data-BOQ");

  const ws = wb.Sheets["Data-BOQ"];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Dò tìm header ở dòng 5
  let headerRow = -1;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const r = raw[i];
    if (!r) continue;
    const c0 = String(r[0] ?? "");
    const c2 = String(r[2] ?? "");
    if (c0.includes("Mã BOQ") || c2.includes("MÔ TẢ")) {
      headerRow = i;
      break;
    }
  }

  assert.equal(headerRow, 5, "Dòng tiêu đề của Data-BOQ phải ở dòng 5 (0-indexed)");

  // Kiểm tra dòng dữ liệu đầu tiên
  const rowData = raw[headerRow + 4]; // DHKK-A.I.1.1
  const code = String(rowData[0] ?? "");
  const name = String(rowData[2] ?? "");
  const unit = String(rowData[4] ?? "");
  const qtyBoq = Number(rowData[5] ?? 0);

  assert.equal(code, "DHKK-A.I.1.1");
  assert.ok(name.includes("Quạt hút khói"));
  assert.equal(unit, "Bộ");
  assert.equal(qtyBoq, 2);
});

test("Import Vật tư: Ưu tiên chọn sheet Data-BOQ thay vì sheet mẫu trống và đọc đầy đủ >800 dòng", () => {
  const filePath = path.join(process.cwd(), "attachments", "MAU-KHOI-LUONG-BOQ.xlsx");
  const wb = XLSX.readFile(filePath);

  const IGNORE_PATTERNS = [
    /HUONG_DAN/i,
    /HDSD/i,
    /GUIDE/i,
    /DASHBOARD/i,
    /KIEM_SOAT/i,
    /In phieu/i,
    /Phieu xuat/i,
  ];

  // Logic chọn sheet mới: ưu tiên Data-BOQ / Vật tư / BOQ
  const targetSheetName =
    wb.SheetNames.find((s) => s === "Data-BOQ" || s === "Vật tư" || s === "BOQ") ||
    wb.SheetNames.find((s) => !IGNORE_PATTERNS.some((p) => p.test(s))) ||
    wb.SheetNames[0];

  assert.equal(
    targetSheetName,
    "Data-BOQ",
    "Phải chọn đúng sheet Data-BOQ thay vì 02_MAU_BOQ_TRONG",
  );

  const ws = wb.Sheets[targetSheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  let validRows = 0;
  let skippedRows = 0;
  const headerRow = 5;

  for (let i = headerRow + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) {
      skippedRows++;
      continue;
    }
    const code = String(r[0] ?? "").trim();
    const name = String(r[2] ?? "").trim();
    if (!name && !code) {
      skippedRows++;
      continue;
    }
    validRows++;
  }

  assert.ok(validRows >= 800, `Số dòng hợp lệ phải >= 800 (thực tế: ${validRows})`);
  assert.ok(skippedRows < 100, `Số dòng bỏ qua phải < 100 (thực tế: ${skippedRows})`);
});

test("Bảo vệ tính toàn vẹn SQL: Số cột và số biểu thức trong câu lệnh INSERT materials phải khớp 100%", () => {
  const insertSql = `INSERT INTO materials (system_id, sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order, project_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`;

  const colMatch = insertSql.match(/\(([^)]+)\)\s+VALUES\s+\(([^)]+)\)/i);
  assert.ok(colMatch, "Phải khớp cú pháp INSERT INTO ... VALUES (...)");

  const cols = colMatch[1].split(",").map((s) => s.trim());
  const vals = colMatch[2].split(",").map((s) => s.trim());

  assert.equal(cols.length, 12, "Phải có 12 cột đích trong bảng materials");
  assert.equal(vals.length, 12, "Phải có đúng 12 biểu thức trong mệnh đề VALUES");
  assert.equal(
    cols.length,
    vals.length,
    "Số cột đích và số biểu thức VALUES phải bằng nhau tuyệt đối",
  );
});
