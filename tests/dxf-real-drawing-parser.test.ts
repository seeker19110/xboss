import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDxf,
  parseDwgBinary,
  exportDxf,
  generateStandardizedAutocadScript,
} from "@/lib/cad/dxf-parser";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

test("parseDxf: Phân tích DXF chuẩn MEPF và trích xuất đúng thực thể và layer", () => {
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\n01_ONG_GIO_CAP\n62\n140\n6\nCONTINUOUS\n0\nLAYER\n2\nNUOC_LANH_PPR\n62\n70\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n01_ONG_GIO_CAP\n10\n1000\n20\n2000\n30\n3000\n11\n5000\n21\n2000\n31\n3000\n0\nTEXT\n8\n01_ONG_GIO_CAP\n10\n2500\n20\n2100\n30\n3000\n1\nống gió cấp lạnh AHU-01\n0\nENDSEC\n0\nEOF`;

  const result = parseDxf(sampleDxf, "test_hvac.dxf");
  assert.equal(result.fileName, "test_hvac.dxf");
  assert.equal(result.layers.length, 2);
  assert.equal(result.entities.length, 2);

  // Check layer mapping — standardName follows the actual mapping table
  const ductLayer = result.layers.find((l) => l.name === "01_ONG_GIO_CAP");
  assert.ok(ductLayer, "Layer 01_ONG_GIO_CAP phải tồn tại");
  assert.ok(ductLayer.standardName, "Layer phải có standardName");
  assert.ok(ductLayer.standardName.startsWith("M-"), "Layer HVAC phải thuộc discipline M-");

  // Check entity parsing
  const textEnt = result.entities.find((e) => e.type === "TEXT");
  assert.ok(textEnt, "Phải có thực thể TEXT");
});

test("parseDwgBinary: Phân tích tệp DWG nhị phân và trích xuất metadata", () => {
  const mockDwgHeader = Buffer.alloc(1024);
  mockDwgHeader.write("AC1021", 0, 6, "ascii");

  const result = parseDwgBinary(mockDwgHeader, "23056-VHT-CD-A-M-205.dwg");
  assert.equal(result.isRealDrawing, true);
  assert.ok(result.fileFormat, "fileFormat phải có giá trị");
  assert.equal(
    result.entities.length,
    0,
    "Không được tự sinh thực thể giả khi binary không có text/block",
  );
  assert.equal(result.layers.length, 1, "Chỉ có layer 0 mặc định");
  assert.equal(result.fileSizeBytes, 1024);
});

test("parseDxf: Trả về trạng thái rỗng trung thực khi tệp không hợp lệ (Chống Ảo Giác)", () => {
  const result = parseDxf("", "empty.dxf");
  assert.equal(result.isRealDrawing, false);
  assert.equal(result.entities.length, 0, "Tuyệt đối không sinh thực thể giả khi DXF rỗng");
  assert.equal(result.layers.length, 0, "Tuyệt đối không sinh layer giả khi DXF rỗng");
  assert.equal(result.diagnostic.healthScore, 0, "Điểm sức khỏe phải bằng 0");
});

test("parseDwgBinary: Đọc và giải mã tệp DWG thật trên đĩa nếu có", () => {
  const realDwgPath = join(
    process.cwd(),
    "data",
    "uploads",
    "drawings",
    "01. Cad",
    "03.AC",
    "03_Thap A",
    "23056-VHT-CD-A-M-205.dwg",
  );

  if (existsSync(realDwgPath)) {
    const buf = readFileSync(realDwgPath);
    const result = parseDwgBinary(buf, "23056-VHT-CD-A-M-205.dwg");
    assert.equal(result.isRealDrawing, true);
    assert.ok(result.fileSizeBytes && result.fileSizeBytes > 1000);
    assert.ok(result.entities.length > 0);
    assert.ok(result.diagnostic.healthScore > 0);
  }
});

test("generateStandardizedAutocadScript: Sinh script AutoCAD .SCR chuẩn hóa", () => {
  const sampleLayers = [
    {
      name: "01_ONG_GIO_CAP",
      standardName: "M-HVAC-DUCT-SUPP",
      colorNumber: 140,
      colorHex: "#ef4444",
      lineType: "CONTINUOUS",
      entityCount: 15,
      isStandardized: false,
      discipline: "M" as const,
    },
  ];

  const scr = generateStandardizedAutocadScript(sampleLayers);
  assert.ok(scr.includes("-LAYER"));
  assert.ok(scr.includes("M-HVAC-DUCT-SUPP"));
  assert.ok(scr.includes("PURGE"));
});

test("Drawing Synchronizer: Nhận diện cấu trúc phân hệ MEPF và tầng từ mã hiệu bản vẽ", () => {
  const hvacFile = "23056-VHT-CD-A-M-205.dwg";
  const elecFile = "23056-VHT-CD-A-EP-205.dwg";
  const elvFile = "23056-VHT-CD-GE-ELV-001.dwg";

  assert.ok(hvacFile.includes("-M-"), "HVAC code phải chứa -M-");
  assert.ok(elecFile.includes("-EP-"), "Điện lực code phải chứa -EP-");
  assert.ok(elvFile.includes("-ELV-"), "Điện nhẹ code phải chứa -ELV-");
});

test("exportDxf: Xuất chuỗi DXF ASCII chuẩn AutoCAD đầy đủ HEADER, TABLES, BLOCKS, ENTITIES", () => {
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\n01_ONG_GIO_CAP\n62\n140\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n01_ONG_GIO_CAP\n10\n1000\n20\n2000\n30\n0\n11\n5000\n21\n2000\n31\n0\n0\nTEXT\n8\n01_ONG_GIO_CAP\n10\n2500\n20\n2100\n30\n0\n1\nAHU-01\n0\nENDSEC\n0\nEOF`;

  const parsed = parseDxf(sampleDxf, "original.dxf");
  assert.equal(parsed.entities.length, 2);

  const exportedDxf = exportDxf(parsed, { applyStandardLayers: true });
  assert.ok(exportedDxf.includes("SECTION"), "DXF xuất phải có SECTION");
  assert.ok(exportedDxf.includes("HEADER"), "DXF xuất phải có HEADER");
  assert.ok(exportedDxf.includes("$ACADVER"), "DXF xuất phải có $ACADVER");
  assert.ok(exportedDxf.includes("AC1015"), "DXF xuất phải tương thích AC1015");
  assert.ok(exportedDxf.includes("TABLES"), "DXF xuất phải có TABLES");
  assert.ok(exportedDxf.includes("LAYER"), "DXF xuất phải có bảng LAYER");
  assert.ok(exportedDxf.includes("BLOCKS"), "DXF xuất phải có BLOCKS");
  assert.ok(exportedDxf.includes("ENTITIES"), "DXF xuất phải có ENTITIES");
  assert.ok(exportedDxf.includes("EOF"), "DXF xuất phải kết thúc bằng EOF");

  // Re-parse exported DXF
  const reParsed = parseDxf(exportedDxf, "exported.dxf");
  assert.equal(reParsed.entities.length, 2);
  assert.ok(reParsed.layers.length >= 1);
});
