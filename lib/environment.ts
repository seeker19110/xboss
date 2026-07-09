// M25 — Môi trường & Giấy phép: hồ sơ môi trường (ĐTM, giấy phép MT, giấy phép xả thải),
// quan trắc môi trường theo kỳ (ngưỡng, đạt/không), quản lý chất thải. Xem
// docs/nang-cap/M25-moi-truong-giay-phep.md.
import { query } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const ENV_PERMIT_KINDS = ["dtm", "giay_phep_mt", "giay_phep_xa_thai", "khac"] as const;
export type EnvPermitKind = (typeof ENV_PERMIT_KINDS)[number];
export const ENV_PERMIT_KIND_LABEL: Record<EnvPermitKind, string> = {
  dtm: "ĐTM (Đánh giá tác động môi trường)",
  giay_phep_mt: "Giấy phép môi trường",
  giay_phep_xa_thai: "Giấy phép xả thải",
  khac: "Khác",
};

export const ENV_PERMIT_STATUSES = ["valid", "expired", "superseded"] as const;
export type EnvPermitStatus = (typeof ENV_PERMIT_STATUSES)[number];
export const ENV_PERMIT_STATUS_LABEL: Record<EnvPermitStatus, string> = {
  valid: "Còn hiệu lực",
  expired: "Hết hạn",
  superseded: "Đã thay thế",
};

// Ngưỡng cảnh báo sắp hết hạn (ngày) — đồng bộ pattern LEGAL_EXPIRY_WARN_DAYS (M23).
export const ENV_PERMIT_EXPIRY_WARN_DAYS = 30;

export const ENV_MONITORING_CATEGORIES = ["nuoc_thai", "khi_bui", "on_rung", "khac"] as const;
export type EnvMonitoringCategory = (typeof ENV_MONITORING_CATEGORIES)[number];
export const ENV_MONITORING_CATEGORY_LABEL: Record<EnvMonitoringCategory, string> = {
  nuoc_thai: "Nước thải",
  khi_bui: "Khí thải / Bụi",
  on_rung: "Tiếng ồn / Rung",
  khac: "Khác",
};

