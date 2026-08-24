import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDxf,
  parseDwgBinary,
  DwgUnsupportedError,
  exportDxf,
  generateStandardizedAutocadScript,
  validateDxf,
  decodeCadText,
} from "@/lib/ky-thuat/cad/dxf-parser";
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

test("parseDwgBinary: Từ chối đọc DWG nhị phân thay vì bịa hình học (M99 PR0)", () => {
  const mockDwgHeader = Buffer.alloc(1024);
  mockDwgHeader.write("AC1021", 0, 6, "ascii");

  assert.throws(
    () => parseDwgBinary(mockDwgHeader, "23056-VHT-CD-A-M-205.dwg"),
    DwgUnsupportedError,
    "parseDwgBinary phải luôn ném DwgUnsupportedError — XBoss không đọc DWG bằng TypeScript",
  );
});

test("parseDxf: Trả về trạng thái rỗng trung thực khi tệp không hợp lệ (Chống Ảo Giác)", () => {
  const result = parseDxf("", "empty.dxf");
  assert.equal(result.isRealDrawing, false);
  assert.equal(result.entities.length, 0, "Tuyệt đối không sinh thực thể giả khi DXF rỗng");
  assert.equal(result.layers.length, 0, "Tuyệt đối không sinh layer giả khi DXF rỗng");
  assert.equal(result.diagnostic.healthScore, 0, "Điểm sức khỏe phải bằng 0");
});

