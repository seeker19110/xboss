// M46 — Approval Engine: engine phê duyệt nhiều cấp cấu hình được (đặc tả
// docs/nang-cap/M46-approval-engine.md). Gom logic duyệt hard-code (VO/IPC/proposal/
// nghiệm thu) về một nơi dữ liệu-hoá. Không có flow active cho một loại thực thể →
// caller giữ nguyên hành vi cũ (duyệt 1 bước qua CAN.approve). Engine chỉ trả lời
// "ai duyệt, đến bước nào" — gate nghiệp vụ (task 100%, hold-point, ...) vẫn ở route.

import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { isUniqueViolation } from "@/lib/seqcode";
import { ROLES, VIEW_ONLY_ROLES, type Role } from "@/lib/roles";

// Vai trò chỉ-xem KHÔNG bao giờ được làm bước duyệt — trừ `cdt` (CĐT được phép là bước
// duyệt cuối, theo M46 PR4). bch/viewer luôn 403 dù có bị cấu hình nhầm làm step role.
export const NON_APPROVER_ROLES: Role[] = VIEW_ONLY_ROLES.filter((r) => r !== "cdt");

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

export type PendingItemDisplay = PendingItem & { label: string; linkUrl: string };

// Gắn nhãn hiển thị (mã + tên) + link trang chi tiết cho hộp thư "Chờ tôi duyệt" (M46 PR3
// /approvals). Tra cứu theo lô (WHERE id = ANY(?)) từng loại thực thể để tránh N+1 — 4 loại
// đóng (APPROVAL_ENTITY_TYPES), thêm loại mới phải bổ sung nhánh tương ứng ở đây.
export async function pendingForUserDisplay(
  user: ActorUser,
  projectId: number,
): Promise<PendingItemDisplay[]> {
  const items = await pendingForUser(user, projectId);
  if (items.length === 0) return [];

  const idsByType = new Map<string, number[]>();
  for (const it of items)
    idsByType.set(it.entityType, [...(idsByType.get(it.entityType) ?? []), it.entityId]);

  const label = new Map<string, string>();
  const linkUrl = new Map<string, string>();
  const key = (t: string, id: number) => `${t}:${id}`;

  const voIds = idsByType.get("variation");
  if (voIds) {
    const rows = await query<{ id: number; code: string; title: string }>(
      `SELECT id, code, title FROM variation_orders WHERE id = ANY(?)`,
      voIds,
    );
    for (const r of rows) {
      label.set(key("variation", r.id), `${r.code} — ${r.title}`);
      linkUrl.set(key("variation", r.id), "/variations");
    }
  }
  const certIds = idsByType.get("payment_cert");
  if (certIds) {
    const rows = await query<{ id: number; code: string; contractTitle: string }>(
      `SELECT c.id, c.code, ct.title AS "contractTitle"
         FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
        WHERE c.id = ANY(?)`,
      certIds,
    );
    for (const r of rows) {
      label.set(key("payment_cert", r.id), `${r.code} — ${r.contractTitle}`);
      linkUrl.set(key("payment_cert", r.id), "/payments");
    }
  }
  const proposalIds = idsByType.get("proposal");
  if (proposalIds) {
    const rows = await query<{ id: number; code: string; title: string }>(
      `SELECT id, code, title FROM proposals WHERE id = ANY(?)`,
      proposalIds,
    );
    for (const r of rows) {
      label.set(key("proposal", r.id), `${r.code} — ${r.title}`);
      linkUrl.set(key("proposal", r.id), "/proposals");
    }
  }
  const taskIds = idsByType.get("task_acceptance");
  if (taskIds) {
    const rows = await query<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM tasks WHERE id = ANY(?)`,
      taskIds,
    );
    for (const r of rows) {
      label.set(key("task_acceptance", r.id), `${r.code} — ${r.name}`);
      linkUrl.set(key("task_acceptance", r.id), "/approvals");
    }
  }

  return items.map((it) => ({
    ...it,
    label: label.get(key(it.entityType, it.entityId)) ?? `#${it.entityId}`,
    linkUrl: linkUrl.get(key(it.entityType, it.entityId)) ?? "#",
  }));
}

// ── M46 PR2 (nợ kỹ thuật) — tra trạng thái duyệt của 1 thực thể + badge/lịch sử UI +
// notification quá SLA. Xem docs/nang-cap/M46-approval-engine.md, PROGRESS.md dòng ~101.

export type ApprovalActionRow = {
  seq: number;
  actorId: number;
  actorName: string | null;
  decision: "approve" | "reject";
  note: string | null;
  at: string; // ISO timestamp
};

