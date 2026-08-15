// ENG-4 — Multi-Agent Engineering OS (docs/nang-cap/ENG-4-multi-agent-engineering-os.md,
// cụ thể hoá docs/nang-cap/ENGINEERING-OS-ENG2-ENG3-ENG4.md §15–§28).
//
// RANH GIỚI (luật cứng): ENG-4 = DELEGATE / COORDINATE / RECONCILE. Kết quả một phiên là
// BẢN KẾ HOẠCH ĐÃ HOÀ GIẢI, không phải lệnh thực thi — muốn có tác động thật phải tạo
// workflow ENG-3 và đi qua đủ cửa duyệt. Không hàm nào ở đây ghi boq_items/payment_bills/
// tasks, cũng không tự tạo/duyệt workflow.
//
// XBoss đóng vai Reconciler/Verifier, KHÔNG chạy agent: agent thật (MEPF-Agents) chạy ở hệ
// của họ và gửi claim vào đây.
import { z } from "zod";
import { query, queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import {
  computeConfidence,
  type ConfidenceLevel,
  type ConfidenceSignals,
} from "@/lib/engineering-intel";

// ---------- §16 Agent roles ----------
export const AGENT_ROLES = [
  "planner",
  "specialist",
  "verifier",
  "critic",
  "reconciler",
  "executor",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  planner: "Điều phối",
  specialist: "Chuyên môn",
  verifier: "Kiểm chứng",
  critic: "Phản biện",
  reconciler: "Hoà giải",
  executor: "Thực thi",
};

// ---------- §20 Authority hierarchy ----------
// Thứ tự từ CAO xuống THẤP. Model confidence KHÔNG nằm trên authority (§20) — vì thế
// phân xử xung đột dữ liệu đi theo bảng này trước, confidence chỉ dùng cho Type B.
export const AUTHORITY_ORDER = [
  "authoritative_source",
  "validated_rule",
  "specialist",
  "verifier",
  "derived",
] as const;
export type SourceAuthority = (typeof AUTHORITY_ORDER)[number];

// ---------- §17 Conflict model ----------
export const CONFLICT_TYPES = [
  "data",
  "interpretation",
  "constraint",
  "execution",
  "scope",
] as const;
export type ConflictType = (typeof CONFLICT_TYPES)[number];

export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  data: "Dữ liệu",
  interpretation: "Diễn giải",
  constraint: "Ràng buộc",
  execution: "Thực thi",
  scope: "Phạm vi",
};

// §17.C constraint hierarchy — từ CAO xuống THẤP.
export const CONSTRAINT_ORDER = [
  "safety_law",
  "contract",
  "engineering",
  "project",
  "cost_schedule",
  "preference",
] as const;
export type ConstraintKind = (typeof CONSTRAINT_ORDER)[number];

export const RESOLUTION_METHODS = [
  "source_authority",
  "evidence_comparison",
  "constraint_hierarchy",
  "independent_verification",
  "human_authority",
  "preference_vote",
] as const;
export type ResolutionMethod = (typeof RESOLUTION_METHODS)[number];

export const CONSENSUS_LEVELS = [
  "pending",
  "consensus_confirmed",
  "consensus_with_risk",
  "partial_agreement",
  "conflict_requires_review",
  "no_consensus",
] as const;
export type ConsensusLevel = (typeof CONSENSUS_LEVELS)[number];

export const CONSENSUS_LABELS: Record<ConsensusLevel, string> = {
  pending: "Chưa xét",
  consensus_confirmed: "Đồng thuận",
  consensus_with_risk: "Đồng thuận có rủi ro",
  partial_agreement: "Đồng thuận một phần",
  conflict_requires_review: "Xung đột cần người xem xét",
  // §22: đây là trạng thái HỢP LỆ, không phải lỗi — nhãn nói rõ để UI không tô như sự cố.
  no_consensus: "Chưa đồng thuận (hợp lệ)",
};

export type ClaimLike = {
  id: string;
  agentRole: AgentRole;
  topic: string;
  claim: string;
  assumptions?: unknown[];
  confidence: ConfidenceLevel;
  sourceAuthority: SourceAuthority;
  sourceRevisionId?: string | null;
  payload?: { constraintKind?: ConstraintKind } & Record<string, unknown>;
};