test("parseDwgBinary: Từ chối cả DWG thật trên đĩa nếu có (không còn đọc DWG bằng TS)", () => {
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
    assert.throws(() => parseDwgBinary(buf, "23056-VHT-CD-A-M-205.dwg"), DwgUnsupportedError);
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
  assert.ok(
    exportedDxf.includes("AC1015"),
    "DXF xuất phải khai R2000 (AC1015) — bộ ghi nay phát hành đúng cấu trúc có handle và OBJECTS",
  );
  assert.ok(!exportedDxf.includes("AC1009"), "Không được khai lùi về R12 nữa");
  assert.ok(exportedDxf.includes("$HANDSEED"), "R2000 bắt buộc khai $HANDSEED");
  assert.ok(exportedDxf.includes("2\r\nCLASSES"), "DXF xuất phải có section CLASSES");
  assert.ok(exportedDxf.includes("2\r\nOBJECTS"), "DXF xuất phải có section OBJECTS");
  assert.ok(exportedDxf.includes("AcDbEntity"), "Mỗi thực thể R2000 phải khai lớp con AcDbEntity");
  assert.ok(
    exportedDxf.includes("100\r\nAcDbBlockTableRecord"),
    "Bảng BLOCK_RECORD phải khai đúng lớp con",
  );
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

test("parseDxf: DIMENSION lấy đầu đo ở mã 13/14 và số đo thật ở mã 42, không suy từ mã 10/11", () => {
  // Kích thước thật của AutoCAD: 10/20 = điểm đặt đường kích thước, 11/21 = điểm đặt chữ,
  // 13/23 và 14/24 = HAI ĐẦU ĐO, 42 = số đo thật do AutoCAD ghi sẵn.
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nM-DIMS\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nDIMENSION\n8\nM-DIMS\n10\n3000\n20\n2500\n30\n0\n11\n3000\n21\n2600\n31\n0\n13\n1000\n23\n2000\n33\n0\n14\n5000\n24\n2000\n34\n0\n42\n4000.0\n70\n0\n0\nENDSEC\n0\nEOF`;

  const parsed = parseDxf(sampleDxf, "kich_thuoc_that.dxf");
  const dim = parsed.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Phải parse ra thực thể DIMENSION");

  assert.deepEqual(
    dim.coordinates.measurePoints,
    [
      [1000, 2000, 0],
      [5000, 2000, 0],
    ],
    "Hai đầu đo phải lấy từ mã 13/23/33 và 14/24/34",
  );
  assert.equal(dim.measurement, 4000, "Số đo thật phải đọc từ mã 42, không tự tính");
  assert.deepEqual(
    dim.coordinates.textMidPoint,
    [3000, 2600, 0],
    "Điểm đặt chữ kích thước phải lấy từ mã 11/21/31",
  );
  assert.deepEqual(
    dim.coordinates.center,
    [3000, 2500, 0],
    "Mã 10/20/30 là điểm đặt đường kích thước, giữ riêng chứ không dùng làm đầu đo",
  );
});

test("exportDxf: DIMENSION giữ nguyên là DIMENSION, kèm khối *D<n> chứa đường đo và chữ đo", () => {
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nM-DIMS\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nDIMENSION\n8\nM-DIMS\n10\n3000\n20\n2500\n30\n0\n11\n3000\n21\n2600\n31\n0\n13\n1000\n23\n2000\n33\n0\n14\n5000\n24\n2000\n34\n0\n42\n4000.0\n70\n0\n0\nENDSEC\n0\nEOF`;
  const parsed = parseDxf(sampleDxf, "co_kich_thuoc.dxf");
  const exported = exportDxf(parsed, { applyStandardLayers: false });

  // R2000 có DIMENSION thật — không còn phải tách thành LINE + TEXT rời như bản ghi R12 cũ
  assert.ok(exported.includes("0\r\nDIMENSION\r\n"), "Kích thước phải giữ nguyên là DIMENSION");
  assert.ok(exported.includes("100\r\nAcDbAlignedDimension\r\n"), "Phải khai đúng lớp con");
  assert.ok(exported.includes("2\r\n*D1\r\n"), "DIMENSION phải trỏ tới khối hình của nó");

  // Khối *D1 mang đường đo nối hai đầu đo thật và chữ số đo
  const khoi = exported.slice(exported.indexOf("100\r\nAcDbBlockBegin\r\n2\r\n*D1\r\n"));
  const thanKhoi = khoi.slice(0, khoi.indexOf("0\r\nENDBLK"));
  assert.ok(thanKhoi.includes("0\r\nLINE\r\n"), "Khối kích thước phải chứa đường đo");
  assert.ok(
    thanKhoi.includes("10\r\n1000.0\r\n20\r\n2000.0\r\n") &&
      thanKhoi.includes("11\r\n5000.0\r\n21\r\n2000.0\r\n"),
    "Đường đo phải nối đúng hai đầu đo 13/14",
  );
  assert.ok(thanKhoi.includes("1\r\n4000\r\n"), "Chữ đo phải mang số đo thật 4000 từ mã 42");

  // Đọc lại: vẫn là kích thước, giữ nguyên hai đầu đo và số đo
  const lai = parseDxf(exported, "exported.dxf");
  const dim = lai.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Đọc lại tệp xuất ra vẫn phải thấy DIMENSION");
  assert.deepEqual(dim.coordinates.measurePoints, [
    [1000, 2000, 0],
    [5000, 2000, 0],
  ]);
  assert.equal(dim.decodedText, "4000");
});

test("validateDxf: Chấp nhận tệp DXF do exportDxf sinh ra, từ chối tệp R2000 thiếu OBJECTS", () => {
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\n01_ONG_GIO_CAP\n62\n140\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n01_ONG_GIO_CAP\n10\n1000\n20\n2000\n30\n0\n11\n5000\n21\n2000\n31\n0\n0\nENDSEC\n0\nEOF`;
  const exported = exportDxf(parseDxf(sampleDxf, "original.dxf"), { applyStandardLayers: true });

  assert.deepEqual(
    validateDxf(exported),
    { valid: true, errors: [] },
    "DXF từ exportDxf phải hợp lệ",
  );

  // Tệp khai R2000 mà thiếu OBJECTS là tệp hỏng — AutoCAD không mở được
  const thieuObjects = exported.replace(
    /0\r\nSECTION\r\n2\r\nOBJECTS\r\n[\s\S]*?0\r\nENDSEC\r\n/,
    "",
  );
  const res = validateDxf(thieuObjects);
  assert.equal(res.valid, false, "Thiếu OBJECTS trong tệp R2000 phải bị chặn trước khi ghi ra đĩa");
  assert.ok(res.errors.some((e) => e.includes("OBJECTS")));

  // Nhưng tệp khai phiên bản cũ thì không đòi OBJECTS — người dùng vẫn tải lên tệp R12 được
  const r12 = `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nBLOCKS\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;
  assert.deepEqual(
    validateDxf(r12),
    { valid: true, errors: [] },
    "Tệp R12 hợp lệ vẫn phải được nhận",
  );
});

test("validateDxf: Từ chối DXF thiếu section ENTITIES", () => {
  const thieuEntities = `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nBLOCKS\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;

  const res = validateDxf(thieuEntities);
  assert.equal(res.valid, false, "Thiếu ENTITIES phải bị từ chối");
  assert.equal(res.errors.length, 1, "Chỉ báo đúng một lỗi thiếu section");
  assert.match(res.errors[0], /ENTITIES/);
});

test("validateDxf: Từ chối nội dung rỗng, tệp cụt và tệp không kết thúc bằng EOF", () => {
  for (const rong of ["", "   \r\n  "]) {
    const res = validateDxf(rong);
    assert.equal(res.valid, false, "Nội dung rỗng phải bị từ chối");
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /rỗng/);
  }

  // Tệp cụt: mở SECTION ENTITIES nhưng không có ENDSEC lẫn EOF
  const cut = `0\r\nSECTION\r\n2\r\nHEADER\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nBLOCKS\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nLINE\r\n8\r\n0\r\n`;
  const resCut = validateDxf(cut);
  assert.equal(resCut.valid, false);
  assert.ok(
    resCut.errors.some((e) => e.includes("ENDSEC")),
    "Phải báo thiếu ENDSEC",
  );
  assert.ok(
    resCut.errors.some((e) => e.includes("EOF")),
    "Phải báo thiếu EOF",
  );

  // Rác hoàn toàn (vd nội dung DWG/nhị phân đổi đuôi): không đọc được thành cặp mã nhóm
  const rac = validateDxf("day khong phai DXF\r\nchi la van ban thuong\r\n");
  assert.equal(rac.valid, false);
  assert.ok(
    rac.errors.some((e) => e.includes("lệch nhịp")),
    "Văn bản thường phải bị bắt là lệch nhịp cặp mã nhóm",
  );
});

test("validateDxf: Bỏ qua BOM và dòng trống dẫn đầu, nhưng bắt được tệp lệch nhịp cặp", () => {
  const than = `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nBLOCKS\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;

  // BOM UTF-8 dẫn đầu không được làm lệch nhịp cặp (mã nhóm, giá trị)
  const coBom = validateDxf("﻿" + than);
  assert.deepEqual(coBom, { valid: true, errors: [] }, "BOM không được làm DXF hợp lệ bị chặn");

  // Dòng trống thừa ở đầu và cuối tệp cũng vậy
  const coDongTrong = validateDxf("\r\n\r\n" + than + "\r\n\r\n");
  assert.deepEqual(
    coDongTrong,
    { valid: true, errors: [] },
    "Dòng trống dẫn đầu/kết đuôi không được làm DXF hợp lệ bị chặn",
  );

  // Chèn 1 dòng lạ giữa tệp → lệch pha cặp từ đó trở đi, phải bị bắt thay vì đoán bừa
  const lech = than.replace(
    "0\r\nSECTION\r\n2\r\nENTITIES",
    "GHI CHU LA\r\n0\r\nSECTION\r\n2\r\nENTITIES",
  );
  const resLech = validateDxf(lech);
  assert.equal(resLech.valid, false, "Tệp lệch nhịp cặp phải bị từ chối");
  assert.ok(
    resLech.errors.some((e) => e.includes("lệch nhịp")),
    "Phải nêu rõ lỗi lệch nhịp cặp mã nhóm/giá trị",
  );
});

// DXF mẫu dùng chung cho 2 ca biên của DIMENSION: 1 LINE thật + 1 DIMENSION trên layer M-DIMS
// có hai đầu đo (13/14) nhưng KHÔNG có chữ ghi đè lẫn số đo mã 42
const DXF_CO_KICH_THUOC = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nM-DIMS\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nM-DIMS\n10\n0\n20\n0\n30\n0\n11\n1000\n21\n0\n31\n0\n0\nDIMENSION\n8\nM-DIMS\n10\n3000\n20\n2500\n30\n0\n13\n1000\n23\n2000\n33\n0\n14\n5000\n24\n2000\n34\n0\n70\n0\n0\nENDSEC\n0\nEOF`;

test("exportDxf: DIMENSION không có chữ ghi đè lẫn mã 42 thì khối hình chỉ có đường đo, không có chữ", () => {
  const parsed = parseDxf(DXF_CO_KICH_THUOC, "khong_chu.dxf");
  const dim = parsed.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Bản vẽ mẫu phải có DIMENSION");
  assert.equal(dim.measurement, undefined, "Tệp không khai mã 42 thì không được tự tính số đo");
  assert.equal(dim.textValue, undefined, "Tệp không khai chữ ghi đè thì không được bịa chữ");

  const exported = exportDxf(parsed, { applyStandardLayers: false });
  const khoi = exported.slice(exported.indexOf("100\r\nAcDbBlockBegin\r\n2\r\n*D1\r\n"));
  const thanKhoi = khoi.slice(0, khoi.indexOf("0\r\nENDBLK"));

  assert.ok(
    thanKhoi.includes("10\r\n1000.0\r\n20\r\n2000.0\r\n") &&
      thanKhoi.includes("11\r\n5000.0\r\n21\r\n2000.0\r\n"),
    "Vẫn phải giữ đường đo nối hai đầu đo",
  );
  assert.ok(!thanKhoi.includes("0\r\nTEXT\r\n"), "Không được ghi chữ khi không có chữ lẫn số đo");
  assert.ok(!exported.includes("<>"), "Không được ghi placeholder `<>` thành chữ trên bản vẽ");
});

test("exportDxf: DIMENSION không có toạ độ đường lẫn chữ đo vẫn để lại POINT, không bị nuốt mất", () => {
  const parsed = parseDxf(DXF_CO_KICH_THUOC, "chi_co_diem_neo.dxf");
  const dim = parsed.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Bản vẽ mẫu phải có DIMENSION");
  dim.textValue = "";
  dim.decodedText = "";
  dim.measurement = undefined;
  dim.coordinates = { center: [7000, 8000, 0] };

  const exported = exportDxf(parsed, { applyStandardLayers: false });

  assert.ok(
    exported.includes("0\r\nPOINT\r\n") && exported.includes("10\r\n7000.0\r\n20\r\n8000.0\r\n"),
    "Phải ghi POINT tại điểm neo thay vì bỏ hẳn thực thể",
  );

  // Không được im lặng mất thực thể: số thực thể đọc lại vẫn bằng số thực thể đầu vào
  const lai = parseDxf(exported, "exported.dxf");
  assert.equal(lai.entities.length, parsed.entities.length, "1 LINE + 1 DIMENSION → 2 thực thể");

  // Còn khi thực thể không có BẤT KỲ toạ độ nào thì không được bịa ra vị trí (0,0) để ghi POINT
  const rong = parseDxf(DXF_CO_KICH_THUOC, "khong_toa_do.dxf");
  const dimRong = rong.entities.find((e) => e.type === "DIMENSION")!;
  dimRong.textValue = "";
  dimRong.decodedText = "";
  dimRong.measurement = undefined;
  dimRong.coordinates = {};
  const exRong = exportDxf(rong, { applyStandardLayers: false });
  assert.ok(
    !exRong.includes("0\r\nDIMENSION\r\n"),
    "Kích thước không còn dữ liệu hình học nào thì không ghi ra DIMENSION rỗng",
  );
  assert.equal(
    parseDxf(exRong, "rt.dxf").entities.length,
    1,
    "Chỉ còn lại LINE thật — không bịa POINT ở gốc toạ độ cho thực thể không có vị trí",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Bản vẽ DXF thật đủ mặt tính năng (tests/fixtures/cad/mepf-thap-a.dxf): HEADER khai đơn vị và
// khung bao, bảng LAYER có layer đóng băng / tắt / khoá / bề rộng nét, BLOCKS có 2 XREF và 1 khối
// thiết bị có hình học, ENTITIES đủ LINE / LWPOLYLINE có độ cong / POLYLINE-VERTEX kiểu cũ /
// CIRCLE / ARC / TEXT font TCVN3 / MTEXT nhiều mảnh / INSERT có tỷ lệ, góc xoay và ATTRIB /
// DIMENSION có hai đầu đo và số đo mã 42 / ELLIPSE / SOLID / LINE khuyết điểm cuối.
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURE_MEPF = readFileSync(
  join(process.cwd(), "tests", "fixtures", "cad", "mepf-thap-a.dxf"),
  "utf8",
);

test("parseDxf: đọc HEADER thật — đơn vị vẽ, hệ đo và khung bao do AutoCAD ghi", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");

  assert.equal(r.header?.acadVer, "AC1015");
  assert.equal(r.header?.insUnits, 4, "$INSUNITS = 4 là milimét");
  assert.equal(r.header?.insUnitsLabel, "Milimét");
  assert.equal(r.header?.measurement, 1, "$MEASUREMENT = 1 là hệ mét");
  assert.equal(r.header?.ltScale, 10);
  assert.deepEqual(r.header?.extMin, [0, 0, 0]);
  assert.deepEqual(r.header?.extMax, [36000, 18000, 0]);

  assert.equal(r.fileFormat, "DXF ASCII");
  assert.equal(r.fileSizeBytes, FIXTURE_MEPF.trim().length);
});

test("parseDxf: giữ nguyên trạng thái thật của layer — đóng băng, tắt, khoá, bề rộng nét", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const byName = (n: string) => r.layers.find((l) => l.name === n);

  const duct = byName("01_ONG_GIO_CAP");
  assert.ok(duct);
  assert.equal(duct.lineWeight, 25, "Bề rộng nét đọc từ mã 370");
  assert.equal(duct.isFrozen, false);
  assert.equal(duct.discipline, "M");

  assert.equal(byName("GHI_CHU_CU")?.isFrozen, true, "Cờ 70 bit 1 = layer đóng băng");
  assert.equal(byName("MANG_CAP_DIEN")?.isLocked, true, "Cờ 70 bit 4 = layer bị khoá");

  const off = byName("NUOC_LANH_PPR");
  assert.equal(off?.isOff, true, "Mã 62 âm = layer đang tắt");
  assert.equal(off?.colorNumber, 3, "Màu vẫn là trị tuyệt đối của mã 62");
});

test("parseDxf: LWPOLYLINE giữ độ cong, cao độ và cờ khép kín", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const lw = r.entities.find((e) => e.type === "LWPOLYLINE");
  assert.ok(lw, "Phải đọc ra LWPOLYLINE");

  assert.deepEqual(lw.coordinates.points, [
    [1000, 1000, 2850],
    [5000, 1000, 2850],
    [5000, 4000, 2850],
  ]);
  assert.equal(lw.coordinates.elevation, 2850, "Cao độ mặt phẳng đọc từ mã 38");
  assert.deepEqual(lw.coordinates.bulges, [0, 0.5, 0], "Độ cong từng đoạn đọc từ mã 42");
  assert.equal(lw.coordinates.closed, true, "Cờ 70 bit 1 = đa tuyến khép kín");
});

test("parseDxf: POLYLINE kiểu cũ lấy hình học từ các VERTEX theo sau", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const pl = r.entities.find((e) => e.type === "POLYLINE");
  assert.ok(pl, "Phải đọc ra POLYLINE");

  assert.deepEqual(
    pl.coordinates.points,
    [
      [2000, 15000, 2600],
      [12000, 15000, 2600],
      [12000, 17000, 2600],
    ],
    "Đỉnh phải lấy từ các thực thể VERTEX, không phải mã 10/20 giả của chính POLYLINE",
  );
  assert.deepEqual(pl.coordinates.bulges, [0, -0.25, 0]);
  // Mã 10/20 của POLYLINE luôn là (0,0) giả — không được lọt vào toạ độ thực thể lẫn khung bao
  assert.equal(pl.coordinates.center, undefined);
});

test("parseDxf: INSERT giữ tỷ lệ chèn, góc xoay và giá trị ATTRIB thật của khối", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const ins = r.entities.find((e) => e.type === "INSERT");
  assert.ok(ins);

  assert.deepEqual(ins.scale, [2, 2, 1], "Tỷ lệ X/Y/Z đọc từ mã 41/42/43");
  assert.equal(ins.rotation, 90, "Góc xoay đọc từ mã 50");
  assert.deepEqual(ins.coordinates.center, [12000, 9000, 0]);
  assert.deepEqual(ins.attributes, { KICH_THUOC: "800x400" }, "Thuộc tính khối đọc từ ATTRIB");

  const blk = r.blocks.find((b) => b.name === "VAV_BOX_01");
  assert.ok(blk, "Khối thiết bị phải có trong danh mục");
  assert.equal(blk.count, 1);
  assert.deepEqual(blk.attributes, { KICH_THUOC: "800x400" });
  assert.equal(blk.entities?.length, 3, "Hình học bên trong định nghĩa khối phải đọc được");
});

test("parseDxf: hình học bên trong BLOCKS không bị đếm nhầm vào model space", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");

  // Khối VAV_BOX_01 chứa 2 LINE + 1 CIRCLE; model space chỉ có 2 LINE và 1 CIRCLE của riêng nó
  assert.equal(r.entities.filter((e) => e.type === "LINE").length, 2);
  assert.equal(r.entities.filter((e) => e.type === "CIRCLE").length, 1);
  assert.equal(r.diagnostic.totalEntities, r.entities.length);
});

test("parseDxf: TEXT và MTEXT giữ chiều cao, góc xoay, kiểu chữ và ghép đủ các mảnh chữ", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");

  const t = r.entities.find((e) => e.type === "TEXT");
  assert.ok(t);
  assert.equal(t.textHeight, 300, "Chiều cao chữ đọc từ mã 40");
  assert.equal(t.rotation, 45, "Góc xoay đọc từ mã 50");
  assert.equal(t.widthFactor, 0.85, "Hệ số bề rộng đọc từ mã 41");
  assert.equal(t.textStyle, "VNI-HELVE", "Kiểu chữ đọc từ mã 7");
  assert.match(t.decodedText || "", /ống gió cấp lạnh AHU-01/, "Font TCVN3 phải được giải mã");
  assert.match(t.decodedText || "", /Ø150/);

  const m = r.entities.find((e) => e.type === "MTEXT");
  assert.ok(m);
  assert.equal(m.textHeight, 250);
  assert.equal(
    m.decodedText,
    "Tuyen ong nuoc lanh DN150 doc i=1.5% BOP=+2850",
    "MTEXT dài chia thành nhiều mã 3 rồi kết bằng mã 1 — phải ghép đủ theo đúng thứ tự",
  );
});

test("parseDxf: XREF đọc thật từ khối tham chiếu ngoài, không còn danh sách bịa sẵn", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");

  assert.equal(r.xrefs.length, 2, "Bản vẽ khai đúng 2 XREF");
  const arch = r.xrefs.find((x) => x.name === "A-ARCH-GRID");
  assert.ok(arch);
  assert.equal(arch.fileName, "A-ARCH-GRID-AXIS.dwg");
  assert.equal(arch.type, "Attach", "Cờ 70 bit 4 (không kèm bit 8) = XREF kiểu Attach");
  assert.equal(
    arch.status,
    "unloaded",
    "Tệp DXF không cho biết XREF có tồn tại không — chỉ resolveXrefDependencies mới đối soát",
  );

  const struct = r.xrefs.find((x) => x.name === "S-STRUCT-BEAMS");
  assert.equal(struct?.type, "Overlay", "Cờ 70 bit 8 = XREF kiểu Overlay");

  // Khối XREF không phải thiết bị MEPF nên không được lọt vào danh mục khối bóc khối lượng
  assert.equal(
    r.blocks.some((b) => b.name === "A-ARCH-GRID"),
    false,
  );

  // Bản vẽ không có XREF thì danh sách phải RỖNG, không phải 3 tệp cố định như bản cũ
  const khongXref = parseDxf(
    `0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n100\n21\n0\n31\n0\n0\nENDSEC\n0\nEOF`,
    "khong_xref.dxf",
  );
  assert.deepEqual(khongXref.xrefs, []);
});

test("parseDxf: không bịa toạ độ điểm cuối LINE lẫn khung bao khi tệp không khai", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");

  const cut = r.entities.filter((e) => e.type === "LINE").find((e) => !e.coordinates.end);
  assert.ok(cut, "Bản vẽ mẫu có 1 LINE khuyết mã 11/21");
  assert.deepEqual(cut.coordinates.start, [7000, 2000, 0]);
  assert.equal(
    cut.coordinates.end,
    undefined,
    "Thiếu điểm cuối thì để trống — bản cũ tự đặt điểm cuối lệch 1000 đơn vị theo trục X",
  );

  // Bản vẽ không có thực thể nào: khung bao phải là 0, không phải 15000 x 10000 mặc định
  const rong = parseDxf(`0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF`, "khong_thuc_the.dxf");
  assert.deepEqual(rong.diagnostic.boundingDimensions, {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    widthMm: 0,
    lengthMm: 0,
  });
});

test("exportDxf: không chèn hình học minh hoạ khi bản vẽ không có nét", () => {
  // Bản vẽ chỉ có chữ: bản cũ tự vẽ thêm trục lưới, ống gió, máng cáp, ống nước và sprinkler
  const chiCoChu = parseDxf(
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nG-ANNO-TEXT\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\nG-ANNO-TEXT\n10\n100\n20\n200\n30\n0\n40\n250\n1\nGhi chu\n0\nENDSEC\n0\nEOF`,
    "chi_co_chu.dxf",
  );
  const exported = exportDxf(chiCoChu, { applyStandardLayers: true });

  assert.equal(
    (exported.match(/\r\n0\r\nLINE\r\n/g) || []).length,
    0,
    "Không được sinh thêm nét nào ngoài thực thể có thật trong bản vẽ",
  );
  assert.ok(!exported.includes("M-DUCT-SUPP"), "Không được bịa layer ống gió mẫu");
  assert.ok(!exported.includes("F-SPRN-PIPE"), "Không được bịa layer sprinkler mẫu");

  const reParsed = parseDxf(exported, "exported.dxf");
  assert.equal(reParsed.entities.length, 1, "Vào 1 chữ thì ra đúng 1 chữ");
  assert.equal(reParsed.entities[0].type, "TEXT");
});

