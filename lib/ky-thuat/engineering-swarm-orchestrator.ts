// lib/engineering-swarm-orchestrator.ts — Unified Multi-Agent Swarm Orchestration, Gate 0 & Consensus Engine (PIN-3 / ENG-3 / ENG-4 / M92)
import crypto from "crypto";
import { query, queryOne, run, withProjectScope } from "@/lib/db";

export type SwarmAgentRole =
  | "agent_structural"
  | "agent_mepf"
  | "agent_cost_qs"
  | "agent_safety"
  | "agent_contract"
  | "agent_reviewer";

export const AGENT_AUTHORITY_WEIGHTS: Record<SwarmAgentRole, number> = {
  agent_safety: 2.0,
  agent_structural: 1.8,
  agent_mepf: 1.5,
  agent_contract: 1.4,
  agent_cost_qs: 1.2,
  agent_reviewer: 1.0,
};

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
  topic?: string;
  synthesis?: string;
  singleUseToken: string;
  isAuthorized: boolean;
  spatialCoordinates: { x: number; y: number; z: number; zone?: string; level?: string } | null;
  standardsCitations: Array<{ code: string; clause: string; relevance: string }>;
  riskAndCostAssessment: {
    estimatedCostVnd: number;
    scheduleDeltaDays: number;
    riskLevel: "low" | "medium" | "high";
  };
  provenanceHash: string;
  swarmDebateId: string | null;
  createdIso: string;
}

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

export function generateAutonomousTechnicalDraft(
  draftTypeOrInput: any,
  titleArg?: string,
  technicalDescriptionArg?: string,
  debateIdArg: string | null = null,
  spatialCoordsArg: AutonomousTechnicalDraft["spatialCoordinates"] = null,
): AutonomousTechnicalDraft {
  if (typeof draftTypeOrInput === "object" && draftTypeOrInput !== null) {
    const input = draftTypeOrInput;
    const draftId = `DRAFT-${String(input.draftType || "RFI").toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const token = `TKN-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
    const cost = input.costEstimateVnd ?? 0;
    const days = input.scheduleDeltaDays ?? 0;
    let riskLevel: "low" | "medium" | "high" = "low";
    if (cost > 50_000_000 || days > 7) riskLevel = "high";
    else if (cost > 10_000_000 || days > 2) riskLevel = "medium";

    return {
      draftId,
      draftType: input.draftType,
      title: input.title,
      topic: input.topic,
      synthesis: input.synthesis,
      targetRecipients: ["Chủ đầu tư / Ban QLDA", "Tư vấn Giám sát (TVGS)"],
      executiveSummary: input.synthesis || `Dự thảo kỹ thuật tự trị cho ${input.title}`,
      technicalDescription: `Hồ sơ kỹ thuật tự động tạo từ Swarm Intelligence cho chủ đề: ${input.topic || input.title}.`,
      spatialCoordinates: input.coordinates || null,
      singleUseToken: token,
      isAuthorized: false,
      standardsCitations: input.citations ?? [],
      riskAndCostAssessment: {
        estimatedCostVnd: cost,
        scheduleDeltaDays: days,
        riskLevel,
      },
      provenanceHash: crypto
        .createHash("sha256")
        .update(`${draftId}|${token}|${input.title}`)
        .digest("hex"),
      swarmDebateId: input.debateId ?? null,
      createdIso: new Date().toISOString(),
    };
  }

  const draftType = draftTypeOrInput;
  const title = titleArg || "";
  const technicalDescription = technicalDescriptionArg || "";
  const draftId = `DRAFT-${String(draftType).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const token = `TKN-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const createdIso = new Date().toISOString();
  const rawPayload = `${draftId}|${title}|${technicalDescription}|${createdIso}`;
  const provenanceHash = crypto.createHash("sha256").update(rawPayload).digest("hex");

  return {
    draftId,
    draftType,
    title,
    targetRecipients: ["Chỉ huy trưởng", "Tư vấn Giám sát"],
    executiveSummary: `Dự thảo kỹ thuật tự trị cho ${title}`,
    technicalDescription,
    spatialCoordinates: spatialCoordsArg,
    singleUseToken: token,
    isAuthorized: false,
    standardsCitations: [
      { code: "TCVN 5687:2010", clause: "Điều 6", relevance: "Thông gió và điều hòa không khí" },
      {
        code: "Nghị định 06/2021/NĐ-CP",
        clause: "Điều 14",
        relevance: "Quản lý chất lượng thi công",
      },
    ],
    riskAndCostAssessment: {
      estimatedCostVnd: 0,
      scheduleDeltaDays: 0,
      riskLevel: "low",
    },
    provenanceHash,
    swarmDebateId: debateIdArg,
    createdIso,
  };
}

export async function listSwarmDebates(projectId: number): Promise<SwarmDebateRecord[]> {
  return await query<SwarmDebateRecord>(
    `SELECT * FROM engineering_swarm_debates WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
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
