// M29 — Bàn giao & Kết thúc: chạy thử & nghiệm thu hệ thống (T&C/commissioning), hạng
// mục bàn giao CĐT, punch list (tồn tại khi bàn giao), giải thể công trường (demob),
// bài học kinh nghiệm. Xem docs/nang-cap/M29-ban-giao-ket-thuc.md.
import { query, queryOne } from "@/lib/db";
import { todayISO } from "@/lib/date";

// ===== Commissioning (T&C) =====

export const COMMISSIONING_RESULTS = ["draft", "testing", "passed", "failed"] as const;
export type CommissioningResult = (typeof COMMISSIONING_RESULTS)[number];
export const COMMISSIONING_RESULT_LABEL: Record<CommissioningResult, string> = {
  draft: "Nháp",
  testing: "Đang chạy thử",
  passed: "Đạt",
  failed: "Không đạt",
};

// Item checklist T&C — bám pattern ChecklistItem của lib/qaqc.ts (validateChecklistItems).
export type CommissioningChecklistItem = {
  label: string;
  type: "pass_fail" | "measure";
  unit?: string;
  designValue?: number | string;
  result?: boolean | number | string;
};

// Validate thuần (không chạm DB) — JSONB checklist các bước T&C, đúng khuôn
// validateChecklistItems (M03) nhưng cho phép thêm field `result` ghi lại kết quả từng bước.
export function validateCommissioningItems(items: unknown): items is CommissioningChecklistItem[] {
  if (!Array.isArray(items)) return false;
  return items.every(
    (it) =>
      it &&
      typeof it === "object" &&
      typeof (it as CommissioningChecklistItem).label === "string" &&
      (it as CommissioningChecklistItem).label.trim().length > 0 &&
      ((it as CommissioningChecklistItem).type === "pass_fail" ||
        (it as CommissioningChecklistItem).type === "measure"),
  );
}

