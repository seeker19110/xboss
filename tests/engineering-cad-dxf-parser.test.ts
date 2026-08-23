import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDxf,
  decodeCadText,
  convertDxfToSpatialRoutes,
  generateStandardizedAutocadScript,
  DxfEntityRaw,
  resolveXrefDependencies,
  bindXrefToMaster,
  DwgUnsupportedError,
} from "@/lib/ky-thuat/cad/dxf-parser";

describe("CAD DXF Parser & 2D-to-3D Spatial Extrusion Suite", () => {
  const sampleDxfContent = `0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
01_ONG_GIO_CAP
62
140
6
CONTINUOUS
0
LAYER
2
NUOC_LANH_PPR
62
70
6
CONTINUOUS
0
LAYER
2
TEXT_ANNOTATION
62
7
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
01_ONG_GIO_CAP
10
1000.0
20
2000.0
30
3100.0
11
9000.0
21
2000.0
31
3100.0
0
LINE
8
NUOC_LANH_PPR
10
1000.0
20
3500.0
30
2600.0
11
7000.0
21
3500.0
31
2600.0
0
TEXT
8
TEXT_ANNOTATION
10
2000.0
20
2050.0
30
3100.0
1
èng giã cÊp l¹nh AHU-01 800x500 BOP=+2.85m %%c150
0
INSERT
8
01_ONG_GIO_CAP
2
BLK_DIFFUSER_600
10
3000.0
20
2000.0
30
2800.0
0
ENDSEC
0
EOF`;

  it("1. parseDxf giải mã chính xác các thực thể LINE, TEXT, INSERT và cấu trúc LAYER", () => {
    const result = parseDxf(sampleDxfContent, "test_duct.dxf");

    assert.equal(result.fileName, "test_duct.dxf");
    assert.equal(result.entities.length, 4);
    assert.equal(result.layers.length >= 3, true);

    // Kiểm tra layer mapping
    const ductLayer = result.layers.find((l) => l.name === "01_ONG_GIO_CAP");
    assert.ok(ductLayer);
    assert.equal(ductLayer.discipline, "M");
    assert.equal(ductLayer.standardName, "M-DUCT-SUPP");

    // Kiểm tra block
    const diffuserBlock = result.blocks.find((b) => b.name === "BLK_DIFFUSER_600");
    assert.ok(diffuserBlock);
    assert.equal(diffuserBlock.count, 1);
    assert.equal(diffuserBlock.mappedBoqCode, "HVAC-DIFF-600");
  });

  it("2. decodeCadText chuyển đổi đúng font tiếng Việt cũ và ký hiệu kỹ thuật Ø, ±, °", () => {
    const rawText = "èng giã %%c150 cao ®é %%p0.000 nhiÖt ®é 68\\U+00B0C";
    const decoded = decodeCadText(rawText);

    assert.ok(decoded.includes("Ống gió") || decoded.includes("ống gió"));
    assert.ok(decoded.includes("Ø150"));
    assert.ok(decoded.includes("±0.000"));
    assert.ok(decoded.includes("°C"));
  });

  it("3. convertDxfToSpatialRoutes đùn tuyến 2D thành bao không gian 3D Bounding Envelope và phân tầng đúng", () => {
    const entities: DxfEntityRaw[] = [
      {
        id: "E-1",
        type: "LINE",
        layer: "01_ONG_GIO_CAP",
        coordinates: {
          start: [1000, 2000, 3100],
          end: [9000, 2000, 3100],
        },
      },
      {
        id: "E-2",
        type: "LINE",
        layer: "NUOC_LANH_PPR",
        coordinates: {
          start: [1000, 3500, 2600],
          end: [7000, 3500, 2600],
        },
      },
    ];

    const routes = convertDxfToSpatialRoutes(entities);
    assert.equal(routes.length, 2);

    const ductRoute = routes.find((r) => r.system === "HVAC");
    assert.ok(ductRoute);
    assert.equal(ductRoute.corridorTier, "Tier 1 (Gió)");
    assert.equal(ductRoute.elevationBopMm, 2875);
    assert.equal(ductRoute.insulationMm, 25);
    assert.equal(ductRoute.lengthMm, 8000);

    const pipeRoute = routes.find((r) => r.system === "WATER");
    assert.ok(pipeRoute);
    assert.equal(pipeRoute.corridorTier, "Tier 3 (Nước)");
    assert.equal(pipeRoute.elevationBopMm, 2368);
  });

  it("4. generateStandardizedAutocadScript sinh kịch bản .SCR hợp lệ để chuẩn hóa layer và purge", () => {
    const parsed = parseDxf(sampleDxfContent);
    const scr = generateStandardizedAutocadScript(parsed.layers);

    assert.ok(scr.includes("-RENAME LA"));
    assert.ok(scr.includes("M-DUCT-SUPP"));
    assert.ok(scr.includes("-PURGE LA * N"));
    assert.ok(scr.includes("AUDIT Y"));
  });

  it("5. parseDxf từ chối tệp DWG nhị phân thay vì bịa layer/metadata (M99 PR0)", () => {
    const sampleDwgBuffer = Buffer.alloc(512);
    sampleDwgBuffer.write("AC1027", 0, 6, "ascii");
    sampleDwgBuffer.write("M-HVAC-DUCT-SUPP", 64, "latin1");
    sampleDwgBuffer.write("P-PIPE-COLD", 128, "latin1");

    assert.throws(() => parseDxf(sampleDwgBuffer, "23056-VHT-CD-A-M-205.dwg"), DwgUnsupportedError);
  });

  it("6. resolveXrefDependencies & bindXrefToMaster tự động nhận diện và gộp XREF", () => {
    const baseParsed = parseDxf(sampleDxfContent, "Master_MEP_T4.dxf");
    const parsedWithXrefs = {
      ...baseParsed,
      xrefs: [
        {
          id: "XREF-01",
          name: "A-ARCH-GRID-AXIS.dwg",
          originalPath: "Xref/ARCH/A-ARCH-GRID-AXIS.dwg",
          path: "Xref/ARCH/A-ARCH-GRID-AXIS.dwg",
          fileName: "A-ARCH-GRID-AXIS.dwg",
          type: "Overlay" as const,
          status: "missing" as const,
          entityCount: 0,
          layerCount: 0,
          description: "Mặt bằng kiến trúc",
          isBound: false,
        },
      ],
    };

    const folderFiles = [
      { name: "A-ARCH-GRID-AXIS.dwg" },
      { name: "S-STRUCT-BEAMS-COLS.dwg" },
      { name: "standard.ctb" },
    ];

    const resolved = resolveXrefDependencies(parsedWithXrefs, folderFiles);
    const archXref = resolved.find((x) => x.id === "XREF-01");
    assert.ok(archXref);
    assert.equal(archXref.status, "resolved");

    const bound = bindXrefToMaster(parsedWithXrefs, "XREF-01");
    const boundXref = bound.xrefs.find((x) => x.id === "XREF-01");
    assert.ok(boundXref);
    assert.equal(boundXref.isBound, true);
    assert.equal(boundXref.type, "Attach");
  });
});
