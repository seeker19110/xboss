// M32 — Quản lý thay đổi thiết kế (Design Change): tiếp nhận yêu cầu → đánh giá tác
// động (kỹ thuật/chi phí/tiến độ) → trình duyệt → cập nhật bản vẽ liên quan. BPTC
// (drawings.kind='method') đã có từ M8, KHÔNG làm lại ở đây. Xem
// docs/nang-cap/M32-thiet-ke-thay-doi.md.
import { query, queryOne, run } from "@/lib/db";
import { daysFromTodayISO } from "@/lib/date";
import { nextSeqCode } from "@/lib/seqcode";
import { CAN, type User } from "@/lib/auth";

export const DESIGN_CHANGE_STATUSES = [
  "submitted",
  "assessing",
  "approved",
  "rejected",
  "drawing_updated",
] as const;
export type DesignChangeStatus = (typeof DESIGN_CHANGE_STATUSES)[number];
export const DESIGN_CHANGE_STATUS_LABEL: Record<DesignChangeStatus, string> = {
  submitted: "Đã trình",
  assessing: "Đang đánh giá",
  approved: "Được duyệt",
  rejected: "Từ chối",
  drawing_updated: "Đã cập nhật bản vẽ",
};

// DC 'submitted'/'assessing' quá N ngày chưa quyết → notification design_change_pending.
export const DESIGN_CHANGE_PENDING_DAYS = 5;

export type DesignChangeInput = {
  title: string;
  systemId: number | null;
  drawingId: number | null;
  requestedByNote: string | null;
  reason: string;
  impactTechnical: string | null;
  impactCost: string | null;
  impactSchedule: string | null;
};

export function parseDesignChangeBody(body: Record<string, unknown>): DesignChangeInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    title: str(body.title),
    systemId: body.systemId != null ? Number(body.systemId) : null,
    drawingId: body.drawingId != null ? Number(body.drawingId) : null,
    requestedByNote: strOrNull(body.requestedByNote),
    reason: str(body.reason),
    impactTechnical: strOrNull(body.impactTechnical),
    impactCost: strOrNull(body.impactCost),
    impactSchedule: strOrNull(body.impactSchedule),
  };
}

// Validate thuần (không chạm DB) — title/reason bắt buộc.
export function validateDesignChangeInput(input: DesignChangeInput): string | null {
  if (!input.title.trim()) return "Thiếu tiêu đề thay đổi thiết kế";
  if (!input.reason.trim()) return "Thiếu lý do thay đổi";
  return null;
}

// Kiểm FK system/drawing tồn tại — trả thông điệp lỗi hoặc null.
export async function checkDesignChangeRefs(input: DesignChangeInput): Promise<string | null> {
  if (input.systemId != null) {
    if (
      !Number.isInteger(input.systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.systemId))
    )
      return "Hệ không hợp lệ";
  }
  if (input.drawingId != null) {
    if (
      !Number.isInteger(input.drawingId) ||
      !(await queryOne(`SELECT id FROM drawings WHERE id = ?`, input.drawingId))
    )
      return "Bản vẽ liên quan không tồn tại";
  }
  return null;
}

export async function nextDesignChangeCode(): Promise<string> {
  return nextSeqCode("design_changes", "code", "DC-", 4);
}

export type DesignChangeRow = DesignChangeInput & {
  id: number;
  code: string;
  projectId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  drawingCode: string | null;
  drawingName: string | null;
  status: DesignChangeStatus;
  decisionNote: string | null;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

export type DesignChangeFilters = {
  id?: number;
  projectId?: number | null;
  status?: DesignChangeStatus;
};

// Danh sách DC kèm tên hệ/bản vẽ liên quan. projectId truyền vào để scoping đa dự án
// (M22) — không lọc khi undefined/null. getDesignChange (dùng ở route [id]) BẮT BUỘC
// truyền projectId để chặn thao tác xuyên dự án theo id đoán được.
export async function listDesignChanges(
  filters: DesignChangeFilters = {},
): Promise<DesignChangeRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.id != null) {
    clauses.push("dc.id = ?");
    params.push(filters.id);
  }
  if (filters.projectId != null) {
    clauses.push("dc.project_id = ?");
    params.push(filters.projectId);
  }
  if (filters.status) {
    clauses.push("dc.status = ?");
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return query<DesignChangeRow>(
    `SELECT dc.id, dc.code, dc.project_id AS "projectId", dc.title,
            dc.system_id AS "systemId", d.code AS "systemCode",
            d.name AS "systemName", d.color AS "systemColor",
            dc.drawing_id AS "drawingId", dw.code AS "drawingCode", dw.name AS "drawingName",
            dc.requested_by_note AS "requestedByNote", dc.reason,
            dc.impact_technical AS "impactTechnical", dc.impact_cost AS "impactCost",
            dc.impact_schedule AS "impactSchedule", dc.status,
            dc.decision_note AS "decisionNote", dc.decided_by AS "decidedBy",
            ud.name AS "decidedByName", dc.decided_at AS "decidedAt",
            dc.created_by AS "createdBy", uc.name AS "createdByName", dc.created_at AS "createdAt"
       FROM design_changes dc
       LEFT JOIN systems d ON d.id = dc.system_id
       LEFT JOIN drawings dw ON dw.id = dc.drawing_id
       LEFT JOIN users uc ON uc.id = dc.created_by
       LEFT JOIN users ud ON ud.id = dc.decided_by
      ${where}
      ORDER BY dc.created_at DESC, dc.id DESC`,
    ...params,
  );
}

