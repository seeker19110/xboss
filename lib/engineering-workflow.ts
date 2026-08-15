// ENG-3 — Engineering Workflow OS (docs/nang-cap/ENG-3-engineering-workflow-os.md,
// cụ thể hoá docs/nang-cap/ENGINEERING-OS-ENG2-ENG3-ENG4.md §7–§14).
//
// ENG-3 LÀ RANH GIỚI UỶ QUYỀN của toàn track ENG (§26): ENG-2 chỉ đề xuất, ENG-4 chỉ phối
// hợp — mọi thay đổi có side effect phải qua đây. Không hàm nào trong file này tự thực thi
// side effect nghiệp vụ; trạng thái executing/completed do NGƯỜI xác nhận, hệ chỉ ghi nhận
// và audit (xem mục 1 file đặc tả — autonomy phải được cấp tường minh, chưa có cơ chế đó).
//
// KHÔNG dùng lib/approvals.ts (M46): engine đó chọn cấp duyệt theo ngưỡng TIỀN cho 4 loại
// thực thể đóng, ENG-3 chọn theo RISK 8 chiều + bắt buộc Gate 0. Hai hệ sống song song.
import { z } from "zod";
import { query, queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import type { Role } from "@/lib/roles";

// ---------- §10 Risk engine ----------

export type RiskClass = "low" | "medium" | "high" | "critical";

export const riskInputsSchema = z.object({
  safetyRisk: z.boolean().default(false),
  regulatoryRisk: z.boolean().default(false),
  financialImpact: z.number().min(0).default(0),
  crossDiscipline: z.boolean().default(false),
  reversible: z.boolean(),
  uncertainty: z.enum(["low", "medium", "high"]).default("medium"),
  scopeImpact: z.enum(["low", "medium", "high"]).default("low"),
});
export type RiskInputs = z.infer<typeof riskInputsSchema>;

// Ngưỡng tiền coi là "tác động lớn" — 100 triệu VND. Là hằng số cấu hình được về sau, đặt
// tên rõ để không thành số ma thuật rải rác (bài học kiểm kê hằng số của MEP-Agents).
export const HIGH_FINANCIAL_IMPACT_VND = 100_000_000;

// Quy tắc CỨNG, không thương lượng (§10): không có đường nào để "AI confidence cao" hạ cấp
// một thay đổi có safety/regulatory risk. Hàm chỉ nhận dữ liệu rủi ro — không nhận
// confidence, không nhận override.
export function classifyRisk(i: RiskInputs): RiskClass {
  if (i.safetyRisk) return "critical"; // an toàn là tuyệt đối, bất kể mọi yếu tố khác
  if (i.regulatoryRisk || i.reversible === false) return "high";
  if (
    i.financialImpact >= HIGH_FINANCIAL_IMPACT_VND ||
    i.crossDiscipline ||
    i.uncertainty === "high" ||
    i.scopeImpact === "high"
  )
    return "medium";
  return "low";
}

// ---------- §9 Approval profiles ----------

export type Profile = "A" | "B" | "C" | "D" | "E";

// hasSideEffect=false → PROFILE-A (chỉ Gate 0, publish thông tin, không tác động gì).
export function selectProfile(risk: RiskClass, hasSideEffect: boolean): Profile {
  if (!hasSideEffect) return "A";
  switch (risk) {
    case "critical":
      return "E";
    case "high":
      return "D";
    case "medium":
      return "C";
    default:
      return "B";
  }
}

export type GateType =
  "technical_review" | "discipline_qa" | "independent_qa" | "authority_release";
export type GateSpec = { seq: number; gateType: GateType; requiredRole: Role };

const GATE_1: GateSpec = { seq: 1, gateType: "technical_review", requiredRole: "engineer" };
const GATE_2: GateSpec = { seq: 2, gateType: "discipline_qa", requiredRole: "pm" };
const GATE_3: GateSpec = { seq: 3, gateType: "independent_qa", requiredRole: "pm" };
const GATE_4: GateSpec = { seq: 4, gateType: "authority_release", requiredRole: "admin" };

export function gatesForProfile(profile: Profile): GateSpec[] {
  switch (profile) {
    case "A":
      return [];
    case "B":
      return [GATE_1];
    case "C":
      return [GATE_1, GATE_2];
    case "D":
      return [GATE_1, GATE_2, { ...GATE_4, seq: 3 }];
    case "E":
      return [GATE_1, GATE_2, GATE_3, GATE_4];
  }
}

export const GATE_TYPE_LABELS: Record<GateType, string> = {
  technical_review: "Rà soát kỹ thuật",
  discipline_qa: "Rà soát chuyên ngành / QA",
  independent_qa: "QA độc lập",
  authority_release: "Thẩm quyền phát hành",
};

// ---------- §11 State machine ----------

export const WORKFLOW_STATES = [
  "draft",
  "validating",
  "awaiting_approval",
  "approved",
  "executing",
  "validating_result",
  "completed",
  "rejected",
  "cancelled",
  "blocked",
  "failed",
  "rolled_back",
  "superseded",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_STATE_LABELS: Record<WorkflowState, string> = {
  draft: "Nháp",
  validating: "Đang kiểm tự động",
  awaiting_approval: "Chờ duyệt",
  approved: "Đã duyệt",
  executing: "Đang thực hiện",
  validating_result: "Đang kiểm kết quả",
  completed: "Hoàn thành",
  rejected: "Bị từ chối",
  cancelled: "Đã huỷ",
  blocked: "Bị chặn",
  failed: "Thất bại",
  rolled_back: "Đã hoàn tác",
  superseded: "Bị thay thế",
};

export const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  draft: ["validating", "cancelled"],
  validating: ["awaiting_approval", "blocked", "cancelled"],
  awaiting_approval: ["approved", "rejected", "cancelled", "blocked"],
  approved: ["executing", "cancelled", "superseded"],
  executing: ["validating_result", "failed"],
  validating_result: ["completed", "failed"],
  completed: [],
  rejected: [],
  cancelled: [],
  blocked: ["validating", "cancelled"],
  failed: ["rolled_back", "cancelled"],
  rolled_back: [],
  superseded: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

// ---------- Kiểu dữ liệu ----------

export const workflowInputSchema = z.object({
  suggestionId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(8000).nullable().optional(),
  riskInputs: riskInputsSchema,
  hasSideEffect: z.boolean().default(true),
  rollbackStrategy: z.string().trim().max(4000).nullable().optional(),
});
export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export type Gate0Check = { name: string; ok: boolean; detail?: string };
export type Gate0Result = { ok: boolean; checks: Gate0Check[] };

export type WorkflowRow = {
  id: string;
  projectId: number;
  suggestionId: string | null;
  title: string;
  description: string | null;
  profile: Profile;
  riskClass: RiskClass;
  riskInputs: RiskInputs;
  state: WorkflowState;
  reversible: boolean;
  rollbackStrategy: string | null;
  gate0Result: Gate0Result;
  createdBy: number;
  createdAt: string;
};

export type GateRow = {
  id: string;
  seq: number;
  gateType: GateType;
  requiredRole: Role;
  decision: "approved" | "rejected" | null;
  decidedBy: number | null;
  decidedAt: string | null;
  comments: string | null;
};

export type WorkflowEventRow = {
  id: string;
  fromState: string | null;
  toState: string;
  actorId: number | null;
  gateSeq: number | null;
  reason: string | null;
  createdAt: string;
};

export class WorkflowError extends Error {}
export class Gate0FailedError extends Error {
  constructor(public result: Gate0Result) {
    super("Gate 0 không đạt — không thể tạo yêu cầu phê duyệt");
  }
}

// ---------- §8 Gate 0 ----------

// Validation tự động TRƯỚC khi có bất kỳ approval request nào. Fail bất kỳ mục nào →
// không được tạo workflow (§8: "Nếu Gate 0 fail → không được tạo approval request").
export async function runGate0(projectId: number, input: WorkflowInput): Promise<Gate0Result> {
  const checks: Gate0Check[] = [];

  checks.push({ name: "Tiêu đề hợp lệ", ok: input.title.trim().length > 0 });

  checks.push({
    name: "Đã khai khả năng hoàn tác",
    ok: typeof input.riskInputs.reversible === "boolean",
    detail: "riskInputs.reversible bắt buộc — người ký phải biết việc này có hoàn tác được không",
  });

  // §14: non-reversible phải nói rõ chiến lược (kể cả "không thể hoàn tác, chấp nhận rủi ro").
  const nonReversibleOk = input.riskInputs.reversible === true || !!input.rollbackStrategy?.trim();
  checks.push({
    name: "Khai chiến lược hoàn tác khi không thể đảo ngược",
    ok: nonReversibleOk,
    detail: nonReversibleOk ? undefined : "reversible=false thì rollbackStrategy không được rỗng",
  });

  if (input.suggestionId) {
    const sug = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_suggestions WHERE id = ? AND project_id = ?`,
      input.suggestionId,
      projectId,
    );
    checks.push({
      name: "Đề xuất nguồn tồn tại trong dự án",
      ok: !!sug,
      detail: sug ? undefined : "suggestionId không thuộc dự án đang chọn",
    });
    // Không tạo workflow từ đề xuất chưa ai đồng ý — ENG-2 quyết định trước, ENG-3 mới lập
    // kế hoạch thực hiện.
    checks.push({
      name: "Đề xuất nguồn đã được chấp nhận",
      ok: sug?.status === "accepted",
      detail: sug && sug.status !== "accepted" ? `trạng thái hiện tại: ${sug.status}` : undefined,
    });

    const openDup = await queryOne<{ id: string }>(
      `SELECT id FROM engineering_workflows
        WHERE suggestion_id = ? AND project_id = ?
          AND state NOT IN ('completed','rejected','cancelled','rolled_back','superseded')`,
      input.suggestionId,
      projectId,
    );
    checks.push({
      name: "Chưa có workflow nào đang mở cho đề xuất này",
      ok: !openDup,
      detail: openDup ? `đã có workflow ${openDup.id}` : undefined,
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}

// ---------- Hàm dữ liệu ----------

export async function createWorkflow(
  projectId: number,
  userId: number,
  input: WorkflowInput,
): Promise<{
  id: string;
  state: WorkflowState;
  profile: Profile;
  riskClass: RiskClass;
  gate0: Gate0Result;
}> {
  const gate0 = await runGate0(projectId, input);
  if (!gate0.ok) throw new Gate0FailedError(gate0);

  const riskClass = classifyRisk(input.riskInputs);
  const profile = selectProfile(riskClass, input.hasSideEffect);

  return withTransaction(async () => {
    const wf = await queryOne<{ id: string }>(
      `INSERT INTO engineering_workflows
         (project_id, suggestion_id, title, description, profile, risk_class, risk_inputs,
          state, reversible, rollback_strategy, gate0_result, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, 'draft', ?, ?, ?::jsonb, ?)
       RETURNING id`,
      projectId,
      input.suggestionId ?? null,
      input.title,
      input.description ?? null,
      profile,
      riskClass,
      JSON.stringify(input.riskInputs),
      input.riskInputs.reversible,
      input.rollbackStrategy ?? null,
      JSON.stringify(gate0),
      userId,
    );
    if (!wf) throw new WorkflowError("Tạo workflow thất bại");

    for (const g of gatesForProfile(profile)) {
      await run(
        `INSERT INTO engineering_workflow_gates (workflow_id, seq, gate_type, required_role)
         VALUES (?, ?, ?, ?)`,
        wf.id,
        g.seq,
        g.gateType,
        g.requiredRole,
      );
    }

    await run(
      `INSERT INTO engineering_workflow_events (workflow_id, from_state, to_state, actor_id, reason)
       VALUES (?, NULL, 'draft', ?, 'Tạo workflow')`,
      wf.id,
      userId,
    );

    return { id: wf.id, state: "draft" as WorkflowState, profile, riskClass, gate0 };
  });
}

const WF_SELECT = `SELECT id, project_id AS "projectId", suggestion_id AS "suggestionId", title,
            description, profile, risk_class AS "riskClass", risk_inputs AS "riskInputs",
            state, reversible, rollback_strategy AS "rollbackStrategy",
            gate0_result AS "gate0Result", created_by AS "createdBy", created_at AS "createdAt"
       FROM engineering_workflows`;

export async function listWorkflows(
  projectId: number,
  filter?: { state?: string; limit?: number },
): Promise<WorkflowRow[]> {
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
  // Điều kiện dựng động — không dùng "? IS NULL OR col = ?" (Postgres không suy được kiểu
  // tham số đứng riêng; lỗi thật đã gặp ở M64 PR325, ENG-1 và ENG-2).
  const conds = ["project_id = ?"];
  const args: unknown[] = [projectId];
  if (filter?.state) {
    conds.push("state = ?");
    args.push(filter.state);
  }
  // Đọc ngoài transaction không có GUC app.project_id → RLS không có gì để so. Bọc
  // withProjectScope, cùng pattern các hàm đọc của lib/engineering-kernel.ts.
  return withProjectScope(projectId, () =>
    query<WorkflowRow>(
      `${WF_SELECT} WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
      ...args,
      limit,
    ),
  );
}

export async function getWorkflow(
  projectId: number,
  id: string,
): Promise<{ workflow: WorkflowRow; gates: GateRow[]; events: WorkflowEventRow[] } | null> {
  // Gates/events không có cột project_id (ràng buộc qua workflow cha) nên phải đọc TRONG
  // cùng phạm vi GUC với workflow.
  return withProjectScope(projectId, async () => {
    const workflow = await queryOne<WorkflowRow>(
      `${WF_SELECT} WHERE id = ? AND project_id = ?`,
      id,
      projectId,
    );
    if (!workflow) return null;
    const [gates, events] = await Promise.all([
      query<GateRow>(
        `SELECT id, seq, gate_type AS "gateType", required_role AS "requiredRole", decision,
              decided_by AS "decidedBy", decided_at AS "decidedAt", comments
         FROM engineering_workflow_gates WHERE workflow_id = ? ORDER BY seq`,
        id,
      ),
      query<WorkflowEventRow>(
        `SELECT id, from_state AS "fromState", to_state AS "toState", actor_id AS "actorId",
              gate_seq AS "gateSeq", reason, created_at AS "createdAt"
         FROM engineering_workflow_events WHERE workflow_id = ? ORDER BY created_at`,
        id,
      ),
    ]);
    return { workflow, gates, events };
  });
}

// Ghi 1 dòng event + đổi state. Luôn gọi TRONG transaction đang mở (caller lo).
async function applyTransition(
  workflowId: string,
  from: WorkflowState,
  to: WorkflowState,
  actorId: number,
  reason?: string,
  gateSeq?: number,
): Promise<void> {
  if (!canTransition(from, to))
    throw new WorkflowError(
      `Không thể chuyển trạng thái ${WORKFLOW_STATE_LABELS[from]} → ${WORKFLOW_STATE_LABELS[to]}`,
    );
  await run(
    `UPDATE engineering_workflows SET state = ?, updated_at = NOW() WHERE id = ?`,
    to,
    workflowId,
  );
  await run(
    `INSERT INTO engineering_workflow_events (workflow_id, from_state, to_state, actor_id, gate_seq, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    workflowId,
    from,
    to,
    actorId,
    gateSeq ?? null,
    reason ?? null,
  );
}

// Khoá dòng workflow trước khi đọc-sửa-ghi (chống 2 người ký cùng lúc gây lost update).
async function lockWorkflow(projectId: number, id: string) {
  const wf = await queryOne<{
    id: string;
    state: WorkflowState;
    profile: Profile;
    riskClass: RiskClass;
    createdBy: number;
  }>(
    `SELECT id, state, profile, risk_class AS "riskClass", created_by AS "createdBy"
       FROM engineering_workflows WHERE id = ? AND project_id = ? FOR UPDATE`,
    id,
    projectId,
  );
  if (!wf) throw new WorkflowError("Workflow không tồn tại hoặc không thuộc dự án đang chọn");
  return wf;
}

export async function submitForApproval(
  projectId: number,
  id: string,
  userId: number,
): Promise<void> {
  return withTransaction(async () => {
    const wf = await lockWorkflow(projectId, id);
    await applyTransition(id, wf.state, "validating", userId, "Trình duyệt");

    const gateCount = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_workflow_gates WHERE workflow_id = ?`,
      id,
    );
    // PROFILE-A không có gate nào → không cần người duyệt, đi thẳng approved (§9: "Gate 0 →
    // publish suggestion", không có side effect).
    if ((gateCount?.n ?? 0) === 0) {
      await applyTransition(
        id,
        "validating",
        "awaiting_approval",
        userId,
        "Không có gate (PROFILE-A)",
      );
      await applyTransition(
        id,
        "awaiting_approval",
        "approved",
        userId,
        "Tự duyệt: PROFILE-A không có side effect",
      );
      return;
    }
    await applyTransition(
      id,
      "validating",
      "awaiting_approval",
      userId,
      "Gate 0 đạt, chờ người duyệt",
    );
  });
}

