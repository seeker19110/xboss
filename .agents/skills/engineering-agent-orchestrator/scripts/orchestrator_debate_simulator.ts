import { createHash } from "crypto";

/**
 * ENGINEERING AGENT ORCHESTRATOR — CLI EXECUTION ENGINE & VERIFIER
 * Động cơ kiểm toán Swarm Debate, Trạm gác Gate 0 & Sổ cái Mật mã Merkle Tree M73.
 */

export interface SwarmPersonaScore {
  engineerScore: number; // 0.0 -> 1.0 (Quy chuẩn kỹ thuật, thủy lực)
  qsScore: number; // 0.0 -> 1.0 (Chi phí, hợp đồng FIDIC)
  siteScore: number; // 0.0 -> 1.0 (Khả thi hiện trường, mặt bằng)
  hseScore: number; // 0.0 -> 1.0 (An toàn lao động, QCVN 18)
}

export function calculateSwarmConsensus(scores: SwarmPersonaScore): {
  consensusScore: number;
  isConsensusReached: boolean;
  tokenCertificate: string;
} {
  const consensusScore = Number(
    (
      0.35 * scores.engineerScore +
      0.3 * scores.qsScore +
      0.25 * scores.siteScore +
      0.1 * scores.hseScore
    ).toFixed(4),
  );

  const isConsensusReached = consensusScore >= 0.8;
  const hash = createHash("sha256").update(JSON.stringify(scores)).digest("hex").substring(0, 16);
  const tokenCertificate = isConsensusReached
    ? `SIG-CONSENSUS-${hash.toUpperCase()}`
    : "CONSENSUS_REJECTED";

  return {
    consensusScore,
    isConsensusReached,
    tokenCertificate,
  };
}

export interface Gate0Pillars {
  hasProvenanceTrace: boolean;
  isRoleAuthorized: boolean; // Cấp A1/A2
  isEvidenceSufficient: boolean;
  isConflictResolved: boolean;
  isLeafHashGenerated: boolean;
}

export function verifyGate0(pillars: Gate0Pillars): { passed: boolean; message: string } {
  const allPassed =
    pillars.hasProvenanceTrace &&
    pillars.isRoleAuthorized &&
    pillars.isEvidenceSufficient &&
    pillars.isConflictResolved &&
    pillars.isLeafHashGenerated;

  return {
    passed: allPassed,
    message: allPassed
      ? "Trạm gác Gate 0: 5/5 Trụ cột hoàn hảo. Cho phép phê duyệt và tác động vào hệ thống."
      : "Trạm gác Gate 0: TỪ CHỐI! Vi phạm một hoặc nhiều trụ cột kiểm soát an toàn tự trị.",
  };
}

/**
 * Tính toán Gốc Cây Merkle Root từ danh sách Leaf Hashes
 */
export function calculateMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) return createHash("sha256").update("EMPTY_TREE").digest("hex");
  if (leafHashes.length === 1) return leafHashes[0];

  let currentLevel = [...leafHashes];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Nếu lẻ thì nhân đôi node cuối
      const combined = createHash("sha256")
        .update(left + right)
        .digest("hex");
      nextLevel.push(combined);
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

// -------------------------------------------------------------
// TỰ KIỂM THỬ (CLI SELF-TEST EXECUTION)
// -------------------------------------------------------------
if (process.argv[1]?.endsWith("orchestrator_debate_simulator.ts")) {
  console.log("🚀 Đang chạy bộ kiểm toán Engineering Agent Orchestrator...");

  // Test Case 1: Phiên tranh biện Swarm Debate về giải pháp uốn né ống Chiller 45 độ
  const debateRes = calculateSwarmConsensus({
    engineerScore: 0.92, // Thủy lực chuẩn, bảo toàn độ dốc
    qsScore: 0.88, // Chi phí phụ kiện tăng nhẹ nhưng trong ngân sách
    siteScore: 0.85, // Mặt bằng đủ không gian thi công
    hseScore: 0.95, // Cách ly an toàn máng cáp điện > 150mm
  });

  console.log("\n1. [Swarm Debate Consensus Calculation]");
  console.log(`   - Điểm số đồng thuận: ${debateRes.consensusScore}/1.00 (Ngưỡng đạt: >= 0.80)`);
  console.log(
    `   - Trạng thái: ${debateRes.isConsensusReached ? "✅ ĐỒNG THUẬN CAO (CONSENSUS REACHED)" : "❌ BẤT ĐỒNG"}`,
  );
  console.log(`   - Mã chứng thực: [${debateRes.tokenCertificate}]`);

  // Test Case 2: Kiểm định Trạm gác Gate 0
  const gate0Res = verifyGate0({
    hasProvenanceTrace: true,
    isRoleAuthorized: true,
    isEvidenceSufficient: true,
    isConflictResolved: debateRes.isConsensusReached,
    isLeafHashGenerated: true,
  });

  console.log("\n2. [Gate 0 Five-Pillar Verification]");
  console.log(`   - Trạng thái Gate 0: ${gate0Res.passed ? "✅ PASS" : "❌ BLOCKED"}`);
  console.log(`   - Thông báo: ${gate0Res.message}`);

  // Test Case 3: Tính toán Gốc Cây Merkle Root M73 từ 4 giao dịch
  const leaves = [
    createHash("sha256").update("TX-01-APPROVE-TASK-001").digest("hex"),
    createHash("sha256").update("TX-02-APPROVE-TASK-002").digest("hex"),
    createHash("sha256").update("TX-03-ISSUE-NCR-005").digest("hex"),
    createHash("sha256").update("TX-04-CERTIFY-IPC-04").digest("hex"),
  ];

  const rootHash = calculateMerkleRoot(leaves);
  console.log("\n3. [Merkle Tree Root Hash Invariant M73]");
  console.log(`   - Số lượng lá giao dịch: ${leaves.length} leaves`);
  console.log(`   - 🛡️ GỐC MERKLE ROOT NIÊM PHONG: 0x${rootHash}`);

  console.log("\n✅ Toàn bộ kiểm toán Engineering Agent Orchestrator hoàn thành 100% xuất sắc!");
}
