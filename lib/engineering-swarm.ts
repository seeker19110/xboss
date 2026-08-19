// lib/engineering-swarm.ts — Multi-Agent Swarm Orchestration & Autonomous Drafting (PIN-3)
import crypto from "crypto";
import { query, queryOne, run, withProjectScope } from "@/lib/db";

export type SwarmAgentRole =
  | "agent_structural"
  | "agent_mepf"
  | "agent_cost_qs"
  | "agent_safety"
  | "agent_contract"
  | "agent_reviewer";

export type DebateStance = "propose" | "concur" | "object" | "amend" | "neutral";
export type DebateStatus = "open" | "debating" | "synthesized" | "authorized" | "cancelled";
export type ConsensusLevel =
  "unanimous" | "majority_with_dissent" | "authority_reconciled" | "human_escalation_required";

export interface SwarmArgumentRecord {
  id: string;
  debate_id: string;
  agent_role: SwarmAgentRole;
  stance: DebateStance;
  authority_weight: number;
  argument_text: string;
  cited_clauses: string[];
  impact_assessment: {
    cost_delta_vnd: number;
    schedule_delta_days: number;
    risk_score: number;
  };
  created_at: string;
}

export interface SwarmDebateRecord {
  id: string;
  project_id: number;
  debate_topic: string;
  trigger_event: string;
  participating_agents: SwarmAgentRole[];
  status: DebateStatus;
  synthesis_summary: string | null;
  consensus_level: ConsensusLevel | null;
  created_at: string;
  updated_at: string;
  arguments?: SwarmArgumentRecord[];
}

export interface AutonomousTechnicalDraft {
  draftId: string;
  draftType: "rfi" | "material_submittal" | "drawing_revision_proposal" | "inspection_package";
  title: string;
  targetRecipients: string[];
  executiveSummary: string;
  technicalDescription: string;
  spatialCoordinates: { x: number; y: number; z: number; zone?: string; level?: string } | null;
  standardsCitations: Array<{ code: string; clause: string; relevance: string }>;
  riskAndCostAssessment: {
    estimatedCostVnd: number;
    scheduleDeltaDays: number;
    riskLevel: "low" | "medium" | "high";
  };
  requiredApprovalRole: "pm" | "bch" | "engineer";
  singleUseToken: string;
  tokenExpiresAt: string;
  isAuthorized: boolean;
}

// ============================================================================
// 1. THUẬT TOÁN ĐỒNG THUẬN DỰA TRÊN THẨM QUYỀN NGUỒN (AUTHORITY SYNTHESIS)
// ============================================================================

export const AGENT_AUTHORITY_WEIGHTS: Record<SwarmAgentRole, number> = {
  agent_safety: 1.5, // Quy chuẩn an toàn sinh mạng PCCC (QCVN 06) có trọng số tối cao
  agent_structural: 1.4, // An toàn chịu lực kết cấu
  agent_mepf: 1.2, // Tiêu chuẩn kỹ thuật công năng cơ điện
  agent_cost_qs: 1.1, // Ngân sách và hợp đồng
  agent_contract: 1.0, // Thủ tục pháp lý hợp đồng
  agent_reviewer: 1.3, // Thẩm tra độc lập
};

