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
    exportedDxf.includes("AC1021"),
    "DXF xuất phải khai R2007 (AC1021) — phiên bản đầu tiên có MULTILEADER, nên không loại thực thể nào phải hạ cấp",
  );
  assert.ok(!exportedDxf.includes("AC1009"), "Không được khai lùi về R12 nữa");
  assert.ok(
    exportedDxf.includes("100\r\nAcDbLayout\r\n1\r\nModel\r\n"),
    "Phải dựng bố cục in — thiếu LAYOUT thì không gian giấy không có chỗ bám",
  );
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

  // 17 vào → 17 ra: KHÔNG còn loại thực thể nào phải hạ cấp, không thực thể nào tách đôi
  assert.equal(goc.entities.length, 17);
  assert.equal(lai.entities.length, 17);
  for (const loai of [
    "LWPOLYLINE",
    "ELLIPSE",
    "HATCH",
    "MTEXT",
    "DIMENSION",
    "XLINE",
    "MLINE",
    "MULTILEADER",
  ] as const) {
    assert.ok(
      lai.entities.some((e) => e.type === loai),
      `${loai} phải giữ nguyên loại sau vòng xuất – nạp lại (bản ghi R12 trước đây phải hạ cấp)`,
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

test("parseDxf: MULTILEADER đọc đúng cấu trúc lồng thật của AutoCAD (300/301, 302/303, 304/305)", () => {
  const r = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const ml = r.entities.find((e) => e.type === "MULTILEADER");
  assert.ok(ml, "Phải đọc ra MULTILEADER");

  // Mã 304 mang HAI nghĩa tuỳ mức lồng: ở mức ngữ cảnh là chữ chú thích, trong khối LEADER{ là
  // thẻ mở LEADER_LINE{. Đọc phẳng theo mã nhóm sẽ nối luôn "LEADER_LINE{" vào chữ chú thích.
  assert.equal(ml.decodedText, "Van chan VCD 400x300", "Chữ chú thích không được lẫn thẻ mở khối");
  assert.equal(ml.textHeight, 250, "Chiều cao chữ nằm ở mã 41 trong ngữ cảnh, không phải mã 40");
  assert.deepEqual(ml.coordinates.leaderLines, [
    [
      [8000, 3000, 0],
      [9000, 4000, 0],
    ],
  ]);
  assert.equal(ml.mleaderContext?.leaders.length, 1);
  assert.equal(ml.mleaderContext?.leaders[0].doglegLength, 500);

  // Xuất ra vẫn là MULTILEADER nguyên bản, kèm kiểu chú thích dẫn trong OBJECTS
  const exported = exportDxf(r, { applyStandardLayers: false });
  assert.ok(exported.includes("100\r\nAcDbMLeader\r\n"), "Phải ghi MULTILEADER nguyên bản");
  assert.ok(
    exported.includes("100\r\nAcDbMLeaderStyle\r\n"),
    "Phải kèm kiểu chú thích dẫn — thiếu nó AutoCAD không dựng được chú thích",
  );
  assert.ok(
    exported.includes("1\r\nMULTILEADER\r\n2\r\nAcDbMLeader\r\n"),
    "Lớp không thuộc lõi DXF phải được khai trong section CLASSES",
  );

  const lai = parseDxf(exported, "rt.dxf");
  const ml2 = lai.entities.find((e) => e.type === "MULTILEADER");
  assert.ok(ml2);
  assert.equal(ml2.decodedText, "Van chan VCD 400x300");
  assert.deepEqual(ml2.coordinates.leaderLines, ml.coordinates.leaderLines);
});

test("exportDxf: MLINE giữ nguyên nét kép, không hạ thành đa tuyến trục", () => {
  const goc = parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf");
  const mline = goc.entities.find((e) => e.type === "MLINE");
  assert.ok(mline);
  assert.equal(mline.mlineVertices?.length, 3, "Phải đọc đủ cấu trúc đỉnh của MLINE");

  const exported = exportDxf(goc, { applyStandardLayers: false });
  assert.ok(exported.includes("100\r\nAcDbMline\r\n"), "Phải ghi MLINE nguyên bản");
  assert.ok(
    exported.includes("100\r\nAcDbMlineStyle\r\n"),
    "Phải kèm kiểu đường nhiều nét — thiếu nó AutoCAD không dựng được",
  );

  const lai = parseDxf(exported, "rt.dxf");
  const mline2 = lai.entities.find((e) => e.type === "MLINE");
  assert.ok(mline2, "Đọc lại vẫn phải là MLINE");
  assert.deepEqual(mline2.coordinates.points, mline.coordinates.points);
});

test("exportDxf: đa tuyến 3D giữ nguyên cao độ từng đỉnh, không bị ép phẳng", () => {
  // Tuyến ống thoát dốc i=1.5%: ba đỉnh ba cao độ. LWPOLYLINE là thực thể PHẲNG nên chuyển sang
  // đó sẽ bẹp cả tuyến về một cao độ — mất luôn độ dốc, thứ quyết định ống có thoát được không.
  const dxf = `0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\nP-PIPE-SANR\n66\n1\n70\n8\n10\n0\n20\n0\n30\n0\n0\nVERTEX\n8\nP-PIPE-SANR\n10\n0\n20\n0\n30\n2850\n0\nVERTEX\n8\nP-PIPE-SANR\n10\n5000\n20\n0\n30\n2775\n0\nVERTEX\n8\nP-PIPE-SANR\n10\n10000\n20\n0\n30\n2700\n0\nSEQEND\n8\nP-PIPE-SANR\n0\nENDSEC\n0\nEOF`;

  const goc = parseDxf(dxf, "ong_doc.dxf");
  assert.equal(goc.entities[0].coordinates.is3d, true, "Cờ 70 bit 8 = đa tuyến 3D");

  const lai = parseDxf(exportDxf(goc, { applyStandardLayers: false }), "rt.dxf");
  assert.equal(lai.entities[0].type, "POLYLINE", "Đa tuyến 3D phải giữ dạng POLYLINE/VERTEX");
  assert.deepEqual(
    lai.entities[0].coordinates.points,
    [
      [0, 0, 2850],
      [5000, 0, 2775],
      [10000, 0, 2700],
    ],
    "Cao độ từng đỉnh phải nguyên vẹn",
  );

  // Còn đa tuyến phẳng thì được hiện đại hoá sang LWPOLYLINE (đúng việc lệnh CONVERTPOLY làm)
  const phang = `0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\n0\n66\n1\n70\n0\n10\n0\n20\n0\n30\n0\n0\nVERTEX\n8\n0\n10\n0\n20\n0\n30\n0\n0\nVERTEX\n8\n0\n10\n100\n20\n0\n30\n0\n0\nSEQEND\n8\n0\n0\nENDSEC\n0\nEOF`;
  const laiPhang = parseDxf(exportDxf(parseDxf(phang, "p.dxf"), {}), "rt2.dxf");
  assert.equal(laiPhang.entities[0].type, "LWPOLYLINE");
});

test("exportDxf: HATCH giữ CẠNH CUNG là cung, không bẻ thành chuỗi đoạn thẳng", () => {
  // Vùng tô có biên cong (vùng bảo ôn, vùng cắt qua ống tròn) — bẻ cung thành đoạn thẳng là méo biên
  const dxf = `0\nSECTION\n2\nENTITIES\n0\nHATCH\n8\nM-INSU\n10\n0\n20\n0\n30\n0\n2\nANSI31\n70\n0\n71\n0\n91\n1\n92\n1\n93\n2\n72\n1\n10\n0\n20\n0\n11\n1000\n21\n0\n72\n2\n10\n500\n20\n0\n40\n500\n50\n0\n51\n180\n73\n1\n97\n0\n75\n1\n76\n1\n52\n0\n41\n1\n77\n0\n78\n1\n53\n45\n43\n0\n44\n0\n45\n-2.5\n46\n2.5\n79\n0\n47\n1\n98\n0\n0\nENDSEC\n0\nEOF`;

  const goc = parseDxf(dxf, "tô_cong.dxf");
  const canh = goc.entities[0].coordinates.boundaryPaths?.[0].edges;
  assert.equal(canh?.length, 2, "Phải đọc ra 2 cạnh có kiểu");
  assert.equal(canh?.[1].type, "arc", "Cạnh thứ hai phải là CUNG, không phải chuỗi đoạn thẳng");

  const lai = parseDxf(exportDxf(goc, { applyStandardLayers: false }), "rt.dxf");
  assert.deepEqual(
    lai.entities[0].coordinates.boundaryPaths?.[0].edges,
    canh,
    "Cạnh cung phải qua vòng xuất – nạp lại mà không đổi",
  );
});

test("exportDxf: SPLINE chỉ có điểm khớp được nội suy thành đường cong ĐI QUA đúng các điểm đó", () => {
  const fit: Array<[number, number, number]> = [
    [0, 0, 0],
    [1000, 800, 0],
    [2000, -400, 0],
    [3000, 600, 0],
    [4000, 0, 0],
  ];
  const dxf =
    `0\nSECTION\n2\nENTITIES\n0\nSPLINE\n8\nM-DUCT-SUPP\n70\n8\n71\n3\n74\n5\n` +
    fit.map((p) => `11\n${p[0]}\n21\n${p[1]}\n31\n${p[2]}`).join("\n") +
    `\n0\nENDSEC\n0\nEOF`;

  const goc = parseDxf(dxf, "cong.dxf");
  assert.equal(goc.entities[0].coordinates.knots, undefined, "Bản vẽ nguồn không khai vector knot");

  const lai = parseDxf(exportDxf(goc, { applyStandardLayers: false }), "rt.dxf");
  const sp = lai.entities[0];
  assert.equal(sp.type, "SPLINE", "Phải giữ là SPLINE, không hạ xuống đa tuyến");
  assert.equal(sp.coordinates.degree, 3);
  assert.equal(sp.coordinates.controlPoints?.length, 5);
  assert.equal(sp.coordinates.knots?.length, 9, "Vector knot kẹp hai đầu: n + p + 2 = 9");
  assert.deepEqual(sp.coordinates.points, fit, "Điểm khớp phải giữ nguyên");

  // Kiểm chứng toán: đường cong dựng từ điểm điều khiển phải ĐI QUA đúng từng điểm khớp
  const knots = sp.coordinates.knots!;
  const P = sp.coordinates.controlPoints!;
  const p = sp.coordinates.degree!;
  const N = (i: number, d: number, u: number): number => {
    if (d === 0) {
      const cuoi = knots[knots.length - 1];
      if (u === cuoi) return knots[i] <= u && u <= knots[i + 1] && knots[i] < knots[i + 1] ? 1 : 0;
      return knots[i] <= u && u < knots[i + 1] ? 1 : 0;
    }
    let a = 0;
    const dl = knots[i + d] - knots[i];
    if (dl !== 0) a = ((u - knots[i]) / dl) * N(i, d - 1, u);
    let b = 0;
    const dr = knots[i + d + 1] - knots[i + 1];
    if (dr !== 0) b = ((knots[i + d + 1] - u) / dr) * N(i + 1, d - 1, u);
    return a + b;
  };
  const doDai = fit
    .slice(1)
    .map((q, k) => Math.sqrt(Math.hypot(q[0] - fit[k][0], q[1] - fit[k][1])));
  const tong = doDai.reduce((a, b) => a + b, 0);
  let luy = 0;
  const us = [0, ...doDai.map((v) => (luy += v) / tong)];
  us[us.length - 1] = 1;

  us.forEach((u, k) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < P.length; i++) {
      const n = N(i, p, u);
      x += n * P[i][0];
      y += n * P[i][1];
    }
    assert.ok(
      Math.hypot(x - fit[k][0], y - fit[k][1]) < 1e-6,
      `Đường cong phải đi qua điểm khớp ${k} (${fit[k][0]}, ${fit[k][1]}), thực tế (${x}, ${y})`,
    );
  });
});