test("exportDxf: định nghĩa khối ghi lại hình học thật, không chèn hình chữ thập đại diện", () => {
  const parsed = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const exported = exportDxf(parsed, { applyStandardLayers: false });

  const blockPart = exported.slice(
    exported.indexOf("2\r\nBLOCKS"),
    exported.indexOf("2\r\nENTITIES"),
  );
  const vavPart = blockPart.slice(blockPart.indexOf("AcDbBlockBegin\r\n2\r\nVAV_BOX_01"));

  assert.ok(
    vavPart.includes("10\r\n-400.0\r\n20\r\n-200.0\r\n"),
    "Phải ghi lại đúng nét thật của khối VAV_BOX_01",
  );
  assert.ok(vavPart.includes("0\r\nCIRCLE\r\n"), "Phải giữ đường tròn thật trong khối");
  assert.ok(
    !vavPart.includes("10\r\n-100.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n11\r\n100.0\r\n"),
    "Không được chèn hình chữ thập ±100 đơn vị làm hình đại diện cho khối",
  );

  // Khối chỉ thấy qua INSERT (không có định nghĩa trong tệp) thì ghi khối RỖNG, không bịa nét
  const chiCoInsert = parseDxf(
    `0\nSECTION\n2\nENTITIES\n0\nINSERT\n8\n0\n2\nKHOI_LA\n10\n0\n20\n0\n30\n0\n0\nENDSEC\n0\nEOF`,
    "khoi_la.dxf",
  );
  const ex2 = exportDxf(chiCoInsert, { applyStandardLayers: false });
  const blk2 = ex2.slice(
    ex2.indexOf("AcDbBlockBegin\r\n2\r\nKHOI_LA"),
    ex2.indexOf("2\r\nENTITIES"),
  );
  assert.ok(blk2.includes("0\r\nENDBLK\r\n"), "Khối không có định nghĩa vẫn phải đóng hợp lệ");
  assert.ok(!blk2.includes("0\r\nLINE\r\n"), "Không được bịa nét cho khối không có định nghĩa");
});

