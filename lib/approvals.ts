// M46 — Approval Engine: engine phê duyệt nhiều cấp cấu hình được (đặc tả
// docs/nang-cap/M46-approval-engine.md). Gom logic duyệt hard-code (VO/IPC/proposal/
// nghiệm thu) về một nơi dữ liệu-hoá. Không có flow active cho một loại thực thể →
// caller giữ nguyên hành vi cũ (duyệt 1 bước qua CAN.approve). Engine chỉ trả lời
// "ai duyệt, đến bước nào" — gate nghiệp vụ (task 100%, hold-point, ...) vẫn ở route.

import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { isUniqueViolation } from "@/lib/seqcode";
import { VIEW_ONLY_ROLES, type Role } from "@/lib/roles";

// Vai trò chỉ-xem KHÔNG bao giờ được làm bước duyệt — trừ `cdt` (CĐT được phép là bước
// duyệt cuối, theo M46 PR4). bch/viewer luôn 403 dù có bị cấu hình nhầm làm step role.
const NON_APPROVER_ROLES: Role[] = VIEW_ONLY_ROLES.filter((r) => r !== "cdt");

// Các loại thực thể engine phục vụ. Giữ danh sách đóng để validate cấu hình flow (PR4).
export const APPROVAL_ENTITY_TYPES = [
  "variation",
  "payment_cert",
  "proposal",
  "task_acceptance",
] as const;
export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export type ApprovalStep = {
  seq: number;
  role: Role;
  minAmount: number | null;
  slaDays: number | null;
};

export type ApprovalFlow = {
  id: number;
  projectId: number | null;
  entityType: string;
  name: string;
  steps: ApprovalStep[];
};

export type ApprovalRequest = {
  id: number;
  flowId: number;
  entityType: string;
  entityId: number;
  projectId: number;
  amount: number | null;
  currentSeq: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdBy: number;
};

export type AdvanceResult =
  | { status: "pending"; currentSeq: number; nextRole: Role }
  | { status: "approved" }
  | { status: "rejected" };

type ActorUser = { id: number; role: Role };

// Bước hiệu lực = min_amount NULL (luôn áp) hoặc <= amount (amount có mặt). Chỉ so sánh
// ngưỡng, không cộng/nhân tiền (an toàn với parser float của NUMERIC). Trả bước hiệu lực
// đầu tiên có seq > currentSeq, hoặc null (hết bước → coi như đã duyệt xong).
// Gọi với currentSeq=0 để lấy bước đầu tiên khi mở request.
export function decideNext(
  steps: ApprovalStep[],
  amount: number | null,
  currentSeq: number,
): ApprovalStep | null {
  return (
    steps
      .filter((s) => s.minAmount == null || (amount != null && amount >= s.minAmount))
      .sort((a, b) => a.seq - b.seq)
      .find((s) => s.seq > currentSeq) ?? null
  );
}

// Flow active cho (loại, dự án): ưu tiên flow riêng dự án, sau đó flow chung (project_id NULL).
export async function getActiveFlow(
  entityType: string,
  projectId: number,
): Promise<ApprovalFlow | undefined> {
  const flow = await queryOne<{
    id: number;
    projectId: number | null;
    entityType: string;
    name: string;
  }>(
    `SELECT id, project_id AS "projectId", entity_type AS "entityType", name
       FROM approval_flows
      WHERE entity_type = ? AND active AND (project_id = ? OR project_id IS NULL)
      ORDER BY project_id NULLS LAST
      LIMIT 1`,
    entityType,
    projectId,
  );
  if (!flow) return undefined;
  const steps = await query<ApprovalStep>(
    `SELECT seq, role, min_amount AS "minAmount", sla_days AS "slaDays"
       FROM approval_steps WHERE flow_id = ? ORDER BY seq`,
    flow.id,
  );
  return { ...flow, steps };
}

// Mở yêu cầu duyệt khi tạo thực thể. Không có flow → null (caller giữ hành vi cũ).
// Đã có request đang chờ cho thực thể này → trả lại request đó (idempotent). Không còn
// bước hiệu lực nào (vd flow rỗng hoặc mọi bước bị ngưỡng loại) → tạo request đã duyệt sẵn.
export async function openApproval(opts: {
  entityType: string;
  entityId: number;
  projectId: number;
  amount?: number | null;
  user: ActorUser;
}): Promise<ApprovalRequest | null> {
  const amount = opts.amount ?? null;
  return withTransaction(async () => {
    const existing = await queryOne<ApprovalRequest>(
      `SELECT id, flow_id AS "flowId", entity_type AS "entityType", entity_id AS "entityId",
              project_id AS "projectId", amount, current_seq AS "currentSeq", status,
              created_by AS "createdBy"
         FROM approval_requests
        WHERE entity_type = ? AND entity_id = ? AND status = 'pending' FOR UPDATE`,
      opts.entityType,
      opts.entityId,
    );
    if (existing) return existing;

    const flow = await getActiveFlow(opts.entityType, opts.projectId);
    if (!flow) return null;

    const first = decideNext(flow.steps, amount, 0);
    const status = first ? "pending" : "approved";
    const currentSeq = first?.seq ?? 1;
    const id = await insertId(
      `INSERT INTO approval_requests
         (flow_id, entity_type, entity_id, project_id, amount, current_seq, status, created_by, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${status === "approved" ? "now()" : "NULL"})`,
      flow.id,
      opts.entityType,
      opts.entityId,
      opts.projectId,
      amount,
      currentSeq,
      status,
      opts.user.id,
    );
    return {
      id,
      flowId: flow.id,
      entityType: opts.entityType,
      entityId: opts.entityId,
      projectId: opts.projectId,
      amount,
      currentSeq,
      status: status as ApprovalRequest["status"],
      createdBy: opts.user.id,
    };
  });
}

