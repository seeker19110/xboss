import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSwarmConsensus,
  generateAutonomousTechnicalDraft,
  SwarmAgentRole,
  DebateStance,
} from "@/lib/engineering-swarm";

test("PIN-3: calculateSwarmConsensus xác định đồng thuận tuyệt đối (Unanimous)", () => {
  const args = [
    {
      agent_role: "agent_safety" as SwarmAgentRole,
      stance: "concur" as DebateStance,
      argument_text: "Tuân thủ điều khoản an toàn PCCC",
    },
    {
      agent_role: "agent_structural" as SwarmAgentRole,
      stance: "concur" as DebateStance,
      argument_text: "Kết cấu đảm bảo tải trọng",
    },
    {
      agent_role: "agent_mepf" as SwarmAgentRole,
      stance: "concur" as DebateStance,
      argument_text: "Lưu lượng khí phù hợp",
    },
  ];

  const result = calculateSwarmConsensus(args);
  assert.equal(result.consensusLevel, "unanimous");
  assert.equal(result.dominantStance, "concur");
  assert.equal(result.dissentingOpinions.length, 0);
});

test("PIN-3: calculateSwarmConsensus nhận diện đa số đồng thuận có bảo lưu ý kiến (Majority with dissent)", () => {
  const args = [
    {
      agent_role: "agent_safety" as SwarmAgentRole,
      stance: "concur" as DebateStance,
      argument_text: "Khoảng cách an toàn đạt chuẩn",
    },
    {
      agent_role: "agent_structural" as SwarmAgentRole,
      stance: "concur" as DebateStance,
      argument_text: "Chấp thuận mở sleeve",
    },
    {
      agent_role: "agent_cost_qs" as SwarmAgentRole,
      stance: "amend" as DebateStance,
      argument_text: "Cần bổ sung chi phí phát sinh",
    },
  ];

  const result = calculateSwarmConsensus(args);
  assert.equal(result.consensusLevel, "majority_with_dissent");
  assert.equal(result.dissentingOpinions.length, 1);
});

test("PIN-3: calculateSwarmConsensus kích hoạt Human Escalation khi bất đồng quan điểm lớn", () => {
  const args = [
    {
      agent_role: "agent_safety" as SwarmAgentRole,
      stance: "object" as DebateStance,
      argument_text: "Vi phạm nghiêm trọng điều khoản QCVN 06",
    },
    {
      agent_role: "agent_structural" as SwarmAgentRole,
      stance: "object" as DebateStance,
      argument_text: "Nguy cơ nứt dầm bê tông",
    },
    {
      agent_role: "agent_mepf" as SwarmAgentRole,
      stance: "propose" as DebateStance,
      argument_text: "Cần giữ nguyên hướng tuyến",
    },
  ];

  const result = calculateSwarmConsensus(args);
  assert.equal(result.consensusLevel, "human_escalation_required");
  assert.equal(result.dominantStance, "object");
});

test("PIN-3: generateAutonomousTechnicalDraft tạo bản nháp kèm mã Single-use Token", () => {
  const draft = generateAutonomousTechnicalDraft({
    draftType: "rfi",
    title: "Yêu cầu làm rõ xung đột dầm sàn",
    topic: "Xung đột ống gió và dầm trục 4",
    synthesis: "Thỏa hiệp hạ cao độ",
    citations: [{ code: "QCVN 06", clause: "5.1.2", relevance: "Lối thoát nạn" }],
    costEstimateVnd: 1500000,
    scheduleDeltaDays: 0,
  });

  assert.equal(draft.draftType, "rfi");
  assert.ok(draft.singleUseToken.startsWith("TKN-"));
  assert.equal(draft.isAuthorized, false);
  assert.equal(draft.riskAndCostAssessment.riskLevel, "low");
});