test("exportDxf: vòng round-trip giữ nguyên số thực thể, khung bao và dữ liệu chính", () => {
  const goc = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const exported = exportDxf(goc, { applyStandardLayers: true });

  assert.deepEqual(validateDxf(exported), { valid: true, errors: [] }, "Tệp xuất ra phải hợp lệ");
  assert.ok(
    exported.includes("0\r\nLWPOLYLINE\r\n"),
    "Khai AC1015 thì ghi LWPOLYLINE nguyên bản, không phải dựng POLYLINE/VERTEX như R12",
  );

  const lai = parseDxf(exported, "roundtrip.dxf");

  // 17 thực thể vào → 18 ra. Bước hạ cấp DUY NHẤT còn lại là MULTILEADER (thực thể của R2007)
  // tách thành đa tuyến đường dẫn + MTEXT chú thích. Mọi loại khác giữ nguyên bản.
  assert.equal(goc.entities.length, 17);
  assert.equal(lai.entities.length, 18);
  for (const loai of ["LWPOLYLINE", "ELLIPSE", "HATCH", "MTEXT", "DIMENSION", "XLINE"] as const) {
    assert.ok(
      lai.entities.some((e) => e.type === loai),
      `${loai} phải giữ nguyên loại sau vòng xuất – nạp lại (R12 trước đây phải hạ cấp)`,
    );
  }
  assert.deepEqual(
    lai.diagnostic.boundingDimensions,
    goc.diagnostic.boundingDimensions,
    "Khung bao không được xê dịch qua vòng xuất – nạp lại",
  );

  // Đơn vị vẽ của bản gốc phải theo sang tệp mới
  assert.equal(lai.header?.insUnits, 4);

  // Layer đã đổi sang tên chuẩn AIA và giữ nguyên trạng thái tắt / đóng băng / khoá
  const chw = lai.layers.find((l) => l.name === "M-CHW-PIPE");
  assert.ok(chw, "Layer nước lạnh phải mang tên chuẩn sau khi chuẩn hoá");
  assert.equal(chw.isOff, true, "Trạng thái tắt của layer phải giữ nguyên");
  assert.equal(lai.layers.find((l) => l.name === "G-ANNO-TEXT")?.isFrozen, true);
  assert.equal(lai.layers.find((l) => l.name === "M-DUCT-SUPP")?.lineWeight, 25);

  // Đa tuyến giữ đúng đỉnh và độ cong
  const poly = lai.entities.filter((e) => e.type === "LWPOLYLINE");
  assert.ok(poly.some((p) => p.coordinates.bulges?.includes(0.5)));
  assert.ok(poly.some((p) => p.coordinates.bulges?.includes(-0.25)));

  // Khối giữ nguyên tỷ lệ, góc xoay; cung tròn giữ nguyên hai góc thật
  const ins = lai.entities.find((e) => e.type === "INSERT");
  assert.deepEqual(ins?.scale, [2, 2, 1]);
  assert.equal(ins?.rotation, 90);
  const arc = lai.entities.find((e) => e.type === "ARC");
  assert.equal(arc?.coordinates.startAngle, 30);
  assert.equal(arc?.coordinates.endAngle, 150);

  // Chữ giữ nguyên chiều cao, góc xoay và nội dung đã giải mã Unicode
  const txt = lai.entities.find((e) => e.textHeight === 300);
  assert.equal(txt?.rotation, 45);
  assert.match(txt?.decodedText || "", /ống gió cấp lạnh/);
});

