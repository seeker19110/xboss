import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDxf,
  decodeCadText,
  convertDxfToSpatialRoutes,
  DxfEntityRaw,
  resolveXrefDependencies,
  bindXrefToMaster,
  DwgUnsupportedError,
  normalizeCadLayers,
  tapLayerDaChuan,
} from "@/lib/ky-thuat/cad/dxf-parser";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

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

  it("2b. decodeCadText idempotent — giải mã lần hai không được làm hỏng chữ đã đúng Unicode", () => {
    // Vòng đời thật: nạp bản vẽ TCVN3 → chuẩn hoá → xuất DXF → nạp lại tệp đã chuẩn hoá.
    // Bảng TCVN3 ánh xạ chồng lên chữ Latin-1 hợp lệ (`ó` → `ú`, `ã` → `ó`) nên nếu giải mã lần
    // hai thì "ống gió" hoá "ống giú" ngay trên bản vẽ đã phát hành.
    const tcvn3 = "èng giã cÊp l¹nh AHU-01 800x500";
    const lan1 = decodeCadText(tcvn3);
    assert.match(lan1, /gió/, "Lần đầu phải giải mã đúng TCVN3");

    const lan2 = decodeCadText(lan1);
    assert.equal(lan2, lan1, "Giải mã lại chuỗi đã đúng Unicode phải trả về nguyên văn");

    // Chữ Việt Unicode nằm gọn trong khoảng Latin-1 cũng không được đụng vào
    assert.equal(decodeCadText("ống gió hồi 700x400"), "ống gió hồi 700x400");

    // Ký hiệu kỹ thuật vẫn được xử lý ở lần chạy nào cũng vậy
    assert.equal(decodeCadText("Ø150 ±0.000"), "Ø150 ±0.000");
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

/**
 * Vá 2026-08-25 — ánh xạ layer phải IDEMPOTENT: chạy XBOSS_CHUANHOA lần hai trên bản vẽ đã chuẩn
 * hóa không được đổi layer đúng chuẩn sang hệ khác (trước khi vá: M-DUCT-EXHT → M-DUCT-SUPP,
 * F-SPRN-PIPE → P-PIPE-DOMW, M-DUCT-SUPPEDGE → M-DUCT-SUPP = gộp nhầm hệ + bóc trùng khối lượng).
 */
describe("normalizeCadLayers: bất biến idempotent", () => {
  const pack = getCurrentRulePack();
  const targets = [
    ...new Set(pack.layerMap.groups.flatMap((g) => g.branches.map((b) => b.target))),
  ];
  const hauToBien = pack.drawTools.edgeLayerSuffix;

  it("giữ nguyên tên các layer đã đúng chuẩn (kể cả layer nét biên M100)", () => {
    const daChuan = [
      "M-DUCT-SUPP",
      "M-DUCT-EXHT",
      "P-PIPE-SANR",
      "F-SPRN-PIPE",
      "ELV-CABL-TRAY",
      "M-DUCT-SUPPEDGE",
    ];
    const anhXa = normalizeCadLayers(daChuan);
    for (const ten of daChuan) {
      assert.equal(anhXa[ten], ten, `Layer "${ten}" đã đúng chuẩn mà vẫn bị đổi tên`);
    }
  });

  it("map(x) === x với MỌI layer đích khai trong rule pack + biến thể nét biên", () => {
    assert.ok(targets.length >= 8, "Rule pack phải khai đủ layer đích cho 5 phân hệ MEPF");
    assert.ok(hauToBien.length > 0, "Rule pack hiện hành phải khai drawTools.edgeLayerSuffix");

    const ten = [...targets, ...targets.map((t) => t + hauToBien)];
    const anhXa = normalizeCadLayers(ten);
    for (const t of ten) assert.equal(anhXa[t], t, `Layer chuẩn "${t}" bị đổi tên`);
  });

  it("map(map(x)) === map(x) trên cả tên layer bẩn lẫn tên đã chuẩn", () => {
    const mau = [
      "01_M_ONG_GIO_CAP_CHINH",
      "ONG GIO THAI EA",
      "04_P_CAP_THOAT_NUOC_THAI",
      "M_DUCT_SUPPLY",
      "E-CABLE-TRAY",
      "DIEN_NHE_ELV_CAMERA",
      "06_F_PCCC_SPRINKLER",
      "0",
      "ZZZ_KHONG_KHOP_GI",
      ...targets,
    ];
    const lan1 = normalizeCadLayers(mau);
    const lan2 = normalizeCadLayers(mau.map((t) => lan1[t]));
    for (const t of mau) {
      assert.equal(lan2[lan1[t]], lan1[t], `Layer "${t}" đổi tiếp ở lần chuẩn hóa thứ hai`);
    }
  });

  it("hồi quy: layer bẩn vẫn ánh xạ y như trước khi vá", () => {
    const anhXa = normalizeCadLayers([
      "01_M_ONG_GIO_CAP_CHINH",
      "M_DUCT_SUPPLY",
      "ONG_GIO_THAI_EA",
      "04_P_CAP_THOAT_NUOC_THAI",
      "E-CABLE-TRAY",
      "MANG_CAP_DIEN",
      "DIEN_NHE_ELV_CAMERA",
      "06_F_PCCC_SPRINKLER",
      "P_WATER_PIPE",
      "ZZZ_KHONG_KHOP_GI",
      // Tên đã chuẩn nhưng viết thường: chỉ chuẩn hoá hoa/thường, KHÔNG đổi sang hệ khác.
      "f-sprn-pipe",
    ]);
    assert.deepEqual(anhXa, {
      "01_M_ONG_GIO_CAP_CHINH": "M-DUCT-SUPP",
      M_DUCT_SUPPLY: "M-DUCT-SUPP",
      ONG_GIO_THAI_EA: "M-DUCT-EXHT",
      "04_P_CAP_THOAT_NUOC_THAI": "P-PIPE-SANR",
      "E-CABLE-TRAY": "E-TRAY-PWRR",
      MANG_CAP_DIEN: "E-TRAY-PWRR",
      DIEN_NHE_ELV_CAMERA: "E-TRAY-PWRR",
      "06_F_PCCC_SPRINKLER": "F-SPRN-PIPE",
      P_WATER_PIPE: "P-PIPE-DOMW",
      ZZZ_KHONG_KHOP_GI: "ZZZ_KHONG_KHOP_GI",
      "f-sprn-pipe": "F-SPRN-PIPE",
    });
  });

  it("chịu được rule pack không có khối drawTools (v1–v3): vẫn miễn trừ layer đích", () => {
    const packV3 = { layerMap: pack.layerMap };
    const daChuan = tapLayerDaChuan(packV3);
    for (const t of targets) assert.ok(daChuan.has(t), `Thiếu layer đích "${t}"`);
    assert.equal(
      daChuan.has(`M-DUCT-SUPP${hauToBien}`),
      false,
      "Không có drawTools thì không suy ra layer biên",
    );
  });
});
