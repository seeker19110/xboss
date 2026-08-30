import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DRAWING_PAYLOAD_VERSION,
  buildDrawingPayload,
  validateDrawingPayload,
} from "@/lib/ky-thuat/cad/drawing";
import type { DxfParseResult, DxfEntityRaw, DxfLayerInfo } from "@/lib/ky-thuat/cad/dxf-parser";

const layerMau: DxfLayerInfo = {
  name: "M-SAD",
  colorNumber: 4,
  colorHex: "#06b6d4",
  lineType: "CONTINUOUS",
  isStandardized: true,
  standardName: "M-SAD",
  discipline: "M",
  entityCount: 1,
};

const entityMau: DxfEntityRaw = {
  id: "e1",
  type: "LINE",
  layer: "M-SAD",
  coordinates: { start: [0, 0, 0], end: [1000, 0, 0] },
};

function ketQuaParseMau(): DxfParseResult {
  return {
    layers: [layerMau],
    entities: [entityMau],
    blocks: [],
    xrefs: [],
    diagnostic: {
      healthScore: 100,
      totalEntities: 1,
      totalLayers: 1,
      standardLayersCount: 1,
      nonStandardLayersCount: 0,
      corruptedTextCount: 0,
      unmappedBlocksCount: 0,
      boundingDimensions: { minX: 0, maxX: 1000, minY: 0, maxY: 0, widthMm: 1000, lengthMm: 0 },
      disciplineBreakdown: {
        hvac: 1,
        electrical: 0,
        plumbing: 0,
        firefighting: 0,
        elv: 0,
        structural: 0,
      },
      recommendations: [],
    },
    spatialRoutes: [],
  };
}

describe("Hợp đồng dữ liệu bản vẽ (M98 PR2)", () => {
  it("buildDrawingPayload dựng đúng các trường từ kết quả parse", () => {
    const payload = buildDrawingPayload(ketQuaParseMau(), "Bản vẽ mẫu");
    assert.equal(payload.version, DRAWING_PAYLOAD_VERSION);
    assert.equal(payload.title, "Bản vẽ mẫu");
    assert.equal(payload.units, "mm");
    assert.deepEqual(payload.layers, [layerMau]);
    assert.deepEqual(payload.entities, [entityMau]);
  });

  it("validateDrawingPayload chấp nhận payload hợp lệ", () => {
    const payload = buildDrawingPayload(ketQuaParseMau(), "Bản vẽ mẫu");
    const kq = validateDrawingPayload(payload);
    assert.equal(kq.valid, true);
    assert.deepEqual(kq.errors, []);
  });

  it("từ chối khi thiếu title", () => {
    const payload = { ...buildDrawingPayload(ketQuaParseMau(), ""), title: "" };
    const kq = validateDrawingPayload(payload);
    assert.equal(kq.valid, false);
    assert.ok(kq.errors.some((e) => e.includes("tên bản vẽ")));
  });

  it("từ chối khi layers sai kiểu", () => {
    const kq = validateDrawingPayload({
      version: 1,
      title: "X",
      units: "mm",
      layers: "không phải mảng",
      entities: [],
    });
    assert.equal(kq.valid, false);
    assert.ok(kq.errors.some((e) => e.includes("layers")));
  });

  it("liệt kê mọi lỗi: entity thiếu type + layer thiếu tên + sai units", () => {
    const kq = validateDrawingPayload({
      version: 1,
      title: "X",
      units: "m",
      layers: [{ name: "" }],
      entities: [
        { id: "e1", layer: "0" },
        { id: "e2", type: "LINE", layer: 5 },
      ],
    });
    assert.equal(kq.valid, false);
    assert.ok(kq.errors.length >= 4, `Chỉ thấy: ${kq.errors.join(" | ")}`);
    assert.ok(kq.errors.some((e) => e.includes("Đơn vị")));
    assert.ok(kq.errors.some((e) => e.includes("Layer thứ 1")));
    assert.ok(kq.errors.some((e) => e.includes("Thực thể thứ 1")));
    assert.ok(kq.errors.some((e) => e.includes("Thực thể thứ 2")));
  });

  it("từ chối payload không phải đối tượng", () => {
    assert.equal(validateDrawingPayload(null).valid, false);
    assert.equal(validateDrawingPayload([]).valid, false);
  });
});
