// lib/engineering-merkle-ledger.ts — Facade for Unified Merkle Tree & Audit Ledger Engine (M73)
export {
  type MerkleProofStep,
  type MerkleTreeStructure,
  type MerkleRootRecord,
  computeSha256,
  hashLeafRecord,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
  createAndSealMerkleBatch,
  listMerkleRoots,
  getMerkleRoot,
} from "./merkle-audit-ledger";