export type EntityApprovalStatus = {
  requestId: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  currentSeq: number;
  totalSteps: number;
  currentRole: Role | null; // null khi status != 'pending'
  actions: ApprovalActionRow[];
};

// Trả trạng thái duyệt GẦN NHẤT của 1 thực thể (theo created_at DESC, LIMIT 1) — null nếu
// chưa từng mở approval request (không có flow cấu hình, hoặc entity mới). Dùng cho UI
// hiển thị badge "chờ duyệt bước N/M" + lịch sử hành động ở trang chi tiết VO/IPC/...
export async function getEntityApprovalStatus(
  entityType: string,
  entityId: number,
): Promise<EntityApprovalStatus | null> {
  const req = await queryOne<{
    id: number;
    flowId: number;
    currentSeq: number;
    status: EntityApprovalStatus["status"];
  }>(
    `SELECT id, flow_id AS "flowId", current_seq AS "currentSeq", status
       FROM approval_requests
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC LIMIT 1`,
    entityType,
    entityId,
  );
  if (!req) return null;

  const totalRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM approval_steps WHERE flow_id = ?`,
    req.flowId,
  );
  const totalSteps = totalRow?.count ?? 0;

  // currentRole chỉ có ý nghĩa khi còn đang chờ — tra bước có seq = currentSeq (cùng cách
  // advanceApproval tra bước hiện tại).
  let currentRole: Role | null = null;
  if (req.status === "pending") {
    const step = await queryOne<{ role: Role }>(
      `SELECT role FROM approval_steps WHERE flow_id = ? AND seq = ?`,
      req.flowId,
      req.currentSeq,
    );
    currentRole = step?.role ?? null;
  }

  const actions = await query<ApprovalActionRow>(
    `SELECT a.step_seq AS "seq", a.actor_id AS "actorId", u.name AS "actorName",
            a.decision AS "decision", a.note, a.at
       FROM approval_actions a
       LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.request_id = ?
      ORDER BY a.step_seq`,
    req.id,
  );

  return {
    requestId: req.id,
    status: req.status,
    currentSeq: req.currentSeq,
    totalSteps,
    currentRole,
    actions,
  };
}

export type PendingApprovalOverdue = {
  requestId: number;
  entityType: string;
  entityId: number;
  currentRole: Role;
  slaDays: number;
  createdAt: string; // mốc bắt đầu tính SLA bước hiện tại — không phải luôn là created_at
  // của request (xem enteredStepAt bên dưới)
};

// Mốc "vào bước hiện tại": bước 1 (chưa có action nào trước đó) = created_at của request;
// bước ≥2 = thời điểm quyết định (approval_actions.at) của bước liền trước — đã có sẵn
// trong schema từ 0053 (không cần migration mới), chỉ trước đây chưa tận dụng nên mọi
// bước sau bước 1 bị tính SLA sai (luôn dùng created_at gốc, làm bước sau "quá hạn" sớm
// hơn thực tế hoặc — khi flow đứng lâu ở bước 1 rồi mới chuyển — "chưa quá hạn" trễ hơn
// thực tế cho bước hiện tại).
// Request đang 'pending', bước hiện tại có sla_days khác NULL, và đã quá mốc vào bước +
// sla_days ngày → coi là quá hạn. Gộp chung "đang chờ"/"quá hạn" thành 1 loại thông báo
// (approval_pending) — không tách 2 loại như đặc tả cũ nêu.
export async function overdueApprovals(projectId?: number): Promise<PendingApprovalOverdue[]> {
  const projectFilter = projectId != null ? " AND r.project_id = ?" : "";
  const params = projectId != null ? [projectId] : [];
  return query<PendingApprovalOverdue>(
    `SELECT r.id AS "requestId", r.entity_type AS "entityType", r.entity_id AS "entityId",
            s.role AS "currentRole", s.sla_days AS "slaDays", entered."enteredAt" AS "createdAt"
       FROM approval_requests r
       JOIN approval_steps s ON s.flow_id = r.flow_id AND s.seq = r.current_seq
       JOIN LATERAL (
         SELECT COALESCE(MAX(a.at), r.created_at) AS "enteredAt"
           FROM approval_actions a
          WHERE a.request_id = r.id AND a.step_seq < r.current_seq
       ) entered ON TRUE
      WHERE r.status = 'pending' AND s.sla_days IS NOT NULL
        AND entered."enteredAt" < now() - (s.sla_days || ' days')::interval${projectFilter}
      ORDER BY entered."enteredAt"`,
    ...params,
  );
}

// ── M46 PR4 — CRUD cấu hình flow (Admin). CAN.manageApprovalFlows/viewApprovalFlows
// (lib/auth.ts) gác quyền ở route; hàm ở đây là logic thuần + DB, không tự chạy
// getCurrentUser(). Không seed flow nào — trang tạo được thì mới có, giữ đúng
// nguyên tắc "không có flow = hành xử như cũ" của cả module.

export type FlowStepInput = {
  seq: number;
  role: string;
  minAmount: number | null;
  slaDays: number | null;
};

export type FlowInput = {
  projectId: number | null; // NULL = áp mọi dự án
  entityType: string;
  name: string;
  steps: FlowStepInput[];
};

export type ApprovalFlowAdmin = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  entityType: string;
  name: string;
  active: boolean;
  steps: ApprovalStep[];
  pendingCount: number;
  totalRequestCount: number;
};

// Validate mảng bước thuần (không chạm DB) — dùng chung cho tạo mới lẫn sửa steps riêng.
// seq phải liên tục từ 1 (không trùng/lệch); role phải hợp lệ và KHÔNG thuộc
// NON_APPROVER_ROLES (bch/viewer — cdt được phép); min_amount ≥ 0; sla_days nguyên ≥ 1.
export function validateFlowSteps(steps: FlowStepInput[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return "Cần ít nhất 1 bước duyệt";
  const seqs = steps.map((s) => s.seq).sort((a, b) => a - b);
  for (let i = 0; i < seqs.length; i++)
    if (seqs[i] !== i + 1) return "Số thứ tự bước (seq) phải liên tục từ 1, không trùng/lệch";
  for (const s of steps) {
    if (!ROLES.includes(s.role as Role) || NON_APPROVER_ROLES.includes(s.role as Role))
      return `Vai trò bước không hợp lệ: ${s.role}`;
    if (s.minAmount != null && (!Number.isFinite(s.minAmount) || s.minAmount < 0))
      return "Ngưỡng giá trị (min_amount) phải ≥ 0";
    if (s.slaDays != null && (!Number.isInteger(s.slaDays) || s.slaDays < 1))
      return "SLA (ngày) phải là số nguyên ≥ 1";
  }
  return null;
}

export function validateFlowInput(input: {
  entityType: string;
  name: string;
  steps: FlowStepInput[];
}): string | null {
  if (!APPROVAL_ENTITY_TYPES.includes(input.entityType as ApprovalEntityType))
    return "Loại thực thể không hợp lệ";
  if (!input.name.trim()) return "Thiếu tên flow";
  return validateFlowSteps(input.steps);
}

// Danh sách mọi flow (xuyên dự án — trang admin cần thấy toàn cảnh, xem whitelist
// "admin/approval-flows" trong tests/project-scope-invariant.test.ts) kèm bước + số
// request (tổng/đang chờ) để UI cảnh báo trước khi sửa/xoá.
export async function listApprovalFlows(): Promise<ApprovalFlowAdmin[]> {
  const flows = await query<{
    id: number;
    projectId: number | null;
    projectName: string | null;
    entityType: string;
    name: string;
    active: boolean;
  }>(
    `SELECT f.id, f.project_id AS "projectId", p.name AS "projectName",
            f.entity_type AS "entityType", f.name, f.active
       FROM approval_flows f
       LEFT JOIN projects p ON p.id = f.project_id
      ORDER BY f.entity_type, f.project_id NULLS FIRST, f.id`,
  );
  if (flows.length === 0) return [];

  const flowIds = flows.map((f) => f.id);
  const steps = await query<{ flowId: number } & ApprovalStep>(
    `SELECT flow_id AS "flowId", seq, role, min_amount AS "minAmount", sla_days AS "slaDays"
       FROM approval_steps WHERE flow_id = ANY(?) ORDER BY flow_id, seq`,
    flowIds,
  );
  const counts = await query<{ flowId: number; status: string; count: number }>(
    `SELECT flow_id AS "flowId", status, COUNT(*)::int AS count
       FROM approval_requests WHERE flow_id = ANY(?) GROUP BY flow_id, status`,
    flowIds,
  );

  const stepsByFlow = new Map<number, ApprovalStep[]>();
  for (const s of steps) stepsByFlow.set(s.flowId, [...(stepsByFlow.get(s.flowId) ?? []), s]);
  const pendingByFlow = new Map<number, number>();
  const totalByFlow = new Map<number, number>();
  for (const c of counts) {
    totalByFlow.set(c.flowId, (totalByFlow.get(c.flowId) ?? 0) + c.count);
    if (c.status === "pending")
      pendingByFlow.set(c.flowId, (pendingByFlow.get(c.flowId) ?? 0) + c.count);
  }

  return flows.map((f) => ({
    ...f,
    steps: stepsByFlow.get(f.id) ?? [],
    pendingCount: pendingByFlow.get(f.id) ?? 0,
    totalRequestCount: totalByFlow.get(f.id) ?? 0,
  }));
}

// Tạo flow mới + bước. Unique index ux_flow_active (entity_type, COALESCE(project_id,0))
// chặn 2 flow active cùng lúc cho cùng (loại, phạm vi dự án) → dịch 23505 thành lỗi
// thân thiện thay vì để lộ lỗi Postgres thô.
export async function createApprovalFlow(input: FlowInput): Promise<{ id: number } | string> {
  const err = validateFlowInput(input);
  if (err) return err;
  try {
    return await withTransaction(async () => {
      const flowId = await insertId(
        `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, ?, ?)`,
        input.projectId,
        input.entityType,
        input.name.trim(),
      );
      for (const s of input.steps) {
        await insertId(
          `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days) VALUES (?, ?, ?, ?, ?)`,
          flowId,
          s.seq,
          s.role,
          s.minAmount,
          s.slaDays,
        );
      }
      return { id: flowId };
    });
  } catch (e) {
    if (isUniqueViolation(e))
      return "Đã có flow đang bật (active) cho loại thực thể này (cùng phạm vi dự án) — tắt flow cũ trước khi tạo mới";
    throw e;
  }
}

// Sửa flow: tên/trạng thái active/toàn bộ mảng bước (thay hết, không diff từng dòng —
// đơn giản hơn và đủ dùng vì UI luôn gửi lại nguyên mảng). Chặn sửa khi còn request
// 'pending' qua flow này (đổi bước giữa chừng sẽ làm currentSeq của request đang chờ
// trỏ vào bước không còn tồn tại) — khoá FOR UPDATE + đếm trong cùng transaction.
export async function updateApprovalFlow(
  id: number,
  patch: { name?: string; active?: boolean; steps?: FlowStepInput[] },
): Promise<{ ok: true } | string> {
  if (patch.steps) {
    const err = validateFlowSteps(patch.steps);
    if (err) return err;
  }
  try {
    return await withTransaction(async () => {
      const flow = await queryOne<{ id: number }>(
        `SELECT id FROM approval_flows WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!flow) return "Không tìm thấy flow";

      const pending = await queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM approval_requests WHERE flow_id = ? AND status = 'pending'`,
        id,
      );
      const pendingCount = pending?.count ?? 0;
      if (pendingCount > 0)
        return `Còn ${pendingCount} yêu cầu đang chờ duyệt qua flow này — không thể sửa`;

      if (patch.name != null || patch.active != null) {
        const sets: string[] = [];
        const vals: unknown[] = [];
        if (patch.name != null) {
          sets.push("name = ?");
          vals.push(patch.name.trim());
        }
        if (patch.active != null) {
          sets.push("active = ?");
          vals.push(patch.active);
        }
        vals.push(id);
        await run(`UPDATE approval_flows SET ${sets.join(", ")} WHERE id = ?`, ...vals);
      }

      if (patch.steps) {
        await run(`DELETE FROM approval_steps WHERE flow_id = ?`, id);
        for (const s of patch.steps) {
          await insertId(
            `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days) VALUES (?, ?, ?, ?, ?)`,
            id,
            s.seq,
            s.role,
            s.minAmount,
            s.slaDays,
          );
        }
      }
      return { ok: true };
    });
  } catch (e) {
    if (isUniqueViolation(e))
      return "Bật (active) flow này sẽ trùng với flow khác đang bật cùng loại + phạm vi dự án";
    throw e;
  }
}

// Xoá flow. approval_requests.flow_id có FK không ON DELETE (giữ lịch sử duyệt) —
// đã có bất kỳ request nào (kể cả đã xong) tham chiếu tới thì KHÔNG xoá được, dù
// pending hay không — hướng dẫn tắt (active=false) thay vì xoá để giữ nguyên lịch sử.
export async function deleteApprovalFlow(id: number): Promise<{ ok: true } | string> {
  const flow = await queryOne<{ id: number }>(`SELECT id FROM approval_flows WHERE id = ?`, id);
  if (!flow) return "Không tìm thấy flow";

  const counts = await queryOne<{ total: number; pending: number }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM approval_requests WHERE flow_id = ?`,
    id,
  );
  const total = counts?.total ?? 0;
  if (total > 0)
    return `Flow này đã có ${total} yêu cầu duyệt (${counts?.pending ?? 0} đang chờ) — không thể xoá, hãy tắt (active=false) thay vì xoá`;

  await run(`DELETE FROM approval_flows WHERE id = ?`, id);
  return { ok: true };
}