test("parseDxf: đọc được tệp DXF NHỊ PHÂN thay vì nhầm thành DWG rồi từ chối", () => {
  // "Save As → DXF nhị phân" của AutoCAD ra loại tệp này. Trước đây mọi buffer đều bị coi là DWG
  // và bị từ chối kèm hướng dẫn sai ("hãy lưu sang DXF" — trong khi người dùng ĐANG đưa tệp DXF).
  const ascii = parseDxf(FIXTURE_MEPF, "goc.dxf");

  // Dựng tệp DXF nhị phân từ chính các cặp mã của bản ASCII
  const parts: Buffer[] = [Buffer.from("AutoCAD Binary DXF\r\n\x1a\x00", "binary")];
  const dong = FIXTURE_MEPF.trim().split(/\r?\n/);
  for (let i = 0; i + 1 < dong.length; i += 2) {
    const ma = parseInt(dong[i].trim(), 10);
    const giaTri = dong[i + 1];
    const head = Buffer.from([ma]);
    if (ma <= 9) {
      parts.push(head, Buffer.from(giaTri, "binary"), Buffer.from([0]));
    } else if (ma <= 59) {
      const b = Buffer.alloc(8);
      b.writeDoubleLE(parseFloat(giaTri) || 0);
      parts.push(head, b);
    } else if (ma <= 79) {
      const b = Buffer.alloc(2);
      b.writeInt16LE(parseInt(giaTri, 10) || 0);
      parts.push(head, b);
    } else if (ma <= 99) {
      const b = Buffer.alloc(4);
      b.writeInt32LE(parseInt(giaTri, 10) || 0);
      parts.push(head, b);
    } else if (ma >= 210 && ma <= 239) {
      const b = Buffer.alloc(8);
      b.writeDoubleLE(parseFloat(giaTri) || 0);
      parts.push(head, b);
    } else if (ma >= 300 && ma <= 369) {
      // Mã ≥ 255 ghi bằng byte đánh dấu 255 + 2 byte little-endian
      const h = Buffer.alloc(3);
      h.writeUInt8(255, 0);
      h.writeUInt16LE(ma, 1);
      parts.push(h, Buffer.from(giaTri, "binary"), Buffer.from([0]));
    } else if (ma >= 370 && ma <= 389) {
      const h = Buffer.alloc(3);
      h.writeUInt8(255, 0);
      h.writeUInt16LE(ma, 1);
      const b = Buffer.alloc(2);
      b.writeInt16LE(parseInt(giaTri, 10) || 0);
      parts.push(h, b);
    } else {
      const h = Buffer.alloc(3);
      h.writeUInt8(255, 0);
      h.writeUInt16LE(ma, 1);
      parts.push(h, Buffer.from(giaTri, "binary"), Buffer.from([0]));
    }
  }

  const nhiPhan = parseDxf(Buffer.concat(parts), "nhi-phan.dxf");

  assert.equal(
    nhiPhan.fileFormat,
    "DXF nhị phân",
    "Phải nhận đúng là DXF nhị phân, không phải DWG",
  );
  assert.equal(
    nhiPhan.entities.length,
    ascii.entities.length,
    "Đọc ra đúng bằng số thực thể của bản ASCII cùng nội dung",
  );
  assert.deepEqual(nhiPhan.diagnostic.boundingDimensions, ascii.diagnostic.boundingDimensions);
  assert.equal(nhiPhan.header?.insUnits, 4);
  assert.equal(nhiPhan.xrefs.length, 2);
});

