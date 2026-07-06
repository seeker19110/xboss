// M11 — HSE/an toàn lao động: kiểm tra định kỳ, toolbox talk, sự cố/cận nguy, giấy phép
// làm việc đặc biệt. Xem docs/nang-cap/M11-hse.md.
import { query, queryOne, run } from "@/lib/db";
import { todayISO } from "@/lib/date";

export const HSE_KINDS = ["inspection", "toolbox", "incident", "near_miss", "permit"] as const;
export type HseKind = (typeof HSE_KINDS)[number];
export const HSE_KIND_LABEL: Record<HseKind, string> = {
  inspection: "Kiểm tra định kỳ",
  toolbox: "Toolbox talk",
  incident: "Sự cố",
  near_miss: "Cận nguy",
  permit: "Giấy phép làm việc",
};

export const HSE_SEVERITIES = ["low", "medium", "high"] as const;
export type HseSeverity = (typeof HSE_SEVERITIES)[number];
export const HSE_SEVERITY_LABEL: Record<HseSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

export const HSE_PERMIT_TYPES = ["hot_work", "height", "confined", "electrical"] as const;
export type HsePermitType = (typeof HSE_PERMIT_TYPES)[number];
export const HSE_PERMIT_TYPE_LABEL: Record<HsePermitType, string> = {
  hot_work: "Hàn/cắt nóng",
  height: "Làm việc trên cao",
  confined: "Không gian hạn chế",
  electrical: "Điện",
};

export const HSE_ACTION_STATUSES = ["none", "open", "closed"] as const;
export type HseActionStatus = (typeof HSE_ACTION_STATUSES)[number];

export type HseInput = {
  kind: HseKind;
  recordDate: string;
  floorLabel: string | null;
  area: string | null;
  description: string;
  severity: HseSeverity | null;
  permitType: HsePermitType | null;
  permitFrom: string | null;
  permitTo: string | null;
  actionRequired: string | null;
  actionAssignee: number | null;
  actionDue: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseHseBody(body: Record<string, unknown>): HseInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    kind: (typeof body.kind === "string" ? body.kind : "") as HseKind,
    recordDate: typeof body.recordDate === "string" ? body.recordDate.trim() : "",
    floorLabel: strOrNull(body.floorLabel),
    area: strOrNull(body.area),
    description: typeof body.description === "string" ? body.description.trim() : "",
    severity: strOrNull(body.severity) as HseSeverity | null,
    permitType: strOrNull(body.permitType) as HsePermitType | null,
    permitFrom: strOrNull(body.permitFrom),
    permitTo: strOrNull(body.permitTo),
    actionRequired: strOrNull(body.actionRequired),
    actionAssignee: body.actionAssignee != null ? Number(body.actionAssignee) : null,
    actionDue: strOrNull(body.actionDue),
  };
}

