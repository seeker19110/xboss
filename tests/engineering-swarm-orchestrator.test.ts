import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// PIN-3/ENG-3/ENG-4 (M92) — điều phối đa tác tử (Swarm), tính đồng thuận có trọng số theo
// thẩm quyền chuyên môn, và phát sinh dự thảo kỹ thuật tự trị (RFI/submittal/...). Rủi ro
// thật: nếu công thức đồng thuận tính sai ngưỡng, một ý kiến phản đối của Agent An toàn có
// thể bị "hoà tan" trong số đông thay vì buộc leo thang cho con người quyết — đây chính là
// bất biến cốt lõi cần khoá chặt ở các test dưới.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_AUTHORITY_WEIGHTS,
  calculateSwarmConsensus,
  generateAutonomousTechnicalDraft,
} from "@/lib/ky-thuat/engineering-swarm-orchestrator";

const S = { skip: !HAS_TEST_DB };

// ===== calculateSwarmConsensus =====

test("calculateSwarmConsensus: chưa có lập luận nào → escalation cho con người, không tự suy đoán", () => {
  const kq = calculateSwarmConsensus([]);
  assert.deepEqual(kq, {
    consensusLevel: "human_escalation_required",
    weightedScore: 0,
    synthesisSummary: "Chưa có lập luận nào được ghi nhận trong phiên Swarm Debate.",
    dissentingOpinions: [],
    dominantStance: "neutral",
  });
});

test("calculateSwarmConsensus: toàn bộ đồng thuận (propose/concur, không object/amend) → unanimous", () => {
  const kq = calculateSwarmConsensus([
    { agent_role: "agent_safety", stance: "propose", argument_text: "Đề xuất ban đầu" },
    { agent_role: "agent_structural", stance: "concur", argument_text: "Đồng ý" },
  ]);
  assert.equal(kq.consensusLevel, "unanimous");
  assert.equal(kq.dominantStance, "concur");
  assert.equal(kq.weightedScore, 1);
  assert.deepEqual(kq.dissentingOpinions, []);
  assert.match(kq.synthesisSummary, /2 tác tử.*100\.0%/s);
});

test("calculateSwarmConsensus: đa số đồng thuận (≥70% trọng số) nhưng vẫn có phản đối → majority_with_dissent", () => {
  // safety(2.0)+structural(1.8) đồng ý = 3.8/5.0 = 76% ≥ 70%, cost_qs(1.2) phản đối.
  const kq = calculateSwarmConsensus([
    { agent_role: "agent_safety", stance: "concur", argument_text: "OK an toàn" },
    { agent_role: "agent_structural", stance: "concur", argument_text: "OK kết cấu" },
    { agent_role: "agent_cost_qs", stance: "object", argument_text: "Vượt ngân sách" },
  ]);
  assert.equal(kq.consensusLevel, "majority_with_dissent");
  assert.equal(kq.dominantStance, "concur");
  assert.equal(kq.weightedScore, 0.76);
  assert.deepEqual(kq.dissentingOpinions, ["[agent_cost_qs] Phản đối: Vượt ngân sách"]);
});

test("calculateSwarmConsensus: đồng thuận 50–70% và phản đối ≤ sửa đổi → authority_reconciled (hoà giải)", () => {
  // structural(1.8)+mepf(1.5) đồng ý = 3.3; contract(1.4) amend; reviewer(1.0) object.
  // total=5.7 → supportRatio=3.3/5.7≈0.579 (trong [0.5,0.7)); object(1.0) ≤ amend(1.4).
  const kq = calculateSwarmConsensus([
    { agent_role: "agent_structural", stance: "concur", argument_text: "OK" },
    { agent_role: "agent_mepf", stance: "concur", argument_text: "OK" },
    { agent_role: "agent_contract", stance: "amend", argument_text: "Sửa điều khoản bảo hành" },
    { agent_role: "agent_reviewer", stance: "object", argument_text: "Chưa đủ hồ sơ" },
  ]);
  assert.equal(kq.consensusLevel, "authority_reconciled");
  assert.equal(kq.dominantStance, "amend");
  assert.deepEqual(kq.dissentingOpinions, [
    "[agent_contract] Đề xuất sửa đổi: Sửa điều khoản bảo hành",
    "[agent_reviewer] Phản đối: Chưa đủ hồ sơ",
  ]);
});

