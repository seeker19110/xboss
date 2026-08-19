import { test } from "node:test";
import assert from "node:assert/strict";
import { solve1dCuttingStock, RequiredPiece } from "@/lib/engineering-mepf-nesting";

test("M68: solve1dCuttingStock tối ưu hóa xếp cây ống 6m và hạ phế liệu phôi thừa", () => {
  const pieces: RequiredPiece[] = [
    { id: "P1", spoolCode: "SP-01", lengthM: 3.5, quantity: 2 },
    { id: "P2", spoolCode: "SP-02", lengthM: 2.5, quantity: 2 },
    { id: "P3", spoolCode: "SP-03", lengthM: 1.5, quantity: 4 },
  ];
  // 3.5 + 2.5 = 6.0m (Thanh 1 đầy)
  // 3.5 + 2.5 = 6.0m (Thanh 2 đầy)
  // 1.5 * 4 = 6.0m (Thanh 3 đầy)
  // -> Cần đúng 3 thanh phôi 6m, Phế liệu = 0% !

  const res = solve1dCuttingStock("PLAN-01", "Ống Thép DN100", pieces, 6.0, 0.0);

  assert.equal(res.totalStockBarsNeeded, 3);
  assert.equal(res.totalScrapWasteM, 0);
  assert.equal(res.overallScrapWastePercent, 0);
  assert.equal(res.isOptimizedUnder2Percent, true);
  assert.equal(res.patterns.length, 3);
});

test("M68: solve1dCuttingStock phân bổ các đoạn lẻ và tính toán chính xác số thanh phôi", () => {
  const pieces: RequiredPiece[] = [
    { id: "P1", spoolCode: "SP-01", lengthM: 4.2, quantity: 3 },
    { id: "P2", spoolCode: "SP-02", lengthM: 1.7, quantity: 3 },
  ];

  const res = solve1dCuttingStock("PLAN-02", "Máng Cáp 300x100", pieces, 6.0, 0.005);

  assert.ok(res.totalStockBarsNeeded >= 3);
  assert.ok(res.overallScrapWastePercent >= 0);
  assert.equal(res.totalRequiredPieces, 6);
});