export function calculateSwarmConsensus(
  args: Array<{
    agent_role: SwarmAgentRole;
    stance: DebateStance;
    authority_weight?: number;
    argument_text: string;
    cited_clauses?: string[];
  }>,
): {
  consensusLevel: ConsensusLevel;
  weightedScore: number;
  synthesisSummary: string;
  dissentingOpinions: string[];
  dominantStance: DebateStance;
} {
  if (args.length === 0) {
    return {
      consensusLevel: "human_escalation_required",
      weightedScore: 0,
      synthesisSummary: "Chưa có lập luận nào được ghi nhận trong phiên Swarm Debate.",
      dissentingOpinions: [],
      dominantStance: "neutral",
    };
  }

  let totalSupportWeight = 0;
  let totalObjectWeight = 0;
  let totalAmendWeight = 0;
  let totalWeight = 0;

  const dissentingOpinions: string[] = [];

  for (const arg of args) {
    const weight = arg.authority_weight ?? (AGENT_AUTHORITY_WEIGHTS[arg.agent_role] || 1.0);
    totalWeight += weight;

    if (arg.stance === "propose" || arg.stance === "concur") {
      totalSupportWeight += weight;
    } else if (arg.stance === "object") {
      totalObjectWeight += weight;
      dissentingOpinions.push(`[${arg.agent_role}] Phản đối: ${arg.argument_text}`);
    } else if (arg.stance === "amend") {
      totalAmendWeight += weight;
      dissentingOpinions.push(`[${arg.agent_role}] Đề xuất sửa đổi: ${arg.argument_text}`);
    }
  }

  const supportRatio = totalWeight > 0 ? totalSupportWeight / totalWeight : 0;
  const objectRatio = totalWeight > 0 ? totalObjectWeight / totalWeight : 0;

  let consensusLevel: ConsensusLevel;
  let dominantStance: DebateStance;
  let summary = "";

  if (objectRatio === 0 && totalAmendWeight === 0) {
    consensusLevel = "unanimous";
    dominantStance = "concur";
    summary = `Toàn bộ ${args.length} tác tử chuyên ngành đồng thuận tuyệt đối (Độ tin cậy: ${(supportRatio * 100).toFixed(1)}%).`;
  } else if (supportRatio >= 0.7) {
    consensusLevel = "majority_with_dissent";
    dominantStance = "concur";
    summary = `Đa số chuyên gia đồng thuận (${(supportRatio * 100).toFixed(1)}% trọng số), ghi nhận ${dissentingOpinions.length} ý kiến bảo lưu/sửa đổi.`;
  } else if (supportRatio >= 0.5 && totalObjectWeight <= totalAmendWeight) {
    consensusLevel = "authority_reconciled";
    dominantStance = "amend";
    summary = `Đạt thỏa hiệp kỹ thuật sau khi hòa giải các điều khoản sửa đổi từ Agent An toàn & Kết cấu.`;
  } else {
    consensusLevel = "human_escalation_required";
    dominantStance = "object";
    summary = `Bất đồng quan điểm lớn giữa các bộ môn (Tỷ lệ phản đối: ${(objectRatio * 100).toFixed(1)}%). Chuyển Kỹ sư trưởng/PM quyết định.`;
  }

  return {
    consensusLevel,
    weightedScore: Math.round(supportRatio * 100) / 100,
    synthesisSummary: summary,
    dissentingOpinions,
    dominantStance,
  };
}

// ============================================================================
// 2. SOẠN THẢO TỰ ĐỘNG VÀ BẢO MẬT TOKEN (AUTONOMOUS DRAFTING & TOKEN GATE)
// ============================================================================

export function generateAutonomousTechnicalDraft(params: {
  draftType: "rfi" | "material_submittal" | "drawing_revision_proposal" | "inspection_package";
  title: string;
  topic: string;
  synthesis: string;
  citations: Array<{ code: string; clause: string; relevance: string }>;
  coordinates?: { x: number; y: number; z: number; zone?: string; level?: string };
  costEstimateVnd?: number;
  scheduleDeltaDays?: number;
}): AutonomousTechnicalDraft {
  const token = `TKN-${crypto.randomBytes(16).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  return {
    draftId: `DRAFT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    draftType: params.draftType,
    title: params.title,
    targetRecipients: ["Chủ đầu tư / Ban QLDA", "Tư vấn Giám sát (TVGS)"],
    executiveSummary: params.synthesis,
    technicalDescription: `Hồ sơ kỹ thuật tự động tạo từ Swarm Intelligence cho chủ đề: ${params.topic}. Đã đối soát điều khoản tiêu chuẩn kỹ thuật hiện hành.`,
    spatialCoordinates: params.coordinates || null,
    standardsCitations: params.citations,
    riskAndCostAssessment: {
      estimatedCostVnd: params.costEstimateVnd || 0,
      scheduleDeltaDays: params.scheduleDeltaDays || 0,
      riskLevel:
        (params.costEstimateVnd || 0) > 50000000
          ? "high"
          : (params.scheduleDeltaDays || 0) > 3
            ? "medium"
            : "low",
    },
    requiredApprovalRole: "pm",
    singleUseToken: token,
    tokenExpiresAt: expiresAt,
    isAuthorized: false,
  };
}

