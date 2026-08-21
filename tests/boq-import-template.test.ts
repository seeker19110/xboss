import { HAS_TEST_DB } from "./setup";
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseBoqWorkbook } from "@/lib/boq-import";

test("parseBoqWorkbook: parse file mẫu MAU-KHOI-LUONG-BOQ.xlsx trích xuất chính xác", () => {
  const filePath = path.join(process.cwd(), "attachments", "MAU-KHOI-LUONG-BOQ.xlsx");
  const wb = XLSX.readFile(filePath);

  const result = parseBoqWorkbook(wb);

  assert.equal(result.sheetUsed, "Data-BOQ");
  assert.equal(result.detectedSystemCode, "acmv");
  assert.ok(result.rows.length >= 500, `Số dòng trích xuất (${result.rows.length}) phải >= 500`);
  assert.ok(result.skippedTowerBOnly > 0, "Phải ghi nhận số dòng chỉ thuộc Tháp B (KL = 0)");

  // Kiểm tra dòng đầu tiên có mã chuẩn
  const firstRow = result.rows[0];
  assert.ok(
    firstRow.code && firstRow.code.startsWith("DHKK-"),
    `Mã BOQ phải bắt đầu bằng DHKK-, thực tế: ${firstRow.code}`,
  );
  assert.ok(firstRow.name.length > 0, "Tên công tác không được rỗng");
  assert.ok(firstRow.unit.length > 0, "Đơn vị tính không được rỗng");
  assert.ok(firstRow.qtyContract > 0, "Khối lượng hợp đồng phải > 0");
});

test(
  "previewBoqImport: ưu tiên giữ nguyên mã BOQ có sẵn trong file mẫu",
  { skip: !HAS_TEST_DB },
  async () => {
    const { previewBoqImport } = await import("@/lib/boq-import");
    const sampleRows = [
      {
        rowIndex: 10,
        code: "DHKK-A.I.1.1",
        name: "Quạt hút khói",
        unit: "Bộ",
        qtyContract: 2,
        unitPrice: 0,
        note: null,
      },
      {
        rowIndex: 11,
        code: null,
        name: "Ống gió mềm",
        unit: "m",
        qtyContract: 50,
        unitPrice: 0,
        note: null,
      },
    ];

    const preview = await previewBoqImport(sampleRows, "acmv", 1);
    assert.equal(preview.length, 2);

    // Dòng có mã sẵn -> giữ nguyên
    assert.equal(preview[0].code, "DHKK-A.I.1.1");
    assert.equal(preview[0].action, "add");

    // Dòng không có mã -> sinh mã theo tiền tố hệ
    assert.ok(preview[1].code.startsWith("ACMV-"));
    assert.equal(preview[1].action, "add");
  },
);

test(
  "previewBoqImport: phát hiện mã trùng lặp trong cùng 1 file",
  { skip: !HAS_TEST_DB },
  async () => {
    const { previewBoqImport } = await import("@/lib/boq-import");
    const duplicateRows = [
      {
        rowIndex: 10,
        code: "DHKK-001",
        name: "Vật tư 1",
        unit: "Bộ",
        qtyContract: 2,
        unitPrice: 0,
        note: null,
      },
      {
        rowIndex: 11,
        code: "DHKK-001",
        name: "Vật tư 1 trùng",
        unit: "Bộ",
        qtyContract: 3,
        unitPrice: 0,
        note: null,
      },
    ];

    const preview = await previewBoqImport(duplicateRows, "acmv", 1);
    assert.equal(preview.length, 2);
    assert.equal(preview[0].action, "add");
    assert.equal(preview[1].action, "error");
    assert.match(preview[1].reason!, /trùng lặp/);
  },
);
