// M23 — Khởi động & Pháp lý: hồ sơ pháp lý dự án (giấy phép XD, phê duyệt QH/TK, HĐ
// chính...) + checklist huy động công trường (bàn giao mặt bằng, khảo sát, trắc đạc,
// huy động). Xem docs/nang-cap/M23-khoi-dong-phap-ly.md.
import { query, queryOne } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const LEGAL_KINDS = [
  "giay_phep_xd",
  "phe_duyet_qh",
  "phe_duyet_tk",
  "hd_chinh",
  "khac",
] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
export const LEGAL_KIND_LABEL: Record<LegalKind, string> = {
  giay_phep_xd: "Giấy phép xây dựng",
  phe_duyet_qh: "Phê duyệt quy hoạch",
  phe_duyet_tk: "Phê duyệt thiết kế",
  hd_chinh: "Hợp đồng chính",
  khac: "Khác",
};

export const LEGAL_STATUSES = ["draft", "valid", "expired", "superseded"] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];
export const LEGAL_STATUS_LABEL: Record<LegalStatus, string> = {
  draft: "Nháp",
  valid: "Còn hiệu lực",
  expired: "Hết hạn",
  superseded: "Đã thay thế",
};

// Ngưỡng cảnh báo sắp hết hạn (ngày) — hằng số, giống pattern EXPIRY_WARN_DAYS của HĐ.
export const LEGAL_EXPIRY_WARN_DAYS = 30;

export const MOBILIZATION_CATEGORIES = [
  "mat_bang",
  "khao_sat",
  "trac_dac",
  "huy_dong",
  "khac",
] as const;
export type MobilizationCategory = (typeof MOBILIZATION_CATEGORIES)[number];
export const MOBILIZATION_CATEGORY_LABEL: Record<MobilizationCategory, string> = {
  mat_bang: "Bàn giao mặt bằng",
  khao_sat: "Khảo sát",
  trac_dac: "Trắc đạc & mốc chuẩn",
  huy_dong: "Huy động công trường",
  khac: "Khác",
};

export const MOBILIZATION_STATUSES = ["pending", "in_progress", "done"] as const;
export type MobilizationStatus = (typeof MOBILIZATION_STATUSES)[number];
export const MOBILIZATION_STATUS_LABEL: Record<MobilizationStatus, string> = {
  pending: "Chưa làm",
  in_progress: "Đang làm",
  done: "Hoàn thành",
};

export type LegalDocumentRow = {
  id: number;
  projectId: number | null;
  kind: LegalKind;
  code: string | null;
  title: string;
  issuedBy: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: LegalStatus;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// Danh sách hồ sơ pháp lý — projectId (M22): undefined = không lọc dự án (test cũ/nội bộ).
export async function listLegalDocuments(
  projectId?: number,
  filters?: { kind?: LegalKind },
): Promise<LegalDocumentRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("d.project_id = ?");
    args.push(projectId);
  }
  if (filters?.kind) {
    conds.push("d.kind = ?");
    args.push(filters.kind);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<LegalDocumentRow>(
    `SELECT d.id, d.project_id AS "projectId", d.kind, d.code, d.title,
            d.issued_by AS "issuedBy", d.issued_date AS "issuedDate", d.expiry_date AS "expiryDate",
            d.status, d.note,
            d.file_name AS "fileName", d.original_name AS "originalName",
            d.mime_type AS "mimeType", d.size_bytes AS "sizeBytes",
            d.created_by AS "createdBy", u.name AS "createdByName", d.created_at AS "createdAt"
       FROM legal_documents d LEFT JOIN users u ON u.id = d.created_by
      ${where}
      ORDER BY d.kind, d.id DESC`,
    ...args,
  );
}

export type MobilizationRow = {
  id: number;
  projectId: number | null;
  category: MobilizationCategory;
  title: string;
  status: MobilizationStatus;
  dueDate: string | null;
  doneDate: string | null;
  assignee: number | null;
  assigneeName: string | null;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
};

// Danh sách checklist huy động — projectId undefined = không lọc (test cũ/nội bộ).
export async function listMobilization(projectId?: number): Promise<MobilizationRow[]> {
  const where = projectId != null ? "WHERE m.project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  return query<MobilizationRow>(
    `SELECT m.id, m.project_id AS "projectId", m.category, m.title, m.status,
            m.due_date AS "dueDate", m.done_date AS "doneDate",
            m.assignee, u.name AS "assigneeName", m.note,
            m.created_by AS "createdBy", m.created_at AS "createdAt"
       FROM mobilization_items m LEFT JOIN users u ON u.id = m.assignee
      ${where}
      ORDER BY m.category, m.id`,
    ...args,
  );
}