// ---------- §18 bước 1 — DETECT ----------
// Gom theo topic; ≥2 claim KHÁC NỘI DUNG trên cùng topic là xung đột. Nhiều agent nói CÙNG
// một điều thì đó là đồng thuận, không phải "phiếu bầu" — không đếm số lượng ở đây (§19).
export function detectConflicts(claims: ClaimLike[]): { topic: string; claimIds: string[] }[] {
  const byTopic = new Map<string, ClaimLike[]>();
  for (const c of claims) {
    const arr = byTopic.get(c.topic) ?? [];
    arr.push(c);
    byTopic.set(c.topic, arr);
  }
  const out: { topic: string; claimIds: string[] }[] = [];
  for (const [topic, arr] of byTopic) {
    const distinct = new Set(arr.map((c) => c.claim.trim()));
    if (distinct.size > 1) out.push({ topic, claimIds: arr.map((c) => c.id) });
  }
  return out;
}

// ---------- §18 bước 2 — CLASSIFY ----------
// Một xung đột có thể chạm nhiều loại — chọn loại KHÓ nhất trước, không bao giờ hạ cấp
// (hạ cấp sai làm mất luôn lớp bảo vệ tương ứng).
export function classifyConflict(claims: ClaimLike[]): ConflictType {
  const revs = new Set(claims.map((c) => c.sourceRevisionId ?? ""));
  if (revs.size > 1) return "data"; // đọc khác dữ liệu (§17.A)
  if (claims.some((c) => c.agentRole === "executor")) return "execution"; // §17.D
  if (claims.some((c) => c.payload?.constraintKind)) return "constraint"; // §17.C
  const assumptionSigs = new Set(claims.map((c) => JSON.stringify(c.assumptions ?? [])));
  if (assumptionSigs.size > 1) return "interpretation"; // cùng dữ liệu, khác giả định (§17.B)
  return "scope";
}

// ---------- §19 + §20 — Phân xử, KHÔNG majority vote ----------

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1, unknown: 0 };

export type ResolutionProposal = {
  method: ResolutionMethod;
  winnerClaimId: string | null;
  rationale: string;
  needsHuman: boolean;
};

