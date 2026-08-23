import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCadVectorDiff,
  generateAutoLispDetailScript,
  convertTcvn3ToUnicode,
  normalizeCadLayers,
  extrude2dPolylineTo3d,
  CadEntity,
} from "@/lib/ky-thuat/engineering-cad-skills";

test("M65: computeCadVectorDiff phát hiện chính xác các thực thể thêm/xóa/sửa và ước lượng VO", () => {
  const baseEntities: CadEntity[] = [
    {
      id: "E-1",
      type: "polyline",
      layer: "M-DUCT-SUPP",
      coordinates: { start: [1000, 2000, 2800], end: [5000, 2000, 2800] },
      textValue: "Duct 500x300",
    },
    {
      id: "E-2",
      type: "insert_block",
      layer: "M-DIFFUSER",
      coordinates: { center: [2000, 2000, 2700] },
      blockName: "DIFF_600X600",
    },
    {
      id: "E-3",
      type: "line",
      layer: "E-TRAY-PWRR",
      coordinates: { start: [0, 0, 3000], end: [1000, 0, 3000] },
    },
  ];

  const compareEntities: CadEntity[] = [
    // E-1 bị sửa text ghi chú (Modified)
    {
      id: "E-1",
      type: "polyline",
      layer: "M-DUCT-SUPP",
      coordinates: { start: [1000, 2000, 2800], end: [5000, 2000, 2800] },
      textValue: "Duct 600x300 (Tăng tiết diện)",
    },
    // E-2 giữ nguyên (Unchanged)
    {
      id: "E-2",
      type: "insert_block",
      layer: "M-DIFFUSER",
      coordinates: { center: [2000, 2000, 2700] },
      blockName: "DIFF_600X600",
    },
    // E-3 bị xóa (Removed) -> không có trong compare
    // E-4 mới được thêm vào (Added)
    {
      id: "E-4",
      type: "insert_block",
      layer: "M-DIFFUSER",
      coordinates: { center: [4000, 2000, 2700] },
      blockName: "DIFF_600X600",
    },
  ];

  const result = computeCadVectorDiff(baseEntities, compareEntities, 5);

  assert.equal(result.totalBase, 3);
  assert.equal(result.totalCompare, 3);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.removed, 1);
  assert.equal(result.summary.modified, 1);
  assert.equal(result.summary.unchanged, 1);
  assert.ok(result.potentialVoImpact.estimatedCostVnd > 0);
});

test("M65: generateAutoLispDetailScript sinh mã AutoLISP hợp lệ theo tham số", () => {
  const hangerLisp = generateAutoLispDetailScript("hanger", {
    widthMm: 800,
    heightMm: 500,
    rodDiameterMm: 12,
    layerName: "M-HANGER-TYP",
  });

  assert.ok(hangerLisp.includes("defun c:DRAW_TRAPEZE_HANGER"));
  assert.ok(hangerLisp.includes("800"));
  assert.ok(hangerLisp.includes("M-HANGER-TYP"));

  const sleeveLisp = generateAutoLispDetailScript("sleeve", {
    diameterMm: 200,
    tagLabel: "SLEEVE-FP-D200",
  });

  assert.ok(sleeveLisp.includes("defun c:DRAW_SLEEVE_OPENING"));
  assert.ok(sleeveLisp.includes("SLEEVE-FP-D200"));
});

test("M65: convertTcvn3ToUnicode giải mã chính xác chuỗi ký tự font TCVN3/ABC sang Unicode", () => {
  const legacy = "HÖ thèng th«ng giã tÇng 4";
  const unicode = convertTcvn3ToUnicode(legacy);

  assert.ok(unicode.includes("thống"));
  assert.ok(unicode.includes("gió"));
  assert.ok(unicode.includes("tầng"));
});

test("M65: normalizeCadLayers ánh xạ chuẩn hóa layer theo chuẩn AIA/MEPF", () => {
  const raw = [
    "ONG_GIO_CAP_LV4",
    "ONG_GIO_HOI_LV4",
    "ONG_GIO_THAI_WC",
    "ONG_NUOC_LANH",
    "MANG_CAP_DIEN",
    "DUONG_ONG_PCCC_SPK",
  ];
  const mapping = normalizeCadLayers(raw);

  // Nguồn chuẩn (lib/cad/dxf-parser) phân biệt được gió cấp / hồi / thải
  assert.equal(mapping["ONG_GIO_CAP_LV4"], "M-DUCT-SUPP");
  assert.equal(mapping["ONG_GIO_HOI_LV4"], "M-DUCT-RETN");
  assert.equal(mapping["ONG_GIO_THAI_WC"], "M-DUCT-EXHT");
  // Ống nước lạnh vào nhánh chiller thay vì gộp chung với ống thoát như bản trùng lặp cũ
  assert.equal(mapping["ONG_NUOC_LANH"], "M-CHW-PIPE");
  // Máng cáp điện vào nhánh điện: nhánh điện được kiểm trước nhánh ống nước (xem test dưới)
  assert.equal(mapping["MANG_CAP_DIEN"], "E-TRAY-PWRR");
  assert.equal(mapping["DUONG_ONG_PCCC_SPK"], "F-SPRN-PIPE");
});

test("M99: normalizeCadLayers khớp từ khóa theo ranh giới token, không bắt nhầm chuỗi con", () => {
  const mapping = normalizeCadLayers(["MANG_CAP_DIEN", "ONG_THOAT_SAN"]);

  // "CAP" (ý định: nước cấp) cũng là token của "MANG_CAP_DIEN" nhưng ở đây nghĩa là "cáp" →
  // nhánh điện phải được kiểm trước nhánh ống nước
  assert.equal(mapping["MANG_CAP_DIEN"], "E-TRAY-PWRR");
  // "OA" (outside air) chỉ là chuỗi con giữa từ "THOAT", không phải token → không rơi vào nhánh gió
  assert.equal(mapping["ONG_THOAT_SAN"], "P-PIPE-SANR");
});

test("M65: extrude2dPolylineTo3d đùn khối 3D Bounding Box từ polyline và cao độ", () => {
  const polyline = {
    points: [
      [1000, 2000],
      [5000, 2000],
    ] as Array<[number, number]>,
    topElevationMm: 3100,
    bopElevationMm: 2800,
    widthMm: 400,
  };

  const box3d = extrude2dPolylineTo3d(polyline);
  assert.deepEqual(box3d.min, [800, 1800, 2800]);
  assert.deepEqual(box3d.max, [5200, 2200, 3100]);
});