export type CommissioningRow = {
  id: number;
  projectId: number | null;
  code: string | null;
  systemName: string;
  tradeId: number | null;
  tradeCode: string | null;
  tradeName: string | null;
  checklist: unknown;
  result: CommissioningResult;
  testedAt: string | null;
  note: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// projectId undefined = không lọc dự án (dùng nội bộ/test cũ, đúng pattern M22).
export async function listCommissioning(
  projectId?: number,
  filters?: { result?: CommissioningResult },
): Promise<CommissioningRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  if (filters?.result) {
    conds.push("c.result = ?");
    args.push(filters.result);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<CommissioningRow>(
    `SELECT c.id, c.project_id AS "projectId", c.code, c.system_name AS "systemName",
            c.system_id AS "tradeId", d.code AS "tradeCode", d.name AS "tradeName",
            c.checklist, c.result, c.tested_at AS "testedAt", c.note,
            c.created_by AS "createdBy", u.name AS "createdByName", c.created_at AS "createdAt"
       FROM commissioning c
       LEFT JOIN systems d ON d.id = c.system_id
       LEFT JOIN users u ON u.id = c.created_by
      ${where}
      ORDER BY c.id DESC`,
    ...args,
  );
}

// ===== Handover items (hạng mục bàn giao CĐT) =====

export const HANDOVER_ITEM_STATUSES = ["pending", "handed_over", "accepted"] as const;
export type HandoverItemStatus = (typeof HANDOVER_ITEM_STATUSES)[number];
export const HANDOVER_ITEM_STATUS_LABEL: Record<HandoverItemStatus, string> = {
  pending: "Chưa bàn giao",
  handed_over: "Đã bàn giao",
  accepted: "Đã nghiệm thu",
};

export type HandoverItemRow = {
  id: number;
  projectId: number | null;
  title: string;
  tradeId: number | null;
  tradeCode: string | null;
  tradeName: string | null;
  workPackageId: number | null;
  workPackageCode: string | null;
  workPackageName: string | null;
  status: HandoverItemStatus;
  handoverDate: string | null;
  minutesFile: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listHandoverItems(
  projectId?: number,
  filters?: { status?: HandoverItemStatus },
): Promise<HandoverItemRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("h.project_id = ?");
    args.push(projectId);
  }
  if (filters?.status) {
    conds.push("h.status = ?");
    args.push(filters.status);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<HandoverItemRow>(
    `SELECT h.id, h.project_id AS "projectId", h.title,
            h.system_id AS "tradeId", d.code AS "tradeCode", d.name AS "tradeName",
            h.work_package_id AS "workPackageId", wp.code AS "workPackageCode", wp.name AS "workPackageName",
            h.status, h.handover_date AS "handoverDate", h.minutes_file AS "minutesFile",
            h.created_by AS "createdBy", u.name AS "createdByName", h.created_at AS "createdAt"
       FROM handover_items h
       LEFT JOIN systems d ON d.id = h.system_id
       LEFT JOIN work_packages wp ON wp.id = h.work_package_id
       LEFT JOIN users u ON u.id = h.created_by
      ${where}
      ORDER BY (h.status = 'accepted') ASC, h.id DESC`,
    ...args,
  );
}

// ===== Punch list (tồn tại khi bàn giao) =====

export const PUNCH_SEVERITIES = ["low", "medium", "high"] as const;
export type PunchSeverity = (typeof PUNCH_SEVERITIES)[number];
export const PUNCH_SEVERITY_LABEL: Record<PunchSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

export const PUNCH_STATUSES = ["open", "fixing", "closed"] as const;
export type PunchStatus = (typeof PUNCH_STATUSES)[number];
export const PUNCH_STATUS_LABEL: Record<PunchStatus, string> = {
  open: "Mở",
  fixing: "Đang xử lý",
  closed: "Đã đóng",
};

export type PunchRow = {
  id: number;
  projectId: number | null;
  handoverItemId: number | null;
  handoverItemTitle: string | null;
  description: string;
  severity: PunchSeverity | null;
  status: PunchStatus;
  dueDate: string | null;
  assignee: number | null;
  assigneeName: string | null;
  createdBy: number | null;
  createdAt: string;
};

// projectId undefined = không lọc dự án (nội bộ/test cũ). filters cho phép lọc theo
// status/severity/assignee — dùng cho tab Punch list trong /handover.
export async function listPunch(
  projectId?: number,
  filters?: { status?: PunchStatus; severity?: PunchSeverity; assignee?: number },
): Promise<PunchRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("p.project_id = ?");
    args.push(projectId);
  }
  if (filters?.status) {
    conds.push("p.status = ?");
    args.push(filters.status);
  }
  if (filters?.severity) {
    conds.push("p.severity = ?");
    args.push(filters.severity);
  }
  if (filters?.assignee != null) {
    conds.push("p.assignee = ?");
    args.push(filters.assignee);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<PunchRow>(
    `SELECT p.id, p.project_id AS "projectId", p.handover_item_id AS "handoverItemId",
            hi.title AS "handoverItemTitle", p.description, p.severity, p.status,
            p.due_date AS "dueDate", p.assignee, u.name AS "assigneeName",
            p.created_by AS "createdBy", p.created_at AS "createdAt"
       FROM punch_list p
       LEFT JOIN handover_items hi ON hi.id = p.handover_item_id
       LEFT JOIN users u ON u.id = p.assignee
      ${where}
      ORDER BY (p.status = 'closed') ASC,
               (p.status <> 'closed' AND p.due_date IS NOT NULL AND p.due_date < CURRENT_DATE) DESC,
               p.due_date ASC NULLS LAST, p.id DESC`,
    ...args,
  );
}

export type OverduePunch = {
  id: number;
  description: string;
  dueDate: string;
  assignee: number | null;
  projectId: number | null;
};

// Punch chưa đóng mà quá hạn xử lý — dùng để dựng notification `punch_overdue`
// (mirror overdueMeetingActions/openHseActions — "quá hạn xử lý" chứ không phải "sắp
// hết hạn giấy tờ" như expiringLegalDocs/expiringContracts).
export async function overduePunch(
  assigneeId?: number,
  projectId?: number,
): Promise<OverduePunch[]> {
  const conds = ["status <> 'closed'", "due_date IS NOT NULL", "due_date < ?"];
  const args: unknown[] = [todayISO()];
  if (assigneeId != null) {
    conds.push("assignee = ?");
    args.push(assigneeId);
  }
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  return query<OverduePunch>(
    `SELECT id, description, due_date AS "dueDate", assignee, project_id AS "projectId"
       FROM punch_list
      WHERE ${conds.join(" AND ")}
      ORDER BY due_date`,
    ...args,
  );
}

