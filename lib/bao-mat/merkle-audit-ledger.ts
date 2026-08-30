// lib/merkle-audit-ledger.ts — Unified Merkle Tree Ledger & Audit Chain Verification Engine (M43 / M73 / M92)
import { query, queryOne, run } from "@/lib/db";
import crypto from "node:crypto";

// ============================================================================
// 1. MÃ BĂM VÀ CẤU TRÚC DỮ LIỆU MERKLE TREE
// ============================================================================

export interface MerkleProofStep {
  hash: string;
  position: "left" | "right";
}

export type MerkleProofItem = MerkleProofStep;

export interface MerkleTreeStructure {
  root: string;
  leafHashes: string[];
  treeLevels: string[][];
  leafCount: number;
}

export type MerkleTreeResult = MerkleTreeStructure;

export function computeSha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashLeafRecord(record: unknown): string {
  if (typeof record === "string") return computeSha256(record);
  if (record && typeof record === "object") {
    const json = JSON.stringify(record, Object.keys(record as object).sort());
    return computeSha256(json);
  }
  return computeSha256(JSON.stringify(record));
}

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
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
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
        : currentLevelNodes[currentIndex];

    proof.push({
      hash: siblingHash,
      position: isRightNode ? "left" : "right",
    });

    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

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

// ============================================================================
// 2. AUDIT CHAIN VERIFICATION
// ============================================================================

const PAGE_SIZE = 2000;

type AuditChainDbRow = {
  id: number;
  entityKey: string | null;
  at: string;
  changesText: string | null;
  rowHash: string | null;
};

export type AuditChainError = {
  id: number;
  expected: string;
  actual: string | null;
};

export type AuditChainResult = {
  total: number;
  checked: number;
  errors: AuditChainError[];
  ok: boolean;
};

export async function verifyAuditChain(): Promise<AuditChainResult> {
  let lastId = 0;
  let prevHash = "";
  let total = 0;
  let checked = 0;
  const errors: AuditChainError[] = [];

  for (;;) {
    const rows = await query<AuditChainDbRow>(
      `SELECT id, COALESCE(entity_key, entity_id::text) AS "entityKey", at::text AS at,
              changes::text AS "changesText", row_hash AS "rowHash"
       FROM audit_log
       WHERE id > ?
       ORDER BY id ASC
       LIMIT ?`,
      lastId,
      PAGE_SIZE,
    );

    if (rows.length === 0) break;

    for (const r of rows) {
      total++;
      lastId = r.id;

      if (r.rowHash === null) {
        prevHash = "";
        continue;
      }

      checked++;
      const payload = `${prevHash}${r.entityKey ?? ""}${r.at}${r.changesText ?? ""}`;
      const expected = crypto.createHash("sha256").update(payload).digest("hex");

      if (expected !== r.rowHash) {
        errors.push({ id: r.id, expected, actual: r.rowHash });
      }

      prevHash = r.rowHash;
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return {
    total,
    checked,
    errors,
    ok: errors.length === 0,
  };
}

// ============================================================================
// 3. PERSISTENCE & DATABASE
// ============================================================================

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
