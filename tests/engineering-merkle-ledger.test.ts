import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSha256,
  hashLeafRecord,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
} from "@/lib/engineering-merkle-ledger";

test("M73: buildMerkleTree xây dựng cây nhị phân và tính chính xác Root Hash", () => {
  const records = [
    { event: "TICK_01", task: 101, checked: true },
    { event: "TICK_02", task: 102, checked: false },
    { event: "ACCEPT_01", task: 201, approved: true },
    { event: "INSP_01", requestId: 301, result: "PASS" },
  ];

  const leafHashes = records.map((r) => hashLeafRecord(r));
  assert.equal(leafHashes.length, 4);

  const tree = buildMerkleTree(leafHashes);
  assert.equal(tree.leafCount, 4);
  assert.equal(tree.treeLevels.length, 3); // Level 0 (4) -> Level 1 (2) -> Level 2 (1 Root)
  assert.equal(tree.root.length, 64);

  // Kiểm tra tính lũy đẳng: Cùng dữ liệu ra cùng Root Hash
  const tree2 = buildMerkleTree(leafHashes);
  assert.equal(tree.root, tree2.root);
});

test("M73: buildMerkleTree xử lý chính xác số lượng lá lẻ bằng cơ chế nhân đôi", () => {
  const leafHashes = ["hash_a", "hash_b", "hash_c"].map((s) => computeSha256(s));
  const tree = buildMerkleTree(leafHashes);

  assert.equal(tree.leafCount, 3);
  assert.equal(tree.treeLevels.length, 3); // 3 -> 2 -> 1
  assert.equal(tree.root.length, 64);
});

test("M73: verifyMerkleProof xác thực thành công 100% bằng chứng hợp lệ và từ chối dữ liệu bị sửa đổi", () => {
  const records = [
    { id: 1, val: "A" },
    { id: 2, val: "B" },
    { id: 3, val: "C" },
    { id: 4, val: "D" },
    { id: 5, val: "E" },
  ];

  const leafHashes = records.map((r) => hashLeafRecord(r));
  const tree = buildMerkleTree(leafHashes);

  // Sinh Proof cho phần tử thứ 3 (index 2: "C")
  const targetIndex = 2;
  const proof = generateMerkleProof(targetIndex, tree.treeLevels);
  assert.ok(proof.length > 0);

  // 1. Xác thực với đúng leaf hash -> PASS
  const valid = verifyMerkleProof(leafHashes[targetIndex], proof, tree.root);
  assert.equal(valid, true);

  // 2. Xác thực với leaf hash bị sửa đổi -> FAIL
  const tamperedLeafHash = computeSha256("TAMPERED_RECORD_DATA");
  const invalidLeaf = verifyMerkleProof(tamperedLeafHash, proof, tree.root);
  assert.equal(invalidLeaf, false);

  // 3. Xác thực với expectedRoot sai -> FAIL
  const invalidRoot = verifyMerkleProof(
    leafHashes[targetIndex],
    proof,
    "wrong_root_hash_0000000000000000000000000000000000000000000000000000",
  );
  assert.equal(invalidRoot, false);
});