test("calculateSwarmConsensus: bất đồng lớn (support <50% hoặc phản đối > sửa đổi) → escalation cho con người", () => {
  // safety(2.0)+structural(1.8) phản đối, chỉ mepf(1.5) đồng ý → support=1.5/5.3≈28%.
  const kq = calculateSwarmConsensus([
    { agent_role: "agent_safety", stance: "object", argument_text: "Không an toàn" },
    { agent_role: "agent_structural", stance: "object", argument_text: "Sai tải trọng" },
    { agent_role: "agent_mepf", stance: "concur", argument_text: "OK cơ điện" },
  ]);
  assert.equal(kq.consensusLevel, "human_escalation_required");
  assert.equal(kq.dominantStance, "object");
  assert.equal(kq.dissentingOpinions.length, 2);
  assert.match(kq.synthesisSummary, /Kỹ sư trưởng\/PM quyết định/);
});

test("calculateSwarmConsensus: authority_weight tuỳ biến GHI ĐÈ trọng số mặc định theo vai trò", () => {
  // Agent Reviewer mặc định trọng số 1.0 — nếu được gán quyền cao hơn (vd chủ trì phiên),
  // trọng số truyền vào phải thắng thế so với bảng AGENT_AUTHORITY_WEIGHTS tĩnh.
  const kq = calculateSwarmConsensus([
    { agent_role: "agent_reviewer", stance: "concur", authority_weight: 5, argument_text: "OK" },
  ]);
  assert.equal(kq.weightedScore, 1);
  assert.equal(kq.consensusLevel, "unanimous");
});

test("calculateSwarmConsensus: vai trò lạ không có trong bảng trọng số → mặc định 1.0, không NaN/undefined", () => {
  const vaiTroLa = "agent_khong_ton_tai" as unknown as typeof AGENT_AUTHORITY_WEIGHTS extends never
    ? never
    : keyof typeof AGENT_AUTHORITY_WEIGHTS;
  const kq = calculateSwarmConsensus([
    { agent_role: vaiTroLa, stance: "concur", argument_text: "OK" },
  ]);
  assert.equal(kq.weightedScore, 1, "trọng số fallback 1.0 nên hỗ trợ tuyệt đối = 100%");
});

// ===== generateAutonomousTechnicalDraft (dạng object — chữ ký mới) =====

test("generateAutonomousTechnicalDraft (object): mức rủi ro CAO khi chi phí > 50 triệu HOẶC trễ > 7 ngày", () => {
  const a = generateAutonomousTechnicalDraft({
    draftType: "rfi",
    title: "RFI kết cấu tầng hầm",
    topic: "Tải trọng cột",
    synthesis: "Đồng thuận cần gia cố",
    costEstimateVnd: 60_000_000,
    scheduleDeltaDays: 1,
  });
  assert.equal(a.riskAndCostAssessment.riskLevel, "high");
  assert.equal(a.draftType, "rfi");
  assert.match(a.draftId, /^DRAFT-RFI-[0-9A-Z]+$/);
  assert.match(a.singleUseToken, /^TKN-[0-9A-F]{16}$/);
  assert.match(a.provenanceHash, /^[0-9a-f]{64}$/);
  assert.equal(a.isAuthorized, false);
  assert.deepEqual(a.targetRecipients, ["Chủ đầu tư / Ban QLDA", "Tư vấn Giám sát (TVGS)"]);
  assert.equal(a.executiveSummary, "Đồng thuận cần gia cố");

  const b = generateAutonomousTechnicalDraft({
    draftType: "rfi",
    title: "RFI khác",
    scheduleDeltaDays: 10,
  });
  assert.equal(b.riskAndCostAssessment.riskLevel, "high", "trễ > 7 ngày cũng phải là rủi ro cao");
});

test("generateAutonomousTechnicalDraft (object): mức rủi ro TRUNG BÌNH khi vượt ngưỡng thấp nhưng chưa tới ngưỡng cao", () => {
  const a = generateAutonomousTechnicalDraft({
    draftType: "material_submittal",
    title: "Đệ trình vật tư ống gió",
    costEstimateVnd: 15_000_000,
    scheduleDeltaDays: 0,
  });
  assert.equal(a.riskAndCostAssessment.riskLevel, "medium");

  const b = generateAutonomousTechnicalDraft({
    draftType: "material_submittal",
    title: "Đệ trình khác",
    scheduleDeltaDays: 3,
  });
  assert.equal(b.riskAndCostAssessment.riskLevel, "medium");
});

