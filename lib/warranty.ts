// M30 — Bảo hành & Bảo trì (O&M): danh mục hạng mục bảo hành theo hệ (hạn suy từ
// warranty_from + warranty_months, không lưu ngày hết — đổi tháng bảo hành thì hạn tự
// đổi), claim lỗi sau bàn giao (vòng đời open→handling→closed, tách khỏi NCR M03 vì
// khác giai đoạn/quyền), thư viện tài liệu hướng dẫn vận hành & bảo trì (pattern
// task_documents). Xem docs/nang-cap/M30-bao-hanh-bao-tri.md.
import { query, queryOne } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ===== Hạng mục bảo hành =====

export const WARRANTY_ITEM_STATUSES = ["active", "expired"] as const;
export type WarrantyItemStatus = (typeof WARRANTY_ITEM_STATUSES)[number];
export const WARRANTY_ITEM_STATUS_LABEL: Record<WarrantyItemStatus, string> = {
  active: "Còn bảo hành",
  expired: "Đã hết bảo hành",
};

export type WarrantyItemRow = {
  id: number;
  projectId: number | null;
  title: string;
  tradeId: number | null;
  tradeCode: string | null;
  tradeName: string | null;
  handoverItemId: number | null;
  handoverItemTitle: string | null;
  warrantyFrom: string | null;
  warrantyMonths: number | null;
  guaranteeId: number | null;
  guaranteeTitle: string | null;
  status: WarrantyItemStatus;
  note: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// Hạn bảo hành = warranty_from + warranty_months (tính, không lưu — so chuỗi ngày như
// mọi nơi khác trong dự án, xem lib/date.ts). null khi thiếu 1 trong 2 giá trị.
export function warrantyExpiry(item: {
  warrantyFrom: string | null;
  warrantyMonths: number | null;
}): string | null {
  if (!item.warrantyFrom || item.warrantyMonths == null) return null;
  if (!DATE_RE.test(item.warrantyFrom)) return null;
  const [y, m, d] = item.warrantyFrom.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + item.warrantyMonths, d));
  return dt.toISOString().slice(0, 10);
}

// projectId undefined = không lọc dự án (nội bộ/test cũ).
export async function listWarrantyItems(
  projectId?: number,
  filters?: { status?: WarrantyItemStatus },
): Promise<WarrantyItemRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("w.project_id = ?");
    args.push(projectId);
  }
  if (filters?.status) {
    conds.push("w.status = ?");
    args.push(filters.status);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<WarrantyItemRow>(
    `SELECT w.id, w.project_id AS "projectId", w.title,
            w.system_id AS "tradeId", d.code AS "tradeCode", d.name AS "tradeName",
            w.handover_item_id AS "handoverItemId", hi.title AS "handoverItemTitle",
            w.warranty_from AS "warrantyFrom", w.warranty_months AS "warrantyMonths",
            w.guarantee_id AS "guaranteeId", ib.title AS "guaranteeTitle",
            w.status, w.note,
            w.created_by AS "createdBy", u.name AS "createdByName", w.created_at AS "createdAt"
       FROM warranty_items w
       LEFT JOIN systems d ON d.id = w.system_id
       LEFT JOIN handover_items hi ON hi.id = w.handover_item_id
       LEFT JOIN insurance_bonds ib ON ib.id = w.guarantee_id
       LEFT JOIN users u ON u.id = w.created_by
      ${where}
      ORDER BY (w.status = 'expired') ASC, w.id DESC`,
    ...args,
  );
}