// ===== Demob (giải thể công trường) =====

export const DEMOB_STATUSES = ["pending", "done"] as const;
export type DemobStatus = (typeof DEMOB_STATUSES)[number];
export const DEMOB_STATUS_LABEL: Record<DemobStatus, string> = {
  pending: "Chưa làm",
  done: "Hoàn thành",
};

export type DemobRow = {
  id: number;
  projectId: number | null;
  title: string;
  category: string | null;
  status: DemobStatus;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
};

export async function listDemob(projectId?: number): Promise<DemobRow[]> {
  const where = projectId != null ? "WHERE d.project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<DemobRow>(
    `SELECT d.id, d.project_id AS "projectId", d.title, d.category, d.status, d.note,
            d.created_by AS "createdBy", d.created_at AS "createdAt"
       FROM demob_items d
      ${where}
      ORDER BY (d.status = 'done') ASC, d.id`,
    ...args,
  );
}

// ===== Lessons learned (bài học kinh nghiệm) =====

export type LessonRow = {
  id: number;
  projectId: number | null;
  title: string;
  category: string | null;
  content: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listLessons(projectId?: number): Promise<LessonRow[]> {
  const where = projectId != null ? "WHERE l.project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<LessonRow>(
    `SELECT l.id, l.project_id AS "projectId", l.title, l.category, l.content,
            l.created_by AS "createdBy", u.name AS "createdByName", l.created_at AS "createdAt"
       FROM lessons_learned l
       LEFT JOIN users u ON u.id = l.created_by
      ${where}
      ORDER BY l.id DESC`,
    ...args,
  );
}

// ===== KPI hub =====

export type HandoverProgress = {
  itemsTotal: number;
  itemsAccepted: number;
  itemsAcceptedPercent: number;
  punchOpen: number;
  punchOpenBySeverity: Record<PunchSeverity, number>;
  commissioningTotal: number;
  commissioningPassed: number;
  commissioningPassedPercent: number;
};

// KPI strip trang /handover: % hạng mục accepted, số punch open theo severity, % T&C
// passed. projectId undefined = không lọc dự án (nội bộ/test cũ).
export async function handoverProgress(projectId?: number): Promise<HandoverProgress> {
  const where = projectId != null ? "WHERE project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];

  const items = await queryOne<{ total: number; accepted: number }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'accepted') AS accepted
       FROM handover_items ${where}`,
    ...args,
  );
  const itemsTotal = Number(items?.total ?? 0);
  const itemsAccepted = Number(items?.accepted ?? 0);

  const punchWhere =
    projectId != null ? "WHERE project_id = ? AND status <> 'closed'" : "WHERE status <> 'closed'";
  const punch = await query<{ severity: PunchSeverity | null; n: number }>(
    `SELECT severity, COUNT(*) AS n FROM punch_list ${punchWhere} GROUP BY severity`,
    ...args,
  );
  const punchOpenBySeverity: Record<PunchSeverity, number> = { low: 0, medium: 0, high: 0 };
  let punchOpen = 0;
  for (const row of punch) {
    const n = Number(row.n);
    punchOpen += n;
    if (row.severity && row.severity in punchOpenBySeverity) punchOpenBySeverity[row.severity] += n;
  }

  const commissioning = await queryOne<{ total: number; passed: number }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE result = 'passed') AS passed
       FROM commissioning ${where}`,
    ...args,
  );
  const commissioningTotal = Number(commissioning?.total ?? 0);
  const commissioningPassed = Number(commissioning?.passed ?? 0);

  return {
    itemsTotal,
    itemsAccepted,
    itemsAcceptedPercent: itemsTotal > 0 ? Math.round((itemsAccepted / itemsTotal) * 100) : 0,
    punchOpen,
    punchOpenBySeverity,
    commissioningTotal,
    commissioningPassed,
    commissioningPassedPercent:
      commissioningTotal > 0 ? Math.round((commissioningPassed / commissioningTotal) * 100) : 0,
  };
}