test("exportDxf: WIPEOUT giữ nguyên bản kèm định nghĩa ảnh trong OBJECTS", () => {
  // Vùng che có nhiệm vụ CHE nền. Hạ nó xuống đa tuyến như bản trước là sai về hiển thị:
  // vùng che biến thành một khung nhìn thấy được nằm chình ình trên bản vẽ.
  const dxf = `0\nSECTION\n2\nENTITIES\n0\nWIPEOUT\n8\nG-ANNO-TEXT\n90\n0\n10\n1000\n20\n2000\n30\n0\n11\n0.5\n21\n0\n31\n0\n12\n0\n22\n0.5\n32\n0\n13\n100\n23\n50\n340\n1A2\n70\n7\n280\n1\n281\n50\n282\n50\n283\n0\n71\n2\n91\n4\n14\n-0.5\n24\n-0.5\n14\n0.5\n24\n-0.5\n14\n0.5\n24\n0.5\n14\n-0.5\n24\n0.5\n0\nENDSEC\n0\nSECTION\n2\nOBJECTS\n0\nIMAGEDEF\n5\n1A2\n100\nAcDbRasterImageDef\n90\n0\n1\nmat_bang_tang_4.png\n10\n1024\n20\n768\n11\n1.0\n21\n1.0\n280\n1\n281\n0\n0\nENDSEC\n0\nEOF`;

  const goc = parseDxf(dxf, "che.dxf");
  assert.equal(
    goc.entities[0].imageDefHandle,
    "1A2",
    "Thực thể phải giữ handle trỏ tới định nghĩa",
  );
  assert.deepEqual(goc.imageDefs?.[0], {
    handle: "1A2",
    path: "mat_bang_tang_4.png",
    sizePx: [1024, 768],
    pixelSize: [1, 1],
  });

  const exported = exportDxf(goc, { applyStandardLayers: false });
  assert.ok(exported.includes("100\r\nAcDbWipeout\r\n"), "Phải ghi WIPEOUT nguyên bản");
  assert.ok(exported.includes("100\r\nAcDbRasterImageDef\r\n"), "Phải dựng lại IMAGEDEF");
  assert.ok(
    exported.includes("1\r\nWIPEOUT\r\n2\r\nAcDbWipeout\r\n"),
    "WIPEOUT không thuộc lõi DXF nên phải khai trong CLASSES",
  );

  const lai = parseDxf(exported, "rt.dxf");
  assert.equal(lai.entities[0].type, "WIPEOUT");
  assert.equal(lai.entities[0].coordinates.points?.length, 4, "Đường bao cắt phải nguyên vẹn");
  assert.equal(lai.imageDefs?.[0].path, "mat_bang_tang_4.png", "Đường dẫn ảnh phải theo sang");
});