export async function getWarrantyItem(
  id: number,
  projectId?: number,
): Promise<WarrantyItemRow | null> {
  const conds = ["w.id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("w.project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<WarrantyItemRow>(
    `SELECT w.id, w.project_id AS "projectId", w.title,
            w.system_id AS "tradeId", d.code AS "tradeCode", d.name AS "tradeName",
            w.handover_item_id AS "handoverItemId", hi.title AS "handoverItemTitle",
            w.warranty_from AS "warrantyFrom", w.warranty_months AS "warrantyMonths",
            w.guarantee_id AS "guaranteeId", ib.title AS "guaranteeTitle",
            w.status, w.note,
            w.created_by AS "createdBy", u.name AS "createdByName", w.created_at AS "createdAt"
       FROM warranty_items w
       LEFT JOIN systems d ON d.id = w.system_id
       LEFT JOIN handover_items hi ON hi.id = w.handover_item_id
       LEFT JOIN insurance_bonds ib ON ib.id = w.guarantee_id
       LEFT JOIN users u ON u.id = w.created_by
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? null;
}

export type WarrantyItemInput = {
  title: string;
  tradeId: number | null;
  handoverItemId: number | null;
  warrantyFrom: string | null;
  warrantyMonths: number | null;
  guaranteeId: number | null;
  status: WarrantyItemStatus;
  note: string | null;
};

export function parseWarrantyItemBody(body: Record<string, unknown>): WarrantyItemInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    title: str(body.title),
    tradeId: numOrNull(body.tradeId),
    handoverItemId: numOrNull(body.handoverItemId),
    warrantyFrom: strOrNull(body.warrantyFrom),
    warrantyMonths: numOrNull(body.warrantyMonths),
    guaranteeId: numOrNull(body.guaranteeId),
    status: (str(body.status) || "active") as WarrantyItemStatus,
    note: strOrNull(body.note),
  };
}

export function validateWarrantyInput(input: WarrantyItemInput): string | null {
  if (!input.title.trim()) return "Thiếu tên hạng mục bảo hành";
  if (!WARRANTY_ITEM_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.warrantyFrom != null && !DATE_RE.test(input.warrantyFrom))
    return "Ngày bắt đầu bảo hành không đúng định dạng YYYY-MM-DD";
  if (input.warrantyMonths != null && input.warrantyMonths < 0)
    return "Số tháng bảo hành không hợp lệ";
  return null;
}

// Hạng mục còn 'active' mà hạn tính được đã/sắp hết trong `days` ngày tới → nguồn cho
// notification `warranty_expiry` (dedup theo warranty_item_id). projectId undefined =
// không lọc dự án.
export type ExpiringWarrantyItem = {
  id: number;
  title: string;
  expiry: string;
  expired: boolean;
  projectId: number | null;
};

export async function expiringWarranties(
  days = 30,
  projectId?: number,
): Promise<ExpiringWarrantyItem[]> {
  const conds = ["status = 'active'", "warranty_from IS NOT NULL", "warranty_months IS NOT NULL"];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{
    id: number;
    title: string;
    warrantyFrom: string;
    warrantyMonths: number;
    projectId: number | null;
  }>(
    `SELECT id, title, warranty_from AS "warrantyFrom", warranty_months AS "warrantyMonths",
            project_id AS "projectId"
       FROM warranty_items
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  const limit = daysFromTodayISO(days);
  const today = todayISO();
  const out: ExpiringWarrantyItem[] = [];
  for (const r of rows) {
    const expiry = warrantyExpiry({
      warrantyFrom: r.warrantyFrom,
      warrantyMonths: r.warrantyMonths,
    });
    if (expiry == null || expiry > limit) continue;
    out.push({ id: r.id, title: r.title, expiry, expired: expiry < today, projectId: r.projectId });
  }
  out.sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
  return out;
}

// ===== Claim (lỗi sau bàn giao) =====

export const WARRANTY_CLAIM_SEVERITIES = ["low", "medium", "high"] as const;
export type WarrantyClaimSeverity = (typeof WARRANTY_CLAIM_SEVERITIES)[number];
export const WARRANTY_CLAIM_SEVERITY_LABEL: Record<WarrantyClaimSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

export const WARRANTY_CLAIM_STATUSES = ["open", "handling", "closed"] as const;
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number];
export const WARRANTY_CLAIM_STATUS_LABEL: Record<WarrantyClaimStatus, string> = {
  open: "Mới tiếp nhận",
  handling: "Đang xử lý",
  closed: "Đã đóng",
};

export type WarrantyClaimRow = {
  id: number;
  projectId: number | null;
  warrantyItemId: number | null;
  warrantyItemTitle: string | null;
  code: string | null;
  reportedDate: string | null;
  description: string;
  severity: WarrantyClaimSeverity | null;
  status: WarrantyClaimStatus;
  dueDate: string | null;
  resolution: string | null;
  closedDate: string | null;
  assignee: number | null;
  assigneeName: string | null;
  createdBy: number | null;
  createdAt: string;
};

// projectId undefined = không lọc dự án (nội bộ/test cũ). filters cho phép lọc theo
// status/severity/assignee — dùng cho tab Claim trong /warranty.
export async function listClaims(
  projectId?: number,
  filters?: {
    status?: WarrantyClaimStatus;
    severity?: WarrantyClaimSeverity;
    assignee?: number;
  },
): Promise<WarrantyClaimRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  if (filters?.status) {
    conds.push("c.status = ?");
    args.push(filters.status);
  }
  if (filters?.severity) {
    conds.push("c.severity = ?");
    args.push(filters.severity);
  }
  if (filters?.assignee != null) {
    conds.push("c.assignee = ?");
    args.push(filters.assignee);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<WarrantyClaimRow>(
    `SELECT c.id, c.project_id AS "projectId", c.warranty_item_id AS "warrantyItemId",
            w.title AS "warrantyItemTitle", c.code, c.reported_date AS "reportedDate",
            c.description, c.severity, c.status, c.due_date AS "dueDate", c.resolution,
            c.closed_date AS "closedDate", c.assignee, u.name AS "assigneeName",
            c.created_by AS "createdBy", c.created_at AS "createdAt"
       FROM warranty_claims c
       LEFT JOIN warranty_items w ON w.id = c.warranty_item_id
       LEFT JOIN users u ON u.id = c.assignee
      ${where}
      ORDER BY (c.status = 'closed') ASC,
               (c.status <> 'closed' AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE) DESC,
               c.due_date ASC NULLS LAST, c.id DESC`,
    ...args,
  );
}

export async function getClaim(id: number, projectId?: number): Promise<WarrantyClaimRow | null> {
  const conds = ["c.id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<WarrantyClaimRow>(
    `SELECT c.id, c.project_id AS "projectId", c.warranty_item_id AS "warrantyItemId",
            w.title AS "warrantyItemTitle", c.code, c.reported_date AS "reportedDate",
            c.description, c.severity, c.status, c.due_date AS "dueDate", c.resolution,
            c.closed_date AS "closedDate", c.assignee, u.name AS "assigneeName",
            c.created_by AS "createdBy", c.created_at AS "createdAt"
       FROM warranty_claims c
       LEFT JOIN warranty_items w ON w.id = c.warranty_item_id
       LEFT JOIN users u ON u.id = c.assignee
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? null;
}

export type WarrantyClaimInput = {
  warrantyItemId: number | null;
  code: string | null;
  reportedDate: string | null;
  description: string;
  severity: WarrantyClaimSeverity | null;
  status: WarrantyClaimStatus;
  dueDate: string | null;
  resolution: string | null;
  closedDate: string | null;
  assignee: number | null;
};

export function parseClaimBody(body: Record<string, unknown>): WarrantyClaimInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    warrantyItemId: numOrNull(body.warrantyItemId),
    code: strOrNull(body.code),
    reportedDate: strOrNull(body.reportedDate),
    description: str(body.description),
    severity: (strOrNull(body.severity) as WarrantyClaimSeverity | null) ?? null,
    status: (str(body.status) || "open") as WarrantyClaimStatus,
    dueDate: strOrNull(body.dueDate),
    resolution: strOrNull(body.resolution),
    closedDate: strOrNull(body.closedDate),
    assignee: numOrNull(body.assignee),
  };
}

export function validateClaimInput(input: WarrantyClaimInput): string | null {
  if (!input.description.trim()) return "Thiếu mô tả lỗi";
  if (!WARRANTY_CLAIM_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.severity != null && !WARRANTY_CLAIM_SEVERITIES.includes(input.severity))
    return "Mức độ không hợp lệ";
  for (const [label, d] of [
    ["Ngày báo lỗi", input.reportedDate],
    ["Hạn xử lý", input.dueDate],
    ["Ngày đóng", input.closedDate],
  ] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  return null;
}

// Claim chưa đóng mà quá hạn xử lý → dựng notification `warranty_claim_overdue` (mirror
// overduePunch/overdueMeetingActions — "quá hạn xử lý" chứ không phải "sắp hết hạn giấy
// tờ" như expiringWarranties). assigneeId undefined = không lọc theo người phụ trách
// (Admin/PM thấy mọi claim quá hạn); projectId undefined = không lọc dự án.
export type OverdueClaim = {
  id: number;
  description: string;
  dueDate: string;
  assignee: number | null;
  projectId: number | null;
};

export async function overdueClaims(
  assigneeId?: number,
  projectId?: number,
): Promise<OverdueClaim[]> {
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
  return query<OverdueClaim>(
    `SELECT id, description, due_date AS "dueDate", assignee, project_id AS "projectId"
       FROM warranty_claims
      WHERE ${conds.join(" AND ")}
      ORDER BY due_date`,
    ...args,
  );
}

// ===== Tài liệu O&M =====

export type OmDocumentRow = {
  id: number;
  projectId: number | null;
  title: string;
  tradeId: number | null;
  tradeName: string | null;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
};

export async function listOmDocs(projectId?: number): Promise<OmDocumentRow[]> {
  const where = projectId != null ? "WHERE o.project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<OmDocumentRow>(
    `SELECT o.id, o.project_id AS "projectId", o.title,
            o.system_id AS "tradeId", d.name AS "tradeName",
            o.file_name AS "fileName", o.original_name AS "originalName",
            o.mime_type AS "mimeType", o.size_bytes AS "sizeBytes",
            o.uploaded_by AS "uploadedBy", u.name AS "uploaderName", o.created_at AS "createdAt"
       FROM om_documents o
       LEFT JOIN systems d ON d.id = o.system_id
       LEFT JOIN users u ON u.id = o.uploaded_by
      ${where}
      ORDER BY o.id DESC`,
    ...args,
  );
}

export async function getOmDoc(id: number, projectId?: number): Promise<OmDocumentRow | null> {
  const conds = ["o.id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("o.project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<OmDocumentRow>(
    `SELECT o.id, o.project_id AS "projectId", o.title,
            o.system_id AS "tradeId", d.name AS "tradeName",
            o.file_name AS "fileName", o.original_name AS "originalName",
            o.mime_type AS "mimeType", o.size_bytes AS "sizeBytes",
            o.uploaded_by AS "uploadedBy", u.name AS "uploaderName", o.created_at AS "createdAt"
       FROM om_documents o
       LEFT JOIN systems d ON d.id = o.system_id
       LEFT JOIN users u ON u.id = o.uploaded_by
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? null;
}