// §13 Separation of duties. Với high/critical áp đủ 3 luật; low/medium chỉ áp luật "người
// tạo không tự ký" (nới có chủ đích cho vận hành thực tế, ghi rõ để không tưởng là lỗ hổng).
async function assertSeparationOfDuties(
  workflowId: string,
  wf: { createdBy: number; riskClass: RiskClass },
  seq: number,
  gateType: GateType,
  userId: number,
): Promise<void> {
  if (wf.createdBy === userId)
    throw new WorkflowError("Người tạo workflow không được tự ký duyệt (separation of duties)");

  if (wf.riskClass !== "high" && wf.riskClass !== "critical") return;

  const signed = await query<{ seq: number; gateType: GateType }>(
    `SELECT seq, gate_type AS "gateType" FROM engineering_workflow_gates
      WHERE workflow_id = ? AND decided_by = ?`,
    workflowId,
    userId,
  );
  if (signed.length > 0)
    throw new WorkflowError(
      "Một người không được ký 2 gate trong cùng workflow rủi ro cao (separation of duties)",
    );
  // "independent_qa" chỉ có nghĩa nếu khác người đã ký discipline_qa — đã phủ bởi luật trên,
  // giữ nhánh này tường minh để ý định không bị mất khi ai đó sửa luật trên.
  if (gateType === "independent_qa") {
    const disciplineSigner = await queryOne<{ decidedBy: number | null }>(
      `SELECT decided_by AS "decidedBy" FROM engineering_workflow_gates
        WHERE workflow_id = ? AND gate_type = 'discipline_qa'`,
      workflowId,
    );
    if (disciplineSigner?.decidedBy === userId)
      throw new WorkflowError("QA độc lập phải là người khác với người đã ký rà soát chuyên ngành");
  }
}