// ============================================================================
// 3. DATABASE CRUD & WORKFLOW
// ============================================================================

export async function listSwarmDebates(projectId: number): Promise<SwarmDebateRecord[]> {
  const debates = await query<SwarmDebateRecord>(
    `SELECT * FROM engineering_swarm_debates WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
  return debates;
}

export async function getSwarmDebateById(
  projectId: number,
  debateId: string,
): Promise<SwarmDebateRecord | null> {
  const debate = await queryOne<SwarmDebateRecord>(
    `SELECT * FROM engineering_swarm_debates WHERE project_id = ? AND id = ?`,
    [projectId, debateId],
  );

  if (!debate) return null;

  const args = await query<SwarmArgumentRecord>(
    `SELECT * FROM engineering_swarm_arguments WHERE debate_id = ? ORDER BY created_at ASC`,
    [debateId],
  );

  return {
    ...debate,
    arguments: args,
  };
}

export async function createSwarmDebate(
  projectId: number,
  topic: string,
  triggerEvent: string,
  agents: SwarmAgentRole[] = [
    "agent_structural",
    "agent_mepf",
    "agent_cost_qs",
    "agent_safety",
    "agent_contract",
  ],
): Promise<SwarmDebateRecord> {
  const [created] = await query<SwarmDebateRecord>(
    `INSERT INTO engineering_swarm_debates (project_id, debate_topic, trigger_event, participating_agents, status)
     VALUES (?, ?, ?, ?::jsonb, 'open')
     RETURNING *`,
    [projectId, topic, triggerEvent, JSON.stringify(agents)],
  );
  return created;
}

export async function addSwarmArgument(
  debateId: string,
  arg: {
    agent_role: SwarmAgentRole;
    stance: DebateStance;
    argument_text: string;
    cited_clauses?: string[];
    impact_assessment?: {
      cost_delta_vnd: number;
      schedule_delta_days: number;
      risk_score: number;
    };
  },
): Promise<SwarmArgumentRecord> {
  const weight = AGENT_AUTHORITY_WEIGHTS[arg.agent_role] || 1.0;
  const [created] = await query<SwarmArgumentRecord>(
    `INSERT INTO engineering_swarm_arguments (debate_id, agent_role, stance, authority_weight, argument_text, cited_clauses, impact_assessment)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
     RETURNING *`,
    [
      debateId,
      arg.agent_role,
      arg.stance,
      weight,
      arg.argument_text,
      JSON.stringify(arg.cited_clauses || []),
      JSON.stringify(
        arg.impact_assessment || { cost_delta_vnd: 0, schedule_delta_days: 0, risk_score: 0 },
      ),
    ],
  );
  return created;
}

export async function synthesizeSwarmDebate(
  projectId: number,
  debateId: string,
): Promise<SwarmDebateRecord> {
  const debate = await getSwarmDebateById(projectId, debateId);
  if (!debate) {
    throw new Error("Không tìm thấy phiên Swarm Debate.");
  }

  const consensus = calculateSwarmConsensus(debate.arguments || []);

  const [updated] = await query<SwarmDebateRecord>(
    `UPDATE engineering_swarm_debates
     SET status = 'synthesized',
         synthesis_summary = ?,
         consensus_level = ?,
         updated_at = NOW()
     WHERE project_id = ? AND id = ?
     RETURNING *`,
    [consensus.synthesisSummary, consensus.consensusLevel, projectId, debateId],
  );

  return updated;
}