// ===== Input parsing/validate thuần =====

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CommissioningInput = {
  code: string | null;
  systemName: string;
  tradeId: number | null;
  checklist: unknown;
  result: CommissioningResult;
  testedAt: string | null;
  note: string | null;
};

export function parseCommissioningBody(body: Record<string, unknown>): CommissioningInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: strOrNull(body.code),
    systemName: str(body.systemName),
    tradeId: body.tradeId != null ? Number(body.tradeId) : null,
    checklist: body.checklist ?? [],
    result: (str(body.result) || "draft") as CommissioningResult,
    testedAt: strOrNull(body.testedAt),
    note: strOrNull(body.note),
  };
}

export function validateCommissioningInput(input: CommissioningInput): string | null {
  if (!input.systemName.trim()) return "Thiếu tên hệ thống";
  if (!COMMISSIONING_RESULTS.includes(input.result)) return "Kết quả không hợp lệ";
  if (input.testedAt != null && !DATE_RE.test(input.testedAt))
    return "Ngày chạy thử không đúng định dạng YYYY-MM-DD";
  if (!validateCommissioningItems(input.checklist)) return "Checklist chạy thử không hợp lệ";
  return null;
}

export type HandoverItemInput = {
  title: string;
  tradeId: number | null;
  workPackageId: number | null;
  status: HandoverItemStatus;
  handoverDate: string | null;
};

export function parseHandoverItemBody(body: Record<string, unknown>): HandoverItemInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    title: str(body.title),
    tradeId: body.tradeId != null ? Number(body.tradeId) : null,
    workPackageId: body.workPackageId != null ? Number(body.workPackageId) : null,
    status: (str(body.status) || "pending") as HandoverItemStatus,
    handoverDate: strOrNull(body.handoverDate),
  };
}

export function validateHandoverItemInput(input: HandoverItemInput): string | null {
  if (!input.title.trim()) return "Thiếu tên hạng mục";
  if (!HANDOVER_ITEM_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.handoverDate != null && !DATE_RE.test(input.handoverDate))
    return "Ngày bàn giao không đúng định dạng YYYY-MM-DD";
  return null;
}

export type PunchInput = {
  handoverItemId: number | null;
  description: string;
  severity: PunchSeverity | null;
  status: PunchStatus;
  dueDate: string | null;
  assignee: number | null;
};

export function parsePunchBody(body: Record<string, unknown>): PunchInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    handoverItemId: body.handoverItemId != null ? Number(body.handoverItemId) : null,
    description: str(body.description),
    severity: (strOrNull(body.severity) as PunchSeverity | null) ?? null,
    status: (str(body.status) || "open") as PunchStatus,
    dueDate: strOrNull(body.dueDate),
    assignee: body.assignee != null ? Number(body.assignee) : null,
  };
}

export function validatePunchInput(input: PunchInput): string | null {
  if (!input.description.trim()) return "Thiếu mô tả tồn tại";
  if (input.severity != null && !PUNCH_SEVERITIES.includes(input.severity))
    return "Mức độ không hợp lệ";
  if (!PUNCH_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.dueDate != null && !DATE_RE.test(input.dueDate))
    return "Hạn xử lý không đúng định dạng YYYY-MM-DD";
  return null;
}

export type DemobInput = {
  title: string;
  category: string | null;
  status: DemobStatus;
  note: string | null;
};

export function parseDemobBody(body: Record<string, unknown>): DemobInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    title: str(body.title),
    category: strOrNull(body.category),
    status: (str(body.status) || "pending") as DemobStatus,
    note: strOrNull(body.note),
  };
}

export function validateDemobInput(input: DemobInput): string | null {
  if (!input.title.trim()) return "Thiếu tên hạng mục";
  if (!DEMOB_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  return null;
}

export type LessonInput = { title: string; category: string | null; content: string | null };

export function parseLessonBody(body: Record<string, unknown>): LessonInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    title: str(body.title),
    category: strOrNull(body.category),
    content: strOrNull(body.content),
  };
}

export function validateLessonInput(input: LessonInput): string | null {
  if (!input.title.trim()) return "Thiếu tiêu đề bài học";
  return null;
}
