import { test } from "node:test";
import assert from "node:assert/strict";
import { conductMultiAgentDebate, DebateTopicInput } from "@/lib/engineering-multi-agent-copilot";

test("M72: conductMultiAgentDebate tổ chức thành công phiên phản biện đa Agent và đạt đồng thuận", () => {
  const input: DebateTopicInput = {
    topicTitle: "Xử lý xung đột dầm trục C4 và ống Chiller DN200",
    issueDescription: "Dầm kết cấu chặn ngang tuyến ống Chiller chính.",
    discipline: "hvac",
    costImpactVndEstimated: 45000000,
    scheduleImpactDaysEstimated: 2,
  };

  const res = conductMultiAgentDebate("SESSION-01", input);

  assert.equal(res.sessionCode, "SESSION-01");
  assert.equal(res.perspectives.length, 3);
  assert.equal(res.perspectives[0].agentRole, "lead_engineer");
  assert.equal(res.perspectives[1].agentRole, "chief_qs");
  assert.equal(res.perspectives[2].agentRole, "site_commander");
  assert.ok(res.consensusVerdict.includes("ĐỒNG THUẬN PHÊ DUYỆT"));
  assert.ok(res.consensusToken.startsWith("SIG-CONSENSUS-"));
  assert.equal(res.isApprovalReadyForPm, true);
});