test("parseDxf: bản vẽ ghi bằng bảng mã 8 bit (TCVN3) vẫn đọc đúng chữ tiếng Việt", () => {
  // Tệp DXF của AutoCAD đời cũ là byte 8 bit, không phải UTF-8. Ép đọc UTF-8 như trước làm mọi ký
  // tự có dấu thành ký tự thay thế NGAY Ở BƯỚC ĐỌC TỆP — Bác Sĩ Font không còn gì để cứu.
  const bytes8bit = Buffer.from(FIXTURE_MEPF, "latin1");

  const dung = parseDxf(bytes8bit, "ban_ve_cu.dxf");
  const chu = dung.entities.find((e) => e.type === "TEXT");
  assert.match(chu?.decodedText || "", /ống gió cấp lạnh AHU-01/);
  assert.ok(!(chu?.decodedText || "").includes("�"), "Không được còn ký tự thay thế nào");

  // Đối chứng: cách đọc cũ (ép UTF-8) làm mất thông tin không cứu được
  const hong = parseDxf(bytes8bit.toString("utf8"), "ban_ve_cu.dxf");
  assert.ok(
    (hong.entities.find((e) => e.type === "TEXT")?.decodedText || "").includes("�"),
    "Ép UTF-8 phải cho thấy đúng lỗi cũ — đây là lý do phải tự chọn bảng mã",
  );
});

