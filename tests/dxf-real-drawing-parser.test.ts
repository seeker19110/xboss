import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDxf,
  parseDwgBinary,
  exportDxf,
  generateStandard2dDxf,
  generateStandardizedAutocadScript,
} from "@/lib/cad/dxf-parser";
import { validateDxf } from "@/lib/cad/dxf-writer";
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
  assert.ok(
    exportedDxf.includes("AC1009"),
    "DXF xuất phải là R12 (AC1009) — R2000+ đòi handle/subclass marker mà bộ ghi không sinh",
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

  // Cổng chặn thật: tệp xuất ra phải qua được bộ kiểm cấu trúc AutoCAD.
  const check = validateDxf(exportedDxf);
  assert.deepEqual(check.errors, [], "DXF xuất ra không được có lỗi cấu trúc");
  assert.ok(check.valid);
});

test("exportDxf: bản vẽ 2D thuần — mọi toạ độ Z bằng 0 và không còn thực thể ngoài R12", () => {
  const parsed = {
    layers: [
      {
        name: "ONG GIO",
        standardName: "M-DUCT-SUPP",
        colorNumber: 4,
        colorHex: "#ffffff",
        lineType: "CONTINUOUS",
        isStandardized: true,
        discipline: "M" as const,
        entityCount: 2,
      },
    ],
    entities: [
      // Cao độ Z của file gốc phải bị ép về 0 khi chuẩn hóa 2D.
      {
        id: "E1",
        type: "LINE" as const,
        layer: "ONG GIO",
        coordinates: {
          start: [0, 0, 3100] as [number, number, number],
          end: [1000, 0, 2900] as [number, number, number],
        },
      },
      // LWPOLYLINE không tồn tại trong R12 — phải hạ thành POLYLINE/VERTEX/SEQEND.
      {
        id: "E2",
        type: "LWPOLYLINE" as const,
        layer: "ONG GIO",
        coordinates: {
          points: [
            [0, 0, 0],
            [500, 500, 0],
          ] as Array<[number, number, number]>,
        },
      },
      // Chữ tiếng Việt phải được escape \U+XXXX để AutoCAD hiện đúng dấu.
      {
        id: "E3",
        type: "TEXT" as const,
        layer: "ONG GIO",
        coordinates: { center: [10, 20, 0] as [number, number, number] },
        decodedText: "Ống gió 800x500",
      },
    ],
    blocks: [],
    diagnostic: { boundingDimensions: { minX: 0, minY: 0, maxX: 1000, maxY: 500 } },
  } as unknown as Parameters<typeof exportDxf>[0];

  const out = exportDxf(parsed, { applyStandardLayers: true });

  assert.ok(!out.includes("LWPOLYLINE"), "R12 không có LWPOLYLINE");
  assert.ok(out.includes("POLYLINE") && out.includes("VERTEX") && out.includes("SEQEND"));
  assert.ok(out.includes("\\U+1ED0ng"), "Chữ tiếng Việt phải escape thành \\U+XXXX");
  assert.ok(out.includes("M-DUCT-SUPP"), "Layer phải dùng tên đã chuẩn hóa");

  // Không còn toạ độ Z khác 0 (mã nhóm 30/31 luôn phải là 0.0).
  // File DXF ASCII xen kẽ (mã nhóm, giá trị) nên chỉ dòng chẵn mới là mã nhóm.
  const lines = out.split("\r\n");
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(lines[i]);
    if (code === 30 || code === 31) {
      assert.equal(Number(lines[i + 1]), 0, `Toạ độ Z phải bằng 0, gặp ${lines[i + 1]}`);
    }
  }

  const check = validateDxf(out);
  assert.deepEqual(check.errors, []);
  assert.ok(
    !check.warnings.some((w) => w.code === "NOT_FLAT_2D"),
    "Không được còn cảnh báo bản vẽ chưa phẳng 2D",
  );
});

test("validateDxf: bắt được các lỗi cấu trúc khiến AutoCAD không mở được tệp", () => {
  // Chính lỗi cũ của bộ ghi: khai R2000 nhưng ghi thực thể kiểu R12.
  const fakeR2000 =
    "0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1015\r\n0\r\nENDSEC\r\n" +
    "0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nENDSEC\r\n" +
    "0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nLWPOLYLINE\r\n8\r\n0\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n";
  const bad = validateDxf(fakeR2000);
  assert.equal(bad.valid, false);
  const codes = bad.errors.map((e) => e.code);
  assert.ok(codes.includes("VERSION_WITHOUT_SUBCLASS"));
  assert.ok(codes.includes("ENTITY_NOT_IN_R12"));

  // Thiếu EOF = tệp bị cắt cụt.
  const truncated =
    "0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n0\r\nENDSEC\r\n";
  assert.ok(validateDxf(truncated).errors.some((e) => e.code === "NO_EOF"));

  // Layer dùng nhưng chưa khai trong bảng LAYER.
  const undeclared =
    "0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n0\r\nENDSEC\r\n" +
    "0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nENDSEC\r\n" +
    "0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nLINE\r\n8\r\nCHUA_KHAI\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n";
  assert.ok(validateDxf(undeclared).errors.some((e) => e.code === "UNDECLARED_LAYER"));

  assert.equal(validateDxf("").valid, false);
});

test("generateStandard2dDxf: mẫu bản vẽ 2D chuẩn mở lại được trên AutoCAD", () => {
  const out = generateStandard2dDxf("Mat_Bang_Cap_Gio", "HVAC");
  const check = validateDxf(out);
  assert.deepEqual(check.errors, []);
  assert.ok(out.includes("AC1009"));
  assert.ok(out.includes("TABLE") && out.includes("STYLE"), "Phải khai bảng STYLE cho TEXT");
});
