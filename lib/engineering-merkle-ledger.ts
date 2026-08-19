import crypto from "node:crypto";
import { query, queryOne, run } from "@/lib/db";

export interface MerkleProofStep {
  hash: string;
  position: "left" | "right";
}

export interface MerkleTreeStructure {
  root: string;
  leafHashes: string[];
  treeLevels: string[][];
  leafCount: number;
}

export interface MerkleRootRecord {
  id: string;
  project_id: number;
  batch_code: string;
  merkle_root: string;
  leaf_count: number;
  start_timestamp: string;
  end_timestamp: string;
  previous_root: string | null;
  signature_token: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Tính mã băm SHA-256 của chuỗi
 */
export function computeSha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Tính mã băm SHA-256 chuẩn hóa cho 1 bản ghi dữ liệu
 */
export function hashLeafRecord(record: unknown): string {
  const json = JSON.stringify(record, Object.keys(record as object).sort());
  return computeSha256(json);
}

/**
 * Xây dựng cây Merkle Tree từ danh sách mã băm lá
 */
export function buildMerkleTree(leafHashes: string[]): MerkleTreeStructure {
  if (!leafHashes || leafHashes.length === 0) {
    const emptyRoot = computeSha256("EMPTY_TREE");
    return {
      root: emptyRoot,
      leafHashes: [],
      treeLevels: [[emptyRoot]],
      leafCount: 0,
    };
  }

  const treeLevels: string[][] = [];
  let currentLevel = [...leafHashes];
  treeLevels.push(currentLevel);

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Nhân đôi nếu lẻ
      const combined = computeSha256(left + right);
      nextLevel.push(combined);
    }
    treeLevels.push(nextLevel);
    currentLevel = nextLevel;
  }

  return {
    root: currentLevel[0],
    leafHashes,
    treeLevels,
    leafCount: leafHashes.length,
  };
}

/**
 * Sinh bằng chứng Merkle Proof cho một phần tử ở vị trí leafIndex
 */
export function generateMerkleProof(leafIndex: number, treeLevels: string[][]): MerkleProofStep[] {
  const proof: MerkleProofStep[] = [];
  if (!treeLevels || treeLevels.length <= 1) return proof;
  if (leafIndex < 0 || leafIndex >= treeLevels[0].length) {
    throw new Error(`Chỉ số lá ${leafIndex} vượt giới hạn.`);
  }

  let currentIndex = leafIndex;
  for (let level = 0; level < treeLevels.length - 1; level++) {
    const currentLevelNodes = treeLevels[level];
    const isRightNode = currentIndex % 2 === 1;
    const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

    const siblingHash =
      siblingIndex < currentLevelNodes.length
        ? currentLevelNodes[siblingIndex]
        : currentLevelNodes[currentIndex]; // Node nhân đôi khi lẻ

    proof.push({
      hash: siblingHash,
      position: isRightNode ? "left" : "right",
    });

    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Xác minh tính hợp lệ của Merkle Proof
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: MerkleProofStep[],
  expectedRoot: string,
): boolean {
  let currentHash = leafHash;

  for (const step of proof) {
    if (step.position === "left") {
      currentHash = computeSha256(step.hash + currentHash);
    } else {
      currentHash = computeSha256(currentHash + step.hash);
    }
  }

  return currentHash === expectedRoot;
}

/**
 * Đóng gói và niêm phong Merkle Batch vào cơ sở dữ liệu
 */
export async function createAndSealMerkleBatch(
  projectId: number,
  batchCode: string,
  records: Array<Record<string, unknown>>,
  metadata?: Record<string, unknown>,
): Promise<{ record: MerkleRootRecord; tree: MerkleTreeStructure }> {
  const leafHashes = records.map((r) => hashLeafRecord(r));
  const tree = buildMerkleTree(leafHashes);

  const previousBatch = await queryOne<{ merkle_root: string }>(
    `SELECT merkle_root FROM engineering_merkle_roots 
     WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
    projectId,
  );

  const previousRoot = previousBatch?.merkle_root ?? null;
  const signatureToken = `SIG-MERKLE-${batchCode.toUpperCase()}-${tree.root.slice(0, 16).toUpperCase()}-${Date.now()}`;

  const rows = await query<MerkleRootRecord>(
    `INSERT INTO engineering_merkle_roots (
      project_id, batch_code, merkle_root, leaf_count, start_timestamp, end_timestamp, previous_root, signature_token, metadata
    ) VALUES (
      ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?::jsonb
    )
    ON CONFLICT (project_id, batch_code) DO UPDATE
    SET merkle_root = EXCLUDED.merkle_root,
        leaf_count = EXCLUDED.leaf_count,
        end_timestamp = CURRENT_TIMESTAMP,
        signature_token = EXCLUDED.signature_token,
        metadata = EXCLUDED.metadata
    RETURNING *`,
    projectId,
    batchCode,
    tree.root,
    tree.leafCount,
    previousRoot,
    signatureToken,
    JSON.stringify(metadata ?? {}),
  );

  return { record: rows[0], tree };
}

/**
 * Lấy danh sách các Merkle Roots của dự án
 */
export async function listMerkleRoots(
  projectId: number,
  limit: number = 20,
): Promise<MerkleRootRecord[]> {
  return query<MerkleRootRecord>(
    `SELECT * FROM engineering_merkle_roots
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    projectId,
    limit,
  );
}

/**
 * Lấy thông tin 1 Merkle Root theo batchCode
 */
export async function getMerkleRoot(
  projectId: number,
  batchCode: string,
): Promise<MerkleRootRecord | undefined> {
  return queryOne<MerkleRootRecord>(
    `SELECT * FROM engineering_merkle_roots
     WHERE project_id = ? AND batch_code = ?`,
    projectId,
    batchCode,
  );
}