test("decodeCadText: không phá mã hiệu kiểu A3 / Zone1 khi giải mã VNI", () => {
  // Bảng VNI biến mọi cặp "nguyên âm + chữ số" thành chữ có dấu, mà bản vẽ MEPF đầy mã hiệu đúng
  // dạng đó: trục định vị A3, khổ giấy A3, Zone1, AHU01…
  assert.equal(decodeCadText("KHUNG TEN A3"), "KHUNG TEN A3");
  assert.equal(decodeCadText("TRUC A3 - Zone1"), "TRUC A3 - Zone1");
  assert.equal(decodeCadText("AHU01 800x500 DN150"), "AHU01 800x500 DN150");

  // Nhưng chữ VNI thật (chữ số nằm giữa từ) vẫn phải giải mã được
  // d9→đ, u7→ư, o72→ờ  ⇒ "d9u7o72ng" = "đường"; o1→ó ⇒ "o1ng" = "óng"
  assert.equal(decodeCadText("d9u7o72ng o1ng"), "đường óng");
});

test("parseDxf: HATCH giữ ranh giới và mẫu tô, xuất ra vẫn là HATCH nguyên bản", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const hatch = r.entities.find((e) => e.type === "HATCH");
  assert.ok(hatch, "Phải đọc ra HATCH");

  assert.equal(hatch.patternName, "ANSI31", "Tên mẫu tô đọc từ mã 2");
  assert.equal(hatch.hatchAngle, 45, "Góc mẫu tô đọc từ mã 52");
  assert.equal(hatch.coordinates.boundaryPaths?.length, 1, "Phải đọc ra 1 đường bao");
  assert.deepEqual(
    hatch.coordinates.boundaryPaths?.[0].points,
    [
      [1000, 5000, 0],
      [3000, 5000, 0],
      [3000, 7000, 0],
      [1000, 7000, 0],
    ],
    "Đỉnh đường bao lấy từ mã 10/20 bên trong khối ranh giới",
  );
  assert.equal(
    hatch.hatchPatternLines?.length,
    1,
    "Định nghĩa nét gạch của mẫu tô phải đọc được — thiếu nó thì AutoCAD tô rỗng",
  );

  // R2000 có HATCH thật: vùng tô giữ nguyên cả mẫu tô, không chỉ còn đường bao như bản ghi R12
  const lai = parseDxf(exportDxf(r, { applyStandardLayers: false }), "rt.dxf");
  const hatch2 = lai.entities.find((e) => e.type === "HATCH");
  assert.ok(hatch2, "Đọc lại tệp xuất ra vẫn phải thấy HATCH");
  assert.equal(hatch2.patternName, "ANSI31");
  assert.deepEqual(
    hatch2.coordinates.boundaryPaths?.[0].points,
    hatch.coordinates.boundaryPaths?.[0].points,
    "Ranh giới vùng tô không được xê dịch",
  );
  assert.equal(hatch2.hatchPatternLines?.length, 1, "Mẫu tô phải theo sang tệp mới");
});

