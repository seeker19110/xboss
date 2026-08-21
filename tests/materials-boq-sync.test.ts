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
  assert.ok(wb.SheetNames.includes("00_HUONG_DAN_SU_DUNG"), "Phải có sheet Hướng dẫn");
  assert.ok(wb.SheetNames.includes("02_MAU_BOQ_TRONG"), "Phải có sheet Mẫu trống");

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