export async function getDesignChange(
  id: number,
  projectId?: number | null,
): Promise<DesignChangeRow | undefined> {
  const rows = await listDesignChanges({ id, projectId });
  return rows[0];
}

// DC 'submitted'/'assessing' quá N ngày chưa quyết → nhắc Admin/PM (mirror pendingVariations).
// projectId truyền ngay từ đầu để không tạo nợ kỹ thuật scoping mới (đa dự án M22).
export async function pendingDesignChanges(
  days = DESIGN_CHANGE_PENDING_DAYS,
  projectId?: number | null,
): Promise<{ id: number; code: string; title: string; createdAt: string }[]> {
  const limit = daysFromTodayISO(-days);
  const projectClause = projectId != null ? " AND project_id = ?" : "";
  return query(
    `SELECT id, code, title, created_at::date AS "createdAt"
       FROM design_changes
      WHERE status IN ('submitted', 'assessing') AND created_at::date <= ?${projectClause}
      ORDER BY created_at`,
    ...(projectId != null ? [limit, projectId] : [limit]),
  );
}

// Quyền quyết DC = CAN.approve (Admin/PM) — tách hàm riêng cho chỗ gọi rõ nghĩa.
export function canDecideDesignChange(user: User): boolean {
  return CAN.approve(user.role);
}

// Duyệt/từ chối DC đang ở 'submitted'/'assessing'. Duyệt có tác động chi phí/tiến độ
// bắt buộc ghi decision_note (spec M32 — quyết định không nên "duyệt trắng" khi có ảnh
// hưởng thật tới ngân sách/tiến độ).
export async function decideDesignChange(opts: {
  designChangeId: number;
  decision: "approved" | "rejected";
  decisionNote: string | null;
  decidedBy: number;
  projectId?: number | null;
}): Promise<{ ok: true } | string> {
  const projectClause = opts.projectId != null ? " AND project_id = ?" : "";
  const dc = await queryOne<{
    status: string;
    impactCost: string | null;
    impactSchedule: string | null;
  }>(
    `SELECT status, impact_cost AS "impactCost", impact_schedule AS "impactSchedule"
       FROM design_changes WHERE id = ?${projectClause}`,
    ...(opts.projectId != null ? [opts.designChangeId, opts.projectId] : [opts.designChangeId]),
  );
  if (!dc) return "Không tìm thấy thay đổi thiết kế";
  if (dc.status !== "submitted" && dc.status !== "assessing")
    return "Thay đổi thiết kế không ở trạng thái chờ quyết định";

  const hasImpact = !!(dc.impactCost?.trim() || dc.impactSchedule?.trim());
  if (opts.decision === "approved" && hasImpact && !opts.decisionNote?.trim())
    return "Có tác động chi phí/tiến độ — bắt buộc ghi rõ ghi chú quyết định";

  await run(
    `UPDATE design_changes SET status = ?, decision_note = ?, decided_by = ?, decided_at = NOW()
      WHERE id = ?${projectClause}`,
    opts.decision,
    opts.decisionNote?.trim() || null,
    opts.decidedBy,
    ...(opts.projectId != null ? [opts.designChangeId, opts.projectId] : [opts.designChangeId]),
  );
  return { ok: true };
}

// Đánh dấu đã cập nhật bản vẽ xong sau khi duyệt — thao tác tay, không tự động (spec M32).
export async function markDrawingUpdated(
  id: number,
  projectId?: number | null,
): Promise<string | null> {
  const projectClause = projectId != null ? " AND project_id = ?" : "";
  const dc = await queryOne<{ status: string }>(
    `SELECT status FROM design_changes WHERE id = ?${projectClause}`,
    ...(projectId != null ? [id, projectId] : [id]),
  );
  if (!dc) return "Không tìm thấy thay đổi thiết kế";
  if (dc.status !== "approved") return "Chỉ đánh dấu được sau khi thay đổi thiết kế đã được duyệt";
  await run(
    `UPDATE design_changes SET status = 'drawing_updated' WHERE id = ?${projectClause}`,
    ...(projectId != null ? [id, projectId] : [id]),
  );
  return null;
}