test("exportDxf: khung nhìn và bố cục in của không gian giấy sống sót qua vòng xuất – nạp lại", () => {
  const dxf = `0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n1000\n21\n0\n31\n0\n0\nVIEWPORT\n8\nG-KHUNG\n67\n1\n10\n210\n20\n148\n30\n0\n40\n380\n41\n250\n68\n2\n69\n2\n12\n5000\n22\n5000\n45\n12000\n51\n0\n0\nENDSEC\n0\nEOF`;

  const goc = parseDxf(dxf, "bo_cuc.dxf");
  const vp = goc.entities.find((e) => e.type === "VIEWPORT");
  assert.ok(vp, "Khung nhìn phải được đọc, không còn bị bỏ qua im lặng");
  assert.equal(vp.isPaperSpace, true);
  assert.equal(vp.viewport?.viewHeight, 12000, "Chiều cao vùng nhìn quyết định tỷ lệ in");

  const exported = exportDxf(goc, { applyStandardLayers: false });
  assert.ok(
    exported.includes("100\r\nAcDbLayout\r\n1\r\nLayout1\r\n"),
    "Phải dựng bố cục Layout1 để không gian giấy có chỗ bám",
  );

  const lai = parseDxf(exported, "rt.dxf");
  const vp2 = lai.entities.find((e) => e.type === "VIEWPORT");
  assert.ok(vp2, "Khung nhìn phải còn sau vòng xuất – nạp lại");
  assert.deepEqual(vp2.viewport, vp.viewport, "Toàn bộ thông số khung nhìn phải nguyên vẹn");
  assert.equal(vp2.isPaperSpace, true, "Vẫn phải nằm ở không gian giấy");
});