export function validateHseInput(input: HseInput): string | null {
  if (!HSE_KINDS.includes(input.kind)) return "Loại ghi nhận không hợp lệ";
  if (!DATE_RE.test(input.recordDate)) return "Ngày ghi nhận không đúng định dạng YYYY-MM-DD";
  if (!input.description) return "Thiếu mô tả";
  if (input.severity && !HSE_SEVERITIES.includes(input.severity)) return "Mức độ không hợp lệ";
  if ((input.kind === "incident" || input.kind === "near_miss") && !input.severity)
    return "Sự cố/cận nguy cần mức độ nghiêm trọng";
  if (input.kind === "permit") {
    if (!input.permitType || !HSE_PERMIT_TYPES.includes(input.permitType))
      return "Giấy phép cần loại hợp lệ (permitType)";
    if (!input.permitFrom || !input.permitTo) return "Giấy phép cần khung giờ hiệu lực";
  }
  for (const [label, d] of [["Hạn khắc phục", input.actionDue]] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  return null;
}

export async function checkHseRefs(input: HseInput): Promise<string | null> {
  if (input.actionAssignee != null) {
    const u = await queryOne(`SELECT id FROM users WHERE id = ?`, input.actionAssignee);
    if (!u) return "Người phụ trách khắc phục không tồn tại";
  }
  return null;
}

export type HseRow = HseInput & {
  id: number;
  actionStatus: HseActionStatus;
  actionAssigneeName: string | null;
  createdBy: number | null;
  createdAt: string;
};

export async function listHse(filters: { kind?: HseKind; month?: string }): Promise<HseRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.kind) {
    clauses.push("h.kind = ?");
    params.push(filters.kind);
  }
  if (filters.month) {
    clauses.push("to_char(h.record_date, 'YYYY-MM') = ?");
    params.push(filters.month);
  }
  return query<HseRow>(
    `SELECT h.id, h.kind, h.record_date AS "recordDate", h.floor_label AS "floorLabel",
            h.area, h.description, h.severity, h.permit_type AS "permitType",
            h.permit_from AS "permitFrom", h.permit_to AS "permitTo",
            h.action_required AS "actionRequired", h.action_assignee AS "actionAssignee",
            u.name AS "actionAssigneeName", h.action_due AS "actionDue",
            h.action_status AS "actionStatus", h.created_by AS "createdBy", h.created_at AS "createdAt"
       FROM hse_records h LEFT JOIN users u ON u.id = h.action_assignee
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY h.record_date DESC, h.id DESC`,
    ...params,
  );
}

export async function getHse(id: number): Promise<HseRow | null> {
  const row = await queryOne<HseRow>(
    `SELECT h.id, h.kind, h.record_date AS "recordDate", h.floor_label AS "floorLabel",
            h.area, h.description, h.severity, h.permit_type AS "permitType",
            h.permit_from AS "permitFrom", h.permit_to AS "permitTo",
            h.action_required AS "actionRequired", h.action_assignee AS "actionAssignee",
            u.name AS "actionAssigneeName", h.action_due AS "actionDue",
            h.action_status AS "actionStatus", h.created_by AS "createdBy", h.created_at AS "createdAt"
       FROM hse_records h LEFT JOIN users u ON u.id = h.action_assignee
      WHERE h.id = ?`,
    id,
  );
  return row ?? null;
}

// Ngày không sự cố — số ngày từ lần incident gần nhất (con số treo công trường trên dashboard HSE).
export async function daysSinceLastIncident(): Promise<number | null> {
  const row = await queryOne<{ recordDate: string }>(
    `SELECT record_date AS "recordDate" FROM hse_records WHERE kind = 'incident'
      ORDER BY record_date DESC LIMIT 1`,
  );
  if (!row) return null;
  return Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(row.recordDate)) / 86400_000));
}

export type OpenHseAction = {
  id: number;
  description: string;
  actionDue: string;
  actionAssignee: number | null;
};

// Action khắc phục quá hạn chưa đóng — nguồn notification hse_action_due.
// assigneeId = undefined → mọi action quá hạn (Admin/PM); có giá trị → chỉ của người đó.
export async function openHseActions(assigneeId?: number): Promise<OpenHseAction[]> {
  const today = todayISO();
  const filter = assigneeId != null ? " AND action_assignee = ?" : "";
  return query<OpenHseAction>(
    `SELECT id, description, action_due AS "actionDue", action_assignee AS "actionAssignee"
       FROM hse_records
      WHERE action_status = 'open' AND action_due IS NOT NULL AND action_due < ?${filter}
      ORDER BY action_due`,
    ...(assigneeId != null ? [today, assigneeId] : [today]),
  );
}

// Đóng action khắc phục (Admin/PM/kỹ sư).
export async function closeHseAction(id: number): Promise<boolean> {
  const r = await run(
    `UPDATE hse_records SET action_status = 'closed' WHERE id = ? AND action_status = 'open'`,
    id,
  );
  return r.changes > 0;
}
