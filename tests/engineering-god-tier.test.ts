import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateInstancedMeshGroups,
  checkAabbOverlap,
  detectGodTierClashes,
  calculateGodTier4DSimulation,
  calculateMerkleRootHex,
  generateAsBuiltStamp,
  GodTierElementData,
} from "@/lib/engineering-god-tier";
import { diagnoseCadBimDefects, generateAutoLispTrapeze } from "@/lib/engineering-local-ai";

test("God-Tier: generateInstancedMeshGroups gom nhóm phần tử thành các Batch GPU Draw Calls", () => {
  const elements: GodTierElementData[] = [
    {
      id: "1",
      guid: "GUID-1",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió 1",
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 600, height: 400, length: 2000 },
      boundingBox: { min: [0, 0, 0], max: [600, 2000, 400] },
    },
    {
      id: "2",
      guid: "GUID-2",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió 2",
      position: { x: 100, y: 200, z: 0 },
      dimensions: { width: 600, height: 400, length: 2000 },
      boundingBox: { min: [100, 200, 0], max: [700, 2200, 400] },
    },
    {
      id: "3",
      guid: "GUID-3",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_WATER",
      name: "Ống nước DN100",
      position: { x: 50, y: 50, z: 50 },
      dimensions: { diameter: 100, length: 4000 },
      boundingBox: { min: [50, 50, 50], max: [150, 4050, 150] },
    },
  ];

  const groups = generateInstancedMeshGroups(elements);
  assert.equal(groups.length, 2, "Phải gom thành 2 nhóm hình học riêng biệt");

  const ductGroup = groups.find((g) => g.geometryKey === "DUCT_STRAIGHT_600x400");
  assert.ok(ductGroup, "Phải tìm thấy nhóm DUCT_STRAIGHT_600x400");
  assert.equal(ductGroup?.instanceCount, 2, "Nhóm ống gió phải có 2 instances");
  assert.equal(ductGroup?.matrices.length, 2, "Phải có 2 ma trận biến đổi 4x4");
});

test("God-Tier: checkAabbOverlap và detectGodTierClashes phát hiện va chạm và áp dụng ma trận thứ bậc", () => {
  const elements: GodTierElementData[] = [
    {
      id: "elem-1",
      guid: "GUID-DUCT-1",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió cấp",
      position: { x: 0, y: 0, z: 2800 },
      dimensions: { width: 800, height: 500, length: 6000 },
      boundingBox: { min: [-400, 0, 2550], max: [400, 6000, 3050] },
    },
    {
      id: "elem-2",
      guid: "GUID-PIPE-1",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_DRAINAGE",
      name: "Ống thoát nước",
      position: { x: 0, y: 3000, z: 2750 },
      dimensions: { diameter: 110, length: 4000 },
      boundingBox: { min: [-55, 1000, 2695], max: [55, 5000, 2805] },
    },
  ];

  assert.equal(checkAabbOverlap(elements[0].boundingBox, elements[1].boundingBox), true);

  const clashes = detectGodTierClashes(elements, 1, "test-model");
  assert.equal(clashes.length, 1, "Phải phát hiện đúng 1 va chạm");
  assert.equal(clashes[0].status, "detected");
  assert.ok(clashes[0].reroute_solution, "Phải có giải pháp nắn tuyến");
  assert.equal(clashes[0].reroute_solution?.action, "offset_45_degree");
});

test("God-Tier: calculateGodTier4DSimulation tính toán chính xác trạng thái phần tử theo mốc ngày", () => {
  const elements: GodTierElementData[] = [
    {
      id: "1",
      guid: "GUID-1",
      elementType: "DUCT_STRAIGHT",
      systemType: "HVAC_SUPPLY",
      name: "Ống gió",
      position: { x: 0, y: 0, z: 0 },
      dimensions: { length: 2000 },
      boundingBox: { min: [0, 0, 0], max: [100, 100, 100] },
      plannedStartDate: "2026-08-01",
      plannedEndDate: "2026-08-10",
      actualProgressPercent: 100,
    },
    {
      id: "2",
      guid: "GUID-2",
      elementType: "PIPE_STRAIGHT",
      systemType: "PLUMBING_WATER",
      name: "Ống nước",
      position: { x: 0, y: 0, z: 0 },
      dimensions: { length: 2000 },
      boundingBox: { min: [0, 0, 0], max: [100, 100, 100] },
      plannedStartDate: "2026-08-10",
      plannedEndDate: "2026-08-20",
      actualProgressPercent: 50,
    },
  ];

  const stateEarly = calculateGodTier4DSimulation(elements, "2026-08-15");
  assert.equal(stateEarly.counts.approved, 1, "Phần tử 1 đạt 100% phải ở trạng thái approved");
  assert.equal(
    stateEarly.counts.in_progress,
    1,
    "Phần tử 2 ngày 15 nằm giữa start-end phải là in_progress",
  );
});

test("God-Tier: calculateMerkleRootHex băm bất biến cây Merkle SHA-256", () => {
  const hashes = ["hash1", "hash2", "hash3", "hash4"];
  const root = calculateMerkleRootHex(hashes);
  assert.equal(root.length, 64, "Mã băm Merkle Root phải đúng 64 ký tự hex SHA-256");

  // Tính lặp lại phải trả về cùng kết quả (tính xác định - deterministic)
  const rootRepeat = calculateMerkleRootHex(hashes);
  assert.equal(root, rootRepeat);
});

test("God-Tier: generateAsBuiltStamp sinh khung dấu chuẩn NĐ 06/2021/NĐ-CP", () => {
  const stamp = generateAsBuiltStamp(
    "MODEL-GT-01",
    "Công ty XBoss",
    "Trần Văn Giám Sát",
    "Nguyễn Văn Chỉ Huy",
    "2026-08-20",
  );
  assert.equal(stamp.stampType, "MAU_01");
  assert.equal(stamp.dimensions.widthMm, 120);
  assert.equal(stamp.dimensions.heightMm, 60);
  assert.ok(stamp.svgStampContent.includes("BẢN VẼ HOÀN CÔNG"));
  assert.ok(stamp.svgStampContent.includes("Trần Văn Giám Sát"));
});

test("God-Tier AI: diagnoseCadBimDefects chẩn đoán 12 dị tật và sinh kịch bản AutoLISP", async () => {
  const testData = {
    fileName: "TEST-DRAWING.dwg",
    layers: ["0", "layer1", "mep_test"],
    texts: ["MÆt b»ng cÊp giã TÇng 5", "Văn bản chuẩn"],
    elementsSummary: {},
  };

  const report = await diagnoseCadBimDefects(testData);
  assert.ok(report.totalDefectsFound >= 1, "Phải phát hiện ít nhất 1 dị tật font/layer");
  assert.ok(
    report.autoLispFixScript?.includes("c:XBOSS_AUTO_HEAL"),
    "Phải có hàm AutoLISP c:XBOSS_AUTO_HEAL",
  );
});

test("God-Tier AI: generateAutoLispTrapeze sinh mã AutoCAD LISP chính xác thông số", () => {
  const script = generateAutoLispTrapeze(800, 1000, "M12", "41x41");
  assert.ok(script.includes("c:XBOSS_TRAPEZE_800_1000"));
  assert.ok(script.includes("M-HVAC-SUPP"));
  assert.ok(script.includes("800.0"));
});