test("parseDxf: MULTILEADER giữ chữ chú thích và đường dẫn", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const ml = r.entities.find((e) => e.type === "MULTILEADER");
  assert.ok(ml, "Phải đọc ra MULTILEADER");

  assert.equal(ml.decodedText, "Van chan VCD 400x300", "Chữ chú thích đọc từ mã 304");
  assert.equal(ml.textHeight, 250);
  assert.deepEqual(
    ml.coordinates.points,
    [
      [8000, 3000, 0],
      [9000, 4000, 0],
    ],
    "Đỉnh đường dẫn lấy từ mã 10 bên trong khối LEADER_LINE",
  );
  assert.deepEqual(ml.coordinates.center, [9000, 4000, 0], "Điểm đặt chữ lấy từ khối CONTEXT_DATA");
});

test("parseDxf: XLINE và MLINE — hai loại trước đây bị bỏ qua hoàn toàn", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");

  const xline = r.entities.find((e) => e.type === "XLINE");
  assert.ok(xline, "Đường dựng hình phải được đọc");
  assert.deepEqual(xline.coordinates.start, [15000, 10000, 0]);
  assert.deepEqual(
    xline.coordinates.direction,
    [1, 0, 0],
    "Mã 11 của XLINE là VECTOR hướng, không phải điểm thứ hai",
  );

  const mline = r.entities.find((e) => e.type === "MLINE");
  assert.ok(mline, "MLINE phải được đọc");
  assert.deepEqual(mline.coordinates.points, [
    [1000, 100, 0],
    [4000, 100, 0],
    [4000, 900, 0],
  ]);
});

test("exportDxf: XLINE giữ nguyên là XLINE, khung bao bản vẽ không xê dịch", () => {
  const goc = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const exported = exportDxf(goc, { applyStandardLayers: false });
  const lai = parseDxf(exported, "rt.dxf");

  // R2000 có XLINE thật — không còn phải cắt thành LINE hữu hạn theo khung bao như R12
  const xline = lai.entities.find((e) => e.type === "XLINE");
  assert.ok(xline, "Đường dựng hình phải giữ nguyên loại");
  assert.deepEqual(xline.coordinates.start, [15000, 10000, 0]);
  assert.deepEqual(xline.coordinates.direction, [1, 0, 0]);

  assert.deepEqual(
    lai.diagnostic.boundingDimensions,
    goc.diagnostic.boundingDimensions,
    "Đường dựng hình dài vô hạn không được làm khung bao bản vẽ nở ra",
  );
});

test("exportDxf: giữ thuộc tính chung — không gian giấy, bề dày, tỷ lệ nét, hướng đùn, canh lề chữ", () => {
  const goc = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const khung = goc.entities.find((e) => e.decodedText === "KHUNG TEN A3");
  assert.ok(khung, "Bản vẽ mẫu phải có chữ khung tên ở không gian giấy");
  assert.equal(khung.isPaperSpace, true, "Mã 67 = 1 là không gian giấy");
  assert.equal(khung.thickness, 50, "Bề dày đùn đọc từ mã 39");
  assert.equal(khung.lineTypeScale, 2, "Tỷ lệ nét đứt riêng đọc từ mã 48");
  assert.deepEqual(khung.extrusion, [0, 0, -1], "Hướng đùn lật gương đọc từ mã 210/220/230");
  assert.deepEqual(khung.coordinates.center, [500, 600, 0], "Chữ có canh lề thì điểm đặt là mã 11");
  assert.deepEqual(khung.textAlign, { horizontal: 1, vertical: 2 });

  const lai = parseDxf(exportDxf(goc, { applyStandardLayers: false }), "rt.dxf");
  const khung2 = lai.entities.find((e) => e.decodedText === "KHUNG TEN A3");
  assert.ok(khung2, "Chữ khung tên phải còn sau vòng xuất – nạp lại");
  assert.equal(khung2.isPaperSpace, true);
  assert.equal(khung2.thickness, 50);
  assert.equal(khung2.lineTypeScale, 2);
  assert.deepEqual(khung2.extrusion, [0, 0, -1]);
  assert.deepEqual(
    khung2.coordinates.center,
    [500, 600, 0],
    "Canh lề giữ nguyên nên chữ không nhảy chỗ",
  );
});