export type ExpiringLegalDoc = {
  id: number;
  code: string | null;
  title: string;
  expiryDate: string;
  expired: boolean; // true = đã quá hạn (expiry_date < hôm nay)
};

// Hồ sơ pháp lý đang 'valid' có expiry_date trong vòng `days` ngày tới (gồm cả đã quá
// hạn mà chưa đổi trạng thái) — so sánh chuỗi ngày (quy ước lớp DB: DATE giữ nguyên
// string). projectId undefined = không lọc dự án.
export async function expiringLegalDocs(
  days = LEGAL_EXPIRY_WARN_DAYS,
  projectId?: number,
): Promise<ExpiringLegalDoc[]> {
  const limit = daysFromTodayISO(days);
  const today = todayISO();
  const conds = ["status = 'valid'", "expiry_date IS NOT NULL", "expiry_date <= ?"];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ id: number; code: string | null; title: string; expiryDate: string }>(
    `SELECT id, code, title, expiry_date AS "expiryDate"
       FROM legal_documents
      WHERE ${conds.join(" AND ")}
      ORDER BY expiry_date`,
    ...args,
  );
  return rows.map((r) => ({ ...r, expired: r.expiryDate < today }));
}

export type LegalInput = {
  kind: LegalKind;
  code: string | null;
  title: string;
  issuedBy: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: LegalStatus;
  note: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
export function validateLegalInput(input: LegalInput): string | null {
  if (!input.title.trim()) return "Thiếu tên hồ sơ";
  if (!LEGAL_KINDS.includes(input.kind)) return "Loại hồ sơ không hợp lệ";
  if (!LEGAL_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  for (const [label, d] of [
    ["Ngày cấp", input.issuedDate],
    ["Ngày hết hạn", input.expiryDate],
  ] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  if (input.issuedDate && input.expiryDate && input.issuedDate > input.expiryDate)
    return "Ngày cấp phải trước hoặc bằng ngày hết hạn";
  return null;
}

// Đọc body JSON thành LegalInput (POST dùng nguyên, PATCH merge với bản ghi cũ).
export function parseLegalBody(body: Record<string, unknown>): LegalInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    kind: str(body.kind) as LegalKind,
    code: strOrNull(body.code),
    title: str(body.title),
    issuedBy: strOrNull(body.issuedBy),
    issuedDate: strOrNull(body.issuedDate),
    expiryDate: strOrNull(body.expiryDate),
    status: (str(body.status) || "valid") as LegalStatus,
    note: strOrNull(body.note),
  };
}

export type MobilizationInput = {
  category: MobilizationCategory;
  title: string;
  status: MobilizationStatus;
  dueDate: string | null;
  assignee: number | null;
  note: string | null;
};

export function validateMobilizationInput(input: MobilizationInput): string | null {
  if (!input.title.trim()) return "Thiếu tên hạng mục";
  if (!MOBILIZATION_CATEGORIES.includes(input.category)) return "Nhóm không hợp lệ";
  if (!MOBILIZATION_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.dueDate != null && !DATE_RE.test(input.dueDate))
    return "Hạn hoàn thành không đúng định dạng YYYY-MM-DD";
  return null;
}

export function parseMobilizationBody(body: Record<string, unknown>): MobilizationInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    category: str(body.category) as MobilizationCategory,
    title: str(body.title),
    status: (str(body.status) || "pending") as MobilizationStatus,
    dueDate: strOrNull(body.dueDate),
    assignee: body.assignee != null ? Number(body.assignee) : null,
    note: strOrNull(body.note),
  };
}

export type KickoffReadiness = { total: number; done: number; percent: number };

// % hoàn thành checklist huy động (số 'done' / tổng) — KPI hub trang /kickoff.
// projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function kickoffReadiness(projectId?: number): Promise<KickoffReadiness> {
  const where = projectId != null ? "WHERE project_id = ?" : "";
  const args = projectId != null ? [projectId] : [];
  const row = await queryOne<{ total: number; done: number }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'done') AS done
       FROM mobilization_items ${where}`,
    ...args,
  );
  const total = Number(row?.total ?? 0);
  const done = Number(row?.done ?? 0);
  return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}