// Ra quyết định 1 bước. Khoá request FOR UPDATE để tuần tự hoá. Quyền: đúng vai trò bước
// hiện tại HOẶC admin; bch/viewer luôn 403 (cdt được phép nếu là step role). SoD: người
// tạo không tự duyệt. reject →
// chốt; approve → sang bước hiệu lực kế tiếp, hết bước → approved. Ghi approval_actions
// (UNIQUE(request_id, step_seq) → duyệt trùng bước trả 409).
export async function advanceApproval(opts: {
  entityType: string;
  entityId: number;
  user: ActorUser;
  decision: "approve" | "reject";
  note?: string | null;
}): Promise<AdvanceResult> {
  const { user, decision } = opts;
  if (decision !== "approve" && decision !== "reject")
    throw Object.assign(new Error("Quyết định phải là approve/reject"), { status: 422 });

  return withTransaction(async () => {
    const req = await queryOne<{
      id: number;
      flowId: number;
      amount: number | null;
      currentSeq: number;
      createdBy: number;
    }>(
      `SELECT id, flow_id AS "flowId", amount, current_seq AS "currentSeq", created_by AS "createdBy"
         FROM approval_requests
        WHERE entity_type = ? AND entity_id = ? AND status = 'pending' FOR UPDATE`,
      opts.entityType,
      opts.entityId,
    );
    if (!req) throw Object.assign(new Error("Không có yêu cầu duyệt đang chờ"), { status: 404 });

    const steps = await query<ApprovalStep>(
      `SELECT seq, role, min_amount AS "minAmount", sla_days AS "slaDays"
         FROM approval_steps WHERE flow_id = ? ORDER BY seq`,
      req.flowId,
    );
    const step = steps.find((s) => s.seq === req.currentSeq);
    if (!step)
      throw Object.assign(new Error("Bước duyệt hiện tại không còn tồn tại"), { status: 409 });

    if (NON_APPROVER_ROLES.includes(user.role))
      throw Object.assign(new Error("Vai trò chỉ-xem không được duyệt"), { status: 403 });
    if (user.role !== step.role && user.role !== "admin")
      throw Object.assign(new Error(`Chỉ vai trò ${step.role} được duyệt bước này`), {
        status: 403,
      });
    if (user.id === req.createdBy)
      throw Object.assign(new Error("Người tạo không được tự duyệt"), { status: 403 });

    try {
      await run(
        `INSERT INTO approval_actions (request_id, step_seq, actor_id, decision, note)
         VALUES (?, ?, ?, ?, ?)`,
        req.id,
        req.currentSeq,
        user.id,
        decision,
        opts.note ?? null,
      );
    } catch (err) {
      if (isUniqueViolation(err))
        throw Object.assign(new Error("Bước này đã được quyết định"), { status: 409 });
      throw err;
    }

    if (decision === "reject") {
      await run(
        `UPDATE approval_requests SET status = 'rejected', decided_at = now() WHERE id = ?`,
        req.id,
      );
      return { status: "rejected" };
    }

    const next = decideNext(steps, req.amount, req.currentSeq);
    if (next) {
      await run(`UPDATE approval_requests SET current_seq = ? WHERE id = ?`, next.seq, req.id);
      return { status: "pending", currentSeq: next.seq, nextRole: next.role };
    }
    await run(
      `UPDATE approval_requests SET status = 'approved', decided_at = now() WHERE id = ?`,
      req.id,
    );
    return { status: "approved" };
  });
}

export type PendingItem = {
  id: number;
  entityType: string;
  entityId: number;
  amount: number | null;
  currentSeq: number;
  stepRole: Role;
  slaDays: number | null;
  createdAt: string;
  createdBy: number;
  flowName: string;
};

// Hộp thư "chờ tôi duyệt": request pending trong dự án mà bước hiện tại thuộc vai trò user
// (admin thấy mọi bước), trừ request do chính user tạo (SoD — không thể tự duyệt).
export async function pendingForUser(user: ActorUser, projectId: number): Promise<PendingItem[]> {
  if (NON_APPROVER_ROLES.includes(user.role)) return [];
  return query<PendingItem>(
    `SELECT r.id, r.entity_type AS "entityType", r.entity_id AS "entityId", r.amount,
            r.current_seq AS "currentSeq", s.role AS "stepRole", s.sla_days AS "slaDays",
            r.created_at AS "createdAt", r.created_by AS "createdBy", f.name AS "flowName"
       FROM approval_requests r
       JOIN approval_steps s ON s.flow_id = r.flow_id AND s.seq = r.current_seq
       JOIN approval_flows f ON f.id = r.flow_id
      WHERE r.status = 'pending' AND r.project_id = ?
        AND (? = 'admin' OR s.role = ?)
        AND r.created_by <> ?
      ORDER BY r.created_at`,
    projectId,
    user.role,
    user.role,
    user.id,
  );
}