export async function approveGate(
  projectId: number,
  id: string,
  seq: number,
  userId: number,
  userRole: Role,
  decision: "approved" | "rejected",
  comments?: string,
): Promise<void> {
  return withTransaction(async () => {
    const wf = await lockWorkflow(projectId, id);
    if (wf.state !== "awaiting_approval")
      throw new WorkflowError(
        `Chỉ ký được khi workflow đang chờ duyệt (hiện tại: ${WORKFLOW_STATE_LABELS[wf.state]})`,
      );

    const gate = await queryOne<{
      id: string;
      gateType: GateType;
      requiredRole: Role;
      decision: string | null;
    }>(
      `SELECT id, gate_type AS "gateType", required_role AS "requiredRole", decision
         FROM engineering_workflow_gates WHERE workflow_id = ? AND seq = ?`,
      id,
      seq,
    );
    if (!gate) throw new WorkflowError("Gate không tồn tại");
    if (gate.decision) throw new WorkflowError("Gate này đã được quyết định");

    // Admin được ký mọi gate (vai trò cao nhất); còn lại phải khớp đúng required_role.
    if (userRole !== "admin" && userRole !== gate.requiredRole)
      throw new WorkflowError(
        `Gate này yêu cầu vai trò "${gate.requiredRole}", tài khoản hiện tại là "${userRole}"`,
      );

    // Gate phải ký tuần tự — không nhảy cóc qua gate chưa quyết định.
    const pendingEarlier = await queryOne<{ seq: number }>(
      `SELECT seq FROM engineering_workflow_gates
        WHERE workflow_id = ? AND seq < ? AND decision IS NULL ORDER BY seq LIMIT 1`,
      id,
      seq,
    );
    if (pendingEarlier) throw new WorkflowError(`Phải ký gate ${pendingEarlier.seq} trước`);

    await assertSeparationOfDuties(id, wf, seq, gate.gateType, userId);

    await run(
      `UPDATE engineering_workflow_gates
          SET decision = ?, decided_by = ?, decided_at = NOW(), comments = ?
        WHERE id = ?`,
      decision,
      userId,
      comments?.trim() || null,
      gate.id,
    );

    if (decision === "rejected") {
      // Từ chối ở bất kỳ gate nào → workflow dừng ngay, các gate sau không cần ký.
      await applyTransition(
        id,
        wf.state,
        "rejected",
        userId,
        comments?.trim() || "Từ chối tại gate",
        seq,
      );
      return;
    }

    const remaining = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_workflow_gates
        WHERE workflow_id = ? AND decision IS NULL`,
      id,
    );
    if ((remaining?.n ?? 0) === 0)
      await applyTransition(id, wf.state, "approved", userId, "Đã duyệt toàn bộ gate", seq);
  });
}

export async function transitionWorkflow(
  projectId: number,
  id: string,
  userId: number,
  to: WorkflowState,
  reason?: string,
): Promise<void> {
  return withTransaction(async () => {
    const wf = await lockWorkflow(projectId, id);
    await applyTransition(id, wf.state, to, userId, reason);
  });
}