export const WASTE_TYPES = ["ran_xd", "nguy_hai", "nuoc_thai", "khac"] as const;
export type WasteType = (typeof WASTE_TYPES)[number];
export const WASTE_TYPE_LABEL: Record<WasteType, string> = {
  ran_xd: "Rắn xây dựng",
  nguy_hai: "Nguy hại",
  nuoc_thai: "Nước thải",
  khac: "Khác",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ===== Giấy phép môi trường =====

export type EnvPermitRow = {
  id: number;
  projectId: number | null;
  kind: EnvPermitKind;
  code: string | null;
  title: string;
  issuedBy: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: EnvPermitStatus;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listPermits(
  projectId?: number,
  filters?: { kind?: EnvPermitKind },
): Promise<EnvPermitRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("p.project_id = ?");
    args.push(projectId);
  }
  if (filters?.kind) {
    conds.push("p.kind = ?");
    args.push(filters.kind);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<EnvPermitRow>(
    `SELECT p.id, p.project_id AS "projectId", p.kind, p.code, p.title,
            p.issued_by AS "issuedBy", p.issued_date AS "issuedDate", p.expiry_date AS "expiryDate",
            p.status,
            p.file_name AS "fileName", p.original_name AS "originalName",
            p.mime_type AS "mimeType", p.size_bytes AS "sizeBytes",
            p.created_by AS "createdBy", u.name AS "createdByName", p.created_at AS "createdAt"
       FROM env_permits p LEFT JOIN users u ON u.id = p.created_by
      ${where}
      ORDER BY p.kind, p.id DESC`,
    ...args,
  );
}

export type ExpiringEnvPermit = {
  id: number;
  code: string | null;
  title: string;
  expiryDate: string;
  expired: boolean; // true = đã quá hạn (expiry_date < hôm nay)
};

// Giấy phép MT đang 'valid' có expiry_date trong vòng `days` ngày tới (gồm cả đã quá
// hạn mà chưa đổi trạng thái) — so sánh chuỗi ngày. projectId undefined = không lọc dự án.
export async function expiringEnvPermits(
  projectId?: number,
  days = ENV_PERMIT_EXPIRY_WARN_DAYS,
): Promise<ExpiringEnvPermit[]> {
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
       FROM env_permits
      WHERE ${conds.join(" AND ")}
      ORDER BY expiry_date`,
    ...args,
  );
  return rows.map((r) => ({ ...r, expired: r.expiryDate < today }));
}

export type EnvPermitInput = {
  kind: EnvPermitKind;
  code: string | null;
  title: string;
  issuedBy: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: EnvPermitStatus;
};

export function validateEnvPermitInput(input: EnvPermitInput): string | null {
  if (!input.title.trim()) return "Thiếu tên hồ sơ";
  if (!ENV_PERMIT_KINDS.includes(input.kind)) return "Loại hồ sơ không hợp lệ";
  if (!ENV_PERMIT_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
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

export function parseEnvPermitBody(body: Record<string, unknown>): EnvPermitInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    kind: str(body.kind) as EnvPermitKind,
    code: strOrNull(body.code),
    title: str(body.title),
    issuedBy: strOrNull(body.issuedBy),
    issuedDate: strOrNull(body.issuedDate),
    expiryDate: strOrNull(body.expiryDate),
    status: (str(body.status) || "valid") as EnvPermitStatus,
  };
}

// ===== Quan trắc môi trường =====

export type EnvMonitoringRow = {
  id: number;
  projectId: number | null;
  measuredAt: string;
  category: EnvMonitoringCategory;
  indicator: string;
  value: number | null;
  unit: string | null;
  threshold: number | null;
  passed: boolean | null;
  location: string | null;
  note: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

// projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listMonitoring(
  projectId?: number,
  filters?: { category?: EnvMonitoringCategory },
): Promise<EnvMonitoringRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("m.project_id = ?");
    args.push(projectId);
  }
  if (filters?.category) {
    conds.push("m.category = ?");
    args.push(filters.category);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<EnvMonitoringRow>(
    `SELECT m.id, m.project_id AS "projectId", m.measured_at AS "measuredAt", m.category,
            m.indicator, m.value, m.unit, m.threshold, m.passed, m.location, m.note,
            m.recorded_by AS "recordedBy", u.name AS "recordedByName", m.created_at AS "createdAt"
       FROM env_monitoring m LEFT JOIN users u ON u.id = m.recorded_by
      ${where}
      ORDER BY m.measured_at DESC, m.id DESC`,
    ...args,
  );
}

export type ExceededMonitoring = {
  id: number;
  measuredAt: string;
  category: EnvMonitoringCategory;
  indicator: string;
  value: number | null;
  unit: string | null;
  threshold: number | null;
  location: string | null;
};

// Kỳ quan trắc passed=FALSE gần nhất mỗi tổ hợp (category, indicator, location) —
// DISTINCT ON theo Postgres, sắp measured_at DESC, id DESC để lấy bản ghi mới nhất mỗi tổ
// hợp TRƯỚC, rồi mới lọc passed=FALSE ở ngoài — nếu lọc passed=FALSE trước khi lấy DISTINCT
// ON thì một kỳ mới đạt (passed=TRUE) sẽ không "che" được kỳ cũ vượt ngưỡng, gây báo sai.
// projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function exceededMonitoring(projectId?: number): Promise<ExceededMonitoring[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<ExceededMonitoring>(
    `SELECT id, "measuredAt", category, indicator, value, unit, threshold, location FROM (
       SELECT DISTINCT ON (category, indicator, COALESCE(location, ''))
              id, measured_at AS "measuredAt", category, indicator, value, unit, threshold,
              location, passed
         FROM env_monitoring
        ${where}
        ORDER BY category, indicator, COALESCE(location, ''), measured_at DESC, id DESC
     ) latest
     WHERE passed = FALSE`,
    ...args,
  );
}

export type EnvMonitoringInput = {
  measuredAt: string;
  category: EnvMonitoringCategory;
  indicator: string;
  value: number | null;
  unit: string | null;
  threshold: number | null;
  location: string | null;
  note: string | null;
};

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
// passed tính lúc ghi (snapshot, không phải cột generated trong DB): value <= threshold
// khi có cả hai; thiếu 1 trong 2 → null (không đánh giá được).
export function validateMonitoringInput(input: EnvMonitoringInput): {
  error: string | null;
  passed: boolean | null;
} {
  if (!DATE_RE.test(input.measuredAt))
    return { error: "Ngày quan trắc không đúng định dạng YYYY-MM-DD", passed: null };
  if (!ENV_MONITORING_CATEGORIES.includes(input.category))
    return { error: "Nhóm quan trắc không hợp lệ", passed: null };
  if (!input.indicator.trim()) return { error: "Thiếu chỉ tiêu quan trắc", passed: null };

  const passed =
    input.value != null && input.threshold != null ? input.value <= input.threshold : null;
  return { error: null, passed };
}

export function parseEnvMonitoringBody(body: Record<string, unknown>): EnvMonitoringInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    measuredAt: str(body.measuredAt),
    category: str(body.category) as EnvMonitoringCategory,
    indicator: str(body.indicator),
    value: numOrNull(body.value),
    unit: strOrNull(body.unit),
    threshold: numOrNull(body.threshold),
    location: strOrNull(body.location),
    note: strOrNull(body.note),
  };
}

// ===== Chất thải =====

export type WasteLogRow = {
  id: number;
  projectId: number | null;
  logDate: string;
  wasteType: WasteType;
  quantity: number | null;
  unit: string | null;
  disposalMethod: string | null;
  handler: string | null;
  note: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

// projectId undefined = không lọc dự án (test cũ/nội bộ).
export async function listWaste(
  projectId?: number,
  filters?: { wasteType?: WasteType },
): Promise<WasteLogRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("w.project_id = ?");
    args.push(projectId);
  }
  if (filters?.wasteType) {
    conds.push("w.waste_type = ?");
    args.push(filters.wasteType);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<WasteLogRow>(
    `SELECT w.id, w.project_id AS "projectId", w.log_date AS "logDate", w.waste_type AS "wasteType",
            w.quantity, w.unit, w.disposal_method AS "disposalMethod", w.handler, w.note,
            w.recorded_by AS "recordedBy", u.name AS "recordedByName", w.created_at AS "createdAt"
       FROM waste_logs w LEFT JOIN users u ON u.id = w.recorded_by
      ${where}
      ORDER BY w.log_date DESC, w.id DESC`,
    ...args,
  );
}

export type WasteLogInput = {
  logDate: string;
  wasteType: WasteType;
  quantity: number | null;
  unit: string | null;
  disposalMethod: string | null;
  handler: string | null;
  note: string | null;
};

export function validateWasteInput(input: WasteLogInput): string | null {
  if (!DATE_RE.test(input.logDate)) return "Ngày ghi nhận không đúng định dạng YYYY-MM-DD";
  if (!WASTE_TYPES.includes(input.wasteType)) return "Loại chất thải không hợp lệ";
  if (input.quantity != null && input.quantity < 0) return "Khối lượng không được âm";
  return null;
}

export function parseWasteBody(body: Record<string, unknown>): WasteLogInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    logDate: str(body.logDate),
    wasteType: str(body.wasteType) as WasteType,
    quantity: numOrNull(body.quantity),
    unit: strOrNull(body.unit),
    disposalMethod: strOrNull(body.disposalMethod),
    handler: strOrNull(body.handler),
    note: strOrNull(body.note),
  };
}