test("generateAutonomousTechnicalDraft (object): mặc định rủi ro THẤP + điền các trường mặc định khi không truyền", () => {
  const a = generateAutonomousTechnicalDraft({
    draftType: "drawing_revision_proposal",
    title: "Đề xuất sửa bản vẽ",
  });
  assert.equal(a.riskAndCostAssessment.riskLevel, "low");
  assert.equal(a.riskAndCostAssessment.estimatedCostVnd, 0);
  assert.equal(a.riskAndCostAssessment.scheduleDeltaDays, 0);
  assert.deepEqual(a.standardsCitations, []);
  assert.equal(a.spatialCoordinates, null);
  assert.equal(a.swarmDebateId, null);
  // Không truyền synthesis → tóm tắt tự sinh phải nêu đúng tiêu đề.
  assert.equal(a.executiveSummary, "Dự thảo kỹ thuật tự trị cho Đề xuất sửa bản vẽ");
});

test("generateAutonomousTechnicalDraft (object): giữ nguyên toạ độ không gian, mã trích dẫn và debateId khi truyền đủ", () => {
  const toaDo = { x: 1, y: 2, z: 3, zone: "Zone A", level: "Tầng 5" };
  const a = generateAutonomousTechnicalDraft({
    draftType: "inspection_package",
    title: "Hồ sơ nghiệm thu",
    coordinates: toaDo,
    citations: [{ code: "TCVN 123", clause: "1.2", relevance: "Test" }],
    debateId: "debate-abc",
  });
  assert.deepEqual(a.spatialCoordinates, toaDo);
  assert.deepEqual(a.standardsCitations, [{ code: "TCVN 123", clause: "1.2", relevance: "Test" }]);
  assert.equal(a.swarmDebateId, "debate-abc");
});

// ===== generateAutonomousTechnicalDraft (dạng tham số vị trí — chữ ký cũ) =====

test("generateAutonomousTechnicalDraft (vị trí): chữ ký cũ dùng bộ trích dẫn TIÊU CHUẨN cố định + người nhận khác dạng object", () => {
  const a = generateAutonomousTechnicalDraft(
    "asbuilt",
    "Bản vẽ hoàn công hệ HVAC",
    "Mô tả kỹ thuật chi tiết",
    "debate-xyz",
    { x: 10, y: 20, z: 0 },
  );
  assert.equal(a.draftType, "asbuilt");
  assert.equal(a.title, "Bản vẽ hoàn công hệ HVAC");
  assert.equal(a.technicalDescription, "Mô tả kỹ thuật chi tiết");
  assert.equal(a.swarmDebateId, "debate-xyz");
  assert.deepEqual(a.spatialCoordinates, { x: 10, y: 20, z: 0 });
  assert.deepEqual(a.targetRecipients, ["Chỉ huy trưởng", "Tư vấn Giám sát"]);
  assert.equal(a.riskAndCostAssessment.riskLevel, "low");
  assert.equal(a.standardsCitations.length, 2);
  assert.equal(a.standardsCitations[0].code, "TCVN 5687:2010");
  assert.match(a.draftId, /^DRAFT-ASBUILT-[0-9A-Z]+$/);
  assert.match(a.provenanceHash, /^[0-9a-f]{64}$/);
});

test("generateAutonomousTechnicalDraft (vị trí): thiếu title/mô tả/toạ độ → mặc định chuỗi rỗng/null, không ném lỗi", () => {
  const a = generateAutonomousTechnicalDraft("rfi");
  assert.equal(a.title, "");
  assert.equal(a.technicalDescription, "");
  assert.equal(a.spatialCoordinates, null);
  assert.equal(a.swarmDebateId, null);
  assert.equal(a.executiveSummary, "Dự thảo kỹ thuật tự trị cho ");
});

// ===== Tích hợp DB: createSwarmDebate / addSwarmArgument / getSwarmDebateById / listSwarmDebates / synthesizeSwarmDebate =====

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, ten);
}

