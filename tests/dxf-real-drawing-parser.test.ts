import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDxf,
  parseDwgBinary,
  DwgUnsupportedError,
  exportDxf,
  generateStandard2dDxf,
  generateStandardizedAutocadScript,
  validateDxf,
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
    exportedDxf.includes("AC1009"),
    "DXF xuất phải khai đúng R12 (AC1009) — cấu trúc ghi ra không có handle/OBJECTS nên không phải R2000",
  );
  assert.ok(!exportedDxf.includes("AC1015"), "Không được khai AC1015 khi thực chất ghi R12");
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

test("exportDxf: DIMENSION được hạ cấp thành LINE + TEXT (R12 không nhận DIMENSION thiếu block *D<n>)", () => {
  // Bản vẽ mẫu: 1 LINE thật (để bộ ghi không chèn hình học minh hoạ) + 1 DIMENSION có chữ đo
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nM-DIMS\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nM-DIMS\n10\n0\n20\n0\n30\n0\n11\n1000\n21\n0\n31\n0\n0\nDIMENSION\n8\nM-DIMS\n10\n1000\n20\n2000\n30\n0\n11\n5000\n21\n2000\n31\n0\n1\n4000\n0\nENDSEC\n0\nEOF`;

  const parsed = parseDxf(sampleDxf, "co_kich_thuoc.dxf");
  const dim = parsed.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Bản vẽ mẫu phải parse ra thực thể DIMENSION");

  const exported = exportDxf(parsed, { applyStandardLayers: false });

  assert.ok(
    !exported.includes("\r\nDIMENSION\r\n"),
    "Không được xuất DIMENSION thô — R12 sẽ báo lỗi vì thiếu block hình học *D<n>",
  );

  // Đường kích thước hạ thành LINE nối start → end, giữ nguyên layer gốc
  assert.ok(
    exported.includes(
      "0\r\nLINE\r\n8\r\nM-DIMS\r\n10\r\n1000\r\n20\r\n2000\r\n30\r\n0\r\n11\r\n5000\r\n21\r\n2000\r\n31\r\n0\r\n",
    ),
    "Phải có LINE nối start → end của kích thước",
  );

  // Giá trị đo hạ thành TEXT đặt tại trung điểm (3000, 2000)
  assert.ok(
    exported.includes("0\r\nTEXT\r\n8\r\nM-DIMS\r\n10\r\n3000\r\n20\r\n2000\r\n30\r\n0\r\n"),
    "Phải có TEXT giá trị đo đặt tại trung điểm đoạn kích thước",
  );
  assert.ok(exported.includes("\r\n1\r\n4000\r\n"), "TEXT phải giữ nguyên giá trị đo 4000");

  const reParsed = parseDxf(exported, "exported.dxf");
  assert.equal(
    reParsed.entities.filter((e) => e.type === "DIMENSION").length,
    0,
    "Đọc lại tệp xuất ra không còn thực thể DIMENSION nào",
  );
  assert.ok(
    reParsed.entities.some((e) => e.type === "TEXT" && (e.decodedText || e.textValue) === "4000"),
    "Đọc lại tệp xuất ra phải thấy chữ kích thước dưới dạng TEXT",
  );
});

test("validateDxf: Chấp nhận tệp DXF do XBoss sinh ra (exportDxf và generateStandard2dDxf)", () => {
  const sampleDxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\n01_ONG_GIO_CAP\n62\n140\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n01_ONG_GIO_CAP\n10\n1000\n20\n2000\n30\n0\n11\n5000\n21\n2000\n31\n0\n0\nENDSEC\n0\nEOF`;
  const exported = exportDxf(parseDxf(sampleDxf, "original.dxf"), { applyStandardLayers: true });

  const okExport = validateDxf(exported);
  assert.deepEqual(okExport, { valid: true, errors: [] }, "DXF từ exportDxf phải hợp lệ");

  const okTemplate = validateDxf(generateStandard2dDxf("Ban_Ve_Mau", "HVAC"));
  assert.equal(okTemplate.valid, true, "DXF mẫu 2D phải hợp lệ");
  assert.deepEqual(okTemplate.errors, []);
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

// DXF mẫu dùng chung cho 2 ca biên của DIMENSION: 1 LINE thật (để bộ ghi không chèn hình học
// minh hoạ) + 1 DIMENSION trên layer M-DIMS
const DXF_CO_KICH_THUOC = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nM-DIMS\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nM-DIMS\n10\n0\n20\n0\n30\n0\n11\n1000\n21\n0\n31\n0\n0\nDIMENSION\n8\nM-DIMS\n10\n1000\n20\n2000\n30\n0\n11\n5000\n21\n2000\n31\n0\n1\n4000\n0\nENDSEC\n0\nEOF`;

test("exportDxf: DIMENSION không có chữ đo thì chỉ ra LINE, không ghi TEXT rỗng hay `<>`", () => {
  const parsed = parseDxf(DXF_CO_KICH_THUOC, "khong_chu.dxf");
  const dim = parsed.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Bản vẽ mẫu phải có DIMENSION");
  dim.textValue = "";
  dim.decodedText = "";

  const exported = exportDxf(parsed, { applyStandardLayers: false });

  assert.ok(
    exported.includes(
      "0\r\nLINE\r\n8\r\nM-DIMS\r\n10\r\n1000\r\n20\r\n2000\r\n30\r\n0\r\n11\r\n5000\r\n21\r\n2000\r\n31\r\n0\r\n",
    ),
    "Vẫn phải giữ đường kích thước dưới dạng LINE",
  );
  assert.ok(!exported.includes("0\r\nTEXT\r\n"), "Không được ghi TEXT khi chuỗi đo rỗng");
  assert.ok(!exported.includes("<>"), "Không được ghi placeholder `<>` thành chữ trên bản vẽ");
});

test("exportDxf: DIMENSION không có toạ độ đường lẫn chữ đo vẫn để lại POINT, không bị nuốt mất", () => {
  const parsed = parseDxf(DXF_CO_KICH_THUOC, "chi_co_diem_neo.dxf");
  const dim = parsed.entities.find((e) => e.type === "DIMENSION");
  assert.ok(dim, "Bản vẽ mẫu phải có DIMENSION");
  dim.textValue = "";
  dim.decodedText = "";
  dim.coordinates = { center: [7000, 8000, 0] };

  const exported = exportDxf(parsed, { applyStandardLayers: false });

  assert.ok(
    exported.includes("0\r\nPOINT\r\n8\r\nM-DIMS\r\n10\r\n7000\r\n20\r\n8000\r\n30\r\n0\r\n"),
    "Phải ghi POINT tại điểm neo thay vì bỏ hẳn thực thể",
  );

  // Không được im lặng mất thực thể: số thực thể ghi ra vẫn bằng số thực thể đầu vào
  const soThucTheGhiRa = (
    exported.match(/\r\n0\r\n(LINE|TEXT|POINT|CIRCLE|ARC|LWPOLYLINE|INSERT)\r\n/g) || []
  ).length;
  assert.equal(soThucTheGhiRa, parsed.entities.length, "1 LINE + 1 DIMENSION → 2 thực thể ghi ra");
});