test("exportDxf: toàn vẹn cấu trúc R2007 — handle duy nhất, chủ sở hữu tồn tại, $HANDSEED hợp lệ", () => {
  // Handle và quan hệ chủ sở hữu là thứ R12 hoàn toàn không có và cũng là chỗ dễ sai nhất khi
  // sinh tệp: trùng handle hoặc trỏ vào handle không tồn tại thì AutoCAD báo tệp hỏng.
  const exported = exportDxf(parseDxf(FIXTURE_MEPF, "mepf-thap-a.dxf"), {
    applyStandardLayers: true,
  });
  const dong = exported.split("\r\n");

  const handles = new Map<string, string>();
  const chuSoHuu: Array<{ owner: string; loai: string }> = [];
  let loai = "";
  let trongHeader = false;
  const trung: string[] = [];

  for (let i = 0; i + 1 < dong.length; i += 2) {
    const ma = dong[i];
    const giaTri = dong[i + 1];
    if (ma === "0") {
      loai = giaTri;
      if (giaTri === "ENDSEC") trongHeader = false;
    } else if (ma === "2" && loai === "SECTION") {
      trongHeader = giaTri === "HEADER";
    } else if (ma === "5" && !trongHeader) {
      // Trong HEADER, mã 5 là giá trị của biến $HANDSEED chứ không phải handle của thực thể
      if (handles.has(giaTri)) trung.push(`${giaTri} (${loai} và ${handles.get(giaTri)})`);
      handles.set(giaTri, loai);
    } else if (ma === "330" && !trongHeader) {
      chuSoHuu.push({ owner: giaTri, loai });
    }
  }

  assert.deepEqual(trung, [], "Không handle nào được cấp hai lần");
  assert.ok(handles.size > 50, `Tệp phải có đủ handle (đang có ${handles.size})`);

  const mocoi = chuSoHuu.filter((o) => o.owner !== "0" && !handles.has(o.owner));
  assert.deepEqual(
    mocoi.map((o) => `${o.loai} → ${o.owner}`),
    [],
    "Không thực thể nào được trỏ về một chủ sở hữu không tồn tại",
  );

  const seed = /\$HANDSEED\r\n\s*5\r\n(\w+)/.exec(exported)?.[1];
  assert.ok(seed, "Tệp R2007 bắt buộc khai $HANDSEED");
  const lonNhat = Math.max(...[...handles.keys()].map((h) => parseInt(h, 16)));
  assert.ok(
    parseInt(seed, 16) > lonNhat,
    `$HANDSEED (${seed}) phải lớn hơn mọi handle đã cấp (lớn nhất ${lonNhat.toString(16).toUpperCase()})`,
  );

  // Các cặp mở/đóng phải cân bằng
  const dem = (t: string) =>
    (exported.match(new RegExp(`\\r\\n0\\r\\n${t}\\r\\n`, "g")) || []).length;
  // SECTION đầu tiên nằm ngay đầu chuỗi nên không có \r\n dẫn trước — cộng bù 1
  assert.equal(dem("SECTION") + 1, dem("ENDSEC"), "Mỗi SECTION phải có đúng một ENDSEC");
  assert.equal(dem("TABLE"), dem("ENDTAB"), "Mỗi TABLE phải có đúng một ENDTAB");
  assert.equal(dem("BLOCK"), dem("ENDBLK"), "Mỗi BLOCK phải có đúng một ENDBLK");
});
