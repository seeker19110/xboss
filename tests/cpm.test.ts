import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCpm, type CpmNode, type CpmEdge } from "@/lib/cpm";

// Chuỗi A(3)→B(2)→D(4) = 9 ngày vs nhánh C(1) song song → đường găng là A,B,D.
test("computeCpm: đường găng là chuỗi dài nhất, nhánh ngắn có float", () => {
  const nodes: CpmNode[] = [
    { id: 1, duration: 3 }, // A
    { id: 2, duration: 2 }, // B
    { id: 3, duration: 1 }, // C (song song B)
    { id: 4, duration: 4 }, // D
  ];
  const edges: CpmEdge[] = [
    { id: 10, predecessorId: 1, successorId: 2 }, // A→B
    { id: 11, predecessorId: 1, successorId: 3 }, // A→C
    { id: 12, predecessorId: 2, successorId: 4 }, // B→D
    { id: 13, predecessorId: 3, successorId: 4 }, // C→D
  ];
  const r = computeCpm(nodes, edges);
  assert.deepEqual([...r.criticalNodes].sort(), [1, 2, 4]);
  assert.ok(r.criticalEdges.has(10) && r.criticalEdges.has(12));
  assert.ok(!r.criticalEdges.has(11)); // nhánh C không găng
  assert.equal(r.float.get(3), 1); // C trễ được 1 ngày
  assert.equal(r.float.get(1), 0);
});

test("computeCpm: không có phụ thuộc → không có đường găng", () => {
  const r = computeCpm([{ id: 1, duration: 5 }, { id: 2, duration: 3 }], []);
  assert.equal(r.criticalNodes.size, 0);
  assert.equal(r.criticalEdges.size, 0);
});

test("computeCpm: bỏ qua cạnh trỏ tới nút không tồn tại", () => {
  const r = computeCpm([{ id: 1, duration: 2 }, { id: 2, duration: 2 }], [
    { id: 10, predecessorId: 1, successorId: 2 },
    { id: 11, predecessorId: 2, successorId: 99 }, // 99 không tồn tại
  ]);
  assert.deepEqual([...r.criticalNodes].sort(), [1, 2]);
});