test(
  "createSwarmDebate + addSwarmArgument + getSwarmDebateById: trọng số lập luận tự lấy từ bảng thẩm quyền, kèm đủ lập luận đã thêm theo đúng thứ tự",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const { createSwarmDebate, addSwarmArgument, getSwarmDebateById } =
      await import("@/lib/ky-thuat/engineering-swarm-orchestrator");

    const projectId = await taoDuAn("Test swarm debate 1");
    try {
      const debate = await createSwarmDebate(
        projectId,
        "Xử lý va chạm ống gió và dầm kết cấu tầng 5",
        "clash_detection",
      );
      assert.equal(debate.status, "open");
      assert.equal(debate.debate_topic, "Xử lý va chạm ống gió và dầm kết cấu tầng 5");
      assert.deepEqual(debate.participating_agents, [
        "agent_structural",
        "agent_mepf",
        "agent_cost_qs",
        "agent_safety",
        "agent_contract",
      ]);

      const arg1 = await addSwarmArgument(debate.id, {
        agent_role: "agent_safety",
        stance: "object",
        argument_text: "Vi phạm khoảng lùi PCCC",
      });
      // Không truyền authority_weight → phải tự lấy đúng từ AGENT_AUTHORITY_WEIGHTS.
      assert.equal(Number(arg1.authority_weight), AGENT_AUTHORITY_WEIGHTS.agent_safety);
      assert.deepEqual(arg1.cited_clauses, [], "mặc định mảng rỗng khi không truyền");
      assert.deepEqual(arg1.impact_assessment, {
        cost_delta_vnd: 0,
        schedule_delta_days: 0,
        risk_score: 0,
      });

      await addSwarmArgument(debate.id, {
        agent_role: "agent_structural",
        stance: "amend",
        argument_text: "Nâng dầm thêm 100mm",
        cited_clauses: ["TCVN 2737:2023 Điều 5"],
        impact_assessment: { cost_delta_vnd: 5_000_000, schedule_delta_days: 2, risk_score: 3 },
      });

      const day_du = await getSwarmDebateById(projectId, debate.id);
      assert.ok(day_du);
      assert.equal(day_du!.arguments!.length, 2);
      assert.equal(day_du!.arguments![0].agent_role, "agent_safety", "phải đúng thứ tự tạo trước");
      assert.equal(day_du!.arguments![1].agent_role, "agent_structural");
      assert.deepEqual(day_du!.arguments![1].cited_clauses, ["TCVN 2737:2023 Điều 5"]);

      assert.equal(
        await getSwarmDebateById(projectId, "00000000-0000-0000-0000-000000000000"),
        null,
      );
    } finally {
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);

test(
  "listSwarmDebates: chỉ trả đúng phiên của dự án, mới nhất trước (created_at DESC)",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const { createSwarmDebate, listSwarmDebates } =
      await import("@/lib/ky-thuat/engineering-swarm-orchestrator");

    const projectA = await taoDuAn("Test swarm list A");
    const projectB = await taoDuAn("Test swarm list B");
    try {
      const d1 = await createSwarmDebate(projectA, "Chủ đề 1", "trigger1");
      const d2 = await createSwarmDebate(projectA, "Chủ đề 2", "trigger2");
      await createSwarmDebate(projectB, "Chủ đề của dự án khác", "trigger3");

      const ds = await listSwarmDebates(projectA);
      assert.equal(ds.length, 2, "không được lẫn phiên của dự án khác");
      assert.equal(ds[0].id, d2.id, "phiên tạo sau phải đứng đầu danh sách");
      assert.equal(ds[1].id, d1.id);
    } finally {
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projectA, projectB);
    }
  },
);

test(
  "synthesizeSwarmDebate: tổng hợp đúng bằng calculateSwarmConsensus và ghi lại trạng thái synthesized",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const { createSwarmDebate, addSwarmArgument, synthesizeSwarmDebate, calculateSwarmConsensus } =
      await import("@/lib/ky-thuat/engineering-swarm-orchestrator");

    const projectId = await taoDuAn("Test swarm synthesize");
    try {
      const debate = await createSwarmDebate(projectId, "Chủ đề tổng hợp", "manual");
      await addSwarmArgument(debate.id, {
        agent_role: "agent_safety",
        stance: "concur",
        argument_text: "OK",
      });
      await addSwarmArgument(debate.id, {
        agent_role: "agent_structural",
        stance: "concur",
        argument_text: "OK",
      });

      const ky_vong = calculateSwarmConsensus([
        { agent_role: "agent_safety", stance: "concur", argument_text: "OK" },
        { agent_role: "agent_structural", stance: "concur", argument_text: "OK" },
      ]);

      const sau = await synthesizeSwarmDebate(projectId, debate.id);
      assert.equal(sau.status, "synthesized");
      assert.equal(sau.consensus_level, ky_vong.consensusLevel);
      assert.equal(sau.synthesis_summary, ky_vong.synthesisSummary);
      assert.equal(sau.consensus_level, "unanimous");
    } finally {
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);

test(
  "synthesizeSwarmDebate: phiên không tồn tại → ném lỗi tiếng Việt rõ ràng, không âm thầm trả undefined",
  S,
  async () => {
    const { synthesizeSwarmDebate } = await import("@/lib/ky-thuat/engineering-swarm-orchestrator");
    const projectId = await taoDuAn("Test swarm synthesize not found");
    const { run } = await import("@/lib/db");
    try {
      await assert.rejects(
        () => synthesizeSwarmDebate(projectId, "00000000-0000-0000-0000-000000000000"),
        /Không tìm thấy phiên Swarm Debate\./,
      );
    } finally {
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);