export function proposeResolution(type: ConflictType, claims: ClaimLike[]): ResolutionProposal {
  switch (type) {
    case "data": {
      // §17.A: KHÔNG dùng voting. Xếp theo hạng nguồn, bằng hạng thì lấy revision mới hơn.
      const sorted = [...claims].sort((a, b) => {
        const d =
          AUTHORITY_ORDER.indexOf(a.sourceAuthority) - AUTHORITY_ORDER.indexOf(b.sourceAuthority);
        if (d !== 0) return d;
        return (b.sourceRevisionId ?? "").localeCompare(a.sourceRevisionId ?? "");
      });
      const top = sorted[0];
      const tie =
        sorted.length > 1 &&
        sorted[1].sourceAuthority === top.sourceAuthority &&
        (sorted[1].sourceRevisionId ?? "") === (top.sourceRevisionId ?? "");
      return {
        method: "source_authority",
        winnerClaimId: tie ? null : top.id,
        rationale: tie
          ? "Hai nguồn cùng hạng và cùng phiên bản — không tự phân xử được"
          : `Nguồn hạng cao hơn thắng: ${top.sourceAuthority}`,
        needsHuman: tie,
      };
    }
    case "interpretation": {
      // §17.B: so bằng chứng. Chênh <2 bậc confidence thì chưa đủ cơ sở → cần kiểm chứng
      // độc lập/chuyên gia phân xử, không tự chọn bên.
      const sorted = [...claims].sort(
        (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
      );
      const gap =
        CONFIDENCE_RANK[sorted[0].confidence] - CONFIDENCE_RANK[sorted[1]?.confidence ?? "unknown"];
      const decisive = gap >= 2;
      return {
        method: "evidence_comparison",
        winnerClaimId: decisive ? sorted[0].id : null,
        rationale: decisive
          ? `Chênh lệch độ tin cậy đủ lớn (${sorted[0].confidence} vs ${sorted[1]?.confidence})`
          : "Độ tin cậy sát nhau — cần kiểm chứng độc lập hoặc chuyên gia phân xử",
        needsHuman: !decisive,
      };
    }
    case "constraint": {
      const kinds = claims
        .map((c) => c.payload?.constraintKind)
        .filter((k): k is ConstraintKind => !!k)
        .sort((a, b) => CONSTRAINT_ORDER.indexOf(a) - CONSTRAINT_ORDER.indexOf(b));
      const top = kinds[0];
      // §17.C: chạm an toàn/pháp luật hoặc hợp đồng thì KHÔNG được giải tự động.
      const mandatory = top === "safety_law" || top === "contract";
      const winner = claims.find((c) => c.payload?.constraintKind === top) ?? null;
      return {
        method: "constraint_hierarchy",
        winnerClaimId: mandatory ? null : (winner?.id ?? null),
        rationale: `Ràng buộc bậc cao nhất: ${top ?? "không xác định"}${mandatory ? " — bắt buộc người có thẩm quyền quyết định" : ""}`,
        needsHuman: mandatory || !winner,
      };
    }
    case "execution":
      // §17.D: đóng băng, so tác động, hoà giải, ENG-3 phê duyệt rồi mới thực thi. Không
      // agent nào tự execute.
      return {
        method: "independent_verification",
        winnerClaimId: null,
        rationale:
          "Xung đột hành động: đóng băng, so tác động, hoà giải rồi mới đưa qua phê duyệt ENG-3",
        needsHuman: true,
      };
    case "scope":
    default:
      return {
        method: "human_authority",
        winnerClaimId: null,
        rationale: "Khác biệt phạm vi — cần người có thẩm quyền chốt",
        needsHuman: true,
      };
  }
}

export class VoteNotAllowedError extends Error {}

// §19: voting CHỈ dùng cho xếp hạng ưu tiên rủi ro thấp — không bao giờ để override bằng
// chứng có thẩm quyền, ràng buộc bắt buộc hay luật an toàn. Làm thành lỗi CỨNG để việc dùng
// sai chỗ không thể lọt qua như một quy ước lỏng.
export function assertVoteAllowed(
  type: ConflictType,
  claims: ClaimLike[],
  lowRiskPreference: boolean,
): void {
  if (!lowRiskPreference)
    throw new VoteNotAllowedError("Bỏ phiếu chỉ dùng cho lựa chọn ưu tiên rủi ro thấp");
  if (type !== "scope")
    throw new VoteNotAllowedError(
      `Không được bỏ phiếu cho xung đột loại "${CONFLICT_TYPE_LABELS[type]}"`,
    );
  if (claims.some((c) => c.sourceAuthority === "authoritative_source"))
    throw new VoteNotAllowedError("Không được bỏ phiếu để lật nguồn có thẩm quyền");
  if (
    claims.some(
      (c) => c.payload?.constraintKind === "safety_law" || c.payload?.constraintKind === "contract",
    )
  )
    throw new VoteNotAllowedError("Không được bỏ phiếu cho ràng buộc an toàn/pháp lý/hợp đồng");
  if (claims.some((c) => CONFIDENCE_RANK[c.confidence] < CONFIDENCE_RANK.medium))
    throw new VoteNotAllowedError(
      "Mọi phương án phải đạt độ tin cậy tối thiểu trung bình mới được bỏ phiếu",
    );
}

// ---------- §22 Consensus + §21 hard limits ----------

export type ConflictLike = { stage: string; conflictType: ConflictType };

const DONE_STAGES = new Set(["verified", "authorized"]);

export function computeConsensus(
  conflicts: ConflictLike[],
  roundCount: number,
  maxRounds: number,
): ConsensusLevel {
  if (conflicts.length === 0) return "consensus_confirmed";

  const unresolved = conflicts.filter((c) => c.stage === "unresolved");
  const done = conflicts.filter((c) => DONE_STAGES.has(c.stage));
  const pending = conflicts.filter((c) => !DONE_STAGES.has(c.stage) && c.stage !== "unresolved");

  // §21: hết vòng mà chưa xong → no_consensus. KHÔNG ép consensus giả.
  if (roundCount >= maxRounds && (unresolved.length > 0 || pending.length > 0))
    return "no_consensus";

  if (unresolved.length > 0) return "conflict_requires_review";
  if (pending.length > 0) return done.length > 0 ? "partial_agreement" : "conflict_requires_review";

  // Mọi xung đột đã xong — nhưng nếu từng chạm ràng buộc/thực thi thì ghi nhận có rủi ro.
  const risky = conflicts.some(
    (c) => c.conflictType === "constraint" || c.conflictType === "execution",
  );
  return risky ? "consensus_with_risk" : "consensus_confirmed";
}

// ---------- Schema đầu vào ----------

export const agentClaimInputSchema = z.object({
  agentRole: z.enum(AGENT_ROLES),
  agentName: z.string().trim().min(1).max(255),
  topic: z.string().trim().min(1).max(255),
  claim: z.string().trim().min(1).max(4000),
  payload: z.record(z.string(), z.unknown()).default({}),
  assumptions: z.array(z.unknown()).default([]),
  confidenceSignals: z.record(z.string(), z.unknown()).default({}),
  sourceAuthority: z.enum(AUTHORITY_ORDER).default("derived"),
  sourceRevisionId: z.string().uuid().nullable().optional(),
});

export const agentSessionInputSchema = z.object({
  intent: z.string().trim().min(1).max(2000),
  maxRounds: z.number().int().min(1).max(20).default(5),
  conflictBudget: z.number().int().min(1).max(100).default(10),
  traceId: z.string().trim().max(255).nullable().optional(),
  claims: z.array(agentClaimInputSchema).min(1).max(200),
});
export type AgentSessionInput = z.infer<typeof agentSessionInputSchema>;

export type SessionRow = {
  id: string;
  projectId: number;
  intent: string;
  consensus: ConsensusLevel;
  status: string;
  maxRounds: number;
  roundCount: number;
  workflowId: string | null;
  createdAt: string;
};

export type ConflictRow = {
  id: string;
  topic: string;
  conflictType: ConflictType;
  stage: string;
  claimIds: string[];
  resolution: string | null;
  resolutionMethod: ResolutionMethod | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
};

export class AgentSessionError extends Error {}

// Đọc claim của 1 phiên về dạng ClaimLike (dùng chung cho detect/classify/propose).
async function loadClaims(sessionId: string): Promise<ClaimLike[]> {
  const rows = await query<{
    id: string;
    agentRole: AgentRole;
    topic: string;
    claim: string;
    assumptions: unknown[];
    confidence: ConfidenceLevel;
    sourceAuthority: SourceAuthority;
    sourceRevisionId: string | null;
    payload: Record<string, unknown>;
  }>(
    `SELECT id, agent_role AS "agentRole", topic, claim, assumptions, confidence,
            source_authority AS "sourceAuthority", source_revision_id AS "sourceRevisionId", payload
       FROM engineering_agent_claims WHERE session_id = ? ORDER BY created_at`,
    sessionId,
  );
  return rows as ClaimLike[];
}

// Chạy lại toàn bộ vòng detect → classify → ghi conflict (chỉ thêm topic CHƯA có conflict)
// → tính lại consensus. Gọi sau mỗi lần thêm claim.
async function reconcileSession(sessionId: string): Promise<ConsensusLevel> {
  const session = await queryOne<{ roundCount: number; maxRounds: number }>(
    `SELECT round_count AS "roundCount", max_rounds AS "maxRounds"
       FROM engineering_agent_sessions WHERE id = ?`,
    sessionId,
  );
  if (!session) throw new AgentSessionError("Phiên không tồn tại");

  const claims = await loadClaims(sessionId);
  const detected = detectConflicts(claims);

  for (const d of detected) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM engineering_conflicts WHERE session_id = ? AND topic = ?`,
      sessionId,
      d.topic,
    );
    const involved = claims.filter((c) => d.claimIds.includes(c.id));
    const type = classifyConflict(involved);
    if (existing) {
      // Cập nhật danh sách claim tham gia (vòng sau có thể thêm claim vào cùng topic).
      await run(
        `UPDATE engineering_conflicts SET claim_ids = ?::jsonb, conflict_type = ? WHERE id = ?`,
        JSON.stringify(d.claimIds),
        type,
        existing.id,
      );
    } else {
      await run(
        `INSERT INTO engineering_conflicts (session_id, topic, conflict_type, stage, claim_ids)
         VALUES (?, ?, ?, 'classified', ?::jsonb)`,
        sessionId,
        d.topic,
        type,
        JSON.stringify(d.claimIds),
      );
    }
  }

  const conflicts = await query<ConflictLike>(
    `SELECT stage, conflict_type AS "conflictType" FROM engineering_conflicts WHERE session_id = ?`,
    sessionId,
  );
  const consensus = computeConsensus(conflicts, session.roundCount, session.maxRounds);
  // Hết vòng mà chưa xong → đóng phiên, chuyển người xem xét (§21) — không thử thêm vòng.
  const status = consensus === "no_consensus" ? "closed" : "open";
  await run(
    `UPDATE engineering_agent_sessions SET consensus = ?, status = ?, updated_at = NOW() WHERE id = ?`,
    consensus,
    status,
    sessionId,
  );
  return consensus;
}

async function insertClaims(sessionId: string, round: number, claims: AgentSessionInput["claims"]) {
  for (const c of claims) {
    // Độ tin cậy tính lại ở server bằng đúng hàm của ENG-2 — agent không tự chấm điểm mình.
    const confidence = computeConfidence(c.confidenceSignals as ConfidenceSignals);
    await run(
      `INSERT INTO engineering_agent_claims
         (session_id, agent_role, agent_name, topic, claim, payload, assumptions,
          confidence, confidence_signals, source_authority, source_revision_id, round)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?, ?, ?)`,
      sessionId,
      c.agentRole,
      c.agentName,
      c.topic,
      c.claim,
      JSON.stringify(c.payload),
      JSON.stringify(c.assumptions),
      confidence,
      JSON.stringify(c.confidenceSignals),
      c.sourceAuthority,
      c.sourceRevisionId ?? null,
      round,
    );
  }
}

export async function openAgentSession(
  projectId: number,
  apiKeyId: number | null,
  input: AgentSessionInput,
): Promise<{ sessionId: string; consensus: ConsensusLevel }> {
  return withTransaction(async () => {
    const s = await queryOne<{ id: string }>(
      `INSERT INTO engineering_agent_sessions
         (project_id, intent, max_rounds, conflict_budget, round_count, trace_id, api_key_id)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       RETURNING id`,
      projectId,
      input.intent,
      input.maxRounds,
      input.conflictBudget,
      input.traceId ?? null,
      apiKeyId,
    );
    if (!s) throw new AgentSessionError("Tạo phiên thất bại");
    await insertClaims(s.id, 1, input.claims);
    const consensus = await reconcileSession(s.id);
    return { sessionId: s.id, consensus };
  });
}

export async function addClaims(
  projectId: number,
  sessionId: string,
  claims: AgentSessionInput["claims"],
): Promise<{ consensus: ConsensusLevel; roundCount: number; closed: boolean }> {
  return withTransaction(async () => {
    const s = await queryOne<{ status: string; roundCount: number; maxRounds: number }>(
      `SELECT status, round_count AS "roundCount", max_rounds AS "maxRounds"
         FROM engineering_agent_sessions WHERE id = ? AND project_id = ? FOR UPDATE`,
      sessionId,
      projectId,
    );
    if (!s) throw new AgentSessionError("Phiên không tồn tại hoặc không thuộc dự án đang chọn");
    if (s.status === "closed") throw new AgentSessionError("Phiên đã đóng — không nhận thêm claim");

    const nextRound = s.roundCount + 1;
    await run(
      `UPDATE engineering_agent_sessions SET round_count = ?, updated_at = NOW() WHERE id = ?`,
      nextRound,
      sessionId,
    );
    await insertClaims(sessionId, nextRound, claims);
    const consensus = await reconcileSession(sessionId);
    return { consensus, roundCount: nextRound, closed: consensus === "no_consensus" };
  });
}

export async function listAgentSessions(
  projectId: number,
  filter?: { status?: string; limit?: number },
): Promise<SessionRow[]> {
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
  const conds = ["project_id = ?"];
  const args: unknown[] = [projectId];
  if (filter?.status) {
    conds.push("status = ?");
    args.push(filter.status);
  }
  // Đọc ngoài transaction không có GUC app.project_id → RLS không có gì để so. Bọc
  // withProjectScope, cùng pattern các hàm đọc của lib/engineering-kernel.ts.
  return withProjectScope(projectId, () =>
    query<SessionRow>(
      `SELECT id, project_id AS "projectId", intent, consensus, status,
            max_rounds AS "maxRounds", round_count AS "roundCount",
            workflow_id AS "workflowId", created_at AS "createdAt"
       FROM engineering_agent_sessions
      WHERE ${conds.join(" AND ")}
      ORDER BY created_at DESC LIMIT ?`,
      ...args,
      limit,
    ),
  );
}

export async function getAgentSession(
  projectId: number,
  id: string,
): Promise<{
  session: SessionRow;
  claims: ClaimLike[];
  conflicts: (ConflictRow & { proposal: ResolutionProposal })[];
} | null> {
  // claims/conflicts không có cột project_id (ràng buộc qua session cha) nên phải đọc TRONG
  // cùng phạm vi GUC với session.
  return withProjectScope(projectId, async () => {
    const session = await queryOne<SessionRow>(
      `SELECT id, project_id AS "projectId", intent, consensus, status,
            max_rounds AS "maxRounds", round_count AS "roundCount",
            workflow_id AS "workflowId", created_at AS "createdAt"
       FROM engineering_agent_sessions WHERE id = ? AND project_id = ?`,
      id,
      projectId,
    );
    if (!session) return null;

    const claims = await loadClaims(id);
    const rows = await query<ConflictRow>(
      `SELECT id, topic, conflict_type AS "conflictType", stage, claim_ids AS "claimIds",
            resolution, resolution_method AS "resolutionMethod",
            resolved_by AS "resolvedBy", resolved_at AS "resolvedAt"
       FROM engineering_conflicts WHERE session_id = ? ORDER BY created_at`,
      id,
    );
    const conflicts = rows.map((c) => ({
      ...c,
      proposal: proposeResolution(
        c.conflictType,
        claims.filter((cl) => (c.claimIds ?? []).includes(cl.id)),
      ),
    }));
    return { session, claims, conflicts };
  });
}

// Người có thẩm quyền chốt 1 xung đột. Ghi rõ PHƯƠNG PHÁP đi tới kết luận (§19) —
// 'preference_vote' bị chặn cứng qua assertVoteAllowed.
export async function resolveConflict(
  projectId: number,
  sessionId: string,
  conflictId: string,
  userId: number,
  resolution: string,
  method: ResolutionMethod,
  opts?: { lowRiskPreference?: boolean },
): Promise<void> {
  return withTransaction(async () => {
    const s = await queryOne<{ id: string }>(
      `SELECT id FROM engineering_agent_sessions WHERE id = ? AND project_id = ?`,
      sessionId,
      projectId,
    );
    if (!s) throw new AgentSessionError("Phiên không tồn tại hoặc không thuộc dự án đang chọn");

    const c = await queryOne<{ id: string; conflictType: ConflictType; claimIds: string[] }>(
      `SELECT id, conflict_type AS "conflictType", claim_ids AS "claimIds"
         FROM engineering_conflicts WHERE id = ? AND session_id = ?`,
      conflictId,
      sessionId,
    );
    if (!c) throw new AgentSessionError("Xung đột không tồn tại trong phiên này");

    if (method === "preference_vote") {
      const claims = (await loadClaims(sessionId)).filter((cl) =>
        (c.claimIds ?? []).includes(cl.id),
      );
      assertVoteAllowed(c.conflictType, claims, opts?.lowRiskPreference ?? false);
    }

    await run(
      `UPDATE engineering_conflicts
          SET stage = 'verified', resolution = ?, resolution_method = ?, resolved_by = ?, resolved_at = NOW()
        WHERE id = ?`,
      resolution,
      method,
      userId,
      conflictId,
    );
    await reconcileSession(sessionId);
  });
}
